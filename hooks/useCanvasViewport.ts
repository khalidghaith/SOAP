import { useState, useCallback, useRef, useEffect, RefObject } from 'react';
import { Point } from '../types';
import { Bounds } from '../utils/canvasBounds';

export interface Viewport {
    scale: number;
    offset: Point; // screen position of the world origin, relative to the canvas element
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(Math.max(MIN_SCALE, s), MAX_SCALE);

/** Zooms by `newScale`, keeping the canvas point `at` (relative to the element) fixed on screen. */
const zoomAround = (v: Viewport, newScale: number, at: Point): Viewport => ({
    scale: newScale,
    offset: {
        x: at.x - ((at.x - v.offset.x) / v.scale) * newScale,
        y: at.y - ((at.y - v.offset.y) / v.scale) * newScale,
    },
});

type Touchish = { clientX: number; clientY: number };
/** Distance between two fingers and their midpoint. */
const measure = (a: Touchish, b: Touchish) => ({
    dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
    center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
});

/**
 * Pan/zoom state of the 2D canvas drawn inside `canvasRef`: wheel zoom (when `wheelEnabled`),
 * mouse panning, two-finger pan and pinch zoom, keeping the view centred when the element resizes,
 * and fitting given world bounds to the view.
 */
export const useCanvasViewport = (canvasRef: RefObject<HTMLElement | null>, wheelEnabled: boolean) => {
    const [viewport, setViewport] = useState<Viewport>(() => ({
        scale: 1,
        offset: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    }));
    const { scale, offset } = viewport;

    /** Converts client (screen) coordinates to world coordinates. */
    const toWorld = useCallback((x: number, y: number) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (x - rect.left - offset.x) / scale,
            y: (y - rect.top - offset.y) / scale
        };
    }, [canvasRef, offset.x, offset.y, scale]);

    // --- Wheel zoom about the cursor ---
    useEffect(() => {
        const element = canvasRef.current;
        if (!element || !wheelEnabled) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = element.getBoundingClientRect();
            const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setViewport(prev => zoomAround(prev, clampScale(prev.scale - e.deltaY * 0.001), at));
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [canvasRef, wheelEnabled]);

    // --- Keep the middle of the view in place when the canvas element resizes ---
    useEffect(() => {
        const element = canvasRef.current;
        if (!element) return;
        let prev = element.getBoundingClientRect();
        const observer = new ResizeObserver(() => {
            const next = element.getBoundingClientRect();
            const dx = (next.width - prev.width) / 2, dy = (next.height - prev.height) / 2;
            setViewport(v => ({ ...v, offset: { x: v.offset.x + dx, y: v.offset.y + dy } }));
            prev = next;
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [canvasRef]);

    // --- Panning (mouse drag or one finger) ---
    const [isPanning, setIsPanning] = useState(false);
    const lastPointer = useRef<Point>({ x: 0, y: 0 });

    const startPan = useCallback((clientX: number, clientY: number) => {
        setIsPanning(true);
        lastPointer.current = { x: clientX, y: clientY };
    }, []);

    /** Moves the view with the pointer while panning. */
    const movePan = useCallback((clientX: number, clientY: number) => {
        if (isPanning) {
            const dx = clientX - lastPointer.current.x, dy = clientY - lastPointer.current.y;
            setViewport(v => ({ ...v, offset: { x: v.offset.x + dx, y: v.offset.y + dy } }));
        }
        lastPointer.current = { x: clientX, y: clientY };
    }, [isPanning]);

    const endPan = useCallback(() => setIsPanning(false), []);

    // --- Two-finger pan and pinch zoom ---
    const pinch = useRef<{ startDist: number; startScale: number; lastCenter: Point } | null>(null);

    const startPinch = useCallback((a: Touchish, b: Touchish) => {
        setIsPanning(true);
        const { dist, center } = measure(a, b);
        pinch.current = { startDist: dist, startScale: scale, lastCenter: center };
    }, [scale]);

    const movePinch = useCallback((a: Touchish, b: Touchish) => {
        const state = pinch.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!state || !rect) return;
        const { dist, center } = measure(a, b);
        const newScale = clampScale(state.startScale * (dist / state.startDist));
        const pan = { x: center.x - state.lastCenter.x, y: center.y - state.lastCenter.y };
        // Pan with the fingers' midpoint, then zoom about it
        setViewport(v => zoomAround(
            { ...v, offset: { x: v.offset.x + pan.x, y: v.offset.y + pan.y } },
            newScale,
            { x: center.x - rect.left, y: center.y - rect.top },
        ));
        state.lastCenter = center;
    }, [canvasRef]);

    const endTouch = useCallback(() => {
        setIsPanning(false);
        pinch.current = null;
    }, []);

    // --- Fit ---
    /** Fits world `bounds` into the view (never zooming in past 2×); with no bounds, resets to 100% centred. */
    const fitBounds = useCallback((bounds: Bounds | null) => {
        const element = canvasRef.current;
        const { width, height } = element ? element.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
        if (!bounds) {
            setViewport({ scale: 1, offset: { x: width / 2, y: height / 2 } });
            return;
        }
        if (!element) return;
        const padding = 100;
        const newScale = Math.min(
            width / (bounds.maxX - bounds.minX + padding * 2),
            height / (bounds.maxY - bounds.minY + padding * 2),
            2,
        );
        setViewport({
            scale: newScale,
            offset: {
                x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * newScale,
                y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * newScale,
            },
        });
    }, [canvasRef]);

    return {
        scale, offset, toWorld,
        isPanning, startPan, movePan, endPan,
        startPinch, movePinch, endTouch,
        fitBounds,
    };
};
