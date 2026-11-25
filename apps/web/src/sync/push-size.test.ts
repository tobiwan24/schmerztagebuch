import { describe, expect, it } from 'vitest';
import { sizeGroups } from './engine';

describe('Push nach Größe teilen', () => {
  it('bildet aufeinanderfolgende Gruppen unter der Grenze; zu große Ops stehen allein', () => {
    const op = (n: number) => ({ c: 'x'.repeat(n) });
    // JSON-Länge je Op = n + 8
    const ops = [op(92), op(92), op(92), op(492), op(2), op(2)];
    expect(sizeGroups(ops, 250)).toEqual([[0, 2], [2, 3], [3, 4], [4, 6]]);
    expect(sizeGroups([], 250)).toEqual([]);
    expect(sizeGroups([op(10)], 1)).toEqual([[0, 1]]);
  });
});
