# Master Implementation Plan: Stability & Scalability

**Goal:** Transform "Stash" into an Enterprise-Grade application. This plan combines **Core Stability Fixes** (addressing critical architectural flaws) with **Performance Upgrades** (Virtualization & Search).

---

## Phase 1: Core Stability (The "First 5" Critical Fixes)

*Before optimizing performance, we must ensure data integrity and system reliability.*

### 1. Fix "Ghost Items" (Referential Integrity)
**Problem:** Deleting an item leaves its ID in `tasks.item_ids` and `lists.items`, causing crashes.
**Solution:** Database Trigger.
*   **Action:** Create a Postgres trigger `on_item_delete` that automatically scans `tasks` and `lists` and removes the deleted ID from their arrays.
*   **Why:** Guarantees consistency at the database level, regardless of how the deletion happened (API, App, Admin Panel).

### 2. Fix "Black Hole Folders" (Circular Dependency)
**Problem:** Moving a folder into itself makes it vanish.
**Solution:** Validation Logic.
*   **Action:** Update `moveItems` in `dataSlice.ts`. Before moving, run a check: `if (targetFolderId is inside movedFolderId) throw Error`.
*   **Why:** Prevents data loss and "orphan" records.

### 3. Fix "Freezing Brain" (Server-Side Recursion)
**Problem:** Browser freezes when deleting folders with 1,000+ items.
**Solution:** Move logic to Database.
*   **Action:** Create a Supabase RPC function `delete_folder_recursive(folder_id)`.
*   **Why:** The database can find and delete 1,000 related rows in milliseconds; the browser takes seconds/minutes.

### 4. Fix "Panic Button" (Sync Rollback)
**Problem:** One sync error wipes all offline changes.
**Solution:** Dead Letter Queue.
*   **Action:** Update `persistentQueue.ts`. If an operation fails with a 400 error (permanent), move it to a `failed_operations` list instead of triggering `loadUserData()`. Alert the user: "1 change failed to sync".
*   **Why:** Preserves the user's hard work while isolating the bad data.

### 5. Fix "Upload Risk" (Orphaned Files)
**Problem:** Uploading a file before creating the database record risks orphaned files if the app crashes.
**Solution:** Optimistic Record Creation.
*   **Action:** Create the Item Record in the DB *first* (status: 'uploading'). Then upload the file. Finally, update status to 'complete'.
*   **Why:** Even if the upload fails, we have a record of the attempt and can show a "Retry" button.

---

## Phase 2: Performance (Virtualization)

**Problem:** Rendering 1,000+ DOM nodes crashes the browser.

### 1. Standardize Item Card
*   **Action:** Update `ItemCard.tsx` to support a `variant="grid"` with fixed dimensions (e.g., 200px height) for uniform rendering.

### 2. Implement `react-window`
*   **Action:** Refactor `MainCanvas.tsx`:
    *   **Grid View:** Use `FixedSizeGrid` for high-performance rendering of thousands of items.
    *   **List View:** Use `FixedSizeList`.
    *   **Auto-Sizing:** Wrap in `react-virtualized-auto-sizer` to handle responsive layouts.

---

## Phase 3: Scalability (Server-Side Search)

**Problem:** Client-side search fails with large datasets.

### 1. Database Migration
*   **Action:** Enable `pg_trgm` extension. Add GIN indices to `items(title, content)` and `tasks(title)`.

### 2. Search RPC
*   **Action:** Create `search_items(query)` RPC function to perform fuzzy matching on the server.

### 3. Frontend Integration
*   **Action:** Update `useAppStore` to switch between "Local Filter" (for small lists/offline) and "Server Search" (for global queries).

---

## Approval Request

**Do you approve this Master Plan?**
It addresses the 5 critical stability issues *and* the 2 requested performance upgrades.
