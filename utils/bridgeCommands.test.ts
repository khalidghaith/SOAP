import { describe, it, expect } from 'vitest';
import { runBridgeCommand, classifyClient, BridgeState, BridgeError } from './bridgeCommands';
import { FLOORS, ZONE_COLORS, Room } from '../types';

const PX = 20;
const room = (id: string, extra: Partial<Room> = {}): Room => ({
    id, name: id, area: 20, zone: 'Public', isPlaced: false, floor: 0, x: 0, y: 0, width: 4 * PX, height: 5 * PX, ...extra,
});
const state = (over: Partial<BridgeState> = {}): BridgeState => ({
    projectName: 'Test',
    rooms: [room('a'), room('b', { isPlaced: true, x: 2 * PX, y: 3 * PX })],
    floors: FLOORS,
    currentFloor: 0,
    zoneColors: ZONE_COLORS,
    siteProperties: { locationName: 'X', latitude: 0, longitude: 0, northAngle: 0 },
    ...over,
});

describe('classifyClient', () => {
    it('maps reported client names to switches', () => {
        expect(classifyClient('claude-ai')).toBe('claude');
        expect(classifyClient('claude-code')).toBe('claude');
        expect(classifyClient('gemini-cli-mcp-client')).toBe('gemini');
        expect(classifyClient('openai-mcp')).toBe('chatgpt');
        expect(classifyClient('cursor-vscode')).toBe('other');
        expect(classifyClient(undefined)).toBe('other');
    });
});

describe('get_project', () => {
    it('describes spaces in meters', () => {
        const { result, changes } = runBridgeCommand('get_project', {}, state()) as { result: any; changes?: unknown };
        expect(changes).toBeUndefined();
        const b = result.spaces.find((s: any) => s.id === 'b');
        expect(b).toMatchObject({ placed: true, floor: 0, x: 2, y: 3, width: 4, height: 5, drawnArea: 20 });
        expect(result.spaces.find((s: any) => s.id === 'a')).toEqual({ id: 'a', name: 'a', zone: 'Public', programArea: 20, placed: false });
        expect(result.zones).not.toContain('Default');
    });

    it('describes drawn and rotated spaces by their outline', () => {
        // An L drawn from a 10 × 10 m rectangle: the stored width/height is stale
        const L = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 }].map(p => ({ x: p.x * PX, y: p.y * PX }));
        const s = state({ rooms: [
            room('l', { isPlaced: true, x: 1 * PX, y: 2 * PX, width: 10 * PX, height: 10 * PX, polygon: L, shape: 'polygon' }),
            room('r', { isPlaced: true, x: 0, y: 0, width: 4 * PX, height: 2 * PX, rotation: 90 }),
        ] });
        const { result } = runBridgeCommand('get_project', {}, s) as { result: any };
        const l = result.spaces.find((x: any) => x.id === 'l');
        expect(l).toMatchObject({ shape: 'polygon', x: 1, y: 2, width: 8, height: 8, drawnArea: 48 });
        expect(l.outline).toEqual([{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 10 }, { x: 1, y: 10 }]);
        const r = result.spaces.find((x: any) => x.id === 'r');
        expect(r).toMatchObject({ shape: 'rect', rotation: 90, drawnArea: 8 });
        // Turned about its centre (2, 1): now 2 wide and 4 tall
        const xs = r.outline.map((p: any) => p.x), ys = r.outline.map((p: any) => p.y);
        expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([1, 3, -1, 3]);
    });
});

describe('add_spaces', () => {
    it('adds unplaced spaces, matching zones case-insensitively and creating new ones', () => {
        const out = runBridgeCommand('add_spaces', { spaces: [
            { name: 'Kitchen', area: 16, zone: 'service' },
            { name: 'Studio', area: 25, zone: 'Workshop' },
            { name: 'Stair', area: 9, vcType: 'stair' },
        ] }, state());
        const rooms = out.changes!.rooms!;
        expect(out.undoable).toBe(true);
        expect(rooms).toHaveLength(5);
        const [k, st, stair] = rooms.slice(2);
        expect(k).toMatchObject({ name: 'Kitchen', zone: 'Service', isPlaced: false, width: 80, height: 80 });
        expect(st.zone).toBe('Workshop');
        expect(stair).toMatchObject({ spaceType: 'verticalConnection', vcType: 'stair', zone: 'Default' });
        expect(out.changes!.newZones).toEqual(['Workshop']);
        expect(new Set(rooms.map(r => r.id)).size).toBe(5);
    });
});

describe('draw_spaces', () => {
    const L = [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 9, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 10 }, { x: 1, y: 10 }];
    // 8 points around an ellipse 6 × 4 m centred on (10, 10)
    const ellipse = Array.from({ length: 8 }, (_, i) => ({ x: 10 + 3 * Math.cos((i * Math.PI) / 4), y: 10 + 2 * Math.sin((i * Math.PI) / 4) }));

    it('stores a polygon like one drawn on the canvas and keeps the program area', () => {
        const s = state({ rooms: [room('a', { area: 50, rotation: 30 })] });
        const out = runBridgeCommand('draw_spaces', { shapes: [{ id: 'a', floor: 1, shape: 'polygon', outline: L }] }, s) as any;
        const a = out.changes.rooms[0] as Room;
        expect(a).toMatchObject({ isPlaced: true, floor: 1, shape: 'polygon', rotation: 0, area: 50, width: 8 * PX, height: 8 * PX });
        // Origin (the rotation pivot) at the L's centre of gravity: (4⅓, 5⅓) m
        expect(a.x / PX).toBeCloseTo(13 / 3, 9);
        expect(a.y / PX).toBeCloseTo(16 / 3, 9);
        a.polygon!.forEach((p, i) => {
            expect(a.x + p.x).toBeCloseTo(L[i].x * PX, 9);
            expect(a.y + p.y).toBeCloseTo(L[i].y * PX, 9);
        });
        expect(out.undoable).toBe(true);
        expect(out.result.drawn).toEqual([{ id: 'a', name: 'a', shape: 'polygon', programArea: 50, drawnArea: 48 }]);
        // get_project hands the same outline back
        const { result } = runBridgeCommand('get_project', {}, state({ rooms: [a] })) as any;
        expect(result.spaces[0]).toMatchObject({ shape: 'polygon', outline: L, drawnArea: 48 });
    });

    it('draws bubbles as a smooth curve through the points', () => {
        const s = state({ rooms: [room('g', { area: 18 })] });
        const out = runBridgeCommand('draw_spaces', { shapes: [{ id: 'g', floor: 0, shape: 'bubble', outline: ellipse }] }, s) as any;
        const g = out.changes.rooms[0] as Room;
        expect(g.shape).toBe('bubble');
        // Close to the ellipse's own area (π·3·2 ≈ 18.85), not the 8-sided polygon's (≈ 16.97)
        expect(out.result.drawn[0].drawnArea).toBeGreaterThan(18.3);
        expect(out.result.drawn[0].drawnArea).toBeLessThan(19.2);
        const { result } = runBridgeCommand('get_project', {}, state({ rooms: [g] })) as any;
        expect(result.spaces[0].outline).toHaveLength(8);
        expect(result.spaces[0].outline[0]).toEqual({ x: 13, y: 10 });
        expect(result.spaces[0].drawnArea).toBe(out.result.drawn[0].drawnArea);
    });

    it('ignores a repeated closing point', () => {
        const out = runBridgeCommand('draw_spaces', { shapes: [{ id: 'a', floor: 0, shape: 'polygon', outline: [...L, L[0]] }] }, state()) as any;
        expect(out.changes.rooms.find((r: Room) => r.id === 'a').polygon).toHaveLength(6);
    });

    it('refuses outlines that cross themselves, enclose nothing or use unknown floors', () => {
        const bowtie = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
        const draw = (outline: object[], floor = 0) => () => runBridgeCommand('draw_spaces', { shapes: [{ id: 'a', floor, shape: 'polygon', outline }] }, state());
        expect(draw(bowtie)).toThrow(/crosses itself/);
        expect(draw([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }])).toThrow(/encloses no area/);
        expect(draw([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 2 }])).toThrow(/at least 3 different points/);
        expect(draw(L, 99)).toThrow(/Floor 99 does not exist/);
    });
});

describe('place_spaces', () => {
    it('places rectangles in meters and replaces polygon outlines', () => {
        const s = state({ rooms: [room('a', { polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], shape: 'polygon' })] });
        const out = runBridgeCommand('place_spaces', { placements: [{ id: 'a', floor: 1, x: 1.5, y: 2, width: 4, height: 3 }] }, s);
        const a = out.changes!.rooms![0];
        expect(a).toMatchObject({ isPlaced: true, floor: 1, x: 30, y: 40, width: 80, height: 60, shape: 'rect', rotation: 0 });
        expect(a.polygon).toBeUndefined();
    });

    it('reports site problems for the placed spaces', () => {
        const s = state({ siteProperties: {
            locationName: '', latitude: 0, longitude: 0, northAngle: 0,
            boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], constraints: { defaultSetback: 2 },
        } });
        const out = runBridgeCommand('place_spaces', { placements: [{ id: 'a', floor: 0, x: 0, y: 0, width: 4, height: 4 }] }, s) as any;
        expect(out.result.siteViolations).toEqual([{ space: 'a', problem: 'outsideSetback' }]);
    });

    it('rejects unknown ids and floors with a helpful message', () => {
        expect(() => runBridgeCommand('place_spaces', { placements: [{ id: 'zz', floor: 0, x: 0, y: 0, width: 1, height: 1 }] }, state())).toThrow(/get_project/);
        expect(() => runBridgeCommand('place_spaces', { placements: [{ id: 'a', floor: 9, x: 0, y: 0, width: 1, height: 1 }] }, state())).toThrow(BridgeError);
    });
});

describe('other edits', () => {
    it('updates, unplaces and removes spaces', () => {
        const up = runBridgeCommand('update_spaces', { updates: [{ id: 'a', name: 'Lounge', area: 30 }] }, state());
        expect(up.changes!.rooms![0]).toMatchObject({ name: 'Lounge', area: 30 });
        expect(runBridgeCommand('unplace_spaces', { ids: ['b'] }, state()).changes!.rooms![1].isPlaced).toBe(false);
        expect(runBridgeCommand('remove_spaces', { ids: ['a'] }, state()).changes!.rooms!.map(r => r.id)).toEqual(['b']);
    });

    it('updates floors and switches the visible floor without an undo step', () => {
        expect(runBridgeCommand('update_floors', { floors: [{ id: 1, height: 3.2 }] }, state()).changes!.floors!.find(f => f.id === 1)!.height).toBe(3.2);
        const show = runBridgeCommand('show_floor', { floor: 1 }, state());
        expect(show.changes).toEqual({ currentFloor: 1 });
        expect(show.undoable).toBeFalsy();
    });

    it('sets the site, resetting per-edge setbacks when the boundary changes', () => {
        const s = state({ siteProperties: { locationName: '', latitude: 0, longitude: 0, northAngle: 0, constraints: { defaultSetback: 3, edgeSetbacks: [1, 2, 3, 4] } } });
        const out = runBridgeCommand('set_site', {
            boundary: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }],
            northAngle: -30,
            constraints: { maxFAR: 1.5 },
            noBuildZones: [{ name: 'Easement', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
        }, s) as any;
        const site = out.changes.siteProperties;
        expect(site.northAngle).toBe(330);
        expect(site.constraints).toEqual({ defaultSetback: 3, edgeSetbacks: [], maxFAR: 1.5 });
        expect(site.zones[0].name).toBe('Easement');
        expect(out.result.siteArea).toBe(200);
    });

    it('rejects unknown commands', () => {
        expect(() => runBridgeCommand('format_disk', {}, state())).toThrow(/Unknown command/);
    });
});
