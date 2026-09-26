import { describe, it, expect } from 'vitest';
import { getConvexHull, getHullPath, createRoundedPath } from './geometry';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('getConvexHull', () => {
    it('drops interior and collinear points', () => {
        const hull = getConvexHull([...square, { x: 5, y: 5 }, { x: 5, y: 0 }, { x: 2, y: 8 }]);
        expect(hull).toHaveLength(4);
        expect(hull).toEqual(expect.arrayContaining(square));
    });

    it('handles tiny inputs', () => {
        expect(getConvexHull([])).toEqual([]);
        expect(getConvexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    });
});

describe('getHullPath', () => {
    it('builds a closed path, or nothing for fewer than 3 points', () => {
        expect(getHullPath(square)).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
        expect(getHullPath(square.slice(0, 2))).toBe('');
    });
});

describe('createRoundedPath', () => {
    it('produces a closed path with one curve per corner', () => {
        const d = createRoundedPath(square, 2);
        expect(d.endsWith('Z')).toBe(true);
        expect(d.match(/Q/g)).toHaveLength(4);
    });

    it('clamps the radius to half the shortest edge', () => {
        const d = createRoundedPath(square, 100);
        expect(d.startsWith('M 0,5')).toBe(true);
    });

    it('never emits NaN, even with repeated points', () => {
        const d = createRoundedPath([square[0], square[0], square[1], square[2]], 2);
        expect(d).not.toContain('NaN');
    });
});
