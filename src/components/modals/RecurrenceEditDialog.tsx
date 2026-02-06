/**
 * RecurrenceEditDialog
 *
 * Google Calendar's "Edit recurring event" dialog with 3 options:
 *  - This event
 *  - This and following events
 *  - All events
 *
 * Shown when the user edits, moves, or deletes a recurring event instance.
 */

import { useState } from 'react';
import type { RecurrenceEditMode } from '../../lib/types';

interface RecurrenceEditDialogProps {
    /** 'edit' | 'delete' | 'move' — affects title/description text */
    action: 'edit' | 'delete' | 'move';
    onConfirm: (mode: RecurrenceEditMode) => void;
    onCancel: () => void;
}

export function RecurrenceEditDialog({ action, onConfirm, onCancel }: RecurrenceEditDialogProps) {
    const [selected, setSelected] = useState<RecurrenceEditMode>('this');

    const titles: Record<string, string> = {
        edit: 'Edit recurring event',
        delete: 'Delete recurring event',
        move: 'Change recurring event',
    };

    const handleConfirm = () => {
        onConfirm(selected);
    };

    return (
        <div className="recurrence-dialog-overlay" onClick={onCancel}>
            <div className="recurrence-dialog" onClick={(e) => e.stopPropagation()}>
                <h3 className="recurrence-dialog-title">{titles[action]}</h3>

                <div className="recurrence-dialog-options">
                    <label className="recurrence-option">
                        <input
                            type="radio"
                            name="recurrenceMode"
                            value="this"
                            checked={selected === 'this'}
                            onChange={() => setSelected('this')}
                        />
                        <span>This event</span>
                    </label>
                    <label className="recurrence-option">
                        <input
                            type="radio"
                            name="recurrenceMode"
                            value="following"
                            checked={selected === 'following'}
                            onChange={() => setSelected('following')}
                        />
                        <span>This and following events</span>
                    </label>
                    <label className="recurrence-option">
                        <input
                            type="radio"
                            name="recurrenceMode"
                            value="all"
                            checked={selected === 'all'}
                            onChange={() => setSelected('all')}
                        />
                        <span>All events</span>
                    </label>
                </div>

                <div className="recurrence-dialog-actions">
                    <button className="recurrence-btn cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="recurrence-btn confirm" onClick={handleConfirm}>
                        OK
                    </button>
                </div>

                <style>{`
                    .recurrence-dialog-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.4);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10000;
                        animation: fadeIn 0.15s ease;
                    }

                    .recurrence-dialog {
                        background: var(--bg-content, #fff);
                        border-radius: 8px;
                        padding: 24px;
                        min-width: 320px;
                        max-width: 400px;
                        box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12);
                        animation: scaleIn 0.15s ease;
                    }

                    .recurrence-dialog-title {
                        font-size: 16px;
                        font-weight: 500;
                        color: var(--text-primary, #3c4043);
                        margin: 0 0 20px 0;
                    }

                    .recurrence-dialog-options {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        margin-bottom: 24px;
                    }

                    .recurrence-option {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        cursor: pointer;
                        padding: 4px 0;
                        font-size: 14px;
                        color: var(--text-primary, #3c4043);
                    }

                    .recurrence-option input[type="radio"] {
                        width: 18px;
                        height: 18px;
                        accent-color: #1a73e8;
                        cursor: pointer;
                    }

                    .recurrence-dialog-actions {
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                    }

                    .recurrence-btn {
                        padding: 8px 24px;
                        border: none;
                        border-radius: 4px;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: background 0.15s;
                    }

                    .recurrence-btn.cancel {
                        background: transparent;
                        color: #1a73e8;
                    }
                    .recurrence-btn.cancel:hover {
                        background: rgba(26, 115, 232, 0.08);
                    }

                    .recurrence-btn.confirm {
                        background: #1a73e8;
                        color: white;
                    }
                    .recurrence-btn.confirm:hover {
                        background: #1765cc;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    @keyframes scaleIn {
                        from { transform: scale(0.95); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `}</style>
            </div>
        </div>
    );
}
