# Document Editing Feature Guide

## Overview

SimplifyDrive now includes a powerful document editing feature that allows you to edit documents directly in the browser with version tracking.

## Architecture

The document editing system consists of two parts:

1. **Main App (Port 5173)** - The SimplifyDrive frontend
2. **Document Editor Server (Port 3001)** - The Modern Document Editor running as a separate service

The DocumentEditorModal in the main app embeds the editor server via an iframe, enabling seamless document editing.

## Setup Instructions

### 1. Start the Document Editor Server

```bash
# From the project root
cd Modern-Document-Editor-main
npm install
npm run dev
```

Or use the batch script:
```bash
start_editor.bat
```

The editor server will start on http://localhost:3001

### 2. Start the Main Application

```bash
# In a new terminal, from the project root
npm run dev
```

The main app will start on http://localhost:5173

### 3. (Optional) Run Database Migration

If you want version tracking for documents:

```bash
# Run in Supabase SQL Editor or via CLI
supabase migration up
```

This creates the `document_versions` table.

## How It Works

### Editing a Document

1. Click on the document card/row dropdown menu (⋮)
2. Select "Edit" option
3. The Document Editor Modal opens with the editor loaded in an iframe
4. Edit your document using the full-featured rich text editor
5. Click "Save Version" to save your changes

### Version Tracking

- Each save creates a new version
- View version history by clicking the "Versions" button
- Click on any version to restore it
- Version metadata includes:
  - Version number
  - Created timestamp
  - Change summary

### Communication Between Apps

The main app and editor communicate via `postMessage`:

**Main App → Editor:**
- `LOAD_DOCUMENT` - Send document content to edit
- `LOAD_CONTENT` - Send content for version restore
- `REQUEST_SAVE` - Request editor to send back content

**Editor → Main App:**
- `EDITOR_READY` - Editor is initialized and ready
- `DOCUMENT_SAVED` - Returns HTML and text content
- `EDITOR_CONTENT` - Returns current content

## Environment Variables

Add to your `.env` file:

```env
VITE_EDITOR_URL=http://localhost:3001
```

## Features

### Rich Text Editing
- Bold, Italic, Underline
- Headings (H1, H2, H3)
- Lists (bullet and numbered)
- Text alignment
- Links and images
- Tables with resize
- Font family and size
- Text color and highlighting

### Document Support
- Word documents (.docx, .doc)
- PDF files (extracted text)
- Text files (.txt)
- HTML files
- Rich Text Format (.rtf)

### Version Control
- Automatic version numbering
- Version restore capability
- Change summaries
- Audit trail with user tracking

## Troubleshooting

### Editor Not Loading

If you see "Loading Document Editor..." for too long:

1. Make sure the editor server is running on port 3001
2. Check browser console for CORS errors
3. Verify `VITE_EDITOR_URL` is set correctly

### CORS Issues

The editor server is configured with CORS enabled. If you still have issues:

1. Check `Modern-Document-Editor-main/vite.config.ts` has:
   ```ts
   server: {
     port: 3001,
     cors: true,
   }
   ```

### Version Table Not Found

If version history isn't working:

1. Run the migration: `supabase/migrations/20251218000000_document_versions.sql`
2. The feature will work without the table, but won't track versions

## File Structure

```
docu-to-form/
├── .env                          # VITE_EDITOR_URL setting
├── start_editor.bat              # Script to start editor server
├── src/components/document-manager/
│   ├── DocumentEditorModal.tsx   # Main editor modal component
│   ├── DocumentGrid.tsx          # Card grid view with edit button
│   └── DocumentList.tsx          # List view with edit button
├── Modern-Document-Editor-main/  # Editor server
│   ├── vite.config.ts            # Port 3001, CORS config
│   └── src/App.tsx               # Iframe embedding support
└── supabase/migrations/
    └── 20251218000000_document_versions.sql  # Version tracking
```

## Security Notes

- The iframe communication uses `*` origin for simplicity
- In production, specify exact origin URLs
- User authentication is verified on each save
- RLS policies protect version data
