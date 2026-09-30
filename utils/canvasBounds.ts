import { Room, Annotation, Point } from '../types';

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * World-pixel bounds of what zoom-to-fit should show: the given spaces (their unrotated outline),
 * sketch points and site boundary (already in pixels). Null when there is nothing to fit.
 */
export const canvasContentBounds = (rooms: Room[], annotations: Annotation[], sitePoints: Point[]): Bounds | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x: number, y: number) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };

    rooms.forEach(r => {
        if (r.polygon) r.polygon.forEach(p => add(r.x + p.x, r.y + p.y));
        else { add(r.x, r.y); add(r.x + r.width, r.y + r.height); }
    });
    annotations.forEach(a => a.points?.forEach(p => add(p.x, p.y)));
    sitePoints.forEach(p => add(p.x, p.y));

    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
};
