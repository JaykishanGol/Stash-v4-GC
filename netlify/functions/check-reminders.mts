import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

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

        // Group by user_id
        const byUser: Record<string, any[]> = {};
        for (const item of (allDue || [])) {
            if (!byUser[item.user_id]) byUser[item.user_id] = [];
            byUser[item.user_id].push(item);
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
