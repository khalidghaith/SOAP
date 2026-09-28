import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { Room, Floor, SiteProperties } from '../types';
import {
    polygonArea, insetPolygon, buildableArea, polygonInside, polygonsOverlap, roomWorldPolygon,
    analyzeSite, geoToWorld, worldToGeo, parseKml, readKmz, alignEdgeRotation, rotatePoint,
} from './site';

const rect = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const PX = 20;
const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({
    id, name: id, area: w * h, zone: 'Public', isPlaced: true, floor: 0,
    x: x * PX, y: y * PX, width: w * PX, height: h * PX, ...extra,
});
const floors: Floor[] = [{ id: -1, label: 'B', height: 3 }, { id: 0, label: 'GF', height: 4 }, { id: 1, label: 'L1', height: 3.5 }, { id: 2, label: 'L2', height: 3.5 }];

describe('insetPolygon', () => {
    it('offsets a rectangle by per-edge setbacks, whichever way it winds', () => {
        const site = rect(0, 0, 20, 30); // edges: top, right, bottom, left
        const expected = rect(2, 5, 15, 22); // top 5, right 3, bottom 3, left 2
        for (const pts of [site, [...site].reverse()]) {
            const setbacks = pts === site ? [5, 3, 3, 2] : [3, 3, 5, 2]; // reversed ring: bottom, right, top, left
            const inset = insetPolygon(pts, setbacks)!;
            expect(polygonArea(inset)).toBeCloseTo(15 * 22);
            for (const p of expected) expect(inset.some(q => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)).toBe(true);
        }
    });

    it('drops a short edge squeezed out by its neighbours', () => {
        // 2 m top edge between two 45° edges: a 3 m setback removes it
        const site = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 11, y: 19 }, { x: 9, y: 19 }, { x: 0, y: 10 }];
        const inset = insetPolygon(site, site.map(() => 3))!;
        expect(inset).toHaveLength(5);
        expect(polygonInside(inset, site)).toBe(true);
        const apex = inset.reduce((a, p) => (p.y > a.y ? p : a));
        expect(apex.x).toBeCloseTo(10);
    });

    it('returns null when setbacks consume the site', () => {
        expect(insetPolygon(rect(0, 0, 10, 10), [6, 6, 6, 6])).toBeNull();
    });

    it('uses the default setback for edges without an override', () => {
        const site: SiteProperties = {
            locationName: '', latitude: 0, longitude: 0, northAngle: 0,
            boundary: rect(0, 0, 20, 20), constraints: { defaultSetback: 2, edgeSetbacks: [null, 4, null, null] },
        };
        expect(polygonArea(buildableArea(site)!)).toBeCloseTo(16 * 14);
    });
});

describe('alignEdgeRotation', () => {
    it('turns the chosen edge horizontal with the site above it, for either winding', () => {
        const tilted = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 15 }, { x: -5, y: 10 }];
        for (const pts of [tilted, [...tilted].reverse()]) {
            for (let edge = 0; edge < pts.length; edge++) {
                const deg = alignEdgeRotation(pts, edge);
                const rotated = pts.map(p => rotatePoint(p, { x: 0, y: 0 }, deg));
                const a = rotated[edge], b = rotated[(edge + 1) % rotated.length];
                expect(a.y).toBeCloseTo(b.y);                                      // horizontal
                expect(Math.max(...rotated.map(p => p.y))).toBeCloseTo(a.y);        // at the bottom
            }
        }
    });
});

describe('containment', () => {
    it('treats touching edges as inside, and crossing as outside', () => {
        expect(polygonInside(rect(0, 0, 5, 5), rect(0, 0, 10, 10))).toBe(true);
        expect(polygonInside(rect(8, 0, 5, 5), rect(0, 0, 10, 10))).toBe(false);
    });

    it('catches a room bridging the notch of an L-shaped site', () => {
        const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
        expect(polygonInside(rect(0, 0, 4, 10), L)).toBe(true);
        expect(polygonInside(rect(3, 3, 2, 2), L)).toBe(false);
    });

    it('detects overlap but not shared edges', () => {
        expect(polygonsOverlap(rect(0, 0, 5, 5), rect(5, 0, 5, 5))).toBe(false);
        expect(polygonsOverlap(rect(0, 0, 5, 5), rect(4, 1, 5, 2))).toBe(true);
        expect(polygonsOverlap(rect(0, 0, 10, 10), rect(2, 2, 1, 1))).toBe(true);
        expect(polygonsOverlap(rect(0, 0, 5, 5), rect(0, 0, 5, 5))).toBe(true);
    });

    it('rotates rectangular rooms about their centre, like the canvas', () => {
        // 4 × 2 room at (10, 10), centre (12, 11); after 90° it spans x 11..13, y 9..13
        const poly = roomWorldPolygon(room('r', 10, 10, 4, 2, { rotation: 90 }));
        const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
        expect(Math.min(...xs)).toBeCloseTo(11);
        expect(Math.max(...xs)).toBeCloseTo(13);
        expect(Math.min(...ys)).toBeCloseTo(9);
        expect(Math.max(...ys)).toBeCloseTo(13);
    });

    it('rotates polygon rooms about their origin', () => {
        const poly = roomWorldPolygon(room('p', 10, 10, 0, 0, { rotation: 90, polygon: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 40 }] }));
        expect(poly[1].x).toBeCloseTo(10);
        expect(poly[1].y).toBeCloseTo(14);
    });
});

describe('analyzeSite', () => {
    const site: SiteProperties = {
        locationName: '', latitude: 0, longitude: 0, northAngle: 0,
        boundary: rect(0, 0, 20, 20),
        zones: [{ id: 'z', name: 'Sewer easement', points: rect(14, 3, 3, 14) }],
        constraints: { defaultSetback: 3, maxHeight: 10, maxCoverage: 40, maxFAR: 1 },
    };

    it('reports areas, coverage, FAR and height', () => {
        const rooms = [
            room('a', 3, 3, 10, 10),
            room('b', 3, 3, 10, 10, { floor: 1 }),
            room('c', 3, 3, 5, 5, { floor: 2, spaceType: 'terrace' }),
            room('garden', 0, 0, 3, 20, { spaceType: 'outdoor' }),
            room('basement', 1, 1, 12, 18, { floor: -1 }),
        ];
        const r = analyzeSite(site, rooms, floors)!;
        expect(r.siteArea).toBe(400);
        expect(r.buildableArea).toBeCloseTo(14 * 14);
        expect(r.footprint).toBeCloseTo(100);
        expect(r.coverage).toBeCloseTo(25);
        expect(r.gfa).toBeCloseTo(200); // terrace excluded by default, basement below ground
        expect(r.far).toBeCloseTo(0.5);
        expect(r.height).toBeCloseTo(11); // GF 4 + L1 3.5 + L2 3.5 (terrace occupies L2)
        expect(r.limits).toEqual({ coverage: false, far: false, height: true });
        expect(r.violations).toEqual([]); // basement may sit under the setback (not in the easement); gardens may too
    });

    it('flags rooms outside the boundary, in the setback, or in a zone', () => {
        const rooms = [room('out', 18, 5, 4, 4), room('setback', 1, 5, 4, 4), room('easement', 12, 5, 3, 3), room('ok', 4, 4, 4, 4)];
        const reasons = Object.fromEntries(analyzeSite(site, rooms, floors)!.violations.map(v => [v.roomName, v.reason]));
        expect(reasons).toEqual({ out: 'outsideBoundary', setback: 'outsideSetback', easement: 'inZone' });
    });

    it('returns null without a boundary', () => {
        expect(analyzeSite({ locationName: '', latitude: 0, longitude: 0, northAngle: 0 }, [], floors)).toBeNull();
    });
});

describe('geographic projection', () => {
    const anchor = { lat: 51.5, lon: -0.12, x: 100, y: 50 };

    it('puts north up and east right when north angle is 0', () => {
        const p = geoToWorld(51.501, -0.12, anchor, 0);
        expect(p.x).toBeCloseTo(100);
        expect(p.y).toBeCloseTo(50 - 111.3, 0); // ~111 m per 0.001° of latitude
        expect(geoToWorld(51.5, -0.119, anchor, 0).x).toBeGreaterThan(100);
    });

    it('rotates with the canvas compass', () => {
        const p = geoToWorld(51.501, -0.12, anchor, 90); // north now points right
        expect(p.x - 100).toBeCloseTo(111.3, 0);
        expect(p.y).toBeCloseTo(50);
    });

    it('round-trips', () => {
        const g = worldToGeo(geoToWorld(51.5012, -0.1187, anchor, 37), anchor, 37);
        expect(g.lat).toBeCloseTo(51.5012, 9);
        expect(g.lon).toBeCloseTo(-0.1187, 9);
    });
});

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Doc</name>
<Placemark><name>My &amp; Site</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
  31.1,30.0,0 31.101,30.0,0 31.101,30.001,0 31.1,30.001,0 31.1,30.0,0
</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>1,1,0 2,2,0 3,1,0</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
<Placemark><name>Route</name><LineString><coordinates>31,30 31.1,30.1 31.2,30</coordinates></LineString></Placemark>
<Placemark><name>Pin</name><Point><coordinates>31,30,0</coordinates></Point></Placemark>
</Document></kml>`;

describe('parseKml', () => {
    it('reads polygons and paths, ignoring holes and points', () => {
        const shapes = parseKml(KML);
        expect(shapes.map(s => [s.name, s.kind, s.coords.length])).toEqual([['My & Site', 'polygon', 4], ['Route', 'path', 3]]);
        expect(shapes[0].coords[1]).toEqual({ lat: 30, lon: 31.101 });
    });

    it('handles namespace prefixes', () => {
        const xml = '<kml:Placemark><kml:name>P</kml:name><kml:Polygon><kml:outerBoundaryIs><kml:LinearRing><kml:coordinates>0,0 1,0 1,1</kml:coordinates></kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></kml:Placemark>';
        expect(parseKml(xml)).toHaveLength(1);
    });
});

// Minimal zip writer for the test (one entry)
const zip = (name: string, content: string, method: 0 | 8) => {
    const raw = Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 42);
    const cdOffset = 30 + nameBuf.length + data.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + nameBuf.length, 12); eocd.writeUInt32LE(cdOffset, 16);
    const buf = Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
};

describe('readKmz', () => {
    it('extracts deflated and stored KML', async () => {
        expect(parseKml(await readKmz(zip('doc.kml', KML, 8)))).toHaveLength(2);
        expect(await readKmz(zip('files/site.kml', 'hello', 0))).toBe('hello');
    });

    it('rejects non-zip data', async () => {
        await expect(readKmz(new ArrayBuffer(40))).rejects.toThrow('Not a valid KMZ');
    });
});
