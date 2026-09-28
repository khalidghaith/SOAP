import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Point, Room, SiteProperties, SiteZone, CanvasGuide } from '../types';
import { buildableArea, roomWorldPolygon, SiteViolation } from '../utils/site';
import { snapPoint, guideToLine, pointAtDistance, SnapContext, SnapKind, SnapResult } from '../utils/siteSnap';

export type SiteTool = 'select' | 'boundary' | 'zone';

export interface SiteSelection {
    kind: 'boundary' | 'zone';
    zoneId?: string;
    edge?: number;   // boundary edge index (edge i runs from vertex i to i+1)
    vertex?: number;
}

export interface SiteSnapSettings {
    enabled: boolean;      // global snapping switch
    grid: number;          // meters; 0 = grid snapping off
    objects: boolean;      // corners, midpoints and edges of the site, zones and rooms
    guides: boolean;       // canvas guides
    tolerancePx: number;   // screen pixels
}

interface SiteLayerProps {
    site: SiteProperties;
    rooms: Room[];
    guides: CanvasGuide[];
    currentFloor: number;
    violations: SiteViolation[];
    scale: number;
    pixelsPerMeter: number;
    isSiteMode: boolean;
    tool: SiteTool;
    selection: SiteSelection | null;
    snap: SiteSnapSettings;
    darkMode: boolean;
    toWorld: (clientX: number, clientY: number) => Point; // returns world pixels
    onSelect: (s: SiteSelection | null) => void;
    onToolChange: (t: SiteTool) => void;
    onInteractionStart: () => void; // record undo before a change
    onChange: (updates: Partial<SiteProperties>) => void;
    onMoveSite: (dx: number, dy: number) => void; // meters
}

const zoneId = () => `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const roomOnFloor = (r: Room, f: number) => {
    if (r.floor === f) return true;
    const [a, b] = r.spaceType === 'verticalConnection' ? [r.vcFromFloor, r.vcToFloor]
        : r.spaceType === 'multistory' ? [r.msFromFloor, r.msToFloor] : [undefined, undefined];
    if (a === undefined && b === undefined) return false;
    const lo = Math.min(a ?? r.floor, b ?? r.floor), hi = Math.max(a ?? r.floor, b ?? r.floor);
    return f >= lo && f <= hi;
};

const fmt = (m: number) => (m >= 100 ? m.toFixed(1) : m.toFixed(2));

const SNAP_LABEL: Record<SnapKind, string> = {
    endpoint: 'Endpoint', midpoint: 'Midpoint', intersection: 'Intersection', edge: 'On edge',
    guide: 'Guide', grid: 'Grid', angle: 'Angle', align: 'Aligned',
};

// Which vertex is being dragged, so it doesn't snap to itself or its own edges
interface SnapExclude { kind: 'boundary' | 'zone'; zoneId?: string; vertex: number }

export const SiteLayer: React.FC<SiteLayerProps> = ({
    site, rooms, guides, currentFloor, violations, scale, pixelsPerMeter: PX, isSiteMode, tool, selection, snap: snapSettings, darkMode,
    toWorld, onSelect, onToolChange, onInteractionStart, onChange, onMoveSite,
}) => {
    const [draft, setDraft] = useState<Point[]>([]);
    const [cursor, setCursor] = useState<Point | null>(null);
    const [snapInfo, setSnapInfo] = useState<SnapResult | null>(null);
    const [typed, setTyped] = useState(''); // a length typed while drawing
    // `recorded`: undo history is taken on the first real movement, so a plain click doesn't add an empty step
    const drag = useRef<{ type: 'vertex' | 'move' | 'moveZone'; target: SiteSelection; last: Point; recorded: boolean } | null>(null);

    const boundary = site.boundary && site.boundary.length >= 3 ? site.boundary : null;
    const zones = site.zones || [];
    const buildable = useMemo(() => buildableArea(site), [site]);
    const drawing = isSiteMode && tool !== 'select';

    // Snap targets that don't change while the pointer moves
    const roomOutlines = useMemo(
        () => rooms.filter(r => r.isPlaced && roomOnFloor(r, currentFloor)).map(r => roomWorldPolygon(r, PX)),
        [rooms, currentFloor, PX]
    );
    const guideLines = useMemo(() => guides.map(guideToLine), [guides]);

    const buildContext = (base: Point | null, prevDir: Point | null, exclude: SnapExclude | null, shift: boolean): SnapContext => {
        const vertices: Point[] = [];
        const segments: [Point, Point][] = [];
        const addRing = (pts: Point[], closed: boolean, skipVertex?: number) => {
            const n = pts.length;
            pts.forEach((p, i) => { if (i !== skipVertex) vertices.push(p); });
            for (let i = 0; i < (closed ? n : n - 1); i++) {
                const j = (i + 1) % n;
                if (skipVertex !== undefined && (i === skipVertex || j === skipVertex)) continue;
                segments.push([pts[i], pts[j]]);
            }
        };
        if (boundary) addRing(boundary, true, exclude?.kind === 'boundary' ? exclude.vertex : undefined);
        zones.forEach(z => addRing(z.points, true, exclude?.kind === 'zone' && exclude.zoneId === z.id ? exclude.vertex : undefined));
        roomOutlines.forEach(poly => addRing(poly, true));
        if (draft.length) addRing(draft, false);
        return {
            tolerance: snapSettings.tolerancePx / (scale * PX),
            vertices,
            segments,
            guides: snapSettings.guides ? guideLines : [],
            grid: snapSettings.grid,
            base,
            prevDir,
            forceAngle: shift,
            objects: snapSettings.objects,
        };
    };

    const worldMeters = (e: { clientX: number; clientY: number }) => {
        const w = toWorld(e.clientX, e.clientY);
        return { x: w.x / PX, y: w.y / PX };
    };

    // Snaps a pointer position. Alt places the point freely; Shift locks to the nearest tracking angle.
    const snapEvent = (e: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }, base: Point | null, prevDir: Point | null, exclude: SnapExclude | null): SnapResult => {
        const raw = worldMeters(e);
        if (e.altKey || !snapSettings.enabled) {
            // Shift still locks the angle when snapping is off
            if (e.shiftKey && base) return snapPoint(raw, { tolerance: 0, vertices: [], segments: [], guides: [], grid: 0, base, prevDir, forceAngle: true, objects: false });
            return { point: raw, kind: null, trackers: [] };
        }
        return snapPoint(raw, buildContext(base, prevDir, exclude, e.shiftKey));
    };

    const draftBase = () => (draft.length ? draft[draft.length - 1] : null);
    const draftPrevDir = () => draft.length >= 2
        ? { x: draft[draft.length - 1].x - draft[draft.length - 2].x, y: draft[draft.length - 1].y - draft[draft.length - 2].y }
        : null;

    // Neighbours of a dragged vertex give tracking from both sides (e.g. keep the corner square)
    const vertexNeighbours = (pts: Point[], i: number) => ({ prev: pts[(i - 1 + pts.length) % pts.length], next: pts[(i + 1) % pts.length] });

    // Leaving a drawing tool discards an unfinished shape
    useEffect(() => { setDraft([]); setCursor(null); setSnapInfo(null); setTyped(''); }, [tool, isSiteMode]);

    const finishDraft = (pts: Point[]) => {
        if (pts.length < 3) return;
        onInteractionStart();
        if (tool === 'boundary') {
            // A new boundary invalidates per-edge setbacks keyed to the old edges
            const constraints = site.constraints ? { ...site.constraints, edgeSetbacks: [] } : undefined;
            onChange({ boundary: pts, constraints, geoAnchor: undefined });
            onSelect({ kind: 'boundary' });
        } else {
            const zone: SiteZone = { id: zoneId(), name: `No-build zone ${zones.length + 1}`, points: pts };
            onChange({ zones: [...zones, zone] });
            onSelect({ kind: 'zone', zoneId: zone.id });
        }
        setDraft([]);
        setTyped('');
        setSnapInfo(null);
        onToolChange('select');
    };

    const addDraftPoint = (p: Point) => {
        const last = draft[draft.length - 1];
        if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-6) return;
        setDraft(d => [...d, p]);
    };

    // Keyboard: type a length + Enter to place the next corner exactly; Enter closes the shape, Esc cancels,
    // Backspace removes the last point (or the selected vertex/zone when not drawing)
    useEffect(() => {
        if (!isSiteMode) return;
        const onKey = (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
            if (drawing && draft.length) {
                if (/^[0-9.,]$/.test(e.key)) { e.preventDefault(); setTyped(t => t + (e.key === ',' ? '.' : e.key)); return; }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const length = parseFloat(typed);
                    if (typed && Number.isFinite(length) && length > 0) {
                        const base = draft[draft.length - 1];
                        const toward = cursor && Math.hypot(cursor.x - base.x, cursor.y - base.y) > 1e-6 ? cursor : null;
                        const p = toward ? pointAtDistance(base, toward, length) : null;
                        if (p) addDraftPoint(p);
                        setTyped('');
                    } else finishDraft(draft);
                    return;
                }
                if (e.key === 'Escape') { e.preventDefault(); if (typed) setTyped(''); else setDraft([]); return; }
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    if (typed) setTyped(t => t.slice(0, -1));
                    else setDraft(d => d.slice(0, -1));
                }
                return;
            }
            if (e.key === 'Escape' && drawing) { onToolChange('select'); return; }
            if ((e.key === 'Backspace' || e.key === 'Delete') && selection) {
                e.preventDefault();
                if (selection.vertex !== undefined) {
                    const pts = selection.kind === 'boundary' ? boundary : zones.find(z => z.id === selection.zoneId)?.points;
                    if (!pts || pts.length <= 3) return;
                    onInteractionStart();
                    const next = pts.filter((_, i) => i !== selection.vertex);
                    if (selection.kind === 'boundary') {
                        // Removing vertex v merges edges v-1 and v; keep the setback of edge v-1
                        const eds = site.constraints?.edgeSetbacks;
                        const constraints = eds ? { ...site.constraints!, edgeSetbacks: eds.filter((_, i) => i !== selection.vertex) } : site.constraints;
                        onChange({ boundary: next, constraints });
                    } else {
                        onChange({ zones: zones.map(z => z.id === selection.zoneId ? { ...z, points: next } : z) });
                    }
                    onSelect({ ...selection, vertex: undefined });
                } else if (selection.kind === 'zone') {
                    onInteractionStart();
                    onChange({ zones: zones.filter(z => z.id !== selection.zoneId) });
                    onSelect(null);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Vertex and whole-site dragging
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const d = drag.current;
            if (!d) return;
            if (d.type === 'move' || d.type === 'moveZone') {
                // Moves keep to grid steps when grid snapping is on
                const p = worldMeters(e);
                const g = snapSettings.enabled && !e.altKey ? snapSettings.grid : 0;
                const step = (v: number) => (g > 0 ? Math.round(v / g) * g : v);
                const s = { x: step(p.x - d.last.x), y: step(p.y - d.last.y) };
                if (s.x === 0 && s.y === 0) return;
                if (!d.recorded) { onInteractionStart(); d.recorded = true; }
                d.last = { x: d.last.x + s.x, y: d.last.y + s.y };
                if (d.type === 'move') onMoveSite(s.x, s.y);
                else onChange({ zones: zones.map(z => z.id === d.target.zoneId ? { ...z, points: z.points.map(q => ({ x: q.x + s.x, y: q.y + s.y })) } : z) });
                return;
            }
            const i = d.target.vertex!;
            const pts = d.target.kind === 'boundary' ? boundary : zones.find(z => z.id === d.target.zoneId)?.points;
            if (!pts) return;
            const { prev, next } = vertexNeighbours(pts, i);
            const exclude: SnapExclude = { kind: d.target.kind, zoneId: d.target.zoneId, vertex: i };
            // Track from the previous corner first; fall back to the next one
            let r = snapEvent(e, prev, null, exclude);
            if (!r.kind || r.kind === 'grid') {
                const r2 = snapEvent(e, next, null, exclude);
                if (r2.kind && r2.kind !== 'grid') r = r2;
            }
            setSnapInfo(r);
            const q = r.point;
            if (q.x === pts[i].x && q.y === pts[i].y) return;
            if (!d.recorded) { onInteractionStart(); d.recorded = true; }
            if (d.target.kind === 'boundary') {
                onChange({ boundary: pts.map((v, k) => (k === i ? q : v)) });
            } else {
                onChange({ zones: zones.map(z => z.id === d.target.zoneId ? { ...z, points: z.points.map((v, k) => (k === i ? q : v)) } : z) });
            }
        };
        const onUp = () => {
            if (drag.current) {
                document.body.style.cursor = '';
                setSnapInfo(null);
            }
            drag.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    });

    const stop = (e: React.MouseEvent) => { if (e.button === 0) e.stopPropagation(); };

    const handleBackgroundDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // right/middle drag still pans the canvas
        e.stopPropagation();
        if (!drawing) { onSelect(null); return; }
        const r = snapEvent(e, draftBase(), draftPrevDir(), null);
        const p = r.point;
        // Clicking the first point closes the shape
        if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) * PX * scale < 10) {
            finishDraft(draft);
            return;
        }
        if (e.detail >= 2 && draft.length >= 3) { finishDraft(draft); return; } // double-click
        setTyped('');
        addDraftPoint(p);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!drawing) return;
        const r = snapEvent(e, draftBase(), draftPrevDir(), null);
        setCursor(r.point);
        setSnapInfo(r);
    };

    const startVertexDrag = (e: React.MouseEvent, target: SiteSelection) => {
        if (e.button !== 0 || !isSiteMode || tool !== 'select') return;
        e.stopPropagation();
        onSelect(target);
        drag.current = { type: 'vertex', target, last: worldMeters(e), recorded: false };
        document.body.style.cursor = 'grabbing';
    };

    // Dragging the boundary moves the whole site; dragging a zone moves just that zone
    const startMove = (e: React.MouseEvent, target: SiteSelection) => {
        if (e.button !== 0 || !isSiteMode || tool !== 'select') return;
        e.stopPropagation();
        onSelect(target);
        drag.current = { type: target.kind === 'zone' ? 'moveZone' : 'move', target, last: worldMeters(e), recorded: false };
        document.body.style.cursor = 'move';
    };

    // Double-clicking an edge inserts a vertex there (on the edge itself)
    const insertVertex = (e: React.MouseEvent, kind: 'boundary' | 'zone', edge: number, zId?: string) => {
        if (!isSiteMode || tool !== 'select') return;
        e.stopPropagation();
        const pts = kind === 'boundary' ? boundary : zones.find(z => z.id === zId)?.points;
        if (!pts) return;
        const a = pts[edge], b = pts[(edge + 1) % pts.length];
        const raw = worldMeters(e);
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        const p = { x: a.x + dx * t, y: a.y + dy * t };
        onInteractionStart();
        if (kind === 'boundary' && boundary) {
            const next = [...boundary.slice(0, edge + 1), p, ...boundary.slice(edge + 1)];
            const eds = site.constraints?.edgeSetbacks;
            // The split edge's setback applies to both halves
            const constraints = eds && eds.length ? { ...site.constraints!, edgeSetbacks: [...eds.slice(0, edge + 1), eds[edge] ?? null, ...eds.slice(edge + 1)] } : site.constraints;
            onChange({ boundary: next, constraints });
            onSelect({ kind: 'boundary', vertex: edge + 1 });
        } else if (kind === 'zone' && zId) {
            onChange({ zones: zones.map(z => z.id === zId ? { ...z, points: [...z.points.slice(0, edge + 1), p, ...z.points.slice(edge + 1)] } : z) });
            onSelect({ kind: 'zone', zoneId: zId, vertex: edge + 1 });
        }
    };

    const toPath = (pts: Point[], close = true) =>
        pts.map((p, i) => `${i ? 'L' : 'M'}${p.x * PX},${p.y * PX}`).join(' ') + (close ? ' Z' : '');

    const u = 1 / scale; // one screen pixel in world pixels
    const lineColor = darkMode ? '#e2e8f0' : '#1e293b';
    const setbackColor = '#f97316';
    const zoneColor = '#dc2626';
    const selectColor = '#2563eb';
    const labelFont = 10 * u;
    const edgeHit = Math.max(8 * u, 0.3 * PX);

    const edgeLabel = (a: Point, b: Point, key: string, text?: string) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len * PX * scale < 40) return null; // too short to label on screen
        const mx = ((a.x + b.x) / 2) * PX, my = ((a.y + b.y) / 2) * PX;
        let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        if (angle > 90 || angle < -90) angle += 180; // keep text upright
        return (
            <g key={key} transform={`translate(${mx},${my}) rotate(${angle})`} style={{ pointerEvents: 'none' }}>
                <text y={-5 * u} textAnchor="middle" fontSize={labelFont} fontWeight={600} fill={lineColor}
                    stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={3 * u} paintOrder="stroke" fontFamily="ui-sans-serif, system-ui">
                    {text ?? `${fmt(len)} m`}
                </text>
            </g>
        );
    };

    const handles = (pts: Point[], target: Omit<SiteSelection, 'vertex'>) => pts.map((p, i) => {
        const active = selection?.vertex === i && selection.kind === target.kind && selection.zoneId === target.zoneId;
        return (
            <rect key={`h${i}`} x={p.x * PX - 5 * u} y={p.y * PX - 5 * u} width={10 * u} height={10 * u}
                fill={active ? selectColor : '#ffffff'} stroke={selectColor} strokeWidth={1.5 * u}
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onMouseDown={e => startVertexDrag(e, { ...target, vertex: i })} />
        );
    });

    const boundarySelected = selection?.kind === 'boundary';
    const floorViolations = violations.filter(v => {
        const r = rooms.find(x => x.id === v.roomId);
        return r && roomOnFloor(r, currentFloor);
    });

    const draftPts = cursor && drawing ? [...draft, cursor] : draft;

    return (
        <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ pointerEvents: 'none' }} onMouseMove={handleMouseMove}>
            <defs>
                <pattern id="site-zone-hatch" patternUnits="userSpaceOnUse" width={0.75 * PX} height={0.75 * PX} patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={0.75 * PX} stroke={zoneColor} strokeWidth={0.06 * PX} strokeOpacity={0.6} />
                </pattern>
            </defs>

            {/* Captures clicks for drawing/deselecting while in site mode */}
            {isSiteMode && (
                <rect x={-1e6} y={-1e6} width={2e6} height={2e6} fill="transparent"
                    style={{ pointerEvents: 'all', cursor: drawing ? 'crosshair' : 'default' }}
                    onMouseDown={handleBackgroundDown} />
            )}

            {/* No-build zones */}
            {zones.map(z => {
                if (z.points.length < 3) return null;
                const selected = selection?.kind === 'zone' && selection.zoneId === z.id;
                const c = z.points.reduce((s, p) => ({ x: s.x + p.x / z.points.length, y: s.y + p.y / z.points.length }), { x: 0, y: 0 });
                return (
                    <g key={z.id}>
                        <path d={toPath(z.points)} fill="url(#site-zone-hatch)" fillOpacity={0.9}
                            stroke={selected ? selectColor : zoneColor} strokeWidth={(selected ? 2 : 1.25) * u} strokeDasharray={`${6 * u},${3 * u}`}
                            style={{ pointerEvents: isSiteMode && tool === 'select' ? 'all' : 'none', cursor: 'move' }}
                            onMouseDown={e => startMove(e, { kind: 'zone', zoneId: z.id })} />
                        {isSiteMode && tool === 'select' && z.points.map((p, i) => {
                            const q = z.points[(i + 1) % z.points.length];
                            return <line key={`e${i}`} x1={p.x * PX} y1={p.y * PX} x2={q.x * PX} y2={q.y * PX} stroke="transparent" strokeWidth={edgeHit}
                                style={{ pointerEvents: 'stroke', cursor: 'copy' }} onMouseDown={stop}
                                onDoubleClick={e => insertVertex(e, 'zone', i, z.id)} />;
                        })}
                        <text x={c.x * PX} y={c.y * PX} textAnchor="middle" dominantBaseline="middle" fontSize={labelFont} fontWeight={700}
                            fill={zoneColor} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={3 * u} paintOrder="stroke"
                            fontFamily="ui-sans-serif, system-ui" style={{ pointerEvents: 'none' }}>{z.name}</text>
                        {selected && isSiteMode && tool === 'select' && handles(z.points, { kind: 'zone', zoneId: z.id })}
                    </g>
                );
            })}

            {/* Setback (buildable) line */}
            {boundary && buildable && site.constraints && buildable.some((p, i) => p.x !== boundary[i]?.x || p.y !== boundary[i]?.y) && (
                <path d={toPath(buildable)} fill={setbackColor} fillOpacity={isSiteMode ? 0.05 : 0}
                    stroke={setbackColor} strokeWidth={1.5 * u} strokeDasharray={`${8 * u},${4 * u}`} style={{ pointerEvents: 'none' }} />
            )}

            {/* Property line */}
            {boundary && (
                <g>
                    <path d={toPath(boundary)} fill={isSiteMode ? (darkMode ? '#ffffff' : '#0f172a') : 'none'} fillOpacity={boundarySelected ? 0.06 : 0.03}
                        stroke={boundarySelected ? selectColor : lineColor} strokeWidth={2.25 * u}
                        strokeDasharray={`${14 * u},${4 * u},${3 * u},${4 * u}`}
                        style={{ pointerEvents: isSiteMode && tool === 'select' ? 'visiblePainted' : 'none', cursor: 'move' }}
                        onMouseDown={e => startMove(e, { kind: 'boundary' })} />
                    {boundary.map((p, i) => {
                        const q = boundary[(i + 1) % boundary.length];
                        const edgeSelected = boundarySelected && selection?.edge === i;
                        return (
                            <g key={`edge${i}`}>
                                {edgeSelected && <line x1={p.x * PX} y1={p.y * PX} x2={q.x * PX} y2={q.y * PX} stroke={selectColor} strokeWidth={4 * u} strokeOpacity={0.6} style={{ pointerEvents: 'none' }} />}
                                {isSiteMode && tool === 'select' && (
                                    <line x1={p.x * PX} y1={p.y * PX} x2={q.x * PX} y2={q.y * PX} stroke="transparent" strokeWidth={edgeHit}
                                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                        onMouseDown={e => { if (e.button === 0) { e.stopPropagation(); onSelect({ kind: 'boundary', edge: i }); } }}
                                        onDoubleClick={e => insertVertex(e, 'boundary', i)} />
                                )}
                                {edgeLabel(p, q, `len${i}`)}
                            </g>
                        );
                    })}
                    {isSiteMode && tool === 'select' && boundarySelected && handles(boundary, { kind: 'boundary' })}
                </g>
            )}

            {/* Rooms that break the site rules, on this floor */}
            {floorViolations.map(v => {
                const r = rooms.find(x => x.id === v.roomId)!;
                const poly = roomWorldPolygon(r, PX);
                return (
                    <path key={`v-${v.roomId}`} d={toPath(poly)} fill={zoneColor} fillOpacity={0.12} stroke={zoneColor}
                        strokeWidth={2.5 * u} strokeDasharray={`${5 * u},${3 * u}`} style={{ pointerEvents: 'none' }} />
                );
            })}

            {/* Shape being drawn */}
            {drawing && draftPts.length > 0 && (
                <g style={{ pointerEvents: 'none' }}>
                    <path d={toPath(draftPts, false)} fill="none" stroke={tool === 'zone' ? zoneColor : selectColor} strokeWidth={2 * u} />
                    {draftPts.length >= 3 && (
                        <line x1={draftPts[draftPts.length - 1].x * PX} y1={draftPts[draftPts.length - 1].y * PX} x2={draftPts[0].x * PX} y2={draftPts[0].y * PX}
                            stroke={tool === 'zone' ? zoneColor : selectColor} strokeWidth={1 * u} strokeDasharray={`${4 * u},${4 * u}`} />
                    )}
                    {draftPts.slice(1).map((p, i) => edgeLabel(draftPts[i], p, `d${i}`))}
                    {draft.map((p, i) => (
                        <circle key={i} cx={p.x * PX} cy={p.y * PX} r={(i === 0 && draft.length >= 3 ? 6 : 4) * u}
                            fill={i === 0 ? '#ffffff' : (tool === 'zone' ? zoneColor : selectColor)} stroke={tool === 'zone' ? zoneColor : selectColor} strokeWidth={1.5 * u} />
                    ))}
                </g>
            )}

            {/* Snapping feedback: tracking lines, snap marker, typed length */}
            {snapInfo && (drawing || drag.current) && (() => {
                const P = { x: snapInfo.point.x * PX, y: snapInfo.point.y * PX };
                const m = 6 * u;
                const snapColor = '#16a34a';
                const marker = (() => {
                    switch (snapInfo.kind) {
                        case 'endpoint': return <rect x={P.x - m} y={P.y - m} width={2 * m} height={2 * m} fill="none" stroke={snapColor} strokeWidth={2 * u} />;
                        case 'midpoint': return <path d={`M${P.x},${P.y - m * 1.2} L${P.x + m * 1.1},${P.y + m * 0.8} L${P.x - m * 1.1},${P.y + m * 0.8} Z`} fill="none" stroke={snapColor} strokeWidth={2 * u} />;
                        case 'intersection': return <path d={`M${P.x - m},${P.y - m} L${P.x + m},${P.y + m} M${P.x + m},${P.y - m} L${P.x - m},${P.y + m}`} stroke={snapColor} strokeWidth={2 * u} />;
                        case 'edge': case 'guide': return <path d={`M${P.x - m},${P.y + m} L${P.x + m},${P.y + m} M${P.x},${P.y - m} L${P.x},${P.y + m}`} stroke={snapColor} strokeWidth={2 * u} />;
                        case 'grid': return <circle cx={P.x} cy={P.y} r={m * 0.7} fill="none" stroke={snapColor} strokeWidth={1.5 * u} />;
                        case 'angle': case 'align': return <circle cx={P.x} cy={P.y} r={m * 0.5} fill={snapColor} />;
                        default: return null;
                    }
                })();
                const L = 1e5;
                return (
                    <g style={{ pointerEvents: 'none' }}>
                        {snapInfo.trackers.map((t, i) => {
                            const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y, l = Math.hypot(dx, dy) || 1;
                            return (
                                <line key={i}
                                    x1={(t.a.x - (dx / l) * L) * PX} y1={(t.a.y - (dy / l) * L) * PX}
                                    x2={(t.a.x + (dx / l) * L) * PX} y2={(t.a.y + (dy / l) * L) * PX}
                                    stroke="#3b82f6" strokeWidth={1.5 * u} strokeDasharray={`${6 * u},${4 * u}`} opacity={0.9} />
                            );
                        })}
                        {marker}
                        {(snapInfo.kind || typed) && (
                            <text x={P.x + 10 * u} y={P.y - 10 * u} fontSize={labelFont} fontWeight={700} fill={typed ? selectColor : snapColor}
                                stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth={3 * u} paintOrder="stroke" fontFamily="ui-sans-serif, system-ui">
                                {typed ? `${typed} m ↵` : SNAP_LABEL[snapInfo.kind!]}
                            </text>
                        )}
                    </g>
                );
            })()}
        </svg>
    );
};
