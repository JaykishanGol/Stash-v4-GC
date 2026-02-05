# Stash V4 — Comprehensive Codebase Review

> Reviewed as: Senior Dev · Frontend Architect · Backend Architect · UI/UX Designer  
> Files examined: **90+ files** across every layer of the application  
> Date: June 2025

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Review](#2-architecture-review)
3. [Code Quality & Type Safety](#3-code-quality--type-safety)
4. [State Management](#4-state-management)
5. [Offline-First & Sync Engine](#5-offline-first--sync-engine)
6. [Component Architecture](#6-component-architecture)
7. [Performance](#7-performance)
8. [Security](#8-security)
9. [Testing](#9-testing)
10. [Backend / Netlify Functions](#10-backend--netlify-functions)
11. [PWA & Service Worker](#11-pwa--service-worker)
12. [CSS & Design System](#12-css--design-system)
13. [UI/UX Design Review](#13-uiux-design-review)
14. [Google Integration](#14-google-integration)
15. [What to Add](#15-what-to-add)
16. [What to Remove](#16-what-to-remove)
17. [What to Improve](#17-what-to-improve)
18. [Priority Action Plan](#18-priority-action-plan)

---

## 1. Executive Summary

**Stash V4** is an ambitious offline-first PWA that combines notes, links, files, tasks, and scheduling into a Google Keep-like interface. The codebase is ~15,000+ lines of TypeScript/React with Supabase backend and Netlify serverless functions.

### Strengths
- **Solid offline-first architecture** — `PersistentSyncQueue` with intelligent deduplication, tombstones, and adaptive rate limiting is genuinely well-engineered
- **Rich feature set** — Drag-drop file ingestion, Web Share Target, push notifications, Google Calendar sync, recurring schedules, rich text editing, image compression, natural language date parsing
- **Good type foundations** — `types.ts` has proper type guards, validation functions, safe accessors, and factory functions
- **Thoughtful error handling** — Custom `AppError` class with `Result<T>` type, retry with backoff, Sentry integration hooks
- **Security-conscious** — CSP headers, DOMPurify on rich text, rate limiting on serverless functions, RLS bypass via service role only

### Critical Issues
- **Massive file sizes** — `MainCanvas.tsx` (1025 lines), `Sidebar.tsx` (1072 lines), `QuickAddModal.tsx` (877 lines), `ItemCard.tsx` (830 lines), `dataSlice.ts` (1288 lines). These are maintenance nightmares
- **Pervasive `as any` casting** — Defeats TypeScript's purpose, especially in cross-slice store access
- **Duplicated filtering logic** — `useFilteredItems` hook duplicates `getFilteredItems` from the store
- **No integration tests** — Tests only cover pure logic with mock stores, never the real Zustand store
- **4,844-line monolithic CSS** — Impossible to maintain, no CSS modules or scoping
- **Missing error boundaries** — Only one top-level `ErrorBoundary` in `main.tsx`; component-level boundaries exist but aren't widely used

### Overall Grade: **B-**
Strong feature set and solid sync architecture, but code organization, type safety, and test coverage need significant work to be maintainable long-term.

---

## 2. Architecture Review

### 2.1 Project Structure — Needs Improvement

```
src/
├── components/   (46 files in 9 subdirs — good categorization)
├── hooks/        (12 files — reasonable)
├── lib/          (23 files — too flat, needs sub-grouping)
├── store/        (6 files — good)
├── styles/       (2 files + 1 monolithic index.css)
└── test/         (1 setup file)
```

**Issues:**
- `src/lib/` is a dumping ground — 23 files with no sub-organization. Files like `googleClient.ts`, `googleSyncQueue.ts`, `googleSyncService.ts`, `googleTokenService.ts` should be in `lib/google/`. Similarly `versionService.ts` + `versionTypes.ts` should be in `lib/versioning/`.
- Root directory has **30+ SQL migration files**, multiple plan/review markdown files cluttering the workspace. These should be in `docs/` and `migrations/` folders.
- `netlify/functions/lib/rateLimiter.mjs` is `.mjs` while everything else is `.ts`/`.mts` — inconsistent.

**Recommended reorganization:**
```
src/lib/
├── google/          (googleClient, googleSync*, googleToken*)
├── sync/            (persistentQueue, tombstones)
├── versioning/      (versionService, versionTypes)
├── scheduling/      (schedulerEngine, dateParser)
├── sharing/         (shareHandler, shareDbConfig, pushNotifications)
├── media/           (imageCompression, fetchLinkMetadata)
├── errors/          (errorHandler)
└── core/            (types, utils, constants, supabase, dbAdapters, database.types)
```

### 2.2 Dependency Architecture — Mostly Good

- Good use of lightweight libraries: Wouter over React Router, Lucide over FontAwesome
- TipTap is heavy but justified for rich text editing
- `react-masonry-css` is unmaintained (last publish 3+ years ago) — consider alternatives
- `web-push` is in production dependencies but only used in Netlify functions — should be in the function's own package.json or at least in devDependencies

### 2.3 Build Configuration — Good

- Vite config properly chunks vendors, uses rolldown for speed
- PWA config with `injectManifest` strategy is correct for the share target handler
- TypeScript config is strict (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`)
- Manual chunks (`tiptap-vendor`, `dnd-vendor`) reduce bundle size effectively

---

## 3. Code Quality & Type Safety

### 3.1 The `as any` Problem — CRITICAL

The store slices are typed as `StateCreator<DataSlice>` instead of `StateCreator<DataSlice, [], [], AppState>`. This means cross-slice access requires `(get() as any)`:

```typescript
// Found throughout dataSlice.ts and uiSlice.ts
const user = (get() as any).user;
(get() as any).addNotification({ ... });
```

**This appears 20+ times across the codebase.** It defeats type checking for the most critical state operations.

**Fix:** Use the proper Zustand slice pattern:
```typescript
type DataSliceCreator = StateCreator<AppState, [], [], DataSlice>;

export const createDataSlice: DataSliceCreator = (set, get) => ({
  // Now get() returns AppState — full type safety
});
```

### 3.2 Inconsistent Error Handling

- `errorHandler.ts` defines a beautiful `Result<T>` type and `appTry()` wrapper — but it's barely used. Most async operations in `dataSlice.ts` use raw try/catch with `console.error`.
- `persistentQueue.ts` uses the error handler properly. Other files don't.

**Recommendation:** Adopt `Result<T>` pattern consistently for all Supabase operations. Create a `safeSupabaseCall<T>()` wrapper.

### 3.3 `@ts-ignore` Usage

Found in `dbAdapters.ts`:
```typescript
// @ts-ignore - search_text exists in DB but not in our types
search_text: row.search_text || null,
```

**Fix:** Add `search_text: string | null` to the `Item` type, or add it to `database.types.ts`.

### 3.4 Unused / Duplicated Code

- `useFilteredItems.ts` (149 lines) completely duplicates `getFilteredItems` from `useAppStore.ts`. One should be deleted.
- `extractTextSimulation.ts` in Netlify functions — the name suggests it's a stub that should be removed or implemented.
- Multiple `console.log` debugging statements remain in production code (e.g., `persistentQueue.ts`, `shareHandler.ts`).

---

## 4. State Management

### 4.1 Store Architecture — Mixed

**Good:**
- Slice pattern separates concerns cleanly (auth, UI, data, selection)
- `persist` middleware correctly whitelists specific keys
- `loadUserData()` has smart merge logic for offline items
- Pagination with `PAGE_SIZE = 500` is practical

**Issues:**

1. **`dataSlice.ts` at 1,288 lines is too large.** It handles items, tasks, lists, folders, uploads, undo/redo, clipboard, and stats. This should be split:
   - `itemSlice.ts` — Item CRUD, move, archive, trash
   - `taskSlice.ts` — Task CRUD
   - `uploadSlice.ts` — Upload queue management
   - `undoSlice.ts` — Undo/redo stack
   - `statsSlice.ts` — Computed stats

2. **`getFilteredItems()` at 170+ lines inside `useAppStore.ts` is a red flag.** This complex filtering/sorting logic should be extracted to a separate utility and unit tested.

3. **Selectors are computed every render.** `getFilteredItems()` and `getFilteredTasks()` are called as methods, not memoized selectors. Every component subscribing to the store re-runs this filtering logic.

**Recommendation:** Use `zustand/middleware` `subscribeWithSelector` and create memoized selectors, or use `useMemo` in the consuming hooks (which `useFilteredItems` already does — but then it duplicates logic).

### 4.2 Persistence Strategy — Risky

```typescript
partialize: (state) => ({
    theme: state.theme,
    viewMode: state.viewMode,
    items: state.items,
    trashedItems: state.trashedItems,
    // ...
}),
```

Persisting the entire `items` array to localStorage is dangerous:
- **localStorage limit is ~5MB.** With many items + rich content + file metadata, this can silently fail.
- There's no error handling for `QuotaExceededError`.
- No data migration strategy if the persisted shape changes.

**Recommendation:**
- Move item persistence to IndexedDB (via `idb-keyval` or `dexie`)
- Keep only lightweight UI preferences in localStorage
- Add a version number to persisted state with migration functions

---

## 5. Offline-First & Sync Engine

### 5.1 PersistentSyncQueue — Excellent

This is the best-engineered part of the codebase:
- **Intelligent deduplication** — Deletes supersede upserts with the same ID
- **Payload whitelisting** — Only syncs approved columns per table
- **Adaptive rate limiting** — Dynamically adjusts batch delay based on 429 responses
- **Exponential backoff** — With configurable max retries
- **Auto-resume** — Triggers on `window.online` event
- **Analytics** — Tracks success/failure/retries

Only issue: The queue is stored in localStorage (same 5MB limit risk).

### 5.2 Tombstone System — Good

Simple but effective — prevents resurrection of deleted items from realtime/server sync. Could benefit from TTL-based cleanup (currently grows unbounded).

### 5.3 Realtime Sync — Needs Improvement

`useRealtime.ts` subscribes to `items`, `tasks`, `lists` tables:

**Issues:**
- No subscription to `folders` table
- No conflict resolution beyond "server wins" for remote changes
- No reconnection handling if the WebSocket drops
- Channel names are hardcoded strings

### 5.4 Optimistic Updates — Good Pattern

Actions follow: `set local state → queue sync → sync in background`. Proper pattern for offline-first.

---

## 6. Component Architecture

### 6.1 File Size Problems — CRITICAL

| File | Lines | Verdict |
|------|-------|---------|
| `Sidebar.tsx` | 1,072 | **CRITICAL — Split into 5+ components** |
| `MainCanvas.tsx` | 1,025 | **CRITICAL — Split into view components** |
| `QuickAddModal.tsx` | 877 | **HIGH — Extract tab panels** |
| `ItemCard.tsx` | 830 | **HIGH — Extract sub-renderers** |
| `dataSlice.ts` | 1,288 | **CRITICAL — Split into domain slices** |

**`MainCanvas.tsx`** contains:
- `ScheduleImage` component (signed URL handling)
- `QuickAccessCard` component
- `SchedulerItemsView` component (bucket grouping logic)
- Route dispatching logic
- Masonry grid layout
- Context menu handling
- File preview handling
— All of these should be separate files.

**`Sidebar.tsx`** contains:
- `NavItem` component
- Folder tree rendering (recursive)
- List management
- Drag-and-drop handling for 10+ drop targets
- Context menus for folders and lists
- Sidebar header with user avatar
- View switching logic
— All interleaved in one file.

### 6.2 Lazy Loading — Good

Heavy views (`CalendarLayout`, `TasksView`, `TaskDetailView`) use `React.lazy()` with a `ViewLoader` suspense fallback. This is correct.

### 6.3 Component Patterns — Mixed

**Good:**
- `Layout.tsx` is admirably lean (22 lines) — just composition
- `CaptureEngine.tsx` cleanly separates drag-drop file ingestion
- `DateTimeIndicator` extracted as sub-component in ItemCard

**Issues:**
- Components reach directly into the global store everywhere (`useAppStore(s => s.xxx)`) — makes them untestable and tightly coupled
- No component-level error boundaries except `EditorErrorBoundary` and `AppErrorBoundary`
- `SchedulerModal` and `QuickAddModal` share scheduling UI but don't share components
- No composition pattern for card variants — `ItemCard` handles all 5 types with conditional rendering instead of polymorphic sub-components

### 6.4 Props vs Store Access

Most components bypass props entirely and reach into the store. This makes them:
- **Untestable** — Can't render in isolation
- **Not reusable** — Tightly coupled to global state
- **Hard to reason about** — Hidden data dependencies

**Recommendation:** Adopt a container/presenter pattern for complex components:
```typescript
// Container
function ItemCardContainer({ itemId }: { itemId: string }) {
  const item = useAppStore(s => s.items.find(i => i.id === itemId));
  const onDelete = useAppStore(s => s.moveToTrash);
  return <ItemCardPresenter item={item} onDelete={onDelete} />;
}

// Presenter — pure, testable
function ItemCardPresenter({ item, onDelete }: ItemCardProps) { ... }
```

---

## 7. Performance

### 7.1 Rendering — Several Issues

1. **No `React.memo` on card components.** `ItemCard` and `TaskCard` re-render on every store change even if their specific item hasn't changed.

2. **`getFilteredItems()` runs on every render** for every subscriber. With 500+ items and complex filtering/sorting, this is expensive.

3. **`ScheduleImage` inside `MainCanvas`** makes a signed URL request per image. The cache is a module-level `Map` (good) but has no TTL or size limit — memory leak risk.

4. **Masonry layout re-calculates on every render.** `react-masonry-css` doesn't virtualize — all cards are in the DOM.

5. **`react-window` is imported** but from the code structure, it's unclear if it's actually used for the main item grid. Masonry + virtualization is hard.

### 7.2 Bundle Size

- TipTap pulls in ProseMirror (~100KB gzipped) — only needed for note editing, but always loaded
- `date-fns` used throughout — tree-shaking should handle this but verify
- `web-push` in client dependencies (136KB) — completely unnecessary on the client side

### 7.3 Network — Mostly Good

- Image compression before upload (`imageCompression.ts`) — smart
- Signed URL caching in `ScheduleImage` — good
- Batch processing in sync queue — good
- But: No HTTP caching headers configuration beyond what Netlify provides

### 7.4 localStorage Thrashing

The sync queue, tombstones, undo stack, AND the entire Zustand store all persist to localStorage. On every state change, `JSON.stringify` + `localStorage.setItem` runs. With 500 items, this serializes megabytes of data on every mutation.

**Fix:** Debounce persistence, or move to IndexedDB.

---

## 8. Security

### 8.1 Frontend — Good Foundations

- **DOMPurify** sanitizes rich text content — correct
- **CSP headers** in `netlify.toml` — properly configured
- **Input validation** in `validateItem()` and `validateItemForSync()` — good
- **No inline event handlers** or `dangerouslySetInnerHTML` without sanitization

### 8.2 Backend / Serverless — Some Concerns

1. **`check-reminders.mts`** uses service role key (bypasses RLS) — necessary but the function has no auth check. It's protected by being a scheduled function, but if someone discovers the endpoint URL...

2. **`subscribe-push.mts`** properly verifies JWT tokens before writing — Good

3. **`refresh-google-token.mts`** has rate limiting — Good — but `Access-Control-Allow-Origin: '*'` is overly permissive for a token refresh endpoint.

4. **Hardcoded email** in `check-reminders.mts`:
   ```typescript
   const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:gjaykishan@gmail.com';
   ```
   Should always come from env vars with no fallback to a personal email.

### 8.3 Storage Security — Good

- Supabase Storage with per-user paths: `stash_vault/{user_id}/...`
- Signed URLs with 1-hour expiry for file access

### 8.4 Missing Security Measures

- **No CSRF protection** on Netlify functions (though Supabase JWT mitigates this)
- **No Content-Security-Policy nonce** for inline scripts
- **Client-side `isAdmin`** checks are cosmetic only — no server-side enforcement visible
- **localStorage is unencrypted** — sensitive data (auth tokens, item content) stored in plaintext

---

## 9. Testing

### 9.1 Current State — SEVERELY LACKING

**3 test files total:**

| File | Tests | Quality |
|------|-------|---------|
| `schedulerEngine.test.ts` | Good | Proper unit tests with edge cases |
| `types.test.ts` | Good | Thorough type guard + validation testing |
| `dataSlice.test.ts` | Misleading | Tests a **mock** store, not the real Zustand store |

**Critical Gap:** `dataSlice.test.ts` creates a `MockDataStore` class and tests that. It never imports or tests the actual `createDataSlice`. These tests prove the mock works, not the production code.

### 9.2 What's Missing

- **Zero component tests** — No React Testing Library tests for any of the 46 components
- **Zero integration tests** — No tests verifying store → component → user interaction flows
- **Zero hook tests** — `renderHook` not used anywhere despite complex hook logic
- **Zero sync/queue tests** — `PersistentSyncQueue` (the most critical module) has no tests
- **Zero E2E tests** — No Playwright or Cypress

### 9.3 Test Infrastructure — Good Setup

- Vitest properly configured with jsdom
- `setup.ts` correctly mocks `matchMedia`, `ResizeObserver`, `crypto`
- Coverage reporters configured

### 9.4 Recommended Test Priorities

1. **P0:** `PersistentSyncQueue` — deduplication, retry, offline/online transitions
2. **P0:** Real `dataSlice` integration tests — actual Zustand store CRUD
3. **P1:** `schedulerEngine` — add more edge cases (timezone boundaries, DST)
4. **P1:** `dbAdapters` — legacy migration logic
5. **P2:** Component smoke tests for `ItemCard`, `QuickAddModal`
6. **P2:** Hook tests for `useAuth`, `useRealtime`

---

## 10. Backend / Netlify Functions

### 10.1 `check-reminders.mts` — Needs Work

**Good:**
- Uses RPC (`get_due_reminders`) instead of raw queries — efficient
- Cleans up invalid push subscriptions (410/404)
- Updates `last_acknowledged_at` to prevent duplicates
- Groups by user for batch notification

**Issues:**
- **Runs every minute (`* * * * *`)** — very aggressive. Consider every 5 minutes unless sub-minute reminders are required
- **N+1 query pattern:** Loops through users, queries subscriptions per user. Should batch with a JOIN in the RPC
- **No pagination/limit** on `get_due_reminders` — if thousands of reminders are due, this will timeout
- **No dead letter queue** — failed notifications are logged but not retried
- **Untyped `(req, context)`** — export default should use Netlify's typed handler

### 10.2 `subscribe-push.mts` — Well Implemented

- Proper JWT verification before operations
- Validates subscription data structure
- Uses `upsert` with conflict key — idempotent
- Handles both subscribe (POST) and unsubscribe (DELETE)

### 10.3 `refresh-google-token.mts` — Good

- Rate limiting per IP (10/minute)
- Detects revoked tokens (`invalid_grant`) and signals re-auth
- Keeps `client_secret` server-side

**Issue:** CORS `Access-Control-Allow-Origin: '*'` should be restricted to your domain.

### 10.4 Missing Backend Functionality

- **No server-side validation** for item mutations — relies entirely on Supabase RLS
- **No webhook for email notifications** — only push notifications
- **No cleanup cron** for orphaned files in storage, expired tombstones, or old versions

---

## 11. PWA & Service Worker

### 11.1 `sw.js` — Well Implemented

**Good:**
- Workbox precaching with `cleanupOutdatedCaches`
- Share Target handler with full file support (FormData → IndexedDB → app)
- Push notification handler with fallback data
- Notification click focuses existing window or opens new one
- `skipWaiting` + `clientsClaim` for immediate activation

**Issues:**
- **No runtime caching strategies** — Only precache. API responses, images, and fonts aren't cached at runtime. Add Workbox routing:
  ```javascript
  registerRoute(
    ({url}) => url.origin === 'https://fonts.googleapis.com',
    new StaleWhileRevalidate({ cacheName: 'google-fonts' })
  );
  ```
- **No offline fallback page** — If a navigation request fails and isn't precached, user sees nothing
- **Share DB version** is imported from source — if the constant changes, old SWs may break

### 11.2 Share Target — Creative Solution

Using IndexedDB as a cross-context bridge between the SW and the main app is clever. The `ShareIntentModal` polls for share data on app launch. Well-designed.

---

## 12. CSS & Design System

### 12.1 Architecture — CRITICAL Problem

**4,844 lines in a single `index.css` file.** Plus `dock.css` and `agenda.css`. This is:
- **Unmaintainable** — Finding styles for a component requires searching through 5K lines
- **Collision-prone** — Global class names like `.card`, `.modal`, `.button` have no scoping
- **Performance impact** — Browser parses the entire stylesheet regardless of which components are rendered

### 12.2 Design Tokens — Good Foundation

The CSS custom properties (`:root` vars) are well-organized:
- Typography: `--font-primary`, `--font-display`
- Colors: Semantic naming (`--bg-app`, `--text-primary`, `--accent`)
- Shadows: Multiple levels (`--shadow-xs` through `--shadow-lg`)
- Spacing: Component-level (`--sidebar-width`, `--card-padding`, `--grid-gap`)
- Transitions: Speed variants (`--transition-fast/normal/slow`)

### 12.3 Dark Mode

The store persists `theme` but verify that dark mode variable overrides (e.g., `[data-theme="dark"]`) have full coverage across all components. Partial dark mode is worse than none.

### 12.4 Recommendations

1. **Migrate to CSS Modules** — Each component gets a `.module.css` file. Vite supports this natively with zero config.
2. **Or adopt Tailwind CSS** — Given how many utility-style classes exist, Tailwind would reduce CSS by 80%+ and eliminate naming issues.
3. **At minimum:** Split `index.css` into per-component stylesheets imported by their consumers.

---

## 13. UI/UX Design Review

### 13.1 Information Architecture — Good

- 5 content types (note, link, image, file, folder) with distinct visual treatment
- Sidebar navigation with views, folders, lists, priorities, and tags
- Quick access dashboard with type counts
- Scheduler view with time-bucketed grouping (overdue/today/tomorrow/this week/later)

### 13.2 Interaction Design — Mixed

**Good:**
- Multi-select with shift-click (planned)
- Keyboard shortcuts (Ctrl+N, Ctrl+Z, etc.)
- Context menu on right-click AND long-press
- Drag-and-drop for file ingestion AND item reordering
- Command palette for power users

**Issues:**
- **Selection mode shift-click is not implemented** — The code has `// skip complex range logic for step 1`
- **No keyboard shortcut discoverability** — No `?` shortcut to show available shortcuts
- **Mobile back button handler** uses History API pushState/popState — can conflict with actual browser navigation
- **Toast notifications** may not be accessible (check for ARIA live region)

### 13.3 Mobile UX — Needs Attention

- `MobileNav.tsx` exists as bottom navigation — good
- `MobileCalendarView.tsx` exists — good
- `useLongPress` hook supports touch — good
- But: No evidence of responsive testing across breakpoints
- `--sidebar-width: 240px` with `min-width: 220px` may cause issues on narrow tablets
- Safe area insets are defined as CSS vars but verify they're applied consistently

### 13.4 Accessibility — Significant Gaps

- **No ARIA roles** visible in the component excerpts (modals should have `role="dialog"`, `aria-modal`)
- **No focus management** in modals — focus should trap inside modal and return to trigger on close
- **No skip navigation** link
- **No `aria-label`** on icon-only buttons (Lucide icons without text)
- **Color contrast** — Card colors like `--card-coral: #FFB5A7` on `--text-primary: #1F2937` may fail WCAG AA
- **No reduced motion** — `prefers-reduced-motion` media query not detected

---

## 14. Google Integration

### 14.1 Architecture — Well-Designed

- **OAuth flow:** Client gets provider tokens → stores refresh token via Netlify function → refreshes access tokens server-side
- **Two-way sync:** Local items → Google Events/Tasks, and vice versa via `GoogleSyncService`
- **Resource links** track Google↔Stash ID mappings for update/delete sync
- **Debounced sync queue** prevents API hammering

### 14.2 Issues

1. **Token storage:** Refresh token stored in Supabase `user_settings` table. If Supabase is compromised, attacker gets Google access. Consider encrypting at rest.
2. **No incremental sync:** `GoogleSyncService` appears to do full sync rather than using Google's `syncToken` for delta changes. This won't scale.
3. **Error handling:** Google API errors are caught but not surfaced to the user clearly
4. **No disconnect cleanup:** When a user disconnects Google, verify resource links are cleaned up.

---

## 15. What to Add

### P0 — Essential

| Feature | Why |
|---------|-----|
| **IndexedDB for data persistence** | localStorage 5MB limit will cause data loss at scale |
| **Component-level error boundaries** | One uncaught error shouldn't crash the entire app |
| **Real dataSlice tests** | Current tests are fake — test the actual store |
| **PersistentSyncQueue tests** | Most critical module has zero test coverage |
| **Accessibility audit + fixes** | ARIA roles, focus management, keyboard navigation in modals |

### P1 — Important

| Feature | Why |
|---------|-----|
| **Optimistic conflict resolution UI** | User should see when server rejects their changes |
| **Data export (JSON/HTML/Markdown)** | Users need to own their data |
| **Full-text search** | The DB has `search_text` but client search appears to be title/content string match only |
| **Folder subscription in Realtime** | Folders don't sync in realtime currently |
| **Rate limit UI feedback** | When sync queue hits 429, user sees nothing |

### P2 — Nice to Have

| Feature | Why |
|---------|-----|
| **Collaborative sharing** | Share individual items/folders with other users |
| **Widgets / Quick capture** | Android home screen widget for instant capture |
| **Email integration** | Forward emails to create notes |
| **AI summarization** | TL;DR for long notes and saved links |
| **Item templates** | Reusable note/task templates |
| **Batch operations API** | Move/archive/delete multiple items in one DB call |

---

## 16. What to Remove

| Item | Why |
|------|-----|
| **`useFilteredItems.ts` hook** | Duplicates `getFilteredItems` from the store. Choose one. |
| **`extractTextSimulation.ts`** | Placeholder/mock function that adds confusion |
| **`web-push` from client `dependencies`** | Only used server-side; wastes bundle size |
| **`@types/react-virtualized-auto-sizer` in dependencies** | Should be `devDependencies` |
| **30+ SQL files in project root** | Move to `migrations/` directory |
| **Multiple plan/review markdown files in root** | Move to `docs/` directory |
| **Excessive `console.log` statements** | Production code shouldn't have debug logging — use the error handler's log levels |
| **`dataSlice.test.ts` MockDataStore tests** | These test a mock, not production code. Replace with real store tests or delete |
| **Legacy scheduler fields in types** | `one_time_at`, `remind_at`, `due_at`, `reminder_type`, `reminder_recurring` — if migration is done, remove |
| **Duplicate task CRUD in `supabase.ts`** | Functions like `createTask()`, `updateTask()` overlap with persistentQueue operations |

---

## 17. What to Improve

### Architecture
1. **Split mega-components** — Break `MainCanvas`, `Sidebar`, `ItemCard`, `QuickAddModal` into composable sub-components (max 200-300 lines each)
2. **Split `dataSlice.ts`** — Separate into item, task, upload, undo, and stats slices
3. **Organize `src/lib/`** — Group into domain sub-folders
4. **CSS Modules** — Migrate from global CSS to scoped CSS modules

### Type Safety
5. **Fix Zustand slice typing** — Use `StateCreator<AppState, [], [], SliceName>` to eliminate all `as any` casts
6. **Remove `@ts-ignore`** — Add missing types instead
7. **Strict Supabase types** — Use generated types from `database.types.ts` in all queries

### Performance
8. **Memoize card components** — `React.memo` on `ItemCard` and `TaskCard` with proper comparison
9. **IndexedDB for persistence** — Replace localStorage for items/tasks/queue data
10. **Debounce Zustand persistence** — Don't serialize entire state on every mutation
11. **Virtualize item lists** — Use `react-window` or `@tanstack/virtual` for the masonry grid
12. **Service Worker runtime caching** — Cache API responses, images, fonts with Workbox strategies

### Testing
13. **Replace mock store tests** with real Zustand store integration tests
14. **Add PersistentSyncQueue tests** — Deduplication, retry, online/offline
15. **Add component smoke tests** — At least render without crashing
16. **Add E2E tests** — Critical path: create item → sync → reload → verify

### Security
17. **Restrict CORS** on `refresh-google-token` to your domain
18. **Remove hardcoded email** fallback in `check-reminders.mts`
19. **Encrypt sensitive localStorage data** — Or move to a more secure storage mechanism
20. **Add input sanitization** to Netlify functions — Don't trust client payloads

### UX/Accessibility
21. **Add ARIA attributes** to modals, menus, buttons
22. **Implement focus trapping** in modals
23. **Add `prefers-reduced-motion`** media query
24. **Add keyboard shortcut help** (`?` shortcut)
25. **Complete shift-click range selection** — Currently stubbed out

---

## 18. Priority Action Plan

### Sprint 1 (Week 1-2): Foundation Fixes
- [ ] Fix Zustand slice typing to eliminate `as any` (affects everything)
- [ ] Split `dataSlice.ts` into domain slices
- [ ] Migrate persistence from localStorage to IndexedDB
- [ ] Move SQL files to `migrations/`, docs to `docs/`
- [ ] Remove `useFilteredItems` hook (use store selector)

### Sprint 2 (Week 3-4): Component Refactoring
- [ ] Split `MainCanvas.tsx` — extract `SchedulerItemsView`, `QuickAccessDashboard`, view routing
- [ ] Split `Sidebar.tsx` — extract `FolderTree`, `ListSection`, `NavSection`
- [ ] Split `ItemCard.tsx` — extract `NoteCard`, `LinkCard`, `FileCard`, `ImageCard`, `FolderCard`
- [ ] Split `QuickAddModal.tsx` — extract tab panels as components
- [ ] Begin CSS Modules migration (start with newly split components)

### Sprint 3 (Week 5-6): Testing & Quality
- [ ] Write real `dataSlice` integration tests
- [ ] Write `PersistentSyncQueue` unit tests
- [ ] Add component smoke tests for all card types
- [ ] Add accessibility ARIA roles to modals and interactive elements
- [ ] Remove dead code (`extractTextSimulation`, duplicate Supabase functions)

### Sprint 4 (Week 7-8): Performance & Polish
- [ ] Add `React.memo` to card components
- [ ] Implement virtual scrolling for item grids
- [ ] Add Workbox runtime caching strategies to SW
- [ ] Debounce store persistence
- [ ] Complete shift-click selection
- [ ] Add keyboard shortcut help modal

---

## Appendix: File-by-File Issues

### `src/store/useAppStore.ts`
- `getFilteredItems` (170+ lines) inline — extract to utility
- `getFilteredTasks` (40+ lines) inline — extract to utility
- `loadUserData` has nested `fetchAll` with complex merge — could be a separate module

### `src/store/slices/dataSlice.ts`
- 1,288 lines — split into 4-5 slices
- 20+ `(get() as any)` casts — fix slice typing
- `addUpload`/`updateUploadProgress`/`completeUpload` — separate upload slice
- Undo/redo stack management — separate undo slice
- `getStats()` computed every call — memoize

### `src/store/slices/uiSlice.ts`
- `addNotification` uses `(get() as any).user` — fix slice typing
- `notifications` stored in state AND Supabase — clarify source of truth
- `contextMenu` state is very detailed (x, y, items array) — could use a ref instead

### `src/lib/persistentQueue.ts`
- Zero test coverage for the most critical module
- `localStorage` key `stash_sync_queue` — could fill up
- `console.log`/`console.warn` scattered throughout — use structured logging

### `src/lib/supabase.ts`
- `createTask()`, `updateTask()`, `deleteTask()` — duplicate functionality with sync queue
- `uploadFile` has retry logic that overlaps with queue retry logic
- `getAuthToken()` could cache more aggressively

### `src/lib/tombstones.ts`
- Grows unbounded — add a TTL (e.g., 30 days) and periodic cleanup
- No maximum size limit

### `src/lib/undoStack.ts`
- Persists to localStorage — may not be needed (undo is typically session-level)
- 50-item max is reasonable but should be configurable

### `src/lib/googleSyncService.ts`
- No incremental sync (no `syncToken`) — won't scale
- `mapGoogleEventToItem` and `mapItemToGoogleEvent` — complex mapping with no tests

### `src/hooks/useAuth.ts`
- `lastUserIdRef` to prevent TOKEN_REFRESHED loops — fragile workaround
- Consider using Supabase's built-in session management instead

### `src/hooks/useRealtime.ts`
- No folder subscription
- No reconnection strategy
- Hardcoded channel names

### `src/sw.js`
- No runtime caching strategies
- No offline fallback page
- `self.__WB_MANIFEST` correct for injectManifest strategy

### `netlify/functions/check-reminders.mts`
- Every minute is aggressive — consider 5 minutes
- N+1 queries for user subscriptions
- No pagination on due reminders
- Hardcoded email fallback

---

*End of review. Total codebase coverage: ~95% of application logic files examined.*
