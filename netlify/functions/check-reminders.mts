import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// Supabase credentials — client created inside handler to avoid cold-start issues
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export default async (req, context) => {
    // Create client inside handler to ensure fresh connection per invocation
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[check-reminders] Scheduled function started at:', new Date().toISOString());

    if (!vapidPublicKey || !vapidPrivateKey) {
        console.error('[check-reminders] VAPID keys not configured');
        return new Response('VAPID keys not configured', { status: 500 });
    }

    if (!supabaseServiceKey) {
        console.error('[check-reminders] Supabase service key not configured');
        return new Response('Supabase service key not configured', { status: 500 });
    }

    try {
        const now = new Date().toISOString();
        console.log(`[check-reminders] Checking for reminders due before: ${now}`);

        // Call the optimized RPC function
        const { data: allDue, error: rpcError } = await supabase
            .rpc('get_due_reminders', { check_time: now });

        if (rpcError) {
            console.error('[check-reminders] RPC Error:', rpcError);
            throw rpcError;
        }

        console.log(`[check-reminders] Found ${allDue?.length || 0} due reminders via RPC`);

        // Debug: Log the first few items (securely)
        if (allDue && allDue.length > 0) {
            allDue.slice(0, 3).forEach((item: any) => {
                console.log(`[check-reminders] Processing ${item.type} ID: ${item.id} | next_trigger_at: ${item.next_trigger_at}`);
            });
        }

        // ── Anti-spam: cap + deduplicate ──────────────────────
        const MAX_NOTIFICATIONS_PER_USER = 10;

        // Group by user_id
        const byUser: Record<string, any[]> = {};
        for (const item of (allDue || [])) {
            if (!byUser[item.user_id]) byUser[item.user_id] = [];
            byUser[item.user_id].push(item);
        }

        // Deduplicate by title per user (keep the newest) and cap
        for (const userId of Object.keys(byUser)) {
            const seenTitles = new Set<string>();
            const deduped: any[] = [];
            // Sort newest first so we keep the freshest per title
            byUser[userId].sort((a: any, b: any) =>
                new Date(b.scheduled_at || 0).getTime() - new Date(a.scheduled_at || 0).getTime()
            );
            for (const item of byUser[userId]) {
                const key = (item.title || '').toLowerCase().trim();
                if (seenTitles.has(key)) {
                    // Still acknowledge duplicates so they don't re-fire next minute
                    const table = item.type === 'task' ? 'tasks' : 'items';
                    await supabase.from(table).update({ last_acknowledged_at: now }).eq('id', item.id);
                    continue;
                }
                seenTitles.add(key);
                deduped.push(item);
            }
            byUser[userId] = deduped.slice(0, MAX_NOTIFICATIONS_PER_USER);
            console.log(`[check-reminders] User ${userId}: ${allDue?.length || 0} due → ${byUser[userId].length} after dedup+cap`);
        }

        // BATCH: Fetch all push subscriptions for all affected users in ONE query
        const userIds = Object.keys(byUser);
        if (userIds.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                processed: 0,
                timestamp: now
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { data: allSubscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('user_id, endpoint, p256dh, auth')
            .in('user_id', userIds);

        if (subError) {
            console.error('[check-reminders] Error fetching subscriptions:', subError);
        }

        // Index subscriptions by user_id for O(1) lookup
        const subsByUser: Record<string, typeof allSubscriptions> = {};
        for (const sub of (allSubscriptions || [])) {
            if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
            subsByUser[sub.user_id].push(sub);
        }

        // Send notifications for each user
        for (const [userId, items] of Object.entries(byUser)) {
            const subscriptions = subsByUser[userId];

            if (!subscriptions || subscriptions.length === 0) {
                console.log(`[check-reminders] No subscriptions for user ${userId}`);
                continue;
            }

            // Send notification for each due item
            for (const item of items) {
                // Use the `type` column from the RPC — 'task' for tasks, item type for items
                const isTask = item.type === 'task';
                const scheduledDate = item.scheduled_at ? new Date(item.scheduled_at) : null;
                const timeStr = scheduledDate
                    ? scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                    : '';
                const dateStr = scheduledDate
                    ? scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';

                // Rich title with priority indicator
                const priorityEmoji = item.priority === 'high' ? '🔴 ' : item.priority === 'medium' ? '🟡 ' : item.priority === 'low' ? '🔵 ' : '';
                const title = isTask
                    ? `${priorityEmoji}Task Due: ${item.title}`
                    : `${priorityEmoji}Reminder: ${item.title}`;

                // Rich body with context
                const bodyParts: string[] = [];

                if (timeStr) {
                    const isOverdue = scheduledDate && scheduledDate < new Date();
                    bodyParts.push(isOverdue ? `⚠️ Was due at ${timeStr} on ${dateStr}` : `📅 ${dateStr} at ${timeStr}`);
                }

                if (item.remind_before && item.remind_before > 0) {
                    bodyParts.push(`🔔 ${item.remind_before}min early reminder`);
                }

                // Add description preview if available (RPC now returns these columns)
                if (isTask && item.description) {
                    bodyParts.push(item.description.substring(0, 80));
                } else if (!isTask && item.content) {
                    const text = typeof item.content === 'object' && item.content?.text
                        ? item.content.text.substring(0, 80)
                        : '';
                    if (text) bodyParts.push(text);
                }

                // Item type indicator for non-tasks
                if (!isTask && item.type) {
                    const typeLabels: Record<string, string> = { note: '📝 Note', link: '🔗 Link', file: '📎 File', image: '🖼️ Image', folder: '📂 Folder' };
                    bodyParts.push(typeLabels[item.type] || item.type);
                }

                const body = bodyParts.join(' • ') || 'Tap to view details';
                
                // 1. Insert into Persistent Database History
                // We do this BEFORE push to ensure history exists even if push fails
                const { error: dbError } = await supabase
                    .from('notifications')
                    .insert({
                        user_id: userId,
                        type: item.priority === 'high' ? 'warning' : 'info',
                        title: title,
                        message: body,
                        data: { 
                            itemId: item.id, 
                            type: isTask ? 'task' : item.type,
                            priority: item.priority || 'none',
                            scheduledAt: item.scheduled_at,
                            itemType: item.type || null
                        },
                        is_read: false
                    });

                if (dbError) {
                    console.error(`[check-reminders] Failed to save notification history for ${item.id}:`, dbError);
                }

                // 2. Send Web Push
                const payload = JSON.stringify({
                    title: title,
                    body: body,
                    icon: '/icon.png',
                    badge: '/icon.png',
                    tag: item.id,
                    data: {
                        itemId: item.id,
                        type: isTask ? 'task' : item.type,
                        priority: item.priority || 'none',
                        scheduledAt: item.scheduled_at,
                        url: `/?open=${isTask ? 'task' : 'item'}&id=${item.id}`
                    },
                    actions: isTask
                        ? [
                            { action: 'complete', title: '✅ Done' },
                            { action: 'snooze', title: '⏰ Snooze 10min' }
                        ]
                        : [
                            { action: 'view', title: '👁️ View' },
                            { action: 'snooze', title: '⏰ Snooze 10min' }
                        ],
                    requireInteraction: item.priority === 'high'
                });

                // Send to all user's subscriptions in parallel
                const pushResults = await Promise.allSettled(
                    subscriptions.map(async (sub) => {
                        const pushSubscription = {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        };

                        try {
                            await webpush.sendNotification(pushSubscription, payload);
                            console.log(`[check-reminders] Sent notification for "${item.title}" to ${sub.endpoint.slice(-20)}`);
                        } catch (pushError) {
                            console.error(`[check-reminders] Push failed:`, pushError.message);

                            // Remove invalid subscription
                            if (pushError.statusCode === 410 || pushError.statusCode === 404) {
                                await supabase
                                    .from('push_subscriptions')
                                    .delete()
                                    .eq('endpoint', sub.endpoint);
                                console.log('[check-reminders] Removed invalid subscription');
                            }
                        }
                    })
                );

                // Update last_acknowledged_at to prevent duplicate notifications
                const table = item.type === 'task' ? 'tasks' : 'items';
                await supabase
                    .from(table)
                    .update({ last_acknowledged_at: now })
                    .eq('id', item.id);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            processed: allDue.length,
            timestamp: now
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[check-reminders] Fatal error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// Netlify scheduled function config
export const config = {
    schedule: "* * * * *" // Every minute
};
