# AI Folder Organization - Improvement Plan

## Current State Analysis

### Document Upload Flow (Existing)

When you upload a document, the following happens:

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   Upload    │────▶│  DocumentTypeDetector │────▶│  Database: documents │
│   Document  │     │  (Gemini Vision AI)   │     │  document_type field │
└─────────────┘     └──────────────────────┘     └─────────────────────┘
                              │
                    Uses LLM Vision to analyze
                    first 2 pages of PDF
```

**File:** `backend/app/services/modules/document_type_detector.py`

**AI Used:** Gemini Vision LLM
- Converts first 2 pages of PDF to images
- Sends images to Gemini with structured schema prompt
- Returns: `document_type`, `confidence`, `display_name`, `icon`, `color`

**Database:** YES, `document_type` IS saved in `documents` table
```sql
-- documents table has:
document_type text  -- e.g., 'airtel-payment-receipt', 'invoice', 'pan-card'
```

---

### Current AI Organization Methods

#### Method 1: Smart Folder Toggle (Manual Smart Folder)

**File:** `backend/app/services/organize_documents.py`

```
┌────────────────────┐     ┌─────────────────────────┐     ┌───────────────────┐
│ Create Folder with │────▶│ _matches_criteria()     │────▶│ document_folder_  │
│ Smart Toggle ON    │     │ Keyword Pattern Matching│     │ relationships     │
└────────────────────┘     └─────────────────────────┘     └───────────────────┘
```

**Logic:** Score-based matching (NOT using AI)
- Content Type: 30 points (keyword in text/filename/insights)
- Keywords: 25 points (keyword matching)
- Importance: 25 points (threshold matching)
- Age: 20 points (date comparison)
- **Threshold:** ≥30% confidence to match

**Problems:**
1. ❌ Does NOT use the AI-detected `document_type` from upload
2. ❌ Uses simple keyword matching, not semantic understanding
3. ❌ Can mismatch documents (e.g., "receipt" matches both "Airtel Receipt" and "Hotel Receipt")

---

#### Method 2: Auto-Organize Documents Button

**File:** `backend/app/services/auto_organize_service.py`

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌───────────────────┐
│ Auto-Organize       │────▶│ Group by document_type  │────▶│ document_shortcuts│
│ Documents Button    │     │ from database           │     │ table             │
└─────────────────────┘     └─────────────────────────┘     └───────────────────┘
```

**Logic:** Direct grouping by database field
- Reads `document_type` from documents table
- Groups all documents by their type
- Creates one folder per unique type

**Problems:**
1. ❌ No AI matching - just direct field grouping
2. ❌ Creates duplicate folders if types are similar (e.g., "invoice" vs "tax-invoice")
3. ❌ Uses different table (`document_shortcuts`) than Smart Folders (`document_folder_relationships`)

---

## Proposed Unified Solution

### Architecture Overview

```
                                    ┌──────────────────────────────────┐
                                    │         DOCUMENT UPLOAD          │
                                    │    (Gemini Vision Detection)     │
                                    └───────────────┬──────────────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────────────┐
                                    │      documents.document_type     │
                                    │  (AI-detected, high confidence)  │
                                    └───────────────┬──────────────────┘
                                                    │
                       ┌────────────────────────────┼────────────────────────────┐
                       │                            │                            │
                       ▼                            ▼                            ▼
          ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
          │   AUTO-ASSIGN ON      │  │   SMART FOLDER         │  │   AUTO-ORGANIZE        │
          │   UPLOAD (New!)       │  │   (Toggle ON)          │  │   BUTTON               │
          └───────────┬───────────┘  └───────────┬────────────┘  └───────────┬────────────┘
                      │                          │                           │
                      │                          │                           │
                      ▼                          ▼                           ▼
          ┌───────────────────────────────────────────────────────────────────────────────┐
          │                    UNIFIED FOLDER MATCHING SERVICE                            │
          │   - Primary: Match by document_type (from Gemini Vision detection)            │
          │   - Secondary: Match by content_type keywords (fallback)                      │
          │   - Tertiary: Match by custom keywords/rules                                  │
          └───────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                                    ┌──────────────────────────────────┐
                                    │   document_folder_relationships  │
                                    │     (Single unified table)       │
                                    └──────────────────────────────────┘
```

---

### Key Improvements

#### 1. **Use AI-Detected document_type as Primary Matching**

Currently the upload process detects document type using Gemini Vision AI but this is NOT used for folder organization. We should leverage this.

**New Matching Priority:**
```python
def match_document_to_folder(document, folder):
    # Priority 1: Direct document_type match (from Gemini Vision)
    if document.document_type in folder.filter_rules.get('document_types', []):
        return Match(confidence=1.0, reason="AI-detected document type match")
    
    # Priority 2: Partial document_type match
    # e.g., 'airtel-payment-receipt' contains 'receipt' or 'invoice'
    for content_type in folder.filter_rules.get('content_type', []):
        if content_type in document.document_type:
            return Match(confidence=0.9, reason=f"Document type contains '{content_type}'")
    
    # Priority 3: Keyword matching in text (existing fallback)
    score = keyword_match(document.extracted_text, folder.filter_rules.get('keywords', []))
    if score > 0.3:
        return Match(confidence=score, reason="Keyword match in content")
    
    return NoMatch()
```

#### 2. **Add document_types Field to Smart Folders**

Update the `smart_folders.filter_rules` schema:

```python
filter_rules = {
    # NEW: Direct AI document type matching (highest priority)
    "document_types": ["airtel-payment-receipt", "payment-receipt", "receipt"],
    
    # EXISTING: Keyword-based content matching (secondary)
    "content_type": ["invoice", "receipt"],
    
    # EXISTING: Text keyword matching (fallback)
    "keywords": ["airtel", "payment"],
    
    # EXISTING: Other criteria
    "importance_score": {"min": 0.5},
    "days_old": 30
}
```

#### 3. **Auto-Populate document_types When Creating Smart Folder**

When user creates a folder with `content_type: ['invoice', 'receipt']`:

```python
async def create_smart_folder(name, filter_rules):
    # Auto-detect related document_types from existing documents
    related_types = await get_related_document_types(filter_rules['content_type'])
    # e.g., ['invoice', 'tax-invoice', 'airtel-payment-receipt', 'receipt']
    
    filter_rules['document_types'] = related_types
    
    # Create folder with enhanced filter_rules
    return await db.create_folder(name, filter_rules)
```

#### 4. **Auto-Assign on Upload (New Feature)**

When a document is uploaded and AI detects its type:

```python
async def on_document_uploaded(document):
    document_type = document.document_type  # From Gemini Vision
    
    # Find all smart folders that match this document_type
    matching_folders = await find_folders_for_document_type(document_type)
    
    # Auto-assign to matching folders
    for folder in matching_folders:
        await assign_document_to_folder(document.id, folder.id, 
            confidence=1.0, 
            is_auto_assigned=True,
            reason=f"Auto-assigned based on AI-detected type: {document_type}")
    
    logger.info(f"Document auto-assigned to {len(matching_folders)} folders")
```

#### 5. **Unified Table for All Folder Relationships**

Consolidate `document_shortcuts` and `document_folder_relationships` into single table:

```sql
-- Use only document_folder_relationships table
CREATE TABLE document_folder_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    folder_id UUID NOT NULL REFERENCES smart_folders(id),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    is_auto_assigned BOOLEAN DEFAULT false,
    assignment_reason TEXT,  -- e.g., "AI type match", "Keyword match", "Manual"
    matched_by TEXT,  -- 'document_type', 'content_type', 'keyword', 'manual'
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(document_id, folder_id)
);

-- Migrate existing document_shortcuts to document_folder_relationships
INSERT INTO document_folder_relationships (document_id, folder_id, is_auto_assigned, matched_by)
SELECT document_id, folder_id, true, 'auto_organize'
FROM document_shortcuts
ON CONFLICT DO NOTHING;

-- Then deprecate document_shortcuts table
```

---

### Implementation Tasks

#### Phase 1: Backend Unification (High Priority)

- [ ] **Task 1.1:** Create unified `UnifiedFolderMatchingService`
  - Combine logic from `organize_documents.py` and `auto_organize_service.py`
  - Primary matching by `document_type` from database
  - Secondary matching by `content_type` keywords
  - Fallback to text keyword matching

- [ ] **Task 1.2:** Update Smart Folder Creation
  - Add `document_types` field to `filter_rules`
  - Auto-populate related document types when creating folder
  - Query existing documents to find all matching types

- [ ] **Task 1.3:** Consolidate Database Tables
  - Use only `document_folder_relationships` table
  - Add `matched_by` and `assignment_reason` columns
  - Migrate data from `document_shortcuts`
  - Update all queries to use single table

- [ ] **Task 1.4:** Implement Auto-Assign on Upload
  - After document type detection, check for matching smart folders
  - Auto-assign with high confidence
  - Log assignment reason for audit

#### Phase 2: Frontend Updates (Medium Priority)

- [ ] **Task 2.1:** Update CreateFolderModal
  - Show available `document_types` from existing documents
  - Allow multi-select of document types
  - Show preview of documents that will match

- [ ] **Task 2.2:** Update Smart Folder Display
  - Show "AI Matched" badge for auto-assigned documents
  - Show match reason on hover
  - Display confidence score

- [ ] **Task 2.3:** Add Folder Type Suggestions
  - When typing folder name, suggest matching document_types
  - "You have 5 documents with type 'airtel-payment-receipt'"

#### Phase 3: Enhanced AI Features (Future)

- [ ] **Task 3.1:** Semantic Document Type Similarity
  - Use embeddings to find similar document types
  - "invoice" should match "tax-invoice", "hotel-invoice", etc.

- [ ] **Task 3.2:** Smart Folder Recommendations
  - Analyze user's documents and suggest folders
  - "You have 10 unorganized receipts. Create a 'Receipts' folder?"

- [ ] **Task 3.3:** Continuous Learning
  - Track manual corrections
  - Improve matching based on user feedback

---

### Code Changes Required

#### 1. New Unified Matching Service

**File:** `backend/app/services/unified_folder_matching.py`

```python
class UnifiedFolderMatchingService:
    """
    Unified service for matching documents to folders.
    Uses AI-detected document_type as primary matching criterion.
    """
    
    async def match_document_to_folders(
        self, 
        document_id: str, 
        exclude_already_assigned: bool = True
    ) -> List[FolderMatch]:
        """Find all folders that match a document."""
        document = await self.get_document_with_type(document_id)
        folders = await self.get_smart_folders_for_user(document.user_id)
        
        matches = []
        for folder in folders:
            match = self._evaluate_match(document, folder)
            if match.score >= 0.3:
                matches.append(match)
        
        return sorted(matches, key=lambda m: m.score, reverse=True)
    
    def _evaluate_match(self, document: Document, folder: SmartFolder) -> FolderMatch:
        """Evaluate how well a document matches a folder."""
        filter_rules = folder.filter_rules or {}
        
        # Priority 1: Direct document_type match (highest confidence)
        if self._matches_document_types(document, filter_rules):
            return FolderMatch(
                folder_id=folder.id,
                score=1.0,
                matched_by='document_type',
                reason=f"AI-detected type '{document.document_type}' matches folder criteria"
            )
        
        # Priority 2: Partial document_type match (content_type contains check)
        content_match = self._matches_content_type(document, filter_rules)
        if content_match:
            return FolderMatch(
                folder_id=folder.id,
                score=0.85,
                matched_by='content_type',
                reason=content_match
            )
        
        # Priority 3: Keyword matching (fallback)
        keyword_score = self._matches_keywords(document, filter_rules)
        if keyword_score >= 0.3:
            return FolderMatch(
                folder_id=folder.id,
                score=keyword_score,
                matched_by='keyword',
                reason="Matched by content keywords"
            )
        
        return FolderMatch(folder_id=folder.id, score=0, matched_by=None, reason=None)
    
    def _matches_document_types(self, document: Document, filter_rules: dict) -> bool:
        """Check if document's AI-detected type matches folder's document_types."""
        document_types = filter_rules.get('document_types', [])
        if not document_types:
            return False
        return document.document_type.lower() in [t.lower() for t in document_types]
    
    def _matches_content_type(self, document: Document, filter_rules: dict) -> Optional[str]:
        """Check if document_type contains any content_type keyword."""
        content_types = filter_rules.get('content_type', [])
        if not content_types:
            return None
        
        doc_type = document.document_type.lower()
        for ct in content_types:
            if ct.lower() in doc_type:
                return f"Document type '{doc_type}' contains '{ct}'"
        return None
```

#### 2. Update Smart Folder Model

**Add to `filter_rules` schema:**

```python
filter_rules_schema = {
    "document_types": {
        "type": "array",
        "items": {"type": "string"},
        "description": "AI-detected document types (from upload) - PRIMARY matching"
    },
    "content_type": {
        "type": "array", 
        "items": {"type": "string"},
        "description": "Content type keywords - SECONDARY matching"
    },
    "keywords": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Text keywords - FALLBACK matching"
    },
    "importance_score": {
        "type": "object",
        "properties": {"min": {"type": "number"}}
    },
    "days_old": {"type": "number"}
}
```

#### 3. Auto-Assign Hook on Upload

**File:** `backend/app/api/routes.py` (after document processing)

```python
@router.post("/process-document")
async def process_document(request: ProcessRequest):
    # ... existing processing code ...
    
    # After document is processed and saved
    if result.get('success') and result.get('document_id'):
        # Auto-assign to matching smart folders
        await unified_folder_service.auto_assign_document(
            document_id=result['document_id'],
            document_type=result.get('document_type')
        )
    
    return result
```

---

### Benefits of Unified Approach

| Aspect | Current State | After Improvement |
|--------|--------------|-------------------|
| **AI Usage** | Vision only at upload, ignored for folders | Vision type used for ALL folder matching |
| **Accuracy** | Low - keyword matching only | High - AI type + keywords |
| **Duplicate Prevention** | Partial | Full - checks document_types |
| **Auto-Organize** | Manual button click | Auto on upload + manual |
| **Database Tables** | 2 separate tables | 1 unified table |
| **Consistency** | Different logic for different methods | Same matching service |
| **User Experience** | Must manually organize | Documents auto-organized |

---

### Migration Path

1. **Week 1:** Create `UnifiedFolderMatchingService`, keep old services working
2. **Week 2:** Update `organize_documents.py` to use unified service
3. **Week 3:** Update `auto_organize_service.py` to use unified service
4. **Week 4:** Implement auto-assign on upload
5. **Week 5:** Migrate database tables, deprecate `document_shortcuts`
6. **Week 6:** Update frontend components

---

## Summary

**Key Insight:** You're already using Gemini Vision AI to detect `document_type` during upload and saving it to the database. BUT this AI-detected type is NOT being used for folder organization!

**The Fix:** Use `document_type` from the database as the PRIMARY matching criterion for ALL folder organization methods, unifying the logic into a single service.

This will:
- ✅ Leverage existing AI investment (Gemini Vision detection)
- ✅ Improve matching accuracy significantly
- ✅ Prevent duplicate folders
- ✅ Enable auto-assignment on upload
- ✅ Provide consistent behavior across all features
