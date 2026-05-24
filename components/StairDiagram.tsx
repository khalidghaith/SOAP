import React, { useMemo } from 'react';
import { StairCalcResult } from '../utils/stairCalculator';
import { StairConfig } from '../types';

interface StairDiagramProps {
  result: StairCalcResult;
  config: StairConfig;
  darkMode?: boolean;
}

/**
 * SVG stair section diagram that shows flights, landings, and dimension annotations.
 * Renders dynamically based on stair calculation results.
 */
export const StairDiagram: React.FC<StairDiagramProps> = ({ result, config, darkMode }) => {
  const diagram = useMemo(() => {
    if (result.numRisers === 0) return null;

    const padding = 24;
    const svgWidth = 260;
    const svgHeight = 160;

    const drawW = svgWidth - padding * 2;
    const drawH = svgHeight - padding * 2;

    const strokeColor = darkMode ? '#94a3b8' : '#64748b';
    const fillColor = darkMode ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.1)';
    const dimColor = darkMode ? '#cbd5e1' : '#475569';
    const accentColor = '#f97316';
    const landingFill = darkMode ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.1)';

    if (config === 'spiral') {
      return renderSpiral(svgWidth, svgHeight, result, strokeColor, fillColor, dimColor, accentColor, darkMode);
    }

    // For straight, L-shaped, U-shaped: render side elevation (section view)
    const totalRun = result.totalRunLength || 1;
    const totalRise = result.totalRise || 1;

    // Scale to fit
    const scaleX = drawW / totalRun;
    const scaleY = drawH / totalRise;
    const scale = Math.min(scaleX, scaleY) * 0.85;

    const originX = padding + (drawW - totalRun * scale) / 2;
    const originY = svgHeight - padding;

    const paths: React.ReactElement[] = [];
    let pathKey = 0;
    let currentX = originX;
    let currentY = originY;

    // Draw stair profile
    const stairPoints: string[] = [`${currentX},${currentY}`];

    for (let fIdx = 0; fIdx < result.flights.length; fIdx++) {
      const flight = result.flights[fIdx];

      // Draw each step in this flight
      for (let i = 0; i < flight.risers; i++) {
        // Rise (vertical line)
        currentY -= result.actualRiserHeight * scale;
        stairPoints.push(`${currentX},${currentY}`);

        // Tread (horizontal line) — except for the last riser if it meets a landing
        if (i < flight.treads) {
          currentX += result.flights[0].flightLength / Math.max(flight.treads, 1) * scale / (result.flights[0].flightLength / (flight.treads * (result.flights[0].flightLength / flight.treads))) * (flight.flightLength / flight.treads) * scale / (flight.flightLength / flight.treads * scale) ;
          // Simpler: just tread depth
          const treadW = (flight.flightLength / Math.max(flight.treads, 1)) * scale;
          currentX = originX + stairPoints.length * 0; // Reset - let's simplify
        }
      }
    }

    // Simplified approach: draw the stair outline as a clean diagonal with step notches
    const elements: React.ReactElement[] = [];
    let cx = originX;
    let cy = originY;

    // Stair profile path
    let profilePath = `M ${cx} ${cy}`;

    for (let fIdx = 0; fIdx < result.flights.length; fIdx++) {
      const flight = result.flights[fIdx];
      const rH = result.actualRiserHeight * scale;
      const tW = (flight.flightLength / Math.max(flight.treads, 1)) * scale;

      for (let i = 0; i < flight.risers; i++) {
        // Riser (go up)
        cy -= rH;
        profilePath += ` L ${cx} ${cy}`;

        // Tread (go right)
        if (i < flight.treads) {
          cx += tW;
          profilePath += ` L ${cx} ${cy}`;
        }
      }

      // Landing between flights
      if (fIdx < result.flights.length - 1 && result.numLandings > 0) {
        const landW = result.landingDepth * scale;
        cx += landW;
        profilePath += ` L ${cx} ${cy}`;

        // Landing shading
        elements.push(
          <rect
            key={`landing-${fIdx}`}
            x={cx - landW}
            y={cy}
            width={landW}
            height={4}
            fill={landingFill}
            stroke={strokeColor}
            strokeWidth={0.5}
            strokeDasharray="3,2"
          />
        );
      }
    }

    // Soffit line (bottom of stair — diagonal from start to end)
    const endX = cx;
    const endY = cy;
    const soffitPath = `M ${originX} ${originY} L ${endX} ${endY}`;

    // Fill the stair profile
    const fillPath = profilePath + ` L ${endX} ${originY} Z`;

    // UP arrow
    const arrowMidX = (originX + endX) / 2;
    const arrowMidY = (originY + endY) / 2;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ maxHeight: '140px' }}
      >
        {/* Grid background */}
        <defs>
          <pattern id="stairGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d={`M 10 0 L 0 0 0 10`} fill="none" stroke={darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'} strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width={svgWidth} height={svgHeight} fill="url(#stairGrid)" />

        {/* Floor lines */}
        <line x1={originX - 8} y1={originY} x2={endX + 20} y2={originY} stroke={strokeColor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}/>
        <line x1={originX - 8} y1={endY} x2={endX + 20} y2={endY} stroke={strokeColor} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5}/>

        {/* Stair fill */}
        <path d={fillPath} fill={fillColor} />

        {/* Soffit line */}
        <path d={soffitPath} fill="none" stroke={strokeColor} strokeWidth={1} strokeDasharray="6,3" opacity={0.4}/>

        {/* Stair profile */}
        <path d={profilePath} fill="none" stroke={accentColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>

        {/* Landings */}
        {elements}

        {/* UP arrow */}
        <g transform={`translate(${arrowMidX}, ${arrowMidY}) rotate(-${Math.atan2(originY - endY, endX - originX) * 180 / Math.PI})`}>
          <line x1={-12} y1={0} x2={12} y2={0} stroke={accentColor} strokeWidth={1.5}/>
          <polygon points="12,0 6,-4 6,4" fill={accentColor}/>
          <text x={0} y={-8} textAnchor="middle" fill={accentColor} fontSize="8" fontWeight="bold">UP</text>
        </g>

        {/* Dimension: Total Rise (right side) */}
        <line x1={endX + 12} y1={originY} x2={endX + 12} y2={endY} stroke={dimColor} strokeWidth={0.8}/>
        <line x1={endX + 8} y1={originY} x2={endX + 16} y2={originY} stroke={dimColor} strokeWidth={0.8}/>
        <line x1={endX + 8} y1={endY} x2={endX + 16} y2={endY} stroke={dimColor} strokeWidth={0.8}/>
        <text x={endX + 14} y={(originY + endY) / 2 + 3} textAnchor="start" fill={dimColor} fontSize="7" fontWeight="bold">
          {result.totalRise.toFixed(1)}m
        </text>

        {/* Dimension: Total Run (bottom) */}
        <line x1={originX} y1={originY + 8} x2={endX} y2={originY + 8} stroke={dimColor} strokeWidth={0.8}/>
        <line x1={originX} y1={originY + 4} x2={originX} y2={originY + 12} stroke={dimColor} strokeWidth={0.8}/>
        <line x1={endX} y1={originY + 4} x2={endX} y2={originY + 12} stroke={dimColor} strokeWidth={0.8}/>
        <text x={(originX + endX) / 2} y={originY + 16} textAnchor="middle" fill={dimColor} fontSize="7" fontWeight="bold">
          {result.totalRunLength.toFixed(2)}m
        </text>
      </svg>
    );
  }, [result, config, darkMode]);

  if (!diagram) {
    return (
      <div className="text-center text-xs text-slate-400 py-4 italic">
        No stair data to display.
      </div>
    );
  }

  return (
    <div className="bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-dark-border overflow-hidden">
      {diagram}
    </div>
  );
};

function renderSpiral(
  svgWidth: number,
  svgHeight: number,
  result: StairCalcResult,
  strokeColor: string,
  fillColor: string,
  dimColor: string,
  accentColor: string,
  darkMode?: boolean
): React.ReactElement {
  // Render spiral stair as a plan view (top-down)
  const cx = svgWidth / 2;
  const cy = svgHeight / 2;
  const outerR = Math.min(svgWidth, svgHeight) * 0.35;
  const innerR = outerR * 0.2;
  const totalAngle = (result.spiralAngle || 360) * Math.PI / 180;
  const treads = result.numTreads || 1;

  const elements: React.ReactElement[] = [];

  // Outer circle
  elements.push(
    <circle key="outer" cx={cx} cy={cy} r={outerR} fill={fillColor} stroke={accentColor} strokeWidth={1.5} />
  );

  // Inner circle (center pole)
  elements.push(
    <circle key="inner" cx={cx} cy={cy} r={innerR} fill={darkMode ? '#1e293b' : '#e2e8f0'} stroke={strokeColor} strokeWidth={1} />
  );

  // Draw tread lines
  const startAngle = -Math.PI / 2; // Start from top
  for (let i = 0; i <= treads; i++) {
    const angle = startAngle + (totalAngle * i / treads);
    const x1 = cx + innerR * Math.cos(angle);
    const y1 = cy + innerR * Math.sin(angle);
    const x2 = cx + outerR * Math.cos(angle);
    const y2 = cy + outerR * Math.sin(angle);

    elements.push(
      <line key={`tread-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={0.7} opacity={0.6} />
    );
  }

  // UP arrow along the arc
  const midAngle = startAngle + totalAngle / 2;
  const arrowR = (outerR + innerR) / 2;
  const arrowX = cx + arrowR * Math.cos(midAngle);
  const arrowY = cy + arrowR * Math.sin(midAngle);

  elements.push(
    <text key="up-label" x={arrowX} y={arrowY} textAnchor="middle" dominantBaseline="middle" fill={accentColor} fontSize="9" fontWeight="bold">
      UP ↻
    </text>
  );

  // Dimension label
  elements.push(
    <text key="dim-r" x={cx} y={cy + outerR + 14} textAnchor="middle" fill={dimColor} fontSize="7" fontWeight="bold">
      R={result.spiralRadius?.toFixed(2)}m · {result.spiralAngle?.toFixed(0)}°
    </text>
  );

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" style={{ maxHeight: '140px' }}>
      <defs>
        <pattern id="spiralGrid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d={`M 10 0 L 0 0 0 10`} fill="none" stroke={darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'} strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width={svgWidth} height={svgHeight} fill="url(#spiralGrid)" />
      {elements}
    </svg>
  );
}
