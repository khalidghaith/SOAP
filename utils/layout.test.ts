import { describe, it, expect } from 'vitest';
import { arrangeRooms } from './layout';
import { applyMagneticPhysics } from './physics';
import { Room } from '../types';

const room = (id: string, zone: string, x = 0, y = 0, w = 100, h = 100, extra: Partial<Room> = {}): Room =>
    ({ id, name: id, area: (w * h) / 400, zone, isPlaced: true, floor: 0, x, y, width: w, height: h, ...extra });

const gap = (a: Room, b: Room) => Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));

describe('arrangeRooms', () => {
    it('places every inventory room on the current floor without overlaps', () => {
        const rooms = ['a', 'b', 'c', 'd', 'e'].map((id, i) => room(id, i % 2 ? 'Public' : 'Private', 0, 0, 80 + i * 10, 60, { isPlaced: false }));
        const out = arrangeRooms(rooms, 1, 20);
        expect(out.every(r => r.isPlaced && r.floor === 1)).toBe(true);
        for (let i = 0; i < out.length; i++)
            for (let j = i + 1; j < out.length; j++)
                expect(gap(out[i], out[j])).toBeGreaterThanOrEqual(20 - 1e-9);
    });

    it('leaves rooms on other floors alone', () => {
        const other = room('x', 'Public', 500, 500, 100, 100, { floor: 2 });
        const out = arrangeRooms([other, room('a', 'Public', 0, 0, 100, 100, { isPlaced: false })], 0);
        expect(out[0]).toBe(other);
    });
});

describe('applyMagneticPhysics', () => {
    it('pushes overlapping rooms apart', () => {
        const rooms = [room('a', 'X', 0, 0), room('b', 'Y', 50, 0)];
        let out = rooms;
        for (let i = 0; i < 50; i++) out = applyMagneticPhysics(out, 50, 10);
        expect(gap(out[0], out[1])).toBeGreaterThan(-1);
    });

    it('returns the same array when nothing moves', () => {
        const rooms = [room('a', 'X', 0, 0), room('b', 'Y', 1000, 1000)];
        expect(applyMagneticPhysics(rooms)).toBe(rooms);
    });

    it('ignores rooms on different floors', () => {
        const rooms = [room('a', 'X', 0, 0), room('b', 'X', 10, 0, 100, 100, { floor: 1 })];
        expect(applyMagneticPhysics(rooms)).toBe(rooms);
    });
});
