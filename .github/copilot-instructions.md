# Stash V4 - AI Agent Instructions

## Project Overview
Stash is a Google Keep-like offline-first PWA for notes, links, files, and tasks with scheduling/reminders. Built with React 19 + TypeScript + Vite, using Supabase for backend and Zustand for state.

## Architecture

### State Management (Zustand with Slices)
- **Store**: [src/store/useAppStore.ts](src/store/useAppStore.ts) - Combines three slices via `persist` middleware
- **Slices**: Auth, UI, and Data slices in [src/store/slices/](src/store/slices/) - each owns distinct state
- **Pattern**: Actions mutate state optimistically, then queue sync via `persistentSyncQueue.add()`

```typescript
// Typical action pattern in dataSlice.ts
addItem: (item) => {
    const itemWithFlag = { ...item, is_unsynced: true };
    set((state) => ({ items: [itemWithFlag, ...state.items] }));
    persistentSyncQueue.add('upsert-item', item.id, item);
}
```

### Offline-First Sync
- [src/lib/persistentQueue.ts](src/lib/persistentQueue.ts) - LocalStorage-backed queue for offline operations
- Dedupes by `(id, type)` key; auto-resumes on `window.online` event
- Supabase Realtime in [src/hooks/useRealtime.ts](src/hooks/useRealtime.ts) syncs remote changes

### Type System
- **Core types**: [src/lib/types.ts](src/lib/types.ts) - `Item`, `Task`, `List`, `Folder`
- **DB adapters**: [src/lib/dbAdapters.ts](src/lib/dbAdapters.ts) - Convert Supabase rows to frontend types with validation
- 5 item types: `note | link | image | file | folder`

## Key Patterns

### Adding New Features
1. Add types to [src/lib/types.ts](src/lib/types.ts)
2. Add DB adapter in [src/lib/dbAdapters.ts](src/lib/dbAdapters.ts) if persisted
3. Add slice action in [src/store/slices/dataSlice.ts](src/store/slices/dataSlice.ts)
4. Queue sync with `persistentSyncQueue.add('upsert-item', id, payload)`

### Component Organization
- **Layout**: `Layout.tsx` → `Sidebar` + `MainCanvas`
- **Cards**: [src/components/cards/](src/components/cards/) - `ItemCard`, `TaskCard` for rendering
- **Modals**: [src/components/modals/](src/components/modals/) - `QuickAddModal`, `SchedulerModal`
- **Lazy loading**: Heavy views (`CalendarLayout`, `TasksView`) use `React.lazy()`

### Scheduling System
- Items have `scheduled_at` (ISO string) and `remind_before` (minutes) fields
- Recurring rules: `RecurringConfig` in types.ts with `frequency`, `interval`, `byWeekDays`
- [src/lib/schedulerEngine.ts](src/lib/schedulerEngine.ts) - `calculateNextOccurrence()` for recurrence

## Developer Commands
```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite build
npm run test         # Vitest in watch mode
npm run test:run     # Single test run
npm run lint         # ESLint
```

## Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Netlify Functions also need: SUPABASE_SERVICE_KEY, VAPID_*
```

Demo mode activates when Supabase is unconfigured (check `isSupabaseConfigured()` in [src/lib/supabase.ts](src/lib/supabase.ts)).

## Testing Conventions
- Tests use Vitest with jsdom: [vitest.config.ts](vitest.config.ts)
- Setup mocks in [src/test/setup.ts](src/test/setup.ts) (matchMedia, ResizeObserver, crypto)
- Test files: `*.test.ts` alongside source files
- Pattern: Mock store operations, test pure logic separately

## Critical Files
| File | Purpose |
|------|---------|
| [src/store/useAppStore.ts](src/store/useAppStore.ts) | Central Zustand store with persistence |
| [src/lib/persistentQueue.ts](src/lib/persistentQueue.ts) | Offline sync queue |
| [src/lib/dbAdapters.ts](src/lib/dbAdapters.ts) | Type-safe DB row conversion |
| [src/components/layout/MainCanvas.tsx](src/components/layout/MainCanvas.tsx) | Main view renderer (800+ lines) |
| [src/hooks/useAuth.ts](src/hooks/useAuth.ts) | Auth with token refresh deduping |

## Known Patterns to Follow
- Use `generateId()` from [src/lib/utils.ts](src/lib/utils.ts) for new entity IDs
- Mark new items `is_unsynced: true` until sync completes
- Validate items with `validateItemForSync()` before DB operations
- Use `adaptItemRow()` / `adaptTaskRow()` when reading from Supabase

## Netlify Functions
- [netlify/functions/check-reminders.mts](netlify/functions/check-reminders.mts) - Scheduled reminder checker (uses service key)
- [netlify/functions/subscribe-push.mts](netlify/functions/subscribe-push.mts) - Push subscription handler
