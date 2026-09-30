import { Room } from '../types';

/** Rooms are stored in canvas pixels at this scale; site geometry and the AI bridge work in meters. */
export const PIXELS_PER_METER = 20;

/**
 * The floors a space occupies, as [lowest, highest]. Multistory spaces and vertical connections
 * span their from/to floors (a missing end defaults to the space's own floor); others sit on one floor.
 */
export const roomFloorRange = (r: Room): [number, number] => {
    const [a, b] = r.spaceType === 'verticalConnection' ? [r.vcFromFloor, r.vcToFloor]
        : r.spaceType === 'multistory' ? [r.msFromFloor, r.msToFloor]
        : [r.floor, r.floor];
    const from = a ?? r.floor, to = b ?? r.floor;
    return [Math.min(from, to), Math.max(from, to)];
};

/**
 * Whether a space appears on `floor` in plan: its own floor, or any floor it spans.
 * Doesn't check `isPlaced`.
 */
export const isOnFloor = (r: Room, floor: number): boolean => {
    if (r.floor === floor) return true;
    const [lo, hi] = roomFloorRange(r);
    return floor >= lo && floor <= hi;
};
