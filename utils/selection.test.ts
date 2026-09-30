import { describe, it, expect } from 'vitest';
import { outlineInBox, selectionBoxFrom } from './selection';

const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
const box = selectionBoxFrom({ x: 10, y: 10 }, { x: 0, y: 0 }); // corners in any order

describe('outlineInBox', () => {
    it('window mode needs the whole shape inside', () => {
        expect(outlineInBox(square(2, 2, 5), box, 'window', true)).toBe(true);
        expect(outlineInBox(square(8, 8, 5), box, 'window', true)).toBe(false);
    });

    it('crossing mode takes shapes with a corner inside the box', () => {
        expect(outlineInBox(square(8, 8, 5), box, 'crossing', true)).toBe(true);
        expect(outlineInBox(square(20, 20, 5), box, 'crossing', true)).toBe(false);
    });

    it('crossing mode takes a room the box lies inside', () => {
        expect(outlineInBox(square(-10, -10, 40), box, 'crossing', true)).toBe(true);
        // ...but not an open sketch line around it
        expect(outlineInBox(square(-10, -10, 40), box, 'crossing', false)).toBe(false);
    });

    it('crossing mode takes a shape whose edge passes through the box without a corner inside', () => {
        const bar = [{ x: -5, y: 4 }, { x: 15, y: 4 }, { x: 15, y: 6 }, { x: -5, y: 6 }];
        expect(outlineInBox(bar, box, 'crossing', true)).toBe(true);
        const line = [{ x: -5, y: 5 }, { x: 15, y: 5 }];
        expect(outlineInBox(line, box, 'crossing', false)).toBe(true);
    });

    it('only closes the outline for rooms', () => {
        // An open L whose missing closing edge would cross the box
        const L = [{ x: -5, y: 20 }, { x: -5, y: -5 }, { x: 20, y: -5 }];
        expect(outlineInBox(L, box, 'crossing', false)).toBe(false);
        expect(outlineInBox(L, box, 'crossing', true)).toBe(true);
    });
});
