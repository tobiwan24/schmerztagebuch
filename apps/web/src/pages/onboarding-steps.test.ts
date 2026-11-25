import { describe, expect, it } from 'vitest';
import { enterSetup, type Step } from './onboarding-steps';

describe('Onboarding-Übergang in die Einrichtung', () => {
  it('aus den Konto-Schritten geht es zum Tagebuch', () => {
    for (const s of ['backup', 'cloud-login', 'factor'] as Step[]) expect(enterSetup(s)).toBe('diary');
  });
  it('ein bereits weitergeschalteter Einrichtungsschritt bleibt erhalten (kein Rücksprung)', () => {
    for (const s of ['diary', 'location', 'template'] as Step[]) expect(enterSetup(s)).toBe(s);
  });
});
