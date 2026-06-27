# Interactive Irrigation Mapping

Portable web-based GPS mapping for Android field use. It is a static site, so there is no build step and no backend server.

## Features

- Interactive Leaflet/OpenStreetMap map.
- Android browser GPS through `navigator.geolocation.watchPosition()`.
- Latitude, longitude, accuracy, speed, heading, and altitude readouts.
- Live location marker with accuracy circle.
- Follow-me mode.
- Breadcrumb GPS track recording.
- Manual trail drawing without driving the trail.
- Freehand draw mode for sketching trails by dragging on the map.
- Point-to-point draw mode for tapping corners, bends, and intersections.
- Named waypoint drops.
- Saved GPS track, drawn trails, and waypoints in browser storage.
- GeoJSON import for routes, roads, POIs, and boundaries.
- GeoJSON and GPX export, including GPS tracks, manually drawn trails, and waypoints.
- Basic PWA install support.
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

## Android use

1. Open the Pages URL in Android Chrome.
2. Press **Use My Location**.
3. Allow location permission.
4. Use **Follow: On** while driving or walking.
5. Use **Drop Waypoint** for gates, washouts, turnouts, crossings, pump sites, problem areas, or route notes.
6. Use **Export GPX** for GPS apps/devices.
7. Use **Export GeoJSON** for SW Maps, QGIS, or web maps.

## Manual trail drawing

Use this when you need to mark a road, trail, ditch bank, access path, or route without physically driving it.

### Freehand Draw

1. Press **Freehand Draw**.
2. Drag your finger or mouse across the map along the trail.
3. Release when the sketch is done.
4. Press **Save Trail**.
5. Name the trail.

Freehand mode locks map panning while it is active so your finger stroke becomes a trail instead of moving the map.

### Point-to-Point

1. Press **Point-to-Point**.
2. Tap each bend, corner, intersection, gate, crossing, or end point.
3. Use **Undo Point** if you tap the wrong spot.
4. Press **Save Trail**.
5. Name the trail.

Point-to-point mode is better for clean road-style routes. Freehand mode is better for rough trails, washouts, or organic paths.

### Clearing data

- **Clear GPS Track** removes only the driven/walked breadcrumb track.
- **Clear Drawn Trails** removes only manually drawn trails.
- Waypoints stay unless browser storage is cleared.

## Important GPS note

Browser GPS only works from HTTPS or localhost. GitHub Pages works because it serves over HTTPS. Opening `index.html` directly from Android file storage usually will not allow location permission.

## Data note

Saved tracks, drawn trails, and waypoints are stored in that browser on that device. Export before clearing browser data or switching phones.

## File layout

```text
index.html                  App shell
manifest.webmanifest        PWA install metadata
service-worker.js           Offline shell and tile cache
assets/icon.svg             App icon
src/app.js                  Map, GPS, storage, drawing, import, export, UI logic
src/style.css               Mobile-first layout
```

## Local testing

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```
