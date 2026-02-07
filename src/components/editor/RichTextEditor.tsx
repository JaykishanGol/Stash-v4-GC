import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Bold, Italic, List, ListOrdered, CheckSquare, Heading1, Heading2, Code } from 'lucide-react';
import { useEffect } from 'react';

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    showChecklistModeToggle?: boolean;
    onToggleChecklistMode?: () => void;
    isChecklistMode?: boolean;
}

const DEFAULT_FORMATTING = {
    bold: false,
    italic: false,
    code: false,
    heading1: false,
    heading2: false,
    bulletList: false,
    orderedList: false,
};

export function RichTextEditor({
    content,
    onChange,
    placeholder = 'Write your note...',
    autoFocus,
    showChecklistModeToggle = false,
    onToggleChecklistMode,
    isChecklistMode = false,
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2],
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        autofocus: autoFocus ? 'end' : false,
        editorProps: {
            attributes: {
                class: 'rich-text-editor-content',
            },
        },
    });

    const activeFormatting = useEditorState({
        editor,
        selector: ({ editor }) => {
            if (!editor) {
                return DEFAULT_FORMATTING;
            }
            const marks = editor.state.storedMarks ?? editor.state.selection.$from.marks();
            const hasMark = (markName: string) => marks.some((mark) => mark.type.name === markName);
            return {
                bold: editor.isActive('bold') || hasMark('bold'),
                italic: editor.isActive('italic') || hasMark('italic'),
                code: editor.isActive('code') || hasMark('code'),
                heading1: editor.isActive('heading', { level: 1 }),
                heading2: editor.isActive('heading', { level: 2 }),
                bulletList: editor.isActive('bulletList'),
                orderedList: editor.isActive('orderedList'),
            };
        },
    }) ?? DEFAULT_FORMATTING;

    // FIX: Sync content prop with editor when editing existing notes
    // The useEditor `content` only works on initial render
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    if (!editor) {
        return <div className="rich-text-editor-loading">Loading editor...</div>;
    }

    return (
        <div className="rich-text-editor">
            {/* Fixed Toolbar at top */}
            <div className="editor-toolbar">
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={activeFormatting.bold ? 'is-active' : ''}
                    aria-pressed={activeFormatting.bold}
                    title="Bold (Ctrl/Cmd+B)"
                    aria-label="Bold"
                >
                    <Bold size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={activeFormatting.italic ? 'is-active' : ''}
                    aria-pressed={activeFormatting.italic}
                    title="Italic (Ctrl/Cmd+I)"
                    aria-label="Italic"
                >
                    <Italic size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={activeFormatting.code ? 'is-active' : ''}
                    aria-pressed={activeFormatting.code}
                    title="Code (Ctrl/Cmd+E)"
                    aria-label="Code"
                >
                    <Code size={16} />
                </button>
                <div className="toolbar-divider" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={activeFormatting.heading1 ? 'is-active' : ''}
                    aria-pressed={activeFormatting.heading1}
                    title="Heading 1"
                    aria-label="Heading 1"
                >
                    <Heading1 size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={activeFormatting.heading2 ? 'is-active' : ''}
                    aria-pressed={activeFormatting.heading2}
                    title="Heading 2"
                    aria-label="Heading 2"
                >
                    <Heading2 size={16} />
                </button>
                <div className="toolbar-divider" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={activeFormatting.bulletList ? 'is-active' : ''}
                    aria-pressed={activeFormatting.bulletList}
                    title="Bullet List (Ctrl/Cmd+Shift+8)"
                    aria-label="Bullet list"
                >
                    <List size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={activeFormatting.orderedList ? 'is-active' : ''}
                    aria-pressed={activeFormatting.orderedList}
                    title="Numbered List (Ctrl/Cmd+Shift+7)"
                    aria-label="Numbered list"
                >
                    <ListOrdered size={16} />
                </button>
                {showChecklistModeToggle && (
                    <button
                        type="button"
                        onClick={onToggleChecklistMode}
                        className={isChecklistMode ? 'is-active checklist-mode-btn' : 'checklist-mode-btn'}
                        aria-pressed={isChecklistMode}
                        title="Checklist mode (Ctrl/Cmd+Shift+K)"
                        aria-label="Checklist mode"
                    >
                        <CheckSquare size={16} />
                    </button>
                )}
            </div>

            {/* Editor Content */}
            <EditorContent editor={editor} />

            <style>{`
                .rich-text-editor {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    min-height: 200px;
                }
                .rich-text-editor-content {
                    flex: 1;
                    padding: 12px 16px;
                    outline: none;
                    font-size: 0.9rem;
                    line-height: 1.6;
                    color: var(--text-primary);
                    caret-color: var(--text-primary); /* Ensure cursor is visible */
                    overflow-y: auto;
                }
                .rich-text-editor-content p {
                    margin: 0 0 0.5em 0;
                }
                .rich-text-editor-content strong {
                    font-weight: 700;
                }
                .rich-text-editor-content em {
                    font-style: italic;
                }
                .rich-text-editor-content h1 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 0.5em 0 0.25em;
                }
                .rich-text-editor-content h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0.5em 0 0.25em;
                }
                .rich-text-editor-content ul, .rich-text-editor-content ol {
                    padding-left: 1.5em;
                    margin: 0.5em 0;
                }
                .rich-text-editor-content ul[data-type="taskList"] {
                    list-style: none;
                    padding-left: 0;
                }
                .rich-text-editor-content ul[data-type="taskList"] li {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                }
                .rich-text-editor-content ul[data-type="taskList"] li label {
                    cursor: pointer;
                }
                .rich-text-editor-content ul[data-type="taskList"] li input[type="checkbox"] {
                    margin-top: 4px;
                    cursor: pointer;
                }
                .rich-text-editor-content ul[data-type="taskList"] li[data-checked="true"] > div {
                    text-decoration: line-through;
                    opacity: 0.6;
                }
                .rich-text-editor-content code {
                    background: rgba(0,0,0,0.05);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: 'Fira Code', monospace;
                    font-size: 0.85em;
                }
                .rich-text-editor-content .is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    color: var(--text-muted);
                    pointer-events: none;
                    float: left;
                    height: 0;
                }
                
                .editor-toolbar {
                    display: flex;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 4px;
                    padding: 8px 12px;
                    border-top: 1px solid var(--border-light);
                    background: var(--bg-secondary);
                    border-radius: 0 0 8px 8px;
                }
                .editor-toolbar button {
                    padding: 6px;
                    border: 1px solid transparent;
                    background: transparent;
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 32px;
                    min-height: 32px;
                    transition: all 0.15s;
                }
                .editor-toolbar button:hover {
                    background: var(--bg-hover, rgba(31, 41, 55, 0.08));
                    color: var(--text-primary);
                    border-color: var(--border-light);
                }
                .editor-toolbar button.is-active {
                    background: var(--accent-light);
                    color: var(--accent);
                    border-color: var(--accent);
                    box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.15);
                }
                .editor-toolbar button:focus-visible {
                    outline: none;
                    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
                }
                .toolbar-divider {
                    width: 1px;
                    background: var(--border-light);
                    margin: 0 4px;
                    align-self: stretch;
                }
                .checklist-mode-btn {
                    margin-left: 2px;
                }
                @media (max-width: 768px) {
                    .editor-toolbar {
                        flex-wrap: nowrap;
                        overflow-x: auto;
                        gap: 6px;
                        padding: 8px 10px;
                        scrollbar-width: thin;
                    }
                    .editor-toolbar button {
                        min-width: 36px;
                        min-height: 36px;
                        flex: 0 0 auto;
                    }
                    .toolbar-divider {
                        flex: 0 0 1px;
                        height: 24px;
                        align-self: center;
                    }
                }

                .bubble-menu {
                    display: flex;
                    gap: 2px;
                    padding: 4px;
                    background: #1a1a1a;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
                }
                .bubble-menu button {
                    padding: 6px;
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                    cursor: pointer;
                    color: #ccc;
                    display: flex;
                    align-items: center;
                }
                .bubble-menu button:hover {
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                .bubble-menu button.is-active {
                    background: #3B82F6;
                    color: white;
                }
                .bubble-divider {
                    width: 1px;
                    background: #444;
                    margin: 0 4px;
                }

                .rich-text-editor-loading {
                    padding: 16px;
                    color: var(--text-muted);
                    text-align: center;
                }
            `}</style>
        </div>
    );
}

