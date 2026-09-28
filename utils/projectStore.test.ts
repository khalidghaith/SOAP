import { describe, it, expect } from 'vitest';
import { buildProjectData, parseProjectData, parseCsv, parseArea, toCsvField, PROJECT_FILE_VERSION } from './projectStore';
import { FLOORS, ZONE_COLORS } from '../types';

const sampleState = () => ({
    projectName: 'Test',
    rooms: [{ id: 'r1', name: 'Living', area: 20, zone: 'Public', isPlaced: true, floor: 0, x: 0, y: 0, width: 80, height: 100 }],
    connections: [],
    floors: FLOORS,
    currentFloor: 0,
    zoneColors: ZONE_COLORS,
    appSettings: {} as any,
    annotations: [{ id: 'a1' } as any],
    referenceImages: [{ id: 'img1', url: 'data:image/png;base64,xx' } as any],
    floorOverlays: { 1: 0 },
    siteProperties: { locationName: 'Cairo', latitude: 30, longitude: 31, northAngle: 0 } as any,
    guides: [{ id: 'g1', type: 'h', position: 3 } as any],
});

describe('project file round trip', () => {
    it('keeps every part of the project', () => {
        const saved = JSON.parse(JSON.stringify(buildProjectData(sampleState())));
        const loaded = parseProjectData(saved);
        expect(saved.version).toBe(PROJECT_FILE_VERSION);
        for (const key of ['annotations', 'referenceImages', 'floorOverlays', 'siteProperties', 'guides', 'rooms', 'floors'] as const) {
            expect(loaded[key]).toEqual(sampleState()[key]);
        }
    });

    it('keeps site geometry and drops malformed shapes', () => {
        const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
        const site = {
            locationName: 'X', latitude: 1, longitude: 2, northAngle: 0,
            boundary: square, constraints: { defaultSetback: 3, maxFAR: 1.2 },
            zones: [{ id: 'z1', name: 'Easement', points: square }, { id: 'bad', name: 'Bad', points: [{ x: 0 }] }],
        };
        const loaded = parseProjectData({ rooms: [], siteProperties: site });
        expect(loaded.siteProperties?.boundary).toEqual(square);
        expect(loaded.siteProperties?.constraints).toEqual({ defaultSetback: 3, maxFAR: 1.2 });
        expect(loaded.siteProperties?.zones?.map(z => z.id)).toEqual(['z1']);
        expect(parseProjectData({ rooms: [], siteProperties: { ...site, boundary: [{ x: 1, y: 'a' }] } }).siteProperties?.boundary).toBeUndefined();
    });

    it('loads older files that lack newer fields', () => {
        const loaded = parseProjectData({ projectName: 'Old', rooms: [], floors: [{ id: 0, label: 'Ground' }] });
        expect(loaded.guides).toBeUndefined();
        expect(loaded.floors).toEqual([{ id: 0, label: 'Ground', height: 4 }]);
    });

    it('rejects files that are not projects', () => {
        expect(() => parseProjectData({ foo: 1 })).toThrow();
        expect(() => parseProjectData(null)).toThrow();
    });
});

describe('CSV', () => {
    it('handles quoted commas, escaped quotes and CRLF', () => {
        const rows = parseCsv('Name,Area,Zone\r\n"Office, Large",25,Admin\r\n"The ""Hub""",12.5,Public\r\n');
        expect(rows).toEqual([
            ['Name', 'Area', 'Zone'],
            ['Office, Large', '25', 'Admin'],
            ['The "Hub"', '12.5', 'Public'],
        ]);
    });

    it('handles semicolon files with comma decimals', () => {
        const rows = parseCsv('Kitchen;12,5;Service');
        expect(rows).toEqual([['Kitchen', '12,5', 'Service']]);
        expect(parseArea(rows[0][1])).toBe(12.5);
    });

    it('round-trips names through export quoting', () => {
        const name = 'Office, "Large"';
        expect(parseCsv([toCsvField(name), toCsvField(10)].join(','))).toEqual([[name, '10']]);
    });
});
