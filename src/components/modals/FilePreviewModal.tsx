import { useState, useEffect, useCallback } from 'react';
import { X, Download, ExternalLink, FileText, Image as ImageIcon, Film, Music, File, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Code } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { supabase, STORAGE_BUCKET } from '../../lib/supabase';
import type { FileMeta } from '../../lib/types';

// Helper to determine accurate file type
const getFileType = (mime: string, path: string) => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (
        mime.includes('text') ||
        mime.includes('json') ||
        mime.includes('javascript') ||
        path.endsWith('.md') ||
        path.endsWith('.ts') ||
        path.endsWith('.tsx') ||
        path.endsWith('.py') ||
        path.endsWith('.css') ||
        path.endsWith('.html')
    ) return 'code';
    return 'other';
};

export function FilePreviewModal() {
    const { previewingItem, setPreviewingItem, items, selectedFolderId } = useAppStore();
    const [publicUrl, setPublicUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [scale, setScale] = useState(1);
    const [lastItemId, setLastItemId] = useState<string | null>(null);

    // Reset state when previewing item changes (Render-time update to avoid useEffect cascade)
    const currentId = previewingItem?.id ?? null;
    if (currentId !== lastItemId) {
        setLastItemId(currentId);
        if (previewingItem) {
            setIsLoading(true);
            setPublicUrl(null);
            setTextContent(null);
            setScale(1);
        }
    }

    // Gallery Navigation Logic
    const getSiblingItem = useCallback((direction: 'next' | 'prev') => {
        if (!previewingItem) return null;

        // Filter visible items in the current context (folder or root)
        const currentContextItems = items.filter(i => {
            // Must be a file/image and match current folder context
            const isFile = i.type === 'file' || i.type === 'image';
            const contextMatch = selectedFolderId ? i.folder_id === selectedFolderId : !i.folder_id;
            return isFile && contextMatch && !i.deleted_at;
        });

        // Sort by updated_at (or however the view is sorted, ideally matching view logic)
        currentContextItems.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

        const currentIndex = currentContextItems.findIndex(i => i.id === previewingItem.id);
        if (currentIndex === -1) return null;

        const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        if (nextIndex >= 0 && nextIndex < currentContextItems.length) {
            return currentContextItems[nextIndex];
        }
        return null;
    }, [items, previewingItem, selectedFolderId]);

    const handleNavigate = useCallback((direction: 'next' | 'prev') => {
        const sibling = getSiblingItem(direction);
        if (sibling) {
            setPreviewingItem(sibling);
            setScale(1); // Reset zoom
            setTextContent(null); // Reset text
        }
    }, [getSiblingItem, setPreviewingItem]);

    // Must be defined BEFORE useEffect that uses it
    const handleClose = useCallback(() => {
        setPreviewingItem(null);
        setPublicUrl(null);
        setTextContent(null);
        setScale(1);
    }, [setPreviewingItem]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!previewingItem) return;
            if (e.key === 'ArrowRight') handleNavigate('next');
            if (e.key === 'ArrowLeft') handleNavigate('prev');
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [previewingItem, handleNavigate, handleClose]);

    // Content Loading
    useEffect(() => {
        if (previewingItem?.file_meta?.path && previewingItem.id === lastItemId) {
            const path = previewingItem.file_meta.path;
            const mime = previewingItem.file_meta.mime || '';
            const type = getFileType(mime, path);

            // 1. Generate URL logic
            const fetchUrl = async () => {
                if (path.startsWith('http')) {
                    setPublicUrl(path);
                    setIsLoading(false);
                    return;
                }

                const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
                if (data?.signedUrl) {
                    setPublicUrl(data.signedUrl);

                    // 2. If Code/Text, download content
                    if (type === 'code') {
                        try {
                            const response = await fetch(data.signedUrl);
                            const text = await response.text();
                            setTextContent(text);
                        } catch (err) {
                            console.error("Failed to fetch text content", err);
                            setTextContent("Error loading content.");
                        }
                    }
                }
                setIsLoading(false);
            };

            fetchUrl();
        }
    }, [previewingItem, lastItemId]);

    if (!previewingItem) return null;

    const fileMeta = previewingItem.file_meta as FileMeta | null;
    if (!fileMeta) return null;

    const type = getFileType(fileMeta.mime || '', fileMeta.path);

    const handleDownload = () => {
        if (publicUrl) {
            const link = document.createElement('a');
            link.href = publicUrl;
            link.download = previewingItem.title || 'download';
            link.click();
        }
    };

    const handleOpenInNewTab = () => window.open(publicUrl || '', '_blank');

    return (
        <div
            className="modal-overlay active"
            onClick={handleClose}
            style={{
                background: 'rgba(0,0,0,0.92)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            {/* Navigation Buttons */}
            <button
                className="nav-btn prev"
                onClick={(e) => { e.stopPropagation(); handleNavigate('prev'); }}
                disabled={!getSiblingItem('prev')}
            >
                <ChevronLeft size={32} />
            </button>
            <button
                className="nav-btn next"
                onClick={(e) => { e.stopPropagation(); handleNavigate('next'); }}
                disabled={!getSiblingItem('next')}
            >
                <ChevronRight size={32} />
            </button>

            <div
                className="file-preview-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#121212',
                    borderRadius: 16,
                    width: '90vw',
                    height: '92vh',
                    maxWidth: 1400,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                    border: '1px solid #333',
                    position: 'relative'
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    borderBottom: '1px solid #333',
                    background: '#1a1a1a',
                    zIndex: 10
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                        {type === 'image' ? <ImageIcon size={20} color="#F59E0B" /> :
                            type === 'video' ? <Film size={20} color="#3B82F6" /> :
                                type === 'audio' ? <Music size={20} color="#EC4899" /> :
                                    type === 'code' ? <Code size={20} color="#10B981" /> :
                                        <FileText size={20} color="#9CA3AF" />}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>
                                {previewingItem.title}
                            </span>
                            <span style={{ color: '#666', fontSize: '0.75rem' }}>
                                {formatSize(fileMeta.size)} • {new Date(previewingItem.updated_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {type === 'image' && (
                            <div style={{ display: 'flex', gap: 4, marginRight: 16, background: '#333', borderRadius: 6, padding: 2 }}>
                                <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="icon-btn-sm"><ZoomOut size={16} /></button>
                                <span style={{ color: '#aaa', fontSize: '0.75rem', display: 'flex', alignItems: 'center', minWidth: 40, justifyContent: 'center' }}>{Math.round(scale * 100)}%</span>
                                <button onClick={() => setScale(s => Math.min(3, s + 0.25))} className="icon-btn-sm"><ZoomIn size={16} /></button>
                            </div>
                        )}
                        <button onClick={handleOpenInNewTab} className="icon-btn" title="Open in new tab"><ExternalLink size={20} /></button>
                        <button onClick={handleDownload} className="icon-btn" title="Download"><Download size={20} /></button>
                        <button onClick={handleClose} className="icon-btn" title="Close"><X size={24} /></button>
                    </div>
                </div>

                {/* Preview Content */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0a0a0a',
                    overflow: type === 'code' ? 'hidden' : 'auto',
                    position: 'relative',
                }}>
                    {isLoading || !publicUrl ? (
                        <div className="loading-pulse" style={{ color: '#666' }}>Loading content...</div>
                    ) : (
                        <>
                            {type === 'image' && (
                                <div style={{ overflow: 'auto', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img
                                        src={publicUrl}
                                        alt={previewingItem.title}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '100%',
                                            objectFit: 'contain',
                                            transform: `scale(${scale})`,
                                            transition: 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)'
                                        }}
                                    />
                                </div>
                            )}

                            {type === 'code' && (
                                <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '24px', background: '#1e1e1e' }}>
                                    <pre style={{ margin: 0, fontFamily: "'Fira Code', monospace", fontSize: '0.9rem', color: '#e5e5e5', lineHeight: 1.6 }}>
                                        <code>{textContent || 'Loading text...'}</code>
                                    </pre>
                                </div>
                            )}

                            {type === 'video' && (
                                <video src={publicUrl} controls style={{ width: '100%', height: '100%', outline: 'none' }} />
                            )}

                            {type === 'audio' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                                    <div style={{
                                        width: 120, height: 120, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 0 40px rgba(236, 72, 153, 0.3)'
                                    }}>
                                        <Music size={64} color="white" />
                                    </div>
                                    <audio src={publicUrl} controls style={{ width: 400 }} />
                                </div>
                            )}

                            {type === 'pdf' && (
                                <iframe src={publicUrl} title={previewingItem.title} style={{ width: '100%', height: '100%', border: 'none' }} />
                            )}

                            {type === 'other' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, color: '#9CA3AF' }}>
                                    <File size={80} strokeWidth={1} />
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ fontSize: '1.2rem', color: '#fff', marginBottom: 8 }}>Preview not supported</p>
                                        <p style={{ fontFamily: 'monospace' }}>{fileMeta.mime}</p>
                                    </div>
                                    <button onClick={handleDownload} className="primary-btn">Download File</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .nav-btn {
                    position: fixed;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #fff;
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center; justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    z-index: 10001;
                }
                .nav-btn:hover:not(:disabled) {
                    background: rgba(255,255,255,0.15);
                    transform: translateY(-50%) scale(1.1);
                }
                .nav-btn:disabled {
                    opacity: 0.2;
                    cursor: not-allowed;
                }
                .nav-btn.prev { left: 24px; }
                .nav-btn.next { right: 24px; }

                .icon-btn {
                    background: transparent;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
                
                .icon-btn-sm {
                    background: transparent;
                    border: none;
                    color: #aaa;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    display: flex;
                }
                .icon-btn-sm:hover { color: #fff; }

                .primary-btn {
                    background: #3B82F6;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 1rem;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.2s;
                }
                .primary-btn:hover { background: #2563EB; }
                
                @keyframes pulse {
                    0% { opacity: 0.5; }
                    50% { opacity: 1; }
                    100% { opacity: 0.5; }
                }
                .loading-pulse { animation: pulse 1.5s infinite; }
            `}</style>
        </div>
    );
}

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
}
