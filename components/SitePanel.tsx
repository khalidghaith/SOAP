import React, { useState } from 'react';
import { LandPlot, MousePointer2, PenLine, Ban, Import, Satellite, Trash2, Eye, EyeOff, AlertTriangle, CheckCircle2, Loader2, X, RotateCcw, RotateCw, AlignHorizontalJustifyCenter } from 'lucide-react';
import { SiteProperties, SiteConstraints } from '../types';
import { SiteReport, KmlShape, alignEdgeRotation } from '../utils/site';
import type { SiteSelection, SiteTool } from './SiteLayer';

interface SitePanelProps {
    site: SiteProperties;
    report: SiteReport | null;
    tool: SiteTool;
    selection: SiteSelection | null;
    onToolChange: (t: SiteTool) => void;
    onSelect: (s: SiteSelection | null) => void;
    onInteractionStart: () => void;
    onChange: (updates: Partial<SiteProperties>) => void;
    onImportFile: (file: File) => Promise<KmlShape[]>;
    onApplyShape: (shape: KmlShape) => void;
    onAddImagery: () => Promise<void>;
    onRotate: (deg: number) => void; // clockwise, about the site centre
    onSelectRoom: (roomId: string) => void;
}

const REASON: Record<string, string> = {
    outsideBoundary: 'outside the site boundary',
    outsideSetback: 'inside the setback',
    inZone: 'in',
};

const NumberField: React.FC<{
    label: string; value: number | undefined; unit: string; step?: number; placeholder?: string;
    onFocus: () => void; onChange: (v: number | undefined) => void;
}> = ({ label, value, unit, step = 0.5, placeholder = '—', onFocus, onChange }) => (
    <label className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500 dark:text-gray-400">
        <span className="truncate">{label}</span>
        <span className="flex items-center gap-1 shrink-0">
            <input
                type="number" min={0} step={step} value={value ?? ''} placeholder={placeholder}
                onFocus={onFocus}
                onChange={e => onChange(e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-16 text-right text-[11px] font-mono bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1 px-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500/40 text-slate-800 dark:text-slate-200"
            />
            <span className="w-5 text-slate-400">{unit}</span>
        </span>
    </label>
);

const Stat: React.FC<{ label: string; value: string; limit?: string; exceeded?: boolean }> = ({ label, value, limit, exceeded }) => (
    <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-slate-500 dark:text-gray-400 font-semibold">{label}</span>
        <span className={`font-mono font-bold ${exceeded ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-gray-200'}`}>
            {value}{limit && <span className="text-slate-400 font-normal"> / {limit}</span>}
        </span>
    </div>
);

export const SitePanel: React.FC<SitePanelProps> = ({
    site, report, tool, selection, onToolChange, onSelect, onInteractionStart, onChange,
    onImportFile, onApplyShape, onAddImagery, onRotate, onSelectRoom,
}) => {
    const [shapes, setShapes] = useState<KmlShape[] | null>(null);
    const [busy, setBusy] = useState<'import' | 'imagery' | null>(null);
    const [rotateBy, setRotateBy] = useState('');
    const c: SiteConstraints = site.constraints || { defaultSetback: 0 };
    const hasBoundary = !!site.boundary && site.boundary.length >= 3;
    const visible = site.showSite !== false;
    const zone = selection?.kind === 'zone' ? site.zones?.find(z => z.id === selection.zoneId) : undefined;
    const edge = selection?.kind === 'boundary' && selection.edge !== undefined ? selection.edge : undefined;

    const setConstraints = (updates: Partial<SiteConstraints>) => onChange({ constraints: { ...c, ...updates } });
    const setEdgeSetback = (i: number, v: number | undefined) => {
        const n = site.boundary?.length || 0;
        const eds = Array.from({ length: n }, (_, k) => c.edgeSetbacks?.[k] ?? null);
        eds[i] = v === undefined ? null : v;
        setConstraints({ edgeSetbacks: eds });
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy('import');
        try {
            const found = await onImportFile(file);
            if (found.length === 1) onApplyShape(found[0]);
            else if (found.length > 1) setShapes(found);
        } finally {
            setBusy(null);
        }
    };

    const handleImagery = async () => {
        setBusy('imagery');
        try { await onAddImagery(); } finally { setBusy(null); }
    };

    const toolButton = (t: SiteTool, icon: React.ReactNode, label: string, disabled = false) => (
        <button
            onClick={() => onToolChange(tool === t && t !== 'select' ? 'select' : t)}
            disabled={disabled}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border disabled:opacity-40 ${tool === t
                ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                : 'text-slate-500 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:border-orange-300 hover:text-orange-600'}`}
            title={label}
        >
            {icon}{label}
        </button>
    );

    const drawingHint = tool === 'boundary' || tool === 'zone'
        ? 'Click to add corners; click the first point or press Enter to close. Snaps to corners, midpoints, edges, guides and 45° / square tracking. Type a length and press Enter for an exact side. Shift locks the angle, Alt snaps off, Backspace undoes a point, Esc cancels.'
        : hasBoundary
            ? 'Click an edge to set its setback or align it to the street. Drag the site or a zone to move it, drag corners to reshape, double-click an edge to add a corner, Delete removes a selected corner or zone.'
            : 'Draw the property line, or import it from Google Earth.';

    return (
        <div
            className="w-64 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar bg-white/90 dark:bg-dark-surface/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-dark-border shadow-xl flex flex-col gap-3 animate-in slide-in-from-left-4 pointer-events-auto"
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-dark-border pb-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400 flex items-center gap-2">
                    <LandPlot size={12} /> Site
                </h3>
                <button
                    onClick={() => onChange({ showSite: !visible })}
                    className="p-1 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-slate-100 dark:hover:bg-white/5"
                    title={visible ? 'Hide site outside site mode' : 'Show site on the canvas'}
                >
                    {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
            </div>

            {/* Tools */}
            <div className="flex gap-1.5">
                {toolButton('select', <MousePointer2 size={14} />, 'Edit')}
                {toolButton('boundary', <PenLine size={14} />, hasBoundary ? 'Redraw' : 'Boundary')}
                {toolButton('zone', <Ban size={14} />, 'No-build', !hasBoundary)}
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-gray-400">{drawingHint}</p>

            {/* Google Earth */}
            <div className="flex flex-col gap-1.5">
                <label className={`w-full py-2 bg-slate-100 dark:bg-white/5 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-dashed border-slate-300 dark:border-dark-border hover:border-orange-300 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400 hover:text-orange-600 cursor-pointer flex items-center justify-center gap-2 transition-all ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                    {busy === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Import size={14} />} Google Earth (KML/KMZ)
                    <input type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={handleFile} />
                </label>
                <details className="text-[10px] text-slate-500 dark:text-gray-400">
                    <summary className="cursor-pointer font-semibold hover:text-orange-600">How to export from Google Earth</summary>
                    <p className="mt-1 leading-relaxed">
                        Google Earth Pro: <b>Add → Polygon</b>, trace the site, then right-click it in Places → <b>Save Place As…</b> (.kmz).
                        Google Earth Web: <b>Draw line or shape</b>, close the shape, then in the project menu choose <b>Export as KML file</b>.
                        The site is placed using the current north angle ({site.northAngle || 0}°).
                    </p>
                </details>
                <button
                    onClick={handleImagery}
                    disabled={!!busy}
                    className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400 hover:text-orange-600 hover:border-orange-300 disabled:opacity-50 transition-all"
                    title="Adds an aerial photo of the site as a locked reference image, scaled and rotated to match"
                >
                    {busy === 'imagery' ? <Loader2 size={14} className="animate-spin" /> : <Satellite size={14} />} Satellite underlay
                </button>
            </div>

            {/* Choose one of several shapes from the file */}
            {shapes && (
                <div className="rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/60 dark:bg-orange-500/10 p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">
                        Pick the site outline
                        <button onClick={() => setShapes(null)} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                    </div>
                    {shapes.map((s, i) => (
                        <button key={i} onClick={() => { onApplyShape(s); setShapes(null); }}
                            className="text-left text-[11px] px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-white/10 text-slate-700 dark:text-gray-200 truncate">
                            {s.name} <span className="text-slate-400">· {s.kind === 'polygon' ? 'polygon' : 'path'}, {s.coords.length} pts</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Selected zone */}
            {zone && (
                <div className="rounded-xl border border-red-200 dark:border-red-500/30 p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                        <input
                            value={zone.name}
                            onFocus={onInteractionStart}
                            onChange={e => onChange({ zones: (site.zones || []).map(z => z.id === zone.id ? { ...z, name: e.target.value } : z) })}
                            className="flex-1 min-w-0 text-[11px] font-semibold bg-transparent border-b border-slate-200 dark:border-white/10 focus:outline-none focus:border-orange-500 text-slate-800 dark:text-gray-100"
                        />
                        <button
                            onClick={() => { onInteractionStart(); onChange({ zones: (site.zones || []).filter(z => z.id !== zone.id) }); onSelect(null); }}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Delete zone"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                    <p className="text-[9px] text-slate-400">Easement, right of way, protected tree… Nothing may be built here, including basements. Drag the zone to move it, drag its corners to reshape it.</p>
                </div>
            )}

            {/* Orientation: turn the site so the plan's axes follow the street */}
            {hasBoundary && (
                <div className="flex flex-col gap-1.5 border-t border-slate-100 dark:border-dark-border pt-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Orientation</h4>
                        <span className="text-[9px] font-mono text-slate-400">North {Number((site.northAngle || 0).toFixed(1))}°</span>
                    </div>
                    {edge !== undefined ? (
                        <button
                            onClick={() => onRotate(alignEdgeRotation(site.boundary!, edge))}
                            className="w-full py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
                            title="Rotate the site so this edge runs horizontally along the bottom of the plan"
                        >
                            <AlignHorizontalJustifyCenter size={13} /> Align edge {edge + 1} to street
                        </button>
                    ) : (
                        <p className="text-[9px] text-slate-400 leading-relaxed">Click the street edge, then align it — or rotate by an angle.</p>
                    )}
                    <div className="flex items-center gap-1">
                        <button onClick={() => onRotate(-15)} className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-orange-600" title="Rotate 15° anticlockwise"><RotateCcw size={12} /></button>
                        <button onClick={() => onRotate(-1)} className="px-1.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 hover:text-orange-600" title="Rotate 1° anticlockwise">−1°</button>
                        <form className="flex-1 flex" onSubmit={e => { e.preventDefault(); const v = parseFloat(rotateBy); if (Number.isFinite(v) && v) onRotate(v); setRotateBy(''); }}>
                            <input
                                type="number" step="any" value={rotateBy} placeholder="°" onChange={e => setRotateBy(e.target.value)}
                                className="w-full min-w-0 text-center text-[11px] font-mono bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-orange-500/40 text-slate-800 dark:text-slate-200"
                                title="Type an angle (clockwise positive) and press Enter"
                            />
                        </form>
                        <button onClick={() => onRotate(1)} className="px-1.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-[10px] font-bold text-slate-500 hover:text-orange-600" title="Rotate 1° clockwise">+1°</button>
                        <button onClick={() => onRotate(15)} className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-orange-600" title="Rotate 15° clockwise"><RotateCw size={12} /></button>
                    </div>
                    <p className="text-[9px] text-slate-400">North, the zones and the satellite underlay turn with the site. Placed spaces stay put.</p>
                </div>
            )}

            {/* Constraints */}
            {hasBoundary && (
                <div className="flex flex-col gap-2 border-t border-slate-100 dark:border-dark-border pt-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Constraints</h4>
                    <NumberField label="Setback (all edges)" unit="m" value={c.defaultSetback} placeholder="0"
                        onFocus={onInteractionStart} onChange={v => setConstraints({ defaultSetback: v ?? 0 })} />
                    {edge !== undefined && (
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 px-2 py-1.5">
                            <NumberField label={`Edge ${edge + 1} setback`} unit="m"
                                value={typeof c.edgeSetbacks?.[edge] === 'number' ? c.edgeSetbacks![edge]! : undefined}
                                placeholder={String(c.defaultSetback ?? 0)}
                                onFocus={onInteractionStart} onChange={v => setEdgeSetback(edge, v)} />
                            <p className="text-[9px] text-slate-400 mt-1">Leave empty to use the default ({c.defaultSetback ?? 0} m).</p>
                        </div>
                    )}
                    <NumberField label="Max height" unit="m" value={c.maxHeight} onFocus={onInteractionStart} onChange={v => setConstraints({ maxHeight: v })} />
                    <NumberField label="Max site coverage" unit="%" step={1} value={c.maxCoverage} onFocus={onInteractionStart} onChange={v => setConstraints({ maxCoverage: v })} />
                    <NumberField label="Max FAR" unit="" step={0.1} value={c.maxFAR} onFocus={onInteractionStart} onChange={v => setConstraints({ maxFAR: v })} />
                </div>
            )}

            {/* Compliance */}
            {report && (
                <div className="flex flex-col gap-1 border-t border-slate-100 dark:border-dark-border pt-2">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Site check</h4>
                    <Stat label="Site area" value={`${report.siteArea.toFixed(1)} m²`} />
                    <Stat label="Perimeter" value={`${report.perimeter.toFixed(1)} m`} />
                    <Stat label="Buildable area" value={`${report.buildableArea.toFixed(1)} m²`} exceeded={report.buildableArea === 0} />
                    <Stat label="Coverage" value={`${report.coverage.toFixed(1)}%`} limit={c.maxCoverage != null ? `${c.maxCoverage}%` : undefined} exceeded={report.limits.coverage} />
                    <Stat label="GFA (above ground)" value={`${report.gfa.toFixed(1)} m²`} />
                    <Stat label="FAR" value={report.far.toFixed(2)} limit={c.maxFAR != null ? String(c.maxFAR) : undefined} exceeded={report.limits.far} />
                    <Stat label="Height" value={`${report.height.toFixed(1)} m`} limit={c.maxHeight != null ? `${c.maxHeight} m` : undefined} exceeded={report.limits.height} />

                    {report.violations.length === 0 && !Object.values(report.limits).some(Boolean) ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={12} /> All placed spaces fit the site
                        </div>
                    ) : report.violations.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                                <AlertTriangle size={12} /> {report.violations.length} space{report.violations.length > 1 ? 's' : ''} break the site rules
                            </div>
                            {report.violations.slice(0, 12).map(v => (
                                <button key={v.roomId} onClick={() => onSelectRoom(v.roomId)}
                                    className="text-left text-[10px] text-slate-600 dark:text-gray-300 hover:text-orange-600 truncate">
                                    • <b>{v.roomName}</b> {REASON[v.reason]}{v.detail ? ` ${v.detail}` : ''}
                                </button>
                            ))}
                            {report.violations.length > 12 && <span className="text-[10px] text-slate-400">…and {report.violations.length - 12} more</span>}
                        </div>
                    )}
                </div>
            )}

            {hasBoundary && (
                <button
                    onClick={() => { onInteractionStart(); onChange({ boundary: undefined, zones: [], geoAnchor: undefined, constraints: { ...c, edgeSetbacks: [] } }); onSelect(null); }}
                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center justify-center gap-1.5 py-1"
                >
                    <Trash2 size={12} /> Clear site boundary
                </button>
            )}
        </div>
    );
};
