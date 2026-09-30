import { Room } from '../types';
import { polygonArea, bubbleArea, vertexCentroid } from './geometry';
import { PIXELS_PER_METER } from './rooms';
import { recenterShape } from './site';

export type RoomShape = 'rect' | 'polygon' | 'bubble';

/**
 * Converts a space to another shape, keeping it in place and keeping its area:
 * - polygon/bubble → rect: an exact fit when the outline is (nearly) a rectangle, otherwise the
 *   minimum-area oriented bounding box, scaled to the outline's area
 * - rect → polygon/bubble: its four corners, with the origin (rotation pivot) at the centre;
 *   a bubble is scaled until its curve encloses the space's area
 */
export const convertRoomShape = (r: Room, shape: RoomShape): Room => {
    if ((r.shape || 'rect') === shape) return r;
    const newRoom: Room = { ...r, shape, style: r.style && Object.keys(r.style).length > 0 ? { ...r.style } : undefined };

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
            const polyAreaPx = (r.shape === 'bubble') ? bubbleArea(points) : polygonArea(points);

            // Check if they form a rectangle/square
            let isRect = false;
            let W = 0, H = 0, rx = 0, ry = 0, rotDeg = 0;

            // A bubble's outline is the curve, not its four points, so it always takes the area-matched fit below
            if (absPoints.length === 4 && r.shape !== 'bubble') {
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
                const centroid = vertexCentroid(absPoints);
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
            const centroid = vertexCentroid(points);
            const scale = 0.9;
            points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * scale, y: centroid.y + (p.y - centroid.y) * scale }));
            for (let i = 0; i < 10; i++) {
                const currentArea = bubbleArea(points);
                if (currentArea === 0 || Math.abs(currentArea - targetAreaPx) < 10) break;
                const correction = Math.sqrt(targetAreaPx / currentArea);
                points = points.map(p => ({ x: centroid.x + (p.x - centroid.x) * correction, y: centroid.y + (p.y - centroid.y) * correction }));
            }
        }
        newRoom.polygon = points;
    }
    // Polygon ↔ bubble moves the centre of gravity slightly: keep the rotation pivot on it
    return shape === 'rect' ? newRoom : recenterShape(newRoom);
};
