import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Room, FLOORS, Connection, DIAGRAM_STYLES, DiagramStyle, Point, ZONE_COLORS, AppSettings, ZoneColor, Floor, VerticalConnection, SpaceType, VCType, StairConfig, DEFAULT_STAIR_PARAMS, ZoningTypology, SiteProperties, CanvasGuide } from './types';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { HelpModal } from './components/HelpModal';
import { AboutModal } from './components/AboutModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ZoneOverlay } from './components/ZoneOverlay'; // Newly added
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { SitePropertiesModal } from './components/SitePropertiesModal';
import type { VolumesViewHandle } from './components/VolumesView';
// three.js is large; load the 3D view only when it's first opened
const VolumesView = React.lazy(() => import('./components/VolumesView').then(m => ({ default: m.VolumesView })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { AILayoutModal } from './components/AILayoutModal';
import { applyMagneticPhysics } from './utils/physics'; // Newly added
import { handleExport, getHexColorForZone, getHexBorderForZone } from './utils/exportSystem';
import { arrangeRooms } from './utils/layout';
import { validateAiLayout } from './utils/aiLayout';
import { parseProjectData, parseCsv, parseArea, toCsvField } from './utils/projectStore';
import { useProjectDocument } from './hooks/useProjectDocument';
import { SpacePropertiesPanel } from './components/SpacePropertiesPanel';
import { ZonePropertiesPanel } from './components/ZonePropertiesPanel';
import { NotificationHost, notify, confirmDialog } from './components/Notifications';
import {
    Plus, Package, Download, Upload, Settings2, Undo2, Redo2, RotateCcw,
    TableProperties, Hexagon, Circle, Square,
    PencilRuler, ChevronRight, ChevronLeft, Key, X, Settings, LayoutTemplate, Sparkles, Trash2, Lock, Unlock, Ruler, Copy,
    Link, Magnet, Grid, Moon, Sun, Maximize, ChevronUp, ChevronDown, Atom, FileImage, Image as ImageIcon, Scaling, Box, Layers, Save,
    Eye, EyeOff, CircleHelp, Info, Menu, MoreHorizontal, Palette, Shapes,
    TreePine, Building2, Home, ArrowUpDown, LandPlot, Plug
} from 'lucide-react';
import { Annotation, AnnotationType, ArrowCapType, ReferenceImage, ReferenceScaleState } from './types';
import { SketchToolbar, SketchPanel } from './components/SketchToolbar';
import { AnnotationLayer } from './components/AnnotationLayer';
import { ReferenceLayer } from './components/ReferenceLayer';
import { ReferenceToolbar } from './components/ReferenceToolbar';
import { SiteLayer, SiteTool, SiteSelection } from './components/SiteLayer';
import { SitePanel } from './components/SitePanel';
import { BridgesModal } from './components/BridgesModal';
import { bridge, useBridge } from './services/bridgeClient';
import { runBridgeCommand, BridgeError, checkProject, PLANNING_RULES } from './utils/bridgeCommands';
import { renderPlanSvg, svgToPngBase64 } from './utils/planRender';
import { analyzeSite, recenterShape, roomCenter, readGoogleEarthFile, shapeToBoundary, polygonCentroid, rotatePoint, roomWorldPolygon, worldToGeo, geoToWorld, imageryBox, fetchSiteImagery, IMAGERY_ATTRIBUTION, KmlShape } from './utils/site';
import { StylePanel } from './components/StylePanel';
import { SnapPanel } from './components/SnapPanel';
import { Rulers, getRulerTickInterval } from './components/Rulers';
import SoapLogo from './lib/symbols/SOAP-Logo.svg';
import ZonesIconRaw from './lib/symbols/Zones.svg?raw';
import brushCleaningSvgRaw from './lib/symbols/brush-cleaning.svg?raw';

import { analyzeProgram, generateSpatialLayout } from './services/geminiService';

// Shim process for libs that might expect it in Vite
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {} };
}

// Configuration
const PIXELS_PER_METER = 20;

const COLOR_PALETTE: ZoneColor[] = [
    { bg: 'bg-[#f44336]/50', text: 'text-white', border: 'border-[#f44336]' },
    { bg: 'bg-[#e81e63]/50', text: 'text-white', border: 'border-[#e81e63]' },
    { bg: 'bg-[#9c27b0]/50', text: 'text-white', border: 'border-[#9c27b0]' },
    { bg: 'bg-[#673ab7]/50', text: 'text-white', border: 'border-[#673ab7]' },
    { bg: 'bg-[#3f51b5]/50', text: 'text-white', border: 'border-[#3f51b5]' },
    { bg: 'bg-[#2196f3]/50', text: 'text-white', border: 'border-[#2196f3]' },
    { bg: 'bg-[#03a9f4]/50', text: 'text-slate-900', border: 'border-[#03a9f4]' },
    { bg: 'bg-[#00bcd4]/50', text: 'text-slate-900', border: 'border-[#00bcd4]' },
    { bg: 'bg-[#009688]/50', text: 'text-white', border: 'border-[#009688]' },
    { bg: 'bg-[#4caf50]/50', text: 'text-slate-900', border: 'border-[#4caf50]' },
    { bg: 'bg-[#8bc34a]/50', text: 'text-slate-900', border: 'border-[#8bc34a]' },
    { bg: 'bg-[#cddc39]/50', text: 'text-slate-900', border: 'border-[#cddc39]' },
    { bg: 'bg-[#ffeb3b]/50', text: 'text-slate-900', border: 'border-[#ffeb3b]' },
    { bg: 'bg-[#ffc107]/50', text: 'text-slate-900', border: 'border-[#ffc107]' },
    { bg: 'bg-[#ff9800]/50', text: 'text-slate-900', border: 'border-[#ff9800]' },
    { bg: 'bg-[#ff5722]/50', text: 'text-white', border: 'border-[#ff5722]' },
];

// --- Geometry Helpers for Shape Conversion ---
const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

const calculateCurvedArea = (points: Point[]): number => {
    if (points.length < 3) return 0;
    let area = 0;
    const steps = 20;
    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        let prevX = p1.x;
        let prevY = p1.y;
        for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            const it = 1 - t;
            const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
            const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
            area += prevX * y - x * prevY;
            prevX = x;
            prevY = y;
        }
    }
    return Math.abs(area) / 2;
};

const calculatePolygonArea = (points: Point[]): number => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
};

const isPointInPolygon = (p: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const ccw = (A: Point, B: Point, C: Point): boolean => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
};

const intersectSegments = (A: Point, B: Point, C: Point, D: Point): boolean => {
    return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
};

const getRoomVertices = (room: Room): Point[] => {
    const angleRad = (room.rotation || 0) * (Math.PI / 180);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    if (room.polygon && room.polygon.length > 0) {
        // Polygon rooms rotate around (room.x, room.y)
        return room.polygon.map(p => {
            const rx = p.x * cos - p.y * sin;
            const ry = p.x * sin + p.y * cos;
            return { x: room.x + rx, y: room.y + ry };
        });
    } else {
        // Rectangular rooms rotate around center (room.x + width/2, room.y + height/2)
        const cx = room.x + room.width / 2;
        const cy = room.y + room.height / 2;
        const halfW = room.width / 2;
        const halfH = room.height / 2;

        const localVertices = [
            { x: -halfW, y: -halfH },
            { x: halfW, y: -halfH },
            { x: halfW, y: halfH },
            { x: -halfW, y: halfH }
        ];

        return localVertices.map(v => {
            const rx = v.x * cos - v.y * sin;
            const ry = v.x * sin + v.y * cos;
            return { x: cx + rx, y: cy + ry };
        });
    }
};




const ZonesIcon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
    <div
        className={`w-4 h-4 flex items-center justify-center zones-icon-container ${className}`}
        dangerouslySetInnerHTML={{ __html: ZonesIconRaw }}
        {...props}
    />
);

const BrushCleaningIcon: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
    <div
        className={`w-4 h-4 flex items-center justify-center brush-cleaning-icon-container ${className}`}
        dangerouslySetInnerHTML={{ __html: brushCleaningSvgRaw }}
        {...props}
    />
);


// Helper for file saving
const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking immediately can cancel the download in some browsers
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

const saveFile = async (blob: Blob, suggestedName: string, extension: string) => {
    const fileName = `${suggestedName}.${extension}`;
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'File',
                    accept: { [blob.type]: [`.${extension}`] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (err: any) {
            if (err?.name === 'AbortError') return; // user cancelled the dialog
            // Some contexts (embedded browsers, iframes, restricted policies) expose the picker
            // but refuse to write. Fall back to a regular download instead of failing.
            console.warn('Save dialog unavailable, falling back to download:', err);
        }
    }
    try {
        downloadBlob(blob, fileName);
        notify({ kind: 'success', title: `Saved ${fileName}`, message: 'Check your Downloads folder.' });
    } catch (err: any) {
        console.error('Failed to save file:', err);
        notify({ kind: 'error', title: "Couldn't save the file", message: err?.message });
    }
};

type ViewMode = 'EDITOR' | 'CANVAS' | 'VOLUMES';

export default function App() {
    // Project document: saved data, undo/redo and autosave
    const {
        projectName, setProjectName,
        rooms, setRooms,
        connections, setConnections,
        zoneColors, setZoneColors,
        referenceImages, setReferenceImages,
        guides, setGuides,
        siteProperties, setSiteProperties,
        annotations, setAnnotations,
        appSettings, setAppSettings,
        floors, setFloors,
        currentFloor, setCurrentFloor,
        floorOverlays, setFloorOverlays,
        autosaveError, setAutosaveError,
        getProjectData,
        addToHistory, undo, redo, canUndo, canRedo,
        loadProject, resetProject,
    } = useProjectDocument();

    // App State
    const [viewMode, setViewMode] = useState<ViewMode>('EDITOR');
    const [referenceScaleState, setReferenceScaleState] = useState<ReferenceScaleState | null>(null);
    const [selectedReferenceImageId, setSelectedReferenceImageId] = useState<string | null>(null);
    const [isGuidesMode, setIsGuidesMode] = useState(false);
    const [isSiteMode, setIsSiteMode] = useState(false);
    const [siteTool, setSiteTool] = useState<SiteTool>('select');
    const [siteSelection, setSiteSelection] = useState<SiteSelection | null>(null);
    const [fitRequest, setFitRequest] = useState(0);
    const siteModalHistoryRef = useRef(false);
    const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
    const [draggedGuideId, setDraggedGuideId] = useState<string | null>(null);

    // API Key State
    // The .env key is a dev convenience only; it must never be baked into a production bundle
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('SOAP_GEMINI_KEY') || (import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : '') || "");
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);
    const [showSnapPanel, setShowSnapPanel] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showSitePropertiesModal, setShowSitePropertiesModal] = useState(false);
    const [showBridgesModal, setShowBridgesModal] = useState(false);
    const bridgeState = useBridge();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
    const [isAiLayoutLoading, setIsAiLayoutLoading] = useState(false);
    const [showAiLayoutModal, setShowAiLayoutModal] = useState(false);

    // Sketch State
    const [isSketchMode, setIsSketchMode] = useState(false);
    const [isReferenceMode, setIsReferenceMode] = useState(false);
    const [activeSketchType, setActiveSketchType] = useState<AnnotationType | 'eraser' | 'select'>('select');
    const [sketchProperties, setSketchProperties] = useState({
        stroke: '#f97316',
        strokeWidth: 2,
        strokeDash: '',
        startCap: 'none' as ArrowCapType,
        endCap: 'none' as ArrowCapType,
        fillet: 0,
        fontSize: 16,
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none'
    });
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

    const selectedAnnotation = useMemo(() => annotations.find(a => a.id === selectedAnnotationId), [annotations, selectedAnnotationId]);


    // View State
    const [viewport, setViewport] = useState({
        scale: 1,
        offset: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    });
    const { scale, offset } = viewport;

    const toWorld = useCallback((x: number, y: number) => {
        if (!mainRef.current) return { x: 0, y: 0 };
        const rect = mainRef.current.getBoundingClientRect();
        return {
            x: (x - rect.left - offset.x) / scale,
            y: (y - rect.top - offset.y) / scale
        };
    }, [offset.x, offset.y, scale]);

    const toScreen = useCallback((x: number, y: number) => {
        if (!mainRef.current) return { x: 0, y: 0 };
        const rect = mainRef.current.getBoundingClientRect();
        return {
            x: x * scale + offset.x + rect.left,
            y: y * scale + offset.y + rect.top
        };
    }, [offset.x, offset.y, scale]);
    const [is3DMode, setIs3DMode] = useState(false);
    const [canvasStyle, setCanvasStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
    const [volumesStyle, setVolumesStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
    const [showStylePanel, setShowStylePanel] = useState(false);
    const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
    const [selectedZone, setSelectedZone] = useState<string | null>(null);

    const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
    const [volumesViewState, setVolumesViewState] = useState<{
        cameraPosition: [number, number, number];
        target: [number, number, number];
        zoom: number;
        viewType: 'perspective' | 'isometric';
        hasInitialZoomed: boolean;
    }>({
        cameraPosition: [-300, -300, 300],
        target: [0, 0, 0],
        zoom: 1.5,
        viewType: 'perspective',
        hasInitialZoomed: false
    });

    const [cameraVersion, setCameraVersion] = useState(0);

    const volumesViewRef = useRef<VolumesViewHandle>(null);
    // Mount the (lazy-loaded) 3D view on first visit, then keep it mounted to preserve its camera
    const [hasOpenedVolumes, setHasOpenedVolumes] = useState(false);
    useEffect(() => { if (viewMode === 'VOLUMES') setHasOpenedVolumes(true); }, [viewMode]);

    // Extracted Handlers for Volumes View (to avoid conditional hook calls)
    const handleViewStateChange = useCallback((updates: any, incrementVersion = false) => {
        setVolumesViewState(prev => ({ ...prev, ...updates }));
        if (incrementVersion) {
            setCameraVersion(v => v + 1);
        }
    }, []);

    const handleVolumeRoomSelect = useCallback((id: string | null, multi: boolean) => {
        if (id === null) {
            setSelectedRoomIds(new Set());
            setSelectedZone(null);
            setSelectedAnnotationId(null);
            setConnectionSourceId(null);
            return;
        }
        setSelectedRoomIds(prev => {
            const next = new Set(multi ? prev : []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        // Optional: Focus camera on room select?
        // For now, let's not force move camera on select to avoid jarring jumps
    }, []);

    // Tools State
    const [isMagnetMode, setIsMagnetMode] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [showZones, setShowZones] = useState(true);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const GRID_SIZES = [0.5, 1, 2, 5, 10];
    const [gridSizeIndex, setGridSizeIndex] = useState(2); // Default 2m
    const gridSize = GRID_SIZES[gridSizeIndex];
    const currentGridSizeMeters = gridSize * (appSettings.unitSystem === 'imperial' ? 0.3048 : 1.0);

    // UI State
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [isInventoryOpen, setIsInventoryOpen] = useState(true);
    const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x?: number, y?: number } | null>(null);
    const activeOverlayFloorId = floorOverlays[currentFloor] ?? null;
    const [isOverlaySelectorOpen, setIsOverlaySelectorOpen] = useState(false);
    const [isZoneDragging, setIsZoneDragging] = useState(false);
    const [isBubbleDragging, setIsBubbleDragging] = useState(false);
    const [isInventoryHovered, setIsInventoryHovered] = useState(false);
    const [editingFloorId, setEditingFloorId] = useState<number | null>(null);
    const [hasInitialZoomed, setHasInitialZoomed] = useState(false);
    const [floorGap, setFloorGap] = useState(4);
    const [hiddenFloorIds, setHiddenFloorIds] = useState<Set<number>>(new Set());
    const [showVolumeLabels, setShowVolumeLabels] = useState(true);
    const [volumeLabelFontSize, setVolumeLabelFontSize] = useState(11);

    const roomsRef = useRef(rooms);
    roomsRef.current = rooms;

    const performSelection = useCallback((start: Point, end: Point) => {
        if (!mainRef.current) return;

        const rect = mainRef.current.getBoundingClientRect();
        const clientStart = { x: start.x + rect.left, y: start.y + rect.top };
        const clientEnd = { x: end.x + rect.left, y: end.y + rect.top };

        const wStart = toWorld(clientStart.x, clientStart.y);
        const wEnd = toWorld(clientEnd.x, clientEnd.y);

        const minX = Math.min(wStart.x, wEnd.x);
        const maxX = Math.max(wStart.x, wEnd.x);
        const minY = Math.min(wStart.y, wEnd.y);
        const maxY = Math.max(wStart.y, wEnd.y);

        const isCrossing = start.x > end.x; // Right-to-left

        const visibleRooms = roomsRef.current.filter(r => {
            if (!r.isPlaced) return false;
            if (r.floor === currentFloor) return true;
            if (r.spaceType === 'multistory') {
                const from = r.msFromFloor ?? r.floor;
                const to = r.msToFloor ?? r.floor;
                const minF = Math.min(from, to);
                const maxF = Math.max(from, to);
                return currentFloor >= minF && currentFloor <= maxF;
            }
            if (r.spaceType === 'verticalConnection') {
                const from = r.vcFromFloor ?? r.floor;
                const to = r.vcToFloor ?? r.floor;
                const minF = Math.min(from, to);
                const maxF = Math.max(from, to);
                return currentFloor >= minF && currentFloor <= maxF;
            }
            return false;
        });
        const newlySelectedRooms = new Set<string>();

        visibleRooms.forEach(room => {
            const vertices = getRoomVertices(room);

            if (isCrossing) {
                // Crossing Selection: Intersects or Inside
                // 1. Check if any vertex of room is inside the selection box
                const someVertexInside = vertices.some(v => v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY);
                if (someVertexInside) {
                    newlySelectedRooms.add(room.id);
                    return;
                }

                // 2. Check if selection box corners are inside the room
                const boxCorners = [
                    { x: minX, y: minY },
                    { x: maxX, y: minY },
                    { x: maxX, y: maxY },
                    { x: minX, y: maxY }
                ];
                const cornerInside = boxCorners.some(c => isPointInPolygon(c, vertices));
                if (cornerInside) {
                    newlySelectedRooms.add(room.id);
                    return;
                }

                // 3. Check if any edge of the selection box intersects any edge of the room
                const boxEdges = [
                    [boxCorners[0], boxCorners[1]],
                    [boxCorners[1], boxCorners[2]],
                    [boxCorners[2], boxCorners[3]],
                    [boxCorners[3], boxCorners[0]]
                ];
                const roomEdges: Point[][] = [];
                for (let i = 0; i < vertices.length; i++) {
                    roomEdges.push([vertices[i], vertices[(i + 1) % vertices.length]]);
                }

                let edgesIntersect = false;
                for (const bEdge of boxEdges) {
                    for (const rEdge of roomEdges) {
                        if (intersectSegments(bEdge[0], bEdge[1], rEdge[0], rEdge[1])) {
                            edgesIntersect = true;
                            break;
                        }
                    }
                    if (edgesIntersect) break;
                }

                if (edgesIntersect) {
                    newlySelectedRooms.add(room.id);
                }
            } else {
                // Window Selection: Completely Inside
                const allInside = vertices.every(v => v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY);
                if (allInside) {
                    newlySelectedRooms.add(room.id);
                }
            }
        });

        setSelectedRoomIds(newlySelectedRooms);

        // --- Select Annotations (if in Sketch Mode) ---
        if (isSketchMode) {
            const visibleAnnotations = annotations.filter(a => a.floor === currentFloor && a.points && a.points.length > 0);
            let selectedAnnId: string | null = null;

            for (const a of visibleAnnotations) {
                if (isCrossing) {
                    // Crossing Selection: Any point is inside, or any segment intersects the box edges
                    const anyPointInside = a.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
                    if (anyPointInside) {
                        selectedAnnId = a.id;
                        break;
                    }

                    const boxCorners = [
                        { x: minX, y: minY },
                        { x: maxX, y: minY },
                        { x: maxX, y: maxY },
                        { x: minX, y: maxY }
                    ];
                    const boxEdges = [
                        [boxCorners[0], boxCorners[1]],
                        [boxCorners[1], boxCorners[2]],
                        [boxCorners[2], boxCorners[3]],
                        [boxCorners[3], boxCorners[0]]
                    ];

                    let edgesIntersect = false;
                    for (let i = 0; i < a.points.length - 1; i++) {
                        const p1 = a.points[i];
                        const p2 = a.points[i + 1];
                        for (const bEdge of boxEdges) {
                            if (intersectSegments(bEdge[0], bEdge[1], p1, p2)) {
                                edgesIntersect = true;
                                break;
                            }
                        }
                        if (edgesIntersect) break;
                    }

                    if (edgesIntersect) {
                        selectedAnnId = a.id;
                        break;
                    }
                } else {
                    // Window Selection: All points inside
                    const allInside = a.points.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
                    if (allInside) {
                        selectedAnnId = a.id;
                        break;
                    }
                }
            }
            setSelectedAnnotationId(selectedAnnId);
        }
    }, [currentFloor, annotations, isSketchMode, toWorld]);

    const overlaySelectorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOverlaySelectorOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (overlaySelectorRef.current && !overlaySelectorRef.current.contains(event.target as Node)) {
                setIsOverlaySelectorOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOverlaySelectorOpen]);


    // Dark Mode Local State
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('SOAP_DARK_MODE') === 'true';
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('SOAP_DARK_MODE', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('SOAP_DARK_MODE', 'false');
        }
    }, [darkMode]);

    const canvasTheme = useMemo(() => {
        const id = canvasStyle.id;
        if (id === 'blueprint') {
            return {
                bg: darkMode ? 'bg-[#0b2b5c]' : 'bg-[#e0f2fe]',
                gridColor: darkMode ? 'rgba(34, 211, 238, 0.25)' : 'rgba(14, 165, 233, 0.2)',
                gridPattern: 'solid'
            };
        } else if (id === 'clay') {
            return {
                bg: darkMode ? 'bg-[#242729]' : 'bg-[#fcfaf2]',
                gridColor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                gridPattern: 'solid'
            };
        }
        return {
            bg: darkMode ? 'bg-dark-bg' : 'bg-[#f0f2f5]',
            gridColor: darkMode ? '#333' : '#e2e8f0',
            gridPattern: 'solid'
        };
    }, [canvasStyle.id, darkMode]);




    // --- 3D / Volumes View Computations ---
    const verticalConnections = useMemo(() => {
        const vconns: VerticalConnection[] = [];
        connections.forEach(conn => {
            const from = rooms.find(r => r.id === conn.fromId);
            const to = rooms.find(r => r.id === conn.toId);
            if (from && to && from.floor !== to.floor) {
                vconns.push({
                    id: conn.id,
                    fromId: conn.fromId,
                    toId: conn.toId,
                    fromFloor: from.floor,
                    toFloor: to.floor
                });
            }
        });
        return vconns;
    }, [connections, rooms]);


    // Clear selection when exiting reference mode
    useEffect(() => {
        if (!isReferenceMode) {
            setSelectedReferenceImageId(null);
        }
    }, [isReferenceMode]);

    // Clear selection when exiting sketch mode
    useEffect(() => {
        if (!isSketchMode) {
            setSelectedAnnotationId(null);
        }
    }, [isSketchMode]);

    // Clear selection when entering/exiting guides mode
    useEffect(() => {
        setSelectedRoomIds(new Set());
        setSelectedZone(null);
        setSelectedAnnotationId(null);
        if (!isGuidesMode) {
            setSelectedGuideId(null);
        }
    }, [isGuidesMode]);

    const handleResetProject = async () => {
        const ok = await confirmDialog({
            title: 'Reset project?',
            message: 'This clears all spaces, floors, sketches and reference images. It cannot be undone.',
            confirmLabel: 'Reset project',
            danger: true
        });
        if (ok) resetProject();
    };

    // --- Utilities ---
    const getSnappedPosition = useCallback((room: Room, excludeId: string) => {
        if (!room) return { x: 0, y: 0 };

        if (!snapEnabled) {
            setSnapGuides(null);
            return { x: room.x, y: room.y };
        }
        if (!excludeId) {
            setSnapGuides(null);
            return { x: room.x, y: room.y };
        }
        const threshold = appSettings.snapTolerance;
        let snappedX = room.x;
        let snappedY = room.y;
        let activeGuideX: number | undefined;
        let activeGuideY: number | undefined;
        const currentRooms = roomsRef.current || [];
        const overlayId = floorOverlays[currentFloor] ?? null;
        const otherRooms = currentRooms.filter(r => {
            if (!r.isPlaced || r.id === excludeId) return false;
            
            const isVisibleOnFloor = (floorId: number) => {
                if (r.floor === floorId) return true;
                if (r.spaceType === 'multistory') {
                    const from = r.msFromFloor ?? r.floor;
                    const to = r.msToFloor ?? r.floor;
                    const minF = Math.min(from, to);
                    const maxF = Math.max(from, to);
                    return floorId >= minF && floorId <= maxF;
                }
                if (r.spaceType === 'verticalConnection') {
                    const from = r.vcFromFloor ?? r.floor;
                    const to = r.vcToFloor ?? r.floor;
                    const minF = Math.min(from, to);
                    const maxF = Math.max(from, to);
                    return floorId >= minF && floorId <= maxF;
                }
                return false;
            };

            return isVisibleOnFloor(currentFloor) || (overlayId !== null && isVisibleOnFloor(overlayId));
        });

        if (appSettings.snapToObjects) {
            for (const other of otherRooms) {
                // Horizontal Snapping
                const snapsH = [
                    { val: other.x, type: 'left-left' },
                    { val: other.x + other.width, type: 'left-right' },
                    { val: other.x - room.width, type: 'right-left' },
                    { val: other.x + other.width - room.width, type: 'right-right' }
                ];

                for (const s of snapsH) {
                    if (Math.abs(room.x - s.val) < threshold) {
                        snappedX = s.val;
                        activeGuideX = s.val + (s.type.startsWith('right') ? room.width : 0);
                        break;
                    }
                }

                // Vertical Snapping
                const snapsV = [
                    { val: other.y, type: 'top-top' },
                    { val: other.y + other.height, type: 'top-bottom' },
                    { val: other.y - room.height, type: 'bottom-top' },
                    { val: other.y + other.height - room.height, type: 'bottom-bottom' }
                ];

                for (const s of snapsV) {
                    if (Math.abs(room.y - s.val) < threshold) {
                        snappedY = s.val;
                        activeGuideY = s.val + (s.type.startsWith('bottom') ? room.height : 0);
                        break;
                    }
                }
            }
        }

        if (appSettings.snapToGrid) {
            const gridSizePx = currentGridSizeMeters * PIXELS_PER_METER;
            if (gridSizePx > 0) {
                if (activeGuideX === undefined) {
                    const nearestGridLeft = Math.round(room.x / gridSizePx) * gridSizePx;
                    const distLeft = Math.abs(room.x - nearestGridLeft);
                    const nearestGridRight = Math.round((room.x + room.width) / gridSizePx) * gridSizePx;
                    const distRight = Math.abs((room.x + room.width) - nearestGridRight);
                    if (distLeft < threshold && distLeft <= distRight) {
                        snappedX = nearestGridLeft;
                        activeGuideX = nearestGridLeft;
                    } else if (distRight < threshold && distRight < distLeft) {
                        snappedX = nearestGridRight - room.width;
                        activeGuideX = nearestGridRight;
                    }
                }

                if (activeGuideY === undefined) {
                    const nearestGridTop = Math.round(room.y / gridSizePx) * gridSizePx;
                    const distTop = Math.abs(room.y - nearestGridTop);
                    const nearestGridBottom = Math.round((room.y + room.height) / gridSizePx) * gridSizePx;
                    const distBottom = Math.abs((room.y + room.height) - nearestGridBottom);
                    if (distTop < threshold && distTop <= distBottom) {
                        snappedY = nearestGridTop;
                        activeGuideY = nearestGridTop;
                    } else if (distBottom < threshold && distBottom < distTop) {
                        snappedY = nearestGridBottom - room.height;
                        activeGuideY = nearestGridBottom;
                    }
                }
            }
        }

        // 0 is a real position (the origin axes), so test for undefined rather than falsiness
        const newGuides = activeGuideX !== undefined || activeGuideY !== undefined ? { x: activeGuideX, y: activeGuideY } : null;
        setSnapGuides(prev => {
            if (!prev && !newGuides) return prev;
            if (prev && newGuides && prev.x === newGuides.x && prev.y === newGuides.y) return prev;
            return newGuides;
        });
        return { x: snappedX, y: snappedY };
    }, [currentFloor, snapEnabled, appSettings, floorOverlays, currentGridSizeMeters]);

    // Canvas Refs
    const mainRef = useRef<HTMLElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const inventoryRef = useRef<HTMLElement>(null);
    const prevMainRect = useRef<{ width: number, height: number } | null>(null);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

    // Touch State
    const touchState = useRef<{
        mode: 'none' | 'pan' | 'zoom';
        startDist: number;
        startScale: number;
        startOffset: Point;
        lastCenter: Point;
    }>({ mode: 'none', startDist: 0, startScale: 1, startOffset: { x: 0, y: 0 }, lastCenter: { x: 0, y: 0 } });

    // Update offset on resize to keep center
    // Physics Loop
    useEffect(() => {
        if (!isMagnetMode) return;

        const interval = setInterval(() => {
            setRooms(currentRooms => {
                const updated = applyMagneticPhysics(
                    currentRooms,
                    appSettings.magnetStrength ?? 50,
                    appSettings.magnetPadding ?? 10
                );
                return updated === currentRooms ? currentRooms : updated;
            });
        }, 50); // 20fps for physics to save CPU

        return () => clearInterval(interval);
    }, [isMagnetMode, appSettings.magnetStrength, appSettings.magnetPadding]);

    // Inventory Hover Detection during Drag
    useEffect(() => {
        if (!isZoneDragging && !isBubbleDragging) {
            setIsInventoryHovered(false);
            return;
        }

        const handleGlobalPointerMove = (e: PointerEvent) => {
            if (inventoryRef.current) {
                const rect = inventoryRef.current.getBoundingClientRect();
                const isOver = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
                setIsInventoryHovered(isOver);
            }
        };
        window.addEventListener('pointermove', handleGlobalPointerMove);
        return () => window.removeEventListener('pointermove', handleGlobalPointerMove);
    }, [isZoneDragging, isBubbleDragging]);

    // Handle guide dragging globally
    useEffect(() => {
        if (!draggedGuideId) return;

        const handlePointerMove = (e: PointerEvent) => {
            const worldPos = toWorld(e.clientX, e.clientY);
            setGuides(prev => prev.map(g => {
                if (g.id !== draggedGuideId) return g;
                
                const angleRad = ((g.angle || 0) * Math.PI) / 180;
                let newPos = 0;
                if (g.type === 'h') {
                    newPos = (-worldPos.x * Math.sin(angleRad) + worldPos.y * Math.cos(angleRad)) / PIXELS_PER_METER;
                } else {
                    newPos = (worldPos.x * Math.cos(angleRad) + worldPos.y * Math.sin(angleRad)) / PIXELS_PER_METER;
                }
                if (e.shiftKey) {
                    const isImperial = appSettings.unitSystem === 'imperial';
                    const { subInterval } = getRulerTickInterval(gridSize, scale, PIXELS_PER_METER, isImperial);
                    const subIntervalMeters = subInterval * (isImperial ? 0.3048 : 1.0);
                    newPos = Math.round(newPos / subIntervalMeters) * subIntervalMeters;
                }
                return { ...g, position: newPos };
            }));
        };

        const handlePointerUp = () => {
            setDraggedGuideId(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggedGuideId, toWorld, gridSize, scale, appSettings.unitSystem]);

    // --- Core Handlers ---
    useEffect(() => {
        const element = mainRef.current;
        if (!element) return;

        const onWheel = (e: WheelEvent) => {
            // Only handle wheel events for the 2D canvas to avoid interfering with 3D view controls.
            if (viewMode !== 'CANVAS') {
                return;
            }

            e.preventDefault();
            const rect = element.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            setViewport(prev => {
                const { scale: currentScale, offset: currentOffset } = prev;
                const zoomSensitivity = 0.001;
                const delta = -e.deltaY * zoomSensitivity;
                const newScale = Math.min(Math.max(0.1, currentScale + delta), 5);

                const newOffsetX = mouseX - ((mouseX - currentOffset.x) / currentScale) * newScale;
                const newOffsetY = mouseY - ((mouseY - currentOffset.y) / currentScale) * newScale;

                return {
                    scale: newScale,
                    offset: { x: newOffsetX, y: newOffsetY }
                };
            });
        };

        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [viewMode]);

    const handlePanStart = (e: React.MouseEvent) => {
        // Allow pan on Middle Button (1) OR Right Button (2)
        if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
        // Left Click (0) on Background -> Start Selection Box
        else if (e.button === 0 && !isSketchMode && !isReferenceMode) {
            if (isGuidesMode) {
                setSelectedGuideId(null);
                return;
            }
            if (selectionBox) {
                return;
            }
            setSelectedRoomIds(new Set());
            setSelectedZone(null);
            setSelectedAnnotationId(null);
            setSelectedGuideId(null);
            if (connectionSourceId) setConnectionSourceId(null);
            // Auto-lock all text when clicking empty space
            setRooms(prev => prev.map(r => r.isTextUnlocked ? { ...r, isTextUnlocked: false } : r));

            if (mainRef.current) {
                const rect = mainRef.current.getBoundingClientRect();
                const startX = e.clientX - rect.left;
                const startY = e.clientY - rect.top;
                setSelectionBox({
                    start: { x: startX, y: startY },
                    end: { x: startX, y: startY }
                });
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setViewport(prev => ({
                ...prev,
                offset: { x: prev.offset.x + dx, y: prev.offset.y + dy }
            }));
        } else if (selectionBox && mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;

            const updatedEnd = { x: currentX, y: currentY };
            setSelectionBox(prev => prev ? { ...prev, end: updatedEnd } : null);

            const dx = currentX - selectionBox.start.x;
            const dy = currentY - selectionBox.start.y;
            if (Math.hypot(dx, dy) > 5) {
                performSelection(selectionBox.start, updatedEnd);
            }
        }
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;

        if (e.touches.length === 1) {
            // Single touch - Pan (if on background)
            if (e.target === mainRef.current) {
                setIsPanning(true);
                lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

                // Clear selection if background
                setSelectedRoomIds(new Set());
                setSelectedZone(null);
                setSelectedAnnotationId(null);
                if (connectionSourceId) setConnectionSourceId(null);
            }
        } else if (e.touches.length === 2) {
            // Two touch - Zoom & Pan
            setIsPanning(true);

            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };

            touchState.current = {
                mode: 'zoom',
                startDist: dist,
                startScale: scale,
                startOffset: { ...offset },
                lastCenter: center
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;

        if (e.touches.length === 1 && isPanning) {
            const dx = e.touches[0].clientX - lastMousePos.current.x;
            const dy = e.touches[0].clientY - lastMousePos.current.y;
            setViewport(prev => ({
                ...prev,
                offset: { x: prev.offset.x + dx, y: prev.offset.y + dy }
            }));
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
            const state = touchState.current;

            if (state.mode !== 'zoom') return;

            const rect = mainRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Calculate Zoom
            const scaleFactor = dist / state.startDist;
            const newScale = Math.min(Math.max(0.1, state.startScale * scaleFactor), 5);

            // Calculate Pan (movement of the center point)
            const panX = center.x - state.lastCenter.x;
            const panY = center.y - state.lastCenter.y;

            setViewport(prev => {
                // Apply Pan first
                const intermediateOffset = { x: prev.offset.x + panX, y: prev.offset.y + panY };

                // Apply Zoom around the center (relative to container)
                const relCenterX = center.x - rect.left;
                const relCenterY = center.y - rect.top;

                // Formula: newOffset = center - (center - oldOffset) * (newScale / oldScale)
                const zoomRatio = newScale / prev.scale;
                const finalOffsetX = relCenterX - (relCenterX - intermediateOffset.x) * zoomRatio;
                const finalOffsetY = relCenterY - (relCenterY - intermediateOffset.y) * zoomRatio;

                return {
                    scale: newScale,
                    offset: { x: finalOffsetX, y: finalOffsetY }
                };
            });

            touchState.current.lastCenter = center;
        }
    };

    const handleTouchEnd = () => {
        if (viewMode === 'VOLUMES') return;
        setIsPanning(false);
        touchState.current.mode = 'none';
    };

    const handleMouseUp = () => {
        setIsPanning(false);
    };

    const handleZoomToFit = useCallback(() => {
        const getCenter = () => {
            if (mainRef.current) {
                const { width, height } = mainRef.current.getBoundingClientRect();
                return { x: width / 2, y: height / 2 };
            }
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        };

        const currentFloorRooms = rooms.filter(r => {
            if (!r.isPlaced) return false;
            if (r.floor === currentFloor) return true;
            if (r.spaceType === 'multistory') {
                const from = r.msFromFloor ?? r.floor;
                const to = r.msToFloor ?? r.floor;
                const minF = Math.min(from, to);
                const maxF = Math.max(from, to);
                return currentFloor >= minF && currentFloor <= maxF;
            }
            if (r.spaceType === 'verticalConnection') {
                const from = r.vcFromFloor ?? r.floor;
                const to = r.vcToFloor ?? r.floor;
                const minF = Math.min(from, to);
                const maxF = Math.max(from, to);
                return currentFloor >= minF && currentFloor <= maxF;
            }
            return false;
        });
        const currentFloorAnnotations = annotations.filter(a =>
            a.floor === currentFloor &&
            a.points && a.points.length > 0 // Ensure annotation has points
        );

        const siteBoundary = siteProperties.boundary && siteProperties.boundary.length >= 3 && (siteProperties.showSite !== false || isSiteMode)
            ? siteProperties.boundary : [];

        if (currentFloorRooms.length === 0 && currentFloorAnnotations.length === 0 && siteBoundary.length === 0) {
            setViewport({
                scale: 1,
                offset: getCenter()
            });
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentFloorRooms.forEach(r => {
            if (r.polygon && r.polygon.length > 0) {
                r.polygon.forEach(p => {
                    minX = Math.min(minX, r.x + p.x);
                    minY = Math.min(minY, r.y + p.y);
                    maxX = Math.max(maxX, r.x + p.x);
                    maxY = Math.max(maxY, r.y + p.y);
                });
            } else if (!r.polygon) {
                minX = Math.min(minX, r.x);
                minY = Math.min(minY, r.y);
                maxX = Math.max(maxX, r.x + r.width);
                maxY = Math.max(maxY, r.y + r.height);
            }
        });

        currentFloorAnnotations.forEach(a => {
            if (!a.points) return;
            a.points.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });

        siteBoundary.forEach(p => {
            minX = Math.min(minX, p.x * PIXELS_PER_METER);
            minY = Math.min(minY, p.y * PIXELS_PER_METER);
            maxX = Math.max(maxX, p.x * PIXELS_PER_METER);
            maxY = Math.max(maxY, p.y * PIXELS_PER_METER);
        });

        // If bounds are still infinite (e.g. empty points arrays), reset view
        if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
            setViewport({ scale: 1, offset: getCenter() });
            return;
        }

        const padding = 100;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;

        if (mainRef.current) {
            const { width, height } = mainRef.current.getBoundingClientRect();
            const scaleX = width / contentWidth;
            const scaleY = height / contentHeight;
            const newScale = Math.min(Math.min(scaleX, scaleY), 2);
            const newOffsetX = (width / 2) - ((minX + maxX) / 2) * newScale;
            const newOffsetY = (height / 2) - ((minY + maxY) / 2) * newScale;
            setViewport({
                scale: newScale,
                offset: { x: newOffsetX, y: newOffsetY }
            });
        }
    }, [rooms, annotations, currentFloor, siteProperties.boundary, siteProperties.showSite, isSiteMode]);

    // Fit the view after a site import (runs once the new boundary is in state)
    useEffect(() => {
        if (fitRequest) handleZoomToFit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitRequest]);

    // Resize Observer for Canvas
    useEffect(() => {
        if (!mainRef.current) return;

        // Initialize prevRect
        const { width, height } = mainRef.current.getBoundingClientRect();
        prevMainRect.current = { width, height };

        const resizeObserver = new ResizeObserver(() => {
            if (!mainRef.current || !prevMainRect.current) return;
            const { width: newW, height: newH } = mainRef.current.getBoundingClientRect();
            const { width: oldW, height: oldH } = prevMainRect.current;

            // Adjust offset to keep the center of the view stable
            setViewport(prev => ({
                ...prev,
                offset: {
                    x: prev.offset.x + (newW - oldW) / 2,
                    y: prev.offset.y + (newH - oldH) / 2
                }
            }));

            prevMainRect.current = { width: newW, height: newH };
        });
        resizeObserver.observe(mainRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) redo();
                else undo();
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                redo();
                e.preventDefault();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                handleZoomToFit();
            } else if (e.key === 'Escape') {
                if (selectedGuideId) {
                    setSelectedGuideId(null);
                    e.preventDefault();
                } else if (selectionBox) {
                    setSelectionBox(null);
                    e.preventDefault();
                }
            } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                // Do not hijack tab if user is in an input field.
                const activeEl = document.activeElement;
                const inInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

                if (!inInput) {
                    e.preventDefault();
                    setViewMode(prev => {
                        if (prev === 'EDITOR') return 'CANVAS';
                        if (prev === 'CANVAS') return 'VOLUMES';
                        return 'EDITOR';
                    });
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, handleZoomToFit, selectionBox, selectedGuideId, setSelectedGuideId]);

    // Global Event Listener to finalize Selection Box on release (pointerup)
    useEffect(() => {
        if (!selectionBox) return;

        const handleGlobalPointerUp = (e: PointerEvent) => {
            // Only handle left click release (button === 0)
            if (e.button !== 0) return;

            if (mainRef.current) {
                const rect = mainRef.current.getBoundingClientRect();
                const currentX = e.clientX - rect.left;
                const currentY = e.clientY - rect.top;

                const dx = currentX - selectionBox.start.x;
                const dy = currentY - selectionBox.start.y;
                if (Math.hypot(dx, dy) > 5) {
                    performSelection(selectionBox.start, { x: currentX, y: currentY });
                } else {
                    // It's a simple click - clear selections and close connection sources
                    setSelectedRoomIds(new Set());
                    setSelectedZone(null);
                    setSelectedAnnotationId(null);
                    if (connectionSourceId) setConnectionSourceId(null);
                }
            }
            setSelectionBox(null);
        };

        // Add capturing event listener to handle pointerup anywhere on the screen
        document.addEventListener('pointerup', handleGlobalPointerUp, { capture: true });

        return () => {
            document.removeEventListener('pointerup', handleGlobalPointerUp, { capture: true });
        };
    }, [selectionBox, performSelection]);

    // Auto-zoom when switching to Canvas
    useEffect(() => {
        if (viewMode === 'CANVAS' && !hasInitialZoomed) {
            const timer = setTimeout(() => {
                handleZoomToFit();
                setHasInitialZoomed(true);
            }, 50);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, hasInitialZoomed]);

    const handlePlaceCenter = (room: Room) => {
        addToHistory();
        if (mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Convert to World Coordinates
            const worldX = (centerX - offset.x) / scale - room.width / 2;
            const worldY = (centerY - offset.y) / scale - room.height / 2;

            updateRoom(room.id, { isPlaced: true, floor: currentFloor, x: worldX, y: worldY });
            setSelectedRoomIds(new Set([room.id]));
        }
    };

    const handleAddFloor = () => {
        addToHistory();
        const newId = floors.length > 0 ? Math.max(...floors.map(f => f.id)) + 1 : 0;
        const newFloor: Floor = { id: newId, label: `Floor ${newId}`, height: floors[floors.length - 1]?.height ?? 4 };
        setFloors([...floors, newFloor]);
        setCurrentFloor(newId);
    };

    const handleDeleteFloor = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        addToHistory();
        // Return rooms to inventory
        setRooms(prev => prev.map(r => r.floor === id ? { ...r, isPlaced: false } : r));

        const newFloors = floors.filter(f => f.id !== id);
        setFloors(newFloors);

        if (currentFloor === id) {
            if (newFloors.length > 0) {
                const deletedIndex = floors.findIndex(f => f.id === id);
                const newIndex = Math.max(0, deletedIndex - 1);
                setCurrentFloor(newFloors[newIndex].id);
            } else {
                // If all floors deleted, create a default one
                const defaultFloor: Floor = { id: 0, label: 'Ground Floor', height: 4 };
                setFloors([defaultFloor]);
                setCurrentFloor(0);
            }
        }
    };

    // Typing into a field should be one undo step, not one per keystroke. Consecutive edits with the same key
    // (the same fields of the same space or floor) less than a second apart share the step saved by the first.
    const lastGroupedEditRef = useRef<{ key: string; time: number } | null>(null);
    const addGroupedHistory = useCallback((key: string) => {
        const now = Date.now();
        const last = lastGroupedEditRef.current;
        if (!last || last.key !== key || now - last.time > 1000) addToHistory();
        lastGroupedEditRef.current = { key, time: now };
    }, [addToHistory]);

    const handleUpdateFloor = (id: number, updates: Partial<Floor>) => {
        addGroupedHistory(`floor:${id}:${Object.keys(updates).sort().join(',')}`);
        setFloors(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const handleRenameFloor = (id: number, newName: string) => handleUpdateFloor(id, { label: newName });

    // --- Drag & Drop Handlers ---
    const handleDragStart = (e: React.DragEvent, room: Room) => {
        e.dataTransfer.setData('roomId', room.id);
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Create a custom drag image if needed
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const roomId = e.dataTransfer.getData('roomId');
        if (!roomId) return;

        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        if (mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            // Calculate mouse position relative to the main container
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Convert to World Coordinates
            // WorldX = (ScreenX - OffsetX) / Scale
            // Center the room on the cursor by subtracting width/2, height/2
            const worldX = (mouseX - offset.x) / scale - room.width / 2;
            const worldY = (mouseY - offset.y) / scale - room.height / 2;

            updateRoom(roomId, { isPlaced: true, floor: currentFloor, x: worldX, y: worldY });
            setSelectedRoomIds(new Set([roomId]));
        }
    };

    const handleInventoryDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleInventoryDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const roomId = e.dataTransfer.getData('roomId');
        if (roomId) {
            updateRoom(roomId, { isPlaced: false });
            setSelectedRoomIds(new Set());
        }
    };

    const handleAddZone = (name: string) => {
        if (zoneColors[name] || !name.trim()) return;
        addToHistory();
        // Assign a random color style from existing ones for now
        const randomStyle = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
        setZoneColors(prev => ({ ...prev, [name]: randomStyle }));
    };

    const handleAutoArrange = () => {
        addToHistory();
        setRooms(prev => {
            // Sort rooms by Zone then Area (descending) before passing to layout engine
            const sortedRooms = [...prev].sort((a, b) => {
                // Primary: Zone
                if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
                // Secondary: Area (Largest first)
                return b.area - a.area;
            });
            return arrangeRooms(sortedRooms, currentFloor);
        });
        setRooms(prev => arrangeRooms(prev, currentFloor));
    };

    const handleAiSpatialLayout = async (
        instructions?: string,
        typology?: ZoningTypology,
        massing: 'compact' | 'l-shape' | 'u-shape' | 'courtyard' = 'compact',
        gridSize: number = 0.5
    ) => {
        if (!apiKey) {
            setShowApiKeyModal(true);
            return;
        }

        // Select rooms to arrange: either currently selected, or all unplaced/current floor rooms
        const roomsToArrange = selectedRoomIds.size > 0
            ? rooms.filter(r => selectedRoomIds.has(r.id))
            : rooms.filter(r => r.floor === currentFloor || !r.isPlaced);

        if (roomsToArrange.length === 0) return;

        // Identify fixed rooms (placed rooms that are NOT in roomsToArrange)
        const fixedRooms = rooms.filter(r =>
            r.isPlaced &&
            !roomsToArrange.some(rta => rta.id === r.id)
        );

        setIsAiLayoutLoading(true);
        try {
            // Convert fixed rooms to meters for the AI context
            const fixedSpacesForAi = fixedRooms.map(r => ({
                id: r.id,
                name: r.name,
                x: r.x / PIXELS_PER_METER,
                y: r.y / PIXELS_PER_METER,
                width: r.width / PIXELS_PER_METER,
                height: r.height / PIXELS_PER_METER,
                zone: r.zone,
                floor: r.floor
            }));

            const floorsForAi = floors.map(f => ({ id: f.id, label: f.label }));

            const layout = await generateSpatialLayout(
                roomsToArrange.map(r => ({
                    id: r.id,
                    name: r.name,
                    area: r.area,
                    zone: r.zone,
                    spaceType: r.spaceType,
                    vcType: r.vcType,
                    description: r.description,
                    daylightReq: r.daylightReq,
                    aspectRatioHint: r.aspectRatioHint
                })),
                fixedSpacesForAi,
                floorsForAi,
                apiKey,
                instructions,
                typology,
                massing,
                gridSize
            );

            const { placements, issues } = validateAiLayout(
                layout,
                roomsToArrange.map(r => ({ id: r.id, name: r.name, area: r.area, spaceType: r.spaceType })),
                fixedSpacesForAi,
                floors.map(f => f.id),
                gridSize
            );

            if (placements.length === 0) {
                notify({ kind: 'error', title: "The AI layout couldn't be used", details: issues });
                return;
            }

            addToHistory();
            const byId = new Map(placements.map(p => [p.id, p]));
            setRooms(prev => prev.map(r => {
                const match = byId.get(r.id);
                if (match) {
                    return { ...r, x: match.x * PIXELS_PER_METER, y: match.y * PIXELS_PER_METER, width: match.width * PIXELS_PER_METER, height: match.height * PIXELS_PER_METER, isPlaced: true, floor: match.floor };
                }
                return r;
            }));
            setShowAiLayoutModal(false);

            if (issues.length > 0) {
                notify({
                    kind: 'warning',
                    title: `AI layout applied with ${issues.length} adjustment${issues.length > 1 ? 's' : ''}`,
                    message: 'Press Ctrl+Z to undo.',
                    details: issues
                });
            } else {
                notify({ kind: 'success', title: `AI layout applied to ${placements.length} space${placements.length > 1 ? 's' : ''}`, message: 'Press Ctrl+Z to undo.' });
            }
        } catch (error) {
            // Keep the modal open so the user's instructions aren't lost
            console.error("AI Layout failed:", error);
            notify({ kind: 'error', title: 'AI layout failed', message: error instanceof Error ? error.message : undefined });
        } finally {
            setIsAiLayoutLoading(false);
        }
    };

    const handleClearCanvas = async () => {
        const ok = await confirmDialog({
            title: 'Clear canvas?',
            message: 'All spaces return to the inventory. You can undo this with Ctrl+Z.',
            confirmLabel: 'Clear canvas'
        });
        if (ok) {
            addToHistory();
            setRooms(prev => prev.map(r => ({ ...r, isPlaced: false })));
            setSelectedRoomIds(new Set());
            setSelectedZone(null);
        }
    };

    const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;

                // Handle CSV Import
                if (file.name.toLowerCase().endsWith('.csv')) {
                    const rows = parseCsv(content);
                    const newRooms: Room[] = [];
                    // Skip header if present (simple check)
                    const startIndex = rows[0]?.[0]?.toLowerCase().includes('name') ? 1 : 0;

                    for (let i = startIndex; i < rows.length; i++) {
                        // Expecting: Name, Area, Zone
                        const [rawName = '', rawArea = '', rawZone = ''] = rows[i];
                        const name = rawName.trim();
                        const area = parseArea(rawArea);
                        const zone = rawZone.trim() || 'Default';

                        if (name && !isNaN(area) && area > 0) {
                            const side = Math.sqrt(area) * PIXELS_PER_METER;
                            newRooms.push({
                                id: `room-${Date.now()}-${i}`,
                                name,
                                area,
                                zone,
                                isPlaced: false,
                                floor: 0,
                                x: 0, y: 0,
                                width: side,
                                height: side
                            });
                        }
                    }
                    if (newRooms.length > 0) {
                        addToHistory();
                        setRooms(prev => [...prev, ...newRooms]);
                        notify({ kind: 'success', title: `Imported ${newRooms.length} space${newRooms.length > 1 ? 's' : ''} from CSV` });
                    } else {
                        notify({ kind: 'warning', title: 'No valid spaces found in the CSV', message: 'Expected columns: Name, Area (m²), Zone.' });
                    }
                    return;
                }

                loadProject(parseProjectData(JSON.parse(content)));
                setSelectedRoomIds(new Set());

                setHasInitialZoomed(false);
                setViewMode('CANVAS');
            } catch (error) {
                console.error("Failed to import project:", error);
                notify({ kind: 'error', title: "Couldn't open the project file", message: error instanceof Error ? error.message : undefined });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // --- Guide Interaction Handlers ---
    const handleDragNewGuide = useCallback((type: 'h' | 'v', clientX: number, clientY: number) => {
        addToHistory();
        const worldPos = toWorld(clientX, clientY);
        const newId = `guide-${Date.now()}`;
        const newGuide: CanvasGuide = {
            id: newId,
            type,
            position: (type === 'h' ? worldPos.y : worldPos.x) / PIXELS_PER_METER,
            angle: 0,
            locked: false
        };
        setGuides(prev => [...prev, newGuide]);
        setSelectedGuideId(newId);
        setDraggedGuideId(newId);
    }, [toWorld, addToHistory]);

    const handleStartDragExistingGuide = useCallback((id: string, e: React.PointerEvent) => {
        setSelectedGuideId(id);
        const guide = guides.find(g => g.id === id);
        if (guide && !guide.locked) {
            addToHistory();
            setDraggedGuideId(id);
        }
    }, [guides, addToHistory]);

    const toggleLockGuide = useCallback((id: string) => {
        addToHistory();
        setGuides(prev => prev.map(g => g.id === id ? { ...g, locked: !g.locked } : g));
    }, [addToHistory]);

    const duplicateGuide = useCallback((id: string) => {
        const guide = guides.find(g => g.id === id);
        if (!guide) return;
        addToHistory();
        const newId = `guide-${Date.now()}`;
        const duplicate: CanvasGuide = {
            ...guide,
            id: newId,
            position: guide.position + 1.0, // Offset parallel guide by 1m
            locked: false
        };
        setGuides(prev => [...prev, duplicate]);
        setSelectedGuideId(newId);
    }, [guides, addToHistory]);

    const rotateGuide = useCallback((id: string, angleDelta: number) => {
        addToHistory();
        setGuides(prev => prev.map(g => g.id === id ? { ...g, angle: ((g.angle || 0) + angleDelta) % 360 } : g));
    }, [addToHistory]);

    const deleteGuide = useCallback((id: string) => {
        addToHistory();
        setGuides(prev => prev.filter(g => g.id !== id));
        if (selectedGuideId === id) {
            setSelectedGuideId(null);
        }
    }, [selectedGuideId, addToHistory]);

    // --- Room Handlers ---
    const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
        setRooms(prev => prev.map(r => {
            if (r.id !== id) return r;

            let updatedRoom = { ...r, ...updates };

            if (updates.area !== undefined &&
                updates.width === undefined &&
                updates.height === undefined &&
                !r.polygon &&
                !updates.polygon) {

                const side = Math.sqrt(Math.max(0, updates.area)) * PIXELS_PER_METER;
                updatedRoom.width = side;
                updatedRoom.height = side;
            }

            return updatedRoom;
        }));
    }, []);

    // After a polygon/bubble edit, move its origin (its rotation pivot) to the shape's centre; nothing moves on the plan
    const recenterRoomShape = useCallback((id: string) => {
        setRooms(prev => prev.map(r => (r.id === id ? recenterShape(r) : r)));
    }, []);

    // Property-panel edits are undoable; typing into a field is one step
    const updateRoomFromPanel = useCallback((id: string, updates: Partial<Room>) => {
        addGroupedHistory(`room:${id}:${Object.keys(updates).sort().join(',')}`);
        updateRoom(id, updates);
    }, [addGroupedHistory, updateRoom]);


    const handleMoveRoom = useCallback((id: string, x: number, y: number) => {
        setRooms(prev => {
            const leader = prev.find(r => r.id === id);
            if (!leader) return prev;

            const dx = x - leader.x;
            const dy = y - leader.y;

            if (dx === 0 && dy === 0) return prev;

            if (selectedRoomIds.has(id) && selectedRoomIds.size > 1) {
                return prev.map(r => {
                    if (selectedRoomIds.has(r.id) && r.isPlaced) {
                        const isVisible = r.floor === currentFloor ||
                            (r.spaceType === 'multistory' && currentFloor >= Math.min(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor) && currentFloor <= Math.max(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor)) ||
                            (r.spaceType === 'verticalConnection' && currentFloor >= Math.min(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor) && currentFloor <= Math.max(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor));
                        if (isVisible) {
                            return { ...r, x: r.x + dx, y: r.y + dy };
                        }
                    }
                    return r;
                });
            } else {
                return prev.map(r => r.id === id ? { ...r, x, y } : r);
            }
        });
    }, [selectedRoomIds, currentFloor]);

    const deleteRoom = useCallback((id: string) => {
        addToHistory();
        setRooms(prev => prev.filter(r => r.id !== id));
        setSelectedRoomIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, [addToHistory]);

    const addRoom = useCallback((roomData: Partial<Room>) => {
        addToHistory();
        const area = roomData.area || 15;
        const side = Math.sqrt(area) * PIXELS_PER_METER;
        const newRoom: Room = {
            id: `room-${Date.now()}`,
            name: roomData.name || 'New Space',
            area,
            zone: roomData.zone || 'Default',
            isPlaced: false,
            floor: 0,
            x: 0, y: 0,
            width: side,
            height: side,
            ...roomData
        };
        setRooms(prev => [...prev, newRoom]);
    }, [addToHistory]);

    const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, []);

    const handleAnnotationPropertyChange = (key: string, value: any) => {
        if (selectedAnnotationId) {
            addToHistory();
            updateAnnotation(selectedAnnotationId, { style: { ...selectedAnnotation!.style, [key]: value } });
        } else {
            setSketchProperties(prev => ({ ...prev, [key]: value }));
        }
    };

    const handleZIndex = (action: 'front' | 'back') => {
        if (!selectedAnnotationId) return;
        addToHistory();
        setAnnotations(prev => {
            const index = prev.findIndex(a => a.id === selectedAnnotationId);
            if (index === -1) return prev;
            const item = prev[index];
            const newArr = [...prev];
            newArr.splice(index, 1);
            if (action === 'front') newArr.push(item);
            else newArr.unshift(item);
            return newArr;
        });
    };

    const handleImportReference = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Support Images
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const url = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    const newImage: ReferenceImage = {
                        id: `ref-${Date.now()}`,
                        url,
                        name: file.name,
                        x: 0,
                        y: 0,
                        width: img.width,
                        height: img.height,
                        scale: 1,
                        rotation: 0,
                        opacity: 0.5,
                        isLocked: false,
                        floor: currentFloor
                    };
                    addToHistory();
                    setReferenceImages(prev => [...prev, newImage]);
                };
                img.src = url;
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            notify({ kind: 'info', title: 'PDF references are not supported yet', message: 'Please use a PNG or JPG image for now.' });
        }

        e.target.value = '';
    };

    const handleUpdateReferenceImage = useCallback((id: string, updates: Partial<ReferenceImage>) => {
        setReferenceImages(prev => prev.map(img => img.id === id ? { ...img, ...updates } : img));
    }, []);

    // --- Site ---
    const siteReport = useMemo(() => analyzeSite(siteProperties, rooms, floors, appSettings, PIXELS_PER_METER), [siteProperties, rooms, floors, appSettings]);

    const updateSite = useCallback((updates: Partial<SiteProperties>) => {
        setSiteProperties(prev => ({ ...prev, ...updates }));
    }, [setSiteProperties]);

    // Moves the boundary, zones, geographic anchor and satellite underlay together (meters)
    const moveSite = useCallback((dx: number, dy: number) => {
        const shift = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
        setSiteProperties(prev => ({
            ...prev,
            boundary: prev.boundary?.map(shift),
            zones: prev.zones?.map(z => ({ ...z, points: z.points.map(shift) })),
            geoAnchor: prev.geoAnchor && { ...prev.geoAnchor, x: prev.geoAnchor.x + dx, y: prev.geoAnchor.y + dy },
        }));
        setReferenceImages(prev => prev.map(img => img.isSiteImagery ? { ...img, x: img.x + dx * PIXELS_PER_METER, y: img.y + dy * PIXELS_PER_METER } : img));
    }, [setSiteProperties, setReferenceImages]);

    // Rotates the site about its centre (clockwise degrees). North turns with it, so the site stays true
    // to the globe while the plan's axes follow the street. Placed spaces don't move.
    const rotateSite = useCallback((deg: number) => {
        const boundary = siteProperties.boundary;
        if (!boundary || boundary.length < 3 || !deg) return;
        const pivot = polygonCentroid(boundary);
        const rot = (p: Point) => rotatePoint(p, pivot, deg);
        addToHistory();
        setSiteProperties(prev => ({
            ...prev,
            boundary: prev.boundary?.map(rot),
            zones: prev.zones?.map(z => ({ ...z, points: z.points.map(rot) })),
            geoAnchor: prev.geoAnchor && { ...prev.geoAnchor, ...rot(prev.geoAnchor) },
            northAngle: Number((((((prev.northAngle || 0) + deg) % 360) + 360) % 360).toFixed(2)),
        }));
        const pivotPx = { x: pivot.x * PIXELS_PER_METER, y: pivot.y * PIXELS_PER_METER };
        setReferenceImages(prev => prev.map(img => {
            if (!img.isSiteImagery) return img;
            const w = img.width * img.scale, h = img.height * img.scale;
            const c = rotatePoint({ x: img.x + w / 2, y: img.y + h / 2 }, pivotPx, deg);
            return { ...img, x: c.x - w / 2, y: c.y - h / 2, rotation: (img.rotation || 0) + deg };
        }));
    }, [siteProperties.boundary, addToHistory, setSiteProperties, setReferenceImages]);

    const handleImportSiteFile = async (file: File): Promise<KmlShape[]> => {
        try {
            const shapes = await readGoogleEarthFile(file);
            if (shapes.length === 0) {
                notify({ kind: 'warning', title: 'No site outline found', message: 'The file has no polygons or closed paths. Draw the site as a polygon in Google Earth and export it again.' });
            }
            return shapes;
        } catch (err) {
            console.error('Google Earth import failed', err);
            notify({ kind: 'error', title: 'Could not read the file', message: err instanceof Error ? err.message : 'Use a .kml or .kmz file exported from Google Earth.' });
            return [];
        }
    };

    const handleApplySiteShape = (shape: KmlShape) => {
        // Centre the site on the spaces already placed on this floor, or on the origin
        const placed = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
        const center = placed.length
            ? polygonCentroid(placed.flatMap(r => roomWorldPolygon(r, PIXELS_PER_METER)))
            : { x: 0, y: 0 };
        const { boundary, anchor } = shapeToBoundary(shape, siteProperties.northAngle || 0, center);
        addToHistory();
        setSiteProperties(prev => ({
            ...prev,
            boundary,
            geoAnchor: anchor,
            latitude: Number(anchor.lat.toFixed(6)),
            longitude: Number(anchor.lon.toFixed(6)),
            locationName: shape.name || prev.locationName,
            constraints: prev.constraints ? { ...prev.constraints, edgeSetbacks: [] } : prev.constraints,
            showSite: true,
        }));
        setSiteSelection({ kind: 'boundary' });
        setSiteTool('select');
        setFitRequest(n => n + 1);
        notify({ kind: 'success', title: 'Site imported', message: `${shape.name}: ${boundary.length} corners. Location and coordinates were updated.` });
    };

    const handleAddSiteImagery = async () => {
        const northAngle = siteProperties.northAngle || 0;
        const boundary = siteProperties.boundary && siteProperties.boundary.length >= 3 ? siteProperties.boundary : null;
        // Without a KML anchor, assume the site's coordinates are at the middle of the boundary (or the origin)
        const anchor = siteProperties.geoAnchor ?? {
            lat: siteProperties.latitude, lon: siteProperties.longitude,
            ...(boundary ? polygonCentroid(boundary) : { x: 0, y: 0 }),
        };
        if (!Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon) || (anchor.lat === 0 && anchor.lon === 0)) {
            notify({ kind: 'warning', title: 'Set the site location first', message: 'Click the compass to search for the site, or import it from Google Earth.' });
            return;
        }
        try {
            const geoPts = boundary ? boundary.map(p => worldToGeo(p, anchor, northAngle)) : [{ lat: anchor.lat, lon: anchor.lon }];
            const imagery = await fetchSiteImagery(imageryBox(geoPts, boundary ? 40 : 120));
            const c = geoToWorld(imagery.center.lat, imagery.center.lon, anchor, northAngle);
            const pxScale = imagery.metersPerPixel * PIXELS_PER_METER;
            const image: ReferenceImage = {
                id: `ref-site-${Date.now()}`,
                url: imagery.dataUrl,
                name: 'Satellite (Esri World Imagery)',
                width: imagery.widthPx,
                height: imagery.heightPx,
                scale: pxScale,
                x: c.x * PIXELS_PER_METER - (imagery.widthPx * pxScale) / 2,
                y: c.y * PIXELS_PER_METER - (imagery.heightPx * pxScale) / 2,
                rotation: northAngle,
                opacity: 0.6,
                isLocked: true,
                floor: currentFloor,
                isSiteImagery: true,
            };
            addToHistory();
            // One underlay per floor: replace an earlier one
            setReferenceImages(prev => [...prev.filter(img => !(img.isSiteImagery && img.floor === currentFloor)), image]);
            if (!siteProperties.geoAnchor) updateSite({ geoAnchor: anchor });
            setFitRequest(n => n + 1);
            notify({ kind: 'success', title: 'Satellite underlay added', message: `Locked reference image on this floor. ${IMAGERY_ATTRIBUTION}.` });
        } catch (err) {
            console.error('Satellite imagery failed', err);
            notify({ kind: 'error', title: 'Could not add satellite imagery', message: err instanceof Error ? err.message : 'Try again later.' });
        }
    };

    // --- AI bridges (MCP): commands from Claude / Gemini / ChatGPT, applied as one undo step each ---
    const bridgeHandlerRef = useRef<(tool: string, args: unknown) => unknown | Promise<unknown>>(() => undefined);
    bridgeHandlerRef.current = (tool: string, args: unknown) => {
        if (tool === 'undo') {
            if (!canUndo) throw new BridgeError('Nothing to undo.');
            undo();
            return { undone: true };
        }
        if (tool === 'get_plan_image') {
            const a = (args || {}) as { floor?: number; ghostFloor?: number; width?: number; showSite?: boolean; showUnderlay?: boolean };
            const floor = a.floor ?? currentFloor;
            if (!floors.some(f => f.id === floor)) throw new BridgeError(`Floor ${floor} does not exist. Floors: ${floors.map(f => f.id).join(', ')}.`);
            const plan = renderPlanSvg(
                { projectName, rooms, floors, siteProperties, referenceImages, appSettings },
                {
                    floor, ghostFloor: a.ghostFloor, width: a.width, showSite: a.showSite, showUnderlay: a.showUnderlay, dark: darkMode,
                    zoneColor: zone => ({ fill: getHexColorForZone(zone, zoneColors), stroke: getHexBorderForZone(zone, zoneColors) }),
                    pxPerMeter: PIXELS_PER_METER,
                },
            );
            if (!plan) throw new BridgeError(`Nothing to show on floor ${floor}: no placed spaces and no site boundary.`);
            return svgToPngBase64(plan.svg, plan.width, plan.height).then(image => ({
                image, mimeType: 'image/png', width: plan.width, height: plan.height, floor, spaces: plan.spaces,
                ...(a.showUnderlay ? { underlays: plan.underlays } : {}),
                bounds: Object.fromEntries(Object.entries(plan.bounds).map(([k, v]) => [k, Number(v.toFixed(2))])),
            }));
        }
        if (tool === 'get_planning_rules') return PLANNING_RULES;
        if (tool === 'check_layout') {
            return checkProject(getProjectData(), { projectName, rooms, floors, currentFloor, zoneColors, siteProperties, appSettings });
        }
        const outcome = runBridgeCommand(tool, args, { projectName, rooms, floors, currentFloor, zoneColors, siteProperties, appSettings });
        const c = outcome.changes;
        if (c) {
            if (outcome.undoable) addToHistory();
            if (c.rooms) setRooms(c.rooms);
            if (c.floors) setFloors(c.floors);
            if (c.siteProperties) setSiteProperties(c.siteProperties);
            if (c.currentFloor !== undefined) { setCurrentFloor(c.currentFloor); setViewMode('CANVAS'); }
            if (c.newZones?.length) {
                setZoneColors(prev => {
                    const next = { ...prev };
                    c.newZones!.forEach((z, i) => { if (!next[z]) next[z] = COLOR_PALETTE[(Object.keys(prev).length + i) % COLOR_PALETTE.length]; });
                    return next;
                });
            }
            // Placed spaces are easier to follow on the canvas
            if (tool === 'place_spaces' || tool === 'draw_spaces') setViewMode(prev => (prev === 'EDITOR' ? 'CANVAS' : prev));
        }
        return outcome.result;
    };
    useEffect(() => {
        bridge.setHandler((tool, args) => bridgeHandlerRef.current(tool, args));
        bridge.start();
        return () => bridge.setHandler(null);
    }, []);

    const closeSiteMode = () => {
        setIsSiteMode(false);
        setSiteSelection(null);
        setSiteTool('select');
    };

    const handleDeleteReferenceImage = (id: string) => {
        addToHistory();
        setReferenceImages(prev => prev.filter(img => img.id !== id));
        if (selectedReferenceImageId === id) setSelectedReferenceImageId(null);
    };

    const handleScalingPointClick = (p: Point) => {
        if (!referenceScaleState) return;

        if (referenceScaleState.step === 'point1') {
            setReferenceScaleState({ ...referenceScaleState, points: [p], step: 'point2' });
        } else if (referenceScaleState.step === 'point2') {
            // Add the second point immediately to show the line
            const newPoints = [referenceScaleState.points[0], p];
            setReferenceScaleState({ ...referenceScaleState, points: newPoints });

            // Delay the prompt slightly to allow React to render the line
            setTimeout(() => {
                const p1 = newPoints[0];
                const p2 = newPoints[1];
                const distPx = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

                const input = window.prompt("Enter real-world distance between points (meters):");
                if (input) {
                    const distMeters = parseFloat(input);
                    if (!isNaN(distMeters) && distMeters > 0) {
                        const img = referenceImages.find(i => i.id === referenceScaleState.imageId);
                        if (img) {
                            const targetPx = distMeters * PIXELS_PER_METER;
                            const newScale = (img.scale * targetPx) / distPx;
                            addToHistory();
                            handleUpdateReferenceImage(img.id, { scale: newScale });
                        }
                    }
                }
                setReferenceScaleState(null);
            }, 50);
        }
    };

    const deleteAnnotation = useCallback((id: string) => {
        addToHistory();
        setAnnotations(prev => prev.filter(a => a.id !== id));
    }, [addToHistory]);

    const handleSaveApiKey = (key: string) => {
        setApiKey(key);
        localStorage.setItem('SOAP_GEMINI_KEY', key);
    };

    const toggleLink = useCallback((roomId: string) => {
        if (connectionSourceId === roomId) {
            setConnectionSourceId(null);
        } else if (connectionSourceId) {
            addToHistory();
            setConnections(prev => {
                const existing = prev.find(c =>
                    (c.fromId === connectionSourceId && c.toId === roomId) ||
                    (c.fromId === roomId && c.toId === connectionSourceId)
                );
                if (!existing) {
                    return [...prev, {
                        id: `conn-${Date.now()}`,
                        fromId: connectionSourceId,
                        toId: roomId
                    }];
                } else {
                    return prev.filter(c => c.id !== existing.id);
                }
            });
            setConnectionSourceId(null);
        } else {
            setConnectionSourceId(roomId);
        }
    }, [connectionSourceId, addToHistory]);

    const removeConnection = useCallback((id: string) => {
        addToHistory();
        setConnections(prev => prev.filter(c => c.id !== id));
    }, [addToHistory]);

    const toggleFloorVisibility = useCallback((floorId: number) => {
        setHiddenFloorIds(prev => {
            const next = new Set(prev);
            if (next.has(floorId)) {
                next.delete(floorId);
            } else {
                next.add(floorId);
            }
            return next;
        });
    }, []);

    // --- Zone Handlers ---
    const handleZoneDrag = useCallback((zone: string, dx: number, dy: number) => {
        setRooms(prev => prev.map(r => {
            if (r.zone === zone && r.isPlaced) {
                const isVisible = r.floor === currentFloor ||
                    (r.spaceType === 'multistory' && currentFloor >= Math.min(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor) && currentFloor <= Math.max(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor)) ||
                    (r.spaceType === 'verticalConnection' && currentFloor >= Math.min(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor) && currentFloor <= Math.max(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor));
                if (isVisible) {
                    return { ...r, x: r.x + dx, y: r.y + dy };
                }
            }
            return r;
        }));
    }, [currentFloor]);

    const handleZoneClick = useCallback((z: string) => {
        setSelectedZone(z);
        setSelectedRoomIds(new Set());
    }, []);

    const renameZone = useCallback((oldZone: string, rawName: string) => {
        const newZone = rawName.trim();
        if (!newZone || newZone === oldZone) return;
        addToHistory();
        setRooms(prev => prev.map(r => r.zone === oldZone ? { ...r, zone: newZone } : r));
        // The colour follows the zone; renaming onto an existing zone merges into it and keeps its colour
        setZoneColors(prev => {
            if (!prev[oldZone]) return prev;
            const { [oldZone]: color, ...rest } = prev;
            return rest[newZone] ? rest : { ...rest, [newZone]: color };
        });
        setSelectedZone(newZone);
    }, [addToHistory, setZoneColors]);

    const handleBubbleDragEnd = useCallback((room: Room, e: any) => {
        setIsBubbleDragging(false);
        if (!room || !e) return;

        if (inventoryRef.current) {
            const rect = inventoryRef.current.getBoundingClientRect();
            if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                if (selectedRoomIds.has(room.id) && selectedRoomIds.size > 1) {
                    setRooms(prev => prev.map(r => selectedRoomIds.has(r.id) ? { ...r, isPlaced: false } : r));
                    setSelectedRoomIds(new Set());
                } else {
                    updateRoom(room.id, { isPlaced: false });
                    setSelectedRoomIds(new Set());
                }
            }
        }
    }, [updateRoom, selectedRoomIds]);

    const handleZoneDragEnd = useCallback((e: any) => {
        setIsZoneDragging(false);
        if (selectedZone && inventoryRef.current) {
            const rect = inventoryRef.current.getBoundingClientRect();
            if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                // Return zone to inventory
                addToHistory();
                setRooms(prev => prev.map(r => {
                    if (r.zone === selectedZone) {
                        const isVisible = r.floor === currentFloor ||
                            (r.spaceType === 'multistory' && currentFloor >= Math.min(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor) && currentFloor <= Math.max(r.msFromFloor ?? r.floor, r.msToFloor ?? r.floor)) ||
                            (r.spaceType === 'verticalConnection' && currentFloor >= Math.min(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor) && currentFloor <= Math.max(r.vcFromFloor ?? r.floor, r.vcToFloor ?? r.floor));
                        if (isVisible) {
                            return { ...r, isPlaced: false };
                        }
                    }
                    return r;
                }));
                setSelectedZone(null);
            }
        }
    }, [selectedZone, currentFloor, addToHistory]);

    // --- Render Helpers ---
    const selectedRoom = rooms.find(r => selectedRoomIds.has(r.id));
    const selectedRoomsList = rooms.filter(r => selectedRoomIds.has(r.id));

    // Multi-selection stats
    const isMultiSelection = selectedRoomIds.size > 1;
    const multiSelectionStats = useMemo(() => {
        if (!isMultiSelection) return null;
        const totalArea = selectedRoomsList.reduce((acc, r) => acc + r.area, 0);
        const types = selectedRoomsList.reduce((acc, r) => {
            const type = r.shape === 'bubble' ? 'Bubble' : (r.polygon ? 'Polygon' : 'Rectangle');
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        const breakdown = Object.entries(types).map(([t, c]) => `${c} ${t}${(c as number) > 1 ? 's' : ''}`).join(', ');

        // Determine common shape state
        const firstShape = selectedRoomsList[0].shape || 'rect';
        const isMixed = selectedRoomsList.some(r => (r.shape || 'rect') !== (firstShape || 'rect'));
        const commonShape = isMixed ? null : (firstShape || 'rect');

        return { totalArea, breakdown, commonShape };
    }, [selectedRoomsList, isMultiSelection]);

    const handleMoveSelectionFloors = (direction: 1 | -1) => {
        addToHistory();
        setRooms(prev => prev.map(r => {
            if (selectedRoomIds.has(r.id)) {
                const currentIdx = floors.findIndex(f => f.id === r.floor);
                if (currentIdx === -1) return r;
                const newIdx = currentIdx + direction;
                if (newIdx >= 0 && newIdx < floors.length) {
                    return { ...r, floor: floors[newIdx].id };
                }
            }
            return r;
        }));
    };

    const handleConvertShape = (shape: 'rect' | 'polygon' | 'bubble') => {
        addToHistory();
        setRooms(prev => prev.map(r => {
            if (!selectedRoomIds.has(r.id)) return r;
            if ((r.shape || 'rect') === shape) return r;

            const roomStyle = r.style;
            const newStyle: any = { ...roomStyle };

            if (roomStyle?.fill) newStyle.fill = roomStyle.fill;
            if (roomStyle?.stroke) newStyle.stroke = roomStyle.stroke;
            if (roomStyle?.strokeWidth) newStyle.strokeWidth = roomStyle.strokeWidth;
            if (roomStyle?.opacity) newStyle.opacity = roomStyle.opacity;
            if (roomStyle?.cornerRadius) newStyle.cornerRadius = roomStyle.cornerRadius;
            if (roomStyle?.strokeDasharray) newStyle.strokeDasharray = roomStyle.strokeDasharray;

            // If the original room had no style object, newStyle might be empty, which is perfect.
            const newRoom = { ...r, shape, style: Object.keys(newStyle).length > 0 ? newStyle : undefined };

            if (shape === 'rect') {
                if (r.polygon && r.polygon.length > 0) {
                    const points = r.polygon;
                    const rotationRad = ((r.rotation || 0) * Math.PI) / 180;
                    const cosR = Math.cos(rotationRad);
                    const sinR = Math.sin(rotationRad);

                    // 1. Convert local points to absolute canvas points
                    const absPoints = points.map(p => {
                        const xAbs = p.x * cosR - p.y * sinR + r.x;
                        const yAbs = p.x * sinR + p.y * cosR + r.y;
                        return { x: xAbs, y: yAbs };
                    });

                    // 2. Compute polygon area in pixels
                    const polyAreaPx = (r.shape === 'bubble') ? calculateCurvedArea(points) : calculatePolygonArea(points);

                    // Check if they form a rectangle/square
                    let isRect = false;
                    let W = 0, H = 0, rx = 0, ry = 0, rotDeg = 0;

                    if (absPoints.length === 4) {
                        const [A0, A1, A2, A3] = absPoints;
                        const v0 = { x: A1.x - A0.x, y: A1.y - A0.y };
                        const v1 = { x: A2.x - A1.x, y: A2.y - A1.y };
                        const v2 = { x: A3.x - A2.x, y: A3.y - A2.y };
                        const v3 = { x: A0.x - A3.x, y: A0.y - A3.y };

                        const L0 = Math.sqrt(v0.x * v0.x + v0.y * v0.y);
                        const L1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
                        const L2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
                        const L3 = Math.sqrt(v3.x * v3.x + v3.y * v3.y);

                        if (L0 >= 0.1 && L1 >= 0.1 && L2 >= 0.1 && L3 >= 0.1) {
                            const lenDiff1 = Math.abs(L0 - L2) / Math.max(L0, L2);
                            const lenDiff2 = Math.abs(L1 - L3) / Math.max(L1, L3);

                            const d0 = Math.abs((v0.x * v1.x + v0.y * v1.y) / (L0 * L1));
                            const d1 = Math.abs((v1.x * v2.x + v1.y * v2.y) / (L1 * L2));
                            const d2 = Math.abs((v2.x * v3.x + v2.y * v3.y) / (L2 * L3));
                            const d3 = Math.abs((v3.x * v0.x + v3.y * v0.y) / (L3 * L0));

                            const lenTolerance = 0.08;
                            const orthoTolerance = 0.087; // ~5 deg

                            if (lenDiff1 < lenTolerance && lenDiff2 < lenTolerance &&
                                d0 < orthoTolerance && d1 < orthoTolerance &&
                                d2 < orthoTolerance && d3 < orthoTolerance) {
                                isRect = true;
                                W = (L0 + L2) / 2;
                                H = (L1 + L3) / 2;
                                const C = {
                                    x: (A0.x + A1.x + A2.x + A3.x) / 4,
                                    y: (A0.y + A1.y + A2.y + A3.y) / 4
                                };
                                const thetaRad = Math.atan2(v0.y, v0.x);
                                rotDeg = (thetaRad * 180) / Math.PI;
                                rx = C.x - W / 2;
                                ry = C.y - H / 2;
                            }
                        }
                    }

                    if (!isRect) {
                        // Fit using Minimum Area Oriented Bounding Box (OBB)
                        const centroid = calculateCentroid(absPoints);
                        let minArea = Infinity;
                        let bestTheta = 0;
                        let bestW = 0;
                        let bestH = 0;
                        let bestCX = 0;
                        let bestCY = 0;

                        const N = absPoints.length;
                        for (let i = 0; i < N; i++) {
                            const p1 = absPoints[i];
                            const p2 = absPoints[(i + 1) % N];
                            const v = { x: p2.x - p1.x, y: p2.y - p1.y };
                            const theta = Math.atan2(v.y, v.x);

                            const cosA = Math.cos(-theta);
                            const sinA = Math.sin(-theta);
                            const rotated = absPoints.map(p => {
                                const dx = p.x - centroid.x;
                                const dy = p.y - centroid.y;
                                return {
                                    x: dx * cosA - dy * sinA,
                                    y: dx * sinA + dy * cosA
                                };
                            });

                            let minX = Infinity, maxX = -Infinity;
                            let minY = Infinity, maxY = -Infinity;
                            rotated.forEach(p => {
                                if (p.x < minX) minX = p.x;
                                if (p.x > maxX) maxX = p.x;
                                if (p.y < minY) minY = p.y;
                                if (p.y > maxY) maxY = p.y;
                            });

                            const currentW = maxX - minX;
                            const currentH = maxY - minY;
                            const area = currentW * currentH;

                            if (area < minArea) {
                                minArea = area;
                                bestTheta = theta;
                                bestW = currentW;
                                bestH = currentH;
                                const C_local = {
                                    x: (minX + maxX) / 2,
                                    y: (minY + maxY) / 2
                                };
                                const cosB = Math.cos(bestTheta);
                                const sinB = Math.sin(bestTheta);
                                bestCX = C_local.x * cosB - C_local.y * sinB + centroid.x;
                                bestCY = C_local.x * sinB + C_local.y * cosB + centroid.y;
                            }
                        }

                        // Scale the bestW and bestH so the bounding box area matches the original polygon's area
                        const obbArea = bestW * bestH;
                        if (obbArea > 10 && polyAreaPx > 10) {
                            const s = Math.sqrt(polyAreaPx / obbArea);
                            bestW *= s;
                            bestH *= s;
                        }

                        W = bestW;
                        H = bestH;
                        rotDeg = (bestTheta * 180) / Math.PI;
                        rx = bestCX - W / 2;
                        ry = bestCY - H / 2;
                    }

                    // Normalize angle to standard bounds [-180, 180]
                    if (rotDeg > 180) rotDeg -= 360;
                    if (rotDeg < -180) rotDeg += 360;

                    newRoom.polygon = undefined;
                    newRoom.width = W;
                    newRoom.height = H;
                    newRoom.x = rx;
                    newRoom.y = ry;
                    newRoom.rotation = Number(rotDeg.toFixed(2));

                    const newArea = Number(((W * H) / (PIXELS_PER_METER * PIXELS_PER_METER)).toFixed(2));
                    newRoom.area = newArea > 0 ? newArea : r.area;
                } else {
                    newRoom.polygon = undefined;
                }
            } else {
                let points = r.polygon;
                if (!points || points.length === 0) {
                    // A rect turns about its centre; start the shape with its origin there too, so it doesn't jump
                    const hw = r.width / 2, hh = r.height / 2;
                    points = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
                    newRoom.x = r.x + hw;
                    newRoom.y = r.y + hh;
                    if (r.textPos) newRoom.textPos = { x: r.textPos.x - hw, y: r.textPos.y - hh };
                }
                if (shape === 'bubble') {
                    const targetAreaPx = r.area * (PIXELS_PER_METER * PIXELS_PER_METER);
                    const centroid = calculateCentroid(points);
                    let scale = 0.9;
                    points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * scale, y: centroid.y + (p.y - centroid.y) * scale }));
                    for (let i = 0; i < 10; i++) {
                        const currentArea = calculateCurvedArea(points);
                        if (currentArea === 0 || Math.abs(currentArea - targetAreaPx) < 10) break;
                        const correction = Math.sqrt(targetAreaPx / currentArea);
                        points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * correction, y: centroid.y + (p.y - centroid.y) * correction }));
                    }
                }
                newRoom.polygon = points;
            }
            // Polygon ↔ bubble moves the centre of gravity slightly: keep the rotation pivot on it
            return shape === 'rect' ? newRoom : recenterShape(newRoom);
        }));
    };

    const unplacedRooms = rooms.filter(r => !r.isPlaced);

    // Zone Stats
    const selectedZoneRooms = useMemo(() => {
        if (!selectedZone) return [];
        return rooms.filter(r => r.zone === selectedZone);
    }, [rooms, selectedZone]);

    const zoneArea = selectedZoneRooms.reduce((acc, r) => acc + r.area, 0);



    const handleSave = async (format: 'json' | 'png' | 'pdf' | 'obj' | 'csv' | 'dxf', options?: any) => {
        setShowExportModal(false);
        const name = options?.filename || projectName || 'project';
        const finalName = name.trim().replace(/[\\/:"*?<>|]/g, '_'); // Sanitize filename
        const exportOptions = {
            ...options,
            showZones
        };

        if (format === 'json') {
            const data = getProjectData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            await saveFile(blob, finalName, 'json');
        } else if (format === 'csv') {
            const headers = "Name,Area,Zone,Floor\n";
            const csvContent = rooms.map(r => [r.name, r.area, r.zone, (r.isPlaced && floors.find(f => f.id === r.floor)?.label) || 'Unplaced'].map(toCsvField).join(',')).join('\n');
            const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${finalName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } else if (format === 'obj') {
            if (volumesViewRef.current) {
                const blob = volumesViewRef.current.exportOBJ();
                if (blob) {
                    await saveFile(blob, finalName, 'obj');
                } else {
                    notify({ kind: 'error', title: "Couldn't export the 3D model" });
                }
            }
        } else if (format === 'png') {
            try {
                if (viewMode === 'VOLUMES' && volumesViewRef.current) {
                    const blob = await volumesViewRef.current.captureScreenshot();
                    if (blob) await saveFile(blob, finalName, 'png');
                } else if (viewMode === 'CANVAS' || viewMode === 'EDITOR') {
                    const blob = await handleExport(format, finalName, rooms, connections, currentFloor, darkMode, zoneColors, floors, appSettings, annotations, exportOptions, canvasStyle, referenceImages, siteProperties, floorOverlays);
                    if (blob) await saveFile(blob, finalName, 'png');
                }
            } catch (err) {
                console.error("Image export failed", err);
                notify({ kind: 'error', title: "Couldn't export the image", message: err instanceof Error ? err.message : undefined });
            }
        } else if (format === 'pdf' || format === 'dxf') {
            try {
                const blob = await handleExport(format, finalName, rooms, connections, currentFloor, darkMode, zoneColors, floors, appSettings, annotations, exportOptions, canvasStyle, referenceImages, siteProperties, floorOverlays);
                if (blob) await saveFile(blob, finalName, format);
            } catch (err) {
                console.error(`${format.toUpperCase()} export failed`, err);
                notify({ kind: 'error', title: `Couldn't export the ${format.toUpperCase()}`, message: err instanceof Error ? err.message : undefined });
            }
        }
    };

    const getCanvasPreview = useCallback(async (options?: any) => {
        if (viewMode === 'VOLUMES' && volumesViewRef.current) {
            const blob = await volumesViewRef.current.captureScreenshot();
            return blob ? URL.createObjectURL(blob) : null;
        } else if ((viewMode === 'CANVAS' || viewMode === 'EDITOR') && mainRef.current) {
            try {
                const previewOptions = {
                    ...options,
                    showZones,
                    isPreview: true
                };

                // If previewing PDF format, tell handleExport to apply printable color overrides
                if (options?.format === 'pdf') {
                    previewOptions.transparentBackground = false;
                }

                const blob = await handleExport(
                    'png',
                    projectName,
                    rooms,
                    connections,
                    currentFloor,
                    darkMode,
                    zoneColors,
                    floors,
                    appSettings,
                    annotations,
                    previewOptions,
                    canvasStyle,
                    referenceImages,
                    siteProperties,
                    floorOverlays
                );

                return blob ? URL.createObjectURL(blob) : null;
            } catch (err) {
                console.error("Preview generation failed", err);
                return null;
            }
        }
        return null;
    }, [viewMode, showZones, projectName, rooms, connections, currentFloor, darkMode, zoneColors, floors, appSettings, annotations, canvasStyle, referenceImages, siteProperties, floorOverlays]);

    return (
        <div className="h-screen w-screen bg-slate-50 dark:bg-dark-bg overflow-hidden font-sans selection:bg-orange-500/20 transition-colors duration-300">
            <NotificationHost />
            {autosaveError && (
                <div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 max-w-[calc(100vw-2rem)] px-4 py-2 rounded-xl bg-red-600 text-white text-sm shadow-lg">
                    <span>{autosaveError}</span>
                    <button onClick={() => setShowExportModal(true)} className="shrink-0 px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 font-medium">Save file</button>
                    <button onClick={() => setAutosaveError(null)} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">✕</button>
                </div>
            )}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
                :root, body, .font-sans { font-family: 'Inter', sans-serif; }
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
                @media print {
                    header, aside, .export-exclude { display: none !important; }
                    main { position: static !important; overflow: visible !important; }
                    body { background: white !important; }
                }
            `}</style>

            {/* Mobile Warning Overlay */}
            <div className="fixed inset-0 z-[9999] bg-slate-50 dark:bg-dark-bg flex flex-col items-center justify-center p-8 text-center md:hidden">
                <img src={SoapLogo} className="w-16 h-16 mb-6" alt="SOAP" />
                <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Desktop Required</h1>
                <p className="text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">
                    Sorry, This app requires a bigger screen to run.
                </p>
            </div>

            <div className="hidden md:flex flex-col h-full w-full">
                {/* Premium Header */}
                <header className="h-[42px] glass-panel !border-x-0 !border-t-0 flex items-center justify-between pr-4 shrink-0 z-40 shadow-sm relative transition-colors duration-300">
                    <div className="flex flex-1 items-center h-full overflow-hidden">
                        {/* Logo Block (matches inventory width) */}
                        <div className={`flex items-center h-full transition-all duration-300 shrink-0 ${isInventoryOpen ? 'w-80 border-r border-slate-200/50 dark:border-dark-border pr-2' : 'w-[42px] mr-4'}`}>
                            <img src={SoapLogo} className="w-[42px] h-[42px] object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity" title="Rename Project" alt="SOAP" onClick={() => {
                                const newName = window.prompt("Rename Project:", projectName);
                                if (newName && newName.trim()) setProjectName(newName);
                            }} />
                            <div className={`flex-1 min-w-0 px-3 hidden md:block transition-opacity duration-300 ${isInventoryOpen ? 'opacity-100' : 'opacity-0'}`}>
                                <input className="font-black text-slate-900 dark:text-gray-100 tracking-tight leading-none bg-transparent border-none focus:outline-none focus:ring-0 w-full p-0 text-sm truncate" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                            </div>
                        </div>

                        {/* Actions Block */}
                        <div className="hidden lg:flex items-center gap-1 pl-2">
                            <button
                                onClick={() => setDarkMode(!darkMode)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${!darkMode ? 'text-slate-400 hover:text-orange-500 hover:bg-orange-50' : 'text-slate-400 hover:text-orange-400 hover:bg-white/5'}`}
                                title="Toggle Dark Mode"
                            >
                                {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                            </button>
                            <button
                                onClick={() => setShowBridgesModal(true)}
                                className={`relative w-8 h-8 rounded-lg flex items-center justify-center ${bridgeState.settings.enabled ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-white/5'}`}
                                title="Connect an AI assistant (Claude)"
                            >
                                <Plug size={14} />
                                {bridgeState.settings.enabled && (
                                    // Waiting for Claude Desktop to open is normal (amber); red means something needs fixing
                                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${bridgeState.status === 'connected' ? (bridgeState.sessions.length ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500') : bridgeState.problem || (bridgeState.status === 'unavailable' && bridgeState.settings.connection !== 'helper') ? 'bg-red-500' : 'bg-amber-400'}`} />
                                )}
                            </button>
                            <button
                                onClick={() => setShowApiKeyModal(true)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${apiKey ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-white/5' : 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 shadow-lg shadow-orange-100'}`}
                                title="Gemini API Key Settings"
                            >
                                <Key size={14} />
                            </button>
                            <button onClick={() => {
                                setShowSettingsModal(true);
                                setShowSnapPanel(false);
                                setShowStylePanel(false);
                                setIsReferenceMode(false);
                            }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Advanced Preferences">
                                <Settings size={14} />
                            </button>
                            <button onClick={() => setShowHelpModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="Help">
                                <CircleHelp size={14} />
                            </button>
                            <button onClick={() => setShowAboutModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-white/5" title="About">
                                <Info size={14} />
                            </button>

                            <div className="h-6 w-px bg-slate-200/60 dark:bg-dark-border mx-1" />

                            <button onClick={undo} disabled={!canUndo} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Undo (Ctrl+Z)">
                                <Undo2 size={14} />
                            </button>
                            <button onClick={redo} disabled={!canRedo} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30" title="Redo (Ctrl+Y)">
                                <Redo2 size={14} />
                            </button>
                            <div className="w-px h-3 bg-slate-200 dark:bg-dark-border mx-1" />
                            <button onClick={handleResetProject} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Reset Project">
                                <RotateCcw size={14} />
                            </button>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="lg:hidden ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                            {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
                        </button>
                    </div>

                    {/* Workspace Toggles - Centered */}
                    <div className="flex justify-center flex-none h-[42px] border-x border-slate-200/20 dark:border-dark-border bg-transparent shadow-sm">
                        <button
                            onClick={() => setViewMode('EDITOR')}
                            className={`flex items-center justify-center gap-2 px-6 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === 'EDITOR' ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-b-2 border-orange-500 shadow-[inset_0_-2px_10px_rgba(249,115,22,0.05)]' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/30 dark:hover:bg-white/5 border-b-2 border-transparent'}`}
                        >
                            <TableProperties size={14} /> <span className="hidden lg:inline">Program</span>
                        </button>
                        <div className="w-px h-full bg-slate-200/80 dark:bg-dark-border" />
                        <button
                            onClick={() => setViewMode('CANVAS')}
                            className={`flex items-center justify-center gap-2 px-6 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === 'CANVAS' ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-b-2 border-orange-500 shadow-[inset_0_-2px_10px_rgba(249,115,22,0.05)]' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/30 dark:hover:bg-white/5 border-b-2 border-transparent'}`}
                        >
                            <PencilRuler size={14} /> <span className="hidden lg:inline">Canvas</span>
                        </button>
                        <div className="w-px h-full bg-slate-200/80 dark:bg-dark-border" />
                        <button
                            onClick={() => setViewMode('VOLUMES')}
                            className={`flex items-center justify-center gap-2 px-6 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${viewMode === 'VOLUMES' ? 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-b-2 border-orange-500 shadow-[inset_0_-2px_10px_rgba(249,115,22,0.05)]' : 'text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/30 dark:hover:bg-white/5 border-b-2 border-transparent'}`}
                        >
                            <Box size={14} /> <span className="hidden lg:inline">Volumes</span>
                        </button>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-1.5">
                        <button
                            onClick={() => setShowExportModal(true)} className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 group"
                        >
                            <Save size={14} className="group-hover:-translate-y-0.5" /> Save
                        </button>

                        <div className="flex items-center">
                            <label className="h-8 px-3 text-slate-500 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer group">
                                <Download size={14} className="group-hover:-translate-y-0.5" /> Project
                                <input type="file" accept={viewMode === 'EDITOR' ? ".json,.csv" : ".json"} className="hidden" onChange={handleImportProject} />
                            </label>
                        </div>
                    </div>

                    {/* Mobile Menu Overlay */}
                    {isMobileMenuOpen && (
                        <div className="absolute top-[42px] left-0 right-0 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border p-4 flex flex-col gap-4 z-50 shadow-xl lg:hidden animate-in slide-in-from-top-2">
                            <div className="grid grid-cols-5 gap-2">
                                <button
                                    onClick={() => { setDarkMode(!darkMode); setIsMobileMenuOpen(false); }}
                                    className={`h-10 rounded-xl flex items-center justify-center ${!darkMode ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-300'}`}
                                >
                                    {darkMode ? <Moon size={16} /> : <Sun size={16} />}
                                </button>
                                <button
                                    onClick={() => { setShowApiKeyModal(true); setIsMobileMenuOpen(false); }}
                                    className={`h-10 rounded-xl flex items-center justify-center ${apiKey ? 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300' : 'bg-orange-50 text-orange-600 border border-orange-200'}`}
                                >
                                    <Key size={16} />
                                </button>
                                <button
                                    onClick={() => { setShowBridgesModal(true); setIsMobileMenuOpen(false); }}
                                    className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                                    title="AI Bridges"
                                >
                                    <Plug size={16} />
                                </button>
                                <button
                                    onClick={() => { setShowSettingsModal(true); setIsMobileMenuOpen(false); }}
                                    className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                                >
                                    <Settings size={16} />
                                </button>
                                <button
                                    onClick={() => { setShowHelpModal(true); setIsMobileMenuOpen(false); }}
                                    className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                                >
                                    <CircleHelp size={16} />
                                </button>
                                <button
                                    onClick={() => { setShowAboutModal(true); setIsMobileMenuOpen(false); }}
                                    className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"
                                >
                                    <Info size={16} />
                                </button>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-dark-border" />
                            <div className="grid grid-cols-3 gap-2">
                                <button onClick={() => { undo(); setIsMobileMenuOpen(false); }} disabled={!canUndo} className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 disabled:opacity-50">
                                    <Undo2 size={16} />
                                </button>
                                <button onClick={() => { redo(); setIsMobileMenuOpen(false); }} disabled={!canRedo} className="h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300 disabled:opacity-50">
                                    <Redo2 size={16} />
                                </button>
                                <button onClick={() => { handleResetProject(); setIsMobileMenuOpen(false); }} className="h-10 rounded-xl flex items-center justify-center bg-red-50 text-red-500 dark:bg-red-900/20">
                                    <RotateCcw size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </header>

                <div className="flex-1 flex overflow-hidden relative">
                    <div
                        className={`absolute inset-0 z-50 bg-slate-50 dark:bg-dark-bg flex flex-col view-fade-enter ${viewMode === 'EDITOR' ? 'view-fade-active' : ''}`}
                        style={{
                            visibility: viewMode === 'EDITOR' ? 'visible' : 'hidden',
                            pointerEvents: viewMode === 'EDITOR' ? 'auto' : 'none',
                        }}
                    >
                        <ProgramEditor
                            rooms={rooms}
                            updateRoom={updateRoom}
                            deleteRoom={deleteRoom}
                            addRoom={addRoom}
                            apiKey={apiKey}
                            onSaveApiKey={handleSaveApiKey}
                            setRooms={setRooms}
                            zoneColors={zoneColors}
                            onAddZone={handleAddZone}
                            onInteractionStart={addToHistory}
                            floors={floors}
                            appSettings={appSettings}
                            onUpdateSettings={(updates) => setAppSettings(prev => ({ ...prev, ...updates }))}
                        />
                    </div>

                    <aside
                        ref={inventoryRef}
                        className={`${isInventoryOpen ? 'w-80' : 'w-[42px]'} glass-panel border-r border-slate-200/40 dark:border-dark-border flex flex-col z-30 shadow-[10px_0_30px_rgba(0,0,0,0.02)] transition-all duration-300 ${isInventoryHovered ? 'ring-2 ring-orange-400 ring-inset bg-orange-50/30 dark:bg-orange-900/10' : ''}`}
                        onDragOver={handleInventoryDragOver}
                        onDrop={handleInventoryDrop}
                    >
                        {isInventoryOpen ? (
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
                                        <button onClick={() => setIsInventoryOpen(false)} className="text-slate-300 hover:text-slate-600 dark:text-gray-600 dark:hover:text-gray-400"><ChevronLeft size={18} /></button>
                                    </div>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-transparent">
                                    {unplacedRooms.length > 0 ? unplacedRooms.map(room => (
                                        <div
                                            key={room.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, room)}
                                            className="p-5 rounded-2xl glass-card cursor-grab active:cursor-grabbing group"
                                            onClick={() => {
                                                /* Optional: keep click to place at center if drag fails or as alternative */
                                                /* placeRoom(room); */
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <span className="font-black text-slate-800 dark:text-gray-200 text-sm tracking-tight block group-hover:text-orange-600">{room.name}</span>
                                                    <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Drag to canvas to place</span>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handlePlaceCenter(room); }}
                                                    className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-gray-500 group-hover:bg-orange-500/10 group-hover:text-orange-600 hover:scale-110 active:scale-95"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 bg-slate-100 dark:bg-white/5 rounded-lg text-[10px] font-black text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                                                    {appSettings.unitSystem === 'imperial' ? `${Number((room.area * 10.7639).toFixed(1))} sq ft` : `${room.area} m²`}
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
                                    <button onClick={() => addRoom({})} className="w-full py-4 glass-card glow-effect rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300 flex items-center justify-center gap-3 group">
                                        <Plus size={18} className="group-hover:rotate-90" /> Add Manual Space
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setIsInventoryOpen(true)}>
                                <div className="flex-1 flex items-center justify-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Inventory</span>
                                </div>
                                <ChevronRight size={18} className="text-slate-400 mb-4" />
                            </div>
                        )}
                    </aside>

                    <main
                        ref={mainRef}
                        className={`flex-1 relative overflow-hidden ${canvasTheme.bg} transition-colors duration-500 ${isZoneDragging ? 'no-transition' : ''}`}
                        onMouseDown={viewMode === 'VOLUMES' ? undefined : handlePanStart}
                        onMouseMove={viewMode === 'VOLUMES' ? undefined : handleMouseMove}
                        onMouseUp={viewMode === 'VOLUMES' ? undefined : handleMouseUp}
                        onContextMenu={(e) => e.preventDefault()}
                        onTouchStart={isSketchMode || isReferenceMode || isGuidesMode || isSiteMode || viewMode === 'VOLUMES' ? undefined : handleTouchStart}
                        onTouchMove={isSketchMode || isReferenceMode || isGuidesMode || isSiteMode || viewMode === 'VOLUMES' ? undefined : handleTouchMove}
                        onTouchEnd={isSketchMode || isReferenceMode || isGuidesMode || isSiteMode || viewMode === 'VOLUMES' ? undefined : handleTouchEnd}
                        onDragOver={viewMode === 'VOLUMES' || isSketchMode || isReferenceMode || isGuidesMode || isSiteMode ? undefined : handleDragOver}
                        onDrop={viewMode === 'VOLUMES' || isSketchMode || isReferenceMode || isGuidesMode || isSiteMode ? undefined : handleDrop}
                        style={{
                            touchAction: 'none',
                            cursor: viewMode === 'VOLUMES' ? 'default' : (isSketchMode ? 'crosshair' : (isPanning ? 'grabbing' : 'default'))
                        }}
                    >        {/* Reset selection if clicking background (unless panning) */}
                        {/* The onMouseDown handler above already handles this */}

                        {/* Grid Layer - Separate for export filtering */}
                        {viewMode !== 'VOLUMES' && showGrid && (
                            <div
                                className="absolute inset-0 pointer-events-none grid-layer"
                                style={{
                                    zIndex: 0,
                                    backgroundImage: `
                                            linear-gradient(to right, ${canvasTheme.gridColor} 1px, transparent 1px),
                                            linear-gradient(to bottom, ${canvasTheme.gridColor} 1px, transparent 1px)
                                        `,
                                    backgroundSize: `${currentGridSizeMeters * PIXELS_PER_METER * scale}px ${currentGridSizeMeters * PIXELS_PER_METER * scale}px`,
                                    backgroundPosition: `${offset.x}px ${offset.y}px`
                                }}
                            />
                        )}

                        <div
                            className={`absolute inset-0 view-fade-enter ${viewMode === 'VOLUMES' ? 'view-fade-active' : ''}`}
                            style={{
                                pointerEvents: viewMode === 'VOLUMES' ? 'auto' : 'none',
                                zIndex: viewMode === 'VOLUMES' ? 10 : 0,
                            }}
                        >
                            <ErrorBoundary fallback={
                                <div className="flex items-center justify-center h-full text-red-500 bg-red-50 p-8 rounded-lg flex-col gap-4">
                                    <p className="font-bold text-lg">Failed to load Volumes View</p>
                                    <p className="text-sm text-red-700">Please check the console for more details.</p>
                                    <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded shadow hover:bg-red-700 transition">Reload App</button>
                                </div>
                            }>
                                {hasOpenedVolumes && (
                                <React.Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-slate-400">Loading 3D view…</div>}>
                                <VolumesView
                                    ref={volumesViewRef}
                                    rooms={rooms}
                                    floors={floors}
                                    verticalConnections={verticalConnections}
                                    zoneColors={zoneColors}
                                    pixelsPerMeter={PIXELS_PER_METER}
                                    connectionSourceId={connectionSourceId}
                                    onLinkToggle={toggleLink}
                                    appSettings={appSettings}
                                    diagramStyle={volumesStyle}
                                    selectedRoomIds={selectedRoomIds}
                                    darkMode={darkMode}
                                    gridSize={gridSize}
                                    viewState={volumesViewState}
                                    onViewStateChange={handleViewStateChange}
                                    onRoomSelect={handleVolumeRoomSelect}
                                    cameraVersion={cameraVersion}
                                    active={viewMode === 'VOLUMES'}
                                    floorGap={floorGap}
                                    hiddenFloorIds={hiddenFloorIds}
                                    showLabels={showVolumeLabels}
                                    labelFontSize={volumeLabelFontSize}
                                    showGrid={showGrid}
                                />
                                </React.Suspense>
                                )}
                            </ErrorBoundary>
                        </div>
                        <div
                            className={`absolute inset-0 view-fade-enter ${viewMode === 'CANVAS' ? 'view-fade-active' : ''}`}
                            style={{
                                pointerEvents: 'none',
                                zIndex: viewMode === 'CANVAS' ? 10 : 0,
                            }}
                        >
                            {/* Background Reference Images */}
                            <div
                                className="absolute inset-0 origin-top-left"
                                style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                                    pointerEvents: isReferenceMode ? 'auto' : 'none'
                                }}
                            >
                                <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ pointerEvents: 'none' }}>
                                    <ReferenceLayer
                                        images={referenceImages}
                                        currentFloor={currentFloor}
                                        scale={scale}
                                        offset={offset}
                                        selectedImageId={selectedReferenceImageId}
                                        onSelectImage={setSelectedReferenceImageId}
                                        onUpdateImage={handleUpdateReferenceImage}
                                        isScalingMode={!!referenceScaleState}
                                        scalingState={referenceScaleState}
                                        onScalingPointClick={handleScalingPointClick}
                                        toWorld={toWorld}
                                        isReferenceMode={isReferenceMode}
                                    />
                                </svg>
                            </div>

                            {/* Zone Overlay Layer - Behind everything */}
                            {showZones && (
                                <div
                                    className={`absolute inset-0 origin-top-left pointer-events-none ${isReferenceMode || isSketchMode || isGuidesMode ? '[&_*]:pointer-events-none' : ''}`}
                                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                >
                                    <ZoneOverlay
                                        rooms={rooms}
                                        currentFloor={currentFloor}
                                        scale={scale}
                                        onZoneDrag={handleZoneDrag}
                                        onSelectZone={handleZoneClick}
                                        onDragStart={() => { setIsZoneDragging(true); addToHistory(); }}
                                        onDragEnd={handleZoneDragEnd}
                                        appSettings={appSettings}
                                        zoneColors={zoneColors}
                                        selectedZone={selectedZone}
                                    />
                                </div>
                            )}

                            {/* Yellow Filter for Sketch Mode or Guides Mode */}
                            {(isSketchMode || isGuidesMode) && (
                                <div className="absolute inset-0 bg-yellow-400/5 dark:bg-yellow-500/10 pointer-events-none z-30" />
                            )}

                            {/* Connection Lines Layer - Explicitly behind bubbles */}
                            <div
                                className="absolute inset-0 origin-top-left pointer-events-none"
                                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                            >
                                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                                    <defs>
                                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                                        </marker>
                                    </defs>
                                    
                                    {/* World Origin Axes (0,0) */}
                                    <line
                                        x1="0" y1="-100000" x2="0" y2="100000"
                                        stroke={darkMode ? "#475569" : "#94a3b8"}
                                        strokeWidth={1.5 / scale}
                                        className="opacity-70 pointer-events-none"
                                    />
                                    <line
                                        x1="-100000" y1="0" x2="100000" y2="0"
                                        stroke={darkMode ? "#475569" : "#94a3b8"}
                                        strokeWidth={1.5 / scale}
                                        className="opacity-70 pointer-events-none"
                                    />

                                    {connections.map(conn => {
                                        const fromRoom = rooms.find(r => r.id === conn.fromId);
                                        const toRoom = rooms.find(r => r.id === conn.toId);
                                        if (!fromRoom || !toRoom || !fromRoom.isPlaced || !toRoom.isPlaced) return null;

                                        const isFromVisible = fromRoom.floor === currentFloor ||
                                            (fromRoom.spaceType === 'multistory' && currentFloor >= Math.min(fromRoom.msFromFloor ?? fromRoom.floor, fromRoom.msToFloor ?? fromRoom.floor) && currentFloor <= Math.max(fromRoom.msFromFloor ?? fromRoom.floor, fromRoom.msToFloor ?? fromRoom.floor)) ||
                                            (fromRoom.spaceType === 'verticalConnection' && currentFloor >= Math.min(fromRoom.vcFromFloor ?? fromRoom.floor, fromRoom.vcToFloor ?? fromRoom.floor) && currentFloor <= Math.max(fromRoom.vcFromFloor ?? fromRoom.floor, fromRoom.vcToFloor ?? fromRoom.floor));
                                        
                                        const isToVisible = toRoom.floor === currentFloor ||
                                            (toRoom.spaceType === 'multistory' && currentFloor >= Math.min(toRoom.msFromFloor ?? toRoom.floor, toRoom.msToFloor ?? toRoom.floor) && currentFloor <= Math.max(toRoom.msFromFloor ?? toRoom.floor, toRoom.msToFloor ?? toRoom.floor)) ||
                                            (toRoom.spaceType === 'verticalConnection' && currentFloor >= Math.min(toRoom.vcFromFloor ?? toRoom.floor, toRoom.vcToFloor ?? toRoom.floor) && currentFloor <= Math.max(toRoom.vcFromFloor ?? toRoom.floor, toRoom.vcToFloor ?? toRoom.floor));

                                        if (!isFromVisible || !isToVisible) return null;

                                        const { x: x1, y: y1 } = roomCenter(fromRoom);
                                        const { x: x2, y: y2 } = roomCenter(toRoom);

                                        const isBlueprint = canvasStyle.id === 'blueprint';

                                        return (
                                            <g key={conn.id}>
                                                <line
                                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                                    strokeWidth={2 / scale}
                                                    strokeDasharray={canvasStyle.sketchy ? "5,5" : "none"}
                                                    className={isBlueprint ? "stroke-white/80" : "stroke-slate-300 dark:stroke-slate-700"}
                                                />
                                                <circle cx={x1} cy={y1} r={4 / scale} className={isBlueprint ? "fill-white/80" : "fill-slate-400 dark:fill-slate-600"} />
                                                <circle cx={x2} cy={y2} r={4 / scale} className={isBlueprint ? "fill-white/80" : "fill-slate-400 dark:fill-slate-600"} />
                                            </g>
                                        );
                                    })}

                                    {/* Snapping Guides */}
                                    {snapGuides && (
                                        <>
                                            {snapGuides.x !== undefined && (
                                                <line
                                                    x1={snapGuides.x} y1="-10000" x2={snapGuides.x} y2="10000"
                                                    stroke="#3b82f6" strokeWidth={1 / scale} strokeDasharray="5,5"
                                                    className="opacity-50"
                                                />
                                            )}
                                            {snapGuides.y !== undefined && (
                                                <line
                                                    x1="-10000" y1={snapGuides.y} x2="10000" y2={snapGuides.y}
                                                    stroke="#3b82f6" strokeWidth={1 / scale} strokeDasharray="5,5"
                                                    className="opacity-50"
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* Guides Layer */}
                                    {guides.map(guide => {
                                        const isSelected = selectedGuideId === guide.id;
                                        const posPx = guide.position * PIXELS_PER_METER;
                                        const isVertical = guide.type === 'v';
                                        const angle = guide.angle || 0;
                                        
                                        return (
                                            <g 
                                                key={guide.id}
                                                transform={isVertical ? `rotate(${angle}) translate(${posPx}, 0)` : `rotate(${angle}) translate(0, ${posPx})`}
                                            >
                                                {/* Visual Guide Line */}
                                                <line
                                                    x1={isVertical ? 0 : -100000}
                                                    y1={isVertical ? -100000 : 0}
                                                    x2={isVertical ? 0 : 100000}
                                                    y2={isVertical ? 100000 : 0}
                                                    stroke={isSelected ? "#f97316" : (darkMode ? "#06b6d4" : "#0891b2")}
                                                    strokeWidth={(isSelected ? 1.5 : 0.8) / scale}
                                                    strokeDasharray={`${2.5 / scale},${2.5 / scale}`}
                                                    className="pointer-events-none transition-colors duration-200"
                                                />
                                                
                                                {/* Interactive Wide Click-strip (Only when isGuidesMode is active) */}
                                                {isGuidesMode && (
                                                    <line
                                                        x1={isVertical ? 0 : -100000}
                                                        y1={isVertical ? -100000 : 0}
                                                        x2={isVertical ? 0 : 100000}
                                                        y2={isVertical ? 100000 : 0}
                                                        stroke="transparent"
                                                        strokeWidth={16 / scale}
                                                        className={`cursor-grab active:cursor-grabbing pointer-events-auto ${guide.locked ? 'cursor-not-allowed' : ''}`}
                                                        onPointerDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleStartDragExistingGuide(guide.id, e);
                                                        }}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        }}
                                                    />
                                                )}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Floor Overlay Layer */}
                            {activeOverlayFloorId !== null && (() => {
                                const overlayFloor = floors.find(f => f.id === activeOverlayFloorId);
                                if (overlayFloor) {
                                    const overlayRooms = rooms.filter(r => r.isPlaced && r.floor === overlayFloor.id);
                                    return (
                                        <div
                                            className="absolute inset-0 origin-top-left pointer-events-none"
                                            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                                        >
                                            {overlayRooms.map(room => (
                                                <Bubble
                                                    key={`overlay-${room.id}`}
                                                    room={room}
                                                    zoomScale={scale}
                                                    updateRoom={() => { }}
                                                    onSelect={() => { }}
                                                    isSelected={false}
                                                    diagramStyle={canvasStyle}
                                                    snapEnabled={false}
                                                    snapPixelUnit={1}
                                                    pixelsPerMeter={PIXELS_PER_METER}
                                                    floors={floors}
                                                    appSettings={appSettings}
                                                    zoneColors={zoneColors}
                                                    isOverlay={true}
                                                    darkMode={darkMode}
                                                />
                                            ))}
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* Bubbles Layer */}
                            <div
                                className="absolute inset-0 origin-top-left pointer-events-none"
                                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
                            >
                                {(() => {
                                    const visibleRooms = rooms.filter(r => {
                                        if (!r.isPlaced) return false;
                                        if (r.floor === currentFloor) return true;
                                        if (r.spaceType === 'multistory') {
                                            const from = r.msFromFloor ?? r.floor;
                                            const to = r.msToFloor ?? r.floor;
                                            const minF = Math.min(from, to);
                                            const maxF = Math.max(from, to);
                                            return currentFloor >= minF && currentFloor <= maxF;
                                        }
                                        if (r.spaceType === 'verticalConnection') {
                                            const from = r.vcFromFloor ?? r.floor;
                                            const to = r.vcToFloor ?? r.floor;
                                            const minF = Math.min(from, to);
                                            const maxF = Math.max(from, to);
                                            return currentFloor >= minF && currentFloor <= maxF;
                                        }
                                        return false;
                                    });
                                    const overlayRooms = activeOverlayFloorId !== null
                                        ? rooms.filter(r => r.isPlaced && r.floor === activeOverlayFloorId)
                                        : [];

                                    return visibleRooms.map(room => (
                                        <Bubble
                                            key={room.id}
                                            room={room}
                                            zoomScale={scale}
                                            updateRoom={updateRoom}
                                            onShapeEdited={recenterRoomShape}
                                            isGrayedOut={room.spaceType === 'multistory' && room.floor !== currentFloor}
                                            onMove={(x, y) => handleMoveRoom(room.id, x, y)}
                                            isSelected={selectedRoomIds.has(room.id)}
                                            isLinkingSource={connectionSourceId === room.id}
                                            onLinkToggle={toggleLink}
                                            getSnappedPosition={getSnappedPosition}
                                            onSelect={(id, multi) => {
                                                if (connectionSourceId) {
                                                    toggleLink(id);
                                                    return;
                                                }
                                                // Auto-lock text of other rooms when selecting a new one
                                                if (!multi) {
                                                    setRooms(prev => prev.map(r => (r.id !== id && r.isTextUnlocked) ? { ...r, isTextUnlocked: false } : r));
                                                }
                                                setSelectedRoomIds(prev => {
                                                    const next = new Set(multi ? prev : []);
                                                    if (next.has(id)) next.delete(id);
                                                    else next.add(id);
                                                    return next;
                                                });
                                                if (!multi) setSelectedZone(null); // Clear zone selection on room click unless multi?
                                            }}
                                            diagramStyle={canvasStyle}
                                            snapEnabled={snapEnabled}
                                            snapPixelUnit={appSettings.snapToGrid ? currentGridSizeMeters * PIXELS_PER_METER : 1}
                                            pixelsPerMeter={PIXELS_PER_METER}
                                            floors={floors}
                                            appSettings={appSettings}
                                            zoneColors={zoneColors}
                                            onDragEnd={handleBubbleDragEnd}
                                            onDragStart={() => { setIsBubbleDragging(true); addToHistory(); }}
                                            isAnyDragging={isBubbleDragging}
                                            otherRooms={selectedRoomIds.has(room.id) ? [...visibleRooms.filter(r => r.id !== room.id), ...overlayRooms] : undefined}
                                            isSketchMode={isSketchMode || isReferenceMode || isGuidesMode || isSiteMode}
                                            darkMode={darkMode}
                                            guides={guides}
                                        />
                                    ));
                                })()}
                            </div>

                            {/* Site Layer - property line, setbacks, no-build zones and rule breaks, above the spaces */}
                            {(isSiteMode || (siteProperties.showSite !== false && !!siteProperties.boundary)) && (
                                <div
                                    className="absolute inset-0 origin-top-left pointer-events-none"
                                    style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, zIndex: isSiteMode ? 95 : undefined }}
                                >
                                    <SiteLayer
                                        site={siteProperties}
                                        rooms={rooms}
                                        currentFloor={currentFloor}
                                        violations={siteReport?.violations || []}
                                        scale={scale}
                                        pixelsPerMeter={PIXELS_PER_METER}
                                        isSiteMode={isSiteMode}
                                        tool={siteTool}
                                        selection={siteSelection}
                                        guides={guides}
                                        snap={{
                                            enabled: snapEnabled,
                                            grid: appSettings.snapToGrid ? currentGridSizeMeters : 0,
                                            objects: appSettings.snapToObjects !== false,
                                            guides: appSettings.snapToGuides !== false,
                                            tolerancePx: Math.max(6, appSettings.snapTolerance || 10),
                                        }}
                                        darkMode={darkMode}
                                        toWorld={toWorld}
                                        onSelect={setSiteSelection}
                                        onToolChange={setSiteTool}
                                        onInteractionStart={addToHistory}
                                        onChange={updateSite}
                                        onMoveSite={moveSite}
                                    />
                                </div>
                            )}

                            {/* Annotation Layer - Above all spaces and zones */}
                            <div
                                className={`absolute inset-0 ${isSketchMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
                                style={{ zIndex: 100 }}
                            >
                                <AnnotationLayer
                                    annotations={annotations}
                                    isSketchMode={isSketchMode}
                                    activeType={activeSketchType}
                                    properties={selectedAnnotation ? selectedAnnotation.style : sketchProperties}
                                    currentFloor={currentFloor}
                                    scale={scale}
                                    offset={offset}
                                    selectedAnnotationId={selectedAnnotationId}
                                    onSelectAnnotation={setSelectedAnnotationId}
                                    onAddAnnotation={(ann) => {
                                        addToHistory();
                                        setAnnotations(prev => [...prev, ann]);
                                    }}
                                    onUpdateAnnotation={updateAnnotation}
                                    onDeleteAnnotation={deleteAnnotation}
                                    onInteractionStart={addToHistory}
                                />
                            </div>


                            <div
                                className="absolute top-6 right-6 flex flex-col items-end gap-2 z-[200] export-exclude pointer-events-auto"
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <div className="h-12 glass-panel px-4 rounded-full shadow-xl flex items-center gap-4 animate-in slide-in-from-right-4 transition-all duration-300">
                                    <div className="hidden lg:flex items-center gap-2 text-slate-400">
                                        <div className="h-1 w-12 bg-slate-300/50 dark:bg-white/10 rounded-full relative">
                                            <div className="absolute -top-3 left-0 text-[8px] font-bold">0m</div>
                                            <div className="absolute -top-3 right-0 text-[8px] font-bold">{(16 / scale / PIXELS_PER_METER * 4).toFixed(1)}m</div>
                                        </div>
                                    </div>
                                    <div className="hidden lg:block h-4 w-px bg-slate-200 dark:bg-dark-border" />
                                    <div className="flex items-center gap-2">
                                        <span className="hidden lg:inline text-xs font-sans font-black text-slate-700 dark:text-gray-300">{(scale * 100).toFixed(0)}%</span>
                                        <button onClick={handleZoomToFit} className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center justify-center hover:bg-orange-500 hover:text-white transition-all shadow-sm" title="Zoom to Fit">
                                            <Maximize size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Scale and Compass Group on Canvas */}
                            <div className="absolute bottom-12 right-6 flex items-center gap-4 pointer-events-none z-[150]">
                                {/* Clickable Compass */}
                                <button
                                    onClick={() => { siteModalHistoryRef.current = false; setShowSitePropertiesModal(true); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="w-12 h-12 rounded-full glass-card hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-center pointer-events-auto cursor-pointer shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 group relative border border-slate-200/50 dark:border-white/10"
                                    title="Adjust Site Location & True North"
                                >
                                    <div
                                        className="w-10 h-10 transition-transform duration-100 ease-out"
                                        style={{ transform: `rotate(${siteProperties.northAngle || 0}deg)` }}
                                    >
                                        <svg width="100%" height="100%" viewBox="0 0 100 100" className="stroke-slate-700 dark:stroke-slate-300 fill-none">
                                            <g transform="matrix(1.299396,0,0,1.299396,-26.793032,-6.527396)">
                                                <circle cx="59.099" cy="43.503" r="34.463" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1.2" />
                                            </g>
                                            <path d="M5.219,50L94.781,50" strokeWidth="0.6" className="stroke-slate-300 dark:stroke-slate-600" />
                                            <path d="M50,94.781L50,5.219" strokeWidth="0.6" className="stroke-slate-300 dark:stroke-slate-600" />
                                            <path d="M50,5.219L50,50" strokeWidth="6" className="stroke-orange-600 dark:stroke-orange-500" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-black text-orange-600 dark:text-orange-500 bg-white/85 dark:bg-slate-900/85 px-1.5 py-0.5 rounded shadow-sm select-none opacity-0 group-hover:opacity-100 transition-opacity">N</span>
                                </button>

                                {/* Dynamic Scale Bar */}
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-400 text-shadow-sm select-none">
                                            {appSettings.unitSystem === 'imperial' ? '30 feet' : '10 meters'}
                                        </span>
                                        <div className="h-2 border-x border-b border-slate-400/80 bg-white/20 backdrop-blur-sm"
                                            style={{ width: (appSettings.unitSystem === 'imperial' ? (30 * 0.3048) : 10) * PIXELS_PER_METER * scale }} />
                                    </div>
                                </div>
                            </div>

                            {/* Floor Tabs Bar */}
                            <div
                                className="absolute bottom-0 left-0 right-0 h-8 glass-panel !border-x-0 !border-b-0 flex items-start px-4 gap-1 z-40 export-exclude pointer-events-auto"
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                {floors.map(f => (
                                    <div
                                        key={f.id}
                                        onClick={() => setCurrentFloor(f.id)}
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
                                                onChange={(e) => handleRenameFloor(f.id, e.target.value)}
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
                                                        onClick={(e) => floors.length > 1 && handleDeleteFloor(e, f.id)}
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
                                    onClick={handleAddFloor}
                                    className="h-[85%] w-8 flex items-center justify-center rounded-b-lg bg-slate-300/50 dark:bg-white/5 hover:bg-orange-600 hover:text-white text-slate-500"
                                    title="Add Floor"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>

                        {selectionBox && (
                            <div
                                className="pointer-events-none absolute"
                                style={{
                                    left: Math.min(selectionBox.start.x, selectionBox.end.x),
                                    top: Math.min(selectionBox.start.y, selectionBox.end.y),
                                    width: Math.abs(selectionBox.start.x - selectionBox.end.x),
                                    height: Math.abs(selectionBox.start.y - selectionBox.end.y),
                                    zIndex: 9999,
                                    backgroundColor: selectionBox.start.x > selectionBox.end.x
                                        ? 'rgba(34, 197, 94, 0.15)' // Crossing: Green
                                        : 'rgba(59, 130, 246, 0.15)', // Window: Blue
                                    border: selectionBox.start.x > selectionBox.end.x
                                        ? '1.5px dashed rgb(34, 197, 94)' // Crossing: Green dashed
                                        : '1.5px solid rgb(59, 130, 246)', // Window: Blue solid
                                    borderRadius: '2px',
                                    boxShadow: '0 0 8px rgba(0,0,0,0.1)'
                                }}
                            />
                        )}

                        {/* Shared overlays & panels */}
                        {(viewMode === 'CANVAS' || viewMode === 'VOLUMES') && (
                            <>
                                {/* Tools Bar (Top Left) */}
                                <div
                                    className="absolute top-6 left-6 flex flex-col gap-2 z-[200] export-exclude pointer-events-auto"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                >
                                    <div className="glass-panel p-2 rounded-3xl shadow-xl flex flex-col items-center gap-1.5 border border-white/20 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                                        {/* Mobile Expand Button */}
                                        <button
                                            onClick={() => setIsToolbarExpanded(!isToolbarExpanded)}
                                            className="lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5"
                                        >
                                            {isToolbarExpanded ? <ChevronLeft size={16} /> : <MoreHorizontal size={16} />}
                                        </button>

                                        <div className={`flex flex-col items-center gap-2 ${!isToolbarExpanded ? 'hidden lg:flex' : 'flex'}`}>
                                            {/* Grid Controller (Vertical Capsule) - Always visible in both 2D and 3D */}
                                            <div className="flex flex-col items-center bg-slate-100/50 dark:bg-white/5 rounded-2xl py-1.5 px-1 border border-slate-200/50 dark:border-dark-border gap-1 w-8">
                                                <span className="text-[10px] font-black font-sans text-center h-4 flex items-center justify-center leading-none">{gridSize}{appSettings.unitSystem === 'imperial' ? 'ft' : 'm'}</span>
                                                <div className="flex items-center justify-center gap-0.5">
                                                    <button onClick={() => setGridSizeIndex(prev => Math.min(prev + 1, GRID_SIZES.length - 1))} className="text-slate-400 hover:text-orange-600 transition-colors" title="Increase Grid"><ChevronUp size={12} /></button>
                                                    <button onClick={() => setGridSizeIndex(prev => Math.max(prev - 1, 0))} className="text-slate-400 hover:text-orange-600 transition-colors" title="Decrease Grid"><ChevronDown size={12} /></button>
                                                </div>
                                                <div className="w-6 h-px bg-slate-200/60 dark:bg-dark-border my-0.5" />
                                                <button
                                                    onClick={() => setShowGrid(!showGrid)}
                                                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${!showGrid ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-white dark:bg-dark-surface text-orange-600 dark:text-orange-400 shadow-sm'}`}
                                                    title="Toggle Grid"
                                                >
                                                    <Grid size={11} />
                                                </button>
                                            </div>

                                            {viewMode === 'CANVAS' && (
                                                <>

                                                    <button
                                                        onClick={handleAutoArrange}
                                                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600"
                                                        title="Auto Arrange Layout"
                                                    >
                                                        <LayoutTemplate size={16} />
                                                    </button>

                                                    <button
                                                        onClick={() => setShowAiLayoutModal(true)}
                                                        disabled={isAiLayoutLoading}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isAiLayoutLoading ? 'bg-orange-100 text-orange-400 animate-pulse' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-purple-600'}`}
                                                        title="AI Spatial Layout"
                                                    >
                                                        <Sparkles size={16} className={isAiLayoutLoading ? "animate-spin" : ""} />
                                                    </button>

                                                    <div className="relative" ref={overlaySelectorRef}>
                                                        <button
                                                            onClick={() => setIsOverlaySelectorOpen(prev => !prev)}
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${activeOverlayFloorId !== null ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                            title="Select Overlay Floor"
                                                        >
                                                            <Layers size={16} />
                                                        </button>
                                                        {isOverlaySelectorOpen && (
                                                            <div className="absolute left-full top-0 ml-2.5 w-48 glass-panel p-2.5 rounded-2xl shadow-xl flex flex-col gap-1 origin-left z-50 border border-white/20 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
                                                                <div className="px-2 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Overlay Floor</div>
                                                                {floors.filter(f => f.id !== currentFloor).map(floor => (
                                                                    <button
                                                                        key={floor.id}
                                                                        onClick={() => {
                                                                            setFloorOverlays(prev => ({
                                                                                ...prev,
                                                                                [currentFloor]: prev[currentFloor] === floor.id ? null : floor.id
                                                                            }));
                                                                            setIsOverlaySelectorOpen(false);
                                                                        }}
                                                                        className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${activeOverlayFloorId === floor.id ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600' : 'text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                                    >
                                                                        {floor.label}
                                                                    </button>
                                                                ))}
                                                                {floors.length > 1 && <div className="h-px bg-slate-200 dark:bg-dark-border my-1" />}
                                                                <button
                                                                    onClick={() => {
                                                                        setFloorOverlays(prev => ({
                                                                            ...prev,
                                                                            [currentFloor]: null
                                                                        }));
                                                                        setIsOverlaySelectorOpen(false);
                                                                    }}
                                                                    className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-bold ${activeOverlayFloorId === null ? 'bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-white' : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                                >
                                                                    None
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            const newValue = !showSnapPanel;
                                                            setShowSnapPanel(newValue);
                                                            if (newValue) {
                                                                setShowStylePanel(false);
                                                                setIsReferenceMode(false);
                                                                setIsSketchMode(false);
                                                            }
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 relative ${
                                                            showSnapPanel
                                                                ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30 scale-110'
                                                                : snapEnabled
                                                                    ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'
                                                                    : 'text-slate-400 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-500 bg-white/5 border border-slate-200/50 dark:border-white/5 hover:border-orange-500/20'
                                                        }`}
                                                        title="Snapping Settings & Grid"
                                                    >
                                                        <Magnet size={16} />
                                                    </button>

                                                    <button
                                                        onClick={() => setIsMagnetMode(!isMagnetMode)}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!isMagnetMode ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-500' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'}`}
                                                        title="Physics / Magnetic Zones"
                                                    >
                                                        <Atom size={16} className={isMagnetMode ? "animate-spin" : ""} />
                                                    </button>

                                                    <button
                                                        onClick={() => setShowZones(!showZones)}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${!showZones ? 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-500' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 shadow-inner'}`}
                                                        title="Toggle Zone Overlays"
                                                    >
                                                        <ZonesIcon className="w-4 h-4 transition-all duration-300" />
                                                    </button>
                                                     <button
                                                        onClick={() => {
                                                            const newValue = !isReferenceMode;
                                                            setIsReferenceMode(newValue);
                                                            if (newValue) {
                                                                closeSiteMode();
                                                                setIsSketchMode(false);
                                                                setShowStylePanel(false);
                                                                setShowSnapPanel(false);
                                                            }
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isReferenceMode ? 'bg-orange-500 text-white shadow-lg scale-105 animate-pulse' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600'}`}
                                                        title="Edit Reference Images"
                                                    >
                                                        <ImageIcon size={16} />
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            if (isSiteMode) { closeSiteMode(); return; }
                                                            setIsSiteMode(true);
                                                            setIsSketchMode(false);
                                                            setIsReferenceMode(false);
                                                            setIsGuidesMode(false);
                                                            setShowStylePanel(false);
                                                            setShowSnapPanel(false);
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isSiteMode ? 'bg-orange-500 text-white shadow-lg scale-105 animate-pulse' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600'}`}
                                                        title="Site: boundary, setbacks & Google Earth import"
                                                    >
                                                        <LandPlot size={16} />
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            const newValue = !isGuidesMode;
                                                            setIsGuidesMode(newValue);
                                                            if (newValue) {
                                                                closeSiteMode();
                                                                setIsSketchMode(false);
                                                                setIsReferenceMode(false);
                                                                setShowStylePanel(false);
                                                                setShowSnapPanel(false);
                                                            }
                                                        }}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isGuidesMode ? 'bg-orange-500 text-white shadow-lg scale-105 animate-pulse' : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-600'}`}
                                                        title="Drafting Guides & Rulers Mode"
                                                    >
                                                        <Ruler size={16} />
                                                    </button>

                                                    <SketchToolbar
                                                        isActive={isSketchMode}
                                                        onToggle={() => {
                                                            const newValue = !isSketchMode;
                                                            setIsSketchMode(newValue);
                                                            if (newValue) {
                                                                closeSiteMode();
                                                                setIsReferenceMode(false);
                                                                setShowStylePanel(false);
                                                                setShowSnapPanel(false);
                                                            }
                                                        }}
                                                    />
                                                </>
                                            )}

                                            {/* Style Selector Toggle (Visible in both 2D and 3D) */}
                                            <button
                                                onClick={() => {
                                                    const newValue = !showStylePanel;
                                                    setShowStylePanel(newValue);
                                                    if (newValue) {
                                                        setIsReferenceMode(false);
                                                        setIsSketchMode(false);
                                                        setShowSnapPanel(false);
                                                    }
                                                }}
                                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 relative ${showStylePanel
                                                        ? 'bg-gradient-to-tr from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30 scale-110'
                                                        : 'text-slate-400 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-orange-500 bg-white/5 border border-slate-200/50 dark:border-white/5 hover:border-orange-500/20'
                                                    }`}
                                                title="Visual Styles & Appearance"
                                            >
                                                <Palette size={16} />
                                            </button>

                                            {/* View Orientation Toggle (Only in 3D VOLUMES workspace) */}
                                            {viewMode === 'VOLUMES' && (
                                                <div className="flex flex-col items-center bg-slate-100/50 dark:bg-white/5 rounded-2xl py-1.5 px-1 border border-slate-200/50 dark:border-dark-border gap-1 w-8">
                                                    <button
                                                        onClick={() => handleViewStateChange({ viewType: 'perspective' }, true)}
                                                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black tracking-tighter transition-all ${volumesViewState.viewType === 'perspective'
                                                                ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm font-black'
                                                                : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'
                                                            }`}
                                                        title="Perspective View"
                                                    >
                                                        3D
                                                    </button>
                                                    <button
                                                        onClick={() => handleViewStateChange({ viewType: 'isometric' }, true)}
                                                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black tracking-tighter transition-all ${volumesViewState.viewType === 'isometric'
                                                                ? 'bg-white dark:bg-dark-surface text-orange-600 shadow-sm font-black'
                                                                : 'text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300'
                                                            }`}
                                                        title="Isometric View"
                                                    >
                                                        ISO
                                                    </button>
                                                </div>
                                            )}

                                            {viewMode === 'CANVAS' && (
                                                <button
                                                    onClick={handleClearCanvas}
                                                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 text-slate-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                                                    title="Clear Canvas"
                                                >
                                                    <BrushCleaningIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Style Selector panel floating alongside vertical toolbar */}
                                {showStylePanel && (
                                    <div
                                        className="absolute top-6 left-[78px] z-[190] export-exclude pointer-events-auto"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <StylePanel
                                            currentStyle={viewMode === 'VOLUMES' ? volumesStyle : canvasStyle}
                                            onStyleSelect={(style) => {
                                                if (viewMode === 'VOLUMES') {
                                                    setVolumesStyle(style);
                                                } else {
                                                    setCanvasStyle(style);
                                                }
                                            }}
                                            onClose={() => setShowStylePanel(false)}
                                            settings={appSettings}
                                            onUpdateSettings={setAppSettings}
                                            viewMode={viewMode}
                                        />
                                    </div>
                                )}

                                {/* Snapping panel floating alongside vertical toolbar */}
                                {showSnapPanel && (
                                    <div
                                        className="absolute top-6 left-[78px] z-[190] export-exclude pointer-events-auto"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <SnapPanel
                                            settings={appSettings}
                                            onUpdateSettings={setAppSettings}
                                            onClose={() => setShowSnapPanel(false)}
                                            snapEnabled={snapEnabled}
                                            onToggleSnapEnabled={setSnapEnabled}
                                            gridSizeIndex={gridSizeIndex}
                                            onGridSizeIndexChange={setGridSizeIndex}
                                            GRID_SIZES={GRID_SIZES}
                                        />
                                    </div>
                                )}

                                {/* Site Panel */}
                                {viewMode === 'CANVAS' && isSiteMode && (
                                    <div
                                        className="absolute top-6 left-[78px] z-[190] export-exclude pointer-events-auto"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <SitePanel
                                            site={siteProperties}
                                            report={siteReport}
                                            tool={siteTool}
                                            selection={siteSelection}
                                            onToolChange={setSiteTool}
                                            onSelect={setSiteSelection}
                                            onInteractionStart={addToHistory}
                                            onChange={updateSite}
                                            onImportFile={handleImportSiteFile}
                                            onApplyShape={handleApplySiteShape}
                                            onAddImagery={handleAddSiteImagery}
                                            onRotate={rotateSite}
                                            onSelectRoom={(id) => {
                                                closeSiteMode();
                                                const room = rooms.find(r => r.id === id);
                                                if (room && room.floor !== currentFloor) setCurrentFloor(room.floor);
                                                setSelectedRoomIds(new Set([id]));
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Reference Panel - Moved to left-[78px] top-6 */}
                                {viewMode === 'CANVAS' && isReferenceMode && (
                                    <div
                                        className="absolute top-6 left-[78px] z-[190] export-exclude pointer-events-auto"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <ReferenceToolbar
                                            isReferenceMode={isReferenceMode}
                                            selectedImage={referenceImages.find(i => i.id === selectedReferenceImageId) || null}
                                            onUpdateImage={handleUpdateReferenceImage}
                                            onDeleteImage={handleDeleteReferenceImage}
                                            onImportImage={handleImportReference}
                                            onStartScaling={(id) => setReferenceScaleState({ imageId: id, points: [], step: 'point1' })}
                                            isScalingMode={!!referenceScaleState}
                                            onCancelScaling={() => setReferenceScaleState(null)}
                                        />
                                    </div>
                                )}

                                {/* Sketch Panel - Moved to left-[78px] top-6 */}
                                {viewMode === 'CANVAS' && isSketchMode && (
                                    <div
                                        className="absolute top-6 left-[78px] z-[190] export-exclude pointer-events-auto"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                    >
                                        <SketchPanel
                                            isActive={isSketchMode}
                                            activeType={activeSketchType}
                                            onTypeChange={setActiveSketchType}
                                            properties={selectedAnnotation ? selectedAnnotation.style : sketchProperties}
                                            onPropertyChange={handleAnnotationPropertyChange}
                                            selectedAnnotation={selectedAnnotation}
                                            onZIndex={handleZIndex}
                                            onDelete={() => selectedAnnotationId && deleteAnnotation(selectedAnnotationId)}
                                        />
                                    </div>
                                )}

                                {/* Photoshop-style synchronized rulers */}
                                {viewMode === 'CANVAS' && isGuidesMode && (
                                    <Rulers
                                        scale={scale}
                                        offset={offset}
                                        unitSystem={appSettings.unitSystem}
                                        gridSize={gridSize}
                                        pixelsPerMeter={PIXELS_PER_METER}
                                        width={mainRef.current?.getBoundingClientRect().width || window.innerWidth}
                                        height={mainRef.current?.getBoundingClientRect().height || window.innerHeight}
                                        onDragNewGuide={handleDragNewGuide}
                                    />
                                )}

                                {/* Floating glassmorphic guide actions panel */}
                                {(() => {
                                    const selectedGuide = guides.find(g => g.id === selectedGuideId);
                                    if (!selectedGuide || !isGuidesMode || viewMode !== 'CANVAS') return null;
                                    
                                    const isVertical = selectedGuide.type === 'v';
                                    const posPx = selectedGuide.position * PIXELS_PER_METER;
                                    const angleRad = ((selectedGuide.angle || 0) * Math.PI) / 180;
                                     
                                    const viewWidth = mainRef.current?.getBoundingClientRect().width || window.innerWidth;
                                    const viewHeight = mainRef.current?.getBoundingClientRect().height || window.innerHeight;
                                     
                                    // If mostly vertical, keep panel near top (y_screen = 100); if mostly horizontal, keep panel near left (x_screen = 100)
                                    const isMostlyVertical = isVertical 
                                        ? Math.abs(Math.cos(angleRad)) >= 0.707 
                                        : Math.abs(Math.sin(angleRad)) < 0.707;
                                         
                                    const targetScreenX = isMostlyVertical ? viewWidth / 2 : 120;
                                    const targetScreenY = isMostlyVertical ? 100 : viewHeight / 2;
                                     
                                    const cx = (targetScreenX - offset.x) / scale;
                                    const cy = (targetScreenY - offset.y) / scale;
                                     
                                    let ax = 0, ay = 0, ux = 0, uy = 0;
                                    if (isVertical) {
                                        ax = posPx * Math.cos(angleRad);
                                        ay = posPx * Math.sin(angleRad);
                                        ux = -Math.sin(angleRad);
                                        uy = Math.cos(angleRad);
                                    } else {
                                        ax = -posPx * Math.sin(angleRad);
                                        ay = posPx * Math.cos(angleRad);
                                        ux = Math.cos(angleRad);
                                        uy = Math.sin(angleRad);
                                    }
                                     
                                    const vx = cx - ax;
                                    const vy = cy - ay;
                                    const t = vx * ux + vy * uy;
                                    const closestWorldX = ax + t * ux;
                                    const closestWorldY = ay + t * uy;
                                     
                                    const rawScreenX = closestWorldX * scale + offset.x;
                                    const rawScreenY = closestWorldY * scale + offset.y;
                                     
                                    const screenX = Math.max(80, Math.min(viewWidth - 180, rawScreenX));
                                    const screenY = Math.max(80, Math.min(viewHeight - 80, rawScreenY));
                                        
                                    return (
                                        <div 
                                            className="absolute z-[150] flex items-center gap-1.5 p-1.5 bg-slate-900/90 dark:bg-slate-950/95 backdrop-blur-md border border-white/10 dark:border-white/5 rounded-full shadow-2xl text-white pointer-events-auto transition-all duration-300"
                                            style={{
                                                left: `${screenX}px`,
                                                top: `${screenY}px`,
                                                transform: isVertical ? 'translate(-50%, 0)' : 'translate(0, -50%)'
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <div className="px-2.5 py-0.5 text-[10px] font-black tracking-wider text-slate-400 border-r border-white/10 select-none uppercase font-sans">
                                                Guide {isVertical ? 'V' : 'H'}
                                            </div>

                                            <button
                                                onClick={() => toggleLockGuide(selectedGuide.id)}
                                                className={`p-1.5 rounded-full transition-colors ${selectedGuide.locked ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-white/10'}`}
                                                title={selectedGuide.locked ? "Unlock Guide" : "Lock Guide"}
                                            >
                                                {selectedGuide.locked ? <Lock size={13} /> : <Unlock size={13} />}
                                            </button>

                                            <button
                                                onClick={() => rotateGuide(selectedGuide.id, 90)}
                                                className="p-1.5 rounded-full text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1"
                                                title="Rotate 90°"
                                            >
                                                <RotateCcw size={13} />
                                                <span className="text-[9px] font-bold">90°</span>
                                            </button>

                                            <button
                                                onClick={() => deleteGuide(selectedGuide.id)}
                                                className="p-1.5 rounded-full text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                                                title="Delete Guide"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </main>

                    <aside className={`${isRightSidebarOpen ? 'w-80' : 'w-10'} glass-panel border-l border-slate-200/40 dark:border-dark-border flex flex-col z-20 shadow-2xl transition-all duration-300`}>
                        {isRightSidebarOpen ? (
                            <>
                                <div className="p-6 border-b border-slate-100/30 dark:border-dark-border/30 flex justify-between items-center bg-transparent h-20">
                                    <h2 className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest truncate max-w-[180px]">
                                        {isMultiSelection ? 'Multi-Selection' : selectedRoom ? 'Space Detail' : selectedZone ? 'Zone Detail' : 'Properties'}
                                    </h2>
                                    <button onClick={() => setIsRightSidebarOpen(false)} className="text-slate-300 dark:text-gray-600 hover:text-slate-600 dark:hover:text-gray-400"><ChevronRight size={18} /></button>
                                </div>
                                <div className="flex-1 p-6 overflow-y-auto">
                                    {selectedRoom || isMultiSelection ? (
                                        <SpacePropertiesPanel
                                            rooms={rooms}
                                            floors={floors}
                                            connections={connections}
                                            onRemoveConnection={removeConnection}
                                            zoneColors={zoneColors}
                                            appSettings={appSettings}
                                            selectedRoom={selectedRoom}
                                            selectedRoomIds={selectedRoomIds}
                                            setSelectedRoomIds={setSelectedRoomIds}
                                            selectedRoomsList={selectedRoomsList}
                                            isMultiSelection={isMultiSelection}
                                            multiSelectionStats={multiSelectionStats}
                                            connectionSourceId={connectionSourceId}
                                            updateRoom={updateRoomFromPanel}
                                            deleteRoom={deleteRoom}
                                            toggleLink={toggleLink}
                                            handleAddZone={handleAddZone}
                                            handleConvertShape={handleConvertShape}
                                            handleMoveSelectionFloors={handleMoveSelectionFloors}
                                        />
                                    ) : selectedZone ? (
                                        <ZonePropertiesPanel
                                            selectedZone={selectedZone}
                                            selectedZoneRooms={selectedZoneRooms}
                                            zoneArea={zoneArea}
                                            zoneColors={zoneColors}
                                            setZoneColors={setZoneColors}
                                            colorPalette={COLOR_PALETTE}
                                            appSettings={appSettings}
                                            addToHistory={addToHistory}
                                            renameZone={renameZone}
                                            setSelectedRoomIds={setSelectedRoomIds}
                                        />
                                    ) : (
                                        <div className="space-y-8 animate-in fade-in duration-500">
                                            {/* Floor Settings - Shown when nothing is selected */}
                                            {viewMode === 'VOLUMES' ? (
                                                <div className="space-y-6">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                                                            <Box size={14} className="text-orange-600" />
                                                        </div>
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-gray-300">Volumes Settings</h3>
                                                    </div>

                                                    <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1.5">
                                                                <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Floor Gap</label>
                                                                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded">{(floorGap / 2).toFixed(1)}m</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min="0"
                                                                max="40"
                                                                step="0.5"
                                                                value={floorGap}
                                                                onChange={(e) => setFloorGap(parseFloat(e.target.value))}
                                                                className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-dark-border space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest">Show Labels</label>
                                                            <button
                                                                onClick={() => setShowVolumeLabels(!showVolumeLabels)}
                                                                className={`w-8 h-5 rounded-full relative transition-colors ${showVolumeLabels ? 'bg-orange-500' : 'bg-slate-300 dark:bg-white/10'}`}
                                                            >
                                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${showVolumeLabels ? 'left-4' : 'left-1'}`} />
                                                            </button>
                                                        </div>

                                                        {showVolumeLabels && (
                                                            <div>
                                                                <div className="flex justify-between items-center mb-1.5">
                                                                    <label className="text-[9px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest block">Label Size</label>
                                                                    <span className="text-[10px] font-bold text-slate-600 dark:text-gray-300">{volumeLabelFontSize}px</span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="4"
                                                                    max="24"
                                                                    step="1"
                                                                    value={volumeLabelFontSize}
                                                                    onChange={(e) => setVolumeLabelFontSize(parseFloat(e.target.value))}
                                                                    className="w-full accent-orange-500 h-1 bg-slate-200 dark:bg-dark-border rounded-lg appearance-none cursor-pointer"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-3">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 px-1">Floors Configuration</h3>
                                                        {floors.map(floor => {
                                                            const floorRooms = rooms.filter(r => r.floor === floor.id && r.isPlaced);
                                                            const floorArea = floorRooms.reduce((acc, r) => acc + r.area, 0);
                                                            const isHidden = hiddenFloorIds.has(floor.id);

                                                            return (
                                                                <div key={floor.id} className="p-4 bg-white dark:bg-dark-bg border border-slate-100 dark:border-dark-border rounded-xl space-y-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <button
                                                                                onClick={() => toggleFloorVisibility(floor.id)}
                                                                                className={`p-1 rounded-md transition-colors ${isHidden ? 'text-slate-400 hover:text-slate-600' : 'text-orange-600 hover:text-orange-700 bg-orange-50 dark:bg-orange-900/20'}`}
                                                                                title={isHidden ? "Show Floor" : "Hide Floor"}
                                                                            >
                                                                                {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                            </button>
                                                                            <span className={`text-xs font-bold ${isHidden ? 'text-slate-400' : 'text-slate-700 dark:text-gray-200'}`}>{floor.label}</span>
                                                                        </div>
                                                                        <span className="text-[10px] font-mono text-slate-400">{floorRooms.length} Spaces</span>
                                                                    </div>

                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex-1">
                                                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Height (m)</label>
                                                                            <input
                                                                                type="number"
                                                                                step="0.1"
                                                                                className="w-full bg-slate-50 dark:bg-white/5 border-none rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-gray-200 focus:ring-1 focus:ring-orange-500 outline-none"
                                                                                value={floor.height}
                                                                                onChange={(e) => handleUpdateFloor(floor.id, { height: parseFloat(e.target.value) || 0 })}
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Area</label>
                                                                            <div className="px-2 py-1 text-xs font-bold text-slate-500 dark:text-gray-400">
                                                                                {appSettings.unitSystem === 'imperial' ? `${Math.round(floorArea * 10.7639)} sq ft` : `${Math.round(floorArea)} m²`}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
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
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center py-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setIsRightSidebarOpen(true)}>
                                <div className="flex-1 flex items-center justify-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-gray-500 whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Properties</span>
                                </div>
                                <ChevronLeft size={18} className="text-slate-400 mb-4" />
                            </div>
                        )}
                    </aside>
                </div>

                {
                    showApiKeyModal && (
                        <ApiKeyModal
                            onSave={handleSaveApiKey}
                            onClose={() => setShowApiKeyModal(false)}
                            currentKey={apiKey}
                        />
                    )
                }

                {
                    showExportModal && (
                        <ExportModal
                            projectName={projectName}
                            onClose={() => setShowExportModal(false)}
                            viewMode={viewMode}
                            onExport={handleSave}
                            onPreview={getCanvasPreview}
                        />
                    )
                }

                {
                    showSettingsModal && (
                        <SettingsModal
                            settings={appSettings}
                            onUpdate={setAppSettings}
                            onClose={() => setShowSettingsModal(false)}
                        />
                    )
                }

                {
                    showHelpModal && (
                        <HelpModal
                            isOpen={showHelpModal}
                            onClose={() => setShowHelpModal(false)}
                        />
                    )
                }

                {
                    showAboutModal && (
                        <AboutModal
                            onClose={() => setShowAboutModal(false)}
                        />
                    )
                }

                <AILayoutModal
                    isOpen={showAiLayoutModal}
                    onClose={() => setShowAiLayoutModal(false)}
                    onGenerate={handleAiSpatialLayout}
                    isLoading={isAiLayoutLoading}
                />

                {
                    showBridgesModal && <BridgesModal onClose={() => setShowBridgesModal(false)} />
                }
                {
                    showSitePropertiesModal && (
                        <SitePropertiesModal
                            properties={siteProperties}
                            onUpdate={(next) => {
                                if (!siteModalHistoryRef.current) { addToHistory(); siteModalHistoryRef.current = true; }
                                setSiteProperties(next);
                            }}
                            onClose={() => setShowSitePropertiesModal(false)}
                        />
                    )
                }
            </div>
        </div >
    );
}