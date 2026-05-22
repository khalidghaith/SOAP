import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse } from "../types";

export const analyzeProgram = async (programText: string, apiKey: string): Promise<AnalysisResponse> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert architectural programmer. Analyze the following architectural functional program description. 
      Break it down into individual spaces/rooms.
      For each space, estimate a reasonable area in square meters if not explicitly stated (assume standard architectural sizing).
      Assign a logical "Zone" (e.g., Public, Private, Service, Outdoor, Admin, Circulation).
      
      CRITICAL: Do not group circulation as a single, bulk area. Instead, identify and list individual corridors, hallways, and lobbies needed to logically connect all other spaces.
      
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
  spaces: { id: string, name: string, area: number, zone: string }[],
  fixedSpaces: { id: string, name: string, x: number, y: number, width: number, height: number, zone: string, floor: number }[],
  floors: { id: number, label: string }[],
  apiKey: string,
  instructions?: string,
  typology?: 'residential' | 'commercial' | 'medical' | 'educational'
): Promise<{ id: string, name: string, x: number, y: number, width: number, height: number, floor: number }[]> => {
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new Error("Gemini API Key is missing. Please provide a key in the settings.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Define Typology Specific Rules
  let typologyInstructions = "";
  if (typology === 'residential') {
    typologyInstructions = `
      TYPOLOGY: Residential (Villa/Apartment Layout)
      - Public Zone (Living Room, Dining, Guest WC) on Ground Floor or lower levels.
      - Private Zone (Bedrooms, Master Suites) clustered together on upper floors (e.g., Level 1) for intimacy, separated from high-traffic public areas.
      - Service Zone (Kitchen, Laundry, Garage) closely adjacent to Public and circulation zones. Kitchen next to Dining.
      - Stacking: Align wet areas (Bathrooms, Kitchen) vertically where possible to share plumbing stacks.
      - Aspect Ratios: Most rooms should be robustly rectangular (1:1.1 to 1:1.5). Circulation hallways should be narrow (1:4 to 1:8).
    `;
  } else if (typology === 'commercial') {
    typologyInstructions = `
      TYPOLOGY: Commercial (Office Space Layout)
      - Entrance & Lobby (Public Zone) should be central, highly visible, and located at the primary entrance on the main floor.
      - Open Workspaces (Private/Admin Zones) clustered around window perimeters.
      - Meeting & Conference Rooms (Public/Admin Zones) adjacent to the main lobby or central circulation.
      - Service Zone (Pantry, Copy Room, Server Closet) placed centrally but screened from the main entrance lobby.
      - Circulation (Corridors, Lobbies) acts as a wide backbone connecting various departments.
      - Aspect Ratios: Large spaces like open offices are wide (1:1.2 to 1:1.8), conference rooms are proportional (1:1.5), corridors are long (1:5 to 1:10).
    `;
  } else if (typology === 'medical') {
    typologyInstructions = `
      TYPOLOGY: Medical (Clinic / Healthcare Layout)
      - Waiting Room & Reception (Public Zone) strictly placed near the entrance on the Ground Floor.
      - Exam Rooms (Private Zone) should be uniform in size, lined up consecutively along a private corridor, and clustered together away from public waiting visibility.
      - Doctor Offices (Admin Zone) separated from exam rooms but easily accessible.
      - Lab & Sterilization (Service Zone) placed centrally with quick access to all Exam Rooms.
      - Stacking: Stack utility rooms vertically.
      - Aspect Ratios: Exam rooms are highly standardized (approx 3x4 meters, aspect ratio 1:1.3). Corridors should be wide enough for double-flow.
    `;
  } else if (typology === 'educational') {
    typologyInstructions = `
      TYPOLOGY: Educational (School / Training Center Layout)
      - Reception & Administration (Public/Admin) placed immediately at the main entrance.
      - Classrooms (Private/Public learning spaces) clustered along wide circulation corridors, enjoying window access.
      - Restrooms & Lockers (Service) placed at nodal points of corridors, stacked vertically.
      - Library / Assembly (Public) placed in a high-visibility, large open volume.
      - Aspect Ratios: Classrooms are deep rectangles (1:1.2 to 1:1.4), circulation halls are very wide and long corridors (1:6 to 1:12).
    `;
  } else {
    typologyInstructions = `
      TYPOLOGY: Standard General Layout
      - Group rooms by Zone (e.g. Keeping Private clusters separated from Public zones).
      - Maintain standard aspect ratios (1:1 to 1:2) for regular spaces, and long strips (1:4 to 1:8) for corridors.
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert architectural programmer. 
      Input: 
      1. "spaces": Array of spaces to arrange (id, name, area, zone).
      2. "fixedSpaces": Array of existing spaces that are locked in position (id, name, x, y, width, height, zone, floor).
      3. "floors": Array of available floors (id, label).
      
      Architectural Typology Rules:
      ${typologyInstructions}
      
      Architectural Logic: The AI must act as a Senior Architect. It should:
      1. Apply the Typology Rules above.
      2. Calculate a Proximity Matrix: Determine which rooms must be adjacent (e.g. Kitchen next to Dining, Lobby at entrance).
      3. **Circulation as Connectors**: Do not clump all spaces directly adjacent to each other. Position spaces identified as Circulation (corridors, hallways, lobbies) between or extending alongside other spaces so they act as functional connectors. Leave logical realistic gaps for corridors between different zones.
      4. Assign Coordinates & Floors: Generate x, y positions and assign a floor for each space in "spaces".
      5. **Respect Fixed Spaces**: Do NOT move "fixedSpaces". Place "spaces" around or adjacent to "fixedSpaces" where logically appropriate. Ensure no overlaps with "fixedSpaces" on the same floor.
      6. **Vertical Connections**: Consider vertical adjacency (e.g. stacking plumbing, connecting circulation). Distribute spaces across floors logically.
      
      Geometric Output: Use responseSchema to enforce a JSON output where each space in "spaces" includes { id: string, x: number, y: number, width: number, height: number, floor: number }.
      Note: Calculate width and height based on the space's area while strictly maintaining typological aspect ratio guidelines.
      Canvas Integration: The coordinates should be scaled for a canvas where 1 unit = 1 meter.
      
      Spaces to Arrange:
      ${JSON.stringify(spaces)}
 
      Fixed/Locked Spaces (Do not move):
      ${JSON.stringify(fixedSpaces)}
 
      Available Floors:
      ${JSON.stringify(floors)}
      
      Task:
      Given these architectural spaces, organize the "spaces" into a functional floor plan layout across the available floors. Determine their positions based on standard residential/commercial flow. Output the absolute coordinates and floor ID for each space in "spaces" to ensure a tight, logical cluster without overlaps with each other or fixed spaces on the same floor.
      
      ${instructions && instructions.trim() ? `CRITICAL USER INSTRUCTIONS (Must follow these strict requirements for floor and orientation placement):\n      ${instructions}` : ''}
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
      return JSON.parse(response.text);
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Error generating spatial layout:", error);
    throw error;
  }
};