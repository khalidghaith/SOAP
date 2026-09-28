import { Room, Connection, Floor, ZoneColor, AppSettings, Annotation, ReferenceImage, SiteProperties, CanvasGuide } from '../types';

// Single source of truth for what a SOAP project contains.
// Used by the project file save/load and by the browser autosave, so the two can't drift apart.
export interface ProjectData {
    version: number;
    projectName: string;
    rooms: Room[];
    connections: Connection[];
    floors: Floor[];
    currentFloor: number;
    zoneColors: Record<string, ZoneColor>;
    appSettings: AppSettings;
    annotations: Annotation[];
    referenceImages: ReferenceImage[];
    floorOverlays: Record<number, number | null>;
    siteProperties: SiteProperties;
    guides: CanvasGuide[];
}

export const PROJECT_FILE_VERSION = 2;

export const buildProjectData = (state: Omit<ProjectData, 'version'>): ProjectData => ({
    version: PROJECT_FILE_VERSION,
    ...state,
});

// Validates a parsed project file. Returns only the fields that are present and well-formed,
// so older files (missing newer fields) still load. Throws if the file isn't a SOAP project.
export const parseProjectData = (raw: unknown): Partial<ProjectData> & { rooms: Room[] } => {
    if (!raw || typeof raw !== 'object') throw new Error('Not a SOAP project file.');
    const d = raw as Record<string, any>;
    if (!Array.isArray(d.rooms)) throw new Error('Project file has no spaces list.');

    const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    const out: Partial<ProjectData> & { rooms: Room[] } = { rooms: d.rooms };
    if (typeof d.projectName === 'string') out.projectName = d.projectName;
    if (Array.isArray(d.connections)) out.connections = d.connections;
    // Older projects could contain floors without a height
    if (Array.isArray(d.floors) && d.floors.length > 0) out.floors = d.floors.map((f: Floor) => ({ ...f, height: typeof f.height === 'number' ? f.height : 4 }));
    if (typeof d.currentFloor === 'number') out.currentFloor = d.currentFloor;
    if (isObj(d.zoneColors)) out.zoneColors = d.zoneColors;
    if (isObj(d.appSettings)) out.appSettings = d.appSettings;
    if (Array.isArray(d.annotations)) out.annotations = d.annotations;
    if (Array.isArray(d.referenceImages)) out.referenceImages = d.referenceImages;
    if (isObj(d.floorOverlays)) out.floorOverlays = d.floorOverlays;
    if (isObj(d.siteProperties)) {
        // Drop malformed site geometry rather than failing to render it
        const isPts = (v: unknown) => Array.isArray(v) && v.length >= 3 && v.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        const site = { ...d.siteProperties };
        if (site.boundary !== undefined && !isPts(site.boundary)) delete site.boundary;
        if (site.zones !== undefined) site.zones = Array.isArray(site.zones) ? site.zones.filter((z: any) => z && isPts(z.points)) : [];
        out.siteProperties = site;
    }
    if (Array.isArray(d.guides)) out.guides = d.guides;
    return out;
};

// --- Autosave ---
// Project metadata goes to localStorage (small, synchronous to read on startup).
// Reference image data goes to IndexedDB, because base64 images quickly exceed localStorage's ~5 MB quota.

const AUTOSAVE_KEY = 'SOAP_PROJECT_AUTOSAVE';
const DB_NAME = 'soap';
const IMAGE_STORE = 'referenceImages';

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(IMAGE_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { dbPromise = null; reject(req.error); };
        });
    }
    return dbPromise;
};

const idbRequest = <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> =>
    openDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGE_STORE, mode);
        const req = run(tx.objectStore(IMAGE_STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));

// Image urls already written to IndexedDB this session, to avoid rewriting megabytes on every autosave.
const writtenImages = new Map<string, string>();

export const loadAutosave = (): Partial<ProjectData> | null => {
    try {
        const saved = localStorage.getItem(AUTOSAVE_KEY);
        return saved ? parseProjectData(JSON.parse(saved)) : null;
    } catch (e) {
        console.error('Failed to load autosave', e);
        return null;
    }
};

// Fills in image data for reference images whose url was moved to IndexedDB.
// Images with no stored data are dropped rather than rendered broken.
export const hydrateReferenceImages = async (images: ReferenceImage[]): Promise<ReferenceImage[]> => {
    if (!images.some(img => !img.url)) return images;
    const result: ReferenceImage[] = [];
    for (const img of images) {
        if (img.url) { result.push(img); continue; }
        const url = await idbRequest<string>('readonly', s => s.get(img.id));
        if (url) {
            writtenImages.set(img.id, url);
            result.push({ ...img, url });
        }
    }
    return result;
};

export const saveAutosave = async (data: ProjectData): Promise<void> => {
    const images = data.referenceImages || [];
    const ids = new Set(images.map(img => img.id));

    for (const img of images) {
        if (img.url && writtenImages.get(img.id) !== img.url) {
            await idbRequest('readwrite', s => { s.put(img.url, img.id); });
            writtenImages.set(img.id, img.url);
        }
    }
    for (const id of [...writtenImages.keys()]) {
        if (!ids.has(id)) {
            await idbRequest('readwrite', s => { s.delete(id); });
            writtenImages.delete(id);
        }
    }

    const slim = { ...data, referenceImages: images.map(img => ({ ...img, url: '' })) };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(slim)); // throws on quota errors; caller reports it
};

export const clearAutosave = async (): Promise<void> => {
    localStorage.removeItem(AUTOSAVE_KEY);
    writtenImages.clear();
    try {
        await idbRequest('readwrite', s => { s.clear(); });
    } catch (e) {
        console.error('Failed to clear stored reference images', e);
    }
};

export const getAutosaveSize = async (): Promise<number> => {
    let bytes = (localStorage.getItem(AUTOSAVE_KEY)?.length || 0) * 2;
    try {
        const urls = await idbRequest<string[]>('readonly', s => s.getAll());
        (urls || []).forEach(u => { bytes += u.length * 2; });
    } catch { /* IndexedDB unavailable */ }
    return bytes;
};

// --- CSV ---

// Excel in comma-decimal locales saves ";"-separated files. Pick whichever separator the header line uses more.
const detectDelimiter = (src: string): ',' | ';' => {
    const firstLine = src.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
    const count = (c: string) => firstLine.split(c).length - 1;
    return count(';') > count(',') ? ';' : ',';
};

// RFC 4180-style parser: handles quoted fields, escaped quotes (""), CRLF line endings and ";" separators.
export const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    const src = text.replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(src);

    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (inQuotes) {
            if (c === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === delimiter) { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n') i++;
            row.push(field); rows.push(row);
            row = []; field = '';
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(f => f.trim() !== ''));
};

// Accepts "12.5" and "12,5" (comma decimal, from ;-separated files or quoted fields).
export const parseArea = (value: string): number => parseFloat(value.trim().replace(',', '.'));

export const toCsvField = (value: string | number): string => {
    const s = String(value);
    return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
