// Mitgliederlisten je Tagebuch, lokal gemerkt (für „Erfasst von" und die Mitglieder-Ansicht auch offline, Spec 09).
import type { Member } from '@/sharing/api';
import type { StbDb } from './db';

const key = (diaryId: string) => `members:${diaryId}`;

export async function saveMembers(db: StbDb, diaryId: string, members: Member[]): Promise<void> {
  await db.keys.put({ id: key(diaryId), value: { diaryId, members } });
}

export async function loadMembers(db: StbDb, diaryId: string): Promise<Member[]> {
  return ((await db.keys.get(key(diaryId)))?.value as { members?: Member[] } | undefined)?.members ?? [];
}
