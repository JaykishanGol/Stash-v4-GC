
import { ChevronRight, Home } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function Breadcrumbs() {
    const { items, selectedFolderId, setSelectedFolder, setActiveView } = useAppStore();

    if (!selectedFolderId) return null;

    // Calculate path
    const path = [];
    let currentId: string | null = selectedFolderId;
    let safeGuard = 0;

    while (currentId && safeGuard < 50) {
        const folder = items.find(i => i.id === currentId);
        if (folder) {
            path.unshift(folder);
            currentId = folder.folder_id || null; // Move to parent
        } else {
            break;
        }
        safeGuard++;
    }

    const handleHomeClick = () => {
        setSelectedFolder(null); // Clear folder selection
        // Optionally switch to 'folders' view or keep current view?
        // Usually clicking Home in breadcrumbs means "All Files"
        setActiveView('folders');
    };

    return (
        <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span
                onClick={handleHomeClick}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                className="breadcrumb-item"
            >
                <Home size={16} />
            </span>

            {path.map((folder, index) => (
                <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChevronRight size={14} style={{ opacity: 0.5 }} />
                    <span
                        onClick={() => setSelectedFolder(folder.id)}
                        className={`breadcrumb-item ${index === path.length - 1 ? 'active' : ''}`}
                        style={{
                            cursor: 'pointer',
                            fontWeight: index === path.length - 1 ? 600 : 400,
                            color: index === path.length - 1 ? 'var(--text-primary)' : 'inherit'
                        }}
                    >
                        {folder.title}
                    </span>
                </div>
            ))}
        </div>
    );
}
