# Document Management Feature Plan

This document outlines the plan to implement document management features for Division and Union administrators and members.

## Revised Implementation Phases

### Phase 1: Supabase Backend Setup

- [x] **Create `gca_entities` Table First (Required for FK relationships):**

  - `id`: UUID, Primary Key, auto-generated.
  - `name`: TEXT, Unique, Not Null (e.g., "BLET GCA 910").
  - `description`: TEXT, Nullable.
  - `created_at`: Timestamp with timezone, default now().

- [x] **Create `documents` Table Schema (with Versioning):**

  - `id`: UUID, Primary Key, auto-generated (unique ID for this specific version of the document).
  - `document_group_id`: UUID (links all versions of the same conceptual document; for the first version, can be same as `id`).
  - `version_number`: INTEGER, default 1.
  - `is_latest`: BOOLEAN, default TRUE (indicates if this is the most recent version for its `document_group_id`).
  - `created_at`: Timestamp with timezone, default now() (timestamp of this version).
  - `uploader_id`: UUID, Foreign Key to `auth.users.id` (who uploaded this version).
  - `file_name`: TEXT (original name of the uploaded file for this version).
  - `display_name`: TEXT (user-provided meaningful name for the document)
  - `storage_path`: TEXT (path to the file in Supabase Storage, e.g., `division_documents/division_id/uuid.pdf`)
  - `file_type`: TEXT (e.g., 'pdf', 'docx', 'xlsx', 'png', 'jpg')
  - `file_size`: INTEGER (size in bytes)
  - `division_id`: INTEGER, Nullable, Foreign Key to `public.divisions.id` (if a division-specific document)
  - `gca_id`: UUID, Nullable, Foreign Key to `public.gca_entities.id` (if a GCA-specific document)
  - `document_category`: TEXT (e.g., 'general', 'bylaw', 'agreement', 'meeting_minutes_attachment') - helps in filtering/organizing
  - `description`: TEXT, Nullable (optional description for this version)
  - `is_public`: BOOLEAN, default TRUE (can be used to control visibility if needed later, for now, assume all member-visible)
  - `is_deleted`: BOOLEAN, default FALSE (for soft deletes)

- [x] **Define `gca_entities` Table Schema:**
  - `id`: UUID, Primary Key, auto-generated.
  - `name`: TEXT, Unique, Not Null (e.g., "BLET GCA 910").
  - `description`: TEXT, Nullable.
  - `created_at`: Timestamp with timezone, default now().
- [x] **Create `document_edits_audit_log` Table Schema:**
- [x] **Define `document_edits_audit_log` Table Schema:**

  - `id`: UUID, Primary Key, auto-generated.
  - `document_version_id`: UUID, Not Null, Foreign Key to `public.documents.id`.
  - `editor_id`: UUID, Not Null, Foreign Key to `auth.users.id`.
  - `edit_timestamp`: Timestamp with timezone, default now().
  - `changed_fields`: JSONB, Not Null (e.g., `{ "display_name": {"old": "Old Name", "new": "New Name"}, "category": {"old": "general", "new": "bylaw"} }`).
  - `edit_reason`: TEXT, Nullable (reason for edit, provided by admin).

- [x] **Set Up Supabase Storage Buckets:**

  - [x] `division_documents`: For documents uploaded by Division Admins.
    - Path structure: `division_id/version_id.extension` (where `version_id` is the `id` field of the document record)
  - [x] `gca_documents`: For documents uploaded by GCA Admins.
    - Path structure: `version_id.extension` (where `version_id` is the `id` field of the document record)

- [x] **Configure Bucket Policies (RLS for Storage):**

  - `division_documents`:
    - `SELECT`: Authenticated users who are members of the division (or all authenticated users if division documents are generally accessible post-login). **we will allow all authenticated users to access**
    - `INSERT`: Users with a 'division_admin' for their respective division, or 'union_admin' or 'application_admin' role.
    - `UPDATE`: Users with a 'division_admin' for their respective division, or 'union_admin' or 'application_admin' role.
    - `DELETE`: Users with a 'division_admin' for their respective division, or 'union_admin' or 'application_admin' role.
  - `gca_documents`:
    - `SELECT`: Authenticated users.
    - `INSERT`: Users with a 'union_admin' or 'application_admin' role.
    - `UPDATE`: Users with a 'union_admin' or 'application_admin' role.
    - `DELETE`: Users with a 'union_admin' or 'application_admin' role.

- [x] **Define RLS Policies for `documents` Table:**

  - `SELECT`:
    - Authenticated users can select documents relevant to their division (if `division_id` matches their membership and `is_deleted=FALSE`) OR if the document is a GCA document ( `gca_id` is not NULL, and `is_deleted=FALSE`).
    - GCA documents (`gca_id` IS NOT NULL and `is_deleted=FALSE`) are visible to all authenticated users.
  - `INSERT`:
    - Division Admins can insert if `division_id` matches their admin rights (and `gca_id` is NULL).
    - Union Admins can insert for Users with a 'union_admin' or 'application_admin' role.
  - `UPDATE`:
    - Division Admins can update documents for their division (`is_deleted` status, or metadata which triggers audit).
    - Union Admins can update all documents (`is_deleted` status, or metadata which triggers audit) for Users with a 'union_admin' or 'application_admin' role.
  - `DELETE`:
    - Division Admins can soft delete documents for their division (set `is_deleted=TRUE` audit of which user set file to delete status).
    - GCA Admins can soft delete all documents (set `is_deleted=TRUE`) for Users with a 'union_admin' or 'application_admin' role.

- [x] **Define RLS Policies for `document_edits_audit_log` Table:**

  - `SELECT`:
    - Division Admins can view audit log entries for documents related to their specific division (e.g., `document_version_id` points to a document where `division_id = get_user_division_id()`). Relies on identifying the user's division via a function like `get_user_division_id()`.
    - Union (GCA) Admins can view all audit log entries (for GCA and all Division documents). Relies on identifying Union admin role via a function like `has_admin_role('union_admin' or 'application_admin')` or `get_my_effective_roles()`.
    - No INSERT/UPDATE/DELETE for these roles (system-generated entries).

- [x] **(Optional) Create Supabase Edge Function for Metadata:**

  - If needed, an edge function could extract metadata (e.g., page count for PDFs) upon upload. (Consider for V2)

- [x] **Create Database Functions & Triggers for Versioning:**

  - [x] **Trigger: `before_document_insert_set_versioning`**
    - Handles new document uploads and new version uploads.
    - If `document_group_id` is new (i.e., first version of a document): sets `document_group_id = NEW.id`, `NEW.version_number = 1`, `NEW.is_latest = TRUE`.
    - If `document_group_id` exists (i.e., uploading a new version for an existing document):
      - Sets `is_latest = FALSE` for the current latest version of that `document_group_id`.
      - Inserts the new version with `is_latest = TRUE` and increments `version_number` (max existing version for group + 1).
  - [x] **Trigger: `after_document_metadata_update_log_edit`**
    - Fires after an UPDATE on the `documents` table.
    - If `display_name`, `category`, or `description` fields are changed on an existing version:
      - Constructs a JSONB object detailing old and new values for changed fields.
      - Inserts a new record into `document_edits_audit_log` with `document_version_id = OLD.id`, `editor_id = auth.uid()`, `changed_fields`, and `edit_reason` (if provided from app context, otherwise NULL).
      - Note: Passing `edit_reason` from app to trigger might require temporary session variables or modifying the UPDATE statement to include it if Supabase allows. Simpler: `edit_reason` column on `documents` table, populated by app, read by trigger, then cleared. Or, app makes direct insert to audit log after update. For now, assume direct insert to audit log is part of `updateDocumentRecord` logic.
  - [x] **Trigger: `after_document_delete_storage`**
    - After a record in `documents` (a specific version) is deleted _permanently_, this trigger deletes the corresponding file from Supabase Storage using the `storage_path`.
    - Requires careful permission setup for the function called by the trigger.
    - Note: This trigger handles permanent deletion. For soft deletes initiated by admins, this trigger won't fire. A separate process for app administrators would be needed for permanent data removal and invoking this cleanup.
  - [x] **(Optional) Database Functions (consider if complex queries are frequent):**
    - `get_latest_documents_for_division(p_division_id INT)`: Selects documents where `division_id = p_division_id` AND `is_latest = TRUE`.
    - `get_latest_documents_for_gca()`: Selects documents where `division_id IS NULL` AND `is_latest = TRUE`.
    - `get_document_versions(p_document_group_id UUID)`: Selects all versions for a given `document_group_id`, ordered by `version_number DESC`.

- [x] **Seed Initial Data:**
  - Insert initial GCA entity data (e.g., "BLET GCA 910") after table creation.

### Phase 2: Core Reusable Hooks and Utilities

- [x] **Create `useDocumentPicker` Hook:**

  - Utilizes `expo-document-picker` to allow users to select files.
  - Handles different MIME types (PDF, DOC, DOCX, XLS, XLSX, common image types).
  - Client-side validation for file types and size (e.g., max 25MB).
  - Returns selected file URI, name, size, and type.

- [x] **Create `useSupabaseStorage` Hook:**

  - `uploadFile(bucketName, filePath, file, metadata)`: Uploads a file to the specified Supabase Storage bucket and path.
    - `filePath` would be like `division_id/version_id.ext`.
    - `metadata` for content type.
  - `downloadFile(bucketName, filePath)`: Generates a signed URL or downloads a file.
    - Should support background downloads for large files.
    - Provide download progress indicator.
    - Cache downloaded files for offline access when possible.
  - `deleteFile(bucketName, filePath)`: Deletes a file from storage.

- [x] **Create `useDocumentManagement` Hook/Service:**
  - `addDocumentRecord(documentMetadata)`: Creates a new record in the `documents` table (handles new docs and new versions).
    - `documentMetadata` includes `display_name`, `storage_path`, `file_type`, `file_size`, `division_id`, `gca_id`, `document_group_id` (if new version), etc.
  - `fetchDocuments(criteria)`: Fetches documents based on criteria (e.g., `division_id`, `gca_id`, `category`, `is_latest=TRUE`, `is_deleted=FALSE`).
  - `fetchDocumentVersions(documentGroupId)`: Fetches all versions of a specific document (respecting `is_deleted=FALSE` for general views, or optionally showing all for an admin audit view).
  - `deleteDocumentRecord(documentId)`: Performs a soft delete by setting `is_deleted = TRUE` on the specified document version record. Does not delete all versions by default.
  - `updateDocumentRecord(documentId, updates, editReason)`: Updates document metadata directly on the existing record. Does not create a new version for simple metadata changes like `display_name` or `category`. This function will also be responsible for inserting a record into `document_edits_audit_log` with the `editReason` and details of the changes.

### Phase 3: Document Viewing Components

- [x] **Create Modal Document Viewer Component:**

  - Build a modal-based document viewer similar to MinutesReader.
  - Support PDF viewing (primarily):
    - Native: Use `react-native-pdf-renderer` library with platform-specific implementation.
    - Web: Use `<iframe>` for PDF viewing with platform-specific implementation.
    - Fallback: Appropriate fallback UI when PDFs can't be displayed.
  - Download button for non-viewable file types.
  - Version history section showing all versions of a document (visible to all users).
  - File information display (size, upload date, type).

- [x] **Create Document Browser Component:**
  - Adapt patterns from the existing `MinutesBrowser` component.
  - List documents with metadata (name, type, date, version).
  - Support search, filtering by category, and pagination.
  - Action buttons for viewing and downloading documents.
  - Version indicator if a document has multiple versions.

### Phase 4: Download and File Handling Utilities

- [x] **Implement Background Download Service:**

  - Use `expo-file-system` for native downloads, browser downloads for web.
  - Add download progress tracking.
  - Handle large files by downloading in the background.
  - Implement local file caching when appropriate.
  - Callback system to notify UI when downloads complete.

- [x] **Create File Type Handler:**
  - Determine if a file can be viewed in-app (primarily PDFs) or needs external handling.
  - For non-viewable files (DOC, DOCX, XLS, etc.), trigger downloads.
  - Use `expo-sharing` on native to open files with appropriate system apps.
  - Implement proper error handling for file access issues.

### Phase 5: Member-Facing Screens ✅

- [x] **Create Division Documents Screen (`app/(division)/[divisionName]/documents.tsx`):**

  - This screen is linked from `app/(division)/[divisionName]/index.tsx`.
  - Fetch and display latest documents (`is_latest=TRUE`, `is_deleted=FALSE`) for the specific `divisionName` (using `division_id`).
  - Use DocumentBrowser component with filtering for "general" category.
  - Modal document viewer for viewing documents.
  - Implement pagination if document count > 25.
  - Added tab navigation for different document categories (General, Bylaws, etc.)

- [x] **Create GCA Documents Screen (`app/(gca)/documents.tsx`):**

  - This screen is linked from `app/(gca)/index.tsx`.
  - Fetch and display latest GCA-level documents (`is_latest=TRUE`, `is_deleted=FALSE`, filtered by the relevant `gca_id` where `division_id` is NULL).
  - Filter documents by "general" category.
  - Use same UI/UX patterns as the Division Documents screen.

- [x] **Create Division Bylaws Screen (`app/(division)/[divisionName]/bylaws.tsx`):**

  - ~~Link from division detail page.~~ Integrated into division documents page as a tab.
  - Show documents with category="bylaw" for the specific division.
  - Same viewing and download functionality as the documents screen.

- [x] **Create GCA Bylaws Screen (`app/(gca)/bylaws.tsx`):**

  - Link from existing navigation card in `app/(gca)/index.tsx`.
  - Show documents with category="bylaw" for the GCA level.
  - Same viewing and download functionality as other document screens.

- [x] **Integrate with Agreements Section (`app/(agreements)/...`):**
  - Update screens in the agreements section to use the new document system:
    - Current agreement screen: Show documents with category="agreement" and appropriate filtering.
    - Local agreements: Show documents with category="local agreement".
    - Side letters: Show documents with category="side_letter".
    - Historical agreements: Show older versions of agreement documents.
  - Reuse DocumentBrowser and document viewer components.

### Phase 6: Division Admin Document Management UI ✅

- [x] **Implement "Documents" Tab in `components/admin/division/DivisionManagement.tsx`:**
  - [x] **UI for Uploading Documents:**
    - Button to trigger `useDocumentPicker`.
    - Input field for `display_name`.
    - (Optional) Input field for `description`.
    - (Optional) Dropdown for `document_category`.
    - Upload progress indicator.
    - Form validation (e.g., Zod for client-side checks, server-side validation as fallback).
  - [x] **Display List of Division Documents:**
    - Fetch latest documents (`is_latest=TRUE`, `is_deleted=FALSE`) using `useDocumentManagement` filtered by the current `division_id`.
    - Display in a list or card format (show `display_name`, `file_type` icon, `version_number`, upload date). Show empty state message if no documents exist.
    - Implement pagination if document count > 25.
    - Each item should have options for:
      - View/Download (latest version).
      - "Upload New Version" button.
      - "View History" button (leads to a list of all non-deleted versions for that `document_group_id`).
      - Delete (confirmation dialog - performs a soft delete on the latest version by setting `is_deleted = TRUE`).
      - (Optional) Edit metadata (updates the current latest version's metadata directly, prompts for "edit reason" via simple text input in a modal, for audit log).
  - [x] **Handle File Upload Logic:**
    - On file selection and form submission:
      1. Generate a UUID for the document version (`id`).
      2. If it's a new document, `document_group_id` can be the same as `id`. If it's a new version of an existing document, use its `document_group_id`.
      3. Construct `storage_path` (e.g., `division_id/version_id.ext`).
      4. Upload file to `division_documents` bucket using `useSupabaseStorage`.
      5. If upload successful, add record to `documents` table using `useDocumentManagement`.
  - [x] **Handle File Deletion Logic:**
    - On delete confirmation: Sets `is_deleted = TRUE` for the selected document version (typically the latest). No immediate file deletion from storage for admin-initiated soft deletes.

### Phase 7: GCA Admin Document Management UI ✅

- [x] **Implement "Documents" Tab in `components/admin/union/GCAManager.tsx`:**
  - This will largely mirror the Division Admin UI but for GCA-level documents, and will also provide the ability for GCA Admins to select and manage documents for any specific Division (e.g., via a `DivisionSelector` component).
  - [x] **UI for Uploading Documents:** (Similar to Division. For GCA documents, `gca_id` will be set to the primary GCA. If managing a division's documents, `division_id` is used, and `gca_id` is NULL).
  - [x] **Display List of GCA Documents and/or Division Documents:** (Fetch latest documents for their primary `gca_id` [where `division_id` is NULL], OR for a selected `division_id`. All queries filter `is_latest=TRUE`, `is_deleted=FALSE`). Implement pagination if document count > 25. Show empty state message if no documents exist.
    - Similar version history, new version upload features, soft delete logic, and metadata editing with "edit reason" as Division Admin.
  - [x] **Handle File Upload Logic:** (Upload to `gca_documents` bucket for GCA docs, or `division_documents` for division-specific docs. Path like `version_id.ext` or `division_id/version_id.ext`).
  - [x] **Handle File Deletion Logic:** (Delete from `gca_documents` bucket)

### Phase 8: Testing and Refinement

- [ ] **Unit Tests:**
  - For hooks (`useDocumentPicker`, `useSupabaseStorage`, `useDocumentManagement`).
  - For UI components (Admin forms, document list items).
- [ ] **Integration Tests:**
  - Full upload flow (pick file -> upload to storage -> create DB record -> display in list).
  - Full download/view flow with background download.
  - Deletion flow.
  - Version history viewing.
- [ ] **Permissions Testing:**
  - Ensure RLS policies for Storage and Database are working as expected for different user roles.
- [ ] **Cross-Platform Testing:**
  - iOS, Android, Web.
- [ ] **User Acceptance Testing (UAT):**
  - Get feedback from representative admin users and members.

## Open Questions / Considerations (Revised)

- **Metadata Updates vs. New Versions**: Confirmed: Update current version's metadata directly. Only new file uploads or significant content changes warrant a new version.
- **Deleting Document Versions**: Confirmed: Admins perform soft deletes (`is_deleted=TRUE`). Permanent deletion is an application admin task (out of scope for this plan).
- **`gca_id` field Utility**: Confirmed: Kept for future GCA expansion, links to new `gca_entities` table.
- **Initial Admin Display**: Confirmed: Show list with an empty state message.
- **Storage Path for Versions**: Confirmed path structure ensures unique paths for each version.
- **Restoring Soft-Deleted Documents**: Confirmed: Out of scope for this plan (application admin task).
- **Permanent Deletion Process**: Confirmed: Out of scope for this plan (application admin task).

- **Final Considerations for Phase 1 Implementation:**
  - **Order of Table Creation**: `gca_entities` must be created before `documents` (due to FK). `documents` must be created before `document_edits_audit_log` (due to FK).
  - **Seeding `gca_entities`**: Data for the primary GCA to be inserted into `gca_entities` after its creation, as per user provision.
  - **Leverage Existing Role Check Functions**: RLS policies for all new tables (`documents`, `document_edits_audit_log`) and storage buckets will utilize existing database functions (e.g., `get_my_effective_roles()`, `has_admin_role('...')`, `is_division_admin_for_division(division_id)`, `get_user_division_id()`) to determine user permissions. No new role-checking DB functions should be created for this specific feature if existing ones suffice.

## Resolved Clarifications

- **Document Viewing UX Pattern**: Document viewing will be modal-based similar to MinutesReader component.
- **Special Document Type Handling**: No special handling beyond PDFs at this time. Non-viewable files will be available for download.
- **Version History Visibility**: Version history will be visible to all users, not just admins.
- **Large Document Handling**: Document downloads will happen in the background where possible, with progress indicators, allowing users to access files once downloads complete.
- **Integration with Existing Routes**: The document system will integrate with existing route structure, using the document_category field to filter documents appropriate for each section (general, bylaws, agreements, etc.)

This plan is now considered final for V1. Future updates will be appended or will form a new plan.
