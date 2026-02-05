/**
 * Data Export Utility
 *
 * Allows users to download their data as JSON, Markdown, or HTML.
 * No server round-trip — works entirely from the Zustand store.
 */

import type { Item, Task, List } from './types';

export type ExportFormat = 'json' | 'markdown' | 'html';

interface ExportPayload {
    exportedAt: string;
    version: 1;
    items: Item[];
    tasks: Task[];
    lists: List[];
}

// ---- Format converters ----

function toJSON(data: ExportPayload): string {
    return JSON.stringify(data, null, 2);
}

function itemToMarkdown(item: Item): string {
    const lines: string[] = [];
    const status = item.is_completed ? '[x]' : '[ ]';
    lines.push(`## ${status} ${item.title}`);
    lines.push('');
    lines.push(`- **Type:** ${item.type}`);
    lines.push(`- **Priority:** ${item.priority}`);
    if (item.tags.length) lines.push(`- **Tags:** ${item.tags.join(', ')}`);
    if (item.scheduled_at) lines.push(`- **Scheduled:** ${item.scheduled_at}`);
    lines.push(`- **Created:** ${item.created_at}`);
    lines.push(`- **Updated:** ${item.updated_at}`);

    // Content
    if (item.type === 'note' && item.content && typeof item.content === 'object') {
        const text = (item.content as { text?: string }).text;
        if (text) {
            // Strip HTML tags for markdown
            const plain = text.replace(/<[^>]*>/g, '');
            lines.push('');
            lines.push(plain);
        }
    } else if (item.type === 'link' && item.content && typeof item.content === 'object') {
        const url = (item.content as { url?: string }).url;
        if (url) lines.push(`- **URL:** [${url}](${url})`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n');
}

function taskToMarkdown(task: Task): string {
    const status = task.is_completed ? '[x]' : '[ ]';
    const lines: string[] = [];
    lines.push(`- ${status} **${task.title}**`);
    if (task.description) lines.push(`  ${task.description}`);
    if (task.priority !== 'none') lines.push(`  Priority: ${task.priority}`);
    if (task.scheduled_at) lines.push(`  Due: ${task.scheduled_at}`);
    return lines.join('\n');
}

function toMarkdown(data: ExportPayload): string {
    const parts: string[] = [];
    parts.push(`# Stash Export`);
    parts.push(`> Exported at ${data.exportedAt}`);
    parts.push('');

    if (data.items.length) {
        parts.push('# Items');
        parts.push('');
        for (const item of data.items) {
            parts.push(itemToMarkdown(item));
        }
    }

    if (data.tasks.length) {
        parts.push('# Tasks');
        parts.push('');
        for (const task of data.tasks) {
            parts.push(taskToMarkdown(task));
        }
        parts.push('');
    }

    if (data.lists.length) {
        parts.push('# Lists');
        parts.push('');
        for (const list of data.lists) {
            parts.push(`- **${list.name}** (${list.items.length} items)`);
        }
        parts.push('');
    }

    return parts.join('\n');
}

function toHTML(data: ExportPayload): string {
    const escapeHtml = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const itemRows = data.items.map(item => {
        const content =
            item.type === 'note' && typeof item.content === 'object'
                ? ((item.content as { text?: string }).text ?? '')
                : item.type === 'link' && typeof item.content === 'object'
                    ? `<a href="${escapeHtml((item.content as { url?: string }).url ?? '')}">${escapeHtml((item.content as { url?: string }).url ?? '')}</a>`
                    : '';

        return `<tr>
  <td>${escapeHtml(item.title)}</td>
  <td>${item.type}</td>
  <td>${item.priority}</td>
  <td>${item.tags.map(escapeHtml).join(', ')}</td>
  <td>${content}</td>
  <td>${item.created_at}</td>
</tr>`;
    }).join('\n');

    const taskRows = data.tasks.map(task => `<tr>
  <td>${task.is_completed ? '✅' : '⬜'}</td>
  <td>${escapeHtml(task.title)}</td>
  <td>${task.priority}</td>
  <td>${task.scheduled_at ?? ''}</td>
</tr>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Stash Export</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 32px; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; }
  h1,h2 { color: #333; }
</style>
</head>
<body>
<h1>Stash Export</h1>
<p>Exported at ${escapeHtml(data.exportedAt)}</p>

<h2>Items (${data.items.length})</h2>
<table>
<tr><th>Title</th><th>Type</th><th>Priority</th><th>Tags</th><th>Content</th><th>Created</th></tr>
${itemRows}
</table>

<h2>Tasks (${data.tasks.length})</h2>
<table>
<tr><th>Status</th><th>Title</th><th>Priority</th><th>Due</th></tr>
${taskRows}
</table>

<h2>Lists (${data.lists.length})</h2>
<ul>
${data.lists.map(l => `<li><strong>${escapeHtml(l.name)}</strong> (${l.items.length} items)</li>`).join('\n')}
</ul>
</body>
</html>`;
}

// ---- Public API ----

/**
 * Trigger a file download in the browser.
 */
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Export all user data in the given format and trigger a download.
 */
export function exportData(
    items: Item[],
    tasks: Task[],
    lists: List[],
    format: ExportFormat = 'json',
): void {
    const payload: ExportPayload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        items,
        tasks,
        lists,
    };

    const dateStr = new Date().toISOString().split('T')[0];

    switch (format) {
        case 'json': {
            const blob = new Blob([toJSON(payload)], { type: 'application/json' });
            downloadBlob(blob, `stash-export-${dateStr}.json`);
            break;
        }
        case 'markdown': {
            const blob = new Blob([toMarkdown(payload)], { type: 'text/markdown' });
            downloadBlob(blob, `stash-export-${dateStr}.md`);
            break;
        }
        case 'html': {
            const blob = new Blob([toHTML(payload)], { type: 'text/html' });
            downloadBlob(blob, `stash-export-${dateStr}.html`);
            break;
        }
    }
}
