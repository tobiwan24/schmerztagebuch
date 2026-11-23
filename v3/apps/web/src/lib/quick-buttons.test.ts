import { describe, expect, it } from 'vitest';
import { mergeQuickIds, quickButtons } from './quick-buttons';

const d = (id: string, name: string, quick?: string[]) => ({ id, name, settings: quick ? { quickTemplateIds: quick } : {} });
const t = (id: string, diaryId: string, name: string, extra: object = {}) => ({ id, diaryId, name, ...extra });

describe('quickButtons', () => {
  it('RDM-028 P2: ohne Auswahl bleibt der einzelne Knopf „Schnell eintragen“', () => {
    expect(quickButtons([d('d1', 'Mein')], [t('a', 'd1', 'Fuß')])).toEqual([{ to: '/quick', label: 'Schnell eintragen' }]);
  });
  it('RDM-028 P2: je gewählter Vorlage ein Knopf in Vorlagen-Reihenfolge', () => {
    expect(quickButtons([d('d1', 'Mein', ['b', 'a'])], [t('a', 'd1', 'Fuß'), t('b', 'd1', 'Kopf')])).toEqual([
      { to: '/quick?template=a', label: 'Schnell: Fuß' },
      { to: '/quick?template=b', label: 'Schnell: Kopf' },
    ]);
  });
  it('RDM-028 P2: archivierte, fehlende und Übungs-Vorlagen werden übersprungen; dann Rückfall auf den Tagebuch-Knopf', () => {
    const list = [t('a', 'd1', 'Fuß', { archived: true }), t('c', 'd1', 'Übung', { purpose: 'training' })];
    expect(quickButtons([d('d1', 'Mein', ['a', 'c', 'x'])], list)).toEqual([{ to: '/quick', label: 'Schnell eintragen' }]);
  });
  it('RDM-028 P2: bei mehreren Tagebüchern mit Tagebuch-Name und &diary=', () => {
    expect(quickButtons([d('d1', 'Mein', ['a']), d('d2', 'Katze')], [t('a', 'd1', 'Fuß')])).toEqual([
      { to: '/quick?template=a&diary=d1', label: 'Schnell: Fuß · Mein' },
      { to: '/quick?diary=d2', label: 'Schnell eintragen · Katze' },
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
