# Interactive Irrigation Mapping

Portable web-based GPS and operations mapping for Android field use. It is a static site, so there is no build step and no backend server.

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
- Ditch rider zones: Ride 1, Ride 2, Ride 4, Ride 5, Ride 6, Ride 7, Ride 8, Ride 10.
- Trail / road stretch assignment to a zone.
- Estimated minutes per drawn trail / road stretch.
- Work timer for road clearing, spraying, scouting, repairs, ditch rider support, drive time, and other work.
- Zone visited and zone completed tracking.
- Zone summary showing last visited, last completed, completion count, asset count, trail count, log count, total logged time, and average job time.
- Asset markers for head gates, valves, boxes, checks, culverts, crossings, washouts, spray areas, problem spots, and notes.
- Named waypoint drops.
- Saved GPS track, drawn trails, assets, logs, zone status, and waypoints in browser storage.
- Rolling **Last 10 saved** list for quick field recall.
- GeoJSON import for routes, roads, POIs, and boundaries.
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
5. Use **Drop Waypoint** for quick one-off notes.
6. Use **Add Asset Marker** for known infrastructure like gates, valves, boxes, checks, culverts, crossings, washouts, spray areas, and problem spots.
7. Use the **Last 10 saved** panel for quick recall of the most recent saved trails, assets, waypoints, work logs, visits, and completions.

## Operations tracker workflow

### Zones

Select a zone before drawing, adding markers, or logging work. Current built-in zones are:

```text
Ride 1, Ride 2, Ride 4, Ride 5, Ride 6, Ride 7, Ride 8, Ride 10
```

Ride 3 and Ride 9 are intentionally omitted for now because the current field description says those are not used.

### Road / trail stretches

1. Pick the correct **Zone**.
2. Draw the road or access stretch with **Freehand Draw** or **Point-to-Point**.
3. Press **Save Trail**.
4. Name the road/stretch.
5. Enter the estimated minutes it should take to clear, drive, spray, inspect, or work.

Saved trails appear in the **Trail / road stretch** selector for that zone. When you log timed work against that stretch, the map popup will show estimated time, average actual time, and last worked date.

### Work timer

1. Select the **Zone**.
2. Select a **Trail / road stretch**, or leave it as general zone work.
3. Select the **Work type**.
4. Press **Start Work Timer**.
5. Press **Stop / Save Work** when done.
6. Add notes when prompted.

This creates an internal log entry with start time, stop time, duration, zone, trail, work type, and notes. It also creates a visible **Last 10 saved** entry.

### Zone status

- **Mark Zone Visited** records that you were in the zone.
- **Mark Zone Complete** records the zone as completed and increments the completion count.
- The summary panel shows how long it has been since the zone was visited or completed.
- Each visit/completion is also added to the **Last 10 saved** list.

### Asset markers

1. Select the **Zone**.
2. Select the **Asset type**.
3. Pan the map to the location or use your current GPS point.
4. Press **Add Asset Marker**.
5. Name it and add notes.

Asset marker types include head gate, valve, box, check, culvert, crossing, washout, spray area, problem spot, and note.

## Last 10 saved

The app no longer exposes export buttons. Instead, it keeps a rolling visible list of the last 10 saved records inside the portable browser app.

Records currently added to the list:

- Saved trails / road stretches
- Asset markers
- Waypoints
- Work timer saves
- Manual log notes
- Zone visited marks
- Zone complete marks

The list is stored in browser local storage along with the rest of the map data. Opening the same app on another phone/browser will not automatically carry that list over.

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
- Waypoints, assets, logs, zone status, and the recent-saves list stay unless browser storage is cleared.

## Spraying and applicator notes

The app has a **Spraying** work type and local recall/logging. Treat this as a field recall tool, not a guaranteed compliance record system. Product labels, agency requirements, employer forms, and state/federal recordkeeping rules still control what must be recorded.

For spraying logs, use the note prompt to capture details such as product, mix/rate, target weed, road/stretch, weather, wind, acreage or distance, and any restricted-entry or access concerns required by your workplace procedure.

## Important GPS note

Browser GPS only works from HTTPS or localhost. GitHub Pages works because it serves over HTTPS. Opening `index.html` directly from Android file storage usually will not allow location permission.

## Data note

Saved tracks, drawn trails, assets, logs, zone status, waypoints, and the last-10 saved list are stored in that browser on that device. Clearing browser data or switching phones loses that local storage.

## File layout

```text
index.html                  App shell
manifest.webmanifest        PWA install metadata
service-worker.js           Offline shell and tile cache
assets/icon.svg             App icon
src/app.js                  Map, GPS, storage, drawing, operations, import, recent list, UI logic
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
