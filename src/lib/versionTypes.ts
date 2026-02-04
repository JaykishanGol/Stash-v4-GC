export interface ItemVersion {
    id: string;
    item_id: string;
    version: number;
    title: string;
    content: any; // NoteContent | LinkContent etc
    created_at: string;
    created_by: string;
}
