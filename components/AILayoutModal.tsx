import React, { useState } from 'react';
import { X, Wand2 } from 'lucide-react';

interface AILayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (instructions: string) => void;
    isLoading: boolean;
}

export const AILayoutModal: React.FC<AILayoutModalProps> = ({ isOpen, onClose, onGenerate, isLoading }) => {
    const [instructions, setInstructions] = useState("");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-8">
            <div className="bg-white dark:bg-dark-surface w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-dark-border">
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-orange-50/50 dark:bg-orange-900/10">
                    <h2 className="text-orange-900 dark:text-orange-400 font-black text-lg flex items-center gap-2">
                        <Wand2 size={20} className="text-orange-600 dark:text-orange-500" /> AI Layout Instructions
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center text-slate-400 dark:text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-8">
                    <p className="text-slate-500 dark:text-gray-400 text-sm mb-4 font-medium">
                        Provide specific instructions for the AI to follow when arranging the spaces. For example: "Place all bedrooms on floor 1, facing south. Group the kitchen and dining on the ground floor."
                    </p>
                    <textarea
                        className="w-full h-32 p-4 bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none text-sm font-medium text-slate-700 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-600"
                        placeholder="Type your instructions here (optional)..."
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        disabled={isLoading}
                    />
                    <div className="mt-6 flex justify-end gap-3">
                        <button 
                            onClick={onClose} 
                            disabled={isLoading}
                            className="px-5 py-2.5 text-slate-500 dark:text-gray-400 font-bold text-xs uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onGenerate(instructions)}
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
