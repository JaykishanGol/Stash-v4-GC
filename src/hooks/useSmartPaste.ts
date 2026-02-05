import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { createDefaultItem } from '../lib/types';
import { generateId, isValidUrl, isImageFile } from '../lib/utils';
import { compressImage, isCompressibleImage } from '../lib/imageCompression';
import type { FileMeta } from '../lib/types';

export function useSmartPaste() {
    const {
        addItem,
        user,
        addUpload,
        updateUploadProgress,
        completeUpload
    } = useAppStore();

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            const clipboardData = e.clipboardData;
            if (!clipboardData) return;

            // Check for files first
            if (clipboardData.files.length > 0) {
                e.preventDefault();

                Array.from(clipboardData.files).forEach(async (originalFile) => {
                    const isImage = isImageFile(originalFile.type);
                    const uploadId = generateId();

                    addUpload(uploadId, originalFile.name);

                    try {
                        // Compress image before upload
                        let fileToUpload = originalFile;
                        if (isImage && isCompressibleImage(originalFile)) {
                            updateUploadProgress(uploadId, 5, 'Compressing...');
                            fileToUpload = await compressImage(originalFile);
                        }

                        const { uploadFile } = await import('../lib/supabase');
                        const { path, error } = await uploadFile(
                            fileToUpload,
                            user?.id || 'demo',
                            isImage ? 'image' : 'file',
                            (progress) => updateUploadProgress(uploadId, progress, '1 MB/s')
                        );

                        if (error) throw error;

                        completeUpload(uploadId, true);

                        const fileMeta: FileMeta = {
                            size: fileToUpload.size, // Use compressed size
                            mime: fileToUpload.type,
                            path: path,
                            originalName: originalFile.name,
                        };

                        const newItem = createDefaultItem(user?.id || 'demo', isImage ? 'image' : 'file', {
                            title: originalFile.name,
                            file_meta: fileMeta,
                            bg_color: isImage ? '#FEF3C7' : '#FFFFFF',
                        });

                        addItem(newItem);
                    } catch (error) {
                        console.error('Paste upload failed:', error);
                        completeUpload(uploadId, false, (error as Error).message);
                    }
                });
                return;
            }

            // Check for text
            const text = clipboardData.getData('text/plain');
            if (!text) return;

            e.preventDefault();

            // Check if it's a URL
            if (isValidUrl(text)) {
                const newItem = createDefaultItem(user?.id || 'demo', 'link', {
                    title: 'Pasted Link',
                    content: { url: text, title: 'Pasted Link' },
                    bg_color: '#BFDBFE',
                });

                addItem(newItem);
            } else {
                // It's plain text - create a note
                const newItem = createDefaultItem(user?.id || 'demo', 'note', {
                    title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
                    content: { text },
                    bg_color: '#FDE68A',
                });

                addItem(newItem);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [addItem, user, addUpload, updateUploadProgress, completeUpload]);
}
