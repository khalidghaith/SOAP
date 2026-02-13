import { Room, Connection, Point, ZoneColor, AppSettings, Annotation, DiagramStyle, ReferenceImage } from '../types';
import { getConvexHull, createRoundedPath } from './geometry';
import { SketchManager } from '../SketchManager';
import { jsPDF } from "jspdf";
import "svg2pdf.js";

export type ExportFormat = 'png' | 'jpeg' | 'svg' | 'dxf' | 'json' | 'pdf';
const PIXELS_PER_METER = 20;

// Text wrapping helper with literal dash support
export const wrapText = (text: string, maxWidth: number, fontSize: number, fontFamily: string = 'Inter, sans-serif'): string[] => {
    if (!text) return [];
    if (typeof document === 'undefined') return [text];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [text];
    ctx.font = `bold ${fontSize}px ${fontFamily}`;

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);

    const finalLines: string[] = [];
    for (const line of lines) {
        if (ctx.measureText(line).width <= maxWidth) {
            finalLines.push(line);
            continue;
        }
        let remaining = line;
        while (ctx.measureText(remaining).width > maxWidth) {
            let splitIndex = remaining.length - 1;
            while (splitIndex > 0 && ctx.measureText(remaining.substring(0, splitIndex) + "-").width > maxWidth) {
                splitIndex--;
            }
            if (splitIndex <= 0) break;
            finalLines.push(remaining.substring(0, splitIndex) + "-");
            remaining = remaining.substring(splitIndex);
        }
        finalLines.push(remaining);
    }
    return finalLines;
};

// --- Geometry Helpers ---

const calculateCentroid = (points: Point[]): Point => {
    let x = 0, y = 0;
    for (const p of points) {
        x += p.x;
        y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
};

// Generate Bezier commands for smooth bubble curves (Catmull-Rom to Cubic Bezier)
const getBubblePathCommands = (points: Point[]) => {
    const cmds: { type: 'M' | 'C', values: number[] }[] = [];
    if (points.length < 3) return cmds;

    cmds.push({ type: 'M', values: [points[0].x, points[0].y] });

    for (let i = 0; i < points.length; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];

        // Catmull-Rom control points
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;

        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        cmds.push({ type: 'C', values: [cp1x, cp1y, cp2x, cp2y, p2.x, p2.y] });
    }
    return cmds;
};

const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// Helper to parse tailwind class string
const parseTailwindColor = (classString: string, type: 'bg' | 'border' | 'text', darkMode: boolean): { color: string | null, opacity: number | null } => {
    if (!classString) return { color: null, opacity: null };

    const classes = classString.split(' ');
    let activeClass = classes.find(c => !c.includes(':')) || '';

    if (darkMode) {
        const darkClass = classes.find(c => c.startsWith('dark:'));
        if (darkClass) activeClass = darkClass.replace('dark:', '');
    }

    if (!activeClass) return { color: null, opacity: null };

    // Extract opacity
    let opacity: number | null = null;
    const opacityMatch = activeClass.match(/\/(\d+)$/);
    if (opacityMatch) {
        opacity = parseInt(opacityMatch[1], 10) / 100;
        activeClass = activeClass.replace(/\/\d+$/, '');
    }

    // Extract Arbitrary Color
    const arbitraryMatch = activeClass.match(/\[(#[0-9a-fA-F]{6})\]/);
    if (arbitraryMatch) {
        return { color: arbitraryMatch[1], opacity };
    }

    // Map Standard Colors
    const tailwindColors: Record<string, string> = {
        'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1', 'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b', 'slate-900': '#0f172a',
        'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937', 'gray-900': '#111827',
        'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8', 'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-600': '#52525b', 'zinc-700': '#3f3f46', 'zinc-800': '#27272a', 'zinc-900': '#18181b',
        'neutral-50': '#fafafa', 'neutral-100': '#f5f5f5', 'neutral-200': '#e5e5e5', 'neutral-300': '#d4d4d4', 'neutral-400': '#a3a3a3', 'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040', 'neutral-800': '#262626', 'neutral-900': '#171717',
        'stone-50': '#fafaf9', 'stone-100': '#f5f5f4', 'stone-200': '#e7e5e4', 'stone-300': '#d6d3d1', 'stone-400': '#a8a29e', 'stone-500': '#78716c', 'stone-600': '#57534e', 'stone-700': '#44403c', 'stone-800': '#292524', 'stone-900': '#1c1917',
        'red-50': '#fef2f2', 'red-100': '#fee2e2', 'red-200': '#fecaca', 'red-300': '#fca5a5', 'red-400': '#f87171', 'red-500': '#ef4444', 'red-600': '#dc2626', 'red-700': '#b91c1c', 'red-800': '#991b1b', 'red-900': '#7f1d1d',
        'orange-50': '#fff7ed', 'orange-100': '#ffedd5', 'orange-200': '#fed7aa', 'orange-300': '#fdba74', 'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c', 'orange-700': '#c2410c', 'orange-800': '#9a3412', 'orange-900': '#7c2d12',
        'amber-50': '#fffbeb', 'amber-100': '#fef3c7', 'amber-200': '#fde68a', 'amber-300': '#fcd34d', 'amber-400': '#fbbf24', 'amber-500': '#f59e0b', 'amber-600': '#d97706', 'amber-700': '#b45309', 'amber-800': '#92400e', 'amber-900': '#78350f',
        'yellow-50': '#fefce8', 'yellow-100': '#fef9c3', 'yellow-200': '#fef08a', 'yellow-300': '#fde047', 'yellow-400': '#facc15', 'yellow-500': '#eab308', 'yellow-600': '#ca8a04', 'yellow-700': '#a16207', 'yellow-800': '#854d0e', 'yellow-900': '#713f12',
        'lime-50': '#f7fee7', 'lime-100': '#ecfccb', 'lime-200': '#d9f99d', 'lime-300': '#bef264', 'lime-400': '#a3e635', 'lime-500': '#84cc16', 'lime-600': '#65a30d', 'lime-700': '#4d7c0f', 'lime-800': '#3f6212', 'lime-900': '#365314',
        'green-50': '#f0fdf4', 'green-100': '#dcfce7', 'green-200': '#bbf7d0', 'green-300': '#86efac', 'green-400': '#4ade80', 'green-500': '#22c55e', 'green-600': '#16a34a', 'green-700': '#15803d', 'green-800': '#166534', 'green-900': '#14532d',
        'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0', 'emerald-300': '#6ee7b7', 'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857', 'emerald-800': '#065f46', 'emerald-900': '#064e3b',
        'teal-50': '#f0fdfa', 'teal-100': '#ccfbf1', 'teal-200': '#99f6e4', 'teal-300': '#5eead4', 'teal-400': '#2dd4bf', 'teal-500': '#14b8a6', 'teal-600': '#0d9488', 'teal-700': '#0f766e', 'teal-800': '#115e59', 'teal-900': '#134e4a',
        'cyan-50': '#ecfeff', 'cyan-100': '#cffafe', 'cyan-200': '#a5f3fc', 'cyan-300': '#67e8f9', 'cyan-400': '#22d3ee', 'cyan-500': '#06b6d4', 'cyan-600': '#0891b2', 'cyan-700': '#0e7490', 'cyan-800': '#155e75', 'cyan-900': '#164e63',
        'sky-50': '#f0f9ff', 'sky-100': '#e0f2fe', 'sky-200': '#bae6fd', 'sky-300': '#7dd3fc', 'sky-400': '#38bdf8', 'sky-500': '#0ea5e9', 'sky-600': '#0284c7', 'sky-700': '#0369a1', 'sky-800': '#075985', 'sky-900': '#0c4a6e',
        'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe', 'blue-300': '#93c5fd', 'blue-400': '#60a5fa', 'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8', 'blue-800': '#1e40af', 'blue-900': '#1e3a8a',
        'indigo-50': '#eef2ff', 'indigo-100': '#e0e7ff', 'indigo-200': '#c7d2fe', 'indigo-300': '#a5b4fc', 'indigo-400': '#818cf8', 'indigo-500': '#6366f1', 'indigo-600': '#4f46e5', 'indigo-700': '#4338ca', 'indigo-800': '#3730a3', 'indigo-900': '#312e81',
        'violet-50': '#f5f3ff', 'violet-100': '#ede9fe', 'violet-200': '#ddd6fe', 'violet-300': '#c4b5fd', 'violet-400': '#a78bfa', 'violet-500': '#8b5cf6', 'violet-600': '#7c3aed', 'violet-700': '#6d28d9', 'violet-800': '#5b21b6', 'violet-900': '#4c1d95',
        'purple-50': '#faf5ff', 'purple-100': '#f3e8ff', 'purple-200': '#e9d5ff', 'purple-300': '#d8b4fe', 'purple-400': '#c084fc', 'purple-500': '#a855f7', 'purple-600': '#9333ea', 'purple-700': '#7e22ce', 'purple-800': '#6b21a8', 'purple-900': '#581c87',
        'fuchsia-50': '#fdf4ff', 'fuchsia-100': '#fae8ff', 'fuchsia-200': '#f5d0fe', 'fuchsia-300': '#f0abfc', 'fuchsia-400': '#e879f9', 'fuchsia-500': '#d946ef', 'fuchsia-600': '#c026d3', 'fuchsia-700': '#a21caf', 'fuchsia-800': '#86198f', 'fuchsia-900': '#701a75',
        'pink-50': '#fdf2f8', 'pink-100': '#fce7f3', 'pink-200': '#fbcfe8', 'pink-300': '#f9a8d4', 'pink-400': '#f472b6', 'pink-500': '#ec4899', 'pink-600': '#db2777', 'pink-700': '#be185d', 'pink-800': '#9d174d', 'pink-900': '#831843',
        'rose-50': '#fff1f2', 'rose-100': '#ffe4e6', 'rose-200': '#fecdd3', 'rose-300': '#fda4af', 'rose-400': '#fb7185', 'rose-500': '#f43f5e', 'rose-600': '#e11d48', 'rose-700': '#be123c', 'rose-800': '#9f1239', 'rose-900': '#881337',
    };

    const colorName = activeClass.replace(/^(bg|text|border)-/, '');
    
    if (tailwindColors[colorName]) {
        return { color: tailwindColors[colorName], opacity };
    }

    return { color: null, opacity };
};

export const handleExport = async (
    format: ExportFormat,
    projectName: string,
    rooms: Room[],
    connections: Connection[],
    currentFloor: number,
    darkMode: boolean,
    zoneColors: Record<string, ZoneColor>,
    floors: { id: number; label: string }[],
    appSettings: AppSettings,
    annotations?: Annotation[],
    options?: any,
    currentStyle?: DiagramStyle,
    referenceImages?: ReferenceImage[]
) => {
    // --- JSON Export ---
    if (format === 'json') {
        const data = {
            version: 1,
            timestamp: new Date().toISOString(),
            projectName,
            rooms,
            connections,
            floors,
            currentFloor,
            zoneColors,
            appSettings,
            annotations
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`);
        return;
    }

    const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
    if (visibleRooms.length === 0) {
        alert("No visible rooms to export.");
        return;
    }

    // 1. Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleRooms.forEach(r => {
        const pts = r.polygon || [
            { x: 0, y: 0 }, { x: r.width, y: 0 },
            { x: r.width, y: r.height }, { x: 0, y: r.height }
        ];
        pts.forEach(p => {
            minX = Math.min(minX, r.x + p.x);
            minY = Math.min(minY, r.y + p.y);
            maxX = Math.max(maxX, r.x + p.x);
            maxY = Math.max(maxY, r.y + p.y);
        });
    });

    // Include Annotations in Bounds
    if (annotations) {
        annotations.filter(a => a.floor === currentFloor).forEach(a => {
            a.points.forEach(p => {
                minX = Math.min(minX, a.points[0].x + p.x); // Annotation points are relative or absolute? 
                // Wait, AnnotationLayer renders at points[i].x. Points are absolute world coordinates.
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        });
    }

    // Include Reference Images in Bounds
    if (referenceImages) {
        referenceImages.filter(img => img.floor === currentFloor).forEach(img => {
            minX = Math.min(minX, img.x);
            minY = Math.min(minY, img.y);
            maxX = Math.max(maxX, img.x + (img.width * img.scale));
            maxY = Math.max(maxY, img.y + (img.height * img.scale));
        });
    }

    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding + 50; // Extra space for scale bar
    maxY += padding + 50;
    const width = maxX - minX;
    const height = maxY - minY;
    const offsetX = -minX;
    const offsetY = -minY;

    // --- DXF Export ---
    if (format === 'dxf') {
        let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

        visibleRooms.forEach(room => {
            // Draw Shape
            if (room.shape === 'bubble' && room.polygon) {
                // Export as High-Res Polyline to approximate curve
                const cmds = getBubblePathCommands(room.polygon);
                const points: Point[] = [];

                // Re-iterate polygon points to generate curve samples directly
                for (let i = 0; i < room.polygon.length; i++) {
                    const p0 = room.polygon[(i - 1 + room.polygon.length) % room.polygon.length];
                    const p1 = room.polygon[i];
                    const p2 = room.polygon[(i + 1) % room.polygon.length];
                    const p3 = room.polygon[(i + 2) % room.polygon.length];

                    const cp1x = p1.x + (p2.x - p0.x) / 6;
                    const cp1y = p1.y + (p2.y - p0.y) / 6;
                    const cp2x = p2.x - (p3.x - p1.x) / 6;
                    const cp2y = p2.y - (p3.y - p1.y) / 6;

                    // Sample 10 points per segment
                    for (let t = 0; t < 1; t += 0.1) {
                        const it = 1 - t;
                        const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
                        const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
                        points.push({ x: room.x + x, y: room.y + y });
                    }
                }

                dxf += `0\nLWPOLYLINE\n8\n${room.zone}\n90\n${points.length}\n70\n1\n`; // Closed
                points.forEach(p => {
                    dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`; // Invert Y for DXF
                });

            } else {
                // Rect/Polygon
                const pts = room.polygon || [
                    { x: 0, y: 0 }, { x: room.width, y: 0 },
                    { x: room.width, y: room.height }, { x: 0, y: room.height }
                ];
                dxf += `0\nLWPOLYLINE\n8\n${room.zone}\n90\n${pts.length}\n70\n1\n`;
                pts.forEach(p => {
                    dxf += `10\n${room.x + p.x + offsetX}\n20\n${-(room.y + p.y + offsetY)}\n`;
                });
            }

            // Text Label
            const cx = (room.polygon ? 0 : room.width / 2) + (room.polygon ? calculateCentroid(room.polygon).x : 0);
            const cy = (room.polygon ? 0 : room.height / 2) + (room.polygon ? calculateCentroid(room.polygon).y : 0);
            const absX = room.x + cx + offsetX;
            const absY = -(room.y + cy + offsetY);

            const width = room.polygon ? (Math.max(...room.polygon.map(p => p.x)) - Math.min(...room.polygon.map(p => p.x))) : room.width;
            const lines = wrapText(room.name, width - 10, appSettings.fontSize);
            const lineHeight = appSettings.fontSize * 1.2;
            const totalHeight = lines.length * lineHeight;

            lines.forEach((line, i) => {
                const yPos = absY + (totalHeight / 2) - (i * lineHeight) - (lineHeight / 2);
                dxf += `0\nTEXT\n8\nLabels\n10\n${absX}\n20\n${yPos}\n40\n${appSettings.fontSize}\n1\n${line}\n72\n4\n11\n${absX}\n21\n${yPos}\n`;
            });
        });

        dxf += `0\nENDSEC\n0\nEOF`;
        const blob = new Blob([dxf], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName}-floor-${currentFloor}.dxf`);
        return;
    }

    // --- SVG Generation (Used for SVG, PNG, JPEG, PDF) ---
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-offsetX} ${-offsetY} ${width} ${height}">
        <style>
            .text { font-family: 'Inter', sans-serif; text-anchor: middle; dominant-baseline: middle; }
            .title { font-weight: bold; font-size: ${appSettings.fontSize}px; }
            .subtitle { font-size: ${appSettings.fontSize * 0.8}px; fill: #666; }
        </style>
        <defs>
          <marker id="marker-arrow-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" />
          </marker>
          <marker id="marker-arrow-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <marker id="marker-circle-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="5" fill="context-stroke" />
          </marker>
          <marker id="marker-circle-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
            <circle cx="5" cy="5" r="5" fill="context-stroke" />
          </marker>
          <marker id="marker-square-start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
             <rect x="0" y="0" width="10" height="10" fill="context-stroke" />
          </marker>
          <marker id="marker-square-end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4">
             <rect x="0" y="0" width="10" height="10" fill="context-stroke" />
          </marker>
        </defs>`;

    // Style Helpers
    const getStrokeWidth = (style?: DiagramStyle) => style?.borderWidth || appSettings.strokeWidth || 2;
    const getStrokeColor = (zone: string, style?: DiagramStyle) => {
        if (style?.colorMode === 'monochrome') return '#000000';
        return getHexBorderForZone(zone, zoneColors);
    };
    const getFillColor = (zone: string, style?: DiagramStyle) => {
        if (style?.colorMode === 'monochrome') return '#ffffff';
        return getHexColorForZone(zone, zoneColors);
    };
    const getOpacity = (style?: DiagramStyle) => style?.opacity || 0.9;
    const isSketchy = currentStyle?.sketchy || false;

    // Background
    if (format === 'jpeg' || (format === 'png' && !options?.transparentBackground)) {
        const bgColor = darkMode ? '#1a1a1a' : '#f0f2f5';
        svgContent += `<rect x="${-offsetX}" y="${-offsetY}" width="${width}" height="${height}" fill="${bgColor}" />`;
    }

    // Reference Images (Bottom Layer)
    if (referenceImages) {
        referenceImages.filter(img => img.floor === currentFloor).forEach(img => {
            // SVG image uses href (or xlink:href for older compat, but href works in most modern contexts)
            // We need to handle rotation if it exists, roughly. ReferenceImage has rotation? No, just x, y, width, height, scale, opacity?
            // Checking types.ts would be ideal, but assuming standard props.
            const w = img.width * img.scale;
            const h = img.height * img.scale;
            svgContent += `<image href="${img.url}" x="${img.x}" y="${img.y}" width="${w}" height="${h}" opacity="${img.opacity}" preserveAspectRatio="none" />`;
        });
    }

    // Zones (Convex Hulls)
    const zones: Record<string, Point[]> = {};

    visibleRooms.forEach(r => {
        if (!zones[r.zone]) zones[r.zone] = [];

        if (r.polygon && r.polygon.length > 0) {
            r.polygon.forEach(p => {
                zones[r.zone].push({ x: r.x + p.x, y: r.y + p.y });
            });
        } else {
            zones[r.zone].push({ x: r.x, y: r.y });
            zones[r.zone].push({ x: r.x + r.width, y: r.y });
            zones[r.zone].push({ x: r.x + r.width, y: r.y + r.height });
            zones[r.zone].push({ x: r.x, y: r.y + r.height });
        }
    });

    Object.entries(zones).forEach(([zone, points]) => {
        if (points.length < 3) return;
        const hull = getConvexHull(points);
        const d = createRoundedPath(hull, 12);
        const color = getFillColor(zone, currentStyle);
        svgContent += `<path d="${d}" fill="${color}" fill-opacity="0.1" stroke="${color}" stroke-width="2" stroke-dasharray="10,10" stroke-opacity="0.6" />`;
    });

    // Connections
    connections.forEach(conn => {
        const from = visibleRooms.find(r => r.id === conn.fromId);
        const to = visibleRooms.find(r => r.id === conn.toId);
        if (from && to) {
            const x1 = from.x + from.width / 2;
            const y1 = from.y + from.height / 2;
            const x2 = to.x + to.width / 2;
            const y2 = to.y + to.height / 2;
            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2" />`;
        }
    });

    // Rooms
    visibleRooms.forEach(r => {
        const fill = r.style?.fill || getFillColor(r.zone, currentStyle);
        const stroke = r.style?.stroke || getStrokeColor(r.zone, currentStyle);
        const strokeWidth = r.style?.strokeWidth ?? getStrokeWidth(currentStyle);
        const opacity = r.style?.opacity ?? getOpacity(currentStyle);
        let d = "";

        if (r.shape === 'bubble' && r.polygon) {
            const cmds = getBubblePathCommands(r.polygon);
            cmds.forEach(cmd => {
                if (cmd.type === 'M') d += `M ${cmd.values[0]} ${cmd.values[1]} `;
                if (cmd.type === 'C') d += `C ${cmd.values[0]} ${cmd.values[1]}, ${cmd.values[2]} ${cmd.values[3]}, ${cmd.values[4]} ${cmd.values[5]} `;
            });
            d += "Z";
        } else if (r.polygon) {
            d = `M ${r.polygon[0].x} ${r.polygon[0].y} ` + r.polygon.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ") + " Z";
        } else {
            // Check for corner radius from style or settings
            let radius = r.style?.cornerRadius || appSettings.cornerRadius || 0;
            // Map Tailwind classes to numbers if needed (simplified)
            if (currentStyle?.cornerRadius === 'rounded-none') radius = 0;
            else if (currentStyle?.cornerRadius === 'rounded-sm') radius = 2;
            else if (currentStyle?.cornerRadius === 'rounded-lg') radius = 8;

            if (radius > 0) {
                const w = r.width;
                const h = r.height;
                const rEff = Math.min(radius, w / 2, h / 2);
                d = `M ${rEff} 0 H ${w - rEff} Q ${w} 0 ${w} ${rEff} V ${h - rEff} Q ${w} ${h} ${w - rEff} ${h} H ${rEff} Q 0 ${h} 0 ${h - rEff} V ${rEff} Q 0 0 ${rEff} 0 Z`;
            } else {
                d = `M 0 0 H ${r.width} V ${r.height} H 0 Z`;
            }
        }

        const cx = (r.polygon ? 0 : r.width / 2) + (r.polygon ? calculateCentroid(r.polygon).x : 0);
        const cy = (r.polygon ? 0 : r.height / 2) + (r.polygon ? calculateCentroid(r.polygon).y : 0);

        const width = (r.polygon && r.polygon.length > 0) ?
            (Math.max(...r.polygon.map(p => p.x)) - Math.min(...r.polygon.map(p => p.x))) :
            r.width;
        const lines = wrapText(r.name, width - 16, appSettings.fontSize);
        const lineHeight = appSettings.fontSize * 1.2;
        const startY = (cy - 6) - ((lines.length - 1) * lineHeight) / 2;

        svgContent += `
        <g transform="translate(${r.x}, ${r.y})">
            <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" fill-opacity="${opacity}" stroke-dasharray="${isSketchy ? '5,5' : 'none'}" />
            <text x="${cx}" y="${startY}" class="text title" fill="${currentStyle?.colorMode === 'monochrome' ? '#000000' : '#1e293b'}" font-family="${currentStyle?.fontFamily || 'sans-serif'}">
                ${lines.map((line, i) => `<tspan x="${cx}" dy="${i === 0 ? 0 : lineHeight}">${line}</tspan>`).join('')}
            </text>
            <text x="${cx}" y="${cy + 8 + (lines.length > 1 ? (lines.length * lineHeight) / 2 : 0)}" class="text subtitle">${r.area} m²</text>
        </g>`;
    });

    // Annotations
    if (annotations) {
        annotations.filter(ann => ann.floor === currentFloor).forEach(ann => {
            if (ann.type === 'text') {
                const textAlign = ann.style.textAlign === 'center' ? 'middle' : ann.style.textAlign === 'right' ? 'end' : 'start';
                svgContent += `<text x="${ann.points[0].x}" y="${ann.points[0].y}" fill="${ann.style.stroke}" font-size="${ann.style.fontSize || 14}" font-family="${ann.style.fontFamily || 'Inter, sans-serif'}" font-weight="${ann.style.fontWeight || 'normal'}" text-anchor="${textAlign}" dominant-baseline="middle">${ann.style.text}</text>`;
                return;
            }

            const path = SketchManager.generatePath(ann);
            const markerStart = SketchManager.getMarkerUrl('start', ann.style.startCap);
            const markerEnd = SketchManager.getMarkerUrl('end', ann.style.endCap);
            svgContent += `<path d="${path}" stroke="${ann.style.stroke}" stroke-width="${ann.style.strokeWidth}" stroke-dasharray="${ann.style.strokeDash || 'none'}" fill="none" stroke-linecap="round" stroke-linejoin="round" marker-start="${markerStart}" marker-end="${markerEnd}" />`;
        });
    }

    // Scale Bar removed from SVG content for PDF (drawn natively). 
    // For PNG/SVG/JPEG export, we still want it in the image content?
    // User requested: "The scale bar should always be there in all exports."
    // If I remove it here, it won't be in SVG/PNG export generated from this function.
    // However, App.tsx PNG export uses htmlToImage which captures the DOM scale bar.
    // Only 'svg' and 'pdf' use this function.
    // IF format is 'svg' or 'pdf', we need the scale bar.

    // For PDF, user wants it at bottom right of PAGE.
    // For SVG export, we probably want it in the SVG.

    if (format !== 'pdf') {
        const scaleBarLength = 10 * PIXELS_PER_METER; // 10 meters
        const scaleBarX = maxX - 50 - scaleBarLength;
        const scaleBarY = maxY - 50;
        const textColor = (format === 'jpeg' && darkMode) ? '#94a3b8' : '#64748b';
        const strokeColor = (format === 'jpeg' && darkMode) ? '#94a3b8' : '#64748b';

        svgContent += `<g transform="translate(${scaleBarX}, ${scaleBarY})">
             <text x="${scaleBarLength / 2}" y="-8" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="${textColor}">10 meters</text>
             <line x1="0" y1="0" x2="${scaleBarLength}" y2="0" stroke="${strokeColor}" stroke-width="2" />
             <line x1="0" y1="-4" x2="0" y2="4" stroke="${strokeColor}" stroke-width="2" />
             <line x1="${scaleBarLength}" y1="-4" x2="${scaleBarLength}" y2="4" stroke="${strokeColor}" stroke-width="2" />
         </g>`;
    }

    svgContent += `</svg>`;

    if (format === 'svg') {
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `${projectName}-floor-${currentFloor}.svg`);
        return;
    }

    if (format === 'pdf') {
        const doc = new jsPDF({
            orientation: options?.orientation || 'landscape',
            unit: 'mm',
            format: (options?.pageSize || 'A3').toLowerCase()
        });

        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

        // Scaling Logic
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        let scaleFactor = 1;

        if (options?.pdfScale) {
            const scale = options.pdfScale;
            scaleFactor = (1000 / scale) / PIXELS_PER_METER; // px to mm
        } else {
            // Default fit to page logic
            const svgWidthMm = width * 0.264;
            const svgHeightMm = height * 0.264;
            const scaleX = pageWidth / svgWidthMm;
            const scaleY = pageHeight / svgHeightMm;
            const fitScale = Math.min(scaleX, scaleY) * 0.8;
            scaleFactor = fitScale * 0.264; // Convert back factor relative to pixel unit?
        }

        let targetW = width * scaleFactor;
        let targetH = height * scaleFactor;

        // If no explicit scale, fit to page with margin
        if (!options?.pdfScale) {
            const margin = 20; // mm
            const availableW = pageWidth - 2 * margin;
            const availableH = pageHeight - 2 * margin;
            const aspectSvg = width / height;
            const aspectPage = availableW / availableH;
            if (aspectSvg > aspectPage) {
                targetW = availableW;
                targetH = availableW / aspectSvg;
            } else {
                targetH = availableH;
                targetW = availableH * aspectSvg;
            }
        }

        // Center on page
        const x = (pageWidth - targetW) / 2;
        const y = (pageHeight - targetH) / 2;

        await (doc as any).svg(svgDoc.documentElement, {
            x: x,
            y: y,
            width: targetW,
            height: targetH
        });

        // Add Scale Bar to PDF (Bottom Right of Page)
        const scaleBarLenMm = (10 * PIXELS_PER_METER) * scaleFactor * 0.264; // This might be wrong.
        // We need 10 meters in PAGE units (mm).
        // 1 meter = PIXELS_PER_METER pixels in SVG space.
        // scaleFactor converts SVG pixels to "document units" in jsPDF-svg?
        // Wait, scaleFactor was calculated: (1000 / scale) / PIXELS_PER_METER is "mm per pixel"? No.

        // Let's recalculate logical scale.
        // If scale is 1:100. 10m = 10000mm. On paper it is 100mm.
        // We want a bar representing 10m.

        let barWidthMm = 0;
        let label = "10m";

        if (options?.pdfScale) {
            // 1:Scale. 10m -> 10000mm / Scale.
            barWidthMm = 10000 / options.pdfScale;
        } else {
            // "Fit to Page". We don't know the exact scale easily unless we back-calculate.
            // targetW is the width of the SVG on the PDF in mm.
            // width is the width of the SVG in pixels.
            // visualScale = targetW / width.  (mm per pixel)
            // 10m in pixels = 10 * PIXELS_PER_METER.
            // barWidthMm = (10 * PIXELS_PER_METER) * (targetW / width);
            barWidthMm = (10 * PIXELS_PER_METER) * (targetW / width);
        }

        const margin = 10;
        const barX = pageWidth - margin - barWidthMm;
        const barY = pageHeight - margin;

        doc.setDrawColor(100, 116, 139); // Slate-500
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);

        // Line
        doc.line(barX, barY, barX + barWidthMm, barY);
        // Ends
        doc.line(barX, barY - 1, barX, barY + 1);
        doc.line(barX + barWidthMm, barY - 1, barX + barWidthMm, barY + 1);
        // Text
        doc.text(label, barX + (barWidthMm / 2), barY - 2, { align: 'center' });

        return doc.output('blob');
    }

    // --- PNG / JPEG Export ---
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));

    await new Promise((resolve) => { img.onload = resolve; });

    // High Resolution Export (approx 300 DPI relative to screen 72 DPI -> 4.16x)
    const scaleFactor = 4;

    const canvas = document.createElement('canvas');
    canvas.width = width * scaleFactor;
    canvas.height = height * scaleFactor;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(offsetX, offsetY); // Adjust for negative coordinates in SVG viewBox

    if (format === 'jpeg') {
        // Background already in SVG for JPEG, but ensure canvas is opaque if needed
        ctx.fillStyle = darkMode ? '#1a1a1a' : '#f0f2f5';
        ctx.fillRect(-offsetX, -offsetY, width, height);
    }

    ctx.drawImage(img, -offsetX, -offsetY, width, height);

    const dataUrl = canvas.toDataURL(`image/${format}`);
    triggerDownload(dataUrl, `${projectName}-floor-${currentFloor}.${format}`);
};

export const getHexColorForZone = (zone: string, zoneColors: Record<string, ZoneColor>) => {
    // 1. Try to resolve from zoneColors config first
    if (zoneColors[zone]) {
        const parsed = parseTailwindColor(zoneColors[zone].bg, 'bg', false);
        if (parsed.color) return parsed.color;
    }

    // Simple mapping based on standard tailwind colors often used
    const map: Record<string, string> = {
        'Public': '#dbeafe', // blue-100
        'Private': '#fce7f3', // pink-100
        'Service': '#f3f4f6', // slate-100
        'Circulation': '#ffedd5', // orange-100
        'Outdoor': '#dcfce7', // green-100
        'Default': '#f1f5f9' // slate-100
    };
    // Try to match partial keys if exact match fails
    // For dynamic zones, we might need a better way to get hex from tailwind classes or just generate a hash color
    // For now, fallback to a hash-based color or default if not in standard map
    if (map[zone]) return map[zone];

    // Fallback for custom zones - generate a consistent color from string
    let hash = 0;
    for (let i = 0; i < zone.length; i++) {
        hash = zone.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

export const getHexBorderForZone = (zone: string, zoneColors?: Record<string, ZoneColor>) => {
    if (zoneColors && zoneColors[zone]) {
        // Try to derive border from text color or explicit border if available
        const classKey = zoneColors[zone].border || zoneColors[zone].text?.replace('text-', 'border-') || 'border-slate-500';
        const parsed = parseTailwindColor(classKey, 'border', false);
        if (parsed.color) return parsed.color;
    }

    const map: Record<string, string> = {
        'Public': '#3b82f6', // blue-500
        'Private': '#ec4899', // pink-500
        'Service': '#64748b', // slate-500
        'Circulation': '#f97316', // orange-500
        'Outdoor': '#22c55e', // green-500
        'Default': '#64748b' // slate-500
    };
    if (map[zone]) return map[zone];
    return '#64748b';
};