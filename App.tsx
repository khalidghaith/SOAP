import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Room, COLOR_PALETTE, DIAGRAM_STYLES, DiagramStyle, Point, Floor, VerticalConnection, ZoningTypology, SiteProperties } from './types';
import { ProgramEditor } from './components/ProgramEditor';
import { Bubble } from './components/Bubble';
import { HelpModal } from './components/HelpModal';
import { AboutModal } from './components/AboutModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ZoneOverlay } from './components/ZoneOverlay';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { SitePropertiesModal } from './components/SitePropertiesModal';
import type { VolumesViewHandle } from './components/VolumesView';
// three.js is large; load the 3D view only when it's first opened
const VolumesView = React.lazy(() => import('./components/VolumesView').then(m => ({ default: m.VolumesView })));
import { ErrorBoundary } from './components/ErrorBoundary';
import { AILayoutModal } from './components/AILayoutModal';
import { applyMagneticPhysics } from './utils/physics';
import { handleExport, getHexColorForZone, getHexBorderForZone } from './utils/exportSystem';
import { arrangeRooms } from './utils/layout';
import { validateAiLayout } from './utils/aiLayout';
import { parseProjectData, parseCsv, parseArea, toCsvField } from './utils/projectStore';
import { useProjectDocument } from './hooks/useProjectDocument';
import { useCanvasViewport } from './hooks/useCanvasViewport';
import { useGuides } from './hooks/useGuides';
import { GuideLines, GuideActionsPanel } from './components/GuideLayer';
import { AppHeader, ViewMode } from './components/AppHeader';
import { CanvasToolbar, CanvasTool } from './components/CanvasToolbar';
import { VolumesSettings, CurrentFloorSettings } from './components/FloorSettingsPanel';
import { InventorySidebar } from './components/InventorySidebar';
import { FloorTabs } from './components/FloorTabs';
import { canvasContentBounds } from './utils/canvasBounds';
import { SpacePropertiesPanel } from './components/SpacePropertiesPanel';
import { ZonePropertiesPanel } from './components/ZonePropertiesPanel';
import { NotificationHost, notify, confirmDialog } from './components/Notifications';
import {
    ChevronRight, ChevronLeft, Maximize
} from 'lucide-react';
import { Annotation, AnnotationType, ArrowCapType, ReferenceImage, ReferenceScaleState } from './types';
import { SketchPanel } from './components/SketchToolbar';
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
import { Rulers } from './components/Rulers';
import SoapLogo from './lib/symbols/SOAP-Logo.svg';

import { generateSpatialLayout } from './services/geminiService';
import { PIXELS_PER_METER, isOnFloor } from './utils/rooms';
import { convertRoomShape, RoomShape } from './utils/shapeConversion';
import { selectionBoxFrom, outlineInBox, SelectionMode } from './utils/selection';
import { downloadBlob, saveFile } from './utils/fileSave';

// Shim process for libs that might expect it in Vite
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {} };
}

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
    // The canvas mode or side panel in use. They share the space beside the toolbar, so opening one closes the others.
    const [activeTool, setActiveTool] = useState<CanvasTool | null>(null);
    const toggleTool = (tool: CanvasTool) => setActiveTool(current => (current === tool ? null : tool));
    const isGuidesMode = activeTool === 'guides';
    const isSiteMode = activeTool === 'site';
    const isSketchMode = activeTool === 'sketch';
    const isReferenceMode = activeTool === 'reference';
    const showSnapPanel = activeTool === 'snap';
    const showStylePanel = activeTool === 'style';
    const [siteTool, setSiteTool] = useState<SiteTool>('select');
    const [siteSelection, setSiteSelection] = useState<SiteSelection | null>(null);
    const [fitRequest, setFitRequest] = useState(0);
    const siteModalHistoryRef = useRef(false);

    // API Key State
    // The .env key is a dev convenience only; it must never be baked into a production bundle
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('SOAP_GEMINI_KEY') || (import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : '') || "");
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [showAboutModal, setShowAboutModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showSitePropertiesModal, setShowSitePropertiesModal] = useState(false);
    const [showBridgesModal, setShowBridgesModal] = useState(false);
    const bridgeState = useBridge();
    const [isAiLayoutLoading, setIsAiLayoutLoading] = useState(false);
    const [showAiLayoutModal, setShowAiLayoutModal] = useState(false);

    // Sketch State
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

    // Canvas view: pan/zoom state of the 2D plan
    const mainRef = useRef<HTMLElement>(null);
    const {
        scale, offset, toWorld,
        isPanning, startPan, movePan, endPan,
        startPinch, movePinch, endTouch,
        fitBounds,
    } = useCanvasViewport(mainRef, viewMode === 'CANVAS');

    const [canvasStyle, setCanvasStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
    const [volumesStyle, setVolumesStyle] = useState<DiagramStyle>(DIAGRAM_STYLES[0]);
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

    const {
        selectedGuideId, setSelectedGuideId,
        startNewGuide, startDragGuide, toggleLockGuide, rotateGuide, deleteGuide,
    } = useGuides({ guides, setGuides, addToHistory, toWorld, scale, gridSize, unitSystem: appSettings.unitSystem });

    // UI State
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [isInventoryOpen, setIsInventoryOpen] = useState(true);
    const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
    const [snapGuides, setSnapGuides] = useState<{ x?: number, y?: number } | null>(null);
    const activeOverlayFloorId = floorOverlays[currentFloor] ?? null;
    const [isZoneDragging, setIsZoneDragging] = useState(false);
    const [isBubbleDragging, setIsBubbleDragging] = useState(false);
    const [isInventoryHovered, setIsInventoryHovered] = useState(false);
    const [hasInitialZoomed, setHasInitialZoomed] = useState(false);
    const [floorGap, setFloorGap] = useState(4);
    const [hiddenFloorIds, setHiddenFloorIds] = useState<Set<number>>(new Set());
    const [showVolumeLabels, setShowVolumeLabels] = useState(true);
    const [volumeLabelFontSize, setVolumeLabelFontSize] = useState(11);

    const roomsRef = useRef(rooms);
    roomsRef.current = rooms;

    const performSelection = useCallback((start: Point, end: Point) => {
        if (!mainRef.current) return;

        // start/end are relative to the canvas element; the box is tested in world coordinates
        const rect = mainRef.current.getBoundingClientRect();
        const box = selectionBoxFrom(
            toWorld(start.x + rect.left, start.y + rect.top),
            toWorld(end.x + rect.left, end.y + rect.top),
        );
        const mode: SelectionMode = start.x > end.x ? 'crossing' : 'window'; // right-to-left drags cross

        setSelectedRoomIds(new Set(roomsRef.current
            .filter(r => r.isPlaced && isOnFloor(r, currentFloor)
                && outlineInBox(roomWorldPolygon(r, 1, { points: true }), box, mode, true))
            .map(r => r.id)));

        if (isSketchMode) {
            const hit = annotations.find(a => a.floor === currentFloor && a.points?.length > 0 && outlineInBox(a.points, box, mode, false));
            setSelectedAnnotationId(hit?.id ?? null);
        }
    }, [currentFloor, annotations, isSketchMode, toWorld]);

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
    }, [isGuidesMode, setSelectedGuideId]);

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
            return isOnFloor(r, currentFloor) || (overlayId !== null && isOnFloor(r, overlayId));
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

    const inventoryRef = useRef<HTMLElement>(null);

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
    }, [isMagnetMode, appSettings.magnetStrength, appSettings.magnetPadding, setRooms]);

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

    // --- Core Handlers ---
    const handlePanStart = (e: React.MouseEvent) => {
        // Allow pan on Middle Button (1) OR Right Button (2)
        if (e.button === 1 || e.button === 2) {
            startPan(e.clientX, e.clientY);
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
            movePan(e.clientX, e.clientY);
        } else if (selectionBox && mainRef.current) {
            const rect = mainRef.current.getBoundingClientRect();
            const updatedEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setSelectionBox(prev => prev ? { ...prev, end: updatedEnd } : null);
            if (Math.hypot(updatedEnd.x - selectionBox.start.x, updatedEnd.y - selectionBox.start.y) > 5) {
                performSelection(selectionBox.start, updatedEnd);
            }
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;
        if (e.touches.length === 1) {
            // One finger on the background pans and clears the selection
            if (e.target === mainRef.current) {
                startPan(e.touches[0].clientX, e.touches[0].clientY);
                setSelectedRoomIds(new Set());
                setSelectedZone(null);
                setSelectedAnnotationId(null);
                setConnectionSourceId(null);
            }
        } else if (e.touches.length === 2) {
            startPinch(e.touches[0], e.touches[1]);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (viewMode === 'VOLUMES') return;
        if (e.touches.length === 1 && isPanning) movePan(e.touches[0].clientX, e.touches[0].clientY);
        else if (e.touches.length === 2) movePinch(e.touches[0], e.touches[1]);
    };

    const handleTouchEnd = () => {
        if (viewMode === 'VOLUMES') return;
        endTouch();
    };

    const handleZoomToFit = useCallback(() => {
        const showSite = siteProperties.boundary && siteProperties.boundary.length >= 3 && (siteProperties.showSite !== false || isSiteMode);
        fitBounds(canvasContentBounds(
            rooms.filter(r => r.isPlaced && isOnFloor(r, currentFloor)),
            annotations.filter(a => a.floor === currentFloor),
            showSite ? siteProperties.boundary!.map(p => ({ x: p.x * PIXELS_PER_METER, y: p.y * PIXELS_PER_METER })) : [],
        ));
    }, [rooms, annotations, currentFloor, siteProperties.boundary, siteProperties.showSite, isSiteMode, fitBounds]);

    // Fit the view after a site import (runs once the new boundary is in state)
    useEffect(() => {
        if (fitRequest) handleZoomToFit();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitRequest]);

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
                    setConnectionSourceId(null);
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

    const handleDeleteFloor = (id: number) => {
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

    // --- Room Handlers ---
    const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
        setRooms(prev => prev.map(r => {
            if (r.id !== id) return r;

            const updatedRoom = { ...r, ...updates };

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
    }, [setRooms]);

    // After a polygon/bubble edit, move its origin (its rotation pivot) to the shape's centre; nothing moves on the plan
    const recenterRoomShape = useCallback((id: string) => {
        setRooms(prev => prev.map(r => (r.id === id ? recenterShape(r) : r)));
    }, [setRooms]);

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
                        const isVisible = isOnFloor(r, currentFloor);
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
    }, [setRooms, selectedRoomIds, currentFloor]);

    const deleteRoom = useCallback((id: string) => {
        addToHistory();
        setRooms(prev => prev.filter(r => r.id !== id));
        setSelectedRoomIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, [addToHistory, setRooms]);

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
    }, [addToHistory, setRooms]);

    const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }, [setAnnotations]);

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
    }, [setReferenceImages]);

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

    // Leaving site mode drops its selection and tool
    useEffect(() => {
        if (!isSiteMode) {
            setSiteSelection(null);
            setSiteTool('select');
        }
    }, [isSiteMode]);

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
    }, [addToHistory, setAnnotations]);

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
    }, [connectionSourceId, addToHistory, setConnections]);

    const removeConnection = useCallback((id: string) => {
        addToHistory();
        setConnections(prev => prev.filter(c => c.id !== id));
    }, [addToHistory, setConnections]);

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
                const isVisible = isOnFloor(r, currentFloor);
                if (isVisible) {
                    return { ...r, x: r.x + dx, y: r.y + dy };
                }
            }
            return r;
        }));
    }, [currentFloor, setRooms]);

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
    }, [addToHistory, setRooms, setZoneColors]);

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
    }, [selectedRoomIds, setRooms, updateRoom]);

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
                        const isVisible = isOnFloor(r, currentFloor);
                        if (isVisible) {
                            return { ...r, isPlaced: false };
                        }
                    }
                    return r;
                }));
                setSelectedZone(null);
            }
        }
    }, [selectedZone, addToHistory, setRooms, currentFloor]);

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

    const handleConvertShape = (shape: RoomShape) => {
        addToHistory();
        setRooms(prev => prev.map(r => (selectedRoomIds.has(r.id) ? convertRoomShape(r, shape) : r)));
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
            downloadBlob(new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' }), `${finalName}.csv`);

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
                <AppHeader
                    projectName={projectName}
                    onProjectNameChange={setProjectName}
                    isInventoryOpen={isInventoryOpen}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    darkMode={darkMode}
                    onToggleDarkMode={() => setDarkMode(d => !d)}
                    bridgeState={bridgeState}
                    hasApiKey={!!apiKey}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={undo}
                    onRedo={redo}
                    onResetProject={handleResetProject}
                    onOpenBridges={() => setShowBridgesModal(true)}
                    onOpenApiKey={() => setShowApiKeyModal(true)}
                    onOpenSettings={() => {
                        setShowSettingsModal(true);
                        setActiveTool(current => (current === 'snap' || current === 'style' || current === 'reference' ? null : current));
                    }}
                    onOpenHelp={() => setShowHelpModal(true)}
                    onOpenAbout={() => setShowAboutModal(true)}
                    onOpenSave={() => setShowExportModal(true)}
                    onImportProject={handleImportProject}
                />

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

                    <InventorySidebar
                        panelRef={inventoryRef}
                        isOpen={isInventoryOpen}
                        onOpenChange={setIsInventoryOpen}
                        isDropTarget={isInventoryHovered}
                        unplacedRooms={unplacedRooms}
                        zoneColors={zoneColors}
                        unitSystem={appSettings.unitSystem}
                        onDragStart={handleDragStart}
                        onDragOver={handleInventoryDragOver}
                        onDrop={handleInventoryDrop}
                        onPlaceCenter={handlePlaceCenter}
                        onAddSpace={() => addRoom({})}
                    />

                    <main
                        ref={mainRef}
                        className={`flex-1 relative overflow-hidden ${canvasTheme.bg} transition-colors duration-500 ${isZoneDragging ? 'no-transition' : ''}`}
                        onMouseDown={viewMode === 'VOLUMES' ? undefined : handlePanStart}
                        onMouseMove={viewMode === 'VOLUMES' ? undefined : handleMouseMove}
                        onMouseUp={viewMode === 'VOLUMES' ? undefined : endPan}
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

                                        const isFromVisible = isOnFloor(fromRoom, currentFloor);
                                        
                                        const isToVisible = isOnFloor(toRoom, currentFloor);

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

                                    <GuideLines
                                        guides={guides}
                                        selectedGuideId={selectedGuideId}
                                        scale={scale}
                                        darkMode={darkMode}
                                        interactive={isGuidesMode}
                                        onStartDrag={startDragGuide}
                                    />
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
                                    const visibleRooms = rooms.filter(r => r.isPlaced && isOnFloor(r, currentFloor));
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
                                            appSettings={appSettings}
                                            zoneColors={zoneColors}
                                            onDragEnd={handleBubbleDragEnd}
                                            onDragStart={() => { setIsBubbleDragging(true); addToHistory(); }}
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

                            <FloorTabs
                                floors={floors}
                                currentFloor={currentFloor}
                                onSelectFloor={setCurrentFloor}
                                onRenameFloor={handleRenameFloor}
                                onDeleteFloor={handleDeleteFloor}
                                onAddFloor={handleAddFloor}
                            />
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
                                <CanvasToolbar
                                    viewMode={viewMode}
                                    gridSize={gridSize}
                                    unitSystem={appSettings.unitSystem}
                                    onGridSizeStep={step => setGridSizeIndex(prev => Math.min(Math.max(prev + step, 0), GRID_SIZES.length - 1))}
                                    showGrid={showGrid}
                                    onToggleGrid={() => setShowGrid(!showGrid)}
                                    onAutoArrange={handleAutoArrange}
                                    onOpenAiLayout={() => setShowAiLayoutModal(true)}
                                    isAiLayoutLoading={isAiLayoutLoading}
                                    floors={floors}
                                    currentFloor={currentFloor}
                                    overlayFloorId={activeOverlayFloorId}
                                    onOverlayFloorChange={floorId => setFloorOverlays(prev => ({ ...prev, [currentFloor]: floorId }))}
                                    snapPanelOpen={showSnapPanel}
                                    snapEnabled={snapEnabled}
                                    onToggleSnapPanel={() => toggleTool('snap')}
                                    magnetMode={isMagnetMode}
                                    onToggleMagnet={() => setIsMagnetMode(!isMagnetMode)}
                                    showZones={showZones}
                                    onToggleZones={() => setShowZones(!showZones)}
                                    referenceMode={isReferenceMode}
                                    onToggleReference={() => toggleTool('reference')}
                                    siteMode={isSiteMode}
                                    onToggleSite={() => toggleTool('site')}
                                    guidesMode={isGuidesMode}
                                    onToggleGuides={() => toggleTool('guides')}
                                    sketchMode={isSketchMode}
                                    onToggleSketch={() => toggleTool('sketch')}
                                    stylePanelOpen={showStylePanel}
                                    onToggleStylePanel={() => toggleTool('style')}
                                    volumesViewType={volumesViewState.viewType}
                                    onVolumesViewTypeChange={viewType => handleViewStateChange({ viewType }, true)}
                                    onClearCanvas={handleClearCanvas}
                                />

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
                                            onClose={() => setActiveTool(null)}
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
                                            onClose={() => setActiveTool(null)}
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
                                                setActiveTool(null);
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
                                        onDragNewGuide={startNewGuide}
                                    />
                                )}

                                {(() => {
                                    const selectedGuide = guides.find(g => g.id === selectedGuideId);
                                    if (!selectedGuide || !isGuidesMode || viewMode !== 'CANVAS') return null;
                                    const view = mainRef.current?.getBoundingClientRect();
                                    return (
                                        <GuideActionsPanel
                                            guide={selectedGuide}
                                            scale={scale}
                                            offset={offset}
                                            viewWidth={view?.width || window.innerWidth}
                                            viewHeight={view?.height || window.innerHeight}
                                            onToggleLock={toggleLockGuide}
                                            onRotate={rotateGuide}
                                            onDelete={deleteGuide}
                                        />
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
                                                <VolumesSettings
                                                    floors={floors}
                                                    rooms={rooms}
                                                    floorGap={floorGap}
                                                    onFloorGapChange={setFloorGap}
                                                    showLabels={showVolumeLabels}
                                                    onToggleLabels={() => setShowVolumeLabels(!showVolumeLabels)}
                                                    labelFontSize={volumeLabelFontSize}
                                                    onLabelFontSizeChange={setVolumeLabelFontSize}
                                                    hiddenFloorIds={hiddenFloorIds}
                                                    onToggleFloorVisibility={toggleFloorVisibility}
                                                    onUpdateFloor={handleUpdateFloor}
                                                    unitSystem={appSettings.unitSystem}
                                                />
                                            ) : (
                                                <CurrentFloorSettings
                                                    floor={floors.find(f => f.id === currentFloor)}
                                                    onChange={updates => handleUpdateFloor(currentFloor, updates)}
                                                />
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