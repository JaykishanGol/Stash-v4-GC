import type { Item } from './types';
import { generateId, isImageFile } from './utils';

interface UploadContext {
    userId: string;
    folderId: string | null;
    addUpload: (id: string, name: string) => void;
    updateUploadProgress: (id: string, progress: number, speed: string) => void;
    completeUpload: (id: string, success: boolean, error?: string) => void;
    addItem: (item: Item) => void;
}

/**
 * Upload multiple files and create Item records for each.
 * Shared by file/image tab, folder-upload, and files-into-folder flows.
 */
export async function uploadFilesAsItems(
    files: FileList | File[],
    ctx: UploadContext
): Promise<void> {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
        // Skip hidden/system files
        if (file.name.startsWith('.')) continue;

        const uploadId = generateId();
        const isImage = isImageFile(file.type);

        ctx.addUpload(uploadId, file.name);

        try {
            const { uploadFile } = await import('./supabase');
            const { path, error } = await uploadFile(
                file,
                ctx.userId,
                isImage ? 'image' : 'file',
                (progress) => ctx.updateUploadProgress(uploadId, progress, '1 MB/s')
            );

            if (error) throw error;

            ctx.completeUpload(uploadId, true);

            const newItem: Item = {
                id: generateId(),
                user_id: ctx.userId,
                folder_id: ctx.folderId,
                type: isImage ? 'image' : 'file',
                title: file.name,
                content: {},
                file_meta: {
                    size: file.size,
                    mime: file.type,
                    path: path,
                    originalName: file.name,
                },
                priority: 'none',
                tags: [],
                scheduled_at: null,
                remind_before: null,
                recurring_config: null,
                bg_color: isImage ? '#FEF3C7' : '#FFFFFF',
                is_pinned: false,
                is_archived: false,
                is_completed: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                deleted_at: null,
            };

            ctx.addItem(newItem);
        } catch (error) {
            console.error('Upload failed:', error);
            ctx.completeUpload(uploadId, false, (error as Error).message);
        }
    }
}
