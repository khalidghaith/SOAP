import React from 'react';
import { X, Magnet } from 'lucide-react';
import { AppSettings } from '../types';

interface SnapPanelProps {
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
    onClose: () => void;
    snapEnabled: boolean;
    onToggleSnapEnabled: (enabled: boolean) => void;
    gridSizeIndex: number;
    onGridSizeIndexChange: (index: number) => void;
    GRID_SIZES: number[];
}

export function SnapPanel({
    settings,
    onUpdateSettings,
    onClose,
    snapEnabled,
    onToggleSnapEnabled,
    gridSizeIndex,
    onGridSizeIndexChange,
    GRID_SIZES
}: SnapPanelProps) {
    const handleSettingChange = (key: keyof AppSettings, value: number | boolean) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    return (
        <div
            className="glass-panel p-4 rounded-3xl shadow-2xl flex flex-col gap-4 w-80 border border-white/20 dark:border-white/10 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 z-[190] absolute top-0 left-0 max-h-[85vh] overflow-y-auto animate-in fade-in slide-in-from-left-4 duration-300 custom-scrollbar"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-dark-border">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                        <Magnet size={16} />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">Snapping Settings</h3>
                        <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Configure layout & sketch alignment</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Master Toggle */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 p-3 rounded-2xl border border-slate-200/50 dark:border-white/5">
                <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Enable Snapping</span>
                    <span className="text-[9px] text-slate-400 dark:text-gray-500">Global align & snapping toggle</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={snapEnabled} 
                        onChange={(e) => onToggleSnapEnabled(e.target.checked)} 
                        className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
                </label>
            </div>

            {/* Snapping Sub-settings */}
            <div className={`flex flex-col gap-4 transition-all duration-300 ${!snapEnabled ? 'opacity-40 pointer-events-none select-none' : 'opacity-100'}`}>
                
                {/* Snap to Grid Switch */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Snap to Grid</span>
                        <span className="text-[9px] text-slate-400 dark:text-gray-500">Align elements to layout grid</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={settings.snapToGrid} 
                            onChange={(e) => handleSettingChange('snapToGrid', e.target.checked)}
                            disabled={!snapEnabled}
                            className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                </div>

                {/* Grid Size Selection (Nested) */}
                <div className={`space-y-1.5 pl-3 border-l-2 border-slate-200 dark:border-white/10 transition-all duration-300 ${(!snapEnabled || !settings.snapToGrid) ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                    <span className="text-[10px] font-bold text-slate-500 dark:text-gray-400">Grid Size</span>
                    <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl gap-1 border border-slate-200/50 dark:border-white/5">
                        {GRID_SIZES.map((size, idx) => (
                            <button
                                key={size}
                                onClick={() => onGridSizeIndexChange(idx)}
                                disabled={!snapEnabled || !settings.snapToGrid}
                                className={`flex-1 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    gridSizeIndex === idx
                                        ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600'
                                        : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'
                                }`}
                            >
                                {size}m
                            </button>
                        ))}
                    </div>
                </div>

                {/* Snap to Objects */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Snap to Objects</span>
                        <span className="text-[9px] text-slate-400 dark:text-gray-500">Align with neighboring edges & vertices</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={settings.snapToObjects} 
                            onChange={(e) => handleSettingChange('snapToObjects', e.target.checked)}
                            disabled={!snapEnabled}
                            className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                </div>

                {/* Snap While Scaling */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Snap While Scaling</span>
                        <span className="text-[9px] text-slate-400 dark:text-gray-500">Apply alignment rules when resizing</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={settings.snapWhileScaling} 
                            onChange={(e) => handleSettingChange('snapWhileScaling', e.target.checked)}
                            disabled={!snapEnabled}
                            className="sr-only peer"
                        />
                        <div className="w-7 h-4 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                </div>

                <div className="h-px bg-slate-200/55 dark:bg-white/10 my-0.5" />

                {/* Snapping Tolerance */}
                <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                        <span>Snapping Tolerance</span>
                        <span className="text-orange-600 dark:text-orange-400">{settings.snapTolerance}px</span>
                    </div>
                    <input 
                        type="range" min="2" max="50" step="1" 
                        value={settings.snapTolerance} 
                        onChange={(e) => handleSettingChange('snapTolerance', parseFloat(e.target.value))}
                        disabled={!snapEnabled}
                        className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-50"
                    />
                    <p className="text-[9px] text-slate-400 dark:text-gray-500 font-medium leading-normal mt-1">
                        Distance in pixels at which elements or sketch handles snap into alignment.
                    </p>
                </div>
            </div>
        </div>
    );
}
