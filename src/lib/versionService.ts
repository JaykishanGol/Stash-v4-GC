import { supabase } from './supabase';
import type { ItemVersion } from './versionTypes';

export async function getItemVersions(itemId: string): Promise<ItemVersion[]> {
    const { data, error } = await supabase
        .from('item_versions')
        .select('*')
        .eq('item_id', itemId)
        .order('version', { ascending: false });

    if (error) {
        console.error('[VersionHistory] Error fetching versions:', error);
        return [];
    }

    return data || [];
}

export async function restoreVersion(version: ItemVersion): Promise<void> {
    const { error } = await supabase
        .from('items')
        .update({
            title: version.title,
            content: version.content,
            updated_at: new Date().toISOString(),
            is_unsynced: true // Trigger sync
        })
        .eq('id', version.item_id);

    if (error) {
        console.error('[VersionHistory] Error restoring version:', error);
        throw error;
    }
}
