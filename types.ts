export interface Point {
  x: number;
  y: number;
}

export interface RoomStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius?: number;
  strokeDasharray?: string;
  hatchPattern?: 'brick' | 'concrete' | 'dots' | 'diagonal' | 'cross' | 'none';
  hatchScale?: number;
  hatchColor?: string;
}

export type SpaceType = 'standard' | 'outdoor' | 'terrace' | 'multistory' | 'verticalConnection';
export type VCType = 'stair' | 'elevator' | 'ramp';
export type StairConfig = 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';

export interface StairParams {
  width: number;        // meters (default 1.2)
  treadDepth: number;   // meters (default 0.28)
  riserHeight: number;  // meters (default 0.17)
  config: StairConfig;  // stair configuration type
}

export const DEFAULT_STAIR_PARAMS: StairParams = {
  width: 1.2,
  treadDepth: 0.28,
  riserHeight: 0.17,
  config: 'straight',
};

export interface Room {
  id: string;
  name: string;
  area: number; // in square meters
  zone: string;
  description?: string;

  // Placement
  isPlaced: boolean;
  floor: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;

  // Custom Shape
  polygon?: Point[];
  shape?: 'rect' | 'polygon' | 'bubble';
  style?: RoomStyle;
  isTextUnlocked?: boolean;
  textPos?: Point;
  depth?: number;

  // Space Type
  spaceType?: SpaceType;       // default 'standard'
  spanFloors?: number;         // for 'multistory' — how many floors it spans (default 2)
  vcType?: VCType;             // for 'verticalConnection'
  vcFromFloor?: number;        // for VC — starting floor (defaults to lowest floor)
  vcToFloor?: number;          // for VC — ending floor (defaults to highest floor)
  stairParams?: StairParams;   // for VC type 'stair'
}

export interface ZoneColor {
  bg: string;
  border: string;
  text: string;
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export interface DiagramStyle {
  id: string;
  name: string;
  fontFamily: string;
  cornerRadius: string;
  borderWidth: number;
  opacity: number;
  sketchy: boolean;
  shadow: string;
  colorMode: 'default' | 'monochrome' | 'pastel';
}

export interface AnalysisResponse {
  projectName: string;
  spaces: Array<{
    name: string;
    area: number;
    zone: string;
    description: string;
  }>;
}

export const ZONE_COLORS: Record<string, ZoneColor> = {
  'Public': { bg: 'bg-orange-100 dark:bg-orange-500/20', border: 'border-orange-400 dark:border-orange-400/50', text: 'text-orange-900 dark:text-orange-100' },
  'Private': { bg: 'bg-blue-100 dark:bg-blue-500/20', border: 'border-blue-400 dark:border-blue-400/50', text: 'text-blue-900 dark:text-blue-100' },
  'Service': { bg: 'bg-gray-200 dark:bg-gray-500/20', border: 'border-gray-400 dark:border-gray-400/50', text: 'text-gray-900 dark:text-gray-200' },
  'Circulation': { bg: 'bg-yellow-100 dark:bg-yellow-500/20', border: 'border-yellow-400 dark:border-yellow-400/50', text: 'text-yellow-900 dark:text-yellow-100' },
  'Outdoor': { bg: 'bg-green-100 dark:bg-green-500/20', border: 'border-green-400 dark:border-green-400/50', text: 'text-green-900 dark:text-green-100' },
  'Admin': { bg: 'bg-purple-100 dark:bg-purple-500/20', border: 'border-purple-400 dark:border-purple-400/50', text: 'text-purple-900 dark:text-purple-100' },
  'Default': { bg: 'bg-white dark:bg-white/10', border: 'border-slate-300 dark:border-white/20', text: 'text-slate-700 dark:text-slate-300' },
};

export const DIAGRAM_STYLES: DiagramStyle[] = [
  {
    id: 'standard',
    name: 'Standard',
    fontFamily: 'font-sans',
    cornerRadius: 'rounded-lg',
    borderWidth: 2,
    opacity: 0.9,
    sketchy: false,
    shadow: 'shadow-sm',
    colorMode: 'default'
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    fontFamily: 'font-mono text-[10px] tracking-tight',
    cornerRadius: 'rounded-none',
    borderWidth: 1.5,
    opacity: 0.85,
    sketchy: false,
    shadow: 'shadow-none',
    colorMode: 'monochrome'
  },
  {
    id: 'clay',
    name: 'Clay Plaster',
    fontFamily: 'font-sans tracking-normal font-semibold',
    cornerRadius: 'rounded-[16px]',
    borderWidth: 3,
    opacity: 0.95,
    sketchy: false,
    shadow: 'shadow-lg',
    colorMode: 'monochrome'
  }
];

export const FLOORS: Floor[] = [
  { id: -1, label: 'Basement', height: 4 },
  { id: 0, label: 'Ground Floor', height: 4 },
  { id: 1, label: 'Level 1', height: 4 },
  { id: 2, label: 'Level 2', height: 4 },
  { id: 3, label: 'Level 3', height: 4 },
  { id: 4, label: 'Roof', height: 4 },
];

export interface Floor {
  id: number;
  label: string;
  height: number;
}

export interface VerticalConnection {
  id: string;
  fromId: string;
  toId: string;
  fromFloor: number;
  toFloor: number;
}

export interface AppSettings {
  zoneTransparency: number;
  zonePadding: number;
  strokeWidth: number;
  cornerRadius: number;
  fontSize: number;
  snapTolerance: number;
  snapToGrid: boolean;
  snapToObjects: boolean;
  snapWhileScaling: boolean;
  volumesOpacity?: number;
  colorSaturation?: number;
  unitSystem?: 'metric' | 'imperial';
  magnetStrength?: number;
  magnetPadding?: number;
  layerPrefix?: string;
  exportGrid?: boolean;
  terraceAreaFactor?: number;    // default 0.5
  includeTerraceInGFA?: boolean; // default false
}

export type AnnotationType = 'line' | 'polyline' | 'arc' | 'bezier' | 'text' | 'rect' | 'circle' | 'arrow';
export type ArrowCapType = 'none' | 'arrow' | 'circle' | 'square';

export interface Annotation {
  id: string;
  type: AnnotationType;
  points: Point[];
  floor: number;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDash?: string;
    fill?: string;
    opacity: number;
    startCap?: ArrowCapType;
    endCap?: ArrowCapType;
    fillet?: number; // for polylines
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    textAlign?: 'left' | 'center' | 'right';
    text?: string;
  };
  handles?: Point[]; // for Bezier curves
  nodeModes?: ('bezier' | 'smooth' | 'corner')[];
}

export interface ReferenceImage {
  id: string;
  url: string; // Base64 or Blob URL
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
  isLocked: boolean;
  floor: number;
}

export interface ReferenceScaleState {
  imageId: string;
  points: Point[];
  step: 'point1' | 'point2' | 'input';
}

export type ZoningTypology = 'residential' | 'commercial' | 'medical' | 'educational';

