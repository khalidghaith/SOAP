import { describe, it, expect } from 'vitest';
import { Room } from '../types';
import { convertRoomShape } from './shapeConversion';
import { roomCenter, roomWorldPolygon, polygonArea } from './site';
import { bubbleArea } from './geometry';

const PX = 20;
const rect = (extra: Partial<Room> = {}): Room => ({
    id: 'r', name: 'r', area: 50, zone: 'Public', isPlaced: true, floor: 0,
    x: 40, y: 60, width: 10 * PX, height: 5 * PX, ...extra,
});
const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

describe('convertRoomShape', () => {
    it('returns the same room when the shape does not change', () => {
        const r = rect();
        expect(convertRoomShape(r, 'rect')).toBe(r);
    });

    it('turns a rect into a polygon of its corners, in place, with the origin at the centre', () => {
        const r = rect({ rotation: 30 });
        const poly = convertRoomShape(r, 'polygon');
        expect(poly.shape).toBe('polygon');
        expect(poly.polygon).toHaveLength(4);
        close(poly.x, r.x + r.width / 2);
        close(poly.y, r.y + r.height / 2);
        // Same outline on the plan
        const before = roomWorldPolygon(r), after = roomWorldPolygon(poly);
        after.forEach((p, i) => { close(p.x, before[i].x); close(p.y, before[i].y); });
    });

    it('scales a bubble until its curve encloses the space area', () => {
        const bubble = convertRoomShape(rect(), 'bubble');
        const areaM2 = bubbleArea(bubble.polygon!) / (PX * PX);
        expect(Math.abs(areaM2 - 50)).toBeLessThan(0.1);
    });

    it('turns a rectangular polygon back into the same rect', () => {
        const r = rect({ rotation: 20 });
        const back = convertRoomShape(convertRoomShape(r, 'polygon'), 'rect');
        expect(back.polygon).toBeUndefined();
        close(back.width, r.width, 3);
        close(back.height, r.height, 3);
        close(back.rotation!, 20, 2);
        close(roomCenter(back).x, roomCenter(r).x, 3);
        close(roomCenter(back).y, roomCenter(r).y, 3);
    });

    it('fits an L-shaped polygon with a rect of the same area', () => {
        const L = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
        const poly: Room = { ...rect(), shape: 'polygon', polygon: L, area: polygonArea(L) / (PX * PX) };
        const fitted = convertRoomShape(poly, 'rect');
        close(fitted.width * fitted.height, polygonArea(L), 3);
        close(fitted.area, 75, 2);
    });

    it('keeps a copy of the style, and drops an empty one', () => {
        const styled = convertRoomShape(rect({ style: { fill: '#fff' } }), 'polygon');
        expect(styled.style).toEqual({ fill: '#fff' });
        expect(convertRoomShape(rect({ style: {} }), 'polygon').style).toBeUndefined();
    });
});
