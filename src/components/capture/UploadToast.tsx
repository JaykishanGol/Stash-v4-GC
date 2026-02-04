import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { UploadItem } from '../../lib/types';

export function UploadToast() {
    const { uploads, dismissUpload, dismissAllUploads } = useAppStore();
    const [isMinimized, setIsMinimized] = useState(false);

    // Auto-minimize when all done, auto-expand when new uploads start
    useEffect(() => {
        const hasActive = uploads.some(u => u.status === 'uploading');
        if (hasActive && isMinimized) {
            setIsMinimized(false);
        } else if (!hasActive && !isMinimized && uploads.length > 0) {
            // Optional: Auto-minimize after success?
            // setTimeout(() => setIsMinimized(true), 3000);
        }
    }, [uploads.length, uploads.some(u => u.status === 'uploading')]);

    if (uploads.length === 0) return null;

    const activeUploads = uploads.filter(u => u.status === 'uploading');
    const successUploads = uploads.filter(u => u.status === 'success');

    const activeCount = activeUploads.length;
    
    // Calculate global progress
    const totalProgress = activeCount > 0 
        ? Math.round(activeUploads.reduce((acc, u) => acc + u.progress, 0) / activeCount) 
        : 100;

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            right: 24,
            zIndex: 9999,
            width: 360,
            background: '#fff',
            borderRadius: '12px 12px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            border: '1px solid var(--border-light)',
            borderBottom: 'none',
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isMinimized ? 'translateY(calc(100% - 48px))' : 'translateY(0)',
        }}>
            {/* Header / Minimized State */}
            <div 
                onClick={() => setIsMinimized(!isMinimized)}
                style={{
                    height: 48,
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: '#1F2937', // Dark header like Gmail
                    color: 'white',
                    borderRadius: isMinimized ? '12px 12px 0 0' : '12px 12px 0 0',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {activeCount > 0 ? (
                        <div style={{ position: 'relative', width: 20, height: 20 }}>
                            <svg width="20" height="20" viewBox="0 0 36 36">
                                <path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="#4B5563"
                                    strokeWidth="4"
                                />
                                <path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="#10B981"
                                    strokeWidth="4"
                                    strokeDasharray={`${totalProgress}, 100`}
                                />
                            </svg>
                        </div>
                    ) : (
                        <CheckCircle size={20} color="#10B981" />
                    )}
                    
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                        {activeCount > 0 
                            ? `Uploading ${activeCount} item${activeCount !== 1 ? 's' : ''}` 
                            : `${successUploads.length} item${successUploads.length !== 1 ? 's' : ''} uploaded`
                        }
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className="icon-btn-dark">
                        {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {!activeCount && (
                        <button 
                            className="icon-btn-dark"
                            onClick={(e) => { e.stopPropagation(); dismissAllUploads(); }}
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded List */}
            <div style={{
                maxHeight: 300,
                overflowY: 'auto',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {uploads.map((upload) => (
                    <UploadItemRow key={upload.id} upload={upload} onDismiss={dismissUpload} />
                ))}
            </div>

            <style>{`
                .icon-btn-dark {
                    background: transparent;
                    border: none;
                    color: rgba(255,255,255,0.7);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    transition: all 0.2s;
                }
                .icon-btn-dark:hover {
                    color: white;
                    background: rgba(255,255,255,0.1);
                }
            `}</style>
        </div>
    );
}

function UploadItemRow({ upload, onDismiss }: { upload: UploadItem; onDismiss: (id: string) => void }) {
    const isError = upload.status === 'error';
    const isSuccess = upload.status === 'success';
    const isUploading = upload.status === 'uploading';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid #F3F4F6',
            fontSize: '0.85rem',
        }}>
            {/* Status Icon */}
            <div style={{ flexShrink: 0 }}>
                {isUploading ? (
                    <RefreshCw size={18} className="animate-spin" color="#F59E0B" />
                ) : isSuccess ? (
                    <CheckCircle size={18} color="#10B981" />
                ) : (
                    <XCircle size={18} color="#EF4444" />
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                    fontWeight: 500, 
                    color: '#374151',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {upload.fileName}
                </div>
                
                {isUploading && (
                    <div style={{ 
                        marginTop: 4, 
                        height: 4, 
                        background: '#F3F4F6', 
                        borderRadius: 2, 
                        overflow: 'hidden' 
                    }}>
                        <div style={{ 
                            width: `${upload.progress}%`, 
                            height: '100%', 
                            background: '#F59E0B', 
                            transition: 'width 0.2s linear' 
                        }} />
                    </div>
                )}
                
                {isError && (
                    <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 2 }}>
                        {upload.error || 'Upload failed'}
                    </div>
                )}
            </div>

            {/* Action */}
            {!isUploading && (
                <button 
                    onClick={() => onDismiss(upload.id)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#9CA3AF',
                        cursor: 'pointer',
                        padding: 4,
                    }}
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
