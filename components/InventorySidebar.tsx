import React from 'react';
import { Plus, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { Room, ZoneColor } from '../types';

interface InventorySidebarProps {
    /** Used to tell when a space dragged on the canvas is dropped back onto the inventory. */
    panelRef: React.RefObject<HTMLElement | null>;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    /** Highlights the panel while a space or zone is dragged over it. */
    isDropTarget: boolean;
    unplacedRooms: Room[];
    zoneColors: Record<string, ZoneColor>;
    unitSystem?: 'metric' | 'imperial';
    onDragStart: (e: React.DragEvent, room: Room) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onPlaceCenter: (room: Room) => void;
    onAddSpace: () => void;
}

/** Left sidebar listing the spaces not yet placed on the canvas. */
export const InventorySidebar: React.FC<InventorySidebarProps> = ({
    panelRef, isOpen, onOpenChange, isDropTarget, unplacedRooms, zoneColors, unitSystem,
    onDragStart, onDragOver, onDrop, onPlaceCenter, onAddSpace,
}) => (
    <aside
        ref={panelRef}
        className={`${isOpen ? 'w-80' : 'w-[42px]'} glass-panel border-r border-slate-200/40 dark:border-dark-border flex flex-col z-30 shadow-[10px_0_30px_rgba(0,0,0,0.02)] transition-all duration-300 ${isDropTarget ? 'ring-2 ring-orange-400 ring-inset bg-orange-50/30 dark:bg-orange-900/10' : ''}`}
        onDragOver={onDragOver}
        onDrop={onDrop}
    >
        {isOpen ? (
            <>
                <div className="p-6 border-b border-slate-100/30 dark:border-dark-border/30 flex justify-between items-center bg-transparent h-20">
                    <div>
                        <h2 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                            Space Inventory
                        </h2>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-gray-400">{unplacedRooms.length} spaces pending placement</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-8 flex items-center justify-center bg-slate-200/50 dark:bg-white/10 rounded-xl text-xs font-black text-slate-600 dark:text-gray-300 border border-slate-200/50 dark:border-white/5">{unplacedRooms.length}</span>
                        <button onClick={() => onOpenChange(false)} className="text-slate-300 hover:text-slate-600 dark:text-gray-600 dark:hover:text-gray-400"><ChevronLeft size={18} /></button>
                    </div>
                </div>
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-transparent">
                    {unplacedRooms.length > 0 ? unplacedRooms.map(room => (
                        <div
                            key={room.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, room)}
                            className="p-5 rounded-2xl glass-card cursor-grab active:cursor-grabbing group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <span className="font-black text-slate-800 dark:text-gray-200 text-sm tracking-tight block group-hover:text-orange-600">{room.name}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Drag to canvas to place</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onPlaceCenter(room); }}
                                    className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-gray-500 group-hover:bg-orange-500/10 group-hover:text-orange-600 hover:scale-110 active:scale-95"
                                    title="Place in the middle of the view"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                                    {unitSystem === 'imperial' ? `${Number((room.area * 10.7639).toFixed(1))} sq ft` : `${room.area} m²`}
                                </span>
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ${zoneColors[room.zone]?.bg || 'bg-slate-100'} ${zoneColors[room.zone]?.text || 'text-slate-500'}`}>{room.zone}</span>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-24 opacity-30 px-10">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
                                <Package size={32} className="text-slate-400 dark:text-gray-500" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-slate-500 dark:text-gray-500">Inventory Clear<br />All elements are in the design context.</p>
                        </div>
                    )}
                </div>
                <div className="p-6 bg-transparent border-t border-slate-100/30 dark:border-dark-border/30">
                    <button onClick={onAddSpace} className="w-full py-4 glass-card glow-effect rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300 flex items-center justify-center gap-3 group">
                        <Plus size={18} className="group-hover:rotate-90" /> Add Manual Space
                    </button>
                </div>
            </>
        ) : (
            <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => onOpenChange(true)}>
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Inventory</span>
                </div>
                <ChevronRight size={18} className="text-slate-400 mb-4" />
            </div>
        )}
    </aside>
);
