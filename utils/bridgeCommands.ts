import { Room, Floor, SiteProperties, SiteConstraints, SpaceType, VCType, ZoneColor, AppSettings, Point } from '../types';
import { analyzeSite, roomWorldPolygon, polygonArea, recenterShape } from './site';
import { PIXELS_PER_METER, roomFloorRange } from './rooms';
export { classifyClient, type BridgeClientKind } from '../mcp/core';
import { checkLayout } from '../.claude/skills/soap-space-planning/scripts/check_layout.mjs';
import planningRulesMd from '../.claude/skills/soap-space-planning/SKILL.md?raw';

/** The architect's planning rules, as given to AI clients (the skill file without its frontmatter). */
export const PLANNING_RULES = planningRulesMd.replace(/^---[\s\S]*?---\s*/, '');

/** Planning-rule and site check of the whole project (MCP check_layout). `project` is the saved project file. */
export const checkProject = (project: unknown, s: BridgeState) => {
    const { errors, warnings } = checkLayout(project) as { errors: string[]; warnings: string[] };
    const site = (describeProject(s).site as { report?: unknown }).report ?? null;
    return { errors, warnings, site, summary: `${errors.length} error(s), ${warnings.length} warning(s)` };
};

// Commands that AI clients send to SOAP through the MCP bridge (see mcp/hub.ts).
// Everything is in meters; SOAP stores room geometry in pixels.

const PX = PIXELS_PER_METER;


export interface BridgeState {
    projectName: string;
    rooms: Room[];
    floors: Floor[];
    currentFloor: number;
    zoneColors: Record<string, ZoneColor>;
    siteProperties: SiteProperties;
    appSettings?: AppSettings;
}

export interface BridgeChanges {
    rooms?: Room[];
    floors?: Floor[];
    currentFloor?: number;
    siteProperties?: SiteProperties;
    newZones?: string[]; // zones that need a colour
}

export interface BridgeOutcome {
    result: unknown;
    changes?: BridgeChanges;
    undoable?: boolean; // record one undo step before applying
}

export class BridgeError extends Error {}

const round = (v: number, d = 3) => Number(v.toFixed(d));

const roomFloors = (r: Room): number[] => {
    const [lo, hi] = roomFloorRange(r);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
};

/** A room as the AI sees it: meters, rounded, with only meaningful fields. */
export const describeRoom = (r: Room) => {
    const base = {
        id: r.id,
        name: r.name,
        zone: r.zone,
        programArea: r.area,
        ...(r.description ? { description: r.description } : {}),
        ...(r.spaceType && r.spaceType !== 'standard' ? { spaceType: r.spaceType } : {}),
        ...(r.vcType ? { vcType: r.vcType } : {}),
        placed: r.isPlaced,
    };
    if (!r.isPlaced) return base;
    const isRect = !(r.polygon && r.polygon.length >= 3) && r.shape !== 'bubble';
    const outline = roomWorldPolygon(r, PX);
    const placed = {
        ...base,
        floor: r.floor,
        ...(roomFloors(r).length > 1 ? { floors: roomFloors(r) } : {}),
    };
    if (isRect) return {
        ...placed,
        x: round(r.x / PX), y: round(r.y / PX),
        width: round(r.width / PX), height: round(r.height / PX),
        ...(r.rotation ? { rotation: r.rotation, outline: outline.map(p => ({ x: round(p.x), y: round(p.y) })) } : {}),
        shape: 'rect',
        drawnArea: round(polygonArea(outline), 2),
    };
    // Drawn shapes: the stored width/height is the rectangle the room started as, so describe what was drawn.
    // `outline` is a polygon's corners or a bubble's points (what draw_spaces takes); extent and area follow the curve.
    const points = roomWorldPolygon(r, PX, { points: true });
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return {
        ...placed,
        x: round(minX), y: round(minY),
        width: round(Math.max(...xs) - minX), height: round(Math.max(...ys) - minY),
        shape: r.shape === 'bubble' ? 'bubble' : 'polygon',
        outline: points.map(p => ({ x: round(p.x), y: round(p.y) })),
        drawnArea: round(polygonArea(outline), 2),
    };
};

export const describeProject = (s: BridgeState) => {
    const site = s.siteProperties;
    const report = analyzeSite(site, s.rooms, s.floors, s.appSettings, PX);
    return {
        projectName: s.projectName,
        units: 'meters; x grows east (right), y grows south (down) on the plan',
        currentFloor: s.currentFloor,
        floors: s.floors.map(f => ({ id: f.id, label: f.label, height: f.height })),
        zones: Object.keys(s.zoneColors).filter(z => z !== 'Default'),
        spaces: s.rooms.map(describeRoom),
        site: {
            location: site.locationName,
            latitude: site.latitude,
            longitude: site.longitude,
            northAngle: site.northAngle,
            ...(site.boundary ? { boundary: site.boundary.map(p => ({ x: round(p.x), y: round(p.y) })) } : {}),
            ...(site.constraints ? { constraints: site.constraints } : {}),
            ...(site.zones?.length ? { noBuildZones: site.zones.map(z => ({ name: z.name, points: z.points.map(p => ({ x: round(p.x), y: round(p.y) })) })) } : {}),
            ...(report ? {
                report: {
                    siteArea: round(report.siteArea, 1), buildableArea: round(report.buildableArea, 1),
                    coverage: round(report.coverage, 1), gfa: round(report.gfa, 1), far: round(report.far, 2), height: round(report.height, 1),
                    limitsExceeded: Object.entries(report.limits).filter(([, v]) => v).map(([k]) => k),
                    violations: report.violations.map(v => ({ space: v.roomName, floor: v.floor, problem: v.reason, ...(v.detail ? { zone: v.detail } : {}) })),
                },
            } : {}),
        },
    };
};

// --- Argument types (validated by the MCP server's schemas; re-checked here where it matters) ---

export interface NewSpace { name: string; area: number; zone?: string; description?: string; spaceType?: SpaceType; vcType?: VCType }
export interface SpaceUpdate { id: string; name?: string; area?: number; zone?: string; description?: string; spaceType?: SpaceType }
export interface Placement { id: string; floor: number; x: number; y: number; width: number; height: number; rotation?: number }
export interface Drawing { id: string; floor: number; shape: 'polygon' | 'bubble'; outline: Point[] }
export interface FloorUpdate { id: number; label?: string; height?: number }
export interface SiteUpdate {
    boundary?: Point[];
    northAngle?: number;
    constraints?: Partial<SiteConstraints>;
    noBuildZones?: { name: string; points: Point[] }[];
}

/** An outline without repeated points (including a closing repeat of the first). */
const cleanOutline = (pts: Point[]) => pts
    .map(p => ({ x: p.x, y: p.y }))
    .filter((p, i, all) => { const q = all[(i + 1) % all.length]; return Math.hypot(q.x - p.x, q.y - p.y) > 1e-6; });

/** Whether any two edges of a closed outline that aren't neighbours touch or cross. */
const selfCrossing = (pts: Point[]) => {
    const o = (a: Point, b: Point, c: Point) => { const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return Math.abs(v) < 1e-9 ? 0 : Math.sign(v); };
    const on = (a: Point, b: Point, p: Point) => Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;
    const meet = (a: Point, b: Point, c: Point, d: Point) => {
        const [o1, o2, o3, o4] = [o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)];
        if (o1 !== o2 && o3 !== o4) return true;
        return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
    };
    const n = pts.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
        if (meet(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
    return false;
};

const findRoom = (rooms: Room[], id: string) => {
    const r = rooms.find(x => x.id === id);
    if (!r) throw new BridgeError(`No space with id "${id}". Call get_project to see the current ids.`);
    return r;
};

/** Matches an AI-given zone name to an existing zone case-insensitively; unknown zones are created. */
const resolveZone = (zone: string | undefined, zoneColors: Record<string, ZoneColor>, newZones: Set<string>) => {
    const z = (zone || '').trim();
    if (!z) return 'Default';
    const existing = Object.keys(zoneColors).find(k => k.toLowerCase() === z.toLowerCase());
    if (existing) return existing;
    newZones.add(z);
    return z;
};

let idCounter = 0;
const newId = () => `room-${Date.now()}-ai${(idCounter++).toString(36)}`;

export const runBridgeCommand = (tool: string, args: any, s: BridgeState): BridgeOutcome => {
    switch (tool) {
        case 'get_project':
            return { result: describeProject(s) };

        case 'add_spaces': {
            const newZones = new Set<string>();
            const created = (args.spaces as NewSpace[]).map(sp => {
                if (!(sp.area > 0)) throw new BridgeError(`Space "${sp.name}" needs a positive area.`);
                const side = Math.sqrt(sp.area) * PX;
                const room: Room = {
                    id: newId(),
                    name: sp.name,
                    area: sp.area,
                    zone: resolveZone(sp.zone, s.zoneColors, newZones),
                    isPlaced: false,
                    floor: 0,
                    x: 0, y: 0, width: side, height: side,
                    ...(sp.description ? { description: sp.description } : {}),
                    ...(sp.spaceType ? { spaceType: sp.spaceType } : {}),
                    ...(sp.vcType ? { vcType: sp.vcType, spaceType: 'verticalConnection' as SpaceType } : {}),
                };
                return room;
            });
            return {
                result: { added: created.map(r => ({ id: r.id, name: r.name })) },
                changes: { rooms: [...s.rooms, ...created], newZones: [...newZones] },
                undoable: true,
            };
        }

        case 'update_spaces': {
            const newZones = new Set<string>();
            const byId = new Map((args.updates as SpaceUpdate[]).map(u => [u.id, u]));
            byId.forEach((_, id) => findRoom(s.rooms, id));
            const rooms = s.rooms.map(r => {
                const u = byId.get(r.id);
                if (!u) return r;
                return {
                    ...r,
                    ...(u.name !== undefined ? { name: u.name } : {}),
                    ...(u.area !== undefined ? { area: u.area } : {}),
                    ...(u.zone !== undefined ? { zone: resolveZone(u.zone, s.zoneColors, newZones) } : {}),
                    ...(u.description !== undefined ? { description: u.description } : {}),
                    ...(u.spaceType !== undefined ? { spaceType: u.spaceType } : {}),
                };
            });
            return { result: { updated: byId.size }, changes: { rooms, newZones: [...newZones] }, undoable: true };
        }

        case 'place_spaces': {
            const floorIds = new Set(s.floors.map(f => f.id));
            const byId = new Map((args.placements as Placement[]).map(p => [p.id, p]));
            byId.forEach((p, id) => {
                findRoom(s.rooms, id);
                if (!floorIds.has(p.floor)) throw new BridgeError(`Floor ${p.floor} does not exist. Floors: ${[...floorIds].join(', ')}.`);
                if (!(p.width > 0 && p.height > 0)) throw new BridgeError(`Placement for "${id}" needs a positive width and height.`);
            });
            const rooms = s.rooms.map(r => {
                const p = byId.get(r.id);
                if (!p) return r;
                // Placements are rectangles; polygon/bubble outlines are replaced
                const { polygon: _polygon, ...rest } = r;
                return {
                    ...rest,
                    isPlaced: true,
                    floor: p.floor,
                    x: p.x * PX, y: p.y * PX,
                    width: p.width * PX, height: p.height * PX,
                    rotation: p.rotation || 0,
                    shape: 'rect' as const,
                };
            });
            const next = { ...s, rooms };
            const report = analyzeSite(s.siteProperties, rooms, s.floors, s.appSettings, PX);
            return {
                result: {
                    placed: byId.size,
                    ...(report ? { siteViolations: report.violations.filter(v => byId.has(v.roomId)).map(v => ({ space: v.roomName, problem: v.reason })) } : {}),
                    hint: 'Run check_layout to verify circulation and access.',
                },
                changes: { rooms: next.rooms },
                undoable: true,
            };
        }

        case 'draw_spaces': {
            const floorIds = new Set(s.floors.map(f => f.id));
            const byId = new Map((args.shapes as Drawing[]).map(d => [d.id, d]));
            const outlines = new Map<string, Point[]>();
            byId.forEach((d, id) => {
                const r = findRoom(s.rooms, id);
                if (!floorIds.has(d.floor)) throw new BridgeError(`Floor ${d.floor} does not exist. Floors: ${[...floorIds].join(', ')}.`);
                const pts = cleanOutline(d.outline);
                if (pts.length < 3) throw new BridgeError(`The outline for "${r.name}" needs at least 3 different points.`);
                if (selfCrossing(pts)) throw new BridgeError(`The outline for "${r.name}" crosses itself; list its points in order around the shape.`);
                if (polygonArea(pts) < 0.01) throw new BridgeError(`The outline for "${r.name}" encloses no area; list its points in order around the shape.`);
                outlines.set(id, pts);
            });
            const rooms = s.rooms.map(r => {
                const d = byId.get(r.id);
                if (!d) return r;
                // Stored like a shape drawn on the canvas: points in pixels relative to its origin (x, y), which
                // recenterShape then puts at the centre of gravity so the user can rotate it about its middle
                const pts = outlines.get(r.id)!;
                const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
                return recenterShape({
                    ...r,
                    isPlaced: true,
                    floor: d.floor,
                    x: minX * PX, y: minY * PX,
                    width: (Math.max(...pts.map(p => p.x)) - minX) * PX, height: (Math.max(...pts.map(p => p.y)) - minY) * PX,
                    rotation: 0,
                    shape: d.shape,
                    polygon: pts.map(p => ({ x: (p.x - minX) * PX, y: (p.y - minY) * PX })),
                    textPos: undefined,
                });
            });
            const report = analyzeSite(s.siteProperties, rooms, s.floors, s.appSettings, PX);
            return {
                result: {
                    drawn: rooms.filter(r => byId.has(r.id)).map(r => ({
                        id: r.id, name: r.name, shape: r.shape, programArea: r.area, drawnArea: round(polygonArea(roomWorldPolygon(r, PX)), 2),
                    })),
                    ...(report ? { siteViolations: report.violations.filter(v => byId.has(v.roomId)).map(v => ({ space: v.roomName, problem: v.reason })) } : {}),
                    hint: 'Run check_layout to verify circulation and access, and get_plan_image to see the shapes.',
                },
                changes: { rooms },
                undoable: true,
            };
        }

        case 'unplace_spaces': {
            const ids = new Set(args.ids as string[]);
            ids.forEach(id => findRoom(s.rooms, id));
            return { result: { unplaced: ids.size }, changes: { rooms: s.rooms.map(r => (ids.has(r.id) ? { ...r, isPlaced: false } : r)) }, undoable: true };
        }

        case 'remove_spaces': {
            const ids = new Set(args.ids as string[]);
            ids.forEach(id => findRoom(s.rooms, id));
            return { result: { removed: ids.size }, changes: { rooms: s.rooms.filter(r => !ids.has(r.id)) }, undoable: true };
        }

        case 'update_floors': {
            const updates = args.floors as FloorUpdate[];
            for (const u of updates) {
                if (!s.floors.some(f => f.id === u.id)) throw new BridgeError(`Floor ${u.id} does not exist.`);
                if (u.height !== undefined && !(u.height > 0)) throw new BridgeError('Floor height must be positive.');
            }
            const floors = s.floors.map(f => {
                const u = updates.find(x => x.id === f.id);
                return u ? { ...f, ...(u.label !== undefined ? { label: u.label } : {}), ...(u.height !== undefined ? { height: u.height } : {}) } : f;
            });
            return { result: { updated: updates.length }, changes: { floors }, undoable: true };
        }

        case 'set_site': {
            const a = args as SiteUpdate;
            const site = { ...s.siteProperties };
            if (a.boundary) {
                if (a.boundary.length < 3) throw new BridgeError('A site boundary needs at least 3 corners.');
                site.boundary = a.boundary.map(p => ({ x: p.x, y: p.y }));
                // Per-edge setbacks belong to the old edges
                if (site.constraints && !a.constraints?.edgeSetbacks) site.constraints = { ...site.constraints, edgeSetbacks: [] };
                site.geoAnchor = undefined;
            }
            if (a.northAngle !== undefined) site.northAngle = ((a.northAngle % 360) + 360) % 360;
            if (a.constraints) site.constraints = { defaultSetback: 0, ...site.constraints, ...a.constraints };
            if (a.noBuildZones) {
                site.zones = a.noBuildZones.map((z, i) => {
                    if (z.points.length < 3) throw new BridgeError(`No-build zone "${z.name}" needs at least 3 corners.`);
                    return { id: `zone-ai-${Date.now().toString(36)}-${i}`, name: z.name, points: z.points.map(p => ({ x: p.x, y: p.y })) };
                });
            }
            const report = analyzeSite(site, s.rooms, s.floors, s.appSettings, PX);
            return {
                result: report ? { siteArea: round(report.siteArea, 1), buildableArea: round(report.buildableArea, 1), violations: report.violations.length } : { ok: true },
                changes: { siteProperties: site },
                undoable: true,
            };
        }

        case 'show_floor': {
            const floor = args.floor as number;
            if (!s.floors.some(f => f.id === floor)) throw new BridgeError(`Floor ${floor} does not exist.`);
            return { result: { currentFloor: floor }, changes: { currentFloor: floor } };
        }

        default:
            throw new BridgeError(`Unknown command "${tool}".`);
    }
};
