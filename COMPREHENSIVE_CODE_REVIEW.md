# Comprehensive System Review: Stash App

## 📊 Executive Summary
The application has a robust "Prosumer" architecture with strong data safety foundations (ACID compliance, Soft Deletes, Recursive Operations). However, it currently falls short of "Enterprise" standards primarily due to lifecycle gaps in **File Versioning**, **Upload Resilience**, and **Collaboration**.

---

## 1. 🟢 Items: Notes & Rich Text
*   **Code Quality:** 9/10 (Excellent)
*   **Architecture:** Uses `Tiptap` (Headless Wrapper) for a robust, block-based editor. The Toolbar logic in `RichTextEditor.tsx` is clean and extensible.
*   **Data Integrity:**
    *   ✅ `dbAdapters.ts` ensures `content` is always safely parsed from JSONB to `{ text: '', checklist: [] }`.
    *   ✅ `useEffect` in the editor correctly handles external updates (e.g., coming from Realtime sync).
*   **UX/Performance:**
    *   ⚠️ **Risk:** `QuickAddModal` relies on local state `content` and only calls `addItem`/`updateItem` on "Save". If the browser crashes or the user accidentally clicks outside (and closes modal without saving), work is lost.
    *   **Recommendation:** Implement "Drafts" in `localStorage` for open modals.

## 2. 🟡 Items: Files & Images (The Critical Gap)
*   **Code Quality:** 6/10 (Needs Improvement)
*   **Architecture:** Direct upload to Supabase Storage with signed URLs for privacy.
*   **Data Integrity:**
    *   ✅ `withRetry` logic in `supabase.ts` handles transient network blips.
    *   ✅ `deleted_at` soft deletes work well.
    *   ❌ **No Versioning:** The system creates a *new* item for every upload. There is no code path to "Update File Content" (replace `v1.pdf` with `v2.pdf`). This breaks "Enterprise" workflow (sharing a persistent link to a document).
    *   ❌ **Zombie Files:** `CaptureEngine` creates an *optimistic* item with a temporary path (`pending/...`). If the upload fails or tab closes, this item remains in the DB forever as a broken link.
*   **UX/Performance:**
    *   ⚠️ **Upload Blocking:** `DragDropOverlay` has a `CONCURRENCY_LIMIT` of 5 (Good), but there is no global "Upload Manager" UI to pause/resume or see progress after the toast disappears.

## 3. 🟢 Items: Folders
*   **Code Quality:** 10/10 (Fixed & Robust)
*   **Architecture:** Recursive CTEs in SQL (`copy_folder_recursive`, `delete_folder_recursive`) make folder operations atomic and fast.
*   **Data Integrity:**
    *   ✅ Circular dependency checks prevent moving a folder into itself.
    *   ✅ `child_count` is maintained via triggers (verified in schema).

## 4. 🟡 Tasks & Scheduling
*   **Code Quality:** 8/10 (Solid)
*   **Architecture:** `schedulerEngine.ts` handles complex logic (recurrence, working hours, timezone).
*   **Data Integrity:**
    *   ✅ `adaptTaskRow` correctly migrates legacy fields (`one_time_at` -> `scheduled_at`).
    *   ⚠️ **Sync Fragility:** `GoogleSyncQueue` uses a simple `setTimeout` debounce. If the user edits a task and immediately closes the tab (< 2s), the sync job is lost. It does *not* persist the queue to `localStorage` (unlike `persistentQueue.ts` for DB).
*   **UX/Performance:**
    *   ✅ `TasksView` uses `useMemo` efficiently to prevent re-renders.

## 5. 🔵 Realtime & Sync
*   **Code Quality:** 9/10
*   **Architecture:** Hybrid approach. `useRealtimeSubscription` listens for server changes, while `persistentQueue` handles offline-to-online writes.
*   **Robustness:**
    *   ✅ `useAuth.ts` correctly handles "Token Refresh" vs "Identity Change" to prevent infinite loops.
    *   ✅ `adaptItemRow` sanitizes all incoming data, preventing crashes from schema mismatches.

---

## 🚀 "Enterprise" Upgrade Plan (Prioritized)

To move from "Prosumer" to "Enterprise", we must address the identified gaps in this order:

### Priority 1: File Versioning (The "Update" Button)
**The Fix:**
1.  Add a "Replace File" button in the Item Detail view.
2.  Update backend to *keep* the `id` but change the `file_meta`.
3.  (Optional) Log the old file path in `item_versions` for rollback.

### Priority 2: Upload Resilience (No Zombie Files)
**The Fix:**
1.  Switch to a robust `UploadManager` that persists pending uploads to IDB.
2.  Only create the Item in DB *after* the file is safely in the "Staging" bucket area, or use a "Draft" status that is hidden from main views until success.

### Priority 3: Google Sync Persistence
**The Fix:**
1.  Make `GoogleSyncQueue` write its queue to `localStorage` just like `persistentQueue`.
2.  On app load, check for pending Google Sync jobs and resume them.

### Priority 4: Search Inside Files
**The Fix:**
1.  Trigger an Edge Function on file upload to perform OCR/Text Extraction.
2.  Store extracted text in `items.content->'extracted_text'`.
3.  Update the `search_items` RPC to query this field.

---

### Immediate Action
I recommend starting with **Priority 1 (File Versioning)**. It is the most user-facing gap preventing "Drive-like" usage.
