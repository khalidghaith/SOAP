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

### 6. Site Context
- **Google Earth Import**: Import the site outline from a `.kml` or `.kmz` file exported from Google Earth Pro or Google Earth Web. SOAP places it at true scale and orientation and updates the project's coordinates.
- **Boundary Drawing**: Draw or edit the property line on the canvas (click to add corners, drag corners to reshape, double-click an edge to add a corner, drag the site to move it).
- **Snapping**: While drawing or editing the boundary and zones, points snap to corners, midpoints and edges (of the site, zones and spaces), guides and their crossings, the grid, and 45°/square tracking from the last corner. Type a length and press Enter for an exact side; Shift locks the angle, Alt places a point freely. Uses the canvas Snapping settings.
- **Align to Street**: Click the street edge and choose **Align edge to street** to rotate the site so that edge runs along the bottom of the plan, or rotate by any angle. True north, no-build zones and the satellite underlay rotate with it; placed spaces stay put.
- **Constraints**: Setbacks for all edges or per edge, maximum height, site coverage and FAR, plus no-build zones for easements and rights of way.
- **Site Check**: Live report of site area, buildable area, coverage, FAR and height, with spaces that break the rules outlined in red.
- **Satellite Underlay**: Adds an aerial photo of the site as a locked, scaled reference image (Esri World Imagery).

### 7. AI Bridges (MCP)
Claude, ChatGPT, Gemini and other AI apps can read and edit the open project through the [Model Context Protocol](https://modelcontextprotocol.io).
- **Your AI link**: Click the **plug** icon in the top bar and turn on **AI access**. SOAP shows a private link; paste it into your AI app. It works with the hosted SOAP through a small cloud relay (see [relay/README.md](relay/README.md) to deploy it once on Cloudflare's free plan).
- **Switches**: Choose which assistants are allowed (Claude, Gemini, ChatGPT, other apps). Switched-off assistants are refused.
- **Safe to try**: Every AI change is one undo step (Ctrl+Z), and the panel logs every call. The link works like a password; **Reset** it to cut off old copies.
- **Tools**: `get_project`, `get_planning_rules`, `add_spaces`, `update_spaces`, `place_spaces`, `unplace_spaces`, `remove_spaces`, `update_floors`, `set_site`, `check_layout`, `get_plan_image`, `show_floor`, `undo`.
- **Plan images**: `get_plan_image` gives the AI a picture of any floor — spaces labelled with name and area, a meter grid matching the coordinates, the site and setbacks, rule breaks in red, and optionally a faint outline of another floor or the satellite underlay — so it can check its work visually.

Connecting (the panel shows these with your link filled in):
- **Claude** (claude.ai / desktop): Settings → Connectors → Add custom connector → paste your link. **Claude Code**: `claude mcp add --transport http soap <your link>`.
- **ChatGPT**: Settings → Apps & Connectors → Advanced → Developer mode, then create a connector with your link and no authentication.
- **Gemini CLI**: add `{"mcpServers": {"soap": {"httpUrl": "<your link>"}}}` to `~/.gemini/settings.json`.
- **Developing locally**: `npm run dev` also serves a bridge at `http://localhost:3000/mcp` — choose **This computer (dev server)** in the panel; no relay needed.

### 8. AI Assistance
- **Generative Layout**: Powered by Google Gemini, the app can suggest spatial arrangements based on your program data and zoning (requires API Key).

### 9. Project Management
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
   (Optional) Set `VITE_SOAP_RELAY_URL` to your deployed relay for AI Bridges — see [relay/README.md](relay/README.md)
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

### Setting Up the Site
1. In Google Earth, trace the site as a polygon and export it (Pro: right-click the polygon → **Save Place As…**; Web: project menu → **Export as KML file**).
2. In SOAP, click the compass to set **True North** first, then click the **Site** icon in the top toolbar and choose **Google Earth (KML/KMZ)**. Or draw the boundary with **Boundary**.
3. Click the street edge and choose **Align edge to street** so your spaces can follow the street grid.
4. Click an edge to give it its own setback, fill in the height, coverage and FAR limits, and draw any **No-build** zones.
5. Optional: **Satellite underlay** adds an aerial photo under the plan.

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
