# Offline Mode Implementation Plan

## Overview

This document outlines the plan to make SimplifyDrive's offline mode fully functional with FastAPI backend integration. The goal is to enable users to work with documents even without internet connectivity, with automatic sync when back online.

---

## Implementation Status

> **Last Updated:** 2024-12-16

| Phase | Component | Status |
|-------|-----------|--------|
| Phase 1 | Backend Models | ✅ Complete |
| Phase 1 | Backend Service | ✅ Complete |
| Phase 1 | Backend Routes | ✅ Complete |
| Phase 1 | Database Migration | ✅ Complete |
| Phase 2 | Frontend API Service | ✅ Complete |
| Phase 2 | Enhanced IndexedDB | ✅ Complete |
| Phase 3 | OfflineDocumentsPanel | ✅ Complete |
| Phase 3 | SyncStatusDialog | ✅ Complete |
| Phase 3 | ConflictResolutionModal | ✅ Complete |
| Phase 3 | DocumentGrid Enhancement | ✅ Complete |
| Phase 4 | SimplifyDrive Integration | ✅ Complete |
| Phase 4 | Testing | ⏳ Pending |

---

## Current State Analysis

### What Exists (Frontend)

| Component | Location | Status |
|-----------|----------|--------|
| `useOfflineMode` hook | `src/hooks/useOfflineMode.ts` | ✅ Complete |
| `offlineStorage` service | `src/services/offlineStorage.ts` | ✅ Complete |
| IndexedDB setup | `offlineStorage.ts` | ✅ Complete |
| Online/Offline indicator | `SimplifyDriveHeader.tsx` | ✅ Complete |
| Sync queue system | `offlineStorage.ts` | ✅ Complete |

### What's Missing (Future Enhancements)

| Component | Description | Priority |
|-----------|-------------|----------|
| Background sync service | Service worker for background sync | 🟡 Medium |
| Offline search | Full-text search on cached documents | 🟢 Low |
| Partial document caching | Cache only metadata for large files | 🟢 Low |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ useOfflineMode  │  │OfflineStorage   │  │OfflineDocsPanel │  │
│  │     (hook)      │  │   (IndexedDB)   │  │      (UI)       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │   OfflineSyncService  │                    │
│                    │  (API Communication)  │                    │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                                 │ HTTP/REST
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                         BACKEND (FastAPI)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  offline_routes │  │ OfflineSyncSvc  │  │ConflictResolver │  │
│  │     (API)       │  │   (Business)    │  │   (Strategy)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │      Supabase DB      │                    │
│                    │    (Source of Truth)  │                    │
│                    └───────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Backend API (Day 1)

#### 1.1 Create Offline Sync Models (`backend/app/models/offline_schemas.py`)
- `OfflineDocumentRequest` - Request to mark document for offline
- `SyncQueueItem` - Structure for queued operations  
- `SyncBatchRequest` - Batch sync request
- `SyncBatchResponse` - Sync result with conflicts
- `ConflictResolution` - Conflict resolution options

#### 1.2 Create Offline Sync Service (`backend/app/services/offline_sync_service.py`)
- `prepare_document_for_offline()` - Prepare document data + file for download
- `sync_batch_operations()` - Process batch of sync operations
- `detect_conflicts()` - Detect version conflicts
- `resolve_conflict()` - Apply conflict resolution strategy
- `get_sync_status()` - Get user's sync status

#### 1.3 Create Offline API Routes (`backend/app/api/offline_routes.py`)
- `POST /api/v1/offline/prepare-download` - Prepare docs for offline download
- `POST /api/v1/offline/sync` - Sync batch operations
- `GET /api/v1/offline/status` - Get sync status
- `POST /api/v1/offline/resolve-conflict` - Resolve specific conflict

### Phase 2: Frontend Service Layer (Day 1-2)

#### 2.1 Create Offline Sync API Service (`src/services/offlineSyncApi.ts`)
- API calls to backend offline endpoints
- Retry logic with exponential backoff
- Request batching for efficiency

#### 2.2 Enhance useOfflineMode Hook (`src/hooks/useOfflineMode.ts`)
- Integrate with new backend endpoints
- Add conflict detection and resolution
- Add batch sync support
- Add progress tracking

### Phase 3: UI Components (Day 2)

#### 3.1 Create Offline Documents Panel (`src/components/offline/OfflineDocumentsPanel.tsx`)
- List of offline documents
- Storage usage display
- Mark/unmark documents for offline
- Sync status per document

#### 3.2 Create Sync Status Dialog (`src/components/offline/SyncStatusDialog.tsx`)
- Sync progress bar
- Pending changes count
- Conflict list with resolution options
- Manual sync trigger

#### 3.3 Create Conflict Resolution Modal (`src/components/offline/ConflictResolutionModal.tsx`)
- Side-by-side comparison
- Keep local / Keep server / Merge options
- Batch resolution support

#### 3.4 Enhance Document Card (`src/components/simplify-drive/DocumentCard.tsx`)
- Offline indicator badge
- Download for offline button
- Sync status indicator

### Phase 4: Integration (Day 3)

#### 4.1 Integrate into SimplifyDrive
- Add offline panel toggle
- Connect sync status to header
- Add keyboard shortcuts for offline operations

#### 4.2 Service Worker Setup
- Background sync registration
- Push notifications for sync completion
- Offline fallback page

---

## File Structure

```
backend/
├── app/
│   ├── models/
│   │   └── offline_schemas.py          # New: Offline mode schemas
│   ├── services/
│   │   └── offline_sync_service.py     # New: Sync business logic
│   └── api/
│       └── offline_routes.py           # New: Offline API endpoints

src/
├── services/
│   ├── offlineStorage.ts               # Existing: IndexedDB operations
│   └── offlineSyncApi.ts               # New: Backend API calls
├── hooks/
│   └── useOfflineMode.ts               # Existing: Enhanced with sync
├── components/
│   └── offline/
│       ├── OfflineDocumentsPanel.tsx   # New: Offline docs management
│       ├── SyncStatusDialog.tsx        # New: Sync progress dialog
│       └── ConflictResolutionModal.tsx # New: Conflict resolution UI
```

---

## API Specification

### 1. Prepare Documents for Offline

```http
POST /api/v1/offline/prepare-download
Content-Type: application/json

{
  "user_id": "uuid",
  "document_ids": ["doc1", "doc2"]
}

Response:
{
  "success": true,
  "documents": [
    {
      "id": "doc1",
      "file_name": "file.pdf",
      "download_url": "signed-url...",
      "metadata": {...},
      "version": 5,
      "last_modified": "2025-12-16T10:00:00Z"
    }
  ]
}
```

### 2. Sync Batch Operations

```http
POST /api/v1/offline/sync
Content-Type: application/json

{
  "user_id": "uuid",
  "operations": [
    {
      "id": "op1",
      "type": "update",
      "table": "documents",
      "data": {...},
      "local_version": 4,
      "timestamp": "2025-12-16T09:00:00Z"
    }
  ]
}

Response:
{
  "success": true,
  "synced": ["op1", "op2"],
  "conflicts": [
    {
      "operation_id": "op3",
      "document_id": "doc1",
      "conflict_type": "version_mismatch",
      "local_version": 4,
      "server_version": 6,
      "local_data": {...},
      "server_data": {...}
    }
  ],
  "failed": []
}
```

### 3. Get Sync Status

```http
GET /api/v1/offline/status?user_id=uuid

Response:
{
  "last_sync": "2025-12-16T10:00:00Z",
  "pending_changes": 3,
  "conflicts": 1,
  "offline_documents": 15,
  "storage_used": 52428800
}
```

### 4. Resolve Conflict

```http
POST /api/v1/offline/resolve-conflict
Content-Type: application/json

{
  "user_id": "uuid",
  "document_id": "doc1",
  "resolution": "keep_local" | "keep_server" | "merge",
  "merged_data": {...}  // Only if resolution is "merge"
}

Response:
{
  "success": true,
  "document": {...},
  "new_version": 7
}
```

---

## Conflict Resolution Strategy

### Version Control
- Each document has a `version` field (integer)
- On every update, version increments
- Offline changes store `local_version` when made

### Conflict Detection
```
if local_version < server_version:
    conflict = true  # Server has newer changes
elif local_version == server_version:
    conflict = false  # Safe to apply
else:
    error  # Invalid state
```

### Resolution Options

| Option | Description | When to Use |
|--------|-------------|-------------|
| `keep_local` | Discard server changes, use offline version | User explicitly wants local changes |
| `keep_server` | Discard local changes, use server version | Server has authoritative data |
| `merge` | Combine both versions | For metadata/tags where both can be kept |

---

## IndexedDB Schema Enhancement

```typescript
interface OfflineDocument {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  metadata: any;
  blob_data?: Blob;
  // New fields
  version: number;          // Server version when downloaded
  local_version: number;    // Local version after edits
  sync_status: 'synced' | 'pending' | 'conflict';
  last_synced_at: string;
  local_changes: ChangeLog[];
}

interface ChangeLog {
  field: string;
  old_value: any;
  new_value: any;
  changed_at: string;
}
```

---

## UI Mockups

### 1. Offline Panel (Sidebar)
```
┌─────────────────────────────┐
│ 📱 Offline Documents        │
├─────────────────────────────┤
│ Storage: 52.4 MB / 500 MB   │
│ ████████░░░░░░░░ 10%       │
├─────────────────────────────┤
│ 🔄 3 pending changes        │
│ ⚠️ 1 conflict               │
│ [Sync Now]                  │
├─────────────────────────────┤
│ 📄 Document1.pdf      ✅    │
│ 📄 Document2.pdf      🔄    │
│ 📄 Document3.pdf      ⚠️    │
│ 📄 Document4.pdf      ✅    │
└─────────────────────────────┘
```

### 2. Conflict Resolution Modal
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Conflict Detected                                    │
├─────────────────────────────────────────────────────────┤
│ Document: Invoice_2025.pdf                              │
│                                                         │
│ ┌─────────────────┐   ┌─────────────────┐              │
│ │  Local Version  │   │ Server Version  │              │
│ │  (Dec 15, 9am)  │   │  (Dec 15, 2pm)  │              │
│ ├─────────────────┤   ├─────────────────┤              │
│ │ Name: Invoice   │   │ Name: Invoice   │              │
│ │ Tags: urgent    │   │ Tags: paid      │              │
│ │ Notes: Review   │   │ Notes: Done     │              │
│ └─────────────────┘   └─────────────────┘              │
│                                                         │
│ [Keep Mine]    [Keep Server]    [Merge Both Tags]      │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps (Detailed)

### Step 1: Backend Models
Create `backend/app/models/offline_schemas.py` with Pydantic models.

### Step 2: Backend Service  
Create `backend/app/services/offline_sync_service.py` with business logic.

### Step 3: Backend Routes
Create `backend/app/api/offline_routes.py` and register router.

### Step 4: Frontend API Service
Create `src/services/offlineSyncApi.ts` for backend communication.

### Step 5: Enhance useOfflineMode
Update hook to use new backend endpoints.

### Step 6: Offline Panel Component
Create UI for managing offline documents.

### Step 7: Sync Status Dialog
Create UI for sync progress and status.

### Step 8: Conflict Resolution Modal
Create UI for resolving conflicts.

### Step 9: Integration
Connect all components to SimplifyDrive.

### Step 10: Testing
End-to-end testing of offline scenarios.

---

## Testing Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Go offline | Turn off network | ☁️ Red indicator, toast shown |
| Offline edit | Edit document while offline | Change queued in IndexedDB |
| Come online | Turn on network | Auto-sync triggered |
| No conflicts | Sync after no server changes | Clean sync, toast "X changes synced" |
| With conflict | Sync after server changes | Conflict modal shown |
| Resolve local | Choose "Keep Mine" | Local version saved to server |
| Resolve server | Choose "Keep Server" | Server version kept |
| Mark offline | Click offline icon on doc | Document cached in IndexedDB |
| Remove offline | Click remove from offline | Document removed from cache |

---

## Estimated Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 4-5 hours | Backend API complete |
| Phase 2 | 3-4 hours | Frontend service layer |
| Phase 3 | 4-5 hours | UI components |
| Phase 4 | 2-3 hours | Integration & testing |
| **Total** | **~15 hours** | Full offline mode |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large file downloads | Compress files, show progress, allow cancel |
| Storage limits | Show usage, auto-cleanup old cached docs |
| Sync failures | Retry with backoff, manual retry option |
| Data loss | Keep local backup until confirmed sync |
| Conflict complexity | Default to server version, let user override |

---

## Success Metrics

- [x] Users can mark documents for offline access
- [x] Documents viewable without internet
- [x] Offline edits sync automatically when online
- [x] Conflicts detected and resolvable
- [x] Storage usage visible and manageable
- [x] Sync status always visible in UI

---

## Implemented Files

### Backend Files

| File | Description |
|------|-------------|
| `backend/app/models/offline_schemas.py` | Pydantic models for offline operations |
| `backend/app/services/offline_sync_service.py` | Business logic for sync and conflict resolution |
| `backend/app/api/offline_routes.py` | FastAPI REST endpoints |
| `supabase/migrations/20251216_add_offline_tables.sql` | Database migration for offline tables |

### Frontend Files

| File | Description |
|------|-------------|
| `src/services/offlineSyncApi.ts` | API client with retry logic |
| `src/services/offlineStorage.ts` | Enhanced IndexedDB with version tracking |
| `src/components/offline/OfflineDocumentsPanel.tsx` | UI for managing offline documents |
| `src/components/offline/SyncStatusDialog.tsx` | Sync progress and status dialog |
| `src/components/offline/ConflictResolutionModal.tsx` | Side-by-side conflict comparison |
| `src/components/offline/index.ts` | Export barrel file |

### Modified Files

| File | Changes |
|------|---------|
| `backend/app/main.py` | Added offline_router registration |
| `src/components/document-manager/DocumentGrid.tsx` | Added offline badge and download option |
| `src/components/simplify-drive/SimplifyDrive.tsx` | Integrated offline panel and sync dialog |
| `src/components/simplify-drive/components/SimplifyDriveHeader.tsx` | Added offline button and sync indicator |
