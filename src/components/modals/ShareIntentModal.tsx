import { useState, useEffect } from 'react';
import { X, Check, Folder, Palette, AlertCircle, List as ListIcon, Calendar } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { Item, PriorityLevel, CardColor } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';
import { SchedulerContent } from './SchedulerModal';

export function ShareIntentModal() {
    const {
        pendingShareItem,
        setPendingShareItem,
        addItem,
        folders,
        lists
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
        if (pendingShareItem) {
            // Reset state when new item arrives
            setSelectedFolderId(null);
            setSelectedListId(null);
            setSelectedPriority('none');
            setSelectedColor('default');
            setScheduleUpdates({});
            setShowScheduler(false);
            setIsSaving(false);
        }
    }, [pendingShareItem]);

    if (!pendingShareItem) return null;

    const handleSave = async (withTriage: boolean) => {
        setIsSaving(true);

        const finalItem: Item = {
            ...pendingShareItem,
            folder_id: withTriage ? selectedFolderId : null,
            priority: withTriage ? selectedPriority : 'none',
            bg_color: withTriage ? CARD_COLORS[selectedColor] : CARD_COLORS.default,

            // Merge scheduling data if Triage was used, otherwise defaults
            ...(withTriage ? scheduleUpdates : {}),

            // Ensure defaults if not set by scheduler
            due_at: (withTriage && scheduleUpdates.due_at) || null,
            reminder_type: (withTriage && scheduleUpdates.reminder_type) || 'none',
            recurring_config: (withTriage && scheduleUpdates.recurring_config) || null,
            next_trigger_at: (withTriage && scheduleUpdates.next_trigger_at) || null,
        };

        // --- IMAGE CORRUPTION FIX ---
        if ((finalItem.type === 'file' || finalItem.type === 'image') && finalItem.file_meta?.path.startsWith('blob:')) {
            try {
                const response = await fetch(finalItem.file_meta.path);
                const blob = await response.blob();
                const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
                if (finalItem.file_meta) finalItem.file_meta.path = base64;
            } catch (e) {
                console.error("Failed to process file blob:", e);
            }
        }

        addItem(finalItem);

        if (withTriage && selectedListId) {
            const { addItemsToList } = useAppStore.getState();
            addItemsToList(selectedListId, [finalItem.id]);
        }

        setPendingShareItem(null);
        setIsSaving(false);
    };

    const getPreviewContent = () => {
        if (pendingShareItem.type === 'image' && pendingShareItem.file_meta?.path) {
            return (
                <div className="preview-image-box">
                    <img src={pendingShareItem.file_meta.path} alt="Shared" />
                </div>
            );
        }
        if (pendingShareItem.type === 'link') {
            const url = (pendingShareItem.content as any).url;
            return (
                <div className="preview-link-box">
                    <span className="link-url">{url}</span>
                </div>
            );
        }
        if (pendingShareItem.type === 'note') {
            const text = (pendingShareItem.content as any).text;
            return (
                <div className="preview-note-box">
                    <p>{text?.substring(0, 150)}{text?.length > 150 ? '...' : ''}</p>
                </div>
            );
        }
        return (
            <div className="preview-file-box">
                <span className="file-name">{pendingShareItem.title}</span>
                <span className="file-meta">{pendingShareItem.file_meta?.mime}</span>
            </div>
        );
    };

    // Helper to format schedule text
    const getScheduleText = () => {
        if (scheduleUpdates.due_at) return new Date(scheduleUpdates.due_at).toLocaleDateString();
        if (scheduleUpdates.reminder_type === 'recurring') return 'Recurring';
        if (scheduleUpdates.reminder_type === 'one_time') return 'Reminder Set';
        return 'Schedule';
    };

    return (
        <div className="share-modal-overlay">
            {/* Scheduler Overlay */}
            {showScheduler && (
                <div className="scheduler-overlay" onClick={() => setShowScheduler(false)}>
                    <div onClick={e => e.stopPropagation()}>
                        <SchedulerContent
                            item={{
                                title: pendingShareItem.title || 'New Item',
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
                                className={`triage-btn ${scheduleUpdates.due_at || scheduleUpdates.reminder_type !== 'none' ? 'active' : ''}`}
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
