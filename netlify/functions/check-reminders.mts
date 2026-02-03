import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:gjaykishan@gmail.com';

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// Supabase client with service role (bypasses RLS)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async (req, context) => {
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

        // Debug: Check total items count first
        const { count: totalItems, error: countError } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true });
        console.log(`[check-reminders] Total items in DB: ${totalItems || 0}`);
        if (countError) {
            console.error('[check-reminders] Error counting items:', countError);
        }

        // Debug: Check a sample item to see its columns
        const { data: sampleItem, error: sampleError } = await supabase
            .from('items')
            .select('id, title, reminder_type, one_time_at, next_trigger_at')
            .limit(1)
            .single();
        if (sampleError && sampleError.code !== 'PGRST116') {
            console.error('[check-reminders] Error fetching sample:', sampleError);
        } else if (sampleItem) {
            console.log(`[check-reminders] Sample item: "${sampleItem.title}" | reminder_type: ${sampleItem.reminder_type} | next_trigger_at: ${sampleItem.next_trigger_at}`);
        }

        // Debug: Check total items/tasks with any next_trigger_at set
        const { data: allReminders, count: reminderCount } = await supabase
            .from('items')
            .select('id, title, next_trigger_at', { count: 'exact' })
            .not('next_trigger_at', 'is', null);
        console.log(`[check-reminders] Total items with reminders set: ${reminderCount || 0}`);
        if (allReminders && allReminders.length > 0) {
            allReminders.slice(0, 5).forEach(r => {
                console.log(`[check-reminders] Scheduled: "${r.title}" at ${r.next_trigger_at}`);
            });
        }

        // Query items with due reminders
        // Note: We can't compare two columns (last_ack < next_trigger) easily in Supabase JS
        // So we fetch all due items and filter in memory
        const { data: dueItems, error: itemsError } = await supabase
            .from('items')
            .select('id, user_id, title, next_trigger_at, last_acknowledged_at')
            .not('next_trigger_at', 'is', null)
            .lte('next_trigger_at', now);

        if (itemsError) {
            console.error('[check-reminders] Error querying items:', itemsError);
        } else {
            console.log(`[check-reminders] Raw items with next_trigger_at <= now: ${dueItems?.length || 0}`);
            if (dueItems && dueItems.length > 0) {
                dueItems.forEach(item => {
                    console.log(`[check-reminders] Item: "${item.title}" | next_trigger_at: ${item.next_trigger_at} | last_ack: ${item.last_acknowledged_at}`);
                });
            }
        }

        // Query tasks with due reminders
        const { data: dueTasks, error: tasksError } = await supabase
            .from('tasks')
            .select('id, user_id, title, next_trigger_at, last_acknowledged_at')
            .not('next_trigger_at', 'is', null)
            .lte('next_trigger_at', now);

        if (tasksError) {
            console.error('[check-reminders] Error querying tasks:', tasksError);
        } else {
            console.log(`[check-reminders] Raw tasks with next_trigger_at <= now: ${dueTasks?.length || 0}`);
            if (dueTasks && dueTasks.length > 0) {
                dueTasks.forEach(task => {
                    console.log(`[check-reminders] Task: "${task.title}" | next_trigger_at: ${task.next_trigger_at} | last_ack: ${task.last_acknowledged_at}`);
                });
            }
        }

        let allDue = [...(dueItems || []), ...(dueTasks || [])];

        // Filter out items that have already been acknowledged for their current trigger time
        allDue = allDue.filter(item => {
            if (!item.last_acknowledged_at) return true; // Never acknowledged
            return new Date(item.last_acknowledged_at) < new Date(item.next_trigger_at);
        });

        console.log(`[check-reminders] Found ${allDue.length} due reminders (after filtering ack)`);

        // Debug: Check total push subscriptions in database
        const { data: allSubs, count: subCount } = await supabase
            .from('push_subscriptions')
            .select('user_id, endpoint', { count: 'exact' });
        console.log(`[check-reminders] Total push subscriptions in DB: ${subCount || 0}`);
        if (allSubs && allSubs.length > 0) {
            allSubs.forEach(s => {
                console.log(`[check-reminders] Subscription for user ${s.user_id}: ...${s.endpoint.slice(-30)}`);
            });
        }

        // Group by user_id
        const byUser = {};
        for (const item of allDue) {
            if (!byUser[item.user_id]) byUser[item.user_id] = [];
            byUser[item.user_id].push(item);
        }

        // Send notifications for each user
        for (const [userId, items] of Object.entries(byUser)) {
            // Get user's push subscriptions
            const { data: subscriptions, error: subError } = await supabase
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('user_id', userId);

            if (subError) {
                console.error(`[check-reminders] Error getting subscriptions for ${userId}:`, subError);
                continue;
            }

            if (!subscriptions || subscriptions.length === 0) {
                console.log(`[check-reminders] No subscriptions for user ${userId}`);
                continue;
            }

            // Send notification for each due item
            for (const item of items) {
                const isTask = 'item_ids' in item;
                const title = isTask ? `Task Due: ${item.title}` : `Reminder: ${item.title}`;
                const body = 'Tap to view details';
                
                // 1. Insert into Persistent Database History
                // We do this BEFORE push to ensure history exists even if push fails
                const { error: dbError } = await supabase
                    .from('notifications')
                    .insert({
                        user_id: userId,
                        type: 'info',
                        title: title,
                        message: body,
                        data: { 
                            itemId: item.id, 
                            type: isTask ? 'task' : 'item' 
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
                    icon: '/vite.svg',
                    tag: item.id,
                    data: { itemId: item.id, type: isTask ? 'task' : 'item' }
                });

                // Send to all user's subscriptions
                for (const sub of subscriptions) {
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
                }

                // Update last_acknowledged_at to prevent duplicate notifications
                const table = isTask ? 'tasks' : 'items';
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
