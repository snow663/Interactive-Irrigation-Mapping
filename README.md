# Interactive Irrigation Mapping

Portable web-based GPS mapping for Android field use. It is a static site, so there is no build step and no backend server.

## Features

- Interactive Leaflet/OpenStreetMap map.
- Android browser GPS through `navigator.geolocation.watchPosition()`.
- Latitude, longitude, accuracy, speed, heading, and altitude readouts.
- Live location marker with accuracy circle.
- Follow-me mode.
- Breadcrumb track recording.
- Named waypoint drops.
- Saved track and waypoints in browser storage.
- GeoJSON import for routes, roads, POIs, and boundaries.
- GeoJSON and GPX export.
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

## Important GPS note

Browser GPS only works from HTTPS or localhost. GitHub Pages works because it serves over HTTPS. Opening `index.html` directly from Android file storage usually will not allow location permission.

## Data note

Saved tracks and waypoints are stored in that browser on that device. Export before clearing browser data or switching phones.

## File layout

```text
index.html                  App shell
manifest.webmanifest        PWA install metadata
service-worker.js           Offline shell and tile cache
assets/icon.svg             App icon
src/app.js                  Map, GPS, storage, import, export, UI logic
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
