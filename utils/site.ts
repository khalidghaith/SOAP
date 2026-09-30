import { Point, Room, Floor, SiteProperties, AppSettings } from '../types';
import { signedArea, polygonArea } from './geometry';
import { PIXELS_PER_METER, roomFloorRange } from './rooms';

export { signedArea, polygonArea };

// Site geometry is stored in world meters; rooms are stored in pixels (PIXELS_PER_METER).
const EPS = 1e-6;

// --- Polygon basics ---

export const polygonPerimeter = (pts: Point[]): number =>
    pts.reduce((sum, p, i) => sum + Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y), 0);

export const polygonCentroid = (pts: Point[]): Point => {
    const a = signedArea(pts);
    if (Math.abs(a) < EPS) {
        const n = pts.length || 1;
        return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const f = p.x * q.y - q.x * p.y;
        cx += (p.x + q.x) * f;
        cy += (p.y + q.y) * f;
    }
    return { x: cx / (6 * a), y: cy / (6 * a) };
};

const distToSegment = (p: Point, a: Point, b: Point): number => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Point in polygon; points on an edge count as inside. */
export const pointInPolygon = (p: Point, poly: Point[], tolerance = 1e-4): boolean => {
    for (let i = 0; i < poly.length; i++) {
        if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= tolerance) return true;
    }
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
};

/** True if segments ab and cd cross at a single interior point (touching does not count). */
const segmentsCross = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
};

const edgesCross = (a: Point[], b: Point[]): boolean => {
    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
        }
    }
    return false;
};

/** `inner` lies fully inside `outer` (edges may touch). */
export const polygonInside = (inner: Point[], outer: Point[]): boolean =>
    inner.every(p => pointInPolygon(p, outer)) && !edgesCross(inner, outer)
    // A concave outer can pass both tests while an inner edge's midpoint is outside
    && inner.every((p, i) => {
        const q = inner[(i + 1) % inner.length];
        return pointInPolygon({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, outer);
    });

/** The two polygons share interior area (touching edges does not count). */
export const polygonsOverlap = (a: Point[], b: Point[]): boolean => {
    if (edgesCross(a, b)) return true;
    const strictlyInside = (p: Point, poly: Point[]) => pointInPolygon(p, poly, -1) && poly.every((q, i) => distToSegment(p, q, poly[(i + 1) % poly.length]) > 1e-4);
    if (a.some(p => strictlyInside(p, b)) || b.some(p => strictlyInside(p, a))) return true;
    // Identical or edge-aligned shapes: compare centroids
    return strictlyInside(polygonCentroid(a), b) || strictlyInside(polygonCentroid(b), a);
};

// --- Setbacks ---

export const edgeSetback = (site: SiteProperties, edgeIndex: number): number => {
    const c = site.constraints;
    const override = c?.edgeSetbacks?.[edgeIndex];
    return typeof override === 'number' ? override : (c?.defaultSetback ?? 0);
};

/**
 * Offsets every edge of the boundary inward by its setback and intersects neighbouring offset lines.
 * Exact for convex sites and for concave ones where setbacks are small relative to the edges.
 * Returns null when the setbacks consume the whole site.
 */
export const insetPolygon = (pts: Point[], setbacks: number[]): Point[] | null => {
    const n = pts.length;
    if (n < 3) return null;
    if (setbacks.every(s => s === 0)) return pts.map(p => ({ ...p }));
    const area = signedArea(pts);
    const sign = area > 0 ? 1 : -1;

    // Offset line of each edge: point + direction
    const lines = pts.map((p, i) => {
        const q = pts[(i + 1) % n];
        const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const dx = (q.x - p.x) / len, dy = (q.y - p.y) / len;
        const nx = -dy * sign, ny = dx * sign; // inward normal
        const s = setbacks[i] ?? 0;
        return { p: { x: p.x + nx * s, y: p.y + ny * s }, d: { x: dx, y: dy } };
    });

    const intersect = (active: typeof lines) => active.map((l2, i) => {
        const l1 = active[(i - 1 + active.length) % active.length];
        const denom = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
        if (Math.abs(denom) < 1e-9) return l2.p; // collinear edges
        const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / denom;
        return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
    });

    // A short edge between two deep setbacks can be squeezed out entirely: its offset segment comes out
    // reversed. Drop such edges and re-intersect their neighbours until every edge keeps its direction.
    let active = lines;
    let out = intersect(active);
    for (let guard = 0; guard < n; guard++) {
        const reversed = active.map((l, i) => {
            const a = out[i], b = out[(i + 1) % out.length];
            return (b.x - a.x) * l.d.x + (b.y - a.y) * l.d.y < -EPS;
        });
        if (!reversed.includes(true)) break;
        if (reversed.every(Boolean)) return null;
        active = active.filter((_, i) => !reversed[i]);
        if (active.length < 3) return null;
        out = intersect(active);
    }

    // Setbacks larger than the site flip the winding or leave vertices outside the boundary
    const outArea = signedArea(out);
    if (Math.sign(outArea) !== Math.sign(area) || Math.abs(outArea) < EPS) return null;
    if (!out.every(p => pointInPolygon(p, pts, 1e-3))) return null;
    return out;
};

export const buildableArea = (site: SiteProperties): Point[] | null => {
    const b = site.boundary;
    if (!b || b.length < 3) return null;
    return insetPolygon(b, b.map((_, i) => edgeSetback(site, i)));
};

// --- Rotation ---

/** Rotates a point clockwise on screen (canvas y points down) by `deg` about `pivot`. */
export const rotatePoint = (p: Point, pivot: Point, deg: number): Point => {
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const dx = p.x - pivot.x, dy = p.y - pivot.y;
    return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
};

/** Normalises an angle to (-180, 180]. */
const normalizeDeg = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
};

/**
 * The clockwise rotation (degrees) that makes boundary edge `edge` horizontal along the bottom of the
 * site — the usual way to draw a plan with the street at the bottom.
 */
export const alignEdgeRotation = (boundary: Point[], edge: number): number => {
    const a = boundary[edge], b = boundary[(edge + 1) % boundary.length];
    const theta = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    // After rotating by -theta the edge runs left→right. With positive winding the site's interior then lies
    // below the edge (y down), so turn it round to put the edge at the bottom.
    return normalizeDeg(-theta + (signedArea(boundary) > 0 ? 180 : 0));
};

// --- Rooms ---

/**
 * The smooth closed curve a bubble room is drawn as (components/Bubble.tsx: Catmull-Rom through its points),
 * as a polygon with `steps` segments between neighbouring points.
 */
export const bubbleCurve = (pts: Point[], steps = 8): Point[] => {
    if (pts.length < 3) return pts;
    const out: Point[] = [];
    pts.forEach((p1, i) => {
        const p0 = pts[(i - 1 + pts.length) % pts.length], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        for (let j = 0; j < steps; j++) {
            const t = j / steps, u = 1 - t;
            out.push({
                x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
                y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
            });
        }
    });
    return out;
};

/**
 * A placed room's outline in world meters (rect, polygon or bubble curve, with rotation).
 * Matches the canvas (Bubble): the room's box is CSS-rotated about its centre, and polygon/bubble
 * rooms have a zero-size box, so they rotate about their origin (room.x, room.y).
 * `points: true` gives a bubble's points instead of its curve (what the user drags on the canvas).
 */
export const roomWorldPolygon = (r: Room, pxPerMeter = PIXELS_PER_METER, { points = false } = {}): Point[] => {
    const isPoly = (r.polygon && r.polygon.length >= 3) || r.shape === 'bubble';
    const corners = r.polygon && r.polygon.length >= 3
        ? r.polygon
        : [{ x: 0, y: 0 }, { x: r.width, y: 0 }, { x: r.width, y: r.height }, { x: 0, y: r.height }];
    const local = r.shape === 'bubble' && !points ? bubbleCurve(corners) : corners;
    const pivot = isPoly ? { x: 0, y: 0 } : { x: r.width / 2, y: r.height / 2 };
    const rad = ((r.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return local.map(p => {
        const dx = p.x - pivot.x, dy = p.y - pivot.y;
        return {
            x: (r.x + pivot.x + dx * cos - dy * sin) / pxPerMeter,
            y: (r.y + pivot.y + dx * sin + dy * cos) / pxPerMeter,
        };
    });
};

/**
 * A room's centre of gravity on the plan, in canvas pixels. Rect rooms rotate about their middle and
 * polygon/bubble rooms about (x, y), so neither is simply (x + width/2, y + height/2) in general.
 */
export const roomCenter = (r: Room): Point => polygonCentroid(roomWorldPolygon(r, 1));

/**
 * Moves a polygon/bubble room's origin (room.x, room.y, which it rotates about) to its centre of gravity,
 * shifting its points (and label) so nothing moves on the plan. After that, rotating turns the shape about
 * its middle. Rect rooms, and shapes already centred, are returned unchanged.
 */
export const recenterShape = (r: Room): Room => {
    if (!(r.polygon && r.polygon.length >= 3) || (r.shape !== 'polygon' && r.shape !== 'bubble')) return r;
    const c = polygonCentroid(r.shape === 'bubble' ? bubbleCurve(r.polygon) : r.polygon);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || Math.hypot(c.x, c.y) < 0.01) return r;
    const rad = ((r.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const polygon = r.polygon.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
    const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
    return {
        ...r,
        x: r.x + c.x * cos - c.y * sin,
        y: r.y + c.x * sin + c.y * cos,
        polygon,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        ...(r.textPos ? { textPos: { x: r.textPos.x - c.x, y: r.textPos.y - c.y } } : {}),
    };
};

export interface SiteViolation {
    roomId: string;
    roomName: string;
    floor: number;
    reason: 'outsideBoundary' | 'outsideSetback' | 'inZone';
    detail?: string;
}

export interface SiteReport {
    siteArea: number;          // m²
    perimeter: number;         // m
    buildableArea: number;     // m² inside the setback line (0 if the setbacks consume the site)
    footprint: number;         // m², largest above-ground floor plate
    coverage: number;          // % of site area
    gfa: number;               // m², above-ground gross floor area
    far: number;
    height: number;            // m, ground floor level to top of highest occupied floor
    violations: SiteViolation[];
    limits: { coverage: boolean; far: boolean; height: boolean }; // true = exceeded
}

/**
 * Checks placed rooms against the site: boundary, setbacks, no-build zones and the numeric limits.
 * Basements are allowed under setbacks (common in zoning codes) but must stay inside the boundary.
 */
export const analyzeSite = (site: SiteProperties, rooms: Room[], floors: Floor[], appSettings?: AppSettings, pxPerMeter = PIXELS_PER_METER): SiteReport | null => {
    const boundary = site.boundary;
    if (!boundary || boundary.length < 3) return null;
    const siteArea = polygonArea(boundary);
    const buildable = buildableArea(site);
    const placed = rooms.filter(r => r.isPlaced);

    const violations: SiteViolation[] = [];
    for (const r of placed) {
        if (r.spaceType === 'outdoor') continue; // gardens, courts etc. may sit in the setback
        const poly = roomWorldPolygon(r, pxPerMeter);
        const base = { roomId: r.id, roomName: r.name, floor: r.floor };
        if (!polygonInside(poly, boundary)) {
            violations.push({ ...base, reason: 'outsideBoundary' });
            continue;
        }
        if (r.floor >= 0 && (!buildable || !polygonInside(poly, buildable))) {
            violations.push({ ...base, reason: 'outsideSetback' });
            continue;
        }
        const zone = (site.zones || []).find(z => z.points.length >= 3 && polygonsOverlap(poly, z.points));
        if (zone) violations.push({ ...base, reason: 'inZone', detail: zone.name });
    }

    // Floor plates and gross floor area, above ground only
    const aboveGround = floors.filter(f => f.id >= 0).sort((a, b) => a.id - b.id);
    const terraceFactor = appSettings?.includeTerraceInGFA ? (appSettings.terraceAreaFactor ?? 0.5) : 0;
    const plate = new Map<number, number>();
    let gfa = 0;
    let topFloor = -Infinity;
    for (const r of placed) {
        if (r.spaceType === 'outdoor') continue;
        const area = polygonArea(roomWorldPolygon(r, pxPerMeter));
        const [lo, hi] = roomFloorRange(r);
        for (const f of aboveGround) {
            if (f.id < lo || f.id > hi) continue;
            topFloor = Math.max(topFloor, f.id);
            // A double-height space has floor area only on its lowest level
            const counts = r.spaceType !== 'multistory' || f.id === lo;
            if (r.spaceType === 'terrace') {
                if (counts) gfa += area * terraceFactor;
                continue;
            }
            plate.set(f.id, (plate.get(f.id) || 0) + area);
            if (counts) gfa += area;
        }
    }
    const footprint = Math.max(0, ...plate.values());
    const height = aboveGround.filter(f => f.id <= topFloor).reduce((s, f) => s + (f.height || 0), 0);
    const coverage = siteArea ? (footprint / siteArea) * 100 : 0;
    const far = siteArea ? gfa / siteArea : 0;
    const c = site.constraints;

    return {
        siteArea,
        perimeter: polygonPerimeter(boundary),
        buildableArea: buildable ? polygonArea(buildable) : 0,
        footprint,
        coverage,
        gfa,
        far,
        height,
        violations,
        limits: {
            coverage: c?.maxCoverage != null && coverage > c.maxCoverage + EPS,
            far: c?.maxFAR != null && far > c.maxFAR + EPS,
            height: c?.maxHeight != null && height > c.maxHeight + EPS,
        },
    };
};

// --- Geographic projection ---
// Local equirectangular projection around an anchor: accurate to well under 0.1% across a building site.

const EARTH_RADIUS = 6378137;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Rotates a plan vector so geographic north points where the canvas compass points (clockwise degrees). */
const rotateByNorth = (v: Point, northAngle: number): Point => {
    const a = toRad(northAngle);
    return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
};

export const geoToWorld = (lat: number, lon: number, anchor: { lat: number; lon: number; x: number; y: number }, northAngle: number): Point => {
    const east = EARTH_RADIUS * toRad(lon - anchor.lon) * Math.cos(toRad(anchor.lat));
    const north = EARTH_RADIUS * toRad(lat - anchor.lat);
    const v = rotateByNorth({ x: east, y: -north }, northAngle); // canvas y points down (south)
    return { x: anchor.x + v.x, y: anchor.y + v.y };
};

export const worldToGeo = (p: Point, anchor: { lat: number; lon: number; x: number; y: number }, northAngle: number): { lat: number; lon: number } => {
    const v = rotateByNorth({ x: p.x - anchor.x, y: p.y - anchor.y }, -northAngle);
    return {
        lat: anchor.lat + (-v.y / EARTH_RADIUS) * (180 / Math.PI),
        lon: anchor.lon + (v.x / (EARTH_RADIUS * Math.cos(toRad(anchor.lat)))) * (180 / Math.PI),
    };
};

// --- KML / KMZ (Google Earth) ---

export interface KmlShape {
    name: string;
    kind: 'polygon' | 'path';
    coords: { lat: number; lon: number }[]; // open ring (closing duplicate removed)
}

const tag = (name: string) => `(?:[\\w-]+:)?${name}`;
const decodeXml = (s: string) => s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .trim();

const parseCoordinates = (text: string): { lat: number; lon: number }[] => {
    const coords = text.trim().split(/\s+/).map(tuple => {
        const [lon, lat] = tuple.split(',').map(Number);
        return { lat, lon };
    }).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon));
    // KML rings repeat the first point at the end
    if (coords.length > 1) {
        const a = coords[0], b = coords[coords.length - 1];
        if (Math.abs(a.lat - b.lat) < 1e-10 && Math.abs(a.lon - b.lon) < 1e-10) coords.pop();
    }
    return coords;
};

/** Extracts polygons and paths from a KML document (as exported by Google Earth Pro / Web). */
export const parseKml = (xml: string): KmlShape[] => {
    const shapes: KmlShape[] = [];
    const placemarks = xml.match(new RegExp(`<${tag('Placemark')}\\b[\\s\\S]*?</${tag('Placemark')}>`, 'g')) || [];
    placemarks.forEach((pm, pmIndex) => {
        const nameMatch = pm.match(new RegExp(`<${tag('name')}>([\\s\\S]*?)</${tag('name')}>`));
        const baseName = nameMatch ? decodeXml(nameMatch[1]) || `Shape ${pmIndex + 1}` : `Shape ${pmIndex + 1}`;
        const found: KmlShape[] = [];

        const polygons = pm.match(new RegExp(`<${tag('Polygon')}\\b[\\s\\S]*?</${tag('Polygon')}>`, 'g')) || [];
        for (const poly of polygons) {
            const outer = poly.match(new RegExp(`<${tag('outerBoundaryIs')}>[\\s\\S]*?<${tag('coordinates')}>([\\s\\S]*?)</${tag('coordinates')}>`));
            const coords = outer ? parseCoordinates(outer[1]) : [];
            if (coords.length >= 3) found.push({ name: baseName, kind: 'polygon', coords });
        }
        const paths = pm.match(new RegExp(`<${tag('(?:LineString|LinearRing)')}\\b[\\s\\S]*?</${tag('(?:LineString|LinearRing)')}>`, 'g')) || [];
        for (const path of paths) {
            if (polygons.some(p => p.includes(path))) continue; // rings of a polygon
            const m = path.match(new RegExp(`<${tag('coordinates')}>([\\s\\S]*?)</${tag('coordinates')}>`));
            const coords = m ? parseCoordinates(m[1]) : [];
            if (coords.length >= 3) found.push({ name: baseName, kind: 'path', coords });
        }
        found.forEach((s, i) => shapes.push(found.length > 1 ? { ...s, name: `${s.name} (${i + 1})` } : s));
    });
    return shapes;
};

/** Reads the main .kml document out of a .kmz (zip) archive. */
export const readKmz = async (buffer: ArrayBuffer): Promise<string> => {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    // End of central directory record: search backwards (it may be followed by a comment)
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a valid KMZ file.');
    const count = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);

    const entries: { name: string; method: number; size: number; offset: number }[] = [];
    for (let i = 0; i < count; i++) {
        if (view.getUint32(ptr, true) !== 0x02014b50) break;
        const method = view.getUint16(ptr + 10, true);
        const size = view.getUint32(ptr + 20, true);
        const nameLen = view.getUint16(ptr + 28, true);
        const extraLen = view.getUint16(ptr + 30, true);
        const commentLen = view.getUint16(ptr + 32, true);
        const offset = view.getUint32(ptr + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
        entries.push({ name, method, size, offset });
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    const kmls = entries.filter(e => /\.kml$/i.test(e.name));
    const entry = kmls.find(e => /(^|\/)doc\.kml$/i.test(e.name)) || kmls[0];
    if (!entry) throw new Error('The KMZ file contains no KML document.');

    const local = entry.offset;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + entry.size);
    if (entry.method === 0) return new TextDecoder().decode(data);
    if (entry.method !== 8) throw new Error('Unsupported KMZ compression.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
};

/** Parses a .kml or .kmz file into shapes. */
export const readGoogleEarthFile = async (file: File): Promise<KmlShape[]> => {
    const buffer = await file.arrayBuffer();
    const isZip = buffer.byteLength > 4 && new DataView(buffer).getUint32(0, true) === 0x04034b50;
    const xml = isZip ? await readKmz(buffer) : new TextDecoder().decode(buffer);
    return parseKml(xml);
};

/** Converts a geographic shape to a plan boundary centred on `center`, returning the anchor used. */
export const shapeToBoundary = (shape: KmlShape, northAngle: number, center: Point) => {
    const n = shape.coords.length;
    const lat = shape.coords.reduce((s, c) => s + c.lat, 0) / n;
    const lon = shape.coords.reduce((s, c) => s + c.lon, 0) / n;
    const anchor = { lat, lon, x: center.x, y: center.y };
    const boundary = shape.coords.map(c => geoToWorld(c.lat, c.lon, anchor, northAngle));
    return { boundary, anchor };
};

// --- Satellite underlay ---
// Esri World Imagery tiles (Web Mercator). They allow cross-origin canvas use and require attribution.

export const IMAGERY_ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const TILE = 256;
const tileUrl = (z: number, x: number, y: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const mercator = (lat: number, lon: number, z: number) => {
    const s = TILE * 2 ** z;
    const sin = Math.sin(toRad(lat));
    return { x: ((lon + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
};

export interface SiteImagery {
    dataUrl: string;
    widthPx: number;
    heightPx: number;
    metersPerPixel: number;
    center: { lat: number; lon: number };
}

/** Downloads and stitches imagery covering a lat/long box. Keeps the image under ~3000 px a side. */
export const fetchSiteImagery = async (box: { north: number; south: number; east: number; west: number }): Promise<SiteImagery> => {
    let z = 19;
    let a = mercator(box.north, box.west, z), b = mercator(box.south, box.east, z);
    while (z > 12 && (b.x - a.x > 3000 || b.y - a.y > 3000)) {
        z--;
        a = mercator(box.north, box.west, z);
        b = mercator(box.south, box.east, z);
    }
    const x0 = Math.floor(a.x), y0 = Math.floor(a.y);
    const w = Math.max(1, Math.ceil(b.x) - x0), h = Math.max(1, Math.ceil(b.y) - y0);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');

    const loads: Promise<void>[] = [];
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++) {
        for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++) {
            loads.push(new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { ctx.drawImage(img, tx * TILE - x0, ty * TILE - y0); resolve(); };
                img.onerror = () => reject(new Error('Could not download satellite imagery. Check your internet connection.'));
                img.src = tileUrl(z, tx, ty);
            }));
        }
    }
    await Promise.all(loads);

    // Geographic position of the stitched image's centre pixel (inverse Web Mercator)
    const s = TILE * 2 ** z;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const centerLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * cy) / s))) * 180) / Math.PI;
    return {
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        widthPx: w,
        heightPx: h,
        metersPerPixel: (2 * Math.PI * EARTH_RADIUS * Math.cos(toRad(centerLat))) / s,
        center: { lat: centerLat, lon: (cx / s) * 360 - 180 },
    };
};

/** A lat/long box around the site boundary (or around a point), padded by `margin` meters. */
export const imageryBox = (points: { lat: number; lon: number }[], margin: number) => {
    const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
    const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const dLat = (margin / EARTH_RADIUS) * (180 / Math.PI);
    const dLon = dLat / Math.cos(toRad(midLat));
    return { north: Math.max(...lats) + dLat, south: Math.min(...lats) - dLat, east: Math.max(...lons) + dLon, west: Math.min(...lons) - dLon };
};
