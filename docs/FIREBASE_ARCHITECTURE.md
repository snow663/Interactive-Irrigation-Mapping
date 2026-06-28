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
- Device-scoped backup ZIP metadata
- Firebase Storage objects for cache backup ZIP files

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
  canImportBackup
  canExportBackup
  canRestoreBackup
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

/orgs/{orgId}/devices/{deviceId}/backups/{backupId}
  deviceId
  fileName
  storagePath
  createdAt
  importedAt
  createdBy
  appVersion
  schemaVersion
  recordCounts
  sha256
  sizeBytes
  restoreStatus
  restoreNotes
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

## Field data persistence rule

Field data must be stored immediately when the user applies it on the page.

Examples of field actions:

- Mark zone visited
- Mark zone complete
- Start work timer
- Stop/save work timer
- Add log note
- Mark brush/POI/hazard cut
- Mark road stretch mowed
- Mark road stretch sprayed
- Add observation/problem note
- Save recent activity item

Every field action follows this write path:

```text
User taps/apply/saves field action
  -> create immutable local activity record
  -> write record to durable local cache immediately
  -> add record to pending sync queue if Firestore is unavailable
  -> update visible page state from the saved local record
  -> push to Firestore when online/authenticated/allowed
  -> mark queued record as synced after Firestore confirms write
```

Rules:

- Field data is not only stored during backup.
- Field data is not only stored when the page closes.
- Field data is not only stored during manual sync.
- The UI should not display an action as saved until the local durable write succeeds.
- Firestore sync can lag behind local storage, but local persistence cannot lag behind the page action.
- Offline field work must keep operating by writing to local cache and queueing sync operations.
- Each field record keeps its own unique ID, device ID, timestamp, and sync status.
- A failed Firestore write must leave the local record intact and marked as pending.

Recommended record states:

```text
local-only
pending-sync
syncing
synced
sync-conflict
sync-failed
```

This makes local cache the immediate field truth on that device, while Firestore becomes the shared truth after sync succeeds.

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

## Local cache ZIP backup and restore

The app should support an explicit **Backup Local Cache** action and an explicit **Import Backup ZIP** action.

This is separate from normal Firestore sync. Normal sync handles day-to-day records. ZIP backup is for disaster recovery, device replacement, offline archiving, and manual transfer.

### Export backup ZIP

A device with `canExportBackup` can create a ZIP of its local cache.

The ZIP should include:

```text
manifest.json
local-cache.json
queued-writes.json
activity.json
recent.json
definitions-snapshot.json
device-profile.json
attachments/
```

Recommended contents:

- `manifest.json`: backup ID, app version, schema version, device ID, created timestamp, counts, and SHA/checksum metadata.
- `local-cache.json`: complete local IndexedDB/localStorage cache state.
- `queued-writes.json`: unsynced pending write queue.
- `activity.json`: device-scoped activity records.
- `recent.json`: Last 10 / recent operational history.
- `definitions-snapshot.json`: copy of shared definitions at time of backup.
- `device-profile.json`: device role/permissions snapshot.
- `attachments/`: optional future photos, documents, or exported reports.

### Firebase backup upload

A device with `canExportBackup` can upload the ZIP to Firebase Storage under its assigned device ID.

Storage path:

```text
/orgs/{orgId}/devices/{deviceId}/backups/{backupId}.zip
```

Firestore metadata path:

```text
/orgs/{orgId}/devices/{deviceId}/backups/{backupId}
```

The Firestore metadata stores file name, storage path, size, checksum, created time, app version, schema version, record counts, and restore status.

### Import backup ZIP

A device with `canImportBackup` can select a ZIP file and inspect it before applying it.

Import flow:

1. Read `manifest.json`.
2. Verify schema version compatibility.
3. Verify backup device ID.
4. Show counts and warning summary before restore.
5. Let user choose restore mode.
6. Upload original ZIP to Firebase Storage if allowed.
7. Write backup metadata to Firestore.
8. Apply the chosen restore mode locally and/or to Firestore.

### Restore modes

Supported restore modes should be explicit:

```text
Preview only
Restore local cache only
Merge activity only
Restore queued writes only
Admin restore definitions snapshot
Full device restore
```

Rules:

- Field devices may restore local cache and their own activity only.
- Field devices may not overwrite shared definitions.
- Admin devices may restore shared definitions from `definitions-snapshot.json`, but only with confirmation.
- Imported activity should keep original IDs to prevent duplicate records.
- If a duplicate ID exists, keep the newest record or show a conflict report.
- Queued writes should not be blindly replayed if they target disabled zones/trails/markers.

### Backup conflict policy

Activity is append-style and device-scoped, so activity restore should be a merge, not a destructive replace.

Shared definitions are not append-style, so definition restore must be admin-only and treated as a dangerous operation.

### Device replacement flow

If a phone is replaced:

1. Admin creates or reassigns a device ID.
2. New phone signs in.
3. Admin grants restore permission.
4. New phone imports the old ZIP.
5. App restores local cache and activity for that assigned device ID.
6. App resumes normal Firestore sync.

### Manual archive flow

At the end of a week/month/season, an admin can create a local ZIP archive and upload it to Firebase Storage for historical preservation without applying it as a restore.

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
  "canImportBackup": true,
  "canExportBackup": true,
  "canRestoreBackup": false,
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
  "canImportBackup": true,
  "canExportBackup": true,
  "canRestoreBackup": true,
  "allowedOverlays": ["mowing", "spraying", "brush", "zones", "dailyTravel"]
}
```

## Migration phases

### Phase 1: Current prototype

- GitHub Pages
- Local storage
- GitHub JSON sync for definitions
- Local activity tracking
- Manual/local backup concept only

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
- backup metadata

### Phase 4: Auth and permissions

- Add Firebase Auth
- Gate admin tools behind permissions
- Assign device profiles
- Restrict field devices to their allowed overlays/zones
- Gate backup import/export/restore with device permissions

### Phase 5: Backup and restore implementation

- Export local cache ZIP
- Import local cache ZIP
- Upload backup ZIP to Firebase Storage
- Write backup metadata to Firestore
- Restore local cache and device activity
- Admin-only restore for shared definitions

### Phase 6: Backend automation

Optional later tools:

- scheduled backups
- report exports
- stale-work warnings
- daily/weekly summaries
- Firestore-to-GitHub snapshot backups
- backup retention cleanup

## Hard rules

- GitHub remains the source of code, not the live activity database.
- Firestore becomes the source of live shared field data.
- Firebase Storage stores uploaded ZIP backup objects.
- Local storage remains an offline cache and pending-write queue.
- Field data must be persisted locally immediately when applied on the page.
- Field UI must update from saved local records, not from unsaved transient state.
- Firestore sync may be delayed, but local field persistence may not be delayed.
- Field devices never edit shared map definitions unless explicitly authorized.
- Field devices never restore shared definitions.
- Activity logs are append-style and device-scoped.
- Admin definitions and field activity are separate data domains.
- Backup ZIPs are device-scoped and permission-gated.
