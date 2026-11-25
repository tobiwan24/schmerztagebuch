import { describe, it, expect } from 'vitest';
import { sealForIntake, unsealIntake } from './intake.js';
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
