# Interactive Irrigation Mapping

Portable web-based GPS and operations mapping for Android and desktop field use. It is a static site, so there is no build step and no backend server.

## Current model

The app now separates **work overlays** from **trail flags**.

### Work overlays

These are selectable visibility layers:

- **Mowing**
- **Spraying**
- **Brush / POI / hazard cutting**

Mowing and spraying are road/stretch overlays. Brush / POI / hazard cutting is a point overlay for head gates, checks, valves, washouts, hazards, problem spots, POIs, and other marked locations needing cut out or cleared.

### Trail flags

These are not separate overlay toggles. They modify how a trail is styled and used by logistics:

- **O/M road**
- **Daily rider travel**

Daily rider travel is a color/style flag on the road, not a separate overlay.

## Key features

- Interactive Leaflet/OpenStreetMap map.
- Android browser GPS through `navigator.geolocation.watchPosition()`.
- Follow-me mode and GPS breadcrumb tracking.
- Manual trail drawing without driving the trail.
- Freehand and point-to-point drawing.
- Ditch rider zones: Ride 1, Ride 2, Ride 4, Ride 5, Ride 6, Ride 7, Ride 8, Ride 10.
- Work overlays for mowing, spraying, and brush / POI / hazard cutting.
- Trail flags for O/M roads and daily rider travel.
- Color/symbol key using the **Key** button.
- Collapsible main control panel using the **Panel** button.
- Logistics panel with nearest O/M-road entry and rough work-day planning.
- Asset markers for head gates, valves, boxes, checks, culverts, crossings, washouts, spray areas, hazards, problem spots, POIs, and notes.
- Last 10 saved list for quick local recall.
- Admin page for editing or removing incorrect Last 10 saved records.
- GeoJSON import for routes, roads, POIs, and boundaries.
- App shell and recently viewed map tiles cache for limited offline use.

## Enable GitHub Pages

1. Open this repo on GitHub.
2. Go to **Settings**.
3. Open **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`.
6. Save.

The app should publish at:

```text
https://snow663.github.io/Interactive-Irrigation-Mapping/
```

The admin page should publish at:

```text
https://snow663.github.io/Interactive-Irrigation-Mapping/admin.html
```

## Basic field workflow

1. Open the app on Android Chrome or desktop.
2. Press **Use My Location** when GPS is needed.
3. Use **Panel** to hide/show the control panel.
4. Use **Key** to show/hide the color and symbol legend.
5. Pick visible work overlays: mowing, spraying, or brush / POI / hazard cutting.
6. Pick a zone before drawing, marking assets, or logging work.
7. Draw O/M roads with freehand or point-to-point mode.
8. Tag a trail as mowing, spraying, O/M road, and/or daily rider travel before saving.
9. Add head gates, checks, valves, hazards, POIs, and washouts as asset markers. Leave **Needs brush / hazard cutting** checked when that point needs cut out.
10. Use **Nearest O/M Entry** to find the closest saved O/M-road endpoint to your current GPS point or map center.
11. Use **Plan Work** to build a rough mowing, spraying, or brush-cutting plan for the hours available.

## Logistics notes

The logistics helper is intentionally simple and local. It uses saved O/M-road endpoints, rough distances, estimated work minutes, average logged minutes when available, and a default field travel speed estimate. It does not yet perform true road-network routing.

For best results:

- Save road stretches with realistic estimated minutes.
- Flag real O/M roads with **O/M road**.
- Flag daily rider travel roads with **Daily rider travel**.
- Log work time when finished so the average-time estimate improves.

## Admin maintenance

Use **Admin** from the top bar or open `/admin.html` directly.

The admin page can:

- Edit Last 10 saved type/title/zone/details.
- Delete a single Last 10 saved entry.
- Clear the whole Last 10 saved list.

It does not delete map trails, assets, GPS tracks, work logs, or zone status. It only edits the local recent-saves list in the current browser/device.

## Important storage note

All data is stored in browser local storage on that device. Another phone or PC will not automatically have the same data unless you import or recreate it there. Clearing browser data can remove saved tracks, trails, assets, logs, zone status, and recent entries.

## Spraying note

The app has a spraying overlay and spraying work type for local recall/logging. Treat this as a field recall tool, not a guaranteed compliance record system. Product labels, agency requirements, employer forms, and state/federal recordkeeping rules still control what must be recorded.

## File layout

```text
index.html                  Main map app
admin.html                  Local admin page for Last 10 saved
manifest.webmanifest        PWA install metadata
service-worker.js           Offline shell and tile cache
assets/icon.svg             App icon
src/app.js                  Map, GPS, storage, drawing, overlays, flags, logistics
src/admin.js                Admin page local-storage editor
src/style.css               Mobile/desktop responsive layout
```

## Local testing

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```
