import { describe, expect, it } from 'vitest';
import { mergeQuickIds, quickButtons } from './quick-buttons';

const d = (id: string, name: string, quick?: string[]) => ({ id, name, settings: quick ? { quickTemplateIds: quick } : {} });
const t = (id: string, diaryId: string, name: string, extra: object = {}) => ({ id, diaryId, name, ...extra });

describe('quickButtons', () => {
  it('RDM-028 P2: ohne Auswahl bleibt der einzelne Knopf „Schnell eintragen“', () => {
    expect(quickButtons(d('d1', 'Mein'), [t('a', 'd1', 'Fuß')])).toEqual([{ to: '/quick?diary=d1', label: 'Schnell eintragen' }]);
  });
  it('RDM-028 P2: je gewählter Vorlage ein Knopf in Vorlagen-Reihenfolge', () => {
    expect(quickButtons(d('d1', 'Mein', ['b', 'a']), [t('a', 'd1', 'Fuß'), t('b', 'd1', 'Kopf')])).toEqual([
      { to: '/quick?diary=d1&template=a', label: 'Schnell: Fuß' },
      { to: '/quick?diary=d1&template=b', label: 'Schnell: Kopf' },
    ]);
  });
  it('RDM-028 P2: archivierte, fehlende und Übungs-Vorlagen werden übersprungen; dann Rückfall auf den Tagebuch-Knopf', () => {
    const list = [t('a', 'd1', 'Fuß', { archived: true }), t('c', 'd1', 'Übung', { purpose: 'training' })];
    expect(quickButtons(d('d1', 'Mein', ['a', 'c', 'x']), list)).toEqual([{ to: '/quick?diary=d1', label: 'Schnell eintragen' }]);
  });
  it('BLK-58: nur Vorlagen des gewählten Tagebuchs, Label ohne Tagebuch-Namen', () => {
    expect(quickButtons(d('d1', 'Mein', ['a', 'b']), [t('a', 'd1', 'Fuß'), t('b', 'd2', 'Kopf')])).toEqual([
      { to: '/quick?diary=d1&template=a', label: 'Schnell: Fuß' },
    ]);
  });
});

describe('mergeQuickIds', () => {
  it('RDM-028 P2: angezeigte Auswahl in Listenreihenfolge, nicht angezeigte (archiviert/unbekannt) bleiben erhalten', () => {
    const shown = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(mergeQuickIds(shown, new Set(['c', 'a']), ['x', 'b', 'arch'])).toEqual(['a', 'c', 'x', 'arch']);
    expect(mergeQuickIds(shown, new Set(), ['arch'])).toEqual(['arch']);
    expect(mergeQuickIds(shown, new Set(['b']))).toEqual(['b']);
  });
});
