import { useEditor, EditorContent } from '@tiptap/react';
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
}

export function RichTextEditor({ content, onChange, placeholder = 'Write your note...', autoFocus }: RichTextEditorProps) {
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
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive('bold') ? 'is-active' : ''}
                    title="Bold (Ctrl+B)"
                >
                    <Bold size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive('italic') ? 'is-active' : ''}
                    title="Italic (Ctrl+I)"
                >
                    <Italic size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={editor.isActive('code') ? 'is-active' : ''}
                    title="Code"
                >
                    <Code size={16} />
                </button>
                <div className="toolbar-divider" />
                <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
                    title="Heading 1"
                >
                    <Heading1 size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                    title="Heading 2"
                >
                    <Heading2 size={16} />
                </button>
                <div className="toolbar-divider" />
                <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive('bulletList') ? 'is-active' : ''}
                    title="Bullet List"
                >
                    <List size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={editor.isActive('orderedList') ? 'is-active' : ''}
                    title="Numbered List"
                >
                    <ListOrdered size={16} />
                </button>
                <button
                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                    className={editor.isActive('taskList') ? 'is-active' : ''}
                    title="Checklist"
                >
                    <CheckSquare size={16} />
                </button>
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
                    gap: 4px;
                    padding: 8px 12px;
                    border-top: 1px solid var(--border-light);
                    background: var(--bg-secondary);
                    border-radius: 0 0 8px 8px;
                }
                .editor-toolbar button {
                    padding: 6px;
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                    cursor: pointer;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s;
                }
                .editor-toolbar button:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }
                .editor-toolbar button.is-active {
                    background: var(--accent-light);
                    color: var(--accent);
                }
                .toolbar-divider {
                    width: 1px;
                    background: var(--border-light);
                    margin: 0 4px;
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

