import { useState, useEffect } from 'react';
import { X, Check, Folder, Palette, AlertCircle, List as ListIcon, Calendar, Image as ImageIcon, FileText } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { uploadFile } from '../../lib/supabase';
import type { Item, PriorityLevel, CardColor } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';
import { SchedulerContent } from './SchedulerModal';
import { persistentSyncQueue } from '../../lib/persistentQueue';

export function ShareIntentModal() {
    const {
        pendingShareItems,
        setPendingShareItems,
        addItem,
        folders,
        lists,
        addNotification,
        user
    } = useAppStore();

    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [selectedPriority, setSelectedPriority] = useState<PriorityLevel>('none');
    const [selectedColor, setSelectedColor] = useState<CardColor>('default');
    const [isSaving, setIsSaving] = useState(false);

    // Advanced Scheduling State
    const [showScheduler, setShowScheduler] = useState(false);
    const [scheduleUpdates, setScheduleUpdates] = useState<Partial<Item>>({});

    useEffect(() => {
        if (pendingShareItems.length > 0) {
            // Reset state when new items arrive
            setSelectedFolderId(null);
            setSelectedListId(null);
            setSelectedPriority('none');
            setSelectedColor('default');
            setScheduleUpdates({});
            setShowScheduler(false);
            setIsSaving(false);
        }
    }, [pendingShareItems]);

    if (pendingShareItems.length === 0) return null;

    const handleSave = async (withTriage: boolean) => {
        setIsSaving(true);
        let successCount = 0;
        let failCount = 0;

        for (const item of pendingShareItems) {
            // Override user_id with current auth state to fix race condition
            // where items were created before auth resolved
            const currentUserId = user?.id || item.user_id;
            const finalItem: Item = {
                ...item,
                user_id: currentUserId,
                folder_id: withTriage ? selectedFolderId : null,
                priority: withTriage ? selectedPriority : 'none',
                bg_color: withTriage ? CARD_COLORS[selectedColor] : CARD_COLORS.default,

                // Merge scheduling data if Triage was used, otherwise defaults
                ...(withTriage ? scheduleUpdates : {}),

                // Ensure defaults if not set by scheduler
                scheduled_at: (withTriage && scheduleUpdates.scheduled_at) || null,
                remind_before: (withTriage && scheduleUpdates.remind_before) || null,
                recurring_config: (withTriage && scheduleUpdates.recurring_config) || null,
            };

            // --- SUPABASE STORAGE UPLOAD ---
            // Always upload files with blob URLs (both triage and quick-save)
            if ((finalItem.type === 'file' || finalItem.type === 'image') && finalItem.file_meta?.path.startsWith('blob:')) {
                // Check if user is demo - can't upload without auth
                if (finalItem.user_id === 'demo') {
                    addNotification('warning', 'Sign In Required', 'Files cannot be saved without an account. Please sign in first.');
                    failCount++;
                    continue; // Skip this item
                }

                try {
                    // 1. Fetch the blob and create a proper File object
                    const response = await fetch(finalItem.file_meta.path);
                    const blob = await response.blob();
                    const fileName = finalItem.file_meta.originalName || finalItem.title || 'file';
                    const file = new File([blob], fileName, { type: blob.type || finalItem.file_meta.mime });

                    // 2. Upload using the shared uploadFile utility (has retry logic)
                    const { url, error } = await uploadFile(
                        file,
                        finalItem.user_id,
                        finalItem.type === 'image' ? 'image' : 'file'
                    );

                    if (error) throw error;

                    // 3. Update item with remote URL
                    if (finalItem.file_meta) {
                        finalItem.file_meta.path = url;
                    }

                    // Revoke the local blob URL to free memory
                    URL.revokeObjectURL(item.file_meta!.path);

                    // Add item after successful upload
                    addItem(finalItem);
                    successCount++;

                    if (withTriage && selectedListId) {
                        const { addItemsToList } = useAppStore.getState();
                        addItemsToList(selectedListId, [finalItem.id]);
                    }

                } catch (e) {
                    console.error("Failed to upload file:", e);
                    addNotification('error', 'Upload Failed', `Could not upload ${finalItem.title}: ${(e as Error).message}`);
                    failCount++;
                    // Don't add item with broken blob URL
                    continue;
                }
            } else {
                // Non-file items (notes, links) - just add them
                addItem(finalItem);
                successCount++;

                if (withTriage && selectedListId) {
                    const { addItemsToList } = useAppStore.getState();
                    addItemsToList(selectedListId, [finalItem.id]);
                }
            }
        }

        // Show summary notification
        if (successCount > 0 && failCount === 0) {
            addNotification('success', 'Saved', `${successCount} item(s) saved successfully`);
        } else if (successCount > 0 && failCount > 0) {
            addNotification('warning', 'Partial Save', `${successCount} saved, ${failCount} failed`);
        }

        // Trigger immediate sync to push items to Supabase
        persistentSyncQueue.process();

        setPendingShareItems([]);
        setIsSaving(false);
    };

    const getPreviewContent = () => {
        if (pendingShareItems.length > 1) {
            return (
                <div className="preview-file-box">
                    <span className="file-name" style={{ fontSize: '1.2rem' }}>{pendingShareItems.length} Items</span>
                    <span className="file-meta">Batch Import</span>
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {pendingShareItems.slice(0, 3).map((i, idx) => (
                            <div key={idx} style={{ width: 40, height: 40, background: '#E5E7EB', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {i.type === 'image' ? <ImageIcon size={20} /> : <FileText size={20} />}
                            </div>
                        ))}
                        {pendingShareItems.length > 3 && <div style={{ display: 'flex', alignItems: 'center', color: '#6B7280' }}>+{pendingShareItems.length - 3}</div>}
                    </div>
                </div>
            );
        }

        const item = pendingShareItems[0];
        if (item.type === 'image' && item.file_meta?.path) {
            return (
                <div className="preview-image-box">
                    <img src={item.file_meta.path} alt="Shared" />
                </div>
            );
        }
        if (item.type === 'link') {
            const url = (item.content as any).url;
            return (
                <div className="preview-link-box">
                    <span className="link-url">{url}</span>
                </div>
            );
        }
        if (item.type === 'note') {
            const text = (item.content as any).text;
            return (
                <div className="preview-note-box">
                    <p>{text?.substring(0, 150)}{text?.length > 150 ? '...' : ''}</p>
                </div>
            );
        }
        return (
            <div className="preview-file-box">
                <span className="file-name">{item.title}</span>
                <span className="file-meta">{item.file_meta?.mime}</span>
            </div>
        );
    };

    // Helper to format schedule text
    const getScheduleText = () => {
        if (scheduleUpdates.scheduled_at) return new Date(scheduleUpdates.scheduled_at).toLocaleDateString();
        if (scheduleUpdates.recurring_config) return 'Recurring';
        if (scheduleUpdates.remind_before != null) return 'Reminder Set';
        return 'Schedule';
    };

    const firstItemTitle = pendingShareItems[0]?.title || 'New Item';
    const displayTitle = pendingShareItems.length > 1 ? `${pendingShareItems.length} Items` : firstItemTitle;

    return (
        <div className="share-modal-overlay">
            {/* Scheduler Overlay */}
            {showScheduler && (
                <div className="scheduler-overlay" onClick={() => setShowScheduler(false)}>
                    <div onClick={e => e.stopPropagation()}>
                        <SchedulerContent
                            item={{
                                title: displayTitle,
                                ...scheduleUpdates
                            }}
                            isTaskType={false}
                            onClose={() => setShowScheduler(false)}
                            onSave={(updates) => {
                                setScheduleUpdates(prev => ({ ...prev, ...updates }));
                                setShowScheduler(false);
                            }}
                        />
                    </div>
                </div>
            )}

            <div className="share-modal card-pop">
                <div className="modal-header">
                    <h3>New Catch!</h3>
                    <button
                        className="close-btn"
                        onClick={() => handleSave(false)}
                        title="Save to Inbox (Default)"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="content-preview">
                        {getPreviewContent()}
                    </div>

                    <div className="triage-section">
                        <div className="triage-grid">
                            <div className="triage-col">
                                <label><Folder size={14} /> Folder</label>
                                <select
                                    value={selectedFolderId || ''}
                                    onChange={e => setSelectedFolderId(e.target.value || null)}
                                    className="triage-select"
                                >
                                    <option value="">Inbox (None)</option>
                                    {folders.map(f => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="triage-col">
                                <label><ListIcon size={14} /> List</label>
                                <select
                                    value={selectedListId || ''}
                                    onChange={e => setSelectedListId(e.target.value || null)}
                                    className="triage-select"
                                >
                                    <option value="">None</option>
                                    {lists.map(l => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Advanced Scheduling Trigger */}
                        <div className="triage-row">
                            <label><Calendar size={14} /> Schedule</label>
                            <button
                                className={`triage-btn ${scheduleUpdates.scheduled_at || scheduleUpdates.remind_before != null ? 'active' : ''}`}
                                onClick={() => setShowScheduler(true)}
                            >
                                <Calendar size={16} />
                                {getScheduleText()}
                            </button>
                        </div>

                        <div className="triage-row">
                            <label><AlertCircle size={14} /> Priority</label>
                            <div className="priority-toggles">
                                {['none', 'low', 'medium', 'high'].map((p) => (
                                    <button
                                        key={p}
                                        className={`p-toggle ${p} ${selectedPriority === p ? 'active' : ''}`}
                                        onClick={() => setSelectedPriority(p as PriorityLevel)}
                                    >
                                        {p === 'none' ? '-' : p[0].toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="triage-row">
                            <label><Palette size={14} /> Color</label>
                            <div className="color-dots">
                                {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
                                    <button
                                        key={c}
                                        className={`color-dot ${selectedColor === c ? 'active' : ''}`}
                                        style={{ background: CARD_COLORS[c] }}
                                        onClick={() => setSelectedColor(c)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button
                        className="btn-primary"
                        onClick={() => handleSave(true)}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Item'}
                        <Check size={16} style={{ marginLeft: 6 }} />
                    </button>
                </div>
            </div>

            <style>{`
                .share-modal-overlay, .scheduler-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.4);
                    backdrop-filter: blur(4px);
                    z-index: 10000;
                    display: flex; align-items: flex-end; justify-content: center;
                    padding: 16px;
                }
                .scheduler-overlay { z-index: 10001; align-items: center; } /* Higher z-index */
                
                @media (min-width: 768px) {
                    .share-modal-overlay { align-items: center; }
                }

                .share-modal {
                    width: 100%; max-width: 400px;
                    background: white;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex; flex-direction: column;
                    max-height: 90vh;
                }

                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .modal-header {
                    padding: 16px 20px;
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 1px solid #F3F4F6;
                    background: #FAFAFA;
                    flex-shrink: 0;
                }
                .modal-header h3 { margin: 0; font-size: 1.1rem; color: #111827; }
                .close-btn {
                    background: none; border: none; cursor: pointer;
                    color: #9CA3AF; padding: 4px; border-radius: 50%;
                }
                .close-btn:hover { background: #E5E7EB; color: #374151; }

                .modal-body { 
                    padding: 20px; 
                    overflow-y: auto; 
                    -webkit-overflow-scrolling: touch;
                }

                .content-preview {
                    margin-bottom: 20px;
                    border-radius: 12px;
                    overflow: hidden;
                    background: #F3F4F6;
                    display: flex; justify-content: center; align-items: center;
                    min-height: 100px;
                    max-height: 200px;
                }
                .preview-image-box img { width: 100%; height: auto; display: block; }
                .preview-link-box { padding: 16px; word-break: break-all; color: #2563EB; }
                .preview-note-box { padding: 16px; font-size: 0.9rem; color: #4B5563; }
                .preview-file-box { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px; }
                .file-name { font-weight: 600; color: #1F2937; }
                .file-meta { font-size: 0.8rem; color: #9CA3AF; }

                .triage-section { display: flex; flex-direction: column; gap: 16px; }
                
                .triage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .triage-col { display: flex; flex-direction: column; gap: 8px; }
                
                .triage-row { display: flex; flex-direction: column; gap: 8px; }
                .triage-row label, .triage-col label {
                    display: flex; align-items: center; gap: 6px;
                    font-size: 0.75rem; font-weight: 600; color: #6B7280; text-transform: uppercase;
                }
                
                .triage-select {
                    width: 100%; padding: 10px; border-radius: 8px;
                    border: 1px solid #E5E7EB; background: white;
                    font-size: 0.9rem;
                    color: #1F2937;
                }
                
                .triage-btn {
                    display: flex; align-items: center; gap: 8px;
                    width: 100%; padding: 10px 12px;
                    background: white; border: 1px solid #E5E7EB;
                    border-radius: 8px; color: #4B5563;
                    font-size: 0.9rem; font-weight: 500;
                    cursor: pointer;
                }
                .triage-btn.active {
                    border-color: #F59E0B; background: #FFFBEB; color: #D97706;
                }

                .priority-toggles { display: flex; gap: 8px; }
                .p-toggle {
                    flex: 1; padding: 8px; border-radius: 6px;
                    border: 1px solid #E5E7EB; background: white;
                    font-size: 0.85rem; font-weight: 600; color: #6B7280;
                    cursor: pointer;
                }
                .p-toggle.active { border-color: transparent; color: white; }
                .p-toggle.none.active { background: #9CA3AF; }
                .p-toggle.low.active { background: #3B82F6; }
                .p-toggle.medium.active { background: #F59E0B; }
                .p-toggle.high.active { background: #EF4444; }

                .color-dots { display: flex; gap: 8px; flex-wrap: wrap; }
                .color-dot {
                    width: 24px; height: 24px; border-radius: 50%;
                    border: 1px solid rgba(0,0,0,0.1); cursor: pointer;
                    position: relative;
                }
                .color-dot.active::after {
                    content: ''; position: absolute; inset: -4px;
                    border-radius: 50%; border: 2px solid #F59E0B;
                }

                .modal-footer {
                    padding: 16px 20px;
                    border-top: 1px solid #F3F4F6;
                    background: #FAFAFA;
                    flex-shrink: 0;
                }
                .btn-primary {
                    width: 100%; padding: 12px;
                    background: #111827; color: white;
                    border: none; border-radius: 10px;
                    font-weight: 600; font-size: 1rem;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: background 0.2s;
                }
                .btn-primary:hover { background: #000; }
                .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
            `}</style>
        </div>
    );
}
