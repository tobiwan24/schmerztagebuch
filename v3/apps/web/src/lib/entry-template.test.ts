import { describe, expect, it } from 'vitest';
import { isEntryTemplate } from './entry-template';

describe('isEntryTemplate', () => {
  it('RDM-028 P2: aktive Vorlagen ja, archivierte und Übungen nein', () => {
    expect(isEntryTemplate({})).toBe(true);
    expect(isEntryTemplate({ purpose: 'diary' })).toBe(true);
    expect(isEntryTemplate({ archived: true })).toBe(false);
    expect(isEntryTemplate({ purpose: 'training' })).toBe(false);
  });
});
