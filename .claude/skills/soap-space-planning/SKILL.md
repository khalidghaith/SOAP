---
name: soap-space-planning
description: Architectural rules and workflow for arranging a SOAP project's spaces into floor plans — circulation first, every room reachable from a hall/foyer/landing, no dead-end corridors, stacked stairs and wet rooms, sensible zoning on a 0.5 m grid — plus a checker script that verifies a layout before it is applied. Use this whenever you place, arrange, re-arrange or critique rooms in SOAP (manually or as a fallback when the AI layout fails), design a plan from a SOAP program, review an AI-generated layout, or change the AI layout prompt/validation rules, even if the user just says "arrange the spaces", "lay it out", "make a plan" or "fix the layout".
---

# SOAP space planning

These rules come from an architect's review of plans produced in this project. The first attempts were rejected for two reasons worth remembering:

1. **No circulation on the ground floor.** Rooms were packed edge to edge, so the office could only be reached through the stair, the laundry through the kitchen, and dining/kitchen through the living room. A plan is a sequence of movements, not a tiling puzzle.
2. **Dead-end corridors.** A hall ran from the foyer and stopped at the exterior wall; an upstairs landing ran 7 m from the stair to a blank facade. Corridors must *lead somewhere*.

Treat the program's areas as targets, and movement through the building as the thing you are actually designing.

## Workflow

1. **Read the program** (rooms, areas, zones, `spaceType`, `daylightReq`, `aspectRatioHint`, floors and floor heights). AI-generated programs often omit circulation — typically there is a foyer and an upstairs landing but no ground-floor hall. Add the circulation the plan needs and say so.
2. **Fix the stair first.** It must occupy the same rectangle on every floor it serves, so choose its position with *both* floors in mind: next to the ground-floor hall/foyer, and where the upstairs landing can stay short.
3. **Lay out circulation, then rooms around it.** Decide the hall/landing geometry and what each end opens onto before placing rooms.
4. **Place rooms** on the grid, zero gaps within a floor's footprint (see rules below).
5. **Run the checker** (`scripts/check_layout.mjs`) and fix every error. Warnings need a reason you can state.
6. **Explain the plan in words** before or while applying it: footprint, what's on each side of the circulation, the movement loop, and every area deviation with its reason.
7. **Apply it as one undoable step** (see "Applying a layout in SOAP") and screenshot each floor to confirm.

## Rules

### Circulation and access (most important)

- **Every room opens onto circulation** (hall, foyer, landing) or onto an open-plan living zone, through a shared wall of at least **0.9 m** (room for a door). "Circulation" includes the stair only as a way between floors — never route access to a room *through* the stair space.
- **Only subordinate rooms may be reached through another room:** an ensuite through its bedroom, a walk-in closet through a bedroom, a pantry off a kitchen. An office, laundry, WC, bedroom or family bathroom must not depend on passing through another room.
- **No dead-end corridors.** Both ends of every corridor must land on a destination: the entrance/foyer or an exterior door, a room door on the corridor's axis, the stair, or an open-plan space. A corridor that stops at a blank or exterior wall is wrong even if rooms open off its sides.
- **Prefer loops.** On the ground floor, let the hall connect the foyer to the kitchen (or another open-plan room) so there is a circuit, e.g. foyer → hall → kitchen → dining → living → foyer.
- **Keep corridors short.** Upstairs, a short landing between the stair and a bedroom door (≈3 m) beats a long spine. Circulation coming in under the program's area is a good result, not a failure — report it as freed area.
- **Widths:** corridors 1.0–1.5 m (1.2 m is ideal but falls off the 0.5 m grid, so use 1.0 for a short landing, 1.5 for a main hall). Foyer at least 2 m deep.

### Zoning

- Entrance and foyer on the street/south facade; guest WC off the foyer.
- Living, dining and kitchen as one connected open-plan chain; kitchen next to dining.
- Service rooms (kitchen, laundry, WC, bathrooms) clustered, and wet rooms stacked above each other across floors where possible.
- Home office off the hall, not off a family room or the stair.
- Bedrooms on upper floors in residential projects; master bedroom with its ensuite.
- `daylightReq: 'perimeter'` rooms touch an exterior wall; `'core'` rooms (bathrooms, laundry, halls, storage) may be internal.

### Geometry

- Units are meters on a **0.5 m grid**; every x, y, width and height is a multiple of 0.5.
- Rectangles only, no overlaps on a floor, no internal gaps. Upper floors may have a smaller or notched footprint (roof below), but never holes inside the plan.
- Minimum usable dimensions: bedrooms ≥ 3 m, bathrooms ≥ 1.5 m, WC ≥ 1.5 × 2 m, corridors ≥ 1.0 m.
- Areas within about ±10–15 % of the program. Larger deviations are acceptable only with a stated reason (e.g. keeping a WC at a usable 1.5 m width). Circulation may be smaller than programmed.
- Stair size: a U-shaped stair for ~3.5–4 m floor-to-floor fits roughly 2.5–3 m × 3–4 m. Set `stairParams.config` to match the shape you drew.

### Site

- If the project has a site (`siteProperties.boundary`, in world **meters**, not pixels), every non-outdoor space must sit inside the boundary, above-ground spaces must also stay inside the setback line, and nothing (basements included) may overlap a no-build zone (`siteProperties.zones`).
- Setbacks: `constraints.defaultSetback`, overridden per edge by `constraints.edgeSetbacks[i]` (edge i runs from boundary vertex i to i+1). Also respect `maxHeight` (m), `maxCoverage` (% of site area) and `maxFAR`; the app's Site panel reports all three.
- Orient the plan to the site: entrance toward the street edge, living spaces toward the sun (use `northAngle`), service rooms toward the less valuable edges.

## Checker script

`scripts/check_layout.mjs` checks a SOAP project file: overlaps, grid alignment, area deviations, access to every room, and whether each corridor end lands on something. Run it on the project JSON before applying:

```bash
node .claude/skills/soap-space-planning/scripts/check_layout.mjs path/to/project.json
```

It exits non-zero if there are errors, including site errors (outside the boundary, inside a setback, in a no-build zone) when the project has a site boundary. It identifies circulation by `zone === 'Circulation'` or names containing hall/corridor/landing/foyer/lobby, and subordinate rooms by names containing ensuite/en-suite/walk-in/closet/pantry — rename or set zones accordingly if it misclassifies something. It can also run in the browser: paste the file's `checkLayout` function and call it on the autosave (`JSON.parse(localStorage.getItem('SOAP_PROJECT_AUTOSAVE'))`).

## Applying a layout in SOAP

- Room geometry in SOAP is stored in **pixels: 20 px = 1 m** (`PIXELS_PER_METER`). Convert when writing `x`, `y`, `width`, `height`; set `isPlaced: true`, `floor`, `shape: 'rect'`, and clear `polygon`/`rotation`.
- A vertical connection (`spaceType: 'verticalConnection'`) is **one room** that appears on every floor from `vcFromFloor` to `vcToFloor`; place it once on its lowest floor.
- Apply the whole layout as a **single undoable step** by loading it as a project file: build the full project JSON (version 2, see `utils/projectStore.ts`) and feed it to the app's hidden `<input type="file">`, which goes through `loadProject` and records one undo entry. Setting `localStorage` directly bypasses undo and the running app's state.
- **Save the project JSON to a file** as well (e.g. in the scratchpad). The built-in browser pane's storage can be wiped when the dev server is relaunched — that has already cost one project and a saved API key in this repo.
- Vite serves the app on **port 3000** (`vite.config.ts`). Browser storage is per origin, so opening a different port shows an empty project.
