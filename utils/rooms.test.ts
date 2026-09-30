import { describe, it, expect } from 'vitest';
import { Room } from '../types';
import { roomFloorRange, isOnFloor } from './rooms';

const room = (extra: Partial<Room> = {}): Room => ({
    id: 'r', name: 'r', area: 10, zone: 'Public', isPlaced: true, floor: 1, x: 0, y: 0, width: 20, height: 20, ...extra,
});

describe('roomFloorRange', () => {
    it('is the own floor for a standard space', () => {
        expect(roomFloorRange(room())).toEqual([1, 1]);
        // from/to only apply to their own space type
        expect(roomFloorRange(room({ msFromFloor: 0, msToFloor: 3 }))).toEqual([1, 1]);
    });

    it('spans the from/to floors of multistory spaces and vertical connections, in either order', () => {
        expect(roomFloorRange(room({ spaceType: 'multistory', msFromFloor: 3, msToFloor: 0 }))).toEqual([0, 3]);
        expect(roomFloorRange(room({ spaceType: 'verticalConnection', vcFromFloor: -1, vcToFloor: 2 }))).toEqual([-1, 2]);
    });

    it('defaults a missing end to the own floor', () => {
        expect(roomFloorRange(room({ spaceType: 'verticalConnection', vcToFloor: 4 }))).toEqual([1, 4]);
        expect(roomFloorRange(room({ spaceType: 'multistory' }))).toEqual([1, 1]);
    });
});

describe('isOnFloor', () => {
    it('shows a space on its own floor and every floor it spans', () => {
        const atrium = room({ spaceType: 'multistory', msFromFloor: 1, msToFloor: 3 });
        expect([0, 1, 2, 3, 4].map(f => isOnFloor(atrium, f))).toEqual([false, true, true, true, false]);
    });

    it('always includes the own floor, even outside its from/to range', () => {
        const odd = room({ floor: 0, spaceType: 'verticalConnection', vcFromFloor: 2, vcToFloor: 3 });
        expect([0, 1, 2, 3].map(f => isOnFloor(odd, f))).toEqual([true, false, true, true]);
    });
});
