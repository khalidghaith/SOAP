# SOAP - Spatial Organization & Architectural Programming

SOAP is a web-based architectural programming and spatial layout tool. It allows designers to define a program of requirements, explore spatial relationships in a 2D canvas, and visualize the resulting massing in 3D.

## Features

### 1. Program Management
- **Program Editor**: Define spaces with names, target areas (m²), and zone categories.
- **CSV Import**: Import room lists directly from CSV files (Format: Name, Area, Zone).
- **AI Program Generation**: Generate a complete architectural program based on a project description using AI.
- **Zone Styling**: Customize colors for different functional zones.

![Soap-Screenshots_2](https://github.com/user-attachments/assets/2fdd8eab-3485-4ac3-8f4b-d3a559f3f2fd)

![Soap-Screenshots_1](https://github.com/user-attachments/assets/4e3cea97-e25b-481e-aeee-a0380a0a89c0)


### 2. 2D Spatial Layout (Canvas)
- **Inventory System**: Unplaced spaces reside in a sidebar inventory. Drag and drop them onto the canvas to place them.
- **Shape Flexibility**: Switch space representations between:
  - **Rectangle**: Standard box layout.
  - **Polygon**: Custom vertex-based shapes.
  - **Bubble**: Organic, circular shapes for conceptual diagrams.
- **Multi-Floor Support**: Create and manage multiple floors. View "ghosted" overlays of other floors to align vertical structures.
- **Snapping & Alignment**:
  - Snap to grid.
  - Snap to other objects (edges and alignment).
  - Magnetic Physics mode for organic packing.
- **Connections**: Draw links between spaces to denote adjacency requirements or circulation paths.

![Soap-Screenshots_3](https://github.com/user-attachments/assets/835c8231-2172-4bef-bd72-4413d3a28222)

### 3. 3D Visualization (Volumes)
- **Real-time Massing**: Instantly view your 2D layout as extruded 3D volumes.
- **View Modes**: Toggle between Perspective and Isometric views.
- **Vertical Stacking**: Visualize how floors stack and relate vertically.
- **Export**: Export the 3D model as an `.OBJ` file for use in other CAD software.

![Soap-Screenshots_5](https://github.com/user-attachments/assets/1dce30c5-921b-44d6-a1cf-d51c4958d2fb)

### 4. Sketching & Annotation
- **Drawing Tools**: Integrated sketching toolbar with pen, line, arrow, and shape tools.
- **Dimensions**: Add measurements and text notes directly to the layout.
- **Styling**: Customizable stroke width, colors, and line styles (dashed/solid).

![Soap-Screenshots_4](https://github.com/user-attachments/assets/4388763b-552f-432f-8e2c-c7f52dcd22de)

### 5. Reference Underlays
- **Image Import**: Import floor plans, site maps, or sketches (PNG/JPG).
- **Calibrated Scaling**: Scale imported images to real-world dimensions by defining a known distance between two points.
- **Opacity Control**: Adjust transparency to trace over references.

### 6. AI Assistance
- **Generative Layout**: Powered by Google Gemini, the app can suggest spatial arrangements based on your program data and zoning (requires API Key).

### 7. Project Management
- **Save/Load**: Save projects locally as `.json` files.
- **Autosave**: Work is automatically saved to browser local storage.
- **Export**:
  - **PDF**: Generate scaled reports.
  - **PNG**: Capture high-resolution screenshots of the canvas.
  - **CSV**: Export the current program data.

## Controls & Shortcuts

| Action | Shortcut / Control |
|--------|-------------------|
| **Pan Canvas** | Middle Mouse Drag / Right Mouse Drag / Space + Left Drag |
| **Zoom** | Mouse Wheel / Pinch Zoom (Touch) |
| **Undo** | `Ctrl + Z` |
| **Redo** | `Ctrl + Y` or `Ctrl + Shift + Z` |
| **Zoom to Fit** | `Ctrl + F` |
| **Delete Selection** | `Delete` or `Backspace` |
| **Switch Views** | `Tab` (Cycles Editor -> Canvas -> Volumes) |
| **Multi-Select** | `Shift + Click` or Drag Selection Box |

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Usage Guide

### Starting a Project
1. **Define Program**: Switch to the **Program** view to add spaces manually or import a CSV. Assign zones to group related spaces.
2. **Setup Floors**: Use the bottom bar to add floors (e.g., Ground Floor, Level 1).

### Layout Phase
1. **Place Spaces**: Open the **Inventory** (left sidebar) and drag spaces onto the canvas.
2. **Arrange**: Move and resize spaces. Use the **Magnet** tool in the top toolbar to help pack bubbles organically.
3. **Refine**: Select a space to open the **Properties** panel (right sidebar). Here you can change dimensions, shape type (Rect/Poly/Bubble), or move it to a different floor.

### Working with References
1. Click the **Image Icon** in the top toolbar to enter Reference Mode.
2. Upload an image.
3. Click the **Ruler Icon** on the image toolbar to calibrate scale:
   - Click Point A.
   - Click Point B.
   - Enter the real-world distance (e.g., "5" for 5 meters).

### 3D Visualization
1. Switch to **Volumes** view to see the massing.
2. Adjust floor heights in the Floor Settings (right sidebar in Canvas view) to change extrusion heights.

---
