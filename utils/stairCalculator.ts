import { Floor, StairParams, StairConfig } from '../types';

export interface FlightInfo {
  risers: number;
  treads: number;
  flightLength: number;    // horizontal run (meters)
  flightRise: number;      // vertical rise (meters)
}

export interface StairCalcResult {
  totalRise: number;         // total height to climb (meters)
  numRisers: number;         // total number of risers
  numTreads: number;         // total number of treads
  actualRiserHeight: number; // adjusted riser height to evenly divide
  flightLength: number;      // horizontal run of one flight (meters)
  numLandings: number;       // mid-landings needed
  landingDepth: number;      // depth of each landing (meters)
  totalRunLength: number;    // total horizontal length including landings
  flights: FlightInfo[];     // breakdown per flight
  meetsCode: boolean;        // basic code compliance check (2R+T ≈ 60–66cm)
  codeValue: number;         // 2R+T value in meters
  totalArea: number;         // estimated stair footprint area (m²)
  spiralRadius?: number;     // for spiral: outer radius
  spiralAngle?: number;      // for spiral: total rotation in degrees
}

/**
 * Calculate stair metrics given stair parameters and floor data.
 */
export function calculateStair(
  params: StairParams,
  floors: Floor[],
  fromFloor: number,
  toFloor: number
): StairCalcResult {
  const { width, treadDepth, riserHeight, config } = params;

  // Calculate total rise from floor heights
  const sortedFloors = [...floors].sort((a, b) => a.id - b.id);
  const minFloor = Math.min(fromFloor, toFloor);
  const maxFloor = Math.max(fromFloor, toFloor);

  let totalRise = 0;
  for (const f of sortedFloors) {
    if (f.id >= minFloor && f.id < maxFloor) {
      totalRise += f.height;
    }
  }

  // Edge case: no rise
  if (totalRise <= 0) {
    return {
      totalRise: 0,
      numRisers: 0,
      numTreads: 0,
      actualRiserHeight: 0,
      flightLength: 0,
      numLandings: 0,
      landingDepth: 0,
      totalRunLength: 0,
      flights: [],
      meetsCode: true,
      codeValue: 0,
      totalArea: 0,
    };
  }

  // Number of risers (rounded up to ensure we reach the top)
  const numRisers = Math.ceil(totalRise / riserHeight);
  const actualRiserHeight = totalRise / numRisers;

  // Code compliance: 2R + T should be between 0.60m and 0.66m
  const codeValue = 2 * actualRiserHeight + treadDepth;
  const meetsCode = codeValue >= 0.58 && codeValue <= 0.66;

  // Landing depth = stair width (standard practice)
  const landingDepth = width;

  // Calculate flights based on configuration
  const result = calculateFlights(config, numRisers, treadDepth, actualRiserHeight, width, totalRise, landingDepth);

  return {
    totalRise,
    numRisers,
    numTreads: numRisers - 1,
    actualRiserHeight,
    flightLength: result.flights.length > 0 ? result.flights[0].flightLength : 0,
    numLandings: result.numLandings,
    landingDepth,
    totalRunLength: result.totalRunLength,
    flights: result.flights,
    meetsCode,
    codeValue,
    totalArea: result.totalArea,
    spiralRadius: result.spiralRadius,
    spiralAngle: result.spiralAngle,
  };
}

interface FlightsResult {
  flights: FlightInfo[];
  numLandings: number;
  totalRunLength: number;
  totalArea: number;
  spiralRadius?: number;
  spiralAngle?: number;
}

function calculateFlights(
  config: StairConfig,
  numRisers: number,
  treadDepth: number,
  actualRiserHeight: number,
  width: number,
  totalRise: number,
  landingDepth: number
): FlightsResult {
  switch (config) {
    case 'straight':
      return calculateStraight(numRisers, treadDepth, actualRiserHeight, width);

    case 'l-shaped':
      return calculateLShaped(numRisers, treadDepth, actualRiserHeight, width, landingDepth);

    case 'u-shaped':
      return calculateUShaped(numRisers, treadDepth, actualRiserHeight, width, landingDepth);

    case 'spiral':
      return calculateSpiral(numRisers, treadDepth, actualRiserHeight, width, totalRise);

    default:
      return calculateStraight(numRisers, treadDepth, actualRiserHeight, width);
  }
}

function calculateStraight(
  numRisers: number,
  treadDepth: number,
  actualRiserHeight: number,
  width: number
): FlightsResult {
  const treads = numRisers - 1;
  const flightLength = treads * treadDepth;

  const flight: FlightInfo = {
    risers: numRisers,
    treads,
    flightLength,
    flightRise: numRisers * actualRiserHeight,
  };

  return {
    flights: [flight],
    numLandings: 0,
    totalRunLength: flightLength,
    totalArea: flightLength * width,
  };
}

function calculateLShaped(
  numRisers: number,
  treadDepth: number,
  actualRiserHeight: number,
  width: number,
  landingDepth: number
): FlightsResult {
  // Split risers between 2 flights (roughly 50/50)
  const risersPerFlight1 = Math.ceil(numRisers / 2);
  const risersPerFlight2 = numRisers - risersPerFlight1;

  const treads1 = risersPerFlight1 - 1;
  const treads2 = risersPerFlight2; // last flight has treads = risers (landing counts as first tread)

  const flightLength1 = treads1 * treadDepth;
  const flightLength2 = treads2 * treadDepth;

  const flights: FlightInfo[] = [
    {
      risers: risersPerFlight1,
      treads: treads1,
      flightLength: flightLength1,
      flightRise: risersPerFlight1 * actualRiserHeight,
    },
    {
      risers: risersPerFlight2,
      treads: treads2,
      flightLength: flightLength2,
      flightRise: risersPerFlight2 * actualRiserHeight,
    },
  ];

  // L-shaped: flight1 + landing + flight2 at 90°
  // Total run for longest direction
  const totalRunLength = Math.max(flightLength1, flightLength2) + landingDepth;
  // Area: flight1 + landing (square) + flight2 (perpendicular)
  const totalArea = (flightLength1 * width) + (landingDepth * (width + width)) + (flightLength2 * width);

  return {
    flights,
    numLandings: 1,
    totalRunLength,
    totalArea,
  };
}

function calculateUShaped(
  numRisers: number,
  treadDepth: number,
  actualRiserHeight: number,
  width: number,
  landingDepth: number
): FlightsResult {
  // Split risers between 2 flights (U-shape = 2 parallel flights with landing between)
  const risersPerFlight1 = Math.ceil(numRisers / 2);
  const risersPerFlight2 = numRisers - risersPerFlight1;

  const treads1 = risersPerFlight1 - 1;
  const treads2 = risersPerFlight2; // landing acts as first tread of second flight

  const flightLength1 = treads1 * treadDepth;
  const flightLength2 = treads2 * treadDepth;

  const flights: FlightInfo[] = [
    {
      risers: risersPerFlight1,
      treads: treads1,
      flightLength: flightLength1,
      flightRise: risersPerFlight1 * actualRiserHeight,
    },
    {
      risers: risersPerFlight2,
      treads: treads2,
      flightLength: flightLength2,
      flightRise: risersPerFlight2 * actualRiserHeight,
    },
  ];

  // U-shaped: two parallel flights side by side, connected by landing at the top
  const maxFlightLength = Math.max(flightLength1, flightLength2);
  const totalRunLength = maxFlightLength + landingDepth;
  // Width is 2× stair width + gap (typically the wall between, ~0.1m)
  const totalWidth = width * 2 + 0.1;
  const totalArea = totalRunLength * totalWidth;

  return {
    flights,
    numLandings: 1,
    totalRunLength,
    totalArea,
  };
}

function calculateSpiral(
  numRisers: number,
  treadDepth: number,
  actualRiserHeight: number,
  width: number,
  totalRise: number
): FlightsResult {
  // Spiral stairs: treads are wedge-shaped
  // The tread depth is measured at the walking line (typically 2/3 from center)
  // Outer radius = width (diameter of the spiral)
  const outerRadius = width;
  const walkingLineRadius = outerRadius * 0.67;

  // Each tread subtends an angle: angle = treadDepth / walkingLineRadius (radians)
  const treads = numRisers - 1;
  const anglePerTread = treadDepth / walkingLineRadius; // radians
  const totalAngle = anglePerTread * treads; // total rotation in radians
  const totalAngleDeg = (totalAngle * 180) / Math.PI;

  // The "flight length" for a spiral is the arc length at the walking line
  const arcLength = walkingLineRadius * totalAngle;

  const flight: FlightInfo = {
    risers: numRisers,
    treads,
    flightLength: arcLength,
    flightRise: totalRise,
  };

  // Footprint area = circle with diameter = 2 * outerRadius
  const totalArea = Math.PI * outerRadius * outerRadius;

  return {
    flights: [flight],
    numLandings: 0,
    totalRunLength: arcLength,
    totalArea,
    spiralRadius: outerRadius,
    spiralAngle: totalAngleDeg,
  };
}

/**
 * Get a human-readable summary string of stair calculations.
 */
export function getStairSummary(result: StairCalcResult): string {
  if (result.numRisers === 0) return 'No rise to calculate.';

  const lines = [
    `Risers: ${result.numRisers}`,
    `Treads: ${result.numTreads}`,
    `Actual Riser: ${(result.actualRiserHeight * 100).toFixed(1)} cm`,
    `Flight Length: ${result.flightLength.toFixed(2)} m`,
    `Landings: ${result.numLandings}`,
    `Total Run: ${result.totalRunLength.toFixed(2)} m`,
    `2R+T: ${(result.codeValue * 100).toFixed(1)} cm ${result.meetsCode ? '✅' : '⚠️'}`,
  ];

  if (result.spiralRadius) {
    lines.push(`Spiral Radius: ${result.spiralRadius.toFixed(2)} m`);
    lines.push(`Total Rotation: ${result.spiralAngle?.toFixed(0)}°`);
  }

  return lines.join('\n');
}
