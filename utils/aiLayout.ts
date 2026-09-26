import { Room, AnalysisResponse, SpaceType, VCType } from '../types';

// --- Program analysis → rooms ---

const SPACE_TYPES: SpaceType[] = ['standard', 'outdoor', 'terrace', 'multistory', 'verticalConnection'];
const VC_TYPES: VCType[] = ['stair', 'elevator', 'ramp'];

// Converts an AI program analysis into inventory rooms, dropping invalid entries and unknown enum values.
export const analysisToRooms = (data: AnalysisResponse, pixelsPerMeter: number): Room[] => {
    const stamp = Date.now();
    return (data.spaces || [])
        .filter(s => s && typeof s.name === 'string' && s.name.trim() && Number.isFinite(s.area) && s.area > 0)
        .map((s, i) => {
            const spaceType = SPACE_TYPES.includes(s.spaceType as SpaceType) ? s.spaceType : 'standard';
            const side = Math.sqrt(s.area) * pixelsPerMeter;
            return {
                id: `room-${stamp}-${i}`,
                name: s.name.trim(),
                area: s.area,
                zone: s.zone?.trim() || 'Default',
                description: s.description,
                spaceType,
                vcType: spaceType === 'verticalConnection' && VC_TYPES.includes(s.vcType as VCType) ? s.vcType : undefined,
                daylightReq: s.daylightReq === 'perimeter' || s.daylightReq === 'core' ? s.daylightReq : undefined,
                aspectRatioHint: ['regular', 'long', 'square'].includes(s.aspectRatioHint as string) ? s.aspectRatioHint : undefined,
                isPlaced: false,
                floor: 0,
                x: 0, y: 0,
                width: side,
                height: side,
            };
        });
};

// --- AI layout validation ---

export interface LayoutRect {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    floor: number;
}

export interface LayoutRequestSpace {
    id: string;
    name: string;
    area: number;
    spaceType?: string;
}

export interface LayoutValidationResult {
    placements: LayoutRect[];
    issues: string[];
}

const EPS = 1e-6;
const overlaps = (a: LayoutRect, b: LayoutRect) =>
    a.floor === b.floor &&
    a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS &&
    a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS;

const snap = (v: number, grid: number) => Math.round(v / grid) * grid;

/**
 * Checks an AI-generated layout against the request and repairs what can be repaired:
 * - drops placements for unknown/duplicate ids or with invalid geometry
 * - moves placements on non-existent floors to the nearest existing floor
 * - aligns vertical connections that share a name to one position on every floor
 * - pushes overlapping spaces (against locked spaces or each other) to the nearest free spot
 * Everything that was changed or couldn't be satisfied is reported in `issues`.
 * All values are in meters.
 */
export const validateAiLayout = (
    raw: LayoutRect[],
    requested: LayoutRequestSpace[],
    fixed: LayoutRect[],
    floorIds: number[],
    gridSize: number,
    areaTolerance = 0.2
): LayoutValidationResult => {
    const issues: string[] = [];
    const byId = new Map(requested.map(s => [s.id, s]));
    const seen = new Set<string>();
    const placements: LayoutRect[] = [];

    // 1. Basic sanity: known ids, no duplicates, finite positive geometry
    for (const item of Array.isArray(raw) ? raw : []) {
        const req = item && byId.get(item.id);
        if (!req || seen.has(item.id)) continue;
        const nums = [item.x, item.y, item.width, item.height, item.floor];
        if (!nums.every(Number.isFinite) || item.width <= 0 || item.height <= 0) {
            issues.push(`"${req.name}" had invalid dimensions and was left in the inventory.`);
            continue;
        }
        seen.add(item.id);
        placements.push({
            id: item.id,
            name: req.name,
            x: snap(item.x, gridSize),
            y: snap(item.y, gridSize),
            width: Math.max(gridSize, snap(item.width, gridSize)),
            height: Math.max(gridSize, snap(item.height, gridSize)),
            floor: Math.round(item.floor),
        });
    }

    const missing = requested.filter(s => !seen.has(s.id));
    if (missing.length) {
        issues.push(`The AI didn't place ${missing.length} space(s): ${missing.map(s => s.name).join(', ')}. They stay in the inventory.`);
    }

    // 2. Floors must exist
    if (floorIds.length) {
        for (const p of placements) {
            if (!floorIds.includes(p.floor)) {
                const nearest = floorIds.reduce((best, f) => Math.abs(f - p.floor) < Math.abs(best - p.floor) ? f : best, floorIds[0]);
                issues.push(`"${p.name}" was placed on a floor that doesn't exist (${p.floor}); moved to floor ${nearest}.`);
                p.floor = nearest;
            }
        }
    }

    // 3. Vertical connections with the same name must stack at the same position
    const pinned = new Set<string>();
    const vcGroups = new Map<string, LayoutRect[]>();
    for (const p of placements) {
        if (byId.get(p.id)?.spaceType !== 'verticalConnection') continue;
        const key = p.name.trim().toLowerCase();
        vcGroups.set(key, [...(vcGroups.get(key) || []), p]);
    }
    for (const [key, group] of vcGroups) {
        const anchor = fixed.find(f => f.name.trim().toLowerCase() === key) || group[0];
        let moved = false;
        for (const p of group) {
            if (p !== anchor && (p.x !== anchor.x || p.y !== anchor.y || p.width !== anchor.width || p.height !== anchor.height)) {
                Object.assign(p, { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height });
                moved = true;
            }
            pinned.add(p.id);
        }
        if (moved) issues.push(`Aligned "${group[0].name}" to the same position on every floor.`);
    }

    // 4. Resolve overlaps. Locked spaces, pinned vertical connections and already-settled spaces stay put;
    //    each other space moves to the closest non-overlapping grid position.
    const settled: LayoutRect[] = [...fixed, ...placements.filter(p => pinned.has(p.id))];
    const ordered = placements.filter(p => !pinned.has(p.id));
    const fits = (r: LayoutRect) => !settled.some(o => overlaps(r, o));

    for (const p of ordered) {
        if (!fits(p)) {
            const spot = findFreeSpot(p, settled, gridSize);
            issues.push(`"${p.name}" overlapped another space and was shifted by ${Math.hypot(spot.x - p.x, spot.y - p.y).toFixed(1)} m.`);
            p.x = spot.x;
            p.y = spot.y;
        }
        settled.push(p);
    }

    // 5. Area check (reported only; the architect decides)
    for (const p of placements) {
        const target = byId.get(p.id)!.area;
        const actual = p.width * p.height;
        if (target > 0 && Math.abs(actual - target) / target > areaTolerance) {
            issues.push(`"${p.name}" is ${actual.toFixed(1)} m² but the program asks for ${target.toFixed(1)} m².`);
        }
    }

    return { placements, issues };
};

// Searches outward ring by ring on the grid for the nearest position where `r` overlaps nothing.
const findFreeSpot = (r: LayoutRect, others: LayoutRect[], gridSize: number): { x: number; y: number } => {
    const sameFloor = others.filter(o => o.floor === r.floor);
    const clear = (x: number, y: number) => !sameFloor.some(o => overlaps({ ...r, x, y }, o));
    const maxRing = 400;
    for (let ring = 1; ring <= maxRing; ring++) {
        let best: { x: number; y: number; d: number } | null = null;
        for (let dx = -ring; dx <= ring; dx++) {
            for (let dy = -ring; dy <= ring; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                const x = r.x + dx * gridSize;
                const y = r.y + dy * gridSize;
                const d = dx * dx + dy * dy;
                if ((!best || d < best.d) && clear(x, y)) best = { x, y, d };
            }
        }
        if (best) return { x: best.x, y: best.y };
    }
    // Fallback: to the right of everything on this floor
    const right = sameFloor.reduce((m, o) => Math.max(m, o.x + o.width), r.x);
    return { x: snap(right + gridSize, gridSize), y: r.y };
};
