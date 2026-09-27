#!/usr/bin/env node
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

import { readFileSync } from 'node:fs';

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

    return { errors, warnings };
}

// CLI
if (process.argv[1]?.endsWith('check_layout.mjs')) {
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
}
