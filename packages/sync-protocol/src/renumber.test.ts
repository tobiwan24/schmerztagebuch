import { describe, expect, it } from 'vitest';
import { planVersionRenumber } from './renumber.js';

describe('planVersionRenumber', () => {
  it('SYN-17: kollidierende Version n erhält max(bekannte Versionen)+1; nur Einträge mit Version n und ausstehender Op werden umgeschrieben', () => {
    const plan = planVersionRenumber({
      collidedVersion: 2, localVersions: [1, 2], localCurrentVersion: 2,
      entries: [
        { id: 'e-pending-v2', templateVersion: 2, pending: true },
        { id: 'e-synced-v2', templateVersion: 2, pending: false },
        { id: 'e-pending-v1', templateVersion: 1, pending: true },
      ],
    });
    expect(plan).toEqual({ newVersion: 3, entryIds: ['e-pending-v2'], currentVersion: 3 });
  });

  it('SYN-17: Server-currentVersion und höhere lokale Versionen werden berücksichtigt; currentVersion bleibt, wenn die lokale Version nicht die aktuelle war', () => {
    const plan = planVersionRenumber({
      collidedVersion: 2, localVersions: [1, 2, 4], localCurrentVersion: 4, serverCurrentVersion: 5,
      entries: [],
    });
    expect(plan).toEqual({ newVersion: 6, entryIds: [], currentVersion: 4 });
  });
});
