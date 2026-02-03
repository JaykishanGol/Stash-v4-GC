import { useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useAppStore } from '../../store/useAppStore';
import type { ActiveView, PriorityLevel } from '../../lib/types';

/**
 * RouteSyncer Component
 * 
 * This invisible component listens to URL changes and updates the Zustand store state.
 * This allows us to keep the existing store-based filtering logic while gaining URL persistence.
 */
export function RouteSyncer() {
    const [location] = useLocation();
    const { 
        setActiveView, 
        setSelectedList, 
        setSelectedFolder, 
        setFilter, 
        setSelectedTask,
        setListView // New atomic action
    } = useAppStore();

    // Route Matchers
    const [isList, listParams] = useRoute('/list/:id');
    const [isFolder, folderParams] = useRoute('/folder/:id');
    const [isType, typeParams] = useRoute('/type/:type');
    const [isPriority, priorityParams] = useRoute('/priority/:level');
    const [isView, viewParams] = useRoute('/:view');

    useEffect(() => {
        // 1. Reset specific filters by default
        setSelectedTask(null); 
        
        // 2. Handle Routes
        if (location === '/') {
            setActiveView('today');
            setSelectedList(null);
            setSelectedFolder(null);
            setFilter('type', null);
            setFilter('priority', null);
        }
        else if (isList && listParams) {
            // Atomic update to prevent "All Items" flash
            setListView(listParams.id);
        } 
        else if (isFolder && folderParams) {
            setActiveView('folders'); // Or a specific 'folder-content' view if needed
            setSelectedFolder(folderParams.id);
            setSelectedList(null);
            setFilter('type', null);
            setFilter('priority', null);
        }
        else if (isType && typeParams) {
            // "Smart Folders" like /type/image
            const type = typeParams.type as ActiveView; // e.g. 'images', 'notes'
            setActiveView(type);
            setSelectedList(null);
            setSelectedFolder(null);
            setFilter('type', null); // The view itself usually handles filtering, or we set type filter
            setFilter('priority', null);
        }
        else if (isPriority && priorityParams) {
            const level = priorityParams.level as PriorityLevel;
            const viewName = `${level}-priority` as ActiveView;
            setActiveView(viewName);
            setSelectedList(null);
            setSelectedFolder(null);
            setFilter('priority', level);
            setFilter('type', null);
        }
        else if (isView && viewParams) {
            // Generic views: /calendar, /tasks, /trash, /upcoming
            const view = viewParams.view as ActiveView;
            // Validate view exists?
            setActiveView(view);
            setSelectedList(null);
            setSelectedFolder(null);
            setFilter('type', null);
            setFilter('priority', null);
        }

    }, [location, isList, isFolder, isType, isPriority, isView]);

    return null;
}
