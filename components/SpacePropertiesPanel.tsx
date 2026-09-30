import React from 'react';
import { Plus, RotateCcw, Hexagon, Circle, Square, X, Trash2, Lock, Unlock, Link, Sun, ChevronUp, ChevronDown, TreePine, Building2, Home, ArrowUpDown } from 'lucide-react';
import { Room, Connection, Floor, AppSettings, ZoneColor, SpaceType, VCType, DEFAULT_STAIR_PARAMS } from '../types';
import stairSvgRaw from '../lib/symbols/stairs.svg?raw';
import elevatorSvgRaw from '../lib/symbols/Elevator.svg?raw';
import rampSvgRaw from '../lib/symbols/Ramp.svg?raw';

interface SpacePropertiesPanelProps {
    rooms: Room[];
    floors: Floor[];
    connections: Connection[];
    onRemoveConnection: (id: string) => void;
    zoneColors: Record<string, ZoneColor>;
    appSettings: AppSettings;
    selectedRoom: Room | undefined;
    selectedRoomIds: Set<string>;
    setSelectedRoomIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectedRoomsList: Room[];
    isMultiSelection: boolean;
    multiSelectionStats: { totalArea: number; breakdown: string; commonShape: string | null } | null;
    connectionSourceId: string | null;
    updateRoom: (id: string, updates: Partial<Room>) => void;
    deleteRoom: (id: string) => void;
    toggleLink: (roomId: string) => void;
    handleAddZone: (name: string) => void;
    handleConvertShape: (shape: 'rect' | 'polygon' | 'bubble') => void;
    handleMoveSelectionFloors: (direction: 1 | -1) => void;
}

/** Right-sidebar details for the selected space (or a multi-selection). */
export const SpacePropertiesPanel: React.FC<SpacePropertiesPanelProps> = ({
    rooms, floors, connections, onRemoveConnection, zoneColors, appSettings,
    selectedRoom, selectedRoomIds, setSelectedRoomIds, selectedRoomsList, isMultiSelection, multiSelectionStats,
    connectionSourceId, updateRoom, deleteRoom, toggleLink, handleAddZone, handleConvertShape, handleMoveSelectionFloors,
}) => (
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
                <div className="flex glass-card p-1 rounded-xl">
                    <button onClick={() => handleConvertShape('rect')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && (!selectedRoom?.shape || selectedRoom?.shape === 'rect')) || (isMultiSelection && multiSelectionStats?.commonShape === 'rect') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Rectangle"><Square size={16} /></button>
                    <button onClick={() => handleConvertShape('polygon')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'polygon') || (isMultiSelection && multiSelectionStats?.commonShape === 'polygon') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Polygon"><Hexagon size={16} /></button>
                    <button onClick={() => handleConvertShape('bubble')} className={`flex-1 flex items-center justify-center py-2 rounded-lg ${(!isMultiSelection && selectedRoom?.shape === 'bubble') || (isMultiSelection && multiSelectionStats?.commonShape === 'bubble') ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`} title="Bubble"><Circle size={16} /></button>
                </div>
            </div>

            {/* Space Type Selector */}
            {!isMultiSelection && (
                <div>
                    <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Space Type</label>
                    <div className="grid grid-cols-3 glass-card p-1 rounded-xl gap-0.5">
                        {[
                            { type: 'standard' as SpaceType, icon: <Home size={13} />, label: 'Standard' },
                            { type: 'outdoor' as SpaceType, icon: <Sun size={13} />, label: 'Outdoor' },
                            { type: 'terrace' as SpaceType, icon: <TreePine size={13} />, label: 'Terrace' },
                            { type: 'multistory' as SpaceType, icon: <Building2 size={13} />, label: 'Multi' },
                            { type: 'verticalConnection' as SpaceType, icon: <ArrowUpDown size={13} />, label: 'Vert.C' },
                        ].map(item => (
                            <button
                                key={item.type}
                                onClick={() => updateRoom(selectedRoom!.id, {
                                    spaceType: item.type,
                                    ...(item.type === 'verticalConnection' && !selectedRoom!.vcType ? {
                                        vcType: 'stair' as VCType,
                                        vcFromFloor: Math.min(...floors.map(f => f.id)),
                                        vcToFloor: Math.max(...floors.map(f => f.id)),
                                        stairParams: { ...DEFAULT_STAIR_PARAMS },
                                        zone: 'Circulation',
                                    } : {}),
                                    ...(item.type === 'multistory' && !selectedRoom!.msFromFloor ? {
                                        msFromFloor: selectedRoom!.floor,
                                        msToFloor: Math.min(Math.max(...floors.map(f => f.id)), selectedRoom!.floor + 1),
                                    } : {}),
                                })}
                                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-bold transition-all ${
                                    (selectedRoom?.spaceType || 'standard') === item.type
                                        ? 'bg-white dark:bg-dark-surface shadow-sm text-orange-600'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
                                }`}
                                title={item.label}
                            >
                                {item.icon}
                                <span className="hidden sm:inline">{item.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Multistory: floor range input */}
                    {(selectedRoom?.spaceType === 'multistory') && (() => {
                        const msFrom = selectedRoom.msFromFloor ?? selectedRoom.floor;
                        const msTo = selectedRoom.msToFloor ?? selectedRoom.floor;

                        return (
                            <div className="mt-3 bg-slate-50/50 dark:bg-white/5 rounded-xl p-3 border border-slate-100/30 dark:border-dark-border/30">
                                <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">Floor Range</span>
                                <div className="flex gap-2 items-center">
                                    <div className="flex-1">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase">From</label>
                                        <select
                                            value={msFrom}
                                            onChange={(e) => updateRoom(selectedRoom!.id, { msFromFloor: parseInt(e.target.value) })}
                                            className="w-full text-xs font-bold text-slate-700 dark:text-gray-200 bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-dark-border/30 rounded-lg p-1.5 focus:outline-none focus:border-orange-500"
                                        >
                                            {floors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                        </select>
                                    </div>
                                    <ArrowUpDown size={14} className="text-slate-300 mt-3" />
                                    <div className="flex-1">
                                        <label className="text-[8px] font-bold text-slate-400 uppercase">To</label>
                                        <select
                                            value={msTo}
                                            onChange={(e) => updateRoom(selectedRoom!.id, { msToFloor: parseInt(e.target.value) })}
                                            className="w-full text-xs font-bold text-slate-700 dark:text-gray-200 bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-dark-border/30 rounded-lg p-1.5 focus:outline-none focus:border-orange-500"
                                        >
                                            {floors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Vertical Connection sub-panel */}
                    {(selectedRoom?.spaceType === 'verticalConnection') && (() => {
                        const vcType = selectedRoom.vcType || 'stair';
                        const vcFrom = selectedRoom.vcFromFloor ?? Math.min(...floors.map(f => f.id));
                        const vcTo = selectedRoom.vcToFloor ?? Math.max(...floors.map(f => f.id));

                        return (
                            <div className="mt-3 space-y-3">
                                {/* VC Type selector */}
                                <div className="bg-slate-50/50 dark:bg-white/5 rounded-xl p-3 border border-slate-100/30 dark:border-dark-border/30 space-y-3">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Connection Type</span>
                                    <div className="flex bg-white dark:bg-dark-surface p-1 rounded-lg gap-0.5 border border-slate-100/30 dark:border-dark-border/30">
                                        {(['stair', 'elevator', 'ramp'] as VCType[]).map(t => (
                                            <button
                                                key={t}
                                                onClick={() => updateRoom(selectedRoom!.id, {
                                                    vcType: t,
                                                })}
                                                className={`flex-1 py-1.5 px-1 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all ${
                                                    vcType === t
                                                        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-gray-300'
                                                }`}
                                            >
                                                <div
                                                    className="w-3.5 h-3.5 flex items-center justify-center shrink-0"
                                                    dangerouslySetInnerHTML={{
                                                        __html: (t === 'stair' ? stairSvgRaw : t === 'elevator' ? elevatorSvgRaw : rampSvgRaw)
                                                            .replaceAll('stroke:black', 'stroke:currentColor')
                                                            .replaceAll('stroke:#000000', 'stroke:currentColor')
                                                            .replaceAll('fill:black', 'fill:currentColor')
                                                    }}
                                                />
                                                <span>{t === 'stair' ? 'Stair' : t === 'elevator' ? 'Elevator' : 'Ramp'}</span>
                                            </button>
                                        ))}

                                    </div>

                                    {/* Floor Range */}
                                    <div>
                                        <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">Floor Range</span>
                                        <div className="flex gap-2 items-center">
                                            <div className="flex-1">
                                                <label className="text-[8px] font-bold text-slate-400 uppercase">From</label>
                                                <select
                                                    value={vcFrom}
                                                    onChange={(e) => updateRoom(selectedRoom!.id, { vcFromFloor: parseInt(e.target.value) })}
                                                    className="w-full text-xs font-bold text-slate-700 dark:text-gray-200 bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-dark-border/30 rounded-lg p-1.5 focus:outline-none focus:border-orange-500"
                                                >
                                                    {floors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                                </select>
                                            </div>
                                            <ArrowUpDown size={14} className="text-slate-300 mt-3" />
                                            <div className="flex-1">
                                                <label className="text-[8px] font-bold text-slate-400 uppercase">To</label>
                                                <select
                                                    value={vcTo}
                                                    onChange={(e) => updateRoom(selectedRoom!.id, { vcToFloor: parseInt(e.target.value) })}
                                                    className="w-full text-xs font-bold text-slate-700 dark:text-gray-200 bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-dark-border/30 rounded-lg p-1.5 focus:outline-none focus:border-orange-500"
                                                >
                                                    {floors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

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
                                <div className="glass-card rounded-xl p-3">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-2">Linked Spaces</span>
                                    <div className="space-y-1.5">
                                        {linkedConnections.map(conn => {
                                            const otherId = conn.fromId === selectedRoom!.id ? conn.toId : conn.fromId;
                                            const otherRoom = rooms.find(r => r.id === otherId);
                                            if (!otherRoom) return null;
                                            return (
                                                <div key={conn.id} className="flex items-center justify-between text-xs group">
                                                    <span className="font-bold text-slate-600 dark:text-gray-300 flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${zoneColors[otherRoom.zone]?.bg || 'bg-slate-300'}`} />
                                                        {otherRoom.name}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onRemoveConnection(conn.id);
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
                        <div className="p-4 glass-card rounded-2xl">
                            <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Area</span>
                            <div className="flex items-baseline gap-1">
                                <input
                                    type="number"
                                    className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200 bg-transparent border-b border-transparent focus:border-orange-500 outline-none w-full"
                                    value={appSettings.unitSystem === 'imperial' ? Number((selectedRoom!.area * 10.7639).toFixed(1)) : Number(selectedRoom!.area.toFixed(2))}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) updateRoom(selectedRoom!.id, { area: appSettings.unitSystem === 'imperial' ? val / 10.7639 : val });
                                    }} />
                                <small className="text-xs opacity-60 font-bold">{appSettings.unitSystem === 'imperial' ? 'sq ft' : 'm²'}</small>
                            </div>
                        </div>
                        <div className="p-4 glass-card rounded-2xl flex justify-between items-center">
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

                    {/* Architectural Hatch Styling */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Architectural Hatch</label>
                        <div className="space-y-3 glass-card rounded-2xl p-4">
                            {/* Hatch Pattern Selector */}
                            <div>
                                <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">Pattern</span>
                                <select
                                    value={selectedRoom?.style?.hatchPattern || 'none'}
                                    onChange={(e) => {
                                        const pattern = e.target.value as any;
                                        const style = { ...selectedRoom?.style, hatchPattern: pattern };
                                        updateRoom(selectedRoom!.id, { style });
                                    }}
                                    className="w-full text-xs font-bold text-slate-700 dark:text-gray-200 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg p-2 focus:outline-none focus:border-orange-500"
                                >
                                    <option value="none">None</option>
                                    <option value="diagonal">Diagonal Lines</option>
                                    <option value="cross">Cross Hatch</option>
                                    <option value="dots">Stipple Dots</option>
                                    <option value="concrete">Concrete</option>
                                    <option value="brick">Brick</option>
                                </select>
                            </div>

                            {selectedRoom?.style?.hatchPattern && selectedRoom?.style?.hatchPattern !== 'none' && (
                                <>
                                    {/* Hatch Scale */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Scale</span>
                                            <span className="text-[10px] font-bold text-slate-700 dark:text-gray-300">{(selectedRoom?.style?.hatchScale ?? 1.0).toFixed(1)}x</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="3.0"
                                            step="0.1"
                                            value={selectedRoom?.style?.hatchScale ?? 1.0}
                                            onChange={(e) => {
                                                const scale = parseFloat(e.target.value);
                                                const style = { ...selectedRoom?.style, hatchScale: scale };
                                                updateRoom(selectedRoom!.id, { style });
                                            }}
                                            className="w-full accent-orange-500 text-orange-600 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none h-1 cursor-pointer"
                                        />
                                    </div>

                                    {/* Hatch Color */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Hatch Color</span>
                                            <span className="text-[10px] font-mono text-slate-500">{selectedRoom?.style?.hatchColor || 'Auto'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={selectedRoom?.style?.hatchColor || '#cbd5e1'}
                                                onChange={(e) => {
                                                    const style = { ...selectedRoom?.style, hatchColor: e.target.value };
                                                    updateRoom(selectedRoom!.id, { style });
                                                }}
                                                className="w-8 h-8 rounded border border-slate-200 dark:border-dark-border cursor-pointer bg-transparent"
                                            />
                                            <button
                                                onClick={() => {
                                                    const style = { ...selectedRoom?.style };
                                                    delete style.hatchColor;
                                                    updateRoom(selectedRoom!.id, { style });
                                                }}
                                                className="px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-dark-border rounded text-slate-500 hover:text-orange-600 hover:border-orange-500 transition-colors"
                                            >
                                                Use Auto
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
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
                    <div className="p-5 glass-card rounded-2xl">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Area</span>
                        </div>
                        <div className="text-2xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                            {appSettings.unitSystem === 'imperial' ? Number(((multiSelectionStats?.totalArea ?? 0) * 10.7639).toFixed(1)) : Number((multiSelectionStats?.totalArea ?? 0).toFixed(2))} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">{appSettings.unitSystem === 'imperial' ? 'sq ft' : 'm²'}</span>
                        </div>
                    </div>
                    <div className="p-4 glass-card rounded-2xl flex justify-between items-center">
                        <div>
                            <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase block mb-1">Floor</span>
                            <span className="text-lg font-sans font-bold text-slate-700 dark:text-gray-200">
                                {(() => {
                                    if (selectedRoomsList.length === 0) return 'N/A';
                                    const firstFloor = selectedRoomsList[0].floor;
                                    const allSame = selectedRoomsList.every(r => r.floor === firstFloor);
                                    return allSame ? (floors.find(f => f.id === firstFloor)?.label || 'N/A') : 'Mixed';
                                })()}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => handleMoveSelectionFloors(1)}
                                disabled={selectedRoomsList.every(r => floors.findIndex(f => f.id === r.floor) >= floors.length - 1)}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                title="Move Selection Up"
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                onClick={() => handleMoveSelectionFloors(-1)}
                                disabled={selectedRoomsList.every(r => floors.findIndex(f => f.id === r.floor) <= 0)}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 hover:text-orange-600 disabled:opacity-30"
                                title="Move Selection Down"
                            >
                                <ChevronDown size={14} />
                            </button>
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
);
