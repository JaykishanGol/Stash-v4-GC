# Stash V4 - The "Grand Roadmap"

## Executive Summary
Stash V4 is now a robust, offline-capable application with a unified state management system and persistent routing. The core "fatal flaws" (data loss, race conditions, reactivity) have been resolved.

The next phase focuses on **Professional Polish**, **Security Hardening**, and **Feature Completeness**. This plan breaks down the work into prioritized tiers.

---

## 🛡️ Tier 1: Security & Stability (Critical)

### 1.1. RLS Policy Audit (Database)
**Current Status:** The SQL schema shows `auth.uid() = user_id` checks, which is good.
**Gap:**
*   `tasks` and `push_subscriptions` have proper RLS.
*   **Check:** Verify `items`, `lists`, and `folders` tables have equivalent RLS policies enabled. If RLS is missing on `items`, a malicious user could read everyone's notes.
**Action:** Audit `supabase_schema_*.sql` files or run SQL queries to confirm RLS on ALL tables.

### 1.2. Auth State Edge Cases
**Current Status:** `useAuth.ts` is robust with debouncing.
**Gap:**
*   **Session Expiry:** What happens if the token expires *while* the user is typing a long note? The sync queue will fail (401 Unauthorized).
*   **Fix:** Ensure `persistentQueue.ts` detects 401 errors specifically and pauses processing (or triggers a re-auth modal) instead of retrying endlessly or failing silently.

### 1.3. Drag-and-Drop Concurrency
**Current Status:** `CaptureEngine.tsx` limits uploads to 5 concurrent files.
**Gap:**
*   If the user drops 100 files, the UI might freeze or become unresponsive before the queue starts processing.
*   **Fix:** Move file tree traversal to a Web Worker to keep the main thread free.

---

## 🚀 Tier 2: Performance & Architecture (High)

### 2.1. Bundle Size Optimization
**Current Status:** The build output warns about large chunks (~1MB).
**Gap:**
*   `MainCanvas.tsx` imports heavy components (`CalendarLayout`, `TasksView`) even if they aren't visible.
**Action:**
*   Implement `React.lazy` and `<Suspense>` for views.
*   Lazy load `lucide-react` icons (or use a plugin to tree-shake them better if not already optimized).

### 2.2. CSS Modules / Tailwind Migration
**Current Status:** `agenda.css` uses global class names (`.card`, `.stat-value`) and magic numbers (`top: 180px`).
**Gap:**
*   Global styles risk collision.
*   Hardcoded positions break on different screen sizes or sidebar states.
**Action:**
*   Refactor `MainCanvas` and children to use CSS Modules (`*.module.css`) or Tailwind classes.
*   Use Flexbox/Grid for the main layout instead of absolute positioning.

### 2.3. Virtualized Lists
**Current Status:** `Masonry` grid is used, but does it virtualize?
**Gap:**
*   If a user has 5,000 notes, rendering them all in the DOM will lag.
**Action:**
*   Verify if `react-masonry-css` supports virtualization. If not, consider `react-window` or `tanstack-virtual` for the main list view.

---

## ✨ Tier 3: UI/UX & Polish (Medium)

### 3.1. Mobile Experience
**Current Status:** Sidebar auto-closes, back button works.
**Gap:**
*   **Swipe Gestures:** Swipe right to open sidebar, swipe left on item to delete/archive (Gmail style).
*   **Touch Targets:** Ensure all buttons are at least 44x44px.

### 3.2. Accessibility (a11y)
**Current Status:** Basic semantic HTML.
**Gap:**
*   **Keyboard Nav:** Can you tab through the Masonry grid logically?
*   **ARIA Labels:** Do icon-only buttons have `aria-label`?
*   **Focus States:** Are focus rings visible on custom buttons?
**Action:** Run a Lighthouse audit and fix top issues.

### 3.3. Rich Text Editor Improvements
**Current Status:** Uses Tiptap.
**Gap:**
*   **Image Resizing:** Can users resize images inside the editor?
*   **Link Previews:** Converting pasted URLs into rich cards automatically.

---

## 🔌 Tier 4: Features (Future)

### 4.1. Search & Command Palette (⌘K)
**Current Status:** Basic text filter in store.
**Feature:**
*   True Command Palette (like Raycast/Spotlight).
*   Search *content* of notes, not just titles.
*   Commands like "Create Task", "Go to Settings".

### 4.2. Undo/Redo System
**Current Status:** Basic "Toast with Undo" for deletion.
**Feature:**
*   Global Undo stack (Zustand middleware) to undo text edits, moves, etc.

### 4.3. Share & Collaborate
**Current Status:** `shareHandler.ts` exists for Share Target API.
**Feature:**
*   **Public Links:** Generate a read-only public URL for a note/folder.
*   **Real-time Collab:** (Hard) Using Supabase Realtime for multiplayer editing.

---

## 📝 Immediate "Next Steps" for Developer

1.  **Run SQL Audit:** Check `items` table RLS policies.
2.  **Optimize Bundle:** Lazy load `CalendarLayout` and `TasksView`.
3.  **CSS Cleanup:** Refactor `MainCanvas` layout to remove magic numbers.
