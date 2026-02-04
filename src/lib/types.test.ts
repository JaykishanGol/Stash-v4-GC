import { describe, it, expect } from 'vitest';
import {
    isNoteContent,
    isLinkContent,
    isFolderContent,
    isFileMeta,
    isValidItemType,
    isValidPriority,
    validateItem,
    createDefaultItem,
    getNoteText,
    getLinkUrl,
    getChecklist,
} from './types';

describe('Type Guards', () => {
    describe('isNoteContent', () => {
        it('should return true for valid note content', () => {
            expect(isNoteContent({ text: 'Hello' })).toBe(true);
            expect(isNoteContent({ text: '', checklist: [] })).toBe(true);
            expect(isNoteContent({})).toBe(true);
        });

        it('should return false for invalid content', () => {
            expect(isNoteContent(null)).toBe(false);
            expect(isNoteContent(undefined)).toBe(false);
            expect(isNoteContent({ text: 123 })).toBe(false);
            expect(isNoteContent({ checklist: 'not-array' })).toBe(false);
        });
    });

    describe('isLinkContent', () => {
        it('should return true for valid link content', () => {
            expect(isLinkContent({ url: 'https://example.com' })).toBe(true);
            expect(isLinkContent({ url: 'https://example.com', title: 'Test' })).toBe(true);
        });

        it('should return false for invalid content', () => {
            expect(isLinkContent(null)).toBe(false);
            expect(isLinkContent({})).toBe(false);
            expect(isLinkContent({ url: 123 })).toBe(false);
        });
    });

    describe('isFolderContent', () => {
        it('should return true for valid folder content', () => {
            expect(isFolderContent({})).toBe(true);
            expect(isFolderContent({ itemCount: 5 })).toBe(true);
            expect(isFolderContent({ description: 'My folder' })).toBe(true);
        });

        it('should return false for invalid content', () => {
            expect(isFolderContent(null)).toBe(false);
            expect(isFolderContent({ itemCount: 'five' })).toBe(false);
            expect(isFolderContent({ description: 123 })).toBe(false);
        });
    });

    describe('isFileMeta', () => {
        it('should return true for valid file meta', () => {
            expect(isFileMeta({ size: 1024, mime: 'image/png', path: '/uploads/test.png' })).toBe(true);
        });

        it('should return false for invalid meta', () => {
            expect(isFileMeta(null)).toBe(false);
            expect(isFileMeta({})).toBe(false);
            expect(isFileMeta({ size: '1024', mime: 'image/png', path: '/test' })).toBe(false);
        });
    });

    describe('isValidItemType', () => {
        it('should return true for valid types', () => {
            expect(isValidItemType('note')).toBe(true);
            expect(isValidItemType('link')).toBe(true);
            expect(isValidItemType('image')).toBe(true);
            expect(isValidItemType('file')).toBe(true);
            expect(isValidItemType('folder')).toBe(true);
        });

        it('should return false for invalid types', () => {
            expect(isValidItemType('task')).toBe(false);
            expect(isValidItemType('')).toBe(false);
            expect(isValidItemType(null)).toBe(false);
        });
    });

    describe('isValidPriority', () => {
        it('should return true for valid priorities', () => {
            expect(isValidPriority('none')).toBe(true);
            expect(isValidPriority('low')).toBe(true);
            expect(isValidPriority('medium')).toBe(true);
            expect(isValidPriority('high')).toBe(true);
        });

        it('should return false for invalid priorities', () => {
            expect(isValidPriority('urgent')).toBe(false);
            expect(isValidPriority('')).toBe(false);
        });
    });
});

describe('validateItem', () => {
    it('should pass for valid item', () => {
        const result = validateItem({
            id: 'test-id',
            user_id: 'user-123',
            type: 'note',
            title: 'My Note',
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should fail for missing required fields', () => {
        const result = validateItem({});
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.find(e => e.field === 'id')).toBeDefined();
        expect(result.errors.find(e => e.field === 'user_id')).toBeDefined();
        expect(result.errors.find(e => e.field === 'type')).toBeDefined();
        expect(result.errors.find(e => e.field === 'title')).toBeDefined();
    });

    it('should fail for title over 500 chars', () => {
        const result = validateItem({
            id: 'test-id',
            user_id: 'user-123',
            type: 'note',
            title: 'x'.repeat(501),
        });
        expect(result.valid).toBe(false);
        expect(result.errors.find(e => e.field === 'title')).toBeDefined();
    });

    it('should fail for invalid priority', () => {
        const result = validateItem({
            id: 'test-id',
            user_id: 'user-123',
            type: 'note',
            title: 'Test',
            priority: 'urgent' as any,
        });
        expect(result.valid).toBe(false);
        expect(result.errors.find(e => e.field === 'priority')).toBeDefined();
    });
});

describe('createDefaultItem', () => {
    it('should create item with all required fields', () => {
        const item = createDefaultItem('user-123', 'note');

        expect(item.id).toBeDefined();
        expect(item.user_id).toBe('user-123');
        expect(item.type).toBe('note');
        expect(item.title).toBe('');
        expect(item.content).toEqual({ text: '' });
        expect(item.priority).toBe('none');
        expect(item.tags).toEqual([]);
        expect(item.scheduled_at).toBe(null);
        expect(item.remind_before).toBe(null);
        expect(item.is_pinned).toBe(false);
        expect(item.is_archived).toBe(false);
        expect(item.is_completed).toBe(false);
    });

    it('should apply overrides', () => {
        const item = createDefaultItem('user-123', 'link', {
            title: 'My Link',
            priority: 'high',
        });

        expect(item.title).toBe('My Link');
        expect(item.priority).toBe('high');
    });

    it('should create correct content for link type', () => {
        const item = createDefaultItem('user-123', 'link');
        expect(item.content).toEqual({ url: '' });
    });
});

describe('Safe Accessors', () => {
    describe('getNoteText', () => {
        it('should return text from note', () => {
            const item = createDefaultItem('user-123', 'note', {
                content: { text: 'Hello world' },
            });
            expect(getNoteText(item)).toBe('Hello world');
        });

        it('should return empty string for non-note', () => {
            const item = createDefaultItem('user-123', 'link');
            expect(getNoteText(item)).toBe('');
        });
    });

    describe('getLinkUrl', () => {
        it('should return url from link', () => {
            const item = createDefaultItem('user-123', 'link', {
                content: { url: 'https://example.com' },
            });
            expect(getLinkUrl(item)).toBe('https://example.com');
        });

        it('should return empty string for non-link', () => {
            const item = createDefaultItem('user-123', 'note');
            expect(getLinkUrl(item)).toBe('');
        });
    });

    describe('getChecklist', () => {
        it('should return checklist from note', () => {
            const checklist = [{ id: '1', text: 'Task 1', checked: false }];
            const item = createDefaultItem('user-123', 'note', {
                content: { checklist },
            });
            expect(getChecklist(item)).toEqual(checklist);
        });

        it('should return empty array for note without checklist', () => {
            const item = createDefaultItem('user-123', 'note');
            expect(getChecklist(item)).toEqual([]);
        });
    });
});
