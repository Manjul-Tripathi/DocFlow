"""
Version Comparison Service
Handles comparison between document versions using analysis_result when available
"""
import json
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

class VersionComparisonService:
    """Service for comparing document versions with structured analysis"""

    @staticmethod
    def _extract_text_from_analysis(analysis: Dict[str, Any]) -> str:
        """
        Extract readable text from analysis_result JSON structure.
        This handles legacy data where v1 stored JSON but later versions store plain text.
        """
        text_parts = []
        
        # Try to extract from hierarchical_data
        if 'hierarchical_data' in analysis:
            hierarchical = analysis['hierarchical_data']
            for section_name, section_data in hierarchical.items():
                if isinstance(section_data, dict):
                    text_parts.append(f"[{section_name}]")
                    for field_name, field_value in section_data.items():
                        if field_value and isinstance(field_value, str) and len(field_value) < 500:
                            text_parts.append(f"{field_name}: {field_value}")
                        elif field_value and not isinstance(field_value, str):
                            text_parts.append(f"{field_name}: {str(field_value)[:100]}")
        
        # Try to extract from raw_text
        if 'raw_text' in analysis:
            text_parts.append(analysis['raw_text'])
        
        # Try to extract from fields array
        if 'fields' in analysis and isinstance(analysis['fields'], list):
            for field in analysis['fields']:
                if isinstance(field, dict):
                    name = field.get('name', field.get('key', ''))
                    value = field.get('value', '')
                    if name and value:
                        text_parts.append(f"{name}: {value}")
        
        return '\n'.join(text_parts) if text_parts else str(analysis)

    @staticmethod
    def compare_versions(version1_content: str, version2_content: str) -> Dict[str, Any]:
        """
        Compare two version contents and return structured differences
        
        Args:
            version1_content: Content from document_versions.content (could be JSON analysis_result or plain text)
            version2_content: Content from document_versions.content (could be JSON analysis_result or plain text)
            
        Returns:
            Dictionary with comparison results, changes summary, and detailed differences
        """
        try:
            # Try to parse both as JSON
            analysis1 = None
            analysis2 = None
            text1 = version1_content
            text2 = version2_content
            
            try:
                analysis1 = json.loads(version1_content)
            except (json.JSONDecodeError, TypeError):
                pass
                
            try:
                analysis2 = json.loads(version2_content)
            except (json.JSONDecodeError, TypeError):
                pass
            
            # Both are structured analysis results - do semantic comparison
            if analysis1 is not None and analysis2 is not None:
                logger.info("Both versions are JSON - doing structured comparison")
                return VersionComparisonService._compare_analysis_results(analysis1, analysis2)
            
            # Mixed format: one is JSON, one is plain text
            # Extract text from JSON for fair comparison
            if analysis1 is not None and analysis2 is None:
                logger.info("v1 is JSON, v2 is text - extracting text from JSON for comparison")
                text1 = VersionComparisonService._extract_text_from_analysis(analysis1)
                text2 = version2_content
            elif analysis1 is None and analysis2 is not None:
                logger.info("v1 is text, v2 is JSON - extracting text from JSON for comparison")
                text1 = version1_content
                text2 = VersionComparisonService._extract_text_from_analysis(analysis2)
            
            # Do plain text comparison
            return VersionComparisonService._compare_plain_text(text1, text2)
                
        except Exception as e:
            logger.error(f"Error comparing versions: {e}")
            return {
                "comparison_type": "error",
                "error": str(e),
                "changes_summary": "Comparison failed",
                "total_changes": 0,
                "changes": []
            }

    @staticmethod
    def _compare_analysis_results(analysis1: Dict[str, Any], analysis2: Dict[str, Any]) -> Dict[str, Any]:
        """Compare two structured analysis results"""
        changes = []
        
        # Compare hierarchical_data if available
        if 'hierarchical_data' in analysis1 and 'hierarchical_data' in analysis2:
            hierarchical_changes = VersionComparisonService._compare_hierarchical_data(
                analysis1['hierarchical_data'], 
                analysis2['hierarchical_data']
            )
            changes.extend(hierarchical_changes)
        
        # Compare fields array if available
        if 'fields' in analysis1 and 'fields' in analysis2:
            field_changes = VersionComparisonService._compare_fields_array(
                analysis1['fields'], 
                analysis2['fields']
            )
            changes.extend(field_changes)
        
        # Generate summary
        changes_summary = VersionComparisonService._generate_changes_summary(changes)
        
        return {
            "comparison_type": "structured",
            "changes_summary": changes_summary,
            "total_changes": len(changes),
            "changes": changes,
            "analysis1_template": analysis1.get('template_used', 'Unknown'),
            "analysis2_template": analysis2.get('template_used', 'Unknown'),
            "confidence1": analysis1.get('confidence', 0),
            "confidence2": analysis2.get('confidence', 0)
        }

    @staticmethod
    def _compare_hierarchical_data(data1: Dict[str, Any], data2: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Compare hierarchical_data structures"""
        changes = []
        
        # Get all sections from both versions
        all_sections = set(data1.keys()) | set(data2.keys())
        
        for section_name in all_sections:
            section1 = data1.get(section_name, {})
            section2 = data2.get(section_name, {})
            
            if section_name not in data1:
                changes.append({
                    "type": "section_added",
                    "section": section_name,
                    "change": f"Section '{section_name}' was added",
                    "value_before": None,
                    "value_after": section2
                })
                continue
                
            if section_name not in data2:
                changes.append({
                    "type": "section_removed",
                    "section": section_name,
                    "change": f"Section '{section_name}' was removed",
                    "value_before": section1,
                    "value_after": None
                })
                continue
            
            # Compare fields within the section
            if isinstance(section1, dict) and isinstance(section2, dict):
                all_fields = set(section1.keys()) | set(section2.keys())
                
                for field_name in all_fields:
                    field1 = section1.get(field_name)
                    field2 = section2.get(field_name)
                    
                    if field_name not in section1:
                        changes.append({
                            "type": "field_added",
                            "section": section_name,
                            "field": field_name,
                            "change": f"Field '{field_name}' added in section '{section_name}'",
                            "value_before": None,
                            "value_after": field2
                        })
                    elif field_name not in section2:
                        changes.append({
                            "type": "field_removed",
                            "section": section_name,
                            "field": field_name,
                            "change": f"Field '{field_name}' removed from section '{section_name}'",
                            "value_before": field1,
                            "value_after": None
                        })
                    elif field1 != field2:
                        # Skip very long values (likely base64 data)
                        if (isinstance(field1, str) and len(field1) > 200) or (isinstance(field2, str) and len(field2) > 200):
                            changes.append({
                                "type": "field_modified",
                                "section": section_name,
                                "field": field_name,
                                "change": f"Field '{field_name}' changed in section '{section_name}' (content too large to display)",
                                "value_before": f"[{type(field1).__name__}]",
                                "value_after": f"[{type(field2).__name__}]"
                            })
                        else:
                            changes.append({
                                "type": "field_modified",
                                "section": section_name,
                                "field": field_name,
                                "change": f"Field '{field_name}' changed in section '{section_name}': '{field1}' → '{field2}'",
                                "value_before": field1,
                                "value_after": field2
                            })
        
        return changes

    @staticmethod
    def _compare_fields_array(fields1: List[Dict[str, Any]], fields2: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Compare fields arrays"""
        changes = []
        
        # Create lookup dictionaries by field name
        fields1_dict = {field.get('name', field.get('key', f'field_{i}')): field for i, field in enumerate(fields1)}
        fields2_dict = {field.get('name', field.get('key', f'field_{i}')): field for i, field in enumerate(fields2)}
        
        all_field_names = set(fields1_dict.keys()) | set(fields2_dict.keys())
        
        for field_name in all_field_names:
            field1 = fields1_dict.get(field_name)
            field2 = fields2_dict.get(field_name)
            
            if field1 is None:
                changes.append({
                    "type": "field_added",
                    "field": field_name,
                    "change": f"Field '{field_name}' was added",
                    "value_before": None,
                    "value_after": field2.get('value', field2)
                })
            elif field2 is None:
                changes.append({
                    "type": "field_removed",
                    "field": field_name,
                    "change": f"Field '{field_name}' was removed",
                    "value_before": field1.get('value', field1),
                    "value_after": None
                })
            else:
                value1 = field1.get('value', field1)
                value2 = field2.get('value', field2)
                
                if value1 != value2:
                    changes.append({
                        "type": "field_modified",
                        "field": field_name,
                        "change": f"Field '{field_name}' changed: '{value1}' → '{value2}'",
                        "value_before": value1,
                        "value_after": value2
                    })
        
        return changes

    @staticmethod
    def _compare_plain_text(text1: str, text2: str) -> Dict[str, Any]:
        """Compare two plain text versions (fallback)"""
        # Simple line-by-line comparison
        lines1 = text1.split('\n') if text1 else []
        lines2 = text2.split('\n') if text2 else []
        
        # Count added/removed/changed lines
        added_lines = len(lines2) - len(lines1) if len(lines2) > len(lines1) else 0
        removed_lines = len(lines1) - len(lines2) if len(lines1) > len(lines2) else 0
        
        return {
            "comparison_type": "text",
            "changes_summary": f"{added_lines} lines added, {removed_lines} lines removed",
            "total_changes": added_lines + removed_lines,
            "lines_before": len(lines1),
            "lines_after": len(lines2),
            "changes": [
                {
                    "type": "text_summary",
                    "change": f"Text changed from {len(lines1)} lines to {len(lines2)} lines",
                    "lines_added": added_lines,
                    "lines_removed": removed_lines
                }
            ]
        }

    @staticmethod
    def _generate_changes_summary(changes: List[Dict[str, Any]]) -> str:
        """Generate a human-readable summary of changes"""
        if not changes:
            return "No changes detected"
        
        added = len([c for c in changes if c['type'].endswith('_added')])
        removed = len([c for c in changes if c['type'].endswith('_removed')])
        modified = len([c for c in changes if c['type'].endswith('_modified')])
        
        summary_parts = []
        if added > 0:
            summary_parts.append(f"{added} field{'s' if added != 1 else ''} added")
        if removed > 0:
            summary_parts.append(f"{removed} field{'s' if removed != 1 else ''} removed")
        if modified > 0:
            summary_parts.append(f"{modified} field{'s' if modified != 1 else ''} modified")
        
        return ", ".join(summary_parts) if summary_parts else f"{len(changes)} changes"