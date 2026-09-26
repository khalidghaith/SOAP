import React from 'react';
import { Room, AppSettings, ZoneColor } from '../types';

interface ZonePropertiesPanelProps {
    selectedZone: string;
    selectedZoneRooms: Room[];
    zoneArea: number;
    zoneColors: Record<string, ZoneColor>;
    setZoneColors: React.Dispatch<React.SetStateAction<Record<string, ZoneColor>>>;
    colorPalette: ZoneColor[];
    appSettings: AppSettings;
    addToHistory: () => void;
    renameZone: (oldZone: string, newZone: string) => void;
    setSelectedRoomIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/** Right-sidebar details for the selected zone. */
export const ZonePropertiesPanel: React.FC<ZonePropertiesPanelProps> = ({
    selectedZone, selectedZoneRooms, zoneArea, zoneColors, setZoneColors, colorPalette: COLOR_PALETTE,
    appSettings, addToHistory, renameZone, setSelectedRoomIds,
}) => (
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

            <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2 block">Zone Color</label>
                <div className="flex flex-wrap gap-2 p-3 glass-card rounded-xl">
                    {COLOR_PALETTE.map((style, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                addToHistory();
                                setZoneColors(prev => ({ ...prev, [selectedZone]: style }));
                            }}
                            className={`w-6 h-6 rounded-full ${style.bg} shadow-sm ring-2 ring-offset-2 ring-offset-white dark:ring-offset-dark-surface ${zoneColors[selectedZone]?.bg === style.bg ? 'ring-slate-900 dark:ring-white scale-110' : 'ring-transparent hover:scale-110 transition-transform'}`}
                            title="Select Color"
                        />
                    ))}
                </div>
            </div>

            <div className="p-5 glass-card rounded-2xl">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase">Total Stats</span>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-500/10 px-2 py-1 rounded-md">{selectedZoneRooms.length} Spaces</span>
                </div>
                <div className="text-3xl font-sans font-bold text-slate-800 dark:text-gray-100 tracking-tight">
                    {appSettings.unitSystem === 'imperial' ? Number((zoneArea * 10.7639).toFixed(1)) : Number(zoneArea.toFixed(2))} <span className="text-sm font-sans text-slate-400 dark:text-gray-500 font-bold">{appSettings.unitSystem === 'imperial' ? 'sq ft' : 'm²'}</span>
                </div>
            </div>

            <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3 block flex justify-between">
                    Included Spaces
                </label>
                <div className="space-y-2">
                    {selectedZoneRooms.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-3 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl hover:shadow-md hover:border-orange-300 dark:hover:border-orange-800 cursor-pointer group"
                            onClick={() => setSelectedRoomIds(new Set([r.id]))}>
                            <span className="text-sm font-bold text-slate-700 dark:text-gray-300 group-hover:text-orange-600">{r.name}</span>
                            <span className="text-[10px] font-sans text-slate-400 dark:text-gray-500">{appSettings.unitSystem === 'imperial' ? `${Number((r.area * 10.7639).toFixed(1))} sq ft` : `${r.area} m²`}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
);
