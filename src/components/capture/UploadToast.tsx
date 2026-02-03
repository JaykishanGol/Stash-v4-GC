import { CheckCircle, XCircle, Upload, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { UploadItem } from '../../lib/types';

export function UploadToast() {
    const { uploads, dismissUpload, dismissAllUploads } = useAppStore();

    if (uploads.length === 0) return null;

    const completedCount = uploads.filter(u => u.status !== 'uploading').length;
    const uploadingCount = uploads.filter(u => u.status === 'uploading').length;
    const successCount = uploads.filter(u => u.status === 'success').length;
    const errorCount = uploads.filter(u => u.status === 'error').length;

    return (
        <div style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxWidth: 360,
            width: '100%',
        }}>
            {/* Summary Card */}
            <div style={{
                background: '#fff',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                border: '1px solid var(--border-light)',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                    }}>
                        <Upload size={18} style={{ color: 'var(--accent)' }} />
                        {uploadingCount > 0 ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? 's' : ''}...` : 'Upload Complete'}
                    </div>
                    <button
                        onClick={dismissAllUploads}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            color: 'var(--text-muted)',
                            borderRadius: 4,
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Summary Stats */}
                {completedCount > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: 12,
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginBottom: 8,
                    }}>
                        {successCount > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}>
                                <CheckCircle size={14} /> {successCount} successful
                            </span>
                        )}
                        {errorCount > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444' }}>
                                <XCircle size={14} /> {errorCount} failed
                            </span>
                        )}
                    </div>
                )}

                {/* Individual Uploads */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {uploads.slice(0, 5).map((upload) => (
                        <UploadItemRow key={upload.id} upload={upload} onDismiss={dismissUpload} />
                    ))}
                    {uploads.length > 5 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', paddingTop: 4 }}>
                            +{uploads.length - 5} more
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function UploadItemRow({ upload, onDismiss }: { upload: UploadItem; onDismiss: (id: string) => void }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            background: upload.status === 'success' ? '#ECFDF5' : upload.status === 'error' ? '#FEF2F2' : '#F9FAFB',
            borderRadius: 6,
            fontSize: '0.8rem',
        }}>
            {upload.status === 'uploading' && (
                <div style={{
                    width: 16,
                    height: 16,
                    border: '2px solid var(--accent)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                }} />
            )}
            {upload.status === 'success' && <CheckCircle size={16} style={{ color: '#10B981' }} />}
            {upload.status === 'error' && <XCircle size={16} style={{ color: '#EF4444' }} />}

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                }}>
                    {upload.fileName}
                </div>
                {upload.status === 'uploading' && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {upload.progress}% • {upload.speed}
                    </div>
                )}
                {upload.status === 'error' && upload.error && (
                    <div style={{ fontSize: '0.7rem', color: '#EF4444' }}>
                        {upload.error}
                    </div>
                )}
            </div>

            {upload.status !== 'uploading' && (
                <button
                    onClick={() => onDismiss(upload.id)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--text-muted)',
                    }}
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
