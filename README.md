# Interactive Irrigation Mapping

Portable web-based GPS and operations mapping for Android and desktop field use. It is currently a static prototype with no build step and no backend server.

## Current model

The app now has a hard split between **Admin definition mode** and **Field operations mode**.

### Admin definition mode

Use `admin.html` to create and correct locked map definitions:

- Map coverage boundary / page edge
- Zones
- Zone boundaries
- Trails / O/M roads
- Mowing trail overlay membership
- Spraying trail overlay membership
- O/M road flags
- Daily rider travel flags
- Markers / POIs / hazards
- Brush / POI / hazard cutting flags

Admin also still edits the **Last 10 saved** list when a recent operational entry needs corrected or removed.

### Field operations mode

Use `index.html` for daily work. Field mode can:

- Start/stop GPS
- Show/hide overlays
- Find the nearest O/M-road entry
- Build a rough work plan
- Mark a zone visited
- Mark a zone complete
- Start/stop work timers
- Add operational log notes

Field mode does **not** create, edit, or delete zones, trails, or markers. That prevents accidental map-definition changes while working.

## Locked target architecture

The long-term production target is documented in [`docs/FIREBASE_ARCHITECTURE.md`](./docs/FIREBASE_ARCHITECTURE.md).

Hard rules:

- GitHub is the source of code, documentation, deployment workflows, and optional seed/backup scripts.
- Firebase Hosting is the intended production hosting target.
- Firestore is the durable shared source of record for live field data.
- Local storage / IndexedDB is a fast-load cache, offline working copy, and pending-write outbox.
- Local cache is not the only reliable storage plan.
- New field data must be saved locally immediately when applied on the page, queued immediately, and pushed to Firestore as soon as the device is online, authenticated, and allowed to write.
- Field UI must show whether records are synced or still pending cloud upload.
- Backup ZIP export/import is a recovery/archive/manual-transfer layer, not the normal data-storage path.

## Map coverage boundary / page edge

The special zone `map-coverage` defines the field map page edge.

Think of it as the edge of the paper: everything useful should be inside it, and the field app should avoid showing more map than needed outside it.

- It is selectable/editable in Admin like a zone.
- It should contain all Ride zones.
- It is drawn as the outside boundary in Field mode.
- It is not used as a normal work/logging zone in Field mode.
- Field map panning is constrained to this boundary.
- Field map zoom-out is constrained so the phone cannot keep zooming out into unnecessary outside-map area.

The prototype default coverage boundary is intentionally broad. Redraw `map-coverage` in Admin once the real district coverage area is known.

## Work overlays

These are selectable visibility layers:

- **Mowing**
- **Spraying**
- **Brush / POI / hazard cutting**
- **Zone boundaries**

Mowing and spraying are road/stretch overlays. Brush / POI / hazard cutting is a point overlay for head gates, checks, valves, washouts, hazards, problem spots, POIs, and other marked locations needing cut out or cleared.

## Trail flags

These are not separate overlay toggles. They modify how a trail is styled and used by logistics:

- **O/M road**
- **Daily rider travel**

Daily rider travel is a color/style flag on the road, not a separate overlay.

## Enable GitHub Pages

1. Open this repo on GitHub.
2. Go to **Settings**.
3. Open **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`.
6. Save.

The field app should publish at:

```text
https://snow663.github.io/Interactive-Irrigation-Mapping/
```

The admin page should publish at:

```text
https://snow663.github.io/Interactive-Irrigation-Mapping/admin.html
```

## Admin JSON formats

### Zone

```json
{
  "id": "ride1",
  "name": "Ride 1",
  "notes": "optional notes",
  "boundary": [
    { "lat": 44.0, "lng": -103.0 },
    { "lat": 44.1, "lng": -103.0 },
    { "lat": 44.1, "lng": -103.1 }
  ]
}
```

Boundary is optional. Use three or more points to draw a polygon.

### Map coverage / page edge zone

```json
{
  "id": "map-coverage",
  "name": "Map Coverage Boundary",
  "type": "coverage",
  "notes": "Outer map page edge",
  "boundary": [
    { "lat": 45.2, "lng": -104.35 },
    { "lat": 45.2, "lng": -102.95 },
    { "lat": 44.05, "lng": -102.95 },
    { "lat": 44.05, "lng": -104.35 }
  ]
}
```

Use this as the outer map extent. Keep it large enough to contain all normal Ride zones, but tight enough that the field app does not waste screen space on irrelevant map area.

### Trail / O/M road

```json
{
  "id": "ride1-main-om-road",
  "name": "Ride 1 Main O/M Road",
  "zoneId": "ride1",
  "overlays": { "mowing": true, "spraying": false },
  "flags": { "omRoad": true, "dailyTravel": true },
  "estimatedMinutes": 45,
  "notes": "optional notes",
  "points": [
    { "lat": 44.0, "lng": -103.0 },
    { "lat": 44.01, "lng": -103.02 }
  ]
}
```

Use at least two points. O/M road endpoints are used by **Nearest O/M Entry**.

### Marker / POI / hazard

```json
{
  "id": "headgate-101",
  "name": "Head Gate 101",
  "type": "head-gate",
  "zoneId": "ride1",
  "lat": 44.0,
  "lng": -103.0,
  "needsBrush": true,
  "notes": "clear brush around gate"
}
```

Marker types currently include `head-gate`, `valve`, `box`, `check`, `culvert`, `crossing`, `washout`, `spray-area`, `hazard`, `problem`, `poi`, and `note`.

## Field workflow

1. Open the field app.
2. Use **Panel** to hide/show the field controls.
3. Use **Key** to show/hide the color and symbol key.
4. Select visible overlays.
5. Use **Nearest O/M Entry** to find the closest saved O/M-road endpoint to your GPS point or map center.
6. Use **Plan Work** to build a rough mowing, spraying, or brush-cutting plan for the hours available.
7. Use daily operations buttons for visits, completions, work timers, and log notes.

## Logistics notes

The logistics helper is intentionally simple and local. It uses saved O/M-road endpoints, rough distances, estimated work minutes, average logged minutes when available, and a default field travel speed estimate. It does not yet perform true road-network routing.

For best results:

- Define road stretches with realistic estimated minutes.
- Flag real O/M roads with **O/M road**.
- Flag daily rider travel roads with **Daily rider travel**.
- Log work time when finished so the average-time estimate improves.

## Prototype storage note

The current static prototype still uses browser storage and GitHub JSON files. In this prototype stage, another phone or PC will not automatically have the same live field activity unless sync/import/export is used.

The locked production direction is different: Firestore becomes the shared source of record, and local browser storage becomes only a fast-load/offline cache and pending-write queue.

## Spraying note

The app has a spraying overlay and spraying work type for local recall/logging. Treat this as a field recall tool, not a guaranteed compliance record system. Product labels, agency requirements, employer forms, and state/federal recordkeeping rules still control what must be recorded.

## File layout

```text
index.html                         Locked field operations app
admin.html                         Admin definition editor and recent-list maintenance
manifest.webmanifest               PWA install metadata
service-worker.js                  Offline shell and tile cache
data/definitions.json              Prototype shared map definitions
assets/icon.svg                    App icon
docs/FIREBASE_ARCHITECTURE.md      Locked production architecture plan
src/map-extent.js                  Field map page-edge zoom helper
src/field-sync.js                  Prototype definition bootstrap sync
src/app.js                         Field map, GPS, overlays, logistics, operations logging
src/admin.js                       Admin editor, GitHub sync, and recent-list editor
src/style.css                      Mobile/desktop responsive layout
```

## Local testing

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```
