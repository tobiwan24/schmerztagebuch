// Anwendung des Umnummerierungsplans (Spec 04 „Kollidierende Vorlagenversion", A-016, A-039): Die Version des Servers
// wird als n übernommen, die lokale Version unter der nächsten freien Nummer neu angelegt, ausstehende Einträge dieser
// Version und die Vorlage werden nachgezogen. Kodierung außerhalb der Transaktion, Schreiben in **einer** Dexie-Transaktion.
import type { HlcClock } from "@stb/core";
import { planVersionRenumber } from "@stb/sync-protocol";
import type { StbDb, OutboxOp, LocalRecord } from "../data/db.js";
import type { CodecRegistry } from "../data/codec/registry.js";

export interface RenumberDeps {
  db: StbDb;
  registry: CodecRegistry;
  writeCodec: string;
  hlc: HlcClock;
  clock: { now(): number };
}

/** Record-ID einer Vorlagenversion (wie `templateVersionRecordId` im Diary-Repository). */
const versionRecordId = (templateId: string, version: number) =>
  `${templateId}.v${version}`;

interface VersionPayload {
  templateId: string;
  version: number;
}
type Obj = Record<string, unknown>;

/**
 * @returns `true`, wenn angewendet; `false`, wenn sich lokal währenddessen etwas geändert hat (nächste Runde versucht es neu).
 */
export async function renumberCollidedVersion(
  deps: RenumberDeps,
  op: OutboxOp,
  rec: LocalRecord,
  localPayload: VersionPayload & Obj,
  server: { payload: unknown; rev: number; deleted: boolean },
): Promise<boolean> {
  const { db, registry } = deps;
  const codec = registry.get(deps.writeCodec);
  const { templateId, version: n } = localPayload;
  const ctx = (r: Pick<LocalRecord, "diaryId" | "kind" | "id">) => ({
    diaryId: r.diaryId,
    kind: r.kind,
    recordId: r.id,
  });
  const decode = (r: LocalRecord) =>
    registry.get(r.codec).decode(r.payload, ctx(r));

  // Lesen
  const versionRecs = (
    await db.records
      .where("[diaryId+kind]")
      .equals([rec.diaryId, "templateVersion"])
      .toArray()
  ).filter((r) => r.deleted === 0);
  const localVersions: number[] = [];
  for (const r of versionRecs) {
    const p = (await decode(r)) as VersionPayload;
    if (p.templateId === templateId) localVersions.push(p.version);
  }
  const templateRec = await db.records.get(templateId);
  const templatePayload =
    templateRec && templateRec.deleted === 0
      ? ((await decode(templateRec)) as Obj)
      : undefined;
  const pendingOps = (await db.outbox.toArray()).filter(
    (o) => o.diaryId === rec.diaryId && o.kind === "entry",
  );
  const entries: {
    id: string;
    templateVersion: number;
    pending: boolean;
    rec: LocalRecord;
    payload: Obj;
  }[] = [];
  for (const o of pendingOps) {
    const r = await db.records.get(o.recordId);
    if (!r || r.deleted === 1) continue;
    const p = (await decode(r)) as Obj;
    if (p.templateId === templateId)
      entries.push({
        id: r.id,
        templateVersion: Number(p.templateVersion),
        pending: true,
        rec: r,
        payload: p,
      });
  }

  const plan = planVersionRenumber({
    collidedVersion: n,
    localVersions,
    localCurrentVersion: Number(templatePayload?.currentVersion ?? n),
    entries,
  });

  // Kodieren (außerhalb der Transaktion)
  const nowIso = new Date(deps.clock.now()).toISOString();
  const newRecId = versionRecordId(templateId, plan.newVersion);
  const newVersionRec = {
    id: newRecId,
    diaryId: rec.diaryId,
    kind: "templateVersion",
  };
  const [serverEnc, newVersionEnc] = await Promise.all([
    codec.encode(server.payload, ctx(rec)),
    codec.encode(
      { ...localPayload, version: plan.newVersion },
      ctx(newVersionRec),
    ),
  ]);
  const entryUpdates = await Promise.all(
    entries
      .filter((e) => plan.entryIds.includes(e.id))
      .map(async (e) => ({
        e,
        enc: await codec.encode(
          {
            ...e.payload,
            templateVersion: plan.newVersion,
            updatedAt: nowIso,
            hlc: deps.hlc.tick(),
          },
          ctx(e.rec),
        ),
      })),
  );
  const templateEnc =
    templateRec &&
    templatePayload &&
    plan.currentVersion !== Number(templatePayload.currentVersion)
      ? await codec.encode(
          {
            ...templatePayload,
            currentVersion: plan.currentVersion,
            updatedAt: nowIso,
          },
          ctx(templateRec),
        )
      : undefined;

  let applied = true;
  await db.transaction("rw", db.records, db.outbox, async () => {
    // Währenddessen lokal erneut geändert? Dann nichts überschreiben.
    const [nowRec, nowOp] = await Promise.all([
      db.records.get(rec.id),
      db.outbox.get(op.seq!),
    ]);
    if (
      !nowRec ||
      !nowOp ||
      nowRec.localUpdatedAt !== rec.localUpdatedAt ||
      nowOp.createdAt !== op.createdAt
    ) {
      applied = false;
      return;
    }
    // 1. Serverversion als n übernehmen.
    await db.records.update(rec.id, {
      payload: serverEnc,
      base: serverEnc,
      rev: server.rev,
      deleted: server.deleted ? 1 : 0,
      codec: codec.id,
      localUpdatedAt: deps.clock.now(),
    });
    await db.outbox.delete(op.seq!);
    // 2. Lokale Version unter neuer Nummer anlegen.
    await db.records.put({
      id: newRecId,
      diaryId: rec.diaryId,
      kind: "templateVersion",
      rev: 0,
      deleted: 0,
      codec: codec.id,
      payload: newVersionEnc,
      localUpdatedAt: deps.clock.now(),
    });
    await db.outbox.add({
      recordId: newRecId,
      diaryId: rec.diaryId,
      kind: "templateVersion",
      op: "upsert",
      baseRev: 0,
      createdAt: deps.clock.now(),
      attempts: 0,
    });
    // 3. Ausstehende Einträge dieser Version nachziehen (Op bleibt, neuer Zeitstempel).
    for (const { e, enc } of entryUpdates) {
      await db.records.update(e.id, {
        payload: enc,
        codec: codec.id,
        localUpdatedAt: deps.clock.now(),
      });
      const pending = await db.outbox.where("recordId").equals(e.id).first();
      if (pending?.seq !== undefined)
        await db.outbox.update(pending.seq, {
          createdAt: deps.clock.now(),
          attempts: 0,
        });
    }
    // 4. Vorlage: currentVersion zeigt auf die neue Nummer; Op sicherstellen.
    if (templateRec && templateEnc !== undefined) {
      await db.records.update(templateRec.id, {
        payload: templateEnc,
        codec: codec.id,
        localUpdatedAt: deps.clock.now(),
      });
      const pending = await db.outbox
        .where("recordId")
        .equals(templateRec.id)
        .first();
      if (pending?.seq !== undefined)
        await db.outbox.update(pending.seq, {
          createdAt: deps.clock.now(),
          attempts: 0,
        });
      else {
        const cur = await db.records.get(templateRec.id);
        await db.outbox.add({
          recordId: templateRec.id,
          diaryId: templateRec.diaryId,
          kind: "template",
          op: "upsert",
          baseRev: cur?.rev ?? 0,
          createdAt: deps.clock.now(),
          attempts: 0,
        });
      }
    }
  });
  return applied;
}
