# Mobile Calendar Redesign Plan

**Goal:** Transform the mobile calendar experience from a "shrunk desktop grid" into a native, touch-friendly **Agenda Interface**.

## 1. The Core Problem
Using a Desktop Grid (Month/Week) or even a rigid Day Time-Grid on a mobile phone (350px width) fails because:
*   **Readability:** Event titles get truncated to "Me...".
*   **Wasted Space:** A 24-hour grid shows mostly empty space on a small screen.
*   **Touch Targets:** Clicking a specific hour slot is frustratingly imprecise.

## 2. The Solution: "Agenda + Week Strip" Layout

We will replace the Calendar Grid on mobile with a specialized **Mobile Agenda View**.

### Key Components

#### A. The "Week Strip" (Top Navigation)
*   **What:** A horizontal scrolling strip showing the current week's days (e.g., "Mon 12", "Tue 13").
*   **Benefit:** Allows single-tap navigation between days without opening a full calendar picker.
*   **Interaction:** The selected day is highlighted. Swiping left/right changes the week.

#### B. The "Agenda Stream" (Main Body)
*   **What:** A vertical list of events for the selected day, sorted by time.
*   **Benefit:**
    *   **No "Grid Lines":** Events take full width. Titles are readable.
    *   **Dynamic Height:** 30-minute meetings and 3-hour workshops sit nicely one after another without complex absolute positioning.
    *   **Empty State:** If a day is empty, show a friendly "No plans today" graphic instead of a blank grid.

#### C. The "Task Drawer" (Bottom Sheet)
*   **What:** Instead of a side panel, tasks live in a "pull-up" drawer or a toggleable bottom section.
*   **Benefit:** Keeps the calendar focused, but tasks are just one tap away.

## 3. Implementation Steps

### Step 1: Create `MobileCalendarView.tsx`
This new component will handle the mobile-specific rendering.
*   **Header:** Minimal week strip.
*   **Body:** Filtered list of events for the `selectedDate`.
*   **Visuals:** Large, card-style events (Google Calendar mobile style).

### Step 2: Update `CalendarLayout.tsx`
*   Detect screen size (already doing this).
*   **Conditional Render:**
    *   Desktop: Show `CalendarGrid` / `CalendarWeekView`.
    *   Mobile: Show `MobileCalendarView`.

### Step 3: Touch Gestures (Optional/Phase 2)
*   Add Swipe-to-Delete or Swipe-to-Complete for items in the agenda list.

## 4. User Benefits (The "Why")
1.  **Clarity:** Users can actually read their schedule at a glance.
2.  **Speed:** Jumping to "next Thursday" is one tap, not a complex date picker interaction.
3.  **Focus:** The interface highlights *active* time, hiding the clutter of empty night hours.

## Approval Request
Do you approve this plan to create a dedicated **Mobile Agenda View**?
