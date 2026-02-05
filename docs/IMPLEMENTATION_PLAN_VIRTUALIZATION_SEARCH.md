# Implementation Plan: Performance & Scalability

**Goal:** Transform "Stash" into an Enterprise-Grade application by implementing UI Virtualization (handling 10,000+ items smoothly) and Server-Side Search (offloading logic to the database).

## Part 1: Virtualization ("Don't Draw the Whole World")

**Problem:** The current `MainCanvas.tsx` renders all items at once using `react-masonry-css`. This causes DOM node explosion and browser lag when item counts exceed ~100.

**Strategy:**
We will leverage the existing `react-window` library (already in `package.json`) to implement "Windowing". We will standardize the Grid View to use a high-performance Uniform Grid, which is significantly faster than Masonry for large datasets.

### Implementation Steps

1.  **Standardize Item Heights (Grid Mode)**
    *   **Why?** Virtualization requires predictable item dimensions to calculate scroll position without rendering.
    *   **Action:** Modify `ItemCard.tsx` to accept a `variant="grid"` prop that enforces a fixed height (e.g., 200px) and truncates content with ellipsis. This creates a neat, uniform dashboard look.

2.  **Refactor `MainCanvas.tsx`**
    *   **List View:** Replace the standard `.map()` loop with `react-window`'s `FixedSizeList`.
    *   **Grid View:** Replace `react-masonry-css` with `react-window`'s `FixedSizeGrid`.
    *   **Auto-Sizing:** Wrap these lists in `react-virtualized-auto-sizer` to automatically adjust to the screen size (handling mobile/desktop resizing).

3.  **New Component: `VirtualItemGrid.tsx`**
    *   A dedicated component that calculates columns based on screen width and passes efficient "cells" to `FixedSizeGrid`.

4.  **Preserve Context Menu & Drag-Drop**
    *   Ensure the virtualized containers still pass necessary events (Right Click, Drag start) to the store.

## Part 2: Server-Side Search ("The Index at the Back of the Book")

**Problem:** Current search downloads all data to the client and filters it in JavaScript. This fails when the database exceeds the client's RAM (e.g., 1GB of notes).

**Strategy:**
Offload search to PostgreSQL using `pg_trgm` (Trigram) indices for fuzzy matching and Full Text Search.

### Implementation Steps

1.  **Database Migration (SQL)**
    *   Create file: `supabase_schema_search.sql`
    *   Enable extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
    *   Create Indices: Add GIN indices to `items(title)`, `items(content)`, and `tasks(title)`.
    *   Create RPC Function: `search_items(query_text)` that searches both Items and Tasks and returns a unified result set ordered by relevance.

2.  **Update `useAppStore.ts`**
    *   Add `isSearching` state (boolean).
    *   Add `searchResults` state (array).
    *   Create `performSearch(query)` action that:
        1.  Checks if query is empty (clear results).
        2.  Debounces the network request (wait 300ms).
        3.  Calls `supabase.rpc('search_items', { query_text })`.
        4.  Updates `displayItems` with the results.

3.  **Hybrid Fallback (Offline Support)**
    *   If the network request fails (offline), fall back to the existing local filtering logic so the app remains usable without internet.

## Approval Request

**Do you approve this plan?**
Upon approval, I will:
1.  Apply the SQL migration for search.
2.  Implement the backend search logic in the store.
3.  Refactor the UI to use Virtualization.
