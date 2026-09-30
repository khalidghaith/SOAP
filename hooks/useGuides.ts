import { useState, useCallback, useEffect } from 'react';
import { CanvasGuide, Point } from '../types';
import { PIXELS_PER_METER } from '../utils/rooms';
import { getRulerTickInterval } from '../components/Rulers';

interface UseGuidesOptions {
    guides: CanvasGuide[];
    setGuides: React.Dispatch<React.SetStateAction<CanvasGuide[]>>;
    addToHistory: () => void;
    toWorld: (clientX: number, clientY: number) => Point;
    scale: number;
    gridSize: number;
    unitSystem?: 'metric' | 'imperial';
}

/**
 * Drafting guides: which one is selected, dragging new guides out of the rulers or moving existing
 * ones (Shift snaps to the ruler's minor ticks), and the lock / rotate / delete actions.
 */
export const useGuides = ({ guides, setGuides, addToHistory, toWorld, scale, gridSize, unitSystem }: UseGuidesOptions) => {
    const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
    const [draggedGuideId, setDraggedGuideId] = useState<string | null>(null);

    // Follow the pointer while a guide is dragged
    useEffect(() => {
        if (!draggedGuideId) return;

        const handlePointerMove = (e: PointerEvent) => {
            const worldPos = toWorld(e.clientX, e.clientY);
            setGuides(prev => prev.map(g => {
                if (g.id !== draggedGuideId) return g;
                // Distance from the origin measured across the (possibly rotated) guide
                const angleRad = ((g.angle || 0) * Math.PI) / 180;
                let newPos = g.type === 'h'
                    ? (-worldPos.x * Math.sin(angleRad) + worldPos.y * Math.cos(angleRad)) / PIXELS_PER_METER
                    : (worldPos.x * Math.cos(angleRad) + worldPos.y * Math.sin(angleRad)) / PIXELS_PER_METER;
                if (e.shiftKey) {
                    const isImperial = unitSystem === 'imperial';
                    const { subInterval } = getRulerTickInterval(gridSize, scale, PIXELS_PER_METER, isImperial);
                    const subIntervalMeters = subInterval * (isImperial ? 0.3048 : 1.0);
                    newPos = Math.round(newPos / subIntervalMeters) * subIntervalMeters;
                }
                return { ...g, position: newPos };
            }));
        };
        const handlePointerUp = () => setDraggedGuideId(null);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggedGuideId, toWorld, gridSize, scale, unitSystem, setGuides]);

    /** Creates a guide where a ruler was pressed and starts dragging it. */
    const startNewGuide = useCallback((type: 'h' | 'v', clientX: number, clientY: number) => {
        addToHistory();
        const worldPos = toWorld(clientX, clientY);
        const newId = `guide-${Date.now()}`;
        setGuides(prev => [...prev, {
            id: newId,
            type,
            position: (type === 'h' ? worldPos.y : worldPos.x) / PIXELS_PER_METER,
            angle: 0,
            locked: false
        }]);
        setSelectedGuideId(newId);
        setDraggedGuideId(newId);
    }, [addToHistory, toWorld, setGuides]);

    /** Selects a guide and, unless it is locked, starts dragging it. */
    const startDragGuide = useCallback((id: string) => {
        setSelectedGuideId(id);
        const guide = guides.find(g => g.id === id);
        if (guide && !guide.locked) {
            addToHistory();
            setDraggedGuideId(id);
        }
    }, [guides, addToHistory]);

    const toggleLockGuide = useCallback((id: string) => {
        addToHistory();
        setGuides(prev => prev.map(g => g.id === id ? { ...g, locked: !g.locked } : g));
    }, [addToHistory, setGuides]);

    const rotateGuide = useCallback((id: string, angleDelta: number) => {
        addToHistory();
        setGuides(prev => prev.map(g => g.id === id ? { ...g, angle: ((g.angle || 0) + angleDelta) % 360 } : g));
    }, [addToHistory, setGuides]);

    const deleteGuide = useCallback((id: string) => {
        addToHistory();
        setGuides(prev => prev.filter(g => g.id !== id));
        setSelectedGuideId(prev => (prev === id ? null : prev));
    }, [addToHistory, setGuides]);

    return {
        selectedGuideId, setSelectedGuideId,
        startNewGuide, startDragGuide, toggleLockGuide, rotateGuide, deleteGuide,
    };
};
