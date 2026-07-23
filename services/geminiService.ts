import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse } from "../types";

export const analyzeProgram = async (programText: string, apiKey: string): Promise<AnalysisResponse> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `You are a Senior Computational Architectural Programmer and Space Planner.
      Analyze the following architectural functional program description.

      Tasks:
      1. Break down the text into individual, distinct functional spaces/rooms.
      2. For each space, estimate or extract a realistic area in square meters (assume standard professional architectural sizing if unstated).
      3. Assign a logical "Zone" (e.g., Public, Private, Service, Outdoor, Admin, Circulation).
      4. Classify the "spaceType":
         - "verticalConnection" for stairs, elevators, or escalators connecting floors.
         - "outdoor" for open gardens, yards, or patios.
         - "terrace" for elevated balconies or rooftop decks.
         - "multistory" for double-height atriums or halls.
         - "standard" for regular rooms.
      5. If "verticalConnection", specify "vcType" as "stair", "elevator", or "ramp".
      6. Determine "daylightReq":
         - "perimeter": Primary rooms requiring external windows and natural daylight (e.g. Bedrooms, Living Rooms, Private Offices, Classrooms, Dining).
         - "core": Internal service spaces that do not require external windows (e.g. Bathrooms, Storage, Elevator Shafts, Copy Rooms, Internal Corridors).
      7. Provide an "aspectRatioHint":
         - "regular": Proportional rooms (1:1.1 to 1:1.5).
         - "long": Corridor strips, narrow hallways, or linear galleries (1:3 to 1:8).
         - "square": Compact core spaces or uniform rooms (1:1).

      CRITICAL CIRCULATION RULE:
      Do not group circulation as a single bulk area. Identify and list individual corridors, hallways, and lobbies needed to logically connect all other spaces.

      Program Description:
      ${programText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            spaces: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  area: { type: Type.NUMBER, description: "Area in square meters" },
                  zone: { type: Type.STRING },
                  description: { type: Type.STRING },
                  spaceType: { type: Type.STRING, description: "standard, outdoor, terrace, multistory, or verticalConnection" },
                  vcType: { type: Type.STRING, description: "stair, elevator, or ramp" },
                  daylightReq: { type: Type.STRING, description: "perimeter or core" },
                  aspectRatioHint: { type: Type.STRING, description: "regular, long, or square" },
                },
                required: ["name", "area", "zone"],
              },
            },
          },
          required: ["projectName", "spaces"],
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResponse;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error analyzing program:", error);
    throw error;
  }
};

export const generateSpatialLayout = async (
  spaces: {
    id: string;
    name: string;
    area: number;
    zone: string;
    spaceType?: string;
    vcType?: string;
    description?: string;
    daylightReq?: 'perimeter' | 'core';
    aspectRatioHint?: 'regular' | 'long' | 'square';
  }[],
  fixedSpaces: {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zone: string;
    floor: number;
  }[],
  floors: { id: number; label: string }[],
  apiKey: string,
  instructions?: string,
  typology?: 'residential' | 'commercial' | 'medical' | 'educational',
  massing: 'compact' | 'l-shape' | 'u-shape' | 'courtyard' = 'compact',
  gridSize: number = 0.5
): Promise<{ id: string; name: string; x: number; y: number; width: number; height: number; floor: number }[]> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Define Typology Specific Rules
  let typologyInstructions = "";
  if (typology === 'residential') {
    typologyInstructions = `
      TYPOLOGY: Residential (Villa/Apartment Floor Plan)
      - Public Zone (Living Room, Dining, Guest WC, Foyer) MUST be located on the Ground Floor (Floor 0).
      - Private Zone (Master Bedroom, Bedrooms, Private Baths) MUST be clustered together on upper floors (Floor 1+) for acoustic and visual privacy.
      - Service Zone (Kitchen, Pantry, Laundry) must be directly adjacent to Dining and Public zones on Ground Floor.
      - Stacking: Align wet areas (Bathrooms, Kitchens, Plumbing stacks) vertically above each other across floors where possible.
      - Aspect Ratios: Bedrooms and Living spaces are robust rectangles (1:1.1 to 1:1.5). Corridors are continuous narrow strips (1:4 to 1:8).
    `;
  } else if (typology === 'commercial') {
    typologyInstructions = `
      TYPOLOGY: Commercial (Office / Workspace Layout)
      - Entrance & Reception Lobby (Public Zone) MUST be placed at the primary entrance on Ground Floor (Floor 0).
      - Open Workspaces & Executive Offices (Admin/Private) arranged along window perimeters for natural daylight.
      - Conference & Meeting Rooms adjacent to central circulation corridors or main lobby.
      - Service Core (Pantry, Copy Room, Restrooms, MEP) clustered centrally around elevators/stairs.
      - Circulation Spines: Wide continuous corridors (1.8m-2.4m width) linking reception to open office zones and emergency egress.
    `;
  } else if (typology === 'medical') {
    typologyInstructions = `
      TYPOLOGY: Medical (Clinic / Healthcare Layout)
      - Reception & Waiting Room (Public Zone) at the primary entrance on Ground Floor.
      - Exam Rooms (Private Zone) MUST be uniform in size, aligned consecutively along a private circulation corridor.
      - Doctor Offices & Admin separated from high-traffic waiting areas but easily reachable.
      - Labs & Sterilization (Service Zone) placed centrally with direct access to all exam corridors.
      - Corridors: Wide double-flow corridors (2.0m-3.0m width) connecting waiting areas directly to exam lines.
    `;
  } else if (typology === 'educational') {
    typologyInstructions = `
      TYPOLOGY: Educational (School / Academy Layout)
      - Main Administration & Security at the primary entrance.
      - Classrooms & Labs arranged along double-loaded circulation spines with perimeter window access.
      - Assembly Hall / Library located as large open volumes near main circulation nodes.
      - Restrooms & Egress Stairs placed at nodal points along main corridors.
    `;
  } else {
    typologyInstructions = `
      TYPOLOGY: Standard General Layout
      - Group rooms logically by Zone (Public, Private, Service, Circulation, Admin).
      - Maintain clear separation between high-noise Public zones and quiet Private zones.
    `;
  }

  // Define Massing Envelope Rules
  let massingInstructions = "";
  if (massing === 'l-shape') {
    massingInstructions = `
      BUILDING MASSING: L-Shaped Footprint
      - Arrange rooms to form an 'L' shape layout with two orthogonal wings joining at a corner circulation node (where stairs/elevators are placed).
    `;
  } else if (massing === 'u-shape') {
    massingInstructions = `
      BUILDING MASSING: U-Shaped Footprint
      - Arrange rooms into three connected wings creating an open semi-enclosed court facing one side. Place main circulation along the central spine.
    `;
  } else if (massing === 'courtyard') {
    massingInstructions = `
      BUILDING MASSING: Central Courtyard / Ring Footprint
      - Arrange rooms around an open central courtyard core. Corridors buffer the internal courtyard side, and rooms face the outer perimeter.
    `;
  } else {
    massingInstructions = `
      BUILDING MASSING: Compact Rectangular Footprint
      - Arrange rooms into a tight, efficient rectangular building envelope with clean straight exterior perimeter walls.
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `You are a Senior Computational Architect & Algorithmic Layout Engine.
      Your objective is to generate an architecturally realistic, grid-aligned, zero-gap partition floor plan layout.

      INPUT DATA:
      1. "spaces": Array of spaces to arrange (id, name, area, zone, spaceType, vcType, daylightReq, aspectRatioHint).
      2. "fixedSpaces": Array of existing spaces that are locked in position (id, name, x, y, width, height, zone, floor).
      3. "floors": Array of available floors (id, label).

      CRITICAL ARCHITECTURAL RULES & GEOMETRIC CONSTRAINTS:

      1. STRICT MODULAR GRID (${gridSize}m Module):
         - All bounding box values (x, y, width, height) MUST be exact multiples of ${gridSize} meters (e.g. 0.0, 0.5, 1.0, 1.5, 4.0, 4.5, 12.0, 12.5).
         - NEVER output floating decimals like 12.37 or 8.19. Round every coordinate and dimension strictly to the ${gridSize}m grid module!

      2. VERTICAL CORE STACKING & LOCKING (ABSOLUTE RULE FOR MULTI-FLOOR BUILDINGS):
         - Any space with spaceType = "verticalConnection" (Staircases, Elevators, Shafts) or fixed vertical elements MUST be placed at the EXACT SAME (x, y, width, height) coordinates on EVERY floor level it exists on!
         - If a Staircase is placed at x=${10 * gridSize}, y=${5 * gridSize}, width=${2 * gridSize}, height=${4 * gridSize} on Floor 0, its corresponding vertical stair on Floor 1 MUST BE PLACED AT THE EXACT SAME x=${10 * gridSize}, y=${5 * gridSize}, width=${2 * gridSize}, height=${4 * gridSize}!

      3. ZERO-GAP PARTITION WALL SHARING & CO-PLANAR ALIGNMENT:
         - Rooms must share interior partition walls with ZERO gaps (e.g. roomA.x + roomA.width == roomB.x OR roomA.y + roomA.height == roomB.y).
         - Align room edges within the same wing to create continuous straight partition wall lines.
         - Do not allow random empty gaps or floating rooms between spaces.

      4. CIRCULATION SPINE & HALLWAY ROUTING:
         - Do NOT model corridors as isolated floating blocks.
         - Position circulation hallways as continuous 1.2m to 2.0m wide strips (aspect ratio 1:3 to 1:10) running alongside or between room clusters, connecting room entry doors directly to vertical stairs/elevators and building entrances.

      5. DAYLIGHTING & PERIMETER vs CORE PLACEMENT:
         - Spaces with daylightReq="perimeter" (Bedrooms, Living Rooms, Private Offices, Classrooms) MUST be placed on the outer exterior boundary of the floor massing to receive windows.
         - Spaces with daylightReq="core" (Bathrooms, Storage, Elevator Shafts, Internal Corridors) should be placed in the interior core of the building massing.

      6. RESPECT FIXED SPACES:
         - Do NOT move or alter any "fixedSpaces". Arrange new "spaces" tightly against "fixedSpaces" without overlapping them on the same floor.

      ${typologyInstructions}
      ${massingInstructions}

      INPUT SPACES TO ARRANGE:
      ${JSON.stringify(spaces, null, 2)}

      LOCKED / FIXED SPACES (DO NOT MOVE):
      ${JSON.stringify(fixedSpaces, null, 2)}

      AVAILABLE FLOORS:
      ${JSON.stringify(floors, null, 2)}

      ${instructions && instructions.trim() ? `CRITICAL USER CUSTOM DIRECTIVES:\n${instructions}` : ''}

      OUTPUT INSTRUCTIONS:
      Generate JSON returning an array of objects for all items in "spaces".
      Each item must contain: { id: string, name: string, x: number, y: number, width: number, height: number, floor: number }.
      Ensure width * height matches the specified space area in m² (adjusted to the ${gridSize}m grid module while preserving valid aspect ratios).
      Canvas coordinates are in meters (1 unit = 1 meter).
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              floor: { type: Type.NUMBER },
            },
            required: ["id", "name", "x", "y", "width", "height", "floor"],
          },
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text) as { id: string, name: string, x: number, y: number, width: number, height: number, floor: number }[];
      // Enforce strict grid rounding on response as post-processing safety
      return parsed.map(item => ({
        ...item,
        x: Math.round(item.x / gridSize) * gridSize,
        y: Math.round(item.y / gridSize) * gridSize,
        width: Math.max(gridSize, Math.round(item.width / gridSize) * gridSize),
        height: Math.max(gridSize, Math.round(item.height / gridSize) * gridSize),
      }));
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error generating spatial layout:", error);
    throw error;
  }
};