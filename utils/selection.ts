import { Point } from '../types';

/** An axis-aligned selection rectangle, in the same units as the outlines tested against it. */
export interface SelectionBox { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Marquee selection, as in CAD:
 * - 'window' (dragged left to right) selects shapes that lie wholly inside the box
 * - 'crossing' (dragged right to left) also selects shapes the box touches or lies inside
 */
export type SelectionMode = 'window' | 'crossing';

export const selectionBoxFrom = (a: Point, b: Point): SelectionBox => ({
    minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y),
});

const isPointInPolygon = (p: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const ccw = (A: Point, B: Point, C: Point): boolean => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);

const segmentsIntersect = (A: Point, B: Point, C: Point, D: Point): boolean =>
    ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);

/**
 * Whether a shape is selected by the box. `closed` outlines (rooms) have an edge back to the start
 * and also count as crossed when the box lies inside them; open ones (sketch lines) don't.
 */
export const outlineInBox = (points: Point[], box: SelectionBox, mode: SelectionMode, closed: boolean): boolean => {
    const inBox = (p: Point) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
    if (mode === 'window') return points.every(inBox);

    if (points.some(inBox)) return true;

    const corners = [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY },
    ];
    if (closed && corners.some(c => isPointInPolygon(c, points))) return true;

    const edgeCount = closed ? points.length : points.length - 1;
    for (let i = 0; i < edgeCount; i++) {
        const p1 = points[i], p2 = points[(i + 1) % points.length];
        for (let k = 0; k < 4; k++) {
            if (segmentsIntersect(corners[k], corners[(k + 1) % 4], p1, p2)) return true;
        }
    }
    return false;
};
