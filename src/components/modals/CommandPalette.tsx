import { useState, useEffect, useRef } from 'react';
import { Search, Command, File, Folder, Calendar, Moon, Sun, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ActiveView } from '../../lib/types';

interface CommandResult {
    id: string;
    title: string;
    type: 'item' | 'command' | 'navigation';
    icon: any;
    action: () => void;
    shortcut?: string;
    description?: string;
}

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [serverResults, setServerResults] = useState<any[]>([]); // Phase 3: Server Results
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<any>(null);

    // Get store data for searching
    const items = useAppStore(state => state.items);
    const searchItems = useAppStore(state => state.searchItems); // Phase 3 Action
    const toggleTheme = useAppStore(state => state.toggleTheme);
    const theme = useAppStore(state => state.theme);
    const setActiveView = useAppStore(state => state.setActiveView);
    const navigateTo = (view: ActiveView) => setActiveView(view);

    // Toggle logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (!isOpen) {
                    setQuery('');
                    setSelectedIndex(0);
                    setIsOpen(true);
                } else {
                    setIsOpen(false);
                }
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Phase 3: Server Side Search Effect
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        
        if (!query || query.length < 2) {
            setServerResults([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            const results = await searchItems(query);
            setServerResults(results);
        }, 300); // 300ms debounce

        return () => clearTimeout(debounceRef.current);
    }, [query, searchItems]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Generate Results
    const results: CommandResult[] = [];
    const q = query.toLowerCase();

    // 1. Navigation Commands
    if (!q || 'dashboard'.includes(q)) results.push({ id: 'nav-dashboard', title: 'Go to Dashboard', type: 'navigation', icon: Command, action: () => navigateTo('scheduled') });
    if (!q || 'calendar'.includes(q)) results.push({ id: 'nav-calendar', title: 'Go to Calendar', type: 'navigation', icon: Calendar, action: () => navigateTo('calendar') });

    // 2. System Commands
    if (!q || 'toggle theme dark light'.includes(q)) {
        results.push({
            id: 'cmd-theme',
            title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
            type: 'command',
            icon: theme === 'dark' ? Sun : Moon,
            action: toggleTheme,
            shortcut: 'Ctrl+T' // Fake shortcut for display
        });
    }

    // 3. Local + Server Item Search
    // Use server results if available, otherwise fallback to local limited filter
    const itemsToShow = serverResults.length > 0 ? serverResults : items.filter((i: any) => !i.deleted_at && i.title.toLowerCase().includes(q));

    if (q) {
        itemsToShow
            .slice(0, 10) // Limit to 10
            .forEach((i: any) => {
                // Deduplicate if already in list (unlikely with this logic flow but good practice)
                if (!results.find(r => r.id === i.id)) {
                    results.push({
                        id: i.id,
                        title: i.title,
                        type: 'item',
                        icon: i.type === 'folder' ? Folder : File,
                        description: i.type.toUpperCase(),
                        action: () => {
                            // Open item logic
                            console.log('Open item', i.id);
                            // If it's a server result, it might be a partial item.
                            // Ideally fetch full item or just preview what we have.
                            useAppStore.getState().setPreviewingItem(i); 
                        }
                    });
                }
            });
    }

    // Handle Selection
    const handleSelect = (index: number) => {
        const item = results[index];
        if (item) {
            item.action();
            setIsOpen(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay active" onClick={() => setIsOpen(false)} style={{ alignItems: 'flex-start', paddingTop: '15vh', background: 'rgba(0,0,0,0.6)' }}>
            <div
                className="command-palette"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: 640,
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 12,
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #333' }}>
                    <Search color="#666" size={20} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        placeholder="Type a command or search..."
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '1.1rem',
                            marginLeft: 12,
                            flex: 1,
                            outline: 'none'
                        }}
                        onKeyDown={e => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setSelectedIndex(i => Math.min(i + 1, results.length - 1));
                            }
                            if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setSelectedIndex(i => Math.max(i - 1, 0));
                            }
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSelect(selectedIndex);
                            }
                        }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <kbd style={kbdStyle}>ESC</kbd>
                    </div>
                </div>

                <div
                    ref={listRef}
                    style={{
                        maxHeight: 320,
                        overflowY: 'auto',
                        padding: 8
                    }}
                >
                    {results.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No results found</div>
                    ) : (
                        results.map((result, index) => (
                            <div
                                key={result.id}
                                onMouseEnter={() => setSelectedIndex(index)}
                                onClick={() => handleSelect(index)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 16px',
                                    borderRadius: 6,
                                    background: index === selectedIndex ? '#3B82F6' : 'transparent',
                                    color: index === selectedIndex ? '#fff' : '#aaa',
                                    cursor: 'pointer'
                                }}
                            >
                                <result.icon size={18} style={{ marginRight: 12, opacity: index === selectedIndex ? 1 : 0.7 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, color: index === selectedIndex ? '#fff' : '#e5e5e5' }}>{result.title}</div>
                                    {result.description && (
                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{result.description}</div>
                                    )}
                                </div>
                                {result.shortcut && (
                                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{result.shortcut}</span>
                                )}
                                {index === selectedIndex && <ArrowRight size={16} style={{ marginLeft: 8 }} />}
                            </div>
                        ))
                    )}
                </div>

                <div style={{
                    padding: '8px 16px',
                    background: '#222',
                    borderTop: '1px solid #333',
                    fontSize: '0.75rem',
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span><strong>ProTip:</strong> Search for "Settings" or "Calendar"</span>
                    <span>{results.length} results</span>
                </div>
            </div>
        </div>
    );
}

const kbdStyle: React.CSSProperties = {
    background: '#333',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: '0.7rem',
    color: '#aaa',
    fontFamily: 'monospace'
};
