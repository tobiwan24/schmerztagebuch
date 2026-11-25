import { describe, it, expect } from 'vitest';
import { sealForIntake, unsealIntake, sealManifest, openManifest } from './intake.js';
import { generateIdentityEcdhKeyPair, exportPublicKey } from './share.js';

const text = (s: string) => new TextEncoder().encode(s);

describe('Intake-Siegel', () => {
  it('Roundtrip: Siegel lässt sich nur mit dem Intake-Schlüsselpaar und für dasselbe Tagebuch öffnen', async () => {
    const intake = await generateIdentityEcdhKeyPair();
    const other = await generateIdentityEcdhKeyPair();
    const seal = await sealForIntake(await exportPublicKey(intake.publicKey), 'd1', text('{"marker":"STB-PLAINTEXT-MARKER-9"}'));
    expect(JSON.stringify(seal)).not.toContain('STB-PLAINTEXT-MARKER');
    expect(new TextDecoder().decode(await unsealIntake(seal, intake, 'd1'))).toContain('STB-PLAINTEXT-MARKER-9');
    await expect(unsealIntake(seal, other, 'd1')).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(unsealIntake(seal, intake, 'd2')).rejects.toMatchObject({ code: 'decrypt-failed' });
  });
});

describe('Manifest-Siegel', () => {
  it('VOI-19: das Token öffnet das Siegel; falsches Token, falsches Tagebuch oder Manipulation schlagen fehl', async () => {
    const seal = await sealManifest('token-a', 'd1', text('{"marker":"STB-MANIFEST-MARKER-3"}'));
    expect(JSON.stringify(seal)).not.toContain('STB-MANIFEST-MARKER');
    expect(new TextDecoder().decode(await openManifest('token-a', 'd1', seal))).toContain('STB-MANIFEST-MARKER-3');
    await expect(openManifest('token-b', 'd1', seal)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(openManifest('token-a', 'd2', seal)).rejects.toMatchObject({ code: 'decrypt-failed' });
    await expect(openManifest('token-a', 'd1', { ...seal, ct: seal.ct.slice(0, -2) + (seal.ct.endsWith('AA') ? 'BB' : 'AA') })).rejects.toMatchObject({ code: 'decrypt-failed' });
  });

  it('VOI-19: zwei Siegel desselben Inhalts unterscheiden sich (frische IV)', async () => {
    const a = await sealManifest('t', 'd1', text('x'));
    const b = await sealManifest('t', 'd1', text('x'));
    expect(a.iv).not.toBe(b.iv);
  });
});
