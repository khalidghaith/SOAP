// Checks a SOAP project layout against the soap-space-planning rules.
// Usage: node check_layout.mjs <project.json> [--grid 0.5] [--tolerance 0.15] [--dead-end 2]
// Exits 1 if any errors are found.
//
// Conventions read from the project:
// - Circulation: zone "Circulation" (except stairs/lifts), or names with hallway/corridor/landing/foyer/lobby/street.
// - Exterior doors: write "exterior door: south" (or "exterior doors: west, east") in a room's description.
//   A corridor end on that facade counts as an exit, and a plant room with its own exterior door needs no internal access.
// - Subordinate rooms (may be reached through another room): ensuite, walk-in, closet, pantry, wardrobe,
//   store/storage, plant, cleaner, ablutions, bins.

// Also imported by the SOAP app (AI bridge check_layout), so node-only code stays inside the CLI block below.

const PX = 20;            // SOAP stores geometry in pixels; 20 px = 1 m
const DOOR = 0.9;         // minimum shared wall (m) to count as a connection
const EPS = 1e-6;

const CIRCULATION = /hallway|corridor|landing|foyer|lobby|\bstreet\b/i;
const SUBORDINATE = /ensuite|en-suite|en suite|walk-in|walk in|closet|pantry|wardrobe|\bstore\b|storage|\bplant\b|cleaner|ablution|\bbins?\b/i;
const OPEN_PLAN = /living|dining|kitchen|family room|lounge/i;

const exteriorDoors = r => {
    const match = /exterior doors?\s*:\s*([a-z ,&]+)/i.exec(r.description || '');
    return new Set(match ? match[1].toLowerCase().split(/[\s,&]+/).filter(Boolean) : []);
};

export function checkLayout(project, { grid = 0.5, tolerance = 0.15, deadEnd = 2 } = {}) {
    const errors = [];
    const warnings = [];
    const rooms = (project.rooms || []).filter(r => r.isPlaced);
    const floors = (project.floors || []).map(f => f.id);
    const m = r => ({ x: r.x / PX, y: r.y / PX, w: r.width / PX, h: r.height / PX });

    const spansFloor = (r, f) => {
        if (r.floor === f) return true;
        if (r.spaceType === 'verticalConnection') {
            const lo = Math.min(r.vcFromFloor ?? Math.min(...floors), r.vcToFloor ?? Math.max(...floors));
            const hi = Math.max(r.vcFromFloor ?? Math.min(...floors), r.vcToFloor ?? Math.max(...floors));
            return f >= lo && f <= hi;
        }
        if (r.spaceType === 'multistory') {
            const lo = Math.min(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor);
            const hi = Math.max(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor);
            return f >= lo && f <= hi;
        }
        return false;
    };
    const isStair = r => r.spaceType === 'verticalConnection';
    const isCirculation = r => !isStair(r) && (r.zone === 'Circulation' || CIRCULATION.test(r.name));
    const isCorridor = r => isCirculation(r) && !/foyer|lobby|welcome|entrance/i.test(r.name)
        && Math.max(m(r).w, m(r).h) / Math.min(m(r).w, m(r).h) >= 2;
    const isOpenPlan = r => OPEN_PLAN.test(r.name);

    // Length of the shared wall between two rectangles (0 if they don't share one)
    const sharedWall = (a, b) => {
        const A = m(a), B = m(b);
        if (Math.abs(A.x + A.w - B.x) < EPS || Math.abs(B.x + B.w - A.x) < EPS)
            return Math.max(0, Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y));
        if (Math.abs(A.y + A.h - B.y) < EPS || Math.abs(B.y + B.h - A.y) < EPS)
            return Math.max(0, Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x));
        return 0;
    };

    // Grid alignment, areas and minimum widths
    for (const r of rooms) {
        const g = m(r);
        const off = [g.x, g.y, g.w, g.h].some(v => Math.abs(v / grid - Math.round(v / grid)) > 1e-6);
        if (off) errors.push(`${r.name}: not on the ${grid} m grid (${g.x}, ${g.y}, ${g.w} × ${g.h})`);
        const area = g.w * g.h;
        const dev = r.area ? (area - r.area) / r.area : 0;
        if (Math.abs(dev) > tolerance) {
            const saving = isCirculation(r) && dev < 0;
            warnings.push(`${r.name}: ${area} m² vs program ${r.area} m² (${dev > 0 ? '+' : ''}${Math.round(dev * 100)}%)${saving ? ' — circulation saving' : ' — state a reason'}`);
        }
        if (!isCirculation(r) && !isStair(r) && Math.min(g.w, g.h) < 1.5 - EPS)
            warnings.push(`${r.name}: narrowest side is ${Math.min(g.w, g.h)} m`);
    }

    for (const f of floors) {
        const rs = rooms.filter(r => spansFloor(r, f));
        const label = `floor ${f}`;

        // Overlaps
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const A = m(rs[i]), B = m(rs[j]);
            if (A.x < B.x + B.w - EPS && B.x < A.x + A.w - EPS && A.y < B.y + B.h - EPS && B.y < A.y + A.h - EPS)
                errors.push(`${label}: ${rs[i].name} overlaps ${rs[j].name}`);
        }

        // Access: every room (and every stair/lift, on every floor it serves) must open onto circulation
        // or open plan. Subordinate rooms may be reached through another room.
        const circ = rs.filter(isCirculation);
        for (const r of rs) {
            if (isCirculation(r)) continue;
            if (r.spaceType === 'multistory' && r.floor !== f) continue; // upper volume of a double-height space
            const viaCirculation = circ.some(c => sharedWall(r, c) >= DOOR);
            const viaOpenPlan = isOpenPlan(r) && rs.some(o => o !== r && isOpenPlan(o) && sharedWall(r, o) >= DOOR);
            if (viaCirculation || viaOpenPlan) continue;
            const neighbours = rs.filter(o => o !== r && sharedWall(r, o) >= DOOR).map(o => o.name);
            if (SUBORDINATE.test(r.name) && (neighbours.length || exteriorDoors(r).size))
                warnings.push(`${label}: ${r.name} is reached ${exteriorDoors(r).size ? 'from outside' : `through ${neighbours.join(' / ')}`} (acceptable for a subordinate room)`);
            else
                errors.push(`${label}: ${r.name} does not open onto any circulation space${neighbours.length ? ` (only reachable through ${neighbours.join(' / ')})` : ''}`);
        }

        // Dead ends: each end of a corridor must land on something — a room/space on its axis, an exterior
        // door on that facade, or a stair or another circulation space opening off its side within `deadEnd` metres.
        // (Rooms opening off the side near a blind end don't rescue it — that is exactly a dead-end corridor.)
        for (const c of rs.filter(isCorridor)) {
            const C = m(c);
            const vertical = C.h >= C.w;
            const doors = exteriorDoors(c);
            const ends = vertical
                ? [['north', C.y, +1], ['south', C.y + C.h, -1]]
                : [['west', C.x, +1], ['east', C.x + C.w, -1]];
            for (const [side, at, inward] of ends) {
                if (doors.has(side)) continue;
                const onAxis = rs.some(r => {
                    if (r === c) return false;
                    const B = m(r);
                    const [lo, hi, s0, s1, a0, a1] = vertical
                        ? [B.y, B.y + B.h, B.x, B.x + B.w, C.x, C.x + C.w]
                        : [B.x, B.x + B.w, B.y, B.y + B.h, C.y, C.y + C.h];
                    return (Math.abs(hi - at) < EPS || Math.abs(lo - at) < EPS) && Math.min(a1, s1) - Math.max(a0, s0) >= DOOR;
                });
                if (onAxis) continue;
                // Nearest side opening to a stair or other circulation, measured from this end
                const reach = rs
                    .filter(r => r !== c && (isStair(r) || isCirculation(r)) && sharedWall(c, r) >= DOOR)
                    .map(r => {
                        const B = m(r);
                        const [s0, s1] = vertical ? [B.y, B.y + B.h] : [B.x, B.x + B.w];
                        const near = inward > 0 ? Math.max(s0, at) : Math.min(s1, at);
                        return Math.abs(near - at);
                    });
                const dist = reach.length ? Math.min(...reach) : Infinity;
                if (dist > deadEnd)
                    errors.push(`${label}: dead end — the ${side} end of ${c.name} opens onto nothing${Number.isFinite(dist) ? ` (nearest way on is ${dist} m away)` : ''}`);
            }
        }
    }

    errors.push(...checkSite(project, rooms));
    return { errors, warnings };
}

// --- Site: boundary, setbacks and no-build zones (siteProperties, in world meters) ---
// Mirrors utils/site.ts in the app. Basements may sit under setbacks; outdoor spaces are exempt.

const signedArea = pts => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
const distSeg = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const inPoly = (p, poly, tol = 1e-4) => {
    if (poly.some((a, i) => distSeg(p, a, poly[(i + 1) % poly.length]) <= tol)) return tol >= 0;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
};
const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const [d1, d2, d3, d4] = [o(c, d, a), o(c, d, b), o(a, b, c), o(a, b, d)];
    return d1 * d2 < -EPS && d3 * d4 < -EPS;
};
const edgesCross = (A, B) => A.some((a, i) => B.some((b, j) => cross(a, A[(i + 1) % A.length], b, B[(j + 1) % B.length])));
const inside = (inner, outer) => inner.every(p => inPoly(p, outer)) && !edgesCross(inner, outer)
    && inner.every((p, i) => { const q = inner[(i + 1) % inner.length]; return inPoly({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, outer); });
// Strictly inside: on-edge points don't count, so a room touching a zone's edge is fine
const strictlyIn = (p, poly) => inPoly(p, poly, -1) && poly.every((a, i) => distSeg(p, a, poly[(i + 1) % poly.length]) > 1e-4);
const centre = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const overlaps = (A, B) => edgesCross(A, B) || A.some(p => strictlyIn(p, B)) || B.some(p => strictlyIn(p, A))
    || strictlyIn(centre(A), B) || strictlyIn(centre(B), A);

const inset = (pts, setbacks) => {
    const sign = signedArea(pts) > 0 ? 1 : -1;
    let lines = pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length], len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }, s = setbacks[i] ?? 0;
        return { p: { x: p.x - d.y * sign * s, y: p.y + d.x * sign * s }, d };
    });
    const meet = ls => ls.map((l2, i) => {
        const l1 = ls[(i - 1 + ls.length) % ls.length], den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
        if (Math.abs(den) < 1e-9) return l2.p;
        const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / den;
        return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
    });
    let out = meet(lines);
    for (let k = 0; k < pts.length; k++) {
        const rev = lines.map((l, i) => { const a = out[i], b = out[(i + 1) % out.length]; return (b.x - a.x) * l.d.x + (b.y - a.y) * l.d.y < -EPS; });
        if (!rev.includes(true)) break;
        lines = lines.filter((_, i) => !rev[i]);
        if (lines.length < 3) return null;
        out = meet(lines);
    }
    const a = signedArea(out);
    return Math.sign(a) === Math.sign(signedArea(pts)) && Math.abs(a) > EPS && out.every(p => inPoly(p, pts, 1e-3)) ? out : null;
};

function checkSite(project, rooms) {
    const site = project.siteProperties || {};
    const boundary = site.boundary;
    if (!Array.isArray(boundary) || boundary.length < 3) return [];
    const c = site.constraints || {};
    const setbacks = boundary.map((_, i) => typeof c.edgeSetbacks?.[i] === 'number' ? c.edgeSetbacks[i] : (c.defaultSetback ?? 0));
    const buildable = setbacks.every(s => s === 0) ? boundary : inset(boundary, setbacks);
    const errors = [];
    if (!buildable) errors.push('site: the setbacks leave no buildable area');
    for (const r of rooms) {
        if (r.spaceType === 'outdoor') continue;
        // Rect rooms rotate about their centre on the canvas; polygon/bubble rooms about their origin
        const isPoly = r.polygon?.length >= 3 || r.shape === 'bubble';
        const local = r.polygon?.length >= 3 ? r.polygon : [{ x: 0, y: 0 }, { x: r.width, y: 0 }, { x: r.width, y: r.height }, { x: 0, y: r.height }];
        const piv = isPoly ? { x: 0, y: 0 } : { x: r.width / 2, y: r.height / 2 };
        const rad = ((r.rotation || 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
        const poly = local.map(p => {
            const dx = p.x - piv.x, dy = p.y - piv.y;
            return { x: (r.x + piv.x + dx * cos - dy * sin) / PX, y: (r.y + piv.y + dx * sin + dy * cos) / PX };
        });
        if (!inside(poly, boundary)) errors.push(`site: ${r.name} (floor ${r.floor}) is outside the site boundary`);
        else if (r.floor >= 0 && buildable && !inside(poly, buildable)) errors.push(`site: ${r.name} (floor ${r.floor}) is inside the setback`);
        else {
            const zone = (site.zones || []).find(z => z.points?.length >= 3 && overlaps(poly, z.points));
            if (zone) errors.push(`site: ${r.name} (floor ${r.floor}) is in ${zone.name}`);
        }
    }
    return errors;
}

// CLI
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('check_layout.mjs')) (async () => {
    const { readFileSync } = await import('node:fs');
    const args = process.argv.slice(2);
    const file = args.find(a => !a.startsWith('--') && !/^\d/.test(a));
    if (!file) {
        console.error('Usage: node check_layout.mjs <project.json> [--grid 0.5] [--tolerance 0.15] [--dead-end 2]');
        process.exit(2);
    }
    const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : undefined; };
    const project = JSON.parse(readFileSync(file, 'utf8'));
    const { errors, warnings } = checkLayout(project, {
        grid: opt('grid') ?? 0.5, tolerance: opt('tolerance') ?? 0.15, deadEnd: opt('dead-end') ?? 2,
    });
    for (const e of errors) console.log(`ERROR    ${e}`);
    for (const w of warnings) console.log(`WARNING  ${w}`);
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(errors.length ? 1 : 0);
})();
