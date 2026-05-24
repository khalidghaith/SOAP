import React, { useState } from 'react';
import { X, Sliders, Globe, Layers, RefreshCw, Check, Undo2 } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
    settings: AppSettings;
    onUpdate: (settings: AppSettings) => void;
    onClose: () => void;
}

type TabType = 'general' | 'physics' | 'export';

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onUpdate, onClose }) => {
    const [activeTab, setActiveTab] = useState<TabType>('general');
    const [clearingCache, setClearingCache] = useState(false);
    const [cacheSize, setCacheSize] = useState(() => {
        try {
            const saved = localStorage.getItem('SOAP_PROJECT_AUTOSAVE');
            if (saved) {
                const kb = (saved.length * 2) / 1024; // Approximation of string bytes in KB
                return `${kb.toFixed(1)} KB`;
            }
        } catch (e) {
            console.error(e);
        }
        return '0.0 KB';
    });

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdate({ ...settings, [key]: value });
    };

    const handleClearCache = () => {
        setClearingCache(true);
        setTimeout(() => {
            try {
                localStorage.removeItem('SOAP_PROJECT_AUTOSAVE');
                setCacheSize('0.0 KB');
                alert('Autosave project cache successfully cleared.');
            } catch (e) {
                console.error(e);
            } finally {
                setClearingCache(false);
            }
        }, 800);
    };

    const handleResetPhysics = () => {
        onUpdate({
            ...settings,
            magnetStrength: 50,
            magnetPadding: 10
        });
        alert('Physics tuning parameters reset to architectural defaults.');
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-white/5">
                    <div>
                        <h2 className="text-base font-black text-slate-800 dark:text-gray-100 uppercase tracking-tight">Advanced Preferences</h2>
                        <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Fine-tune your SOAP layout & CAD environment</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tab Bar */}
                <div className="flex bg-slate-50 dark:bg-white/5 p-1 border-b border-slate-100 dark:border-dark-border gap-1 shrink-0">
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'}`}
                    >
                        <Globe size={14} /> General
                    </button>
                    <button 
                        onClick={() => setActiveTab('physics')}
                        className={`flex-1 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'physics' ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'}`}
                    >
                        <Sliders size={14} /> Physics
                    </button>
                    <button 
                        onClick={() => setActiveTab('export')}
                        className={`flex-1 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'export' ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300'}`}
                    >
                        <Layers size={14} /> CAD Export
                    </button>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    {activeTab === 'general' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            {/* Measurement Units */}
                            <div className="space-y-2">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Dimension Units</h3>
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 leading-normal">
                                    Set the global unit system. Canvas text dimensions, room areas, and exports will convert dynamically.
                                </p>
                                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl gap-1 border border-slate-200/50 dark:border-white/5">
                                    <button
                                        onClick={() => handleChange('unitSystem', 'metric')}
                                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            (settings.unitSystem || 'metric') === 'metric'
                                                ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600'
                                                : 'text-slate-400 dark:text-gray-500 hover:text-slate-600'
                                        }`}
                                    >
                                        Metric (meters, m²)
                                    </button>
                                    <button
                                        onClick={() => handleChange('unitSystem', 'imperial')}
                                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                            settings.unitSystem === 'imperial'
                                                ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600'
                                                : 'text-slate-400 dark:text-gray-500 hover:text-slate-600'
                                        }`}
                                    >
                                        Imperial (feet, sq ft)
                                    </button>
                                </div>
                            </div>

                            <div className="h-px bg-slate-100 dark:bg-dark-border" />

                            {/* Caching / Cache Statistics */}
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Local Caching</h3>
                                <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200/50 dark:border-white/5">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Autosave Cache Size</span>
                                        <span className="text-[9px] text-slate-400 dark:text-gray-500">Current layout file size in browser storage</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-gray-400 bg-slate-200/50 dark:bg-white/10 px-2 py-1 rounded-lg">{cacheSize}</span>
                                        <button
                                            onClick={handleClearCache}
                                            disabled={clearingCache}
                                            className="px-3 py-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-950/40 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                                        >
                                            <RefreshCw size={12} className={clearingCache ? 'animate-spin' : ''} />
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'physics' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Physics Core Controls</h3>
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 mt-1 leading-normal">
                                    SOAP features a real-time boundary magnetism and sorting physics engine. Fine-tune attraction constants and room padding buffers below.
                                </p>
                            </div>

                            {/* Magnet Force */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Magnetic Attraction Strength</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.magnetStrength ?? 50}%</span>
                                </div>
                                <input 
                                    type="range" min="10" max="100" step="5" 
                                    value={settings.magnetStrength ?? 50} 
                                    onChange={(e) => handleChange('magnetStrength', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 leading-normal">
                                    Determines how quickly and strongly rooms pull toward neighbors sharing the same zone typology.
                                </p>
                            </div>

                            {/* Repulsion Buffer Padding */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>Zone Bubble Separation Padding</span>
                                    <span className="text-orange-600 dark:text-orange-400">{settings.magnetPadding ?? 10}px</span>
                                </div>
                                <input 
                                    type="range" min="0" max="40" step="2" 
                                    value={settings.magnetPadding ?? 10} 
                                    onChange={(e) => handleChange('magnetPadding', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 leading-normal">
                                    Controls the minimum safety margin (air buffer) the physics engine forces between neighboring rooms.
                                </p>
                            </div>

                            <div className="h-px bg-slate-100 dark:bg-dark-border" />

                            <div className="flex justify-end pt-1">
                                <button
                                    onClick={handleResetPhysics}
                                    className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5"
                                >
                                    <Undo2 size={12} />
                                    Reset to Defaults
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'export' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">CAD & Layer Preferences</h3>
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 mt-1 leading-normal">
                                    Customize standard AutoCAD layer properties, naming conversions, and gridline styling for DXF vector exports.
                                </p>
                            </div>

                            {/* AutoCAD Layer Prefix */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-bold text-slate-700 dark:text-gray-300">AutoCAD Layer Prefix</label>
                                <input 
                                    type="text"
                                    placeholder="e.g. A- or SOAP-"
                                    value={settings.layerPrefix ?? ''}
                                    onChange={(e) => handleChange('layerPrefix', e.target.value)}
                                    className="w-full text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 px-3 focus:outline-none focus:ring-1 ring-orange-500 outline-none font-mono"
                                />
                                <p className="text-[9px] text-slate-400 dark:text-gray-500 leading-normal">
                                    Prepend this tag onto export layers (e.g. layers become <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">A-ZONES</code>, <code className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">A-LABELS</code>).
                                </p>
                            </div>

                            <div className="h-px bg-slate-100 dark:bg-dark-border" />

                            {/* DXF Export Options */}
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Export Canvas Grid</span>
                                    <span className="text-[9px] text-slate-400 dark:text-gray-500">Overlay measurement gridlines directly in the exported vector DXF</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={settings.exportGrid ?? true}
                                        onChange={(e) => handleChange('exportGrid', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-7 h-4 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};