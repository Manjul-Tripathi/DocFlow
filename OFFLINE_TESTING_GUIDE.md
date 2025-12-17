# Offline Mode Testing Guide

## Prerequisites

1. **Start Backend Server**
   ```bash
   cd backend
   python run.py
   ```

2. **Start Frontend**
   ```bash
   npm run dev
   # or
   bun dev
   ```

3. **Ensure Database Migration**
   - The `20251216_add_offline_tables.sql` migration should be applied to your Supabase database
   - Tables needed: `offline_access`, `document_versions`

---

## Test Scenarios

### Scenario 1: Make Document Available Offline

**Steps:**
1. Go to SimplifyDrive (Documents view)
2. Find a document in the grid/list
3. Click the **three dots (⋮)** menu on any document card
4. Select **"Make Available Offline"** (with CloudDownload icon)
5. Wait for success toast: "Available offline - [filename] is now available offline"

**Expected Results:**
- ✅ Green "Offline" badge appears on the document card (top-right corner)
- ✅ Document is downloaded and stored in browser IndexedDB
- ✅ File blob is cached if document has storage_url
- ✅ Offline counter in header increases by 1

**Verify:**
```javascript
// Open browser DevTools Console and run:
indexedDB.databases().then(dbs => console.log(dbs))
// Should show 'docu-to-form-offline' database
```

---

### Scenario 2: View Offline Documents Panel

**Steps:**
1. Click the **"Offline"** button in the header (next to AI Insights)
2. Panel slides in from the right

**Expected Results:**
- ✅ Shows list of all offline documents
- ✅ Displays storage usage (e.g., "12.5 MB / 100 MB used")
- ✅ Each document shows:
  - File name
  - File size
  - Sync status icon (✓ synced, ⟳ pending, ⚠ conflict)
  - Remove button (X)
- ✅ "Sync All" button (if pending changes exist)
- ✅ "Clear All" button to remove all offline data

---

### Scenario 3: Go Offline and Make Changes

**Steps:**
1. **Simulate offline mode:**
   - Open Chrome DevTools (F12)
   - Go to **Network** tab
   - Enable **"Offline"** checkbox (or select "Offline" from throttling dropdown)
   
   OR
   
   - Disconnect your WiFi/Ethernet

2. Observe the header:
   - Cloud icon turns **red** (CloudOff)
   - Toast appears: "You're offline - Changes will be synced when you're back online"

3. Try to make a change (if implemented):
   - Edit document metadata
   - Add tags
   - Move to folder
   
4. Change is queued in IndexedDB sync queue

**Expected Results:**
- ✅ Red offline indicator shown
- ✅ Offline warning banner/toast appears
- ✅ Changes are saved to IndexedDB queue
- ✅ Pending sync counter increases

---

### Scenario 4: Come Back Online and Auto-Sync

**Steps:**
1. While offline with pending changes, **reconnect** to the internet:
   - Turn WiFi back on
   - OR disable "Offline" in DevTools Network tab

2. Observe automatic sync

**Expected Results:**
- ✅ Cloud icon turns **green**
- ✅ Toast appears: "You're back online - Syncing your changes..."
- ✅ Sync automatically starts
- ✅ Progress shown in sync dialog (if open)
- ✅ Toast after completion: "Sync complete - X changes synced"
- ✅ Pending counter resets to 0

---

### Scenario 5: Manual Sync

**Steps:**
1. Make some offline changes (while actually online or offline)
2. Click the **"Sync"** button in the header (only shows when pending changes > 0)
3. Sync Status Dialog opens

**Expected Results:**
- ✅ Dialog shows:
  - Progress bar during sync
  - "Syncing X/Y changes..."
  - List of conflicts (if any)
- ✅ Each operation synced to backend
- ✅ Success: "All changes synced successfully!"
- ✅ Errors shown if any operations fail

---

### Scenario 6: Conflict Detection and Resolution

**Steps to Create Conflict:**

1. **Make document available offline:**
   - Mark document for offline in SimplifyDrive
   - Document is cached in IndexedDB

2. **Modify document locally (simulate):**
   ```javascript
   // In Browser DevTools Console:
   const db = await idb.openDB('docu-to-form-offline', 3);
   const docs = await db.getAll('documents');
   console.log('Current docs:', docs);
   
   // Modify a document
   const doc = docs[0];
   doc.file_name = "Modified Locally.pdf";
   doc.local_version = doc.version; // Keep local version same
   doc.local_changes = true;
   await db.put('documents', doc);
   
   // Add to sync queue
   await db.add('syncQueue', {
     id: Date.now(),
     operation: 'update',
     table: 'documents',
     data: doc,
     createdAt: new Date(),
     status: 'pending',
     retryCount: 0
   });
   ```

3. **Modify same document on server (via backend or Supabase directly):**
   - Update the document in Supabase database
   - Change `file_name` or other fields
   - Increment `version` field

4. **Trigger sync:**
   - Click "Sync" button in header

**Expected Results:**
- ✅ Conflict detected: `version_mismatch`
- ✅ Sync Status Dialog shows conflicts list
- ✅ Click "Resolve" opens Conflict Resolution Modal

**In Conflict Resolution Modal:**
- ✅ Side-by-side comparison:
  - Left: Local Version (blue highlight)
  - Right: Server Version (purple highlight)
- ✅ Differences highlighted
- ✅ Three resolution buttons:
  - **Keep Local** - Overwrites server with local changes
  - **Keep Server** - Discards local changes
  - **Smart Merge** - Attempts to merge both versions

5. **Choose resolution strategy** and click button

**Expected Results:**
- ✅ Conflict resolved
- ✅ Document updated based on choice
- ✅ Removed from conflict list
- ✅ Toast: "Conflict resolved"

---

### Scenario 7: Remove Document from Offline

**Steps:**
1. Open document dropdown menu (⋮)
2. Select **"Remove from Offline"** (with CloudOff icon)

**Expected Results:**
- ✅ "Offline" badge disappears from document card
- ✅ Document removed from IndexedDB
- ✅ Offline counter decreases
- ✅ Toast: "Removed from offline"

**Verify:**
```javascript
// Browser DevTools Console:
const db = await indexedDB.openDB('docu-to-form-offline', 3);
const docs = await db.getAll('documents');
console.log('Remaining offline docs:', docs.length);
```

---

### Scenario 8: Storage Management

**Steps:**
1. Open Offline Documents Panel
2. Check storage usage bar at top
3. Add multiple documents until approaching limit
4. Click **"Clear All"** button

**Expected Results:**
- ✅ Storage usage shown as progress bar with percentage
- ✅ When nearing limit (>80%), bar turns yellow/red
- ✅ "Clear All" confirmation dialog appears
- ✅ All documents removed from IndexedDB
- ✅ Storage resets to 0 MB
- ✅ Toast: "Offline data cleared"

---

## Testing Checklist

Use this checklist to verify all features:

- [ ] Make document available offline
- [ ] Offline badge appears on document card
- [ ] View offline documents panel
- [ ] Storage usage displayed correctly
- [ ] Go offline (cloud icon turns red)
- [ ] Offline warning shown
- [ ] Come back online (cloud icon turns green)
- [ ] Auto-sync triggers
- [ ] Manual sync via button
- [ ] Sync progress shown
- [ ] Create conflict (modify same doc locally and on server)
- [ ] Conflict detected and listed
- [ ] Open conflict resolution modal
- [ ] Resolve conflict with "Keep Local"
- [ ] Resolve conflict with "Keep Server"
- [ ] Resolve conflict with "Smart Merge"
- [ ] Remove document from offline
- [ ] Clear all offline data
- [ ] Pending sync counter updates correctly
- [ ] Retry logic works for failed syncs

---

## Debugging

### Check IndexedDB Contents

```javascript
// Open Browser DevTools Console

// List all databases
indexedDB.databases().then(console.log);

// Open the offline database
const db = await indexedDB.openDB('docu-to-form-offline', 3);

// View all offline documents
const docs = await db.getAll('documents');
console.table(docs);

// View sync queue
const queue = await db.getAll('syncQueue');
console.table(queue);

// Check storage estimate
navigator.storage.estimate().then(estimate => {
  console.log('Storage used:', (estimate.usage / 1024 / 1024).toFixed(2), 'MB');
  console.log('Storage quota:', (estimate.quota / 1024 / 1024).toFixed(2), 'MB');
  console.log('Percentage:', ((estimate.usage / estimate.quota) * 100).toFixed(2), '%');
});
```

### Check Network Requests

1. Open DevTools Network tab
2. Filter by "offline" or "sync"
3. Look for:
   - `POST /api/v1/offline/prepare-download`
   - `POST /api/v1/offline/sync`
   - `GET /api/v1/offline/status`
   - `POST /api/v1/offline/resolve-conflict`

### Check Backend Logs

```bash
# In backend terminal
# Should see logs like:
# INFO: Preparing 5 documents for offline download
# INFO: Processing sync batch with 3 operations
# WARNING: Conflict detected for document abc123
# INFO: Conflict resolved using keep_local strategy
```

---

## Common Issues

### Issue: "Offline" Button Not Showing

**Solution:**
- Ensure `SimplifyDriveHeader` receives the offline props:
  - `onOfflinePanel`, `onSync`
  - `offlineCount`, `pendingSyncCount`, `isSyncing`

### Issue: Documents Not Downloading

**Check:**
1. Backend server is running on `http://localhost:8000`
2. CORS is configured correctly
3. Document has valid `storage_url`
4. Browser allows file downloads

### Issue: Sync Not Triggering

**Check:**
1. Network status detected correctly
2. Sync queue has items
3. No JavaScript errors in console
4. Backend `/offline/sync` endpoint accessible

### Issue: Conflicts Not Detected

**Check:**
1. Document has `version` field in database
2. Local document has `local_version` field
3. Version numbers actually differ
4. Conflict detection logic in `offline_sync_service.py`

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| IndexedDB | ✅ | ✅ | ✅ | ✅ |
| Online/Offline Events | ✅ | ✅ | ✅ | ✅ |
| Storage API | ✅ | ✅ | ⚠️ Limited | ✅ |
| File Downloads | ✅ | ✅ | ✅ | ✅ |

**Recommended:** Use Chrome or Edge for testing.

---

## Next Steps After Testing

If all tests pass:
1. ✅ Offline mode is fully functional
2. Consider adding service worker for true background sync
3. Implement offline search (search cached documents without network)
4. Add conflict history/audit log
5. Implement partial document caching for large files

If tests fail:
1. Check browser console for errors
2. Verify backend is running and accessible
3. Check database migration applied
4. Review network requests in DevTools
5. Check IndexedDB contents as shown above
