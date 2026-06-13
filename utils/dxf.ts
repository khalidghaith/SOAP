import { Room, Annotation, Point } from '../types';
import { getConvexHull } from './geometry';

/**
 * Maps zone categories to standard AutoCAD ACI Color Codes.
 */
const getDxfColorForZone = (zone: string): number => {
  switch (zone) {
    case 'Circulation': return 2; // Yellow
    case 'Outdoor': return 3;     // Green
    case 'Admin': return 4;       // Cyan
    case 'Public': return 5;      // Blue
    case 'Private': return 6;     // Magenta
    case 'Service': return 8;     // Gray
    default: return 7;            // White/Black
  }
};

/**
 * Calculates the geometric centroid of a set of 2D points.
 */
const calculateCentroid = (points: Point[]): Point => {
  let x = 0, y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
};

/**
 * Generates smooth Catmull-Rom to Cubic Bezier curve samples for bubble shapes.
 */
const sampleBubblePoints = (polygon: Point[], roomX: number, roomY: number): Point[] => {
  const points: Point[] = [];
  if (polygon.length < 3) return points;

  for (let i = 0; i < polygon.length; i++) {
    const p0 = polygon[(i - 1 + polygon.length) % polygon.length];
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const p3 = polygon[(i + 2) % polygon.length];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    // Sample 12 points per curved segment for high resolution
    for (let t = 0; t < 1; t += 0.08) {
      const it = 1 - t;
      const x = it * it * it * p1.x + 3 * it * it * t * cp1x + 3 * it * t * t * cp2x + t * t * t * p2.x;
      const y = it * it * it * p1.y + 3 * it * it * t * cp1y + 3 * it * t * t * cp2y + t * t * t * p2.y;
      points.push({ x: roomX + x, y: roomY + y });
    }
  }
  return points;
};

/**
 * Formats values to standard decimal float representation for DXF coordinates/measures.
 */
const formatVal = (code: number, val: any): string => {
  if (typeof val === 'number') {
    const floatCodes = [
      10, 20, 30, 11, 21, 31, 12, 22, 32, 13, 23, 33,
      38, 39, 40, 41, 42, 43, 44, 45, 50, 51
    ];
    if (floatCodes.includes(code)) {
      return val.toFixed(6);
    }
    return val.toString();
  }
  return val.toString();
};

/**
 * Formats a DXF group code and value line.
 * Group codes are right-aligned to a 3-character field (with leading space padding)
 * and all lines must end with Windows-style CRLF (\r\n) for AutoCAD compatibility.
 */
const formatLine = (code: number, value: any): string => {
  const codeStr = code.toString().padStart(3, ' ');
  return `${codeStr}\r\n${formatVal(code, value)}\r\n`;
};

/**
 * Generates a high-fidelity, multi-layered DXF string.
 */
export const generateDXF = (
  projectName: string,
  rooms: Room[],
  annotations: Annotation[] = [],
  currentFloor: number,
  offsetX: number = 0,
  offsetY: number = 0,
  unitSystem?: 'metric' | 'imperial',
  layerPrefix?: string,
  exportGrid?: boolean
): string => {
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
  const visibleAnnotations = annotations.filter(a => a.floor === currentFloor);

  // Setup dynamic Layer names
  const prefix = layerPrefix || '';
  const lWalls = `${prefix}WALLS`;
  const lZones = `${prefix}ZONES`;
  const lLabels = `${prefix}LABELS`;
  const lAnno = `${prefix}ANNO`;
  const lGrid = `${prefix}GRID`;

  let dxf = "";

  // 1. HEADER SECTION
  dxf += formatLine(0, 'SECTION');
  dxf += formatLine(2, 'HEADER');
  dxf += formatLine(9, '$ACADVER');
  dxf += formatLine(1, 'AC1015'); // AutoCAD 2000 compatibility
  dxf += formatLine(0, 'ENDSEC');

  // 2. TABLES SECTION
  dxf += formatLine(0, 'SECTION');
  dxf += formatLine(2, 'TABLES');

  // LTYPE Table
  dxf += formatLine(0, 'TABLE');
  dxf += formatLine(2, 'LTYPE');
  dxf += formatLine(70, 1);
  dxf += formatLine(0, 'LTYPE');
  dxf += formatLine(2, 'CONTINUOUS');
  dxf += formatLine(70, 0);
  dxf += formatLine(3, 'Solid line');
  dxf += formatLine(72, 65);
  dxf += formatLine(73, 0);
  dxf += formatLine(40, 0.0);
  dxf += formatLine(0, 'ENDTAB');

  // LAYER Table
  dxf += formatLine(0, 'TABLE');
  dxf += formatLine(2, 'LAYER');
  dxf += formatLine(70, 5); // Number of layers

  const layers = [
    { name: lWalls, color: 7 },
    { name: lZones, color: 8 },
    { name: lLabels, color: 7 },
    { name: lAnno, color: 1 },
    { name: lGrid, color: 9 }
  ];

  layers.forEach(l => {
    dxf += formatLine(0, 'LAYER');
    dxf += formatLine(2, l.name);
    dxf += formatLine(70, 0);
    dxf += formatLine(62, l.color);
    dxf += formatLine(6, 'CONTINUOUS');
  });

  dxf += formatLine(0, 'ENDTAB');
  dxf += formatLine(0, 'ENDSEC');

  // 3. ENTITIES SECTION
  dxf += formatLine(0, 'SECTION');
  dxf += formatLine(2, 'ENTITIES');

  // A. Export Grid layer if enabled
  if (exportGrid !== false && visibleRooms.length > 0) {
    const gridGap = 20; // 1 meter = 20px
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;

    visibleRooms.forEach(r => {
      gMinX = Math.min(gMinX, r.x);
      gMinY = Math.min(gMinY, r.y);
      gMaxX = Math.max(gMaxX, r.x + r.width);
      gMaxY = Math.max(gMaxY, r.y + r.height);
    });

    const pad = 100;
    gMinX = Math.floor((gMinX - pad) / gridGap) * gridGap;
    gMinY = Math.floor((gMinY - pad) / gridGap) * gridGap;
    gMaxX = Math.ceil((gMaxX + pad) / gridGap) * gridGap;
    gMaxY = Math.ceil((gMaxY + pad) / gridGap) * gridGap;

    for (let gx = gMinX; gx <= gMaxX; gx += gridGap) {
      dxf += formatLine(0, 'LINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lGrid);
      dxf += formatLine(62, 9);
      dxf += formatLine(100, 'AcDbLine');
      dxf += formatLine(10, gx + offsetX);
      dxf += formatLine(20, -(gMinY + offsetY));
      dxf += formatLine(30, 0.0);
      dxf += formatLine(11, gx + offsetX);
      dxf += formatLine(21, -(gMaxY + offsetY));
      dxf += formatLine(31, 0.0);
    }
    for (let gy = gMinY; gy <= gMaxY; gy += gridGap) {
      dxf += formatLine(0, 'LINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lGrid);
      dxf += formatLine(62, 9);
      dxf += formatLine(100, 'AcDbLine');
      dxf += formatLine(10, gMinX + offsetX);
      dxf += formatLine(20, -(gy + offsetY));
      dxf += formatLine(30, 0.0);
      dxf += formatLine(11, gMaxX + offsetX);
      dxf += formatLine(21, -(gy + offsetY));
      dxf += formatLine(31, 0.0);
    }
  }

  // B. Export Zones layer (Convex Hulls for zones)
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

  Object.entries(zones).forEach(([zoneName, points]) => {
    if (points.length < 3) return;
    try {
      const hull = getConvexHull(points);
      const aciColor = getDxfColorForZone(zoneName);

      dxf += formatLine(0, 'LWPOLYLINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lZones);
      dxf += formatLine(62, aciColor);
      dxf += formatLine(100, 'AcDbPolyline');
      dxf += formatLine(90, hull.length);
      dxf += formatLine(70, 1); // Closed polyline
      hull.forEach(p => {
        dxf += formatLine(10, p.x + offsetX);
        dxf += formatLine(20, -(p.y + offsetY));
      });
    } catch (e) {
      console.warn("Could not calculate convex hull for zone " + zoneName, e);
    }
  });

  // C. Export Walls (Room boundaries) and Labels (Text)
  visibleRooms.forEach(room => {
    const color = getDxfColorForZone(room.zone);

    // Draw Boundary Polyline on lWalls
    if (room.shape === 'bubble' && room.polygon) {
      const sampled = sampleBubblePoints(room.polygon, room.x, room.y);
      if (sampled.length > 0) {
        dxf += formatLine(0, 'LWPOLYLINE');
        dxf += formatLine(100, 'AcDbEntity');
        dxf += formatLine(8, lWalls);
        dxf += formatLine(62, color);
        dxf += formatLine(100, 'AcDbPolyline');
        dxf += formatLine(90, sampled.length);
        dxf += formatLine(70, 1); // Closed polyline
        sampled.forEach(p => {
          dxf += formatLine(10, p.x + offsetX);
          dxf += formatLine(20, -(p.y + offsetY));
        });
      }
    } else {
      const pts = room.polygon || [
        { x: 0, y: 0 },
        { x: room.width, y: 0 },
        { x: room.width, y: room.height },
        { x: 0, y: room.height }
      ];
      dxf += formatLine(0, 'LWPOLYLINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lWalls);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbPolyline');
      dxf += formatLine(90, pts.length);
      dxf += formatLine(70, 1); // Closed polyline
      pts.forEach(p => {
        dxf += formatLine(10, room.x + p.x + offsetX);
        dxf += formatLine(20, -(room.y + p.y + offsetY));
      });
    }

    // Draw Labels on lLabels
    const cx = (room.polygon ? 0 : room.width / 2) + (room.polygon ? calculateCentroid(room.polygon).x : 0);
    const cy = (room.polygon ? 0 : room.height / 2) + (room.polygon ? calculateCentroid(room.polygon).y : 0);
    const absX = room.x + cx + offsetX;
    const absY = -(room.y + cy + offsetY);

    // Main Space Name Label
    dxf += formatLine(0, 'TEXT');
    dxf += formatLine(100, 'AcDbEntity');
    dxf += formatLine(8, lLabels);
    dxf += formatLine(62, 7);
    dxf += formatLine(100, 'AcDbText');
    dxf += formatLine(10, absX);
    dxf += formatLine(20, absY + 3);
    dxf += formatLine(30, 0.0);
    dxf += formatLine(40, 2.5);
    dxf += formatLine(1, room.name);
    dxf += formatLine(72, 4); // Middle center
    dxf += formatLine(11, absX);
    dxf += formatLine(21, absY + 3);
    dxf += formatLine(31, 0.0);
    dxf += formatLine(100, 'AcDbText');

    // Dynamic Area Label (Metric/Imperial)
    const areaText = unitSystem === 'imperial'
      ? `${(room.area * 10.7639).toFixed(1)} sq ft`
      : `${room.area.toFixed(1)} m2`;

    dxf += formatLine(0, 'TEXT');
    dxf += formatLine(100, 'AcDbEntity');
    dxf += formatLine(8, lLabels);
    dxf += formatLine(62, 9);
    dxf += formatLine(100, 'AcDbText');
    dxf += formatLine(10, absX);
    dxf += formatLine(20, absY - 3);
    dxf += formatLine(30, 0.0);
    dxf += formatLine(40, 1.8);
    dxf += formatLine(1, areaText);
    dxf += formatLine(72, 4); // Middle center
    dxf += formatLine(11, absX);
    dxf += formatLine(21, absY - 3);
    dxf += formatLine(31, 0.0);
    dxf += formatLine(100, 'AcDbText');
  });

  // D. Export Annotations (Canvas Annotations & Sketch Drafting)
  visibleAnnotations.forEach(ann => {
    const color = 1; // Default to Red for annotations

    if (ann.type === 'text' && ann.style.text) {
      const p = ann.points[0];
      const size = ann.style.fontSize ? ann.style.fontSize / 4 : 2.0;

      dxf += formatLine(0, 'TEXT');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lAnno);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbText');
      dxf += formatLine(10, p.x + offsetX);
      dxf += formatLine(20, -(p.y + offsetY));
      dxf += formatLine(30, 0.0);
      dxf += formatLine(40, size);
      dxf += formatLine(1, ann.style.text);
      dxf += formatLine(72, 4); // Middle center
      dxf += formatLine(11, p.x + offsetX);
      dxf += formatLine(21, -(p.y + offsetY));
      dxf += formatLine(31, 0.0);
      dxf += formatLine(100, 'AcDbText');
    }
    else if ((ann.type === 'line' || ann.type === 'arrow') && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];

      dxf += formatLine(0, 'LINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lAnno);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbLine');
      dxf += formatLine(10, p1.x + offsetX);
      dxf += formatLine(20, -(p1.y + offsetY));
      dxf += formatLine(30, 0.0);
      dxf += formatLine(11, p2.x + offsetX);
      dxf += formatLine(21, -(p2.y + offsetY));
      dxf += formatLine(31, 0.0);

      // If arrow, draw a simple visual arrowhead represented by two small line segments
      if (ann.type === 'arrow') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const uX = dx / len;
          const uY = dy / len;
          const arrowSize = 12;

          const headX = p2.x + offsetX;
          const headY = -(p2.y + offsetY);

          const angle = Math.atan2(-dy, dx);
          const leftAngle = angle + Math.PI * 0.85;
          const rightAngle = angle - Math.PI * 0.85;

          const lX = headX + arrowSize * Math.cos(leftAngle);
          const lY = headY + arrowSize * Math.sin(leftAngle);
          const rX = headX + arrowSize * Math.cos(rightAngle);
          const rY = headY + arrowSize * Math.sin(rightAngle);

          dxf += formatLine(0, 'LINE');
          dxf += formatLine(100, 'AcDbEntity');
          dxf += formatLine(8, lAnno);
          dxf += formatLine(62, color);
          dxf += formatLine(100, 'AcDbLine');
          dxf += formatLine(10, headX);
          dxf += formatLine(20, headY);
          dxf += formatLine(30, 0.0);
          dxf += formatLine(11, lX);
          dxf += formatLine(21, lY);
          dxf += formatLine(31, 0.0);

          dxf += formatLine(0, 'LINE');
          dxf += formatLine(100, 'AcDbEntity');
          dxf += formatLine(8, lAnno);
          dxf += formatLine(62, color);
          dxf += formatLine(100, 'AcDbLine');
          dxf += formatLine(10, headX);
          dxf += formatLine(20, headY);
          dxf += formatLine(30, 0.0);
          dxf += formatLine(11, rX);
          dxf += formatLine(21, rY);
          dxf += formatLine(31, 0.0);
        }
      }
    }
    else if (ann.type === 'circle' && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      dxf += formatLine(0, 'CIRCLE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lAnno);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbCircle');
      dxf += formatLine(10, p1.x + offsetX);
      dxf += formatLine(20, -(p1.y + offsetY));
      dxf += formatLine(30, 0.0);
      dxf += formatLine(40, radius);
    }
    else if (ann.type === 'rect' && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      const pts = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p1.y },
        { x: p2.x, y: p2.y },
        { x: p1.x, y: p2.y }
      ];

      dxf += formatLine(0, 'LWPOLYLINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lAnno);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbPolyline');
      dxf += formatLine(90, 4);
      dxf += formatLine(70, 1); // Closed polyline
      pts.forEach(p => {
        dxf += formatLine(10, p.x + offsetX);
        dxf += formatLine(20, -(p.y + offsetY));
      });
    }
    else if (ann.points.length > 1) {
      dxf += formatLine(0, 'LWPOLYLINE');
      dxf += formatLine(100, 'AcDbEntity');
      dxf += formatLine(8, lAnno);
      dxf += formatLine(62, color);
      dxf += formatLine(100, 'AcDbPolyline');
      dxf += formatLine(90, ann.points.length);
      dxf += formatLine(70, 0); // Open polyline
      ann.points.forEach(p => {
        dxf += formatLine(10, p.x + offsetX);
        dxf += formatLine(20, -(p.y + offsetY));
      });
    }
  });

  dxf += formatLine(0, 'ENDSEC');
  dxf += formatLine(0, 'EOF');

  return dxf;
};

/**
 * Triggers a browser download of the DXF drawing file.
 */
export const downloadDXF = (
  projectName: string,
  rooms: Room[],
  annotations: Annotation[] = [],
  currentFloor: number,
  unitSystem?: 'metric' | 'imperial',
  layerPrefix?: string,
  exportGrid?: boolean
) => {
  let minX = Infinity, minY = Infinity;
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

  if (visibleRooms.length > 0) {
    visibleRooms.forEach(r => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
    });
  } else {
    minX = 0;
    minY = 0;
  }

  const offsetX = -minX + 50;
  const offsetY = -minY + 50;

  const dxfContent = generateDXF(
    projectName,
    rooms,
    annotations,
    currentFloor,
    offsetX,
    offsetY,
    unitSystem,
    layerPrefix,
    exportGrid
  );

  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-floor-${currentFloor}.dxf`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};