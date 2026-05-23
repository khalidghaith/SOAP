import React from 'react';
import { X, Palette, LayoutTemplate, Square, PencilRuler, Settings2, Box, Layers, Eye } from 'lucide-react';
import { DIAGRAM_STYLES, DiagramStyle, AppSettings } from '../types';

interface StylePanelProps {
    currentStyle: DiagramStyle;
    onStyleSelect: (style: DiagramStyle) => void;
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
    viewMode: 'CANVAS' | 'VOLUMES' | 'EDITOR';
}

export function StylePanel({ currentStyle, onStyleSelect, onClose, settings, onUpdateSettings, viewMode }: StylePanelProps) {
    const styleDescriptions: Record<string, { desc: string; icon: React.ReactNode; bg: string; border: string }> = {
        standard: {
            desc: 'Clean vectors with standard functional zoning fills.',
            icon: <LayoutTemplate size={16} />,
            bg: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
            border: 'border-slate-300 dark:border-white/10'
        },
        blueprint: {
            desc: 'Technical grids, mono fonts, and deep translucent blue shells.',
            icon: <Layers size={16} />,
            bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
            border: 'border-blue-200 dark:border-blue-800/50'
        },
        clay: {
            desc: 'Warm untextured plaster mockup with physical shadows in 3D.',
            icon: <Box size={16} />,
            bg: 'bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400',
            border: 'border-orange-200 dark:border-orange-900/50'
        }
    };

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
                        <Palette size={16} />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">Workspace Style</h3>
                        <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Select 2D canvas & 3D render theme</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* List of Styles */}
            <div className="flex flex-col gap-2">
                {DIAGRAM_STYLES.map((style) => {
                    const info = styleDescriptions[style.id] || {
                        desc: 'Elegant vector diagram style representation.',
                        icon: <LayoutTemplate size={16} />,
                        bg: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300',
                        border: 'border-slate-300 dark:border-white/10'
                    };
                    const isSelected = currentStyle.id === style.id;

                    return (
                        <button
                            key={style.id}
                            onClick={() => onStyleSelect(style)}
                            className={`w-full text-left p-2.5 rounded-2xl border transition-all duration-300 flex items-start gap-3 group relative overflow-hidden ${
                                isSelected
                                    ? 'bg-orange-500/10 border-orange-500/80 dark:border-orange-500 shadow-md shadow-orange-500/5'
                                    : 'bg-white/40 hover:bg-white/90 dark:bg-white/5 dark:hover:bg-white/10 border-slate-200/50 dark:border-white/5'
                            }`}
                        >
                            {/* Hover accent line */}
                            <div className={`absolute top-0 left-0 w-1 h-full transition-transform duration-300 origin-left ${isSelected ? 'bg-orange-500' : 'bg-transparent group-hover:bg-slate-300 dark:group-hover:bg-white/20'}`} />

                            {/* Icon */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${info.bg} ${info.border} ${isSelected ? 'scale-105' : 'group-hover:scale-105'} transition-transform duration-300`}>
                                {info.icon}
                            </div>

                            {/* Info */}
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-bold font-sans transition-colors ${isSelected ? 'text-orange-600 dark:text-orange-400' : 'text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                                        {style.name}
                                    </span>
                                    {isSelected && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                    )}
                                </div>
                                <span className="text-[10px] text-slate-400 dark:text-gray-400 font-medium leading-relaxed">
                                    {info.desc}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Premium Divider */}
            <div className="h-px bg-slate-200/55 dark:bg-white/10 my-0.5" />

            {/* Visual Sliders Section */}
            <div className="flex flex-col gap-3.5 pb-1">
                <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500">Appearance Settings</h4>
                    <p className="text-[9px] text-slate-400 dark:text-gray-500 font-medium leading-none mt-1">
                        {viewMode === 'VOLUMES' ? 'Tune 3D volume transparency and saturation' : 'Tune visual outlines and space attributes'}
                    </p>
                </div>

                <div className="space-y-3.5">
                    {viewMode === 'VOLUMES' ? (
                        <>
                            {/* Volume Opacity */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Volume Opacity</span>
                                    <span className="text-orange-600 dark:text-orange-400">{((settings.volumesOpacity ?? 0.6) * 100).toFixed(0)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" 
                                    value={settings.volumesOpacity ?? 0.6} 
                                    onChange={(e) => handleSettingChange('volumesOpacity', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Color Saturation */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Color Saturation</span>
                                    <span className="text-orange-600 dark:text-orange-400">{((settings.colorSaturation ?? 1.0) * 100).toFixed(0)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" 
                                    value={settings.colorSaturation ?? 1.0} 
                                    onChange={(e) => handleSettingChange('colorSaturation', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 font-medium leading-normal mt-1">
                                    Adjust to monochrome (0%), pale pastel (50%), or rich vibrant colors (100%).
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Zone Transparency */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Zone Transparency</span>
                                    <span className="text-orange-600 dark:text-orange-400">{(settings.zoneTransparency * 100).toFixed(0)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" 
                                    value={settings.zoneTransparency} 
                                    onChange={(e) => handleSettingChange('zoneTransparency', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Zone Padding */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Zone Padding</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.zonePadding}px</span>
                                </div>
                                <input 
                                    type="range" min="0" max="100" step="1" 
                                    value={settings.zonePadding} 
                                    onChange={(e) => handleSettingChange('zonePadding', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Stroke Width */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Stroke Width</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.strokeWidth}px</span>
                                </div>
                                <input 
                                    type="range" min="1" max="10" step="0.5" 
                                    value={settings.strokeWidth} 
                                    onChange={(e) => handleSettingChange('strokeWidth', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Corner Radius */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Corner Radius</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.cornerRadius}px</span>
                                </div>
                                <input 
                                    type="range" min="0" max="50" step="1" 
                                    value={settings.cornerRadius} 
                                    onChange={(e) => handleSettingChange('cornerRadius', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Font Size (Base) */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Font Size (Base)</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.fontSize}px</span>
                                </div>
                                <input 
                                    type="range" min="4" max="24" step="1" 
                                    value={settings.fontSize} 
                                    onChange={(e) => handleSettingChange('fontSize', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

