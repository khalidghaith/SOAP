import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronLeft, ChevronUp, ChevronDown, MoreHorizontal, Grid, LayoutTemplate, Sparkles, Layers,
    Magnet, Atom, Image as ImageIcon, LandPlot, Ruler, Palette,
} from 'lucide-react';
import { Floor } from '../types';
import { SketchToolbar } from './SketchToolbar';
import { ZonesIcon, BrushCleaningIcon } from './icons';

interface CanvasToolbarProps {
    viewMode: 'CANVAS' | 'VOLUMES';
    // Grid
    gridSize: number;
    unitSystem?: 'metric' | 'imperial';
    onGridSizeStep: (step: 1 | -1) => void;
    showGrid: boolean;
    onToggleGrid: () => void;
    // Layout
    onAutoArrange: () => void;
    onOpenAiLayout: () => void;
    isAiLayoutLoading: boolean;
    // Floor shown faintly under the current one
    floors: Floor[];
    currentFloor: number;
    overlayFloorId: number | null;
    onOverlayFloorChange: (floorId: number | null) => void;
    // Toggles and modes
    snapPanelOpen: boolean;
    snapEnabled: boolean;
    onToggleSnapPanel: () => void;
    magnetMode: boolean;
    onToggleMagnet: () => void;
    showZones: boolean;
    onToggleZones: () => void;
    referenceMode: boolean;
    onToggleReference: () => void;
    siteMode: boolean;
    onToggleSite: () => void;
    guidesMode: boolean;
    onToggleGuides: () => void;
    sketchMode: boolean;
    onToggleSketch: () => void;
    stylePanelOpen: boolean;
    onToggleStylePanel: () => void;
    // 3D view
    volumesViewType: 'perspective' | 'isometric';
    onVolumesViewTypeChange: (type: 'perspective' | 'isometric') => void;
    onClearCanvas: () => void;
}

const ROUND = 'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300';
const IDLE = 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5';
// A mode that takes over the canvas (reference, site, guides)
const modeClass = (active: boolean) => `${ROUND} ${active ? 'bg-orange-500 text-white shadow-lg scale-105 animate-pulse' : `${IDLE} hover:text-orange-600`}`;
// A setting that stays on (magnet, zones)
const toggleClass = (on: boolean) => `${ROUND} ${!on ? `${IDLE} hover:text-orange-500` : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'}`;
// A side panel (snap, style)
const PANEL_OPEN = 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30 scale-110';
const PANEL_CLOSED = 'text-slate-400 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-500 bg-white/5 border border-slate-200/50 dark:border-white/5 hover:border-orange-500/20';

/** The vertical tool bar at the top left of the Canvas and Volumes views. */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = (p) => {
    const [isExpanded, setIsExpanded] = useState(false); // below lg the tools fold behind a button
    const [isOverlayMenuOpen, setIsOverlayMenuOpen] = useState(false);
    const overlayMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOverlayMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (overlayMenuRef.current && !overlayMenuRef.current.contains(event.target as Node)) setIsOverlayMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOverlayMenuOpen]);

    const chooseOverlay = (floorId: number | null) => {
        p.onOverlayFloorChange(floorId);
        setIsOverlayMenuOpen(false);
    };

    return (
        <div
            className="absolute top-6 left-6 flex flex-col gap-2 z-[200] export-exclude pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="glass-panel p-2 rounded-3xl shadow-xl flex flex-col items-center gap-1.5 border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                {/* Mobile Expand Button */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                    {isExpanded ? <ChevronLeft size={16} /> : <MoreHorizontal size={16} />}
                </button>

                <div className={`flex flex-col items-center gap-2 ${!isExpanded ? 'hidden lg:flex' : 'flex'}`}>
                    {/* Grid Controller (Vertical Capsule) - Always visible in both 2D and 3D */}
                    <div className="flex flex-col items-center bg-slate-100/50 dark:bg-white/5 rounded-2xl py-1.5 px-1 border border-slate-200/50 dark:border-dark-border gap-1 w-8">
                        <span className="text-[10px] font-black font-sans text-center h-4 flex items-center justify-center leading-none">{p.gridSize}{p.unitSystem === 'imperial' ? 'ft' : 'm'}</span>
                        <div className="flex items-center justify-center gap-0.5">
                            <button onClick={() => p.onGridSizeStep(1)} className="text-slate-400 hover:text-orange-600 transition-colors" title="Increase Grid"><ChevronUp size={12} /></button>
                            <button onClick={() => p.onGridSizeStep(-1)} className="text-slate-400 hover:text-orange-600 transition-colors" title="Decrease Grid"><ChevronDown size={12} /></button>
                        </div>
                        <div className="w-6 h-px bg-slate-200/60 dark:bg-dark-border my-0.5" />
                        <button
                            onClick={p.onToggleGrid}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${!p.showGrid ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-white dark:bg-dark-surface text-orange-600 dark:text-orange-400 shadow-sm'}`}
                            title="Toggle Grid"
                        >
                            <Grid size={11} />
                        </button>
                    </div>

                    {p.viewMode === 'CANVAS' && (
                        <>
                            <button onClick={p.onAutoArrange} className={`${ROUND} ${IDLE} hover:text-orange-600`} title="Auto Arrange Layout">
                                <LayoutTemplate size={16} />
                            </button>

                            <button
                                onClick={p.onOpenAiLayout}
                                disabled={p.isAiLayoutLoading}
                                className={`${ROUND} ${p.isAiLayoutLoading ? 'bg-orange-100 text-orange-400 animate-pulse' : `${IDLE} hover:text-purple-600`}`}
                                title="AI Spatial Layout"
                            >
                                <Sparkles size={16} className={p.isAiLayoutLoading ? "animate-spin" : ""} />
                            </button>

                            <div className="relative" ref={overlayMenuRef}>
                                <button
                                    onClick={() => setIsOverlayMenuOpen(prev => !prev)}
                                    className={`${ROUND} ${p.overlayFloorId !== null ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50' : IDLE}`}
                                    title="Select Overlay Floor"
                                >
                                    <Layers size={16} />
                                </button>
                                {isOverlayMenuOpen && (
                                    <div className="absolute left-full top-0 ml-2.5 w-48 glass-panel p-2.5 rounded-2xl shadow-xl flex flex-col gap-1 origin-left z-50 border border-white/20 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
                                        <div className="px-2 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Overlay Floor</div>
                                        {p.floors.filter(f => f.id !== p.currentFloor).map(floor => (
                                            <button
                                                key={floor.id}
                                                // Choosing the floor that is already shown turns the overlay off
                                                onClick={() => chooseOverlay(p.overlayFloorId === floor.id ? null : floor.id)}
                                                className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${p.overlayFloorId === floor.id ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600' : 'text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                            >
                                                {floor.label}
                                            </button>
                                        ))}
                                        {p.floors.length > 1 && <div className="h-px bg-slate-200 dark:bg-dark-border my-1" />}
                                        <button
                                            onClick={() => chooseOverlay(null)}
                                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${p.overlayFloorId === null ? 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white' : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                        >
                                            None
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={p.onToggleSnapPanel}
                                className={`${ROUND} relative ${p.snapPanelOpen
                                    ? PANEL_OPEN
                                    : p.snapEnabled
                                        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'
                                        : PANEL_CLOSED}`}
                                title="Snapping Settings & Grid"
                            >
                                <Magnet size={16} />
                            </button>

                            <button onClick={p.onToggleMagnet} className={toggleClass(p.magnetMode)} title="Physics / Magnetic Zones">
                                <Atom size={16} className={p.magnetMode ? "animate-spin" : ""} />
                            </button>

                            <button onClick={p.onToggleZones} className={toggleClass(p.showZones)} title="Toggle Zone Overlays">
                                <ZonesIcon className="w-4 h-4 transition-all duration-300" />
                            </button>

                            <button onClick={p.onToggleReference} className={modeClass(p.referenceMode)} title="Edit Reference Images">
                                <ImageIcon size={16} />
                            </button>

                            <button onClick={p.onToggleSite} className={modeClass(p.siteMode)} title="Site: boundary, setbacks & Google Earth import">
                                <LandPlot size={16} />
                            </button>

                            <button onClick={p.onToggleGuides} className={modeClass(p.guidesMode)} title="Drafting Guides & Rulers Mode">
                                <Ruler size={16} />
                            </button>

                            <SketchToolbar isActive={p.sketchMode} onToggle={p.onToggleSketch} />
                        </>
                    )}

                    {/* Style Selector Toggle (Visible in both 2D and 3D) */}
                    <button
                        onClick={p.onToggleStylePanel}
                        className={`${ROUND} relative ${p.stylePanelOpen ? PANEL_OPEN : PANEL_CLOSED}`}
                        title="Visual Styles & Appearance"
                    >
                        <Palette size={16} />
                    </button>

                    {/* View Orientation Toggle (Only in 3D VOLUMES workspace) */}
                    {p.viewMode === 'VOLUMES' && (
                        <div className="flex flex-col items-center bg-slate-100/50 dark:bg-white/5 rounded-2xl py-1.5 px-1 border border-slate-200/50 dark:border-dark-border gap-1 w-8">
                            {([['perspective', '3D', 'Perspective View'], ['isometric', 'ISO', 'Isometric View']] as const).map(([type, label, title]) => (
                                <button
                                    key={type}
                                    onClick={() => p.onVolumesViewTypeChange(type)}
                                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black tracking-tighter transition-all ${p.volumesViewType === type
                                        ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm font-black'
                                        : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'
                                    }`}
                                    title={title}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {p.viewMode === 'CANVAS' && (
                        <button
                            onClick={p.onClearCanvas}
                            className={`${ROUND} text-slate-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500`}
                            title="Clear Canvas"
                        >
                            <BrushCleaningIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
