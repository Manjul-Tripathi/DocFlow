# Document Comparison History - Database Setup

## Overview
All document comparisons (version comparisons, document comparisons, and AI analyses) are now saved to the database in a single table called `comparison_history`.

## Setup Steps

### 1. Run the Migration
Execute the migration file to create the `comparison_history` table:

```bash
# Using Supabase CLI
supabase db push

# OR manually run the SQL file in your Supabase SQL Editor
```

**Migration file location:**
`supabase/migrations/20251222000000_create_ai_analysis_table.sql`

### 2. Restart Backend Server
The backend has been updated to use the new table. Restart your backend server:

```bash
cd backend
python run.py
```

## What Changed

### Database
- **New Table**: `comparison_history`
  - Stores all comparison types (version, document, ai)
  - Includes comparison data as JSONB
  - Stores AI analysis text when available
  - Proper RLS policies for user isolation

### Backend (`backend/app/api/ai_routes.py`)
- Updated to use `comparison_history` table instead of `ai_analysis_results`
- New endpoint: `POST /api/ai/save-comparison` - Save comparisons without AI
- Updated endpoint: `POST /api/ai/analyze` - Saves AI analysis to database
- Updated endpoint: `GET /api/ai/history/{user_id}` - Returns all comparisons
- New endpoint: `DELETE /api/ai/history/{comparison_id}` - Delete comparison

### Frontend (`src/components/document-comparison/ComparisonDashboard.tsx`)
- **Removed**: localStorage for comparison history
- **Added**: Database-backed history loading on mount
- **Updated**: All comparison saves now go to database
- **Updated**: AI analysis automatically saved by backend
- **Added**: Auto-refresh history after AI analysis

## Features

### Version Comparisons
- Saved to database with full comparison data
- Can be replayed from history
- Includes version IDs for reference

### Document Comparisons
- Saved to database with comparison results
- Stores both document IDs
- Full diff data preserved

### AI Analysis
- **Cached**: If you run AI analysis on the same version comparison twice, it returns the cached result
- **Persistent**: AI analysis text is stored in the database
- **History**: Shows with a special "AI" badge in the history list
- **Replay**: Clicking on an AI analysis history item shows the saved analysis

## API Endpoints

### Save Comparison (without AI)
```
POST /api/ai/save-comparison
Body: {
  user_id: string,
  document_name: string,
  comparison_type: "version" | "document",
  base_version: string,
  compare_version: string,
  changes_count: number,
  base_version_id?: string,
  compare_version_id?: string,
  doc1_id?: string,
  doc2_id?: string,
  comparison_data?: object
}
```

### Run AI Analysis (saves automatically)
```
POST /api/ai/analyze
Body: {
  prompt: string,
  context: string,
  user_id: string,
  document_id?: string,
  document_name?: string,
  comparison_type: "ai",
  base_version: string,
  compare_version: string,
  base_version_id: string,
  compare_version_id: string,
  changes_count: number,
  comparison_data?: object
}
```

### Get Comparison History
```
GET /api/ai/history/{user_id}?limit=50
```

### Get Specific Comparison
```
GET /api/ai/analysis/{comparison_id}?user_id={user_id}
```

### Delete Comparison
```
DELETE /api/ai/history/{comparison_id}?user_id={user_id}
```

## Benefits

1. **Persistent History**: No longer lost when clearing browser cache
2. **Cross-Device**: Access comparison history from any device
3. **AI Caching**: Reuse previous AI analyses without extra API calls
4. **Full Data**: Complete comparison data stored for replay
5. **Performance**: Database indexing for fast queries
6. **Security**: Row Level Security ensures users only see their own comparisons

## Verification

After running the migration, verify the table was created:

```sql
SELECT * FROM comparison_history LIMIT 10;
```

Test by:
1. Comparing two document versions
2. Running AI analysis
3. Refreshing the page - history should persist
4. Clicking on a history item to replay the comparison
