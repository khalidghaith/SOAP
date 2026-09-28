import { Point, CanvasGuide } from '../types';

// CAD-style point snapping for drawing and editing site geometry. All units are world meters.

export type SnapKind = 'endpoint' | 'midpoint' | 'intersection' | 'edge' | 'guide' | 'grid' | 'angle' | 'align';

export interface SnapLine { a: Point; b: Point } // infinite guide line through a and b, drawn as a dashed tracker

export interface SnapContext {
    tolerance: number;              // meters (screen tolerance / zoom)
    vertices: Point[];              // endpoint targets
    segments: [Point, Point][];     // edge targets (midpoint + nearest point)
    guides: SnapLine[];             // infinite lines (canvas guides)
    grid: number;                   // meters; 0 = off
    base?: Point | null;            // previous point, for angle tracking
    prevDir?: Point | null;         // direction of the previous segment, for square / parallel tracking
    forceAngle?: boolean;           // Shift: always lock to the nearest tracking angle
    objects?: boolean;              // snap to vertices/edges (default true)
}

export interface SnapResult {
    point: Point;
    kind: SnapKind | null;
    trackers: SnapLine[];           // dashed alignment lines to draw
}

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const len = (a: Point) => Math.hypot(a.x, a.y);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const projectOnLine = (p: Point, l: SnapLine): Point => {
    const d = sub(l.b, l.a);
    const t = dot(sub(p, l.a), d) / (dot(d, d) || 1);
    return { x: l.a.x + d.x * t, y: l.a.y + d.y * t };
};

const projectOnSegment = (p: Point, a: Point, b: Point): Point => {
    const d = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / (dot(d, d) || 1)));
    return { x: a.x + d.x * t, y: a.y + d.y * t };
};

export const intersectLines = (l1: SnapLine, l2: SnapLine): Point | null => {
    const d1 = sub(l1.b, l1.a), d2 = sub(l2.b, l2.a);
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((l2.a.x - l1.a.x) * d2.y - (l2.a.y - l1.a.y) * d2.x) / den;
    return { x: l1.a.x + d1.x * t, y: l1.a.y + d1.y * t };
};

/** A canvas guide as an infinite line in meters (see App: h guides satisfy -x·sinθ + y·cosθ = pos). */
export const guideToLine = (g: CanvasGuide): SnapLine => {
    const a = ((g.angle || 0) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    if (g.type === 'h') {
        const p = { x: -g.position * sin, y: g.position * cos };
        return { a: p, b: { x: p.x + cos, y: p.y + sin } };
    }
    const p = { x: g.position * cos, y: g.position * sin };
    return { a: p, b: { x: p.x - sin, y: p.y + cos } };
};

/** Tracking directions from the base point: every 45°, plus square and parallel to the previous side. */
const trackingDirs = (prevDir?: Point | null): Point[] => {
    const dirs: Point[] = [];
    for (let k = 0; k < 4; k++) dirs.push({ x: Math.cos((k * Math.PI) / 4), y: Math.sin((k * Math.PI) / 4) });
    if (prevDir && len(prevDir) > 1e-9) {
        const u = { x: prevDir.x / len(prevDir), y: prevDir.y / len(prevDir) };
        dirs.push(u, { x: -u.y, y: u.x });
    }
    return dirs;
};

const ANGLE_TOLERANCE = (4 * Math.PI) / 180; // snap to a tracking angle within 4°

export const snapPoint = (raw: Point, ctx: SnapContext): SnapResult => {
    const tol = ctx.tolerance;
    const objects = ctx.objects !== false;
    const nearest = (pts: Point[]) => {
        let best: Point | null = null, bd = tol;
        for (const p of pts) { const d = dist(raw, p); if (d <= bd) { bd = d; best = p; } }
        return best;
    };

    // 1. Point targets: corners, midpoints, guide crossings
    if (objects && !ctx.forceAngle) {
        const v = nearest(ctx.vertices);
        if (v) return { point: { ...v }, kind: 'endpoint', trackers: [] };
        const m = nearest(ctx.segments.map(([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })));
        if (m) return { point: m, kind: 'midpoint', trackers: [] };
    }
    if (!ctx.forceAngle && ctx.guides.length > 1) {
        const crossings: Point[] = [];
        for (let i = 0; i < ctx.guides.length; i++) for (let j = i + 1; j < ctx.guides.length; j++) {
            const x = intersectLines(ctx.guides[i], ctx.guides[j]);
            if (x) crossings.push(x);
        }
        const c = nearest(crossings);
        if (c) return { point: c, kind: 'intersection', trackers: [] };
    }

    // 2. Tracking lines: angle from the base point, and horizontal/vertical alignment with corners
    const trackLines: { line: SnapLine; kind: 'angle' | 'align' }[] = [];
    if (ctx.base) {
        const off = sub(raw, ctx.base);
        const r = len(off);
        if (r > 1e-9) {
            let best: { dir: Point; err: number } | null = null;
            for (const d of trackingDirs(ctx.prevDir)) {
                const cosA = Math.abs(dot(off, d)) / r;
                const err = Math.acos(Math.min(1, cosA));
                if (!best || err < best.err) best = { dir: d, err };
            }
            // Distance from the tracking ray also has to be within tolerance, so far-away points don't jump
            if (best && (ctx.forceAngle || (best.err <= ANGLE_TOLERANCE && r * Math.sin(best.err) <= tol * 2))) {
                trackLines.push({ line: { a: ctx.base, b: { x: ctx.base.x + best.dir.x, y: ctx.base.y + best.dir.y } }, kind: 'angle' });
            }
        }
    }
    if (objects && !ctx.forceAngle) {
        let bx: Point | null = null, by: Point | null = null;
        for (const v of ctx.vertices) {
            if (ctx.base && dist(v, ctx.base) < 1e-9) continue; // the angle tracker already covers the base
            if (Math.abs(raw.x - v.x) <= tol && (!bx || Math.abs(raw.x - v.x) < Math.abs(raw.x - bx.x))) bx = v;
            if (Math.abs(raw.y - v.y) <= tol && (!by || Math.abs(raw.y - v.y) < Math.abs(raw.y - by.y))) by = v;
        }
        if (bx) trackLines.push({ line: { a: bx, b: { x: bx.x, y: bx.y + 1 } }, kind: 'align' });
        if (by) trackLines.push({ line: { a: by, b: { x: by.x + 1, y: by.y } }, kind: 'align' });
    }

    // Where two trackers cross near the cursor, snap to the crossing (e.g. 90° from the last point, level with a corner)
    for (let i = 0; i < trackLines.length; i++) for (let j = i + 1; j < trackLines.length; j++) {
        const x = intersectLines(trackLines[i].line, trackLines[j].line);
        if (x && dist(x, raw) <= tol * 1.5) return { point: x, kind: trackLines[i].kind, trackers: [trackLines[i].line, trackLines[j].line] };
    }

    // A tracker combined with an edge or guide: snap to where they cross
    const lineTargets: SnapLine[] = [
        ...(objects ? ctx.segments.map(([a, b]) => ({ a, b })) : []),
        ...ctx.guides,
    ];
    for (const t of trackLines) {
        for (const l of lineTargets) {
            const x = intersectLines(t.line, l);
            if (!x || dist(x, raw) > tol) continue;
            // Only within the segment's extent for edges
            const isSeg = objects && ctx.segments.some(([a, b]) => a === l.a && b === l.b);
            if (isSeg && dist(projectOnSegment(x, l.a, l.b), x) > 1e-6) continue;
            return { point: x, kind: 'intersection', trackers: [t.line] };
        }
    }

    if (trackLines.length) {
        const t = trackLines[0];
        let p = projectOnLine(raw, t.line);
        // Slide along the tracker in grid steps (distance from its anchor), so lengths come out round
        if (ctx.grid > 0) {
            const d = sub(t.line.b, t.line.a), u = { x: d.x / len(d), y: d.y / len(d) };
            const s = Math.round(dot(sub(p, t.line.a), u) / ctx.grid) * ctx.grid;
            p = { x: t.line.a.x + u.x * s, y: t.line.a.y + u.y * s };
        }
        return { point: p, kind: t.kind, trackers: [t.line] };
    }

    // 3. On an edge or guide
    if (objects) {
        let best: Point | null = null, bd = tol;
        for (const [a, b] of ctx.segments) {
            const p = projectOnSegment(raw, a, b);
            const d = dist(p, raw);
            if (d <= bd) { bd = d; best = p; }
        }
        if (best) return { point: best, kind: 'edge', trackers: [] };
    }
    for (const g of ctx.guides) {
        const p = projectOnLine(raw, g);
        if (dist(p, raw) <= tol) return { point: p, kind: 'guide', trackers: [g] };
    }

    // 4. Grid
    if (ctx.grid > 0) {
        return { point: { x: Math.round(raw.x / ctx.grid) * ctx.grid, y: Math.round(raw.y / ctx.grid) * ctx.grid }, kind: 'grid', trackers: [] };
    }
    return { point: raw, kind: null, trackers: [] };
};

/** The point `length` meters from `base` towards `toward` (for typed dimensions). */
export const pointAtDistance = (base: Point, toward: Point, length: number): Point | null => {
    const d = sub(toward, base);
    const l = len(d);
    if (l < 1e-9) return null;
    return { x: base.x + (d.x / l) * length, y: base.y + (d.y / l) * length };
};
