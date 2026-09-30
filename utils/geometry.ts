import { Point } from '../types';

// --- Polygon measures ---

/** Signed area (shoelace). The sign tells the winding direction. */
export const signedArea = (pts: Point[]): number => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
};

export const polygonArea = (pts: Point[]): number => Math.abs(signedArea(pts));

/**
 * Area enclosed by a bubble: the smooth closed curve through `points` (Catmull-Rom, drawn as cubic
 * Béziers), flattened into short segments.
 */
export const bubbleArea = (points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    const steps = 20;
    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        let prevX = p1.x;
        let prevY = p1.y;
        for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            const it = 1 - t;
            const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
            const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
            area += prevX * y - x * prevY;
            prevX = x;
            prevY = y;
        }
    }
    return Math.abs(area) / 2;
};

/**
 * The average of the vertices. Cheaper than the area-weighted centre of gravity (polygonCentroid in
 * utils/site) and different from it for uneven shapes; used where the vertex average was always used.
 */
export const vertexCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

// Cross product of vectors OA and OB
// A positive cross product indicates a counter-clockwise turn, 0 indicates a collinear points, and negative indicates a clockwise turn.
const cross = (o: Point, a: Point, b: Point) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
};

// Monotone Chain Algorithm for Convex Hull
export const getConvexHull = (points: Point[]): Point[] => {
    if (points.length <= 1) return points;

    // Sort points lexicographically (by x, then by y)
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

    // Build lower hull
    const lower: Point[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    // Build upper hull
    const upper: Point[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    // Concatenate lower and upper hull
    // The last point of lower and upper are duplicates of the start points of the other list, so remove them.
    lower.pop();
    upper.pop();

    return [...lower, ...upper];
};


// SVG Fillet utility
export const createRoundedPath = (rawPoints: Point[], radius: number) => {
    // Repeated consecutive points give zero-length edges, which would divide by zero below
    const points = rawPoints.filter((p, i) => {
        const prev = rawPoints[(i - 1 + rawPoints.length) % rawPoints.length];
        return rawPoints.length < 2 || p.x !== prev.x || p.y !== prev.y;
    });
    if (points.length < 3) return "";
    let path = "";
    const len = points.length;
    for (let i = 0; i < len; i++) {
        const p0 = points[(i - 1 + len) % len];
        const p1 = points[i];
        const p2 = points[(i + 1) % len];
        const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
        const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
        const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        const r = Math.min(radius, l1 / 2, l2 / 2);
        const sX = p1.x + (v1.x / l1) * r;
        const sY = p1.y + (v1.y / l1) * r;
        const eX = p1.x + (v2.x / l2) * r;
        const eY = p1.y + (v2.y / l2) * r;
        path += (i === 0 ? `M ${sX},${sY}` : ` L ${sX},${sY}`) + ` Q ${p1.x},${p1.y} ${eX},${eY}`;
    }
    return path + " Z";
};
