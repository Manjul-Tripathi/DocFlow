export interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  extracted_text: string;
  processing_status: string;
  metadata: Record<string, any>;
  analysis_result?: Record<string, any>;
  storage_url?: string | null;
  storage_path?: string;
  insights?: DocumentInsight;
  tags?: DocumentTag[];
  folders?: SmartFolder[];
}

export interface DocumentInsight {
  summary: string;
  key_topics: string[];
  importance_score: number;
  estimated_reading_time: number;
  ai_generated_title: string;
  suggested_actions: string[];
}

export interface DocumentTag {
  id: string;
  name: string;
  is_ai_suggested: boolean;
  confidence_score: number;
}

export interface SmartFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  document_count: number;
}

export interface DocumentStats {
  totalDocs: number;
  processedDocs: number;
  totalSize: string;
  avgImportance: string;
}

export type ViewMode = 'grid' | 'list';
export type SortOrder = 'asc' | 'desc';
