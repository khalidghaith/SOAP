import { describe, it, expect } from 'vitest';
import { generateDXF } from './dxf';
import { Room } from '../types';

const room = (id: string, name: string, extra: Partial<Room> = {}): Room =>
    ({ id, name, area: 20, zone: 'Public', isPlaced: true, floor: 0, x: 0, y: 0, width: 100, height: 80, ...extra });

const pairs = (dxf: string) => {
    const lines = dxf.split('\r\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const out: [number, string][] = [];
    for (let i = 0; i < lines.length; i += 2) out.push([Number(lines[i]), lines[i + 1]]);
    return out;
};

describe('generateDXF', () => {
    const rooms = [
        room('a', 'Living'),
        room('b', 'Kitchen', { x: 100 }),
        room('c', 'Upstairs Bed', { floor: 1 }),
        room('d', 'Unplaced', { isPlaced: false }),
        room('e', 'Atrium', { floor: 0, spaceType: 'multistory', msFromFloor: 0, msToFloor: 2, x: 300 }),
    ];

    it('is a well-formed group-code/value file ending in EOF', () => {
        const dxf = generateDXF('Test', rooms, [], 0);
        expect(dxf).not.toMatch(/[^\r]\n/); // CRLF only
        const p = pairs(dxf);
        expect(p.every(([code]) => Number.isInteger(code))).toBe(true);
        expect(p[p.length - 1]).toEqual([0, 'EOF']);
        expect(dxf).not.toContain('NaN');
        expect(dxf).not.toContain('undefined');
    });

    it('exports only rooms visible on the requested floor', () => {
        const floor0 = generateDXF('Test', rooms, [], 0);
        expect(floor0).toContain('Living');
        expect(floor0).toContain('Kitchen');
        expect(floor0).not.toContain('Upstairs Bed');
        expect(floor0).not.toContain('Unplaced');

        const floor1 = generateDXF('Test', rooms, [], 1);
        expect(floor1).toContain('Upstairs Bed');
        expect(floor1).toContain('Atrium'); // multistory spans floors 0–2
        expect(floor1).not.toContain('Living');
    });

    it('prefixes layer names', () => {
        const dxf = generateDXF('Test', rooms, [], 0, 0, 0, 'metric', 'SOAP-');
        expect(dxf).toContain('SOAP-WALLS');
        expect(dxf).not.toMatch(/\r\n(?!SOAP-)WALLS\r\n/);
    });
});
