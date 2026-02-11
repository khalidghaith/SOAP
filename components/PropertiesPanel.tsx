import React from 'react';
import {
    ChevronRight,
    Trash2,
    Plus,
    Square,
    Hexagon,
    Circle,
    Link,
    Unlock,
    Lock,
    RotateCcw,
    ChevronUp,
    ChevronDown,
    X,
    Layers
} from 'lucide-react';
import { Room, Connection, ZoneColor, AppSettings, DiagramStyle, Floor } from '../types';

interface PropertiesPanelProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    selectedRoom: Room | null;
    selectedRoomIds: Set<string>;
    setSelectedRoomIds: (ids: Set<string>) => void;
    isMultiSelection: boolean;
    selectedRoomsList: Room[];
    multiSelectionStats: any;
    selectedZone: string | null;
    setSelectedZone: (zone: string | null) => void;
    zoneColors: Record<string, ZoneColor>;
    updateRoom: (id: string, updates: Partial<Room>) => void;
    deleteRoom: (id: string) => void;
    toggleLink: (id: string) => void;
    connectionSourceId: string | null;
    renameZone: (old: string, next: string) => void;
    handleAddZone: (name: string) => void;
    floors: Floor[];
    currentFloor: number;
    connections: Connection[];
    setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
    handleConvertShape: (shape: 'rect' | 'polygon' | 'bubble') => void;
    zoneArea: number;
    selectedZoneRooms: Room[];
    viewMode: 'EDITOR' | 'CANVAS' | 'VOLUMES';
    allRooms: Room[];
    handleUpdateFloor: (id: number, updates: Partial<Floor>) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    isOpen, setIsOpen, selectedRoom, selectedRoomIds, setSelectedRoomIds,
    isMultiSelection, selectedRoomsList, multiSelectionStats,
    selectedZone, setSelectedZone, zoneColors, updateRoom, deleteRoom,
    toggleLink, connectionSourceId, renameZone, handleAddZone,
    floors, currentFloor, connections, setConnections, handleConvertShape,
    zoneArea, selectedZoneRooms, viewMode, allRooms, handleUpdateFloor
}) => {
    if (!isOpen) {
        return (
            <aside className="w-10 bg-white dark:bg-dark-surface border-l border-slate-200 dark:border-dark-border flex flex-col z-20 shadow-2xl transition-all duration-300">
                <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setIsOpen(true)}>
                    <div className="flex-1 flex items-center justify-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Properties</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 mb-4 rotate-180" />
                </div>
            </aside>
        );
    }

    return (
        <aside className="w-80 bg-white dark:bg-dark-surface border-l border-slate-200 dark:border-dark-border flex flex-col z-20 shadow-2xl transition-all duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-white/5 h-20">
                <h2 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest truncate max-w-[180px]">
                    {isMultiSelection ? 'Multi-Selection' : selectedRoom ? 'Space Detail' : selectedZone ? 'Zone Detail' : 'Properties'}
                </h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-300 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-400"><ChevronRight size={18} /></button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto">
                {selectedRoom || isMultiSelection ? (
                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Space Name</label>
                            {isMultiSelection ? (
                                <div className="text-sm font-bold text-slate-500 italic">{selectedRoomIds.size} spaces selected</div>
                            ) : (
                                <input
                                    className="w-full text-xl font-black text-slate-800 dark:text-gray-100 focus:outline-none focus:text-orange-600 bg-transparent border-b border-transparent focus:border-orange-500 pb-1"
                                    value={selectedRoom!.name}
                                    onChange={(e) => updateRoom(selectedRoom!.id, { name: e.target.value })}
                                />
                            )}
                        </div>

                        {/* Shape Conversion Buttons */}
                        <div>
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Shape Type</label>
                            <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
                                <button onClick={() => handleConvertShape('rect')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && (!selectedRoom?.shape || selectedRoom?.shape === 'rect')) || (isMultiSelection && multiSelectionStats?.commonShape === 'rect') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Rectangle"><Square size={16} /></button>
                                <button onClick={() => handleConvertShape('polygon')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'polygon') || (isMultiSelection && multiSelectionStats?.commonShape === 'polygon') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Polygon"><Hexagon size={16} /></button>
                                <button onClick={() => handleConvertShape('bubble')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'bubble') || (isMultiSelection && multiSelectionStats?.commonShape === 'bubble') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Bubble"><Circle size={16} /></button>
                            </div>
                        </div>

                        {/* Link Logic Button */}
                        {!isMultiSelection && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => toggleLink(selectedRoom!.id)}
                                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border flex items-center justify-center gap-2 ${connectionSourceId === selectedRoom!.id ? 'bg-yellow-50 border-yellow-300 text-yellow-600 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-400' : 'bg-white dark:bg-white/5 border-slate-200 dark:border-dark-border text-slate-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-600'}`}
                                >
                                    <Link size={14} className={connectionSourceId === selectedRoom!.id ? 'fill-current' : ''} /> {connectionSourceId === selectedRoom!.id ? 'Cancel' : 'Link'}
                                </button>

                                <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-dark-border p-1 gap-1">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest px-2">Text</span>
                                    <button
                                        onClick={() => updateRoom(selectedRoom!.id, { isTextUnlocked: !selectedRoom!.isTextUnlocked })}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedRoom!.isTextUnlocked ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200'}`}
                                        title={selectedRoom!.isTextUnlocked ? "Lock Text Position" : "Unlock Text to Move"}
                                    >
                                        {selectedRoom!.isTextUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                                    </button>
                                    <button
                                        onClick={() => updateRoom(selectedRoom!.id, { textPos: undefined })}
                                        disabled={!selectedRoom!.textPos}
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${!selectedRoom!.textPos ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-orange-600 hover:bg-white dark:hover:bg-dark-surface hover:shadow-sm dark:text-gray-400'}`}
                                        title="Reset Text Position"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {!isMultiSelection && (
                            <div className="space-y-3">
                                {/* Linked Spaces List */}
                                {(() => {
                                    const linkedConnections = connections.filter(c => c.fromId === selectedRoom!.id || c.toId === selectedRoom!.id);
                                    if (linkedConnections.length > 0) {
                                        return (
                                            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 border border-slate-100 dark:border-dark-border">
                                                <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Linked Spaces</span>
                                                <div className="space-y-1.5">
                                                    {linkedConnections.map(conn => {
                                                        const otherId = conn.fromId === selectedRoom!.id ? conn.toId : conn.fromId;
                                                        const otherRoom = allRooms.find(r => r.id === otherId) || { name: 'Unknown', zone: 'Default' };
                                                        return (
                                                            <div key={conn.id} className="flex items-center justify-between text-xs group">
                                                                <span className="font-bold text-slate-600 dark:text-gray-300 flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${zoneColors[otherRoom.zone]?.bg || 'bg-slate-300'}`} />
                                                                    {otherRoom.name}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setConnections(prev => prev.filter(c => c.id !== conn.id));
                                                                    }}
                                                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1"
                                                                    title="Unlink"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        )}

                        {!isMultiSelection ? (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Area</span>
                                        <div className="flex items-baseline gap-1">
                                            <input
                                                type="number"
                                                className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200 bg-transparent border-b border-transparent focus:border-orange-500 outline-none w-full"
                                                value={Number(selectedRoom!.area.toFixed(2))}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (!isNaN(val)) updateRoom(selectedRoom!.id, { area: val });
                                                }} />
                                            <small className="text-xs opacity-60">m²</small>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border flex justify-between items-center">
                                        <div>
                                            <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Floor</span>
                                            <span className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200">{floors.find(f => f.id === selectedRoom!.floor)?.label || 'N/A'}</span>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => {
                                                    const currentIdx = floors.findIndex(f => f.id === selectedRoom!.floor);
                                                    if (currentIdx < floors.length - 1) {
                                                        updateRoom(selectedRoom!.id, { floor: floors[currentIdx + 1].id });
                                                    }
                                                }}
                                                disabled={floors.findIndex(f => f.id === selectedRoom!.floor) >= floors.length - 1}
                                                className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                title="Move Up"
                                            >
                                                <ChevronUp size={14} />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const currentIdx = floors.findIndex(f => f.id === selectedRoom!.floor);
                                                    if (currentIdx > 0) {
                                                        updateRoom(selectedRoom!.id, { floor: floors[currentIdx - 1].id });
                                                    }
                                                }}
                                                disabled={floors.findIndex(f => f.id === selectedRoom!.floor) <= 0}
                                                className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                                title="Move Down"
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>


                                <div>
                                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3 block">Zone Category</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {Object.keys(zoneColors).map(z => (
                                            <button
                                                key={z}
                                                onClick={() => updateRoom(selectedRoom!.id, { zone: z })}
                                                className={`px-3 py-2 rounded-lg text-[10px] font-bold border ${selectedRoom!.zone === z ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-white/20'}`}
                                            >
                                                {z}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => {
                                                const name = prompt("Enter new zone name:");
                                                if (name) handleAddZone(name);
                                            }}
                                            className="px-3 py-2 rounded-lg text-[10px] font-bold border border-dashed border-slate-300 dark:border-white/20 text-slate-400 hover:text-orange-600 hover:border-orange-400 flex items-center justify-center gap-1"
                                        >
                                            <Plus size={12} /> New
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            // Multi-selection Summary
                            <div className="space-y-4">
                                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Area</span>
                                    </div>
                                    <div className="text-2xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                                        {Number(multiSelectionStats?.totalArea.toFixed(2))} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">m²</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-2">Breakdown</span>
                                    <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{multiSelectionStats?.breakdown}</p>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 border-t border-slate-100 dark:border-dark-border mt-auto">
                            <button onClick={() => {
                                if (isMultiSelection) {
                                    selectedRoomIds.forEach(id => deleteRoom(id));
                                    setSelectedRoomIds(new Set());
                                } else {
                                    deleteRoom(selectedRoom!.id);
                                }
                            }} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white flex items-center justify-center gap-2">
                                <Trash2 size={16} /> Delete Space
                            </button>
                        </div>
                    </div>
                ) : selectedZone ? (
                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Zone Name</label>
                            <div className="flex items-center gap-2">
                                <input
                                    className="w-full text-xl font-black text-slate-800 dark:text-gray-100 focus:outline-none focus:text-orange-600 bg-transparent border-b border-dashed border-slate-300 dark:border-dark-border focus:border-orange-500 pb-1"
                                    value={selectedZone}
                                    onChange={(e) => renameZone(selectedZone, e.target.value)}
                                />
                                <div className={`w-4 h-4 rounded-full ${zoneColors[selectedZone]?.bg || 'bg-slate-200'}`} />
                            </div>
                        </div>

                        <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Stats</span>
                                <span className="text-[10px] font-black px-2 py-0.5 bg-orange-500 text-white rounded-full uppercase">{selectedZoneRooms.length} Spaces</span>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                                        <span>Total Area</span>
                                        <span className="text-slate-800 dark:text-white">{Number(zoneArea.toFixed(2))} m²</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full" style={{ width: '100%' }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Spaces in this Zone</label>
                            <div className="space-y-2">
                                {selectedZoneRooms.map(r => (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedRoomIds(new Set([r.id]))}
                                        className="p-3 rounded-xl border border-slate-100 dark:border-dark-border hover:border-orange-200 hover:bg-orange-50/30 dark:hover:bg-orange-900/5 cursor-pointer flex justify-between items-center group transition-all"
                                    >
                                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300">{r.name}</span>
                                        <span className="text-[10px] font-black text-slate-400">{r.area} m²</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {/* Floor Settings - Shown when nothing is selected */}
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
                                        value={floors.find(f => f.id === currentFloor)?.label || ""}
                                        onChange={(e) => handleUpdateFloor(currentFloor, { label: e.target.value })}
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
                                            value={floors.find(f => f.id === currentFloor)?.height || 3}
                                            onChange={(e) => handleUpdateFloor(currentFloor, { height: parseFloat(e.target.value) || 0 })}
                                        />
                                        <div className="flex flex-col gap-1">
                                            <button
                                                onClick={() => handleUpdateFloor(currentFloor, { height: (floors.find(f => f.id === currentFloor)?.height || 3) + 0.1 })}
                                                className="p-1 hover:bg-white dark:hover:bg-white/10 rounded shadow-sm border border-slate-200 dark:border-dark-border text-slate-400 hover:text-orange-600"
                                            >
                                                <ChevronUp size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleUpdateFloor(currentFloor, { height: Math.max(0, (floors.find(f => f.id === currentFloor)?.height || 3) - 0.1) })}
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

                        <div className="border-t border-slate-100 dark:border-dark-border pt-8 flex flex-col items-center justify-center text-center opacity-40">
                            <Square size={24} className="text-slate-200 dark:text-gray-700 mb-2" />
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500">
                                Select a space to<br />edit individual properties
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
};
