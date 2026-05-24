import { Room } from '../types';

export const applyMagneticPhysics = (
    rooms: Room[],
    strengthParam?: number,
    paddingParam?: number
): Room[] => {
    // Clone rooms to avoid mutation
    const nextRooms = rooms.map(r => ({ ...r }));
    
    // strengthParam goes from 10 to 100, architectural default is 50 -> maps to original 0.5 force
    const strength = (strengthParam ?? 50) / 100;
    const repulsion = 2.0; // Repulsion to prevent overlap
    
    // paddingParam goes from 0 to 40 pixels, architectural default is 10
    const padding = paddingParam ?? 10;

    const getFloorRange = (r: Room) => {
        if (r.spaceType === 'multistory') {
            const from = r.msFromFloor ?? r.floor;
            const to = r.msToFloor ?? r.floor;
            return { min: Math.min(from, to), max: Math.max(from, to) };
        }
        if (r.spaceType === 'verticalConnection') {
            const from = r.vcFromFloor ?? r.floor;
            const to = r.vcToFloor ?? r.floor;
            return { min: Math.min(from, to), max: Math.max(from, to) };
        }
        return { min: r.floor, max: r.floor };
    };

    let moved = false;

    // Pairwise comparison
    for (let i = 0; i < nextRooms.length; i++) {
        const a = nextRooms[i];
        if (!a.isPlaced) continue;

        let fx = 0;
        let fy = 0;

        for (let j = 0; j < nextRooms.length; j++) {
            if (i === j) continue;
            const b = nextRooms[j];
            if (!b.isPlaced) continue;

            const rangeA = getFloorRange(a);
            const rangeB = getFloorRange(b);
            const overlap = Math.max(rangeA.min, rangeB.min) <= Math.min(rangeA.max, rangeB.max);
            if (!overlap) continue;

            const centerA = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
            const centerB = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

            const dx = centerB.x - centerA.x;
            const dy = centerB.y - centerA.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist === 0) continue;

            const dirX = dx / dist;
            const dirY = dy / dist;

            // Attraction (same zone)
            if (a.zone === b.zone) {
                // Force proportional to distance (spring)
                fx += dirX * strength;
                fy += dirY * strength;
            }

            // Repulsion (all nodes, to avoid overlap, keeping safety cushion equal to padding)
            const targetWidth = (a.width + b.width) / 2 + padding;
            const targetHeight = (a.height + b.height) / 2 + padding;
            const overlapX = targetWidth - Math.abs(dx);
            const overlapY = targetHeight - Math.abs(dy);

            if (Math.abs(dx) < targetWidth && Math.abs(dy) < targetHeight) {
                // Determine smallest overlap axis for resolution
                if (overlapX < overlapY) {
                    fx -= Math.sign(dx) * repulsion * overlapX;
                } else {
                    fy -= Math.sign(dy) * repulsion * overlapY;
                }
            }
        }

        if (Math.abs(fx) > 0.1 || Math.abs(fy) > 0.1) {
            a.x += fx;
            a.y += fy;
            moved = true;
        }
    }

    return moved ? nextRooms : rooms; // Return original if no change to avoid render loop if strictly equal check used
};
