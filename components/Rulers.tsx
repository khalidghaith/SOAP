import React, { useMemo } from 'react';

interface RulersProps {
    scale: number;
    offset: { x: number; y: number };
    unitSystem: 'metric' | 'imperial' | undefined;
    gridSize: number;
    pixelsPerMeter: number;
    width: number;
    height: number;
    onDragNewGuide: (type: 'h' | 'v', clientX: number, clientY: number) => void;
}

export const Rulers: React.FC<RulersProps> = ({
    scale,
    offset,
    unitSystem,
    gridSize,
    pixelsPerMeter,
    width,
    height,
    onDragNewGuide,
}) => {
    const isImperial = unitSystem === 'imperial';
    const unitLabel = isImperial ? 'ft' : 'm';

    // Calculate dynamic tick intervals based on zoom scale
    const { tickInterval, subTickCount } = useMemo(() => {
        // Spacing between standard gridlines on screen in pixels
        const gridSpacingPx = gridSize * pixelsPerMeter * scale;

        let interval = gridSize;
        let subs = 5; // number of divisions between major ticks

        if (gridSpacingPx < 40) {
            interval = gridSize * 2;
            subs = 4;
            if (gridSpacingPx * 2 < 40) {
                interval = gridSize * 5;
                subs = 5;
                if (gridSpacingPx * 5 < 40) {
                    interval = gridSize * 10;
                    subs = 10;
                }
            }
        } else if (gridSpacingPx > 180) {
            interval = gridSize / 2;
            subs = 5;
            if (gridSpacingPx / 2 > 180) {
                interval = gridSize / 5;
                subs = 5;
            }
        }

        return { tickInterval: interval, subTickCount: subs };
    }, [gridSize, scale, pixelsPerMeter]);

    // Top Ruler graduations
    const topTicks = useMemo(() => {
        const ticks: { screenX: number; label: string; isMajor: boolean }[] = [];
        const xMinWorld = (24 - offset.x) / scale / pixelsPerMeter;
        const xMaxWorld = (width - offset.x) / scale / pixelsPerMeter;

        const startVal = Math.floor(xMinWorld / tickInterval) * tickInterval;
        const endVal = Math.ceil(xMaxWorld / tickInterval) * tickInterval;

        const subInterval = tickInterval / subTickCount;

        for (let val = startVal; val <= endVal; val += tickInterval) {
            // Draw major ticks
            const screenX = val * pixelsPerMeter * scale + offset.x;
            if (screenX >= 24 && screenX <= width) {
                // Format label: if imperial, show converted feet; else show meters
                const displayedVal = isImperial ? val / 0.3048 : val;
                
                // Show clean integers if possible, else 1 decimal place
                const label = Number(displayedVal.toFixed(1)).toString();
                ticks.push({ screenX, label, isMajor: true });
            }

            // Draw sub-ticks
            for (let s = 1; s < subTickCount; s++) {
                const subVal = val + s * subInterval;
                const subScreenX = subVal * pixelsPerMeter * scale + offset.x;
                if (subScreenX >= 24 && subScreenX <= width) {
                    ticks.push({ screenX: subScreenX, label: '', isMajor: false });
                }
            }
        }

        return ticks;
    }, [offset.x, scale, pixelsPerMeter, width, tickInterval, subTickCount, isImperial]);

    // Left Ruler graduations
    const leftTicks = useMemo(() => {
        const ticks: { screenY: number; label: string; isMajor: boolean }[] = [];
        const yMinWorld = (24 - offset.y) / scale / pixelsPerMeter;
        const yMaxWorld = (height - offset.y) / scale / pixelsPerMeter;

        const startVal = Math.floor(yMinWorld / tickInterval) * tickInterval;
        const endVal = Math.ceil(yMaxWorld / tickInterval) * tickInterval;

        const subInterval = tickInterval / subTickCount;

        for (let val = startVal; val <= endVal; val += tickInterval) {
            // Draw major ticks
            const screenY = val * pixelsPerMeter * scale + offset.y;
            if (screenY >= 24 && screenY <= height) {
                const displayedVal = isImperial ? val / 0.3048 : val;
                const label = Number(displayedVal.toFixed(1)).toString();
                ticks.push({ screenY, label, isMajor: true });
            }

            // Draw sub-ticks
            for (let s = 1; s < subTickCount; s++) {
                const subVal = val + s * subInterval;
                const subScreenY = subVal * pixelsPerMeter * scale + offset.y;
                if (subScreenY >= 24 && subScreenY <= height) {
                    ticks.push({ screenY: subScreenY, label: '', isMajor: false });
                }
            }
        }

        return ticks;
    }, [offset.y, scale, pixelsPerMeter, height, tickInterval, subTickCount, isImperial]);

    return (
        <div 
            className="absolute inset-0 pointer-events-none select-none z-[120]"
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Top-Left Corner Box */}
            <div className="absolute top-0 left-0 w-6 h-6 z-[130] pointer-events-auto border-r border-b border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-center text-[9px] font-black text-slate-400 dark:text-gray-500 tracking-wider">
                {unitLabel}
            </div>

            {/* Top Horizontal Ruler */}
            <div 
                className="absolute top-0 left-6 right-0 h-6 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md pointer-events-auto cursor-ns-resize flex items-end"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onDragNewGuide('h', e.clientX, e.clientY);
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                <svg className="w-full h-full overflow-visible">
                    {topTicks.map((tick, idx) => (
                        <g key={`top-t-${idx}`}>
                            <line
                                x1={tick.screenX - 24} // Offset by left 24px of TopRuler container
                                y1={tick.isMajor ? 10 : 17}
                                x2={tick.screenX - 24}
                                y2={24}
                                stroke="currentColor"
                                className="text-slate-300 dark:text-slate-700"
                                strokeWidth={1}
                            />
                            {tick.isMajor && (
                                <text
                                    x={tick.screenX - 24 + 3}
                                    y={8}
                                    className="font-mono text-[8px] fill-slate-400 dark:fill-gray-500 font-bold"
                                >
                                    {tick.label}
                                </text>
                            )}
                        </g>
                    ))}
                </svg>
            </div>

            {/* Left Vertical Ruler */}
            <div 
                className="absolute top-6 left-0 bottom-0 w-6 border-r border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md pointer-events-auto cursor-ew-resize flex justify-end"
                onPointerDown={(e) => {
                    e.stopPropagation();
                    onDragNewGuide('v', e.clientX, e.clientY);
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                <svg className="w-full h-full overflow-visible">
                    {leftTicks.map((tick, idx) => (
                        <g key={`left-t-${idx}`}>
                            <line
                                x1={tick.isMajor ? 10 : 17}
                                y1={tick.screenY - 24} // Offset by top 24px of LeftRuler container
                                x2={24}
                                y2={tick.screenY - 24}
                                stroke="currentColor"
                                className="text-slate-300 dark:text-slate-700"
                                strokeWidth={1}
                            />
                            {tick.isMajor && (
                                <text
                                    x={10}
                                    y={tick.screenY - 24 + 3}
                                    className="font-mono text-[8px] fill-slate-400 dark:fill-gray-500 font-bold"
                                    transform={`rotate(-90, 10, ${tick.screenY - 24})`}
                                    textAnchor="middle"
                                >
                                    {tick.label}
                                </text>
                            )}
                        </g>
                    ))}
                </svg>
            </div>
        </div>
    );
};
