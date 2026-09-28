import { useState, useCallback, useEffect } from 'react';
import { Room, Connection, Floor, ZoneColor, AppSettings, Annotation, ReferenceImage, SiteProperties, CanvasGuide, FLOORS, ZONE_COLORS } from '../types';
import { buildProjectData, loadAutosave, saveAutosave, hydrateReferenceImages, clearAutosave, ProjectData } from '../utils/projectStore';

export const DEFAULT_APP_SETTINGS: AppSettings = {
    zoneTransparency: 0.5,
    zonePadding: 10,
    strokeWidth: 2,
    cornerRadius: 12,
    fontSize: 12,
    snapTolerance: 10,
    snapToGrid: false,
    snapToObjects: true,
    snapWhileScaling: false,
    volumesOpacity: 0.6,
    colorSaturation: 1.0,
    unitSystem: 'metric',
    magnetStrength: 50,
    magnetPadding: 10,
    incrementalScalingEnabled: false,
    incrementalScaleAmount: 0.05,
    snapToGuides: true
};

export const DEFAULT_SITE_PROPERTIES: SiteProperties = {
    locationName: 'Cairo, Egypt',
    latitude: 30.0444,
    longitude: 31.2357,
    northAngle: 0,
};

// The parts of the project that undo/redo tracks
interface HistorySnapshot {
    rooms: Room[];
    connections: Connection[];
    floors: Floor[];
    zoneColors: Record<string, ZoneColor>;
    projectName: string;
    annotations: Annotation[];
    referenceImages: ReferenceImage[];
    guides: CanvasGuide[];
    // Site geometry and north angle are undoable (rotating the site turns north with it); the location is a setting
    site: SiteGeometry;
}

type SiteGeometry = Pick<SiteProperties, 'boundary' | 'zones' | 'constraints' | 'geoAnchor' | 'northAngle'>;

const HISTORY_LIMIT = 50;

/**
 * Owns the project document: everything that is saved to a project file,
 * plus undo/redo history and browser autosave.
 */
export const useProjectDocument = () => {
    const [initialData] = useState(() => (typeof window === 'undefined' ? null : loadAutosave()));

    const [projectName, setProjectName] = useState(initialData?.projectName || "New Project");
    const [rooms, setRooms] = useState<Room[]>(initialData?.rooms || []);
    const [connections, setConnections] = useState<Connection[]>(initialData?.connections || []);
    const [zoneColors, setZoneColors] = useState<Record<string, ZoneColor>>(initialData?.zoneColors || ZONE_COLORS);
    // Image data for autosaved reference images lives in IndexedDB and is filled in after mount
    const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(() => (initialData?.referenceImages || []).filter(img => img.url));
    const [guides, setGuides] = useState<CanvasGuide[]>(initialData?.guides || []);
    const [siteProperties, setSiteProperties] = useState<SiteProperties>(initialData?.siteProperties || DEFAULT_SITE_PROPERTIES);
    const [annotations, setAnnotations] = useState<Annotation[]>(initialData?.annotations || []);
    const [appSettings, setAppSettings] = useState<AppSettings>(() => ({ ...DEFAULT_APP_SETTINGS, ...initialData?.appSettings }));
    const [floors, setFloors] = useState<Floor[]>(initialData?.floors || FLOORS);
    const [currentFloor, setCurrentFloor] = useState<number>(initialData?.currentFloor || 0);
    const [floorOverlays, setFloorOverlays] = useState<Record<number, number | null>>(initialData?.floorOverlays || {});

    const getProjectData = (): ProjectData => buildProjectData({
        projectName, rooms, connections, floors, currentFloor, zoneColors, appSettings,
        annotations, referenceImages, floorOverlays, siteProperties, guides
    });

    // --- Autosave ---
    const [isAutosaveReady, setIsAutosaveReady] = useState(false);
    const [autosaveError, setAutosaveError] = useState<string | null>(null);

    // Restore autosaved reference image data before autosave is allowed to overwrite it
    useEffect(() => {
        const saved = initialData?.referenceImages || [];
        hydrateReferenceImages(saved)
            .then(images => { if (images.length !== referenceImages.length) setReferenceImages(images); })
            .catch(e => console.error("Failed to restore reference images", e))
            .finally(() => setIsAutosaveReady(true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced autosave
    useEffect(() => {
        if (!isAutosaveReady) return;
        const timer = setTimeout(() => {
            saveAutosave(getProjectData())
                .then(() => setAutosaveError(null))
                .catch(e => {
                    console.error("Autosave failed", e);
                    const quota = e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message));
                    setAutosaveError(quota
                        ? "Autosave failed: browser storage is full. Save the project to a file to avoid losing work."
                        : "Autosave failed. Save the project to a file to avoid losing work.");
                });
        }, 500);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAutosaveReady, projectName, rooms, connections, zoneColors, appSettings, floors, currentFloor, annotations, referenceImages, floorOverlays, siteProperties, guides]);

    // --- History ---
    const [history, setHistory] = useState<HistorySnapshot[]>([]);
    const [future, setFuture] = useState<HistorySnapshot[]>([]);

    const snapshot = (): HistorySnapshot => ({
        rooms, connections, floors, zoneColors, projectName, annotations, referenceImages, guides,
        site: { boundary: siteProperties.boundary, zones: siteProperties.zones, constraints: siteProperties.constraints, geoAnchor: siteProperties.geoAnchor, northAngle: siteProperties.northAngle },
    });

    const restore = (s: HistorySnapshot) => {
        setRooms(s.rooms);
        setConnections(s.connections);
        setFloors(s.floors);
        setZoneColors(s.zoneColors);
        setProjectName(s.projectName);
        setAnnotations(s.annotations || []);
        setReferenceImages(s.referenceImages || []);
        setGuides(s.guides || []);
        if (s.site) setSiteProperties(prev => ({ ...prev, ...s.site }));
    };

    const addToHistory = useCallback(() => {
        setHistory(prev => {
            const newHistory = [...prev, snapshot()];
            if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
            return newHistory;
        });
        setFuture([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rooms, connections, floors, zoneColors, projectName, annotations, referenceImages, guides, siteProperties]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        setFuture(prev => [snapshot(), ...prev]);
        restore(history[history.length - 1]);
        setHistory(history.slice(0, -1));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, rooms, connections, floors, zoneColors, projectName, annotations, referenceImages, guides, siteProperties]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        setHistory(prev => [...prev, snapshot()]);
        restore(future[0]);
        setFuture(future.slice(1));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [future, rooms, connections, floors, zoneColors, projectName, annotations, referenceImages, guides, siteProperties]);

    // --- Whole-project operations ---

    /** Replaces the current project with a loaded one (undoable). */
    const loadProject = (data: Partial<ProjectData> & { rooms: Room[] }) => {
        addToHistory();
        setRooms(data.rooms);
        setProjectName(data.projectName ?? "New Project");
        setConnections(data.connections ?? []);
        setFloors(data.floors ?? FLOORS);
        setCurrentFloor(data.currentFloor ?? 0);
        setAnnotations(data.annotations ?? []);
        setReferenceImages(data.referenceImages ?? []);
        setFloorOverlays(data.floorOverlays ?? {});
        setGuides(data.guides ?? []);
        if (data.zoneColors) setZoneColors(data.zoneColors);
        if (data.appSettings) setAppSettings(prev => ({ ...prev, ...data.appSettings }));
        // Older files have no site; don't carry the previous project's boundary over
        setSiteProperties(prev => data.siteProperties ?? { ...prev, boundary: undefined, zones: [], constraints: undefined, geoAnchor: undefined });
    };

    /** Clears the project and its autosave. Not undoable. */
    const resetProject = () => {
        clearAutosave();
        setProjectName("New Project");
        setRooms([]);
        setConnections([]);
        setFloors(FLOORS);
        setCurrentFloor(0);
        setZoneColors(ZONE_COLORS);
        setHistory([]);
        setFuture([]);
        setAnnotations([]);
        setReferenceImages([]);
        setGuides([]);
        setSiteProperties(prev => ({ ...prev, boundary: undefined, zones: [], constraints: undefined, geoAnchor: undefined }));
    };

    return {
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
        addToHistory, undo, redo,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        loadProject,
        resetProject,
    };
};
