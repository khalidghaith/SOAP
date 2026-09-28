import { describe, it, expect } from 'vitest';
import { renderPlanSvg, niceStep, PlanRenderInput } from './planRender';
import { FLOORS, Room } from '../types';

const PX = 20;
const room = (id: string, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room => ({
    id, name: id, area: w * h, zone: 'Public', isPlaced: true, floor: 0, x: x * PX, y: y * PX, width: w * PX, height: h * PX, ...extra,
});
const input = (over: Partial<PlanRenderInput> = {}): PlanRenderInput => ({
    projectName: 'House',
    rooms: [room('Living', 0, 0, 6, 5), room('Stair', 6, 0, 3, 4, { spaceType: 'verticalConnection', vcFromFloor: 0, vcToFloor: 1 }), room('Bed', 0, 0, 4, 4, { floor: 1 })],
    floors: FLOORS,
    siteProperties: { locationName: '', latitude: 0, longitude: 0, northAngle: 30 },
    ...over,
});
const opts = { floor: 0, zoneColor: () => ({ fill: '#dbeafe', stroke: '#3b82f6' }) };

describe('renderPlanSvg', () => {
    it('draws the floor with labels, a title and a north arrow', () => {
        const r = renderPlanSvg(input(), opts)!;
        expect(r.spaces).toBe(2); // Living + the stair that serves floor 0
        expect(r.svg).toContain('>Living<');
        expect(r.svg).toContain('30.0 m²');
        expect(r.svg).toContain('House — Ground Floor (floor 0)');
        expect(r.svg).toContain('rotate(30)');
        expect(r.svg).not.toContain('>Bed<');
        expect(r.width).toBe(1024);
        expect(r.bounds).toEqual({ minX: -2, minY: -2, maxX: 11, maxY: 7 });
    });

    it('labels grid lines in meters matching the coordinates', () => {
        const { svg } = renderPlanSvg(input(), opts)!;
        // major step for a 13 m span is 2 m: labels at 0, 2, 4...
        expect(svg).toMatch(/text-anchor="middle">0<\/text>/);
        expect(svg).toMatch(/text-anchor="middle">10<\/text>/);
    });

    it('shows the other floor as a ghost and the stair on both floors', () => {
        const r = renderPlanSvg(input(), { ...opts, floor: 1, ghostFloor: 0 })!;
        expect(r.svg).toContain('>Bed<');
        expect(r.svg).toContain('>Stair<');
        expect(r.svg).toContain('dashed grey: floor 0');
    });

    it('draws the site and marks rule breaks', () => {
        const r = renderPlanSvg(input({
            siteProperties: {
                locationName: '', latitude: 0, longitude: 0, northAngle: 0,
                boundary: [{ x: -1, y: -1 }, { x: 12, y: -1 }, { x: 12, y: 8 }, { x: -1, y: 8 }],
                constraints: { defaultSetback: 2 },
                zones: [{ id: 'z', name: 'Sewer easement', points: [{ x: 9, y: 5 }, { x: 11, y: 5 }, { x: 11, y: 7 }] }],
            },
        }), opts)!;
        expect(r.svg).toContain('stroke-dasharray="14 4 3 4"'); // property line
        expect(r.svg).toContain('stroke-dasharray="8 4"');     // setback
        expect(r.svg).toContain('Sewer easement');
        expect(r.svg).toMatch(/rule break\(s\) in red/);
    });

    it('escapes names and returns null for an empty floor', () => {
        const r = renderPlanSvg(input({ rooms: [room('Tom & <Jerry>', 0, 0, 4, 4)] }), opts)!;
        expect(r.svg).toContain('Tom &amp; &lt;Jerry&gt;');
        expect(renderPlanSvg(input(), { ...opts, floor: 3 })).toBeNull();
    });
});

describe('niceStep', () => {
    it('picks round grid steps', () => {
        expect(niceStep(13)).toBe(2);
        expect(niceStep(40)).toBe(5);
        expect(niceStep(150)).toBe(20);
        expect(niceStep(3)).toBe(0.5);
    });
});
