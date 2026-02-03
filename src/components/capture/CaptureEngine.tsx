import { useState, useEffect, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { FileMeta } from '../../lib/types';
import { createDefaultItem } from '../../lib/types';
import { generateId, isImageFile } from '../../lib/utils';
import { UploadToast } from './UploadToast';

export function DragDropOverlay() {
    const [isDragging, setIsDragging] = useState(false);
    const {
        addItem,
        user,
        addUpload,
        updateUploadProgress,
        completeUpload
    } = useAppStore();

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes('Files')) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only hide if leaving the window
        if (e.relatedTarget === null) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const items = e.dataTransfer?.items;
        if (!items || items.length === 0) return;

        // Recursive function to read entries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traverseFileTree = async (entry: any, path = ''): Promise<File[]> => {
            if (entry.isFile) {
                return new Promise((resolve) => {
                    entry.file((file: File) => {
                        resolve([file]);
                    });
                });
            } else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                return new Promise((resolve) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    dirReader.readEntries(async (entries: any[]) => {
                        const entriesPromises = entries.map((e) => traverseFileTree(e, `${path}${entry.name}/`));
                        const files = await Promise.all(entriesPromises);
                        resolve(files.flat());
                    });
                });
            }
            return [];
        };

        const uploadQueue: File[] = [];
        const entries = Array.from(items).map(item => item.webkitGetAsEntry());

        for (const entry of entries) {
            if (entry) {
                const files = await traverseFileTree(entry);
                uploadQueue.push(...files);
            }
        }

        if (uploadQueue.length === 0) return;

        // FIXED: Process uploads with CONCURRENCY LIMIT (5 at a time)
        const CONCURRENCY_LIMIT = 5;
        const processFile = async (file: File) => {
            const uploadId = generateId();
            const isImage = isImageFile(file.type);

            // Add to upload queue UI
            addUpload(uploadId, file.name);

            try {
                // Import dynamically
                const { uploadFile } = await import('../../lib/supabase');

                // Real Upload
                const { path, error } = await uploadFile(
                    file,
                    user?.id || 'demo',
                    isImage ? 'image' : 'file',
                    (progress) => updateUploadProgress(uploadId, progress, '1 MB/s')
                );

                if (error) throw error;

                completeUpload(uploadId, true);

                const fileMeta: FileMeta = {
                    size: file.size,
                    mime: file.type,
                    path: path,
                    originalName: file.name,
                };

                const newItem = createDefaultItem(user?.id || 'demo', isImage ? 'image' : 'file', {
                    title: file.name,
                    file_meta: fileMeta,
                    bg_color: isImage ? '#FEF3C7' : '#FFFFFF',
                });

                addItem(newItem);

            } catch (error) {
                console.error('Upload failed:', error);
                completeUpload(uploadId, false, (error as Error).message);
            }
        };

        // Queue processor with concurrency limit
        const processQueue = async () => {
            let activeCount = 0;
            let index = 0;

            const processNext = async (): Promise<void> => {
                if (index >= uploadQueue.length) return;

                const file = uploadQueue[index++];
                activeCount++;

                try {
                    await processFile(file);
                } finally {
                    activeCount--;
                    if (index < uploadQueue.length && activeCount < CONCURRENCY_LIMIT) {
                        await processNext();
                    }
                }
            };

            // Start initial batch
            const initialBatch = Math.min(CONCURRENCY_LIMIT, uploadQueue.length);
            await Promise.all(Array(initialBatch).fill(0).map(() => processNext()));
        };

        processQueue();
    }, [addItem, addUpload, updateUploadProgress, completeUpload, user]);

    // PREVENT TAB CLOSE IF UPLOADING
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
             // Access store directly to get latest upload state
             const { uploads } = useAppStore.getState();
             const isUploading = uploads.some(u => u.status === 'uploading');
             
             if (isUploading) {
                 e.preventDefault();
                 e.returnValue = ''; // Legacy support
                 return 'Uploads are in progress. Are you sure you want to leave?';
             }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useEffect(() => {
        const body = document.body;

        body.addEventListener('dragenter', handleDragEnter);
        body.addEventListener('dragleave', handleDragLeave);
        body.addEventListener('dragover', handleDragOver);
        body.addEventListener('drop', handleDrop);

        return () => {
            body.removeEventListener('dragenter', handleDragEnter);
            body.removeEventListener('dragleave', handleDragLeave);
            body.removeEventListener('dragover', handleDragOver);
            body.removeEventListener('drop', handleDrop);
        };
    }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

    return (
        <>
            {/* Upload Toast - managed by global store */}
            <UploadToast />

            {/* Drag Overlay - only when dragging */}
            {isDragging && (
                <div
                    className="drag-overlay"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        background: 'rgba(245, 158, 11, 0.1)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '3px dashed #F59E0B',
                        margin: 16,
                        borderRadius: 20,
                        pointerEvents: 'auto',
                    }}
                    onClick={() => setIsDragging(false)}
                >
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 16,
                    }}>
                        <div style={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                        }}>
                            <Upload size={36} style={{ color: '#F59E0B' }} />
                        </div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 600,
                            color: '#1F2937',
                        }}>
                            Drop to Stash
                        </div>
                        <div style={{
                            fontSize: '0.875rem',
                            color: '#6B7280',
                        }}>
                            Files will be automatically organized
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}