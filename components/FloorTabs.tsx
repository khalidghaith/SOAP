import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Floor } from '../types';

interface FloorTabsProps {
    floors: Floor[];
    currentFloor: number;
    onSelectFloor: (id: number) => void;
    onRenameFloor: (id: number, label: string) => void;
    onDeleteFloor: (id: number) => void;
    onAddFloor: () => void;
}

/** Floor tabs along the bottom of the canvas. Double-click a tab to rename it. */
export const FloorTabs: React.FC<FloorTabsProps> = ({ floors, currentFloor, onSelectFloor, onRenameFloor, onDeleteFloor, onAddFloor }) => {
    const [editingFloorId, setEditingFloorId] = useState<number | null>(null);

    return (
        <div
            className="absolute bottom-0 left-0 right-0 h-8 glass-panel !border-x-0 !border-b-0 flex items-start px-4 gap-1 z-40 export-exclude pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {floors.map(f => (
                <div
                    key={f.id}
                    onClick={() => onSelectFloor(f.id)}
                    onDoubleClick={() => setEditingFloorId(f.id)}
                    className={`group
                        relative px-4 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer rounded-b-lg flex items-center gap-2 select-none border-b border-x border-transparent
                        ${currentFloor === f.id
                            ? 'bg-[#f0f2f5] dark:bg-dark-bg text-orange-600 border-slate-200/50 dark:border-dark-border !border-t-transparent h-full -translate-y-px'
                            : 'bg-slate-300/50 dark:bg-white/5 text-slate-500 dark:text-gray-500 hover:bg-slate-100/50 dark:hover:bg-white/10 h-[85%] mt-0'
                        }
                    `}
                >
                    {editingFloorId === f.id ? (
                        <input
                            autoFocus
                            className="bg-transparent border-none outline-none w-20 text-center font-black uppercase tracking-widest p-0 text-[10px] text-orange-600"
                            value={f.label}
                            onChange={(e) => onRenameFloor(f.id, e.target.value)}
                            onBlur={() => setEditingFloorId(null)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setEditingFloorId(null);
                                e.stopPropagation();
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <>
                            {f.label}
                            {currentFloor === f.id && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (floors.length > 1) onDeleteFloor(f.id);
                                    }}
                                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 ml-1"
                                    title="Delete Floor"
                                >
                                    <X size={8} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            ))}
            <button
                onClick={onAddFloor}
                className="h-[85%] w-8 flex items-center justify-center rounded-b-lg bg-slate-300/50 dark:bg-white/5 hover:bg-orange-600 hover:text-white text-slate-500"
                title="Add Floor"
            >
                <Plus size={12} />
            </button>
        </div>
    );
};
