import React from 'react';
import { Lock, Unlock, RotateCcw, Trash2 } from 'lucide-react';
import { CanvasGuide, Point } from '../types';
import { PIXELS_PER_METER } from '../utils/rooms';

interface GuideLinesProps {
    guides: CanvasGuide[];
    selectedGuideId: string | null;
    scale: number;
    darkMode: boolean;
    /** In guides mode each line gets a wide invisible strip to grab it by. */
    interactive: boolean;
    onStartDrag: (id: string) => void;
}

/** The drafting guides, drawn inside the canvas's world-space SVG. */
export const GuideLines: React.FC<GuideLinesProps> = ({ guides, selectedGuideId, scale, darkMode, interactive, onStartDrag }) => (
    <>
        {guides.map(guide => {
            const isSelected = selectedGuideId === guide.id;
            const posPx = guide.position * PIXELS_PER_METER;
            const isVertical = guide.type === 'v';
            const angle = guide.angle || 0;
            const ends = {
                x1: isVertical ? 0 : -100000,
                y1: isVertical ? -100000 : 0,
                x2: isVertical ? 0 : 100000,
                y2: isVertical ? 100000 : 0,
            };

            return (
                <g
                    key={guide.id}
                    transform={isVertical ? `rotate(${angle}) translate(${posPx}, 0)` : `rotate(${angle}) translate(0, ${posPx})`}
                >
                    <line
                        {...ends}
                        stroke={isSelected ? "#f97316" : (darkMode ? "#06b6d4" : "#0891b2")}
                        strokeWidth={(isSelected ? 1.5 : 0.8) / scale}
                        strokeDasharray={`${2.5 / scale},${2.5 / scale}`}
                        className="pointer-events-none transition-colors duration-200"
                    />
                    {interactive && (
                        <line
                            {...ends}
                            stroke="transparent"
                            strokeWidth={16 / scale}
                            className={`cursor-grab active:cursor-grabbing pointer-events-auto ${guide.locked ? 'cursor-not-allowed' : ''}`}
                            onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onStartDrag(guide.id);
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        />
                    )}
                </g>
            );
        })}
    </>
);

interface GuideActionsPanelProps {
    guide: CanvasGuide;
    scale: number;
    offset: Point;
    viewWidth: number;
    viewHeight: number;
    onToggleLock: (id: string) => void;
    onRotate: (id: string, angleDelta: number) => void;
    onDelete: (id: string) => void;
}

/**
 * Floating lock / rotate / delete bar for the selected guide, placed on the guide near the top of
 * the view (mostly vertical guides) or near its left edge (mostly horizontal ones).
 */
export const GuideActionsPanel: React.FC<GuideActionsPanelProps> = ({ guide, scale, offset, viewWidth, viewHeight, onToggleLock, onRotate, onDelete }) => {
    const isVertical = guide.type === 'v';
    const posPx = guide.position * PIXELS_PER_METER;
    const angleRad = ((guide.angle || 0) * Math.PI) / 180;

    const isMostlyVertical = isVertical
        ? Math.abs(Math.cos(angleRad)) >= 0.707
        : Math.abs(Math.sin(angleRad)) < 0.707;

    // Target point on screen, in world coordinates
    const cx = ((isMostlyVertical ? viewWidth / 2 : 120) - offset.x) / scale;
    const cy = ((isMostlyVertical ? 100 : viewHeight / 2) - offset.y) / scale;

    // The guide as a point (a) and direction (u); project the target onto it
    const [ax, ay, ux, uy] = isVertical
        ? [posPx * Math.cos(angleRad), posPx * Math.sin(angleRad), -Math.sin(angleRad), Math.cos(angleRad)]
        : [-posPx * Math.sin(angleRad), posPx * Math.cos(angleRad), Math.cos(angleRad), Math.sin(angleRad)];
    const t = (cx - ax) * ux + (cy - ay) * uy;

    const screenX = Math.max(80, Math.min(viewWidth - 180, (ax + t * ux) * scale + offset.x));
    const screenY = Math.max(80, Math.min(viewHeight - 80, (ay + t * uy) * scale + offset.y));

    return (
        <div
            className="absolute z-[150] flex items-center gap-1.5 p-1.5 bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-md border border-white/10 dark:border-white/5 rounded-full shadow-2xl text-white pointer-events-auto transition-all duration-300"
            style={{
                left: `${screenX}px`,
                top: `${screenY}px`,
                transform: isVertical ? 'translate(-50%, 0)' : 'translate(0, -50%)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="px-2.5 py-0.5 text-[10px] font-black tracking-wider text-slate-400 border-r border-white/10 select-none uppercase font-sans">
                Guide {isVertical ? 'V' : 'H'}
            </div>

            <button
                onClick={() => onToggleLock(guide.id)}
                className={`p-1.5 rounded-full transition-colors ${guide.locked ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-white/10'}`}
                title={guide.locked ? "Unlock Guide" : "Lock Guide"}
            >
                {guide.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>

            <button
                onClick={() => onRotate(guide.id, 90)}
                className="p-1.5 rounded-full text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1"
                title="Rotate 90°"
            >
                <RotateCcw size={13} />
                <span className="text-[9px] font-bold">90°</span>
            </button>

            <button
                onClick={() => onDelete(guide.id)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Delete Guide"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
};
