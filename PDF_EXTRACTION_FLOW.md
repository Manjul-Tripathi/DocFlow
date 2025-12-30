# PDF Extraction and Storage Flow

## Overview
When PDF documents are processed for version comparison, extracted text is automatically saved to the database for future retrieval. The system ensures **`documents.extracted_text` always contains the LATEST version's text** (used for chatbot embeddings).

---

## Data Storage Locations

### 1. **documents** table
- **Column**: `extracted_text`
- **Contains**: Plain text extracted from the **LATEST** document version
- **When saved**: 
  - On first PDF upload (via document processing service)
  - When PDF is edited and saved via OnlyOffice (automatically updated)
  - During version comparison (lazy extraction if missing)
- **Purpose**: 
  - Quick lookup of current document content
  - **Used for chatbot embeddings** - always reflects latest version
  - Semantic search across documents

### 2. **document_versions** table
- **Column**: `content`
- **Contains**: Plain text content specific to **THAT** version
- **When saved**:
  - Version 1: Created on initial upload with extracted text from chunks
  - Subsequent versions: Created when document is edited and saved via OnlyOffice
  - Lazy extraction: When version is compared and text wasn't stored
- **Purpose**: Compare specific versions to see what changed between them
- **Related columns**:
  - `version_number`: Which version (1, 2, 3...)
  - `change_summary`: What changed in this version
  - `created_at`: When this version was created

---

## Key Principle: documents.extracted_text = LATEST version

| Action | documents.extracted_text | document_versions.content |
|--------|--------------------------|---------------------------|
| Initial upload | v1 text | v1 text |
| Edit → v2 saved | **Updated to v2** | v2 row created with v2 text |
| Edit → v3 saved | **Updated to v3** | v3 row created with v3 text |
| Compare v1 vs v2 | No change | Reads from respective rows |

---

## PDF Processing Workflow

### Scenario 1: Version Comparison (PDF vs PDF)
```
1. User selects two PDF versions to compare
   ↓
2. Frontend calls useDocumentVersions.getTextContent() for each version
   ↓
3. For each version:
   - Check if extracted_text exists in documents table
   - If not, call backend /api/document-editor/extract-content
   ↓
4. Backend extracts PDF text using PDF.js and returns:
   - HTML content (for display)
   - Plain extracted_text (for DB storage and comparison)
   ↓
5. If document_id provided, backend saves:
   - extracted_text → documents.extracted_text
   - extracted_text → document_versions.content (if version_id provided)
   ↓
6. Frontend compares the two extracted texts line-by-line
   ↓
7. Differences displayed in dialog
```

### Scenario 2: PDF Edited and Re-saved via OnlyOffice
```
1. User opens PDF in OnlyOffice editor
   ↓
2. Makes changes and saves
   ↓
3. OnlyOffice callback triggers document save endpoint
   ↓
4. Backend:
   - Saves new version to Supabase Storage
   - Creates new row in document_versions table
   - Increments version_number
   ↓
5. Next comparison automatically extracts from new version
   ↓
6. Extracted text saved back to database
```

### Scenario 3: First-time Extraction (Lazy Loading)
```
1. Old PDF without extracted_text is compared
   ↓
2. Backend extracts on-demand
   ↓
3. Returns extracted_text in response
   ↓
4. Frontend receives extraction and compares
   ↓
5. Backend simultaneously saves to DB:
   - documents.extracted_text
   - document_versions.content (current version)
   ↓
6. Next comparison uses pre-extracted text (faster)
```

---

## Implementation Details

### Backend Endpoint: `/api/document-editor/extract-content` (POST)

**Request Parameters**:
```json
{
  "storage_url": "string",           // Signed URL to PDF file
  "file_type": "application/pdf",   // File MIME type
  "document_id": "string",          // Optional: Document ID for saving
  "version_id": "string"            // Optional: Version ID for saving
}
```

**Response**:
```json
{
  "content": "HTML string",
  "content_type": "html",
  "success": true,
  "extracted_text": "Plain text extracted from PDF"
}
```

**Key Behavior**:
- Always extracts PDF to both HTML and plain text
- If `document_id` provided: saves extracted_text to `documents` table
- If `version_id` provided: saves extracted_text to `document_versions.content`
- Strips HTML tags before storing (stores only plain text)

### Frontend Hook: `useDocumentVersions.ts`

**Key Function**: `getTextContent(versionId, docData)`

**Flow for PDF versions**:
1. Fetch document from storage using signed URL
2. Call backend `/extract-content` with:
   - `storage_url`: signed URL to PDF file
   - `document_id`: docData.id (for saving extracted text)
   - `version_id`: versionId (for version-specific storage)
3. Return extracted text for comparison

---

## Extraction Performance

### First Extraction (No Cached Data)
- Time: 500ms - 2s (depending on PDF size and complexity)
- Trigger: Version comparison when `extracted_text` is empty
- Result: Text extracted, saved to DB, used immediately

### Subsequent Extractions (Cached Data)
- Time: < 50ms
- Trigger: Version comparison
- Result: Text retrieved from `documents.extracted_text` or `document_versions.content`
- Backend is **never called** for subsequent comparisons of same version

### Re-extraction After Edit
- Time: 500ms - 2s (triggers on new version creation)
- Trigger: PDF edited → save in OnlyOffice → new version created
- Result: New version text extracted → saved to `document_versions`
- Previous versions remain cached

---

## Schema

### documents table (relevant fields)
```sql
id UUID PRIMARY KEY
user_id UUID
file_name VARCHAR
file_type VARCHAR
extracted_text TEXT          -- ← Stores extracted PDF text
processing_status VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

### document_versions table (relevant fields)
```sql
id UUID PRIMARY KEY
document_id UUID FOREIGN KEY
version_number INTEGER
content TEXT               -- ← Stores version-specific text
change_summary VARCHAR
created_at TIMESTAMP
created_by UUID
```

---

## When Extracted Data Gets Updated

### Automatic Updates
1. **Initial Upload**: Extraction service processes PDF, saves to `documents.extracted_text`
2. **Version Save**: OnlyOffice saves new version, creates new `document_versions` row
3. **Lazy Extraction**: When comparing old PDFs without extracted_text, backend extracts and saves

### Manual Triggers
- None currently (fully automatic)

### Edge Cases
- **Corrupted PDF**: Falls back to "[PDF file - text extraction requires backend processing]"
- **Large PDF (>50MB)**: Extraction may timeout, cached text used if available
- **Unsupported Format**: Treats as binary, attempts text extraction

---

## Testing the Flow

### Manual Test Steps
1. Upload a PDF document
2. Create an edited version (via OnlyOffice)
3. Compare Version 1 vs Version 2
4. Check Supabase database:
   - `documents.extracted_text` should have text from latest version
   - `document_versions.content` should have version-specific text
5. Compare again (should be instant, using cached data)

### Check Database Values
```sql
-- Check if extraction completed
SELECT id, file_name, extracted_text FROM documents 
WHERE file_type = 'application/pdf' AND user_id = 'your_id'
LIMIT 10;

-- Check version history
SELECT id, version_number, content FROM document_versions 
WHERE document_id = 'doc_id' 
ORDER BY version_number DESC;
```

---

## Summary

- **PDF text extracted**: On first comparison or edit
- **Extracted data stored in**: 
  - `documents.extracted_text` (current document text)
  - `document_versions.content` (version-specific text)
- **Cache usage**: Subsequent comparisons use database, not re-extraction
- **Edit flow**: Edit PDF → new version created → new entry in document_versions → auto-extracted
