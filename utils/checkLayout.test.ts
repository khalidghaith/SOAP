import { describe, it, expect } from 'vitest';
import { checkLayout } from '../.claude/skills/soap-space-planning/scripts/check_layout.mjs';

// The planning-rule checker on rooms as drawn: polygons (L-shapes) and rotation, not the x/y/width/height box

const PX = 20;
type P = { x: number; y: number };
const px = (pts: P[]) => pts.map(p => ({ x: p.x * PX, y: p.y * PX }));
const rect = (name: string, x: number, y: number, w: number, h: number, extra: object = {}) => ({
    id: name, name, zone: 'Private', area: w * h, isPlaced: true, floor: 0, x: x * PX, y: y * PX, width: w * PX, height: h * PX, ...extra,
});
/** A polygon room at (x, y); `stale` is the rectangle it was drawn from, which SOAP keeps as width/height. */
const poly = (name: string, x: number, y: number, pts: P[], area: number, stale = 10, extra: object = {}) =>
    rect(name, x, y, stale, stale, { area, polygon: px(pts), shape: 'polygon', ...extra });
const check = (rooms: object[]) => checkLayout({ rooms, floors: [{ id: 0 }] }) as { errors: string[]; warnings: string[] };

// An L: 8 × 4 across the top, 4 × 4 down the left (48 m²), leaving a 4 × 4 notch at (4, 4)
const L: P[] = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 }];

describe('check_layout with drawn shapes', () => {
    it('uses the drawn area, not the rectangle the room started as', () => {
        const { warnings } = check([poly('Reception', 0, 0, L, 71)]);
        expect(warnings).toContain('Reception: 48 m² vs program 71 m² (-32%) — state a reason');
    });

    it('does not report a room in the notch of an L as overlapping it', () => {
        const { errors } = check([poly('Living', 0, 0, L, 48), rect('Study', 4, 4, 4, 4)]);
        expect(errors.filter(e => e.includes('overlaps'))).toEqual([]);
    });

    it('finds overlaps outside the stale rectangle, with their area', () => {
        // Drawn from a 4 × 4 square, then stretched into the L: its arm covers the Study
        const { errors } = check([poly('Living', 0, 0, L, 48, 4), rect('Study', 6, 1, 2, 2)]);
        expect(errors).toContain('floor 0: Living overlaps Study (4 m²)');
    });

    it('finds partial overlaps where edges line up', () => {
        const { errors } = check([rect('A', 0, 0, 2, 2), poly('B', 1, 0, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], 4, 1)]);
        expect(errors).toContain('floor 0: A overlaps B (2 m²)');
    });

    it('counts doors onto an L-shaped hall', () => {
        // The Bedroom only touches the hall's lower arm, which its old 10 × 10 box would place elsewhere
        const hall = poly('Hallway', 0, 0, L, 48, 10, { zone: 'Circulation' });
        const { errors } = check([hall, rect('Bedroom', 4, 5, 4, 3), rect('Store', 4, 4, 4, 1)]);
        expect(errors.filter(e => e.includes('Bedroom'))).toEqual([]);
    });

    it('reports a room that only touches the notch corner of an L-shaped hall', () => {
        const hall = poly('Hallway', 0, 0, L, 48, 10, { zone: 'Circulation' });
        const { errors } = check([hall, rect('Study', 8, 4, 3, 3)]);
        expect(errors).toContain('floor 0: Study does not open onto any circulation space');
    });

    it('checks rotated rooms where they are drawn', () => {
        // 4 × 2 turned 90° about its centre (2, 1): now x 1–3, y -1–3, clear of a room at x 3+
        const turned = rect('Turned', 0, 0, 4, 2, { rotation: 90 });
        expect(check([turned, rect('Next', 3, 0, 2, 2)]).errors.filter(e => e.includes('overlaps'))).toEqual([]);
        expect(check([turned, rect('Next', 2, 0, 2, 2)]).errors).toContain('floor 0: Turned overlaps Next (2 m²)');
    });

    it('checks every corner of a polygon against the grid', () => {
        const off = L.map(p => (p.x === 4 ? { ...p, x: 4.25 } : p));
        expect(check([poly('Odd', 0, 0, off, 49)]).errors).toContain('Odd: not on the 0.5 m grid (corner at 4.25, 4)');
        expect(check([poly('Even', 0, 0, L, 48)]).errors.filter(e => e.includes('grid'))).toEqual([]);
    });

    it('says when an L-shaped corridor could not be checked for dead ends', () => {
        const corridor = poly('Corridor', 0, 0, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1.5 }, { x: 1.5, y: 1.5 }, { x: 1.5, y: 4 }, { x: 0, y: 4 }], 18.75, 10, { zone: 'Circulation' });
        expect(check([corridor]).warnings).toContain("Corridor: not a plain rectangle, so its ends weren't checked for dead ends (bounding box 10 × 4 m)");
    });
});
