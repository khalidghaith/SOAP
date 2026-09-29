import { Room, Floor, SiteProperties, SiteConstraints, SpaceType, VCType, ZoneColor, AppSettings, Point } from '../types';
import { analyzeSite, roomWorldPolygon, polygonArea } from './site';
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

export const BRIDGE_PX_PER_METER = 20;
const PX = BRIDGE_PX_PER_METER;


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
    const range = (a?: number, b?: number) => {
        const lo = Math.min(a ?? r.floor, b ?? r.floor), hi = Math.max(a ?? r.floor, b ?? r.floor);
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    };
    if (r.spaceType === 'verticalConnection') return range(r.vcFromFloor, r.vcToFloor);
    if (r.spaceType === 'multistory') return range(r.msFromFloor, r.msToFloor);
    return [r.floor];
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
    // Drawn shapes: the stored width/height is the rectangle the room started as, so describe what was drawn
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return {
        ...placed,
        x: round(minX), y: round(minY),
        width: round(Math.max(...xs) - minX), height: round(Math.max(...ys) - minY),
        shape: r.shape === 'bubble' ? 'bubble' : 'polygon',
        outline: outline.map(p => ({ x: round(p.x), y: round(p.y) })),
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
export interface FloorUpdate { id: number; label?: string; height?: number }
export interface SiteUpdate {
    boundary?: Point[];
    northAngle?: number;
    constraints?: Partial<SiteConstraints>;
    noBuildZones?: { name: string; points: Point[] }[];
}

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
