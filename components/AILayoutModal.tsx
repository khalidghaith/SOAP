import React, { useState } from 'react';
import { X, Wand2, Grid, LayoutGrid } from 'lucide-react';
import { ZoningTypology } from '../types';

export type BuildingMassing = 'compact' | 'l-shape' | 'u-shape' | 'courtyard';

interface AILayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (instructions: string, typology: ZoningTypology, massing: BuildingMassing, gridSize: number) => void;
    isLoading: boolean;
}

export const AILayoutModal: React.FC<AILayoutModalProps> = ({ isOpen, onClose, onGenerate, isLoading }) => {
    const [instructions, setInstructions] = useState("");
    const [typology, setTypology] = useState<ZoningTypology>("residential");
    const [massing, setMassing] = useState<BuildingMassing>("compact");
    const [gridSize, setGridSize] = useState<number>(0.5);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[300] flex items-center justify-center p-8">
            <div className="bg-white dark:bg-dark-surface w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-dark-border">
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-orange-50/50 dark:bg-orange-900/10">
                    <h2 className="text-orange-900 dark:text-orange-400 font-black text-lg flex items-center gap-2">
                        <Wand2 size={20} className="text-orange-600 dark:text-orange-500" /> AI Layout Architect
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 dark:text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-8 space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Architectural Typology</label>
                            <select
                                value={typology}
                                onChange={(e) => setTypology(e.target.value as ZoningTypology)}
                                disabled={isLoading}
                                className="w-full p-3 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl text-slate-700 dark:text-gray-200 font-bold text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            >
                                <option value="residential">🏡 Residential (Villa / Stacking & Buffering)</option>
                                <option value="commercial">🏢 Commercial (Office / Lobbies & Workspaces)</option>
                                <option value="medical">🏥 Medical (Clinic / Wide Corridors & Exam Line)</option>
                                <option value="educational">🏫 Educational (School / Circulation & Classrooms)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                                <LayoutGrid size={12} /> Building Footprint Massing
                            </label>
                            <select
                                value={massing}
                                onChange={(e) => setMassing(e.target.value as BuildingMassing)}
                                disabled={isLoading}
                                className="w-full p-3 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl text-slate-700 dark:text-gray-200 font-bold text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            >
                                <option value="compact">📦 Compact Rectangular Footprint</option>
                                <option value="l-shape">📐 L-Shaped Wing Footprint</option>
                                <option value="u-shape">⛩️ U-Shaped Courtyard Footprint</option>
                                <option value="courtyard">🏛️ Central Ring / Courtyard Core</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                            <Grid size={12} /> Alignment Grid Module
                        </label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setGridSize(0.5)}
                                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${gridSize === 0.5 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-600 dark:text-orange-400' : 'bg-slate-50 dark:bg-dark-bg border-slate-200 dark:border-dark-border text-slate-600 dark:text-gray-400'}`}
                            >
                                0.5m Precision Grid
                            </button>
                            <button
                                type="button"
                                onClick={() => setGridSize(1.0)}
                                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${gridSize === 1.0 ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-600 dark:text-orange-400' : 'bg-slate-50 dark:bg-dark-bg border-slate-200 dark:border-dark-border text-slate-600 dark:text-gray-400'}`}
                            >
                                1.0m Structural Grid
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Custom Directives / Instructions</label>
                        <textarea
                            className="w-full h-28 p-3.5 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none text-xs font-medium text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600"
                            placeholder="Type your instructions here (optional)... E.g. 'Align kitchen and dining, position master bedroom facing south...'"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            disabled={isLoading}
                        />
                        <p className="text-slate-400 dark:text-gray-500 text-[11px] mt-1 font-medium">
                            The AI will strictly align rooms on the selected grid module and lock vertical stairs/elevators across floors.
                        </p>
                    </div>

                    <div className="pt-2 flex justify-end gap-3 border-t border-slate-100 dark:border-dark-border">
                        <button 
                            onClick={onClose} 
                            disabled={isLoading}
                            className="px-5 py-2.5 text-slate-500 dark:text-gray-400 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onGenerate(instructions, typology, massing, gridSize)}
                            disabled={isLoading}
                            className="px-6 py-2.5 bg-orange-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-200 dark:shadow-none disabled:opacity-50 flex items-center gap-2 transition-all"
                        >
                            {isLoading ? "Generating Layout..." : "Generate Layout"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
