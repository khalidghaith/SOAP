import { Room, Floor, SiteProperties, ReferenceImage, Point, AppSettings } from '../types';
import { roomWorldPolygon, buildableArea, analyzeSite, polygonArea, polygonCentroid } from './site';

// Renders one floor of a SOAP project as a clean, labelled plan image for AI clients (MCP get_plan_image).
// Drawn from project data (not a screen capture) so it always shows the whole floor with a meter grid whose
// labels match the coordinates the AI reads and writes.

export interface PlanRenderOptions {
    floor: number;
    ghostFloor?: number | null;   // faint outline of another floor, e.g. the one below
    width?: number;               // output width in pixels (height follows the plan's proportions)
    maxHeight?: number;
    showSite?: boolean;           // boundary, setbacks, no-build zones, rule breaks (default true)
    showUnderlay?: boolean;       // satellite/reference images on this floor (default false)
    dark?: boolean;
    zoneColor: (zone: string) => { fill: string; stroke: string };
    pxPerMeter?: number;          // how SOAP stores geometry (20)
}

export interface PlanRenderInput {
    projectName: string;
    rooms: Room[];
    floors: Floor[];
    siteProperties: SiteProperties;
    referenceImages?: ReferenceImage[];
    appSettings?: AppSettings;
}

export interface PlanRender {
    svg: string;
    width: number;
    height: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number }; // meters
    spaces: number;
    underlays: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));

export const roomOnFloor = (r: Room, f: number) => {
    if (!r.isPlaced) return false;
    if (r.floor === f) return true;
    const [a, b] = r.spaceType === 'verticalConnection' ? [r.vcFromFloor, r.vcToFloor]
        : r.spaceType === 'multistory' ? [r.msFromFloor, r.msToFloor] : [undefined, undefined];
    if (a === undefined && b === undefined) return false;
    const lo = Math.min(a ?? r.floor, b ?? r.floor), hi = Math.max(a ?? r.floor, b ?? r.floor);
    return f >= lo && f <= hi;
};

/** A "nice" grid step (1, 2, 5, 10, 20, 50 m...) giving at most ~`target` lines across `span`. */
export const niceStep = (span: number, target = 12) => {
    const raw = span / target;
    const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
    for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return Math.max(m * pow, 0.5);
    return 10 * pow;
};

export const renderPlanSvg = (input: PlanRenderInput, opts: PlanRenderOptions): PlanRender | null => {
    const PXM = opts.pxPerMeter ?? 20;
    const site = input.siteProperties;
    const showSite = opts.showSite !== false;
    const floorRooms = input.rooms.filter(r => roomOnFloor(r, opts.floor));
    const ghostRooms = opts.ghostFloor != null && opts.ghostFloor !== opts.floor
        ? input.rooms.filter(r => roomOnFloor(r, opts.ghostFloor!) && !floorRooms.includes(r))
        : [];
    const boundary = showSite && site.boundary && site.boundary.length >= 3 ? site.boundary : null;
    const zones = showSite ? (site.zones || []).filter(z => z.points.length >= 3) : [];
    const underlays = opts.showUnderlay ? (input.referenceImages || []).filter(img => img.floor === opts.floor && img.url) : [];

    const outlines = new Map(floorRooms.map(r => [r.id, roomWorldPolygon(r, PXM)]));
    const ghostOutlines = ghostRooms.map(r => roomWorldPolygon(r, PXM));

    // Bounds in meters
    const pts: Point[] = [...outlines.values(), ...ghostOutlines].flat();
    if (boundary) pts.push(...boundary);
    zones.forEach(z => pts.push(...z.points));
    if (pts.length === 0) return null;
    const pad = 2;
    const minX = Math.min(...pts.map(p => p.x)) - pad, maxX = Math.max(...pts.map(p => p.x)) + pad;
    const minY = Math.min(...pts.map(p => p.y)) - pad, maxY = Math.max(...pts.map(p => p.y)) + pad;

    // Layout: title band on top, grid labels on the left/top, legend band at the bottom
    const W = Math.round(Math.min(Math.max(opts.width ?? 1024, 400), 2048));
    const top = 64, left = 44, right = 20, bottom = 60;
    let s = (W - left - right) / (maxX - minX); // pixels per meter
    const maxH = opts.maxHeight ?? 2048;
    if ((maxY - minY) * s + top + bottom > maxH) s = (maxH - top - bottom) / (maxY - minY);
    const planW = (maxX - minX) * s, planH = (maxY - minY) * s;
    const H = Math.round(planH + top + bottom);
    const X = (x: number) => left + (x - minX) * s;
    const Y = (y: number) => top + (y - minY) * s;
    const path = (poly: Point[]) => poly.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') + ' Z';

    const bg = opts.dark ? '#16181d' : '#ffffff';
    const ink = opts.dark ? '#e2e8f0' : '#1e293b';
    const faint = opts.dark ? '#2a2f38' : '#eef1f5';
    const gridMajor = opts.dark ? '#3a414d' : '#d5dbe3';
    const muted = opts.dark ? '#94a3b8' : '#64748b';
    const red = '#dc2626';
    const orange = '#f97316';
    const out: string[] = [];

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`);
    out.push(`<defs>
<pattern id="nb" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="${red}" stroke-width="2" stroke-opacity="0.45"/></pattern>
<pattern id="st" patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="8" x2="8" y2="0" stroke="${ink}" stroke-width="1" stroke-opacity="0.5"/></pattern>
<clipPath id="plan"><rect x="${left}" y="${top}" width="${planW}" height="${planH}"/></clipPath>
</defs>`);
    out.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);

    // Underlay (satellite / reference images), in world pixels -> meters
    if (underlays.length) {
        out.push(`<g clip-path="url(#plan)">`);
        for (const img of underlays) {
            const w = (img.width * img.scale) / PXM, h = (img.height * img.scale) / PXM;
            const x = img.x / PXM, y = img.y / PXM;
            const cx = X(x + w / 2), cy = Y(y + h / 2);
            out.push(`<image href="${esc(img.url)}" x="${X(x)}" y="${Y(y)}" width="${w * s}" height="${h * s}" opacity="${Math.min(img.opacity ?? 0.6, 0.7)}" preserveAspectRatio="none" transform="rotate(${img.rotation || 0} ${cx} ${cy})"/>`);
        }
        out.push(`</g>`);
    }

    // Grid: 1 m minor lines when legible, labelled major lines
    const major = niceStep(Math.max(maxX - minX, maxY - minY));
    const minor = s * 1 >= 8 && major > 1 ? 1 : null;
    out.push(`<g clip-path="url(#plan)">`);
    if (minor) {
        for (let x = Math.ceil(minX); x <= maxX; x += 1) out.push(`<line x1="${X(x)}" y1="${top}" x2="${X(x)}" y2="${top + planH}" stroke="${faint}" stroke-width="1"/>`);
        for (let y = Math.ceil(minY); y <= maxY; y += 1) out.push(`<line x1="${left}" y1="${Y(y)}" x2="${left + planW}" y2="${Y(y)}" stroke="${faint}" stroke-width="1"/>`);
    }
    for (let x = Math.ceil(minX / major) * major; x <= maxX; x += major) out.push(`<line x1="${X(x)}" y1="${top}" x2="${X(x)}" y2="${top + planH}" stroke="${gridMajor}" stroke-width="1"/>`);
    for (let y = Math.ceil(minY / major) * major; y <= maxY; y += major) out.push(`<line x1="${left}" y1="${Y(y)}" x2="${left + planW}" y2="${Y(y)}" stroke="${gridMajor}" stroke-width="1"/>`);
    out.push(`</g>`);
    for (let x = Math.ceil(minX / major) * major; x <= maxX; x += major) out.push(`<text x="${X(x)}" y="${top - 6}" font-size="11" fill="${muted}" text-anchor="middle">${fmt(x)}</text>`);
    for (let y = Math.ceil(minY / major) * major; y <= maxY; y += major) out.push(`<text x="${left - 6}" y="${Y(y) + 4}" font-size="11" fill="${muted}" text-anchor="end">${fmt(y)}</text>`);
    out.push(`<rect x="${left}" y="${top}" width="${planW}" height="${planH}" fill="none" stroke="${gridMajor}"/>`);

    // Site: no-build zones, setback line, property line
    const report = showSite ? analyzeSite(site, input.rooms, input.floors, input.appSettings, PXM) : null;
    for (const z of zones) {
        out.push(`<path d="${path(z.points)}" fill="url(#nb)" stroke="${red}" stroke-width="1.5" stroke-dasharray="6 3"/>`);
        const c = polygonCentroid(z.points);
        out.push(`<text x="${X(c.x)}" y="${Y(c.y)}" font-size="11" font-weight="bold" fill="${red}" text-anchor="middle" stroke="${bg}" stroke-width="3" paint-order="stroke">${esc(z.name)}</text>`);
    }
    if (boundary) {
        const buildable = site.constraints ? buildableArea(site) : null;
        if (buildable) out.push(`<path d="${path(buildable)}" fill="none" stroke="${orange}" stroke-width="1.5" stroke-dasharray="8 4"/>`);
        out.push(`<path d="${path(boundary)}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-dasharray="14 4 3 4"/>`);
    }

    // Ghost floor
    for (const poly of ghostOutlines) out.push(`<path d="${path(poly)}" fill="none" stroke="${muted}" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>`);

    // Spaces
    const zonesUsed = new Map<string, { fill: string; stroke: string }>();
    for (const r of floorRooms) {
        const poly = outlines.get(r.id)!;
        const color = opts.zoneColor(r.zone);
        zonesUsed.set(r.zone, color);
        const isStair = r.spaceType === 'verticalConnection';
        const isOutdoor = r.spaceType === 'outdoor' || r.spaceType === 'terrace';
        const isVoid = r.spaceType === 'multistory' && r.floor !== opts.floor; // upper level of a double-height space
        out.push(`<path d="${path(poly)}" fill="${isVoid ? 'none' : color.fill}" fill-opacity="${isOutdoor ? 0.45 : 0.85}" stroke="${color.stroke}" stroke-width="2"${isOutdoor || isVoid ? ' stroke-dasharray="6 4"' : ''}/>`);
        if (isStair) out.push(`<path d="${path(poly)}" fill="url(#st)"/>`);
    }

    // Rule breaks on this floor
    if (report) {
        for (const v of report.violations) {
            const poly = outlines.get(v.roomId);
            if (poly) out.push(`<path d="${path(poly)}" fill="${red}" fill-opacity="0.12" stroke="${red}" stroke-width="3" stroke-dasharray="6 3"/>`);
        }
    }

    // Labels: name and area, sized to fit
    for (const r of floorRooms) {
        const poly = outlines.get(r.id)!;
        const c = polygonCentroid(poly);
        const xs = poly.map(p => X(p.x)), ys = poly.map(p => Y(p.y));
        const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
        const area = polygonArea(poly);
        const name = r.spaceType === 'multistory' && r.floor !== opts.floor ? `${r.name} (void)` : r.name;
        const size = Math.max(8, Math.min(14, bw / Math.max(name.length * 0.62, 1), bh / 2.6));
        out.push(`<text x="${X(c.x)}" y="${Y(c.y) - size * 0.15}" font-size="${size.toFixed(1)}" font-weight="bold" fill="${ink}" text-anchor="middle" stroke="${bg}" stroke-width="3" stroke-opacity="0.7" paint-order="stroke">${esc(name)}</text>`);
        out.push(`<text x="${X(c.x)}" y="${Y(c.y) + size * 1.05}" font-size="${(size * 0.82).toFixed(1)}" fill="${muted}" text-anchor="middle" stroke="${bg}" stroke-width="3" stroke-opacity="0.7" paint-order="stroke">${area.toFixed(1)} m²</text>`);
    }

    // Title
    const floorLabel = input.floors.find(f => f.id === opts.floor)?.label ?? `Floor ${opts.floor}`;
    out.push(`<text x="${left}" y="24" font-size="16" font-weight="bold" fill="${ink}">${esc(input.projectName)} — ${esc(floorLabel)} (floor ${opts.floor})</text>`);
    const subtitle = [
        `${floorRooms.length} space${floorRooms.length === 1 ? '' : 's'}`,
        'grid labels in meters (x right, y down)',
        ...(ghostRooms.length ? [`dashed grey: floor ${opts.ghostFloor}`] : []),
        ...(report ? [`site ${report.siteArea.toFixed(0)} m²`, report.violations.length ? `${report.violations.length} rule break(s) in red` : 'fits the site'] : []),
    ].join(' · ');
    out.push(`<text x="${left}" y="42" font-size="11" fill="${muted}">${esc(subtitle)}</text>`);

    // North arrow (bottom right, in the legend band, clear of the grid labels)
    const na = site.northAngle || 0, nx = W - right - 22, ny = H - 28;
    out.push(`<g transform="translate(${nx} ${ny}) rotate(${na})"><circle r="16" fill="none" stroke="${muted}"/><path d="M0,-14 L5,4 L0,0 L-5,4 Z" fill="${orange}"/><text y="-19" font-size="10" font-weight="bold" fill="${orange}" text-anchor="middle" transform="rotate(${-na} 0 -22)">N</text></g>`);

    // Legend (bottom): scale bar, zones, site lines
    const ly = H - 22;
    const barM = niceStep(maxX - minX, 6);
    out.push(`<g><line x1="${left}" y1="${ly}" x2="${left + barM * s}" y2="${ly}" stroke="${ink}" stroke-width="2"/><line x1="${left}" y1="${ly - 4}" x2="${left}" y2="${ly + 4}" stroke="${ink}"/><line x1="${left + barM * s}" y1="${ly - 4}" x2="${left + barM * s}" y2="${ly + 4}" stroke="${ink}"/><text x="${left + (barM * s) / 2}" y="${ly - 7}" font-size="10" fill="${ink}" text-anchor="middle">${fmt(barM)} m</text></g>`);
    let lx = left + barM * s + 24;
    const legendItem = (swatch: string, label: string) => {
        out.push(`<g transform="translate(${lx} ${ly - 9})">${swatch}<text x="18" y="11" font-size="10" fill="${muted}">${esc(label)}</text></g>`);
        lx += 26 + label.length * 5.6;
    };
    zonesUsed.forEach((c, z) => { if (lx < W - 160) legendItem(`<rect width="13" height="13" fill="${c.fill}" stroke="${c.stroke}"/>`, z); });
    if (boundary && lx < W - 160) legendItem(`<line x1="0" y1="7" x2="13" y2="7" stroke="${ink}" stroke-width="2" stroke-dasharray="5 2"/>`, 'property line');
    if (boundary && site.constraints && lx < W - 150) legendItem(`<line x1="0" y1="7" x2="13" y2="7" stroke="${orange}" stroke-width="2" stroke-dasharray="4 2"/>`, 'setback');

    out.push(`</svg>`);
    return { svg: out.join('\n'), width: W, height: H, bounds: { minX, minY, maxX, maxY }, spaces: floorRooms.length, underlays: underlays.length };
};

/** Rasterises an SVG string to a base64 PNG (browser only). */
export const svgToPngBase64 = async (svg: string, width: number, height: number): Promise<string> => {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not render the plan image.'));
    });
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/png').split(',')[1];
};
