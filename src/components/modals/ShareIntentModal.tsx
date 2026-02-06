import { useState, useEffect, useCallback } from 'react';
import { X, Check, Folder, Palette, AlertCircle, List as ListIcon, Calendar, Image as ImageIcon, FileText, Link2, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { uploadFile } from '../../lib/supabase';
import type { Item, PriorityLevel, CardColor } from '../../lib/types';
import { CARD_COLORS } from '../../lib/types';
import { SchedulerContent } from './SchedulerModal';
import { persistentSyncQueue } from '../../lib/persistentQueue';
import type { ShareItem, RawBlobAttachment } from '../../lib/shareHandler';

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
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showTriage, setShowTriage] = useState(false);

    // Advanced Scheduling State
    const [showScheduler, setShowScheduler] = useState(false);
    const [scheduleUpdates, setScheduleUpdates] = useState<Partial<Item>>({});

    useEffect(() => {
        if (pendingShareItems.length > 0) {
            setSelectedFolderId(null);
            setSelectedListId(null);
            setSelectedPriority('none');
            setSelectedColor('default');
            setScheduleUpdates({});
            setShowScheduler(false);
            setShowTriage(false);
            setIsSaving(false);
            setUploadProgress(0);
            // Haptic feedback on Android
            if ('vibrate' in navigator) navigator.vibrate(50);
        }
    }, [pendingShareItems]);

    const shareItems = pendingShareItems as ShareItem[];

    const handleSave = useCallback(async (withTriage: boolean) => {
        setIsSaving(true);
        setUploadProgress(0);
        let successCount = 0;
        let failCount = 0;
        const totalItems = shareItems.length;

        for (let i = 0; i < shareItems.length; i++) {
            const item = shareItems[i];
            const currentUserId = user?.id || item.user_id;
            const rawBlob: RawBlobAttachment | undefined = (item as ShareItem)._rawBlob;

            const finalItem: Item = {
                ...item,
                user_id: currentUserId,
                folder_id: withTriage ? selectedFolderId : null,
                priority: withTriage ? selectedPriority : 'none',
                bg_color: withTriage ? CARD_COLORS[selectedColor] : CARD_COLORS.default,
                ...(withTriage ? scheduleUpdates : {}),
                scheduled_at: (withTriage && scheduleUpdates.scheduled_at) || null,
                remind_before: (withTriage && scheduleUpdates.remind_before) || null,
                recurring_config: (withTriage && scheduleUpdates.recurring_config) || null,
            };

            // Remove transient _rawBlob before persisting
            delete (finalItem as ShareItem)._rawBlob;

            // --- FILE UPLOAD (using _rawBlob directly — no blob URL fetch) ---
            if ((finalItem.type === 'file' || finalItem.type === 'image') && rawBlob) {
                if (currentUserId === 'demo') {
                    addNotification('warning', 'Sign In Required', 'Files need an account to upload. Saving locally.');
                    // For demo: create blob URL for local viewing
                    const localUrl = URL.createObjectURL(rawBlob.blob);
                    if (finalItem.file_meta) {
                        finalItem.file_meta.path = localUrl;
                    }
                    finalItem.content = { ...finalItem.content, url: localUrl, preview: localUrl };
                    addItem(finalItem);
                    successCount++;
                    setUploadProgress(((i + 1) / totalItems) * 100);
                    continue;
                }

                try {
                    // Create File directly from the raw Blob (no blob URL round-trip!)
                    const file = new File(
                        [rawBlob.blob],
                        rawBlob.name,
                        { type: rawBlob.mime }
                    );

                    const { url, error } = await uploadFile(
                        file,
                        currentUserId,
                        finalItem.type === 'image' ? 'image' : 'file',
                        (progress) => {
                            const itemProgress = (i / totalItems) * 100;
                            const itemContribution = (progress / totalItems);
                            setUploadProgress(Math.round(itemProgress + itemContribution));
                        }
                    );

                    if (error) throw error;

                    // Update with remote URL
                    if (finalItem.file_meta) {
                        finalItem.file_meta.path = url;
                    }
                    finalItem.content = { ...finalItem.content, url };

                    // Revoke preview blob URL if we created one
                    const previewUrl = (item.content as any)?.preview;
                    if (previewUrl && previewUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(previewUrl);
                    }

                    addItem(finalItem);
                    successCount++;

                    if (withTriage && selectedListId) {
                        useAppStore.getState().addItemsToList(selectedListId, [finalItem.id]);
                    }
                } catch (e) {
                    console.error('[ShareModal] Upload failed:', e);
                    addNotification('error', 'Upload Failed', `Could not upload ${finalItem.title}: ${(e as Error).message}`);
                    failCount++;
                    continue;
                }
            } else {
                // Non-file items (notes, links) — instant save
                addItem(finalItem);
                successCount++;

                if (withTriage && selectedListId) {
                    useAppStore.getState().addItemsToList(selectedListId, [finalItem.id]);
                }
            }

            setUploadProgress(((i + 1) / totalItems) * 100);
        }

        // Summary
        if (successCount > 0 && failCount === 0) {
            addNotification('success', 'Saved!', `${successCount} item${successCount > 1 ? 's' : ''} saved`);
        } else if (successCount > 0) {
            addNotification('warning', 'Partial Save', `${successCount} saved, ${failCount} failed`);
        } else if (failCount > 0) {
            addNotification('error', 'Save Failed', 'All items failed to save');
        }

        persistentSyncQueue.process();
        setPendingShareItems([]);
        setIsSaving(false);
    }, [shareItems, user, selectedFolderId, selectedListId, selectedPriority, selectedColor, scheduleUpdates, addItem, addNotification, setPendingShareItems]);

    if (pendingShareItems.length === 0) return null;

    const getTypeIcon = (item: ShareItem) => {
        switch (item.type) {
            case 'image': return <ImageIcon size={18} />;
            case 'link': return <Link2 size={18} />;
            case 'file': return <FileText size={18} />;
            default: return <FileText size={18} />;
        }
    };

    const getPreviewContent = () => {
        if (shareItems.length > 1) {
            return (
                <div className="si-preview-multi">
                    <div className="si-preview-icons">
                        {shareItems.slice(0, 4).map((it, idx) => (
                            <div key={idx} className="si-preview-icon-box">
                                {getTypeIcon(it)}
                            </div>
                        ))}
                        {shareItems.length > 4 && (
                            <div className="si-preview-icon-box si-preview-more">
                                +{shareItems.length - 4}
                            </div>
                        )}
                    </div>
                    <span className="si-preview-count">{shareItems.length} items</span>
                </div>
            );
        }

        const item = shareItems[0];
        if (item.type === 'image') {
            const previewUrl = (item.content as any)?.preview || item.file_meta?.path;
            return previewUrl ? (
                <div className="si-preview-image">
                    <img src={previewUrl} alt="Shared" />
                </div>
            ) : (
                <div className="si-preview-placeholder">
                    <ImageIcon size={32} />
                    <span>{item.title}</span>
                </div>
            );
        }
        if (item.type === 'link') {
            const url = (item.content as any)?.url;
            let domain = '';
            try { domain = new URL(url).hostname.replace('www.', ''); } catch { domain = url; }
            return (
                <div className="si-preview-link">
                    <Link2 size={20} className="si-link-icon" />
                    <div>
                        <div className="si-link-title">{item.title !== url ? item.title : domain}</div>
                        <div className="si-link-domain">{domain}</div>
                    </div>
                </div>
            );
        }
        if (item.type === 'note') {
            const text = (item.content as any)?.text || '';
            return (
                <div className="si-preview-note">
                    <p>{text.substring(0, 200)}{text.length > 200 ? '...' : ''}</p>
                </div>
            );
        }
        return (
            <div className="si-preview-placeholder">
                <FileText size={32} />
                <span>{item.title}</span>
                {item.file_meta?.mime && <span className="si-file-type">{item.file_meta.mime}</span>}
            </div>
        );
    };

    const getScheduleText = () => {
        if (scheduleUpdates.scheduled_at) return new Date(scheduleUpdates.scheduled_at).toLocaleDateString();
        if (scheduleUpdates.recurring_config) return 'Recurring';
        if (scheduleUpdates.remind_before != null) return 'Reminder Set';
        return 'Schedule';
    };

    const firstItemTitle = shareItems[0]?.title || 'New Item';
    const displayTitle = shareItems.length > 1 ? `${shareItems.length} Items` : firstItemTitle;
    const hasFiles = shareItems.some(it => it.type === 'file' || it.type === 'image');

    return (
        <div className="si-overlay" onClick={() => !isSaving && handleSave(false)}>
            {/* Scheduler sub-overlay */}
            {showScheduler && (
                <div className="si-scheduler-overlay" onClick={(e) => { e.stopPropagation(); setShowScheduler(false); }}>
                    <div onClick={e => e.stopPropagation()}>
                        <SchedulerContent
                            item={{ title: displayTitle, ...scheduleUpdates }}
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

            <div className="si-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="si-header">
                    <div className="si-header-left">
                        <h3>New Catch!</h3>
                        <span className="si-type-badge">
                            {getTypeIcon(shareItems[0])}
                            {shareItems[0].type}
                        </span>
                    </div>
                    <button
                        className="si-close"
                        onClick={() => handleSave(false)}
                        title="Quick save to inbox"
                        disabled={isSaving}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Progress bar */}
                {isSaving && (
                    <div className="si-progress-bar">
                        <div className="si-progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                )}

                {/* Content */}
                <div className="si-body">
                    <div className="si-preview">
                        {getPreviewContent()}
                    </div>

                    {/* Triage toggle */}
                    <button
                        className="si-triage-toggle"
                        onClick={() => setShowTriage(!showTriage)}
                        disabled={isSaving}
                    >
                        Organize before saving
                        {showTriage ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {/* Collapsible triage section */}
                    {showTriage && (
                        <div className="si-triage">
                            <div className="si-triage-grid">
                                <div className="si-triage-col">
                                    <label><Folder size={14} /> Folder</label>
                                    <select
                                        value={selectedFolderId || ''}
                                        onChange={e => setSelectedFolderId(e.target.value || null)}
                                        className="si-select"
                                    >
                                        <option value="">Inbox</option>
                                        {folders.map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="si-triage-col">
                                    <label><ListIcon size={14} /> List</label>
                                    <select
                                        value={selectedListId || ''}
                                        onChange={e => setSelectedListId(e.target.value || null)}
                                        className="si-select"
                                    >
                                        <option value="">None</option>
                                        {lists.map(l => (
                                            <option key={l.id} value={l.id}>{l.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="si-triage-row">
                                <label><Calendar size={14} /> Schedule</label>
                                <button
                                    className={`si-triage-btn ${scheduleUpdates.scheduled_at || scheduleUpdates.remind_before != null ? 'active' : ''}`}
                                    onClick={() => setShowScheduler(true)}
                                >
                                    <Calendar size={16} />
                                    {getScheduleText()}
                                </button>
                            </div>

                            <div className="si-triage-row">
                                <label><AlertCircle size={14} /> Priority</label>
                                <div className="si-priority-row">
                                    {(['none', 'low', 'medium', 'high'] as const).map((p) => (
                                        <button
                                            key={p}
                                            className={`si-p-btn ${p} ${selectedPriority === p ? 'active' : ''}`}
                                            onClick={() => setSelectedPriority(p)}
                                        >
                                            {p === 'none' ? '-' : p[0].toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="si-triage-row">
                                <label><Palette size={14} /> Color</label>
                                <div className="si-color-row">
                                    {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
                                        <button
                                            key={c}
                                            className={`si-color-dot ${selectedColor === c ? 'active' : ''}`}
                                            style={{ background: CARD_COLORS[c] }}
                                            onClick={() => setSelectedColor(c)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="si-footer">
                    <button
                        className="si-btn-quick"
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        title="Save to inbox with defaults"
                    >
                        <Zap size={18} />
                    </button>
                    <button
                        className="si-btn-save"
                        onClick={() => handleSave(showTriage)}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                {hasFiles ? `Uploading ${Math.round(uploadProgress)}%` : 'Saving...'}
                            </>
                        ) : (
                            <>
                                Save {showTriage ? 'with Options' : 'to Inbox'}
                                <Check size={16} />
                            </>
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                /* --- Share Intent Modal --- */
                .si-overlay, .si-scheduler-overlay {
                    position: fixed; inset: 0;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    z-index: 10000;
                    display: flex; align-items: flex-end; justify-content: center;
                    padding: 0;
                }
                .si-scheduler-overlay { z-index: 10001; align-items: center; padding: 16px; }

                @media (min-width: 768px) {
                    .si-overlay { align-items: center; padding: 16px; }
                }

                .si-modal {
                    width: 100%; max-width: 420px;
                    background: var(--bg-primary, #FFFFFF);
                    border-radius: 24px 24px 0 0;
                    overflow: hidden;
                    box-shadow: 0 -4px 40px rgba(0,0,0,0.15);
                    animation: si-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex; flex-direction: column;
                    max-height: 85vh;
                }
                @media (min-width: 768px) {
                    .si-modal { border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
                }

                @keyframes si-slide-up {
                    from { transform: translateY(100%); opacity: 0.5; }
                    to { transform: translateY(0); opacity: 1; }
                }

                /* Header */
                .si-header {
                    padding: 16px 20px;
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 1px solid var(--border-color, #F3F4F6);
                    flex-shrink: 0;
                }
                .si-header-left { display: flex; align-items: center; gap: 10px; }
                .si-header h3 { margin: 0; font-size: 1.1rem; color: var(--text-primary, #111827); font-weight: 700; }
                .si-type-badge {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 3px 10px; border-radius: 100px;
                    background: var(--bg-accent, #FEF3C7); color: var(--text-accent, #92400E);
                    font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
                }
                .si-close {
                    background: var(--bg-secondary, #F3F4F6); border: none; cursor: pointer;
                    color: var(--text-secondary, #6B7280); padding: 8px; border-radius: 50%;
                    transition: all 0.15s;
                }
                .si-close:hover { background: var(--bg-hover, #E5E7EB); color: var(--text-primary, #374151); }

                /* Progress */
                .si-progress-bar {
                    height: 3px; background: var(--border-color, #E5E7EB); flex-shrink: 0;
                }
                .si-progress-fill {
                    height: 100%; background: linear-gradient(90deg, #F59E0B, #EF4444);
                    transition: width 0.3s ease;
                    border-radius: 0 2px 2px 0;
                }

                /* Body */
                .si-body {
                    padding: 16px 20px;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }

                /* Preview */
                .si-preview {
                    border-radius: 14px;
                    overflow: hidden;
                    background: var(--bg-secondary, #F9FAFB);
                    border: 1px solid var(--border-color, #F3F4F6);
                    margin-bottom: 16px;
                }
                .si-preview-image img {
                    width: 100%; max-height: 200px; object-fit: cover; display: block;
                }
                .si-preview-link {
                    padding: 16px; display: flex; align-items: center; gap: 12px;
                }
                .si-link-icon { color: #2563EB; flex-shrink: 0; }
                .si-link-title {
                    font-weight: 600; color: var(--text-primary, #1F2937);
                    font-size: 0.95rem;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    max-width: 280px;
                }
                .si-link-domain { font-size: 0.8rem; color: var(--text-secondary, #6B7280); margin-top: 2px; }
                .si-preview-note {
                    padding: 16px;
                }
                .si-preview-note p {
                    margin: 0; font-size: 0.9rem; color: var(--text-secondary, #4B5563);
                    line-height: 1.5;
                }
                .si-preview-placeholder {
                    padding: 24px; display: flex; flex-direction: column;
                    align-items: center; gap: 8px; color: var(--text-secondary, #6B7280);
                }
                .si-preview-placeholder span { font-weight: 600; }
                .si-file-type { font-size: 0.75rem; opacity: 0.7; }
                .si-preview-multi {
                    padding: 20px; display: flex; flex-direction: column;
                    align-items: center; gap: 12px;
                }
                .si-preview-icons { display: flex; gap: 8px; }
                .si-preview-icon-box {
                    width: 44px; height: 44px;
                    background: var(--bg-primary, white); border: 1px solid var(--border-color, #E5E7EB);
                    border-radius: 10px; display: flex; align-items: center; justify-content: center;
                    color: var(--text-secondary, #6B7280);
                }
                .si-preview-more {
                    font-size: 0.8rem; font-weight: 700; color: var(--text-secondary, #9CA3AF);
                }
                .si-preview-count {
                    font-weight: 600; font-size: 0.95rem; color: var(--text-primary, #374151);
                }

                /* Triage toggle */
                .si-triage-toggle {
                    width: 100%; padding: 10px 0; border: none; background: none;
                    color: var(--text-secondary, #6B7280); font-size: 0.85rem;
                    font-weight: 500; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    transition: color 0.15s;
                }
                .si-triage-toggle:hover { color: var(--text-primary, #374151); }
                .si-triage-toggle:disabled { opacity: 0.5; cursor: not-allowed; }

                /* Triage section */
                .si-triage {
                    display: flex; flex-direction: column; gap: 14px;
                    padding-top: 8px; border-top: 1px solid var(--border-color, #F3F4F6);
                    animation: si-fade-in 0.2s ease;
                }
                @keyframes si-fade-in {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .si-triage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .si-triage-col, .si-triage-row { display: flex; flex-direction: column; gap: 6px; }
                .si-triage-col label, .si-triage-row label {
                    display: flex; align-items: center; gap: 5px;
                    font-size: 0.7rem; font-weight: 700; color: var(--text-secondary, #9CA3AF);
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                .si-select {
                    width: 100%; padding: 9px 10px; border-radius: 10px;
                    border: 1px solid var(--border-color, #E5E7EB);
                    background: var(--bg-primary, white); color: var(--text-primary, #1F2937);
                    font-size: 0.85rem;
                }
                .si-triage-btn {
                    display: flex; align-items: center; gap: 8px;
                    width: 100%; padding: 9px 12px;
                    background: var(--bg-primary, white); border: 1px solid var(--border-color, #E5E7EB);
                    border-radius: 10px; color: var(--text-secondary, #6B7280);
                    font-size: 0.85rem; font-weight: 500; cursor: pointer;
                    transition: all 0.15s;
                }
                .si-triage-btn.active {
                    border-color: #F59E0B; background: #FFFBEB; color: #D97706;
                }
                .si-priority-row { display: flex; gap: 6px; }
                .si-p-btn {
                    flex: 1; padding: 8px; border-radius: 8px;
                    border: 1px solid var(--border-color, #E5E7EB);
                    background: var(--bg-primary, white); color: var(--text-secondary, #6B7280);
                    font-size: 0.8rem; font-weight: 700; cursor: pointer;
                    transition: all 0.15s;
                }
                .si-p-btn.active { border-color: transparent; color: white; }
                .si-p-btn.none.active { background: #9CA3AF; }
                .si-p-btn.low.active { background: #3B82F6; }
                .si-p-btn.medium.active { background: #F59E0B; }
                .si-p-btn.high.active { background: #EF4444; }
                .si-color-row { display: flex; gap: 8px; flex-wrap: wrap; }
                .si-color-dot {
                    width: 26px; height: 26px; border-radius: 50%;
                    border: 2px solid transparent; cursor: pointer;
                    position: relative; transition: transform 0.15s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .si-color-dot:hover { transform: scale(1.15); }
                .si-color-dot.active {
                    border-color: #F59E0B;
                    box-shadow: 0 0 0 2px #FFFBEB;
                }

                /* Footer */
                .si-footer {
                    padding: 14px 20px;
                    border-top: 1px solid var(--border-color, #F3F4F6);
                    display: flex; gap: 10px;
                    flex-shrink: 0;
                    background: var(--bg-primary, white);
                    padding-bottom: max(14px, env(safe-area-inset-bottom));
                }
                .si-btn-quick {
                    padding: 12px 14px; border-radius: 12px;
                    border: 1px solid var(--border-color, #E5E7EB);
                    background: var(--bg-primary, white); color: #F59E0B;
                    cursor: pointer; transition: all 0.15s;
                    display: flex; align-items: center; justify-content: center;
                }
                .si-btn-quick:hover { background: #FFFBEB; border-color: #F59E0B; }
                .si-btn-quick:disabled { opacity: 0.5; cursor: not-allowed; }
                .si-btn-save {
                    flex: 1; padding: 12px;
                    background: #111827; color: white;
                    border: none; border-radius: 12px;
                    font-weight: 600; font-size: 0.95rem;
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    cursor: pointer; transition: background 0.15s;
                }
                .si-btn-save:hover { background: #000; }
                .si-btn-save:disabled { opacity: 0.7; cursor: not-allowed; }

                /* Dark mode overrides */
                [data-theme="dark"] .si-modal { background: #1F2937; }
                [data-theme="dark"] .si-header { border-color: #374151; }
                [data-theme="dark"] .si-header h3 { color: #F9FAFB; }
                [data-theme="dark"] .si-type-badge { background: #374151; color: #FCD34D; }
                [data-theme="dark"] .si-close { background: #374151; color: #9CA3AF; }
                [data-theme="dark"] .si-close:hover { background: #4B5563; color: #F9FAFB; }
                [data-theme="dark"] .si-preview { background: #111827; border-color: #374151; }
                [data-theme="dark"] .si-link-title { color: #F9FAFB; }
                [data-theme="dark"] .si-link-domain { color: #9CA3AF; }
                [data-theme="dark"] .si-preview-note p { color: #D1D5DB; }
                [data-theme="dark"] .si-preview-placeholder { color: #9CA3AF; }
                [data-theme="dark"] .si-preview-icon-box { background: #374151; border-color: #4B5563; color: #D1D5DB; }
                [data-theme="dark"] .si-preview-count { color: #F9FAFB; }
                [data-theme="dark"] .si-triage-toggle { color: #9CA3AF; }
                [data-theme="dark"] .si-triage-toggle:hover { color: #F9FAFB; }
                [data-theme="dark"] .si-triage { border-color: #374151; }
                [data-theme="dark"] .si-select { background: #374151; border-color: #4B5563; color: #F9FAFB; }
                [data-theme="dark"] .si-triage-btn { background: #374151; border-color: #4B5563; color: #D1D5DB; }
                [data-theme="dark"] .si-triage-btn.active { background: #451A03; border-color: #F59E0B; color: #FCD34D; }
                [data-theme="dark"] .si-p-btn { background: #374151; border-color: #4B5563; color: #D1D5DB; }
                [data-theme="dark"] .si-color-dot { box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
                [data-theme="dark"] .si-footer { border-color: #374151; background: #1F2937; }
                [data-theme="dark"] .si-btn-quick { background: #374151; border-color: #4B5563; }
                [data-theme="dark"] .si-btn-quick:hover { background: #451A03; border-color: #F59E0B; }
                [data-theme="dark"] .si-btn-save { background: #F59E0B; color: #111827; }
                [data-theme="dark"] .si-btn-save:hover { background: #D97706; }
                [data-theme="dark"] .si-progress-bar { background: #374151; }
            `}</style>
        </div>
    );
}
