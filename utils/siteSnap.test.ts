import { describe, it, expect } from 'vitest';
import { snapPoint, guideToLine, pointAtDistance, SnapContext } from './siteSnap';

const ctx = (over: Partial<SnapContext> = {}): SnapContext => ({
    tolerance: 0.5, vertices: [], segments: [], guides: [], grid: 0, ...over,
});
const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const edges = square.map((p, i) => [p, square[(i + 1) % 4]] as [typeof p, typeof p]);

describe('snapPoint', () => {
    it('prefers corners, then midpoints, then the nearest point on an edge', () => {
        const c = ctx({ vertices: square, segments: edges });
        expect(snapPoint({ x: 10.3, y: 0.2 }, c)).toMatchObject({ point: { x: 10, y: 0 }, kind: 'endpoint' });
        expect(snapPoint({ x: 5.2, y: -0.3 }, c)).toMatchObject({ point: { x: 5, y: 0 }, kind: 'midpoint' });
        expect(snapPoint({ x: 7.3, y: 0.3 }, c).point).toEqual({ x: 7.3, y: 0 });
        expect(snapPoint({ x: 3, y: 3.4 }, ctx({ segments: [[{ x: 0, y: 0 }, { x: 10, y: 10 }]] })).kind).toBe('edge');
    });

    it('tracks 0/45/90° from the last point and shows the tracker', () => {
        const r = snapPoint({ x: 8, y: 0.3 }, ctx({ base: { x: 0, y: 0 } }));
        expect(r.kind).toBe('angle');
        expect(r.point.y).toBeCloseTo(0);
        expect(r.trackers).toHaveLength(1);
        const diag = snapPoint({ x: 6, y: 6.2 }, ctx({ base: { x: 0, y: 0 } }));
        expect(diag.point.x).toBeCloseTo(diag.point.y);
    });

    it('does not force an angle when the cursor is clearly off it, unless Shift is held', () => {
        const free = snapPoint({ x: 8, y: 3 }, ctx({ base: { x: 0, y: 0 } }));
        expect(free.kind).toBeNull();
        const forced = snapPoint({ x: 8, y: 3 }, ctx({ base: { x: 0, y: 0 }, forceAngle: true }));
        expect(forced.point.y).toBeCloseTo(0);
    });

    it('tracks square to the previous side, even when it is not on the 45° grid', () => {
        const prevDir = { x: Math.cos(0.3), y: Math.sin(0.3) }; // ~17°
        const base = { x: 0, y: 0 };
        const perp = { x: -Math.sin(0.3), y: Math.cos(0.3) };
        const r = snapPoint({ x: perp.x * 8 + 0.2, y: perp.y * 8 }, ctx({ base, prevDir }));
        expect(r.kind).toBe('angle');
        expect(r.point.x * prevDir.x + r.point.y * prevDir.y).toBeCloseTo(0);
    });

    it('snaps to where the angle tracker lines up with another corner', () => {
        // Drawing up from (20, 10); level with the square's corner (10, 0)
        const r = snapPoint({ x: 20.2, y: 0.3 }, ctx({ vertices: square, base: { x: 20, y: 10 } }));
        expect(r.point.x).toBeCloseTo(20);
        expect(r.point.y).toBeCloseTo(0);
        expect(r.trackers).toHaveLength(2);
    });

    it('snaps to guides and guide crossings', () => {
        const h = guideToLine({ id: 'h', type: 'h', position: 4, angle: 0, locked: false });
        const v = guideToLine({ id: 'v', type: 'v', position: 7, angle: 0, locked: false });
        expect(snapPoint({ x: 7.2, y: 3.8 }, ctx({ guides: [h, v] }))).toMatchObject({ point: { x: 7, y: 4 }, kind: 'intersection' });
        const r = snapPoint({ x: 2, y: 4.3 }, ctx({ guides: [h] }));
        expect(r.kind).toBe('guide');
        expect(r.point.y).toBeCloseTo(4);
    });

    it('reads rotated guides the way the canvas draws them', () => {
        // A horizontal guide rotated 90° is the vertical line x = -position
        const g = guideToLine({ id: 'g', type: 'h', position: 3, angle: 90, locked: false });
        const r = snapPoint({ x: -3.2, y: 12 }, ctx({ guides: [g] }));
        expect(r.point.x).toBeCloseTo(-3);
    });

    it('falls back to the grid, and ignores objects when object snapping is off', () => {
        const c = ctx({ vertices: square, segments: edges, grid: 0.5, objects: false });
        expect(snapPoint({ x: 10.2, y: 0.1 }, c)).toMatchObject({ point: { x: 10, y: 0 }, kind: 'grid' });
        expect(snapPoint({ x: 3.3, y: 4.8 }, ctx({ grid: 1 })).point).toEqual({ x: 3, y: 5 });
    });

    it('gives round lengths along a tracker when the grid is on', () => {
        const r = snapPoint({ x: 7.3, y: 0.2 }, ctx({ base: { x: 1, y: 0 }, grid: 0.5 }));
        expect(r.point.x).toBeCloseTo(7.5);
    });
});

describe('pointAtDistance', () => {
    it('places a typed length along the cursor direction', () => {
        const p = pointAtDistance({ x: 1, y: 1 }, { x: 4, y: 5 }, 10)!;
        expect(p.x).toBeCloseTo(7);
        expect(p.y).toBeCloseTo(9);
        expect(pointAtDistance({ x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toBeNull();
    });
});
