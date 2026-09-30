import React from 'react';
import { Box, Layers, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';
import { Floor, Room } from '../types';

interface VolumesSettingsProps {
    floors: Floor[];
    rooms: Room[];
    floorGap: number;
    onFloorGapChange: (gap: number) => void;
    showLabels: boolean;
    onToggleLabels: () => void;
    labelFontSize: number;
    onLabelFontSizeChange: (size: number) => void;
    hiddenFloorIds: Set<number>;
    onToggleFloorVisibility: (floorId: number) => void;
    onUpdateFloor: (id: number, updates: Partial<Floor>) => void;
    unitSystem?: 'metric' | 'imperial';
}

/** Right sidebar in the 3D view when nothing is selected: floor gap, labels, and each floor's height and visibility. */
export const VolumesSettings: React.FC<VolumesSettingsProps> = ({
    floors, rooms, floorGap, onFloorGapChange, showLabels, onToggleLabels, labelFontSize, onLabelFontSizeChange,
    hiddenFloorIds, onToggleFloorVisibility, onUpdateFloor, unitSystem,
}) => (
    <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                <Box size={14} className="text-orange-600" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300">Volumes Settings</h3>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Floor Gap</label>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded">{(floorGap / 2).toFixed(1)}m</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="40"
                    step="0.5"
                    value={floorGap}
                    onChange={(e) => onFloorGapChange(parseFloat(e.target.value))}
                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                />
            </div>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
            <div className="flex items-center justify-between">
                <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Show Labels</label>
                <button
                    onClick={onToggleLabels}
                    className={`w-8 h-5 rounded-full relative transition-colors ${showLabels ? 'bg-orange-500' : 'bg-slate-300 dark:bg-white/10'}`}
                >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${showLabels ? 'left-4' : 'left-1'}`} />
                </button>
            </div>

            {showLabels && (
                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Label Size</label>
                        <span className="text-[10px] font-bold text-slate-600 dark:text-gray-300">{labelFontSize}px</span>
                    </div>
                    <input
                        type="range"
                        min="4"
                        max="24"
                        step="1"
                        value={labelFontSize}
                        onChange={(e) => onLabelFontSizeChange(parseFloat(e.target.value))}
                        className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            )}
        </div>

        <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 px-1">Floors Configuration</h3>
            {floors.map(floor => {
                const floorRooms = rooms.filter(r => r.floor === floor.id && r.isPlaced);
                const floorArea = floorRooms.reduce((acc, r) => acc + r.area, 0);
                const isHidden = hiddenFloorIds.has(floor.id);

                return (
                    <div key={floor.id} className="p-4 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onToggleFloorVisibility(floor.id)}
                                    className={`p-1 rounded-md transition-colors ${isHidden ? 'text-slate-400 hover:text-slate-600' : 'text-orange-600 hover:text-orange-700 bg-orange-50 dark:bg-orange-900/20'}`}
                                    title={isHidden ? "Show Floor" : "Hide Floor"}
                                >
                                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <span className={`text-xs font-bold ${isHidden ? 'text-slate-400' : 'text-slate-700 dark:text-gray-200'}`}>{floor.label}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{floorRooms.length} Spaces</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Height (m)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-gray-200 focus:ring-1 focus:ring-orange-500 outline-none"
                                    value={floor.height}
                                    onChange={(e) => onUpdateFloor(floor.id, { height: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Area</label>
                                <div className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-gray-400">
                                    {unitSystem === 'imperial' ? `${Math.round(floorArea * 10.7639)} sq ft` : `${Math.round(floorArea)} m²`}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

interface CurrentFloorSettingsProps {
    floor: Floor | undefined;
    onChange: (updates: Partial<Floor>) => void;
}

/** Right sidebar on the canvas when nothing is selected: the current floor's name and height. */
export const CurrentFloorSettings: React.FC<CurrentFloorSettingsProps> = ({ floor, onChange }) => (
    <div className="space-y-6">
        <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                <Layers size={14} className="text-orange-600" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300">Floor Settings</h3>
        </div>

        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
            <div>
                <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 block">Current Floor Label</label>
                <input
                    className="w-full text-lg font-black text-slate-800 dark:text-gray-100 bg-transparent border-b border-dashed border-slate-300 dark:border-dark-border focus:border-orange-500 outline-none pb-1"
                    value={floor?.label || ""}
                    onChange={(e) => onChange({ label: e.target.value })}
                />
            </div>

            <div>
                <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Floor Height</label>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded">meters</span>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="number"
                        step="0.1"
                        className="flex-1 text-2xl font-mono font-bold text-slate-700 dark:text-gray-200 bg-transparent outline-none"
                        value={floor?.height || 3}
                        onChange={(e) => onChange({ height: parseFloat(e.target.value) || 0 })}
                    />
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => onChange({ height: (floor?.height || 3) + 0.1 })}
                            className="p-1 hover:bg-white dark:hover:bg-white/10 rounded shadow-sm border border-slate-200 dark:border-dark-border text-slate-400 hover:text-orange-600"
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            onClick={() => onChange({ height: Math.max(0, (floor?.height || 3) - 0.1) })}
                            className="p-1 hover:bg-white dark:hover:bg-white/10 rounded shadow-sm border border-slate-200 dark:border-dark-border text-slate-400 hover:text-orange-600"
                        >
                            <ChevronDown size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <p className="text-[9px] text-slate-400 dark:text-gray-600 leading-relaxed px-2 italic">
            Changing the height affects 3D extrusions and spatial stacking for all spaces on this floor.
        </p>
    </div>
);
