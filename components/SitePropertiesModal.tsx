import React, { useState, useEffect } from 'react';
import { X, Globe, Navigation, Compass as CompassIcon, MapPin, Search, Loader2 } from 'lucide-react';
import { SiteProperties } from '../types';

interface SitePropertiesModalProps {
    properties: SiteProperties;
    onUpdate: (properties: SiteProperties) => void;
    onClose: () => void;
}

interface GeocodeResult {
    display_name: string;
    lat: string;
    lon: string;
}

export const SitePropertiesModal: React.FC<SitePropertiesModalProps> = ({ properties, onUpdate, onClose }) => {
    const [searchQuery, setSearchQuery] = useState(properties.locationName || '');
    const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [shouldShowSuggestions, setShouldShowSuggestions] = useState(false);
    const [mapUrl, setMapUrl] = useState('');

    // Update embedded Google Map URL in real-time as coordinates change
    useEffect(() => {
        const lat = properties.latitude || 0;
        const lon = properties.longitude || 0;
        // Free and standard Google Maps embed by latitude/longitude coordinates
        const url = `https://maps.google.com/maps?q=${lat},${lon}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
        setMapUrl(url);
    }, [properties.latitude, properties.longitude]);

    // Debounced Autocomplete Search as the user types
    useEffect(() => {
        if (!shouldShowSuggestions || searchQuery.trim().length < 3) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&addressdetails=1`,
                    {
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'SOAP-Architecture-App'
                        }
                    }
                );
                const data = await res.json();
                if (Array.isArray(data) && shouldShowSuggestions) {
                    setSearchResults(data);
                }
            } catch (err) {
                console.error("Autocomplete search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }, 400); // 400ms debounce interval

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, shouldShowSuggestions]);

    const handleChange = (key: keyof SiteProperties, value: any) => {
        onUpdate({ ...properties, [key]: value });
    };

    const handleAnglePreset = (angle: number) => {
        handleChange('northAngle', angle);
    };

    // User types in search query
    const handleInputChange = (val: string) => {
        setSearchQuery(val);
        setShouldShowSuggestions(true);
    };

    // Manual form submit (press Enter)
    const handleSearchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setShouldShowSuggestions(true);
        setIsSearching(true);

        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'SOAP-Architecture-App'
                    }
                }
            );
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                setSearchResults(data);
            } else {
                alert("No locations found matching your search.");
            }
        } catch (err) {
            console.error("Lookup search failed:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectResult = (result: GeocodeResult) => {
        const lat = parseFloat(result.lat) || 0;
        const lon = parseFloat(result.lon) || 0;
        
        setShouldShowSuggestions(false);
        setSearchResults([]);
        setSearchQuery(result.display_name);

        onUpdate({
            ...properties,
            locationName: result.display_name,
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lon.toFixed(6))
        });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dark-surface w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-white/10 flex flex-col h-[90vh] md:h-[80vh] max-h-[90vh] animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-sm">
                            <CompassIcon size={20} className="animate-spin-slow" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 dark:text-gray-100 uppercase tracking-tight">Site & Environmental Context</h2>
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Link layout coordinates directly to Google Maps for exact solar & shadow analysis</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Content Area - Split Panel Grid */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
                    {/* Left Column: Coordinates & Controls (Scrollable) */}
                    <div className="w-full md:w-5/12 p-6 overflow-y-auto space-y-6 md:border-r border-slate-100 dark:border-dark-border custom-scrollbar">
                        {/* Interactive Geocoder Autocomplete */}
                        <div className="space-y-3 relative">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                                <Search size={14} className="text-orange-500" />
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Search Real Location</h3>
                            </div>
                            <form onSubmit={handleSearchSubmit} className="flex gap-2 relative">
                                <div className="relative flex-1">
                                    <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text"
                                        placeholder="Type city or landmark to suggest..."
                                        value={searchQuery}
                                        onChange={(e) => handleInputChange(e.target.value)}
                                        onFocus={() => setShouldShowSuggestions(true)}
                                        className="w-full text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-9 pr-8 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none font-medium text-slate-800 dark:text-slate-200 transition-all font-sans"
                                    />
                                    {isSearching && (
                                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                            <Loader2 size={14} className="animate-spin text-orange-500" />
                                        </div>
                                    )}
                                </div>
                            </form>

                            {/* Autocomplete suggestions dropdown overlay */}
                            {searchResults.length > 0 && (
                                <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-250 dark:border-white/10 rounded-2xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 dark:divide-white/5 z-[300] custom-scrollbar">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSelectResult(result)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-xs text-slate-700 dark:text-gray-300 transition-colors truncate block font-medium"
                                        >
                                            {result.display_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Location Details (Latitude / Longitude) */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                                <Globe size={14} className="text-orange-500" />
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Selected Coordinates</h3>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Address</label>
                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-xl p-3 select-all truncate leading-relaxed">
                                    {properties.locationName || 'No address selected'}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latitude (°)</label>
                                    <input 
                                        type="number"
                                        min="-90"
                                        max="90"
                                        step="0.000001"
                                        value={properties.latitude}
                                        onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                                        className="w-full text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none font-mono text-slate-800 dark:text-slate-200 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Longitude (°)</label>
                                    <input 
                                        type="number"
                                        min="-180"
                                        max="180"
                                        step="0.000001"
                                        value={properties.longitude}
                                        onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
                                        className="w-full text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none font-mono text-slate-800 dark:text-slate-200 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-slate-100 dark:bg-dark-border" />

                        {/* Orientation Dial Controls */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-white/5">
                                <Navigation size={14} className="text-orange-500 rotate-45" />
                                <h3 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Site True North</h3>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-gray-300">
                                    <span>North Angle Rotation</span>
                                    <span className="text-orange-600 dark:text-orange-400 font-mono font-bold">{properties.northAngle || 0}°</span>
                                </div>
                                <input 
                                    type="range" min="0" max="359" step="1" 
                                    value={properties.northAngle || 0} 
                                    onChange={(e) => handleChange('northAngle', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Compass Angle Presets */}
                            <div className="flex bg-slate-50 dark:bg-white/5 p-1 rounded-2xl border border-slate-200/50 dark:border-white/5 gap-1.5 justify-between">
                                {[
                                    { label: '0° N', val: 0 },
                                    { label: '90° E', val: 90 },
                                    { label: '180° S', val: 180 },
                                    { label: '270° W', val: 270 }
                                ].map(preset => (
                                    <button
                                        key={preset.val}
                                        onClick={() => handleAnglePreset(preset.val)}
                                        className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                                            properties.northAngle === preset.val
                                                ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm border-orange-200/40 dark:border-orange-500/10'
                                                : 'text-slate-400 dark:text-gray-500 hover:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-white/5 border-transparent'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Embedded Google Map View & Rotate Compass */}
                    <div className="w-full md:w-7/12 p-6 flex flex-col gap-6 bg-slate-50/50 dark:bg-white/2 select-none h-full min-h-[350px] md:min-h-0">
                        {/* Map Panel */}
                        <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-white/10 rounded-3xl overflow-hidden shadow-inner relative group min-h-[250px] md:min-h-0">
                            {mapUrl ? (
                                <iframe 
                                    src={mapUrl}
                                    title="Google Map Context Location"
                                    className="w-full h-full border-0 absolute inset-0"
                                    allowFullScreen
                                    loading="lazy"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 dark:text-gray-500">
                                    Map Context Pending Location Selection
                                </div>
                            )}
                            
                            {/* Glass overlay header on map */}
                            <div className="absolute top-3 left-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-sm border border-slate-200/50 dark:border-white/10 text-[9px] font-bold text-slate-600 dark:text-gray-300 pointer-events-none flex items-center gap-1.5">
                                <Globe size={11} className="text-orange-500 animate-spin-slow" /> Google Maps Context View
                            </div>
                        </div>

                        {/* True North Angle Dial Previewer */}
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-dark-surface border border-slate-200/50 dark:border-white/10 rounded-3xl shadow-sm shrink-0">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-black text-slate-800 dark:text-gray-100 uppercase tracking-wide">True North Angle</span>
                                <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Visualizing site orientation relative to true N</span>
                            </div>
                            
                            <div className="relative w-16 h-16 flex items-center justify-center bg-slate-50 dark:bg-white/5 rounded-full border border-slate-100 dark:border-white/5">
                                <div 
                                    className="w-12 h-12 transition-transform duration-100 ease-out"
                                    style={{ transform: `rotate(${properties.northAngle || 0}deg)` }}
                                >
                                    <svg width="100%" height="100%" viewBox="0 0 100 100" className="stroke-slate-700 dark:stroke-slate-350 fill-none">
                                        <circle cx="50" cy="50" r="44" strokeWidth="0.5" strokeDasharray="2, 4" className="stroke-slate-300 dark:stroke-slate-700" />
                                        <path d="M5,50 L95,50" strokeWidth="0.3" strokeDasharray="1, 1" className="stroke-slate-400" />
                                        <path d="M50,5 L50,95" strokeWidth="0.3" strokeDasharray="1, 1" className="stroke-slate-400" />
                                        <path d="M50,15 L55,42 L50,48 L45,42 Z" fill="#ea580c" className="stroke-orange-600" strokeWidth="0.8" />
                                        <path d="M50,85 L55,58 L50,52 L45,58 Z" fill="#94a3b8" className="stroke-slate-400" strokeWidth="0.8" />
                                    </svg>
                                </div>
                                <div className="absolute top-0 text-[8px] font-black text-orange-600">N</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-white/5 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl font-bold text-xs hover:scale-105 active:scale-95 transition-all shadow-md"
                    >
                        Apply Context
                    </button>
                </div>
            </div>
        </div>
    );
};
