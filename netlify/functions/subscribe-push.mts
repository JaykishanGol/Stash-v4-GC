import { createClient } from '@supabase/supabase-js';

// Supabase client with service role (bypasses RLS - we verify user manually)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Service role client for database operations (bypasses RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
// Anon client for auth verification
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

export default async (req, context) => {
    const method = req.method;

    // Get auth token from header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user using auth client
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
        console.error('[subscribe-push] Auth error:', authError);
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        if (method === 'POST') {
            // Subscribe: Save push subscription
            const body = await req.json();
            const { endpoint, keys } = body;

            if (!endpoint || !keys?.p256dh || !keys?.auth) {
                return new Response(JSON.stringify({ error: 'Invalid subscription data' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const { error } = await supabaseAdmin
                .from('push_subscriptions')
                .upsert({
                    user_id: user.id,
                    endpoint: endpoint,
                    p256dh: keys.p256dh,
                    auth: keys.auth,
                    user_agent: req.headers.get('user-agent') || null
                }, { onConflict: 'user_id,endpoint' });

            if (error) {
                console.error('[subscribe-push] Error saving subscription:', error);
                return new Response(JSON.stringify({ error: 'Failed to save subscription' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            console.log(`[subscribe-push] Subscription saved for user ${user.id}`);
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

        } else if (method === 'DELETE') {
            // Unsubscribe: Remove push subscription
            const body = await req.json();
            const { endpoint } = body;

            if (!endpoint) {
                return new Response(JSON.stringify({ error: 'Endpoint required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            const { error } = await supabaseAdmin
                .from('push_subscriptions')
                .delete()
                .eq('user_id', user.id)
                .eq('endpoint', endpoint);

            if (error) {
                console.error('[subscribe-push] Error deleting subscription:', error);
                return new Response(JSON.stringify({ error: 'Failed to delete subscription' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            console.log(`[subscribe-push] Subscription removed for user ${user.id}`);
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

        } else {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('[subscribe-push] Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
