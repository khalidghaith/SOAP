import React, { useMemo } from 'react';

export interface TickIntervalResult {
    tickInterval: number;      // distance between major ticks in units (meters or feet)
    subTickCount: number;      // number of subdivisions between major ticks
    subInterval: number;       // distance between sub-ticks in units (meters or feet)
    unitScale: number;         // conversion factor to meters (0.3048 for imperial, 1.0 for metric)
}

export function getRulerTickInterval(
    gridSize: number,
    scale: number,
    pixelsPerMeter: number,
    isImperial: boolean
): TickIntervalResult {
    const unitScale = isImperial ? 0.3048 : 1.0;
    // Spacing of the grid in pixels on screen
    const gridSpacingPx = gridSize * unitScale * pixelsPerMeter * scale;

    let interval = gridSize;
    let subs = 5;

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

    return {
        tickInterval: interval,
        subTickCount: subs,
        subInterval: interval / subs,
        unitScale
    };
}

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

    const { tickInterval, subTickCount, subInterval, unitScale } = useMemo(() => {
        return getRulerTickInterval(gridSize, scale, pixelsPerMeter, isImperial);
    }, [gridSize, scale, pixelsPerMeter, isImperial]);

    // Top Ruler graduations
    const topTicks = useMemo(() => {
        const ticks: { screenX: number; label: string; level: 'major' | 'medium' | 'minor' }[] = [];
        
        // Boundaries in target units (feet or meters)
        const xMinUnit = ((24 - offset.x) / scale / pixelsPerMeter) / unitScale;
        const xMaxUnit = ((width - offset.x) / scale / pixelsPerMeter) / unitScale;

        const startVal = Math.floor(xMinUnit / tickInterval) * tickInterval;
        const endVal = Math.ceil(xMaxUnit / tickInterval) * tickInterval;

        for (let val = startVal; val <= endVal; val += tickInterval) {
            // Draw major ticks
            const valMeters = val * unitScale;
            const screenX = valMeters * pixelsPerMeter * scale + offset.x;
            if (screenX >= 24 && screenX <= width) {
                // Show clean integers if possible, else 1 decimal place
                const label = Number(val.toFixed(1)).toString();
                ticks.push({ screenX, label, level: 'major' });
            }

            // Draw sub-ticks
            for (let s = 1; s < subTickCount; s++) {
                const subVal = val + s * subInterval;
                const subValMeters = subVal * unitScale;
                const subScreenX = subValMeters * pixelsPerMeter * scale + offset.x;
                if (subScreenX >= 24 && subScreenX <= width) {
                    const isMedium = subTickCount % 2 === 0 && s === subTickCount / 2;
                    ticks.push({ 
                        screenX: subScreenX, 
                        label: '', 
                        level: isMedium ? 'medium' : 'minor' 
                    });
                }
            }
        }

        return ticks;
    }, [offset.x, scale, pixelsPerMeter, width, tickInterval, subTickCount, subInterval, unitScale]);

    // Left Ruler graduations
    const leftTicks = useMemo(() => {
        const ticks: { screenY: number; label: string; level: 'major' | 'medium' | 'minor' }[] = [];
        
        // Boundaries in target units (feet or meters)
        const yMinUnit = ((24 - offset.y) / scale / pixelsPerMeter) / unitScale;
        const yMaxUnit = ((height - offset.y) / scale / pixelsPerMeter) / unitScale;

        const startVal = Math.floor(yMinUnit / tickInterval) * tickInterval;
        const endVal = Math.ceil(yMaxUnit / tickInterval) * tickInterval;

        for (let val = startVal; val <= endVal; val += tickInterval) {
            // Draw major ticks
            const valMeters = val * unitScale;
            const screenY = valMeters * pixelsPerMeter * scale + offset.y;
            if (screenY >= 24 && screenY <= height) {
                const label = Number(val.toFixed(1)).toString();
                ticks.push({ screenY, label, level: 'major' });
            }

            // Draw sub-ticks
            for (let s = 1; s < subTickCount; s++) {
                const subVal = val + s * subInterval;
                const subValMeters = subVal * unitScale;
                const subScreenY = subValMeters * pixelsPerMeter * scale + offset.y;
                if (subScreenY >= 24 && subScreenY <= height) {
                    const isMedium = subTickCount % 2 === 0 && s === subTickCount / 2;
                    ticks.push({ 
                        screenY: subScreenY, 
                        label: '', 
                        level: isMedium ? 'medium' : 'minor' 
                    });
                }
            }
        }

        return ticks;
    }, [offset.y, scale, pixelsPerMeter, height, tickInterval, subTickCount, subInterval, unitScale]);

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
                    e.preventDefault();
                    e.stopPropagation();
                    onDragNewGuide('h', e.clientX, e.clientY);
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <svg className="w-full h-full overflow-visible">
                    {topTicks.map((tick, idx) => {
                        let y1 = 10;
                        if (tick.level === 'medium') y1 = 15;
                        else if (tick.level === 'minor') y1 = 19;

                        return (
                            <g key={`top-t-${idx}`}>
                                <line
                                    x1={tick.screenX - 24} // Offset by left 24px of TopRuler container
                                    y1={y1}
                                    x2={tick.screenX - 24}
                                    y2={24}
                                    stroke="currentColor"
                                    className="text-slate-400 dark:text-slate-600"
                                    strokeWidth={1}
                                />
                                {tick.level === 'major' && (
                                    <text
                                        x={tick.screenX - 24 + 3}
                                        y={8}
                                        className="font-mono text-[8px] fill-slate-400 dark:fill-gray-500 font-bold"
                                    >
                                        {tick.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Left Vertical Ruler */}
            <div 
                className="absolute top-6 left-0 bottom-0 w-6 border-r border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md pointer-events-auto cursor-ew-resize flex justify-end"
                onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDragNewGuide('v', e.clientX, e.clientY);
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <svg className="w-full h-full overflow-visible">
                    {leftTicks.map((tick, idx) => {
                        let x1 = 10;
                        if (tick.level === 'medium') x1 = 15;
                        else if (tick.level === 'minor') x1 = 19;

                        return (
                            <g key={`left-t-${idx}`}>
                                <line
                                    x1={x1}
                                    y1={tick.screenY - 24} // Offset by top 24px of LeftRuler container
                                    x2={24}
                                    y2={tick.screenY - 24}
                                    stroke="currentColor"
                                    className="text-slate-400 dark:text-slate-600"
                                    strokeWidth={1}
                                />
                                {tick.level === 'major' && (
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
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};
