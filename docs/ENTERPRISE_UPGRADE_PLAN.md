# Enterprise System Upgrade Plan (Google Drive Equivalent)

## Current Status: Prosumer Level
Your system is currently a robust single-user file system with:
- ✅ **ACID Compliance** (PostgreSQL)
- ✅ **Soft Delete / Trash** (Robust 3-tier strategy)
- ✅ **Audit Logging** (`activity_log` table active)
- ✅ **Basic Versioning** (`item_versions` tracks metadata/text changes)
- ✅ **Google Sync** (Calendar/Tasks integration)

## The "Enterprise" Gap
To match Google Drive/Dropbox Enterprise, we need to move from "Single User" to "Multi-User Collaboration & Governance".

### Phase 1: Collaboration & Sharing (The "Drive" Core)
Currently, files are strictly private (`auth.uid() = owner`). We need granular sharing.

**New Architecture:**
1.  **`item_permissions` Table:**
    - `item_id` (UUID)
    - `user_id` (UUID) - User being shared with
    - `role` (enum: 'viewer', 'commenter', 'editor', 'owner')
    - `inherited_from` (UUID) - For folder-level cascading permissions
2.  **Public Links:**
    - Add `share_link_token`, `share_expiry`, `share_password` to `items`.
3.  **Updated RLS Policies:**
    - Allow access if `auth.uid() = owner` OR `auth.uid() IN (SELECT user_id FROM item_permissions...)`.

### Phase 2: True File Versioning (Blob History)
Currently, `item_versions` tracks text changes. If you replace an image, the old image is likely lost or overwritten.
**Upgrade:**
- When updating a file, do NOT delete the old storage object.
- Store `storage_path` in `item_versions`.
- UI to "Restore this version" which reverts the file pointer.

### Phase 3: Team & Organization Support
- **Shared Drives:** Folders that don't belong to a specific user but an `organization_id`.
- **Quotas:** Track storage usage per user/org (`storage_usage` table).

### Phase 4: Advanced Search & Intelligence
- **Vector Embeddings:** Use `pgvector` to search by meaning (e.g., search "contract" -> finds PDF with legal terms).
- **OCR:** Auto-extract text from images/PDFs on upload (using Edge Functions).

---

## Recommended Immediate Action: Phase 1 (Sharing)
This yields the highest value. I can set up the database structure for Sharing and Public Links right now.
