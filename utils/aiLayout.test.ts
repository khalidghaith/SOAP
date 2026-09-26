import { describe, it, expect } from 'vitest';
import { validateAiLayout, analysisToRooms, LayoutRect } from './aiLayout';

const rect = (id: string, x: number, y: number, width: number, height: number, floor = 0): LayoutRect =>
    ({ id, name: id, x, y, width, height, floor });

const overlapping = (rs: LayoutRect[]) =>
    rs.some((a, i) => rs.some((b, j) => i < j && a.floor === b.floor &&
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));

describe('validateAiLayout', () => {
    it('passes a clean layout through unchanged', () => {
        const raw = [rect('a', 0, 0, 4, 5), rect('b', 4, 0, 4, 5)];
        const req = [{ id: 'a', name: 'a', area: 20 }, { id: 'b', name: 'b', area: 20 }];
        const { placements, issues } = validateAiLayout(raw, req, [], [0], 0.5);
        expect(placements).toEqual(raw);
        expect(issues).toEqual([]);
    });

    it('snaps to the grid and drops unknown or duplicate ids', () => {
        const raw = [rect('a', 0.26, 0.74, 4.1, 5), rect('a', 9, 9, 1, 1), rect('ghost', 0, 0, 1, 1)];
        const { placements } = validateAiLayout(raw, [{ id: 'a', name: 'a', area: 20 }], [], [0], 0.5);
        expect(placements).toEqual([rect('a', 0.5, 0.5, 4, 5)]);
    });

    it('reports missing spaces', () => {
        const { issues } = validateAiLayout([], [{ id: 'a', name: 'Kitchen', area: 10 }], [], [0], 0.5);
        expect(issues.join()).toContain('Kitchen');
    });

    it('moves spaces off non-existent floors', () => {
        const { placements } = validateAiLayout([rect('a', 0, 0, 2, 2, 7)], [{ id: 'a', name: 'a', area: 4 }], [], [0, 1, 2], 0.5);
        expect(placements[0].floor).toBe(2);
    });

    it('resolves overlaps with locked spaces and with each other', () => {
        const fixed = [rect('locked', 0, 0, 5, 5)];
        const raw = [rect('a', 1, 1, 3, 3), rect('b', 2, 2, 3, 3)];
        const req = [{ id: 'a', name: 'a', area: 9 }, { id: 'b', name: 'b', area: 9 }];
        const { placements, issues } = validateAiLayout(raw, req, fixed, [0], 0.5);
        expect(overlapping([...fixed, ...placements])).toBe(false);
        expect(issues.filter(i => i.includes('overlapped'))).toHaveLength(2);
    });

    it('stacks same-named vertical connections at one position', () => {
        const raw = [
            { ...rect('s0', 10, 5, 2, 4, 0), name: 'Stair' },
            { ...rect('s1', 12, 6, 2, 4, 1), name: 'Stair' },
        ];
        const req = [
            { id: 's0', name: 'Stair', area: 8, spaceType: 'verticalConnection' },
            { id: 's1', name: 'Stair', area: 8, spaceType: 'verticalConnection' },
        ];
        const { placements } = validateAiLayout(raw, req, [], [0, 1], 0.5);
        expect(placements[1]).toMatchObject({ x: 10, y: 5, floor: 1 });
    });

    it('flags areas far from the program', () => {
        const { issues } = validateAiLayout([rect('a', 0, 0, 2, 2)], [{ id: 'a', name: 'Hall', area: 40 }], [], [0], 0.5);
        expect(issues.join()).toContain('40.0 m²');
    });
});

describe('analysisToRooms', () => {
    it('keeps AI hints and discards invalid entries', () => {
        const rooms = analysisToRooms({
            projectName: 'x',
            spaces: [
                { name: 'Bedroom', area: 16, zone: 'Private', daylightReq: 'perimeter', aspectRatioHint: 'regular' },
                { name: 'Lift', area: 4, zone: 'Service', spaceType: 'verticalConnection', vcType: 'elevator' },
                { name: 'Bad', area: -3, zone: 'X' },
                { name: 'Weird', area: 5, zone: 'X', spaceType: 'spaceship' as any },
            ],
        }, 20);
        expect(rooms).toHaveLength(3);
        expect(rooms[0]).toMatchObject({ daylightReq: 'perimeter', aspectRatioHint: 'regular', width: 80 });
        expect(rooms[1]).toMatchObject({ spaceType: 'verticalConnection', vcType: 'elevator' });
        expect(rooms[2].spaceType).toBe('standard');
    });
});
