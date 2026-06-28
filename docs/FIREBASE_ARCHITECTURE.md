# Firebase Target Architecture

This project is locked onto a two-stage architecture:

1. **GitHub for source code and deployment history**
2. **Firebase for hosted app delivery and live multi-device data**

The current GitHub Pages / local-storage / JSON-file setup is the prototype path. The long-term production path is Firebase Hosting plus Firestore.

## Core decision

Do not run `git pull` on a Firebase server. Firebase Hosting is treated as deployed static app hosting, not a shell server.

The deployment path is:

```text
GitHub push to main
  -> GitHub Action
  -> Firebase deploy
  -> Firebase Hosting serves the current app
```

The data path is:

```text
Field/Admin app
  -> Firebase Auth
  -> Firestore
  -> Local offline cache / queued writes
```

## Ownership split

### GitHub owns

- Application source code
- Firebase config files
- Deployment workflows
- Build/deploy history
- Documentation
- Optional seed/default definitions
- Optional backup/export scripts

### Firebase owns

- Shared zones
- Zone boundaries
- Trails / O/M roads
- Markers / POIs / hazards
- Device registry
- Device/user permissions
- Activity logs
- Work backlog
- Last 10 / recent activity records
- Offline sync state

## Firestore collection plan

```text
/orgs/{orgId}
  settings

/orgs/{orgId}/zones/{zoneId}
  name
  notes
  boundary
  enabled
  updatedAt
  updatedBy

/orgs/{orgId}/trails/{trailId}
  name
  zoneId
  points
  overlays: { mowing, spraying }
  flags: { omRoad, dailyTravel }
  estimatedMinutes
  notes
  enabled
  updatedAt
  updatedBy

/orgs/{orgId}/markers/{markerId}
  name
  zoneId
  type
  lat
  lng
  needsBrush
  hazardLevel
  notes
  enabled
  updatedAt
  updatedBy

/orgs/{orgId}/devices/{deviceId}
  name
  userName
  role
  enabled
  assignedZones
  allowedOverlays
  canEditDefinitions
  canWriteActivity
  lastSeenAt

/orgs/{orgId}/activity/{activityId}
  deviceId
  userName
  type
  zoneId
  trailId
  markerId
  timestamp
  durationMinutes
  notes
  syncSource
```

## Device model

Each phone, tablet, or PC gets a persistent device ID.

Examples:

```text
jake-phone
jake-laptop
district-tablet-01
rider-ride6-phone
```

The device record controls what that device can see and do.

Example roles:

```text
admin
foreman
mower
sprayer
rider
viewer
```

Field devices should not edit shared definitions unless the device record explicitly allows it.

## Sync rules

### On field app open

1. Load local offline cache immediately.
2. Authenticate device/user.
3. Pull shared definitions from Firestore.
4. Pull device profile and permissions.
5. Pull recent activity/backlog relevant to that device.
6. Merge any locally queued activity records.
7. Push queued activity records only if the device is allowed to write activity.

### On admin app open

1. Authenticate admin user/device.
2. Pull shared definitions.
3. Pull device registry.
4. Allow definition editing only when `canEditDefinitions` is true.
5. Save edits directly to Firestore with `updatedAt` and `updatedBy` metadata.

### Activity write pattern

Activity records should be append-style and uniquely identified.

Example:

```json
{
  "id": "log-20260627-183015-jake-phone-a82f",
  "deviceId": "jake-phone",
  "timestamp": "2026-06-27T18:30:15.000Z",
  "type": "mowing",
  "zoneId": "ride6",
  "trailId": "ride6-main-om",
  "durationMinutes": 74,
  "notes": "Mowed daily rider travel section only"
}
```

Append-style activity makes offline merge conflicts much less dangerous.

## Overlay/profile model

Different devices may have different feature sets.

Examples:

```json
{
  "deviceId": "rider-ride6-phone",
  "enabled": true,
  "role": "rider",
  "canEditDefinitions": false,
  "canWriteActivity": true,
  "allowedOverlays": ["dailyTravel", "brush"],
  "assignedZones": ["ride6"]
}
```

```json
{
  "deviceId": "jake-phone",
  "enabled": true,
  "role": "admin",
  "canEditDefinitions": true,
  "canWriteActivity": true,
  "allowedOverlays": ["mowing", "spraying", "brush", "zones", "dailyTravel"]
}
```

## Migration phases

### Phase 1: Current prototype

- GitHub Pages
- Local storage
- GitHub JSON sync for definitions
- Local activity tracking

### Phase 2: Firebase Hosting

- Deploy app from GitHub using GitHub Actions
- Keep data model mostly unchanged
- Use Firebase Hosting as the live app target

### Phase 3: Firestore data migration

Move these out of GitHub JSON/local storage and into Firestore:

- zones
- trails
- markers
- devices
- activity
- backlog

### Phase 4: Auth and permissions

- Add Firebase Auth
- Gate admin tools behind permissions
- Assign device profiles
- Restrict field devices to their allowed overlays/zones

### Phase 5: Backend automation

Optional later tools:

- scheduled backups
- report exports
- stale-work warnings
- daily/weekly summaries
- Firestore-to-GitHub snapshot backups

## Hard rules

- GitHub remains the source of code, not the live activity database.
- Firestore becomes the source of live shared field data.
- Local storage remains an offline cache and pending-write queue.
- Field devices never edit shared map definitions unless explicitly authorized.
- Activity logs are append-style and device-scoped.
- Admin definitions and field activity are separate data domains.
