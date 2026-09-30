import { describe, it, expect } from 'vitest';
import { Room, Annotation } from '../types';
import { canvasContentBounds } from './canvasBounds';

const room = (extra: Partial<Room>): Room => ({
    id: 'r', name: 'r', area: 1, zone: 'Public', isPlaced: true, floor: 0, x: 0, y: 0, width: 10, height: 10, ...extra,
});

describe('canvasContentBounds', () => {
    it('is null when there is nothing to fit', () => {
        expect(canvasContentBounds([], [], [])).toBeNull();
    });

    it('covers rects, polygon points (relative to x, y), sketch points and the site', () => {
        const rect = room({ x: 10, y: 20, width: 30, height: 40 });
        const poly = room({ x: 100, y: 100, polygon: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 0, y: 8 }] });
        const sketch = { id: 'a', type: 'line', floor: 0, points: [{ x: -50, y: 0 }, { x: 0, y: 0 }], style: {} } as unknown as Annotation;
        expect(canvasContentBounds([rect, poly], [sketch], [{ x: 0, y: 300 }]))
            .toEqual({ minX: -50, minY: 0, maxX: 105, maxY: 300 });
    });
});
