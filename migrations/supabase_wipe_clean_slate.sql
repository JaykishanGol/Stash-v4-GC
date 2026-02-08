-- ============================================================
-- Phase 0: Clean Slate Wipe
-- Deletes ALL data for user 0bfae3dd-8569-4327-bfbf-195d81016db9
-- Does NOT touch user_settings (keeps Google OAuth token + calendar IDs)
-- Does NOT touch anything on Google side
-- ============================================================

BEGIN;

DO $$
DECLARE
  target_uid UUID := '0bfae3dd-8569-4327-bfbf-195d81016db9';
BEGIN
  -- 1. Sync infrastructure (delete first to avoid FK issues)
  DELETE FROM public.google_resource_links WHERE user_id = target_uid;
  DELETE FROM public.google_sync_cursors   WHERE user_id = target_uid;
  RAISE NOTICE 'Cleared google_resource_links and google_sync_cursors';

  -- 2. Notifications & push subscriptions
  DELETE FROM public.notifications       WHERE user_id = target_uid;
  DELETE FROM public.push_subscriptions  WHERE user_id = target_uid;
  RAISE NOTICE 'Cleared notifications and push_subscriptions';

  -- 3. Item versions
  DELETE FROM public.item_versions WHERE item_id IN (
    SELECT id FROM public.items WHERE user_id = target_uid
  );
  RAISE NOTICE 'Cleared item_versions';

  -- 4. Legacy event-item map (no user_id column — delete by item_id)
  DELETE FROM public.legacy_event_item_map WHERE item_id IN (
    SELECT id FROM public.items WHERE user_id = target_uid
  );
  RAISE NOTICE 'Cleared legacy_event_item_map';

  -- 5. Core data tables
  DELETE FROM public.events WHERE user_id = target_uid;
  DELETE FROM public.tasks  WHERE user_id = target_uid;
  DELETE FROM public.items  WHERE user_id = target_uid;
  DELETE FROM public.lists  WHERE user_id = target_uid;
  RAISE NOTICE 'Cleared events, tasks, items, and lists';

  RAISE NOTICE 'DONE — All data wiped for user %', target_uid;
END $$;

COMMIT;
