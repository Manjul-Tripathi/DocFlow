import { useState, useEffect, useMemo } from 'react';
import type { Document, SortOrder } from '../types';

interface UseDocumentFilteringOptions {
  documents: Document[];
  searchQuery: string;
  selectedFolder: string;
  selectedTag: string;
  sortBy: string;
  sortOrder: SortOrder;
}

export function useDocumentFiltering({
  documents,
  searchQuery,
  selectedFolder,
  selectedTag,
  sortBy,
  sortOrder,
}: UseDocumentFilteringOptions) {
  const filteredDocuments = useMemo(() => {
    console.log('🔍 useDocumentFiltering: Input documents:', documents.length, 'selectedFolder:', selectedFolder);
    
    let filtered = documents.filter(doc => {
      const searchLower = searchQuery.toLowerCase();
      
      // Helper function to recursively search in any object structure
      const searchInObject = (obj: any, depth: number = 0): boolean => {
        if (!obj || depth > 5) return false; // Limit recursion depth
        
        if (typeof obj === 'string') {
          return obj.toLowerCase().includes(searchLower);
        }
        
        if (Array.isArray(obj)) {
          return obj.some(item => searchInObject(item, depth + 1));
        }
        
        if (typeof obj === 'object') {
          for (const key in obj) {
            if (key.startsWith('_')) continue; // Skip metadata keys like _keyOrder
            const value = obj[key];
            if (searchInObject(value, depth + 1)) {
              return true;
            }
          }
        }
        
        return false;
      };
      
      // Helper function to search in hierarchical data structure
      const searchInHierarchicalData = (data: any): boolean => {
        if (!data || typeof data !== 'object') return false;
        
        // Search in hierarchical_data (snake_case - database format)
        if (data.hierarchical_data && typeof data.hierarchical_data === 'object') {
          if (searchInObject(data.hierarchical_data)) return true;
        }
        
        // Search in hierarchicalData (camelCase - frontend format)
        if (data.hierarchicalData && typeof data.hierarchicalData === 'object') {
          if (searchInObject(data.hierarchicalData)) return true;
        }
        
        // Also search in extractedFields array if it exists
        if (Array.isArray(data.extractedFields)) {
          for (const field of data.extractedFields) {
            if (field.value && typeof field.value === 'string' && field.value.toLowerCase().includes(searchLower)) {
              return true;
            }
            if (field.label && typeof field.label === 'string' && field.label.toLowerCase().includes(searchLower)) {
              return true;
            }
          }
        }
        
        // Search in entire data object as fallback (for flat structures)
        return searchInObject(data);
      };
      
      const matchesSearch = searchQuery === '' || 
        // Search in file name
        doc.file_name.toLowerCase().includes(searchLower) ||
        // Search in extracted text content
        doc.extracted_text?.toLowerCase().includes(searchLower) ||
        // Search in hierarchical data structure (analysis_result)
        searchInHierarchicalData(doc.analysis_result) ||
        // Search in AI summary
        doc.insights?.summary?.toLowerCase().includes(searchLower) ||
        // Search in AI-generated title
        doc.insights?.ai_generated_title?.toLowerCase().includes(searchLower) ||
        // Search in key topics
        doc.insights?.key_topics?.some(topic => topic.toLowerCase().includes(searchLower)) ||
        // Search in tags
        doc.tags?.some(tag => tag.name.toLowerCase().includes(searchLower)) ||
        // Search in document type
        doc.file_type?.toLowerCase().includes(searchLower);

      // Debug: Log search results for non-empty queries
      if (searchQuery && searchQuery.length > 2) {
        const hasAnalysisResult = !!doc.analysis_result && Object.keys(doc.analysis_result).length > 0;
        if (hasAnalysisResult) {
          console.log(`🔎 Search "${searchQuery}" in doc "${doc.file_name}":`, {
            matchesSearch,
            hasAnalysisResult,
            analysisResultKeys: Object.keys(doc.analysis_result || {}),
            hasHierarchicalData: !!doc.analysis_result?.hierarchical_data,
            hasHierarchicalDataCamel: !!doc.analysis_result?.hierarchicalData
          });
        }
      }

      // When a specific folder is selected (not 'all', 'recycle-bin', or 'media-browser'),
      // the backend already filters documents, so we should not filter again on frontend
      const isSpecificFolderView = selectedFolder !== 'all' && 
        selectedFolder !== 'recycle-bin' && 
        selectedFolder !== 'media-browser';
      
      const matchesFolder = selectedFolder === 'all' || 
        selectedFolder === 'recycle-bin' ||
        selectedFolder === 'media-browser' ||
        isSpecificFolderView || // Backend already filtered, accept all
        doc.folders?.some(folder => folder.id === selectedFolder);

      const matchesTag = selectedTag === 'all' || 
        doc.tags?.some(tag => tag.id === selectedTag);

      return matchesSearch && matchesFolder && matchesTag;
    });

    // Sort documents
    filtered.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (sortBy) {
        case 'name':
          aValue = a.file_name.toLowerCase();
          bValue = b.file_name.toLowerCase();
          break;
        case 'size':
          aValue = a.file_size;
          bValue = b.file_size;
          break;
        case 'importance':
          aValue = a.insights?.importance_score || 0;
          bValue = b.insights?.importance_score || 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    console.log('🔍 useDocumentFiltering: Filtered documents:', filtered.length);
    return filtered;
  }, [documents, searchQuery, selectedFolder, selectedTag, sortBy, sortOrder]);

  return { filteredDocuments };
}
