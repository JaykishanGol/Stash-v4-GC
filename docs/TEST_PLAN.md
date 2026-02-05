# Stash V4 - Verification Test Plan

Since we made major changes to the application's "brain" (the Store) and "navigation system" (the Router), we need to check that everything still works as expected.

## 1. Navigation & Routing (The New System)
*   [ ] **Dashboard:** Open the app. Does it load the "Today" view by default?
*   [ ] **URL Change:** Click "Upcoming" in the Sidebar. Does the URL change to `localhost:xxxx/upcoming`?
*   [ ] **Browser Back:** Click "Reminders". Then click the Browser's **Back Button**. Do you go back to "Upcoming"? (This was broken before!)
*   [ ] **Deep Link:** Copy the URL for a specific list (e.g., `/list/some-id`) and paste it into a new tab. Does it load that list directly?
*   [ ] **Smart Folders:** Click "Images" in Quick Access (Main Dashboard). Does it navigate to `/type/images`?

## 2. Data Reactivity (The "Deaf Waiter" Fix)
*   [ ] **Add Item:** Click "Add" -> "Note". Type "Test Reactivity". Hit Enter.
    *   *Check:* Does it appear **instantly** in the list? (No refreshing, no waiting 30s).
*   [ ] **Complete Task:** Click the checkbox on a Task.
    *   *Check:* Does the "Tasks" count in the Sidebar update instantly?
*   [ ] **Edit Item:** Click an item, change its title in the modal. Close modal.
    *   *Check:* Does the title update on the card immediately?

## 3. Sync Safety (The "Trash Can" Fix)
*   [ ] **Offline Test (Simulated):**
    *   Turn off your internet (or set Network to Offline in DevTools).
    *   Create a new Note "Offline Note".
    *   Refresh the page (while offline).
    *   *Check:* Is "Offline Note" still there? (Persisted to localStorage).
    *   Turn internet back on.
    *   *Check:* Check the console. Do you see `[Queue] Operation upsert-item succeeded`?
*   [ ] **Error Handling:** We can't easily force a DB error without code changes, but if you see a red "Sync Failed" toast, that is Good! It means it didn't silently delete your data.

## 4. Notifications (The "Double Alarm" Fix)
*   [ ] **Set Reminder:** Create a task "Test Alarm" and set a reminder for 1 minute from now.
*   [ ] **Wait:** Keep the app open.
    *   *Check:* Do you get **ONE** in-app toast notification?
    *   *Check:* Do you **NOT** get a second push notification from the system/browser a few seconds later? (This confirms the client acknowledged it).

## 5. UI & Layout
*   [ ] **Sidebar Toggle:** Click the menu button. Does the sidebar close/open smoothly?
*   [ ] **Mobile View:** Resize browser to phone size.
    *   Scroll down. Does the header hide?
    *   Stop scrolling. Does the header reappear?
