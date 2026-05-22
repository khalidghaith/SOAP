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
 * Generates a high-fidelity, multi-layered DXF string.
 */
export const generateDXF = (
  projectName: string,
  rooms: Room[],
  annotations: Annotation[] = [],
  currentFloor: number,
  offsetX: number = 0,
  offsetY: number = 0
): string => {
  const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
  const visibleAnnotations = annotations.filter(a => a.floor === currentFloor);

  // DXF structure header and tables
  let dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
0
LTYPE
2
CONTINUOUS
70
64
3
Solid line
72
65
73
0
40
0.0
0
ENDTAB
0
TABLE
2
LAYER
70
4
0
LAYER
2
A-WALLS
70
0
62
7
6
CONTINUOUS
0
LAYER
2
A-ZONES
70
0
62
8
6
CONTINUOUS
0
LAYER
2
A-LABELS
70
0
62
7
6
CONTINUOUS
0
LAYER
2
A-ANNO
70
0
62
1
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // 1. Export A-ZONES layer (Convex Hulls for zones)
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

      dxf += `0\nLWPOLYLINE\n8\nA-ZONES\n62\n${aciColor}\n90\n${hull.length}\n70\n1\n`;
      hull.forEach(p => {
        dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`;
      });
    } catch (e) {
      console.warn("Could not calculate convex hull for zone " + zoneName, e);
    }
  });

  // 2. Export A-WALLS (Room boundaries) and A-LABELS (Text)
  visibleRooms.forEach(room => {
    const color = getDxfColorForZone(room.zone);

    // Draw Boundary Polyline on A-WALLS
    if (room.shape === 'bubble' && room.polygon) {
      const sampled = sampleBubblePoints(room.polygon, room.x, room.y);
      if (sampled.length > 0) {
        dxf += `0\nLWPOLYLINE\n8\nA-WALLS\n62\n${color}\n90\n${sampled.length}\n70\n1\n`;
        sampled.forEach(p => {
          dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`;
        });
      }
    } else {
      const pts = room.polygon || [
        { x: 0, y: 0 },
        { x: room.width, y: 0 },
        { x: room.width, y: room.height },
        { x: 0, y: room.height }
      ];
      dxf += `0\nLWPOLYLINE\n8\nA-WALLS\n62\n${color}\n90\n${pts.length}\n70\n1\n`;
      pts.forEach(p => {
        dxf += `10\n${room.x + p.x + offsetX}\n20\n${-(room.y + p.y + offsetY)}\n`;
      });
    }

    // Draw Labels on A-LABELS
    const cx = (room.polygon ? 0 : room.width / 2) + (room.polygon ? calculateCentroid(room.polygon).x : 0);
    const cy = (room.polygon ? 0 : room.height / 2) + (room.polygon ? calculateCentroid(room.polygon).y : 0);
    const absX = room.x + cx + offsetX;
    const absY = -(room.y + cy + offsetY);

    // Main Space Name Label
    dxf += `0\nTEXT\n8\nA-LABELS\n62\n7\n10\n${absX}\n20\n${absY + 3}\n40\n2.5\n1\n${room.name}\n72\n4\n11\n${absX}\n21\n${absY + 3}\n`;
    
    // Area Label
    dxf += `0\nTEXT\n8\nA-LABELS\n62\n9\n10\n${absX}\n20\n${absY - 3}\n40\n1.8\n1\n${room.area.toFixed(1)} m2\n72\n4\n11\n${absX}\n21\n${absY - 3}\n`;
  });

  // 3. Export A-ANNO (Canvas Annotations & Sketch Drafting)
  visibleAnnotations.forEach(ann => {
    const color = 1; // Default to Red for annotations

    if (ann.type === 'text' && ann.style.text) {
      const p = ann.points[0];
      const size = ann.style.fontSize ? ann.style.fontSize / 4 : 2.0; // scale standard px font sizes to DXF units
      dxf += `0\nTEXT\n8\nA-ANNO\n62\n${color}\n10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n40\n${size}\n1\n${ann.style.text}\n72\n4\n11\n${p.x + offsetX}\n21\n${-(p.y + offsetY)}\n`;
    } 
    else if ((ann.type === 'line' || ann.type === 'arrow') && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      dxf += `0\nLINE\n8\nA-ANNO\n62\n${color}\n10\n${p1.x + offsetX}\n20\n${-(p1.y + offsetY)}\n11\n${p2.x + offsetX}\n21\n${-(p2.y + offsetY)}\n`;
      
      // If arrow, draw a simple visual arrowhead represented by two small line segments
      if (ann.type === 'arrow') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const uX = dx / len;
          const uY = dy / len;
          const arrowSize = 12; // pixels / units

          // Arrow head points
          const headX = p2.x + offsetX;
          const headY = -(p2.y + offsetY);
          
          const angle = Math.atan2(-dy, dx);
          const leftAngle = angle + Math.PI * 0.85;
          const rightAngle = angle - Math.PI * 0.85;

          const lX = headX + arrowSize * Math.cos(leftAngle);
          const lY = headY + arrowSize * Math.sin(leftAngle);
          const rX = headX + arrowSize * Math.cos(rightAngle);
          const rY = headY + arrowSize * Math.sin(rightAngle);

          dxf += `0\nLINE\n8\nA-ANNO\n62\n${color}\n10\n${headX}\n20\n${headY}\n11\n${lX}\n21\n${lY}\n`;
          dxf += `0\nLINE\n8\nA-ANNO\n62\n${color}\n10\n${headX}\n20\n${headY}\n11\n${rX}\n21\n${rY}\n`;
        }
      }
    } 
    else if (ann.type === 'circle' && ann.points.length >= 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      dxf += `0\nCIRCLE\n8\nA-ANNO\n62\n${color}\n10\n${p1.x + offsetX}\n20\n${-(p1.y + offsetY)}\n40\n${radius}\n`;
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
      dxf += `0\nLWPOLYLINE\n8\nA-ANNO\n62\n${color}\n90\n4\n70\n1\n`;
      pts.forEach(p => {
        dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`;
      });
    } 
    else if (ann.points.length > 1) {
      // polyline, bezier, arc, etc. fallback to polyline
      dxf += `0\nLWPOLYLINE\n8\nA-ANNO\n62\n${color}\n90\n${ann.points.length}\n70\n0\n`;
      ann.points.forEach(p => {
        dxf += `10\n${p.x + offsetX}\n20\n${-(p.y + offsetY)}\n`;
      });
    }
  });

  dxf += `0\nENDSEC\n0\nEOF`;
  return dxf;
};

/**
 * Triggers a browser download of the DXF drawing file.
 */
export const downloadDXF = (
  projectName: string,
  rooms: Room[],
  annotations: Annotation[] = [],
  currentFloor: number
) => {
  // Center drawing mathematically or default coordinate bounds
  let minX = Infinity, minY = Infinity;
  const visibleRooms = rooms.filter(r => r.isPlaced && r.floor === currentFloor);
  
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

  const dxfContent = generateDXF(projectName, rooms, annotations, currentFloor, offsetX, offsetY);
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-floor-${currentFloor}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};