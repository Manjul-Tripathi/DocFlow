import os
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

def load_env():
    """Loads environment variables from backend/.env file and returns them as a dict."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_file_path = os.path.join(backend_dir, ".env")
    
    # Load .env file
    load_dotenv(env_file_path)
    
    env_vars = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    }
    return env_vars

class OrganizeDocumentsService:
    def __init__(self):
        env_vars = load_env()
        if not env_vars["SUPABASE_URL"] or not env_vars["SUPABASE_SERVICE_ROLE_KEY"]:
            logger.warning("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env - OrganizeDocumentsService will be disabled")
            self.supabase = None
            return
        
        # Initialize Supabase client with error handling for version compatibility
        try:
            self.supabase: Client = create_client(
                env_vars["SUPABASE_URL"],
                env_vars["SUPABASE_SERVICE_ROLE_KEY"]
            )
            logger.info("✅ Supabase client initialized successfully for OrganizeDocumentsService")
        except TypeError as e:
            if "proxy" in str(e).lower():
                logger.error(f"Failed to initialize Supabase client: {e}")
                logger.error("This is likely a version compatibility issue between supabase-py and httpx/gotrue")
                logger.error("Try updating supabase-py: pip install --upgrade supabase")
                logger.warning("OrganizeDocumentsService will be disabled - document organization features will not work")
                self.supabase = None
            else:
                raise
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            logger.warning("OrganizeDocumentsService will be disabled - document organization features will not work")
            self.supabase = None

    async def organize_existing_documents(self, folder_id: str) -> Dict[str, Any]:
        """Organize existing documents into a smart folder."""
        if not self.supabase:
            raise RuntimeError("Supabase client not initialized. Document organization is disabled.")
        
        try:
            logger.info(f"Processing folder ID: {folder_id}")
            
            # Get smart folder details
            folder_response = self.supabase.from_('smart_folders').select(
                'id, name, user_id, is_smart, ai_criteria'
            ).eq('id', folder_id).eq('is_smart', True).execute()
            
            if not folder_response.data:
                raise Exception("Smart folder not found")
            
            folder = folder_response.data[0]
            logger.info(f"Processing smart folder: {folder['name']}")
            logger.info(f"AI Criteria: {folder['ai_criteria']}")
            
            # Get all documents that are already in ANY folder
            existing_relationships = self.supabase.from_('document_folder_relationships').select(
                'document_id'
            ).execute()
            
            documents_in_folders = set()
            if existing_relationships.data:
                documents_in_folders = {rel['document_id'] for rel in existing_relationships.data}
            
            logger.info(f"Found {len(documents_in_folders)} documents already in folders")
            
            # Get all documents for this user with their insights and analysis_result
            documents_response = self.supabase.from_('documents').select("""
                id,
                user_id,
                file_name,
                file_type,
                extracted_text,
                created_at,
                metadata,
                document_type,
                importance_score,
                analysis_result,
                document_insights (
                    importance_score,
                    key_topics,
                    document_type,
                    categories,
                    summary
                )
            """).eq('user_id', folder['user_id']).execute()
            
            # Check if we got data
            if not documents_response.data:
                logger.warning("No documents found for user")
                all_documents = []
            else:
                all_documents = documents_response.data
            
            # Filter out documents that are already in any folder
            documents = [doc for doc in all_documents if doc['id'] not in documents_in_folders]
            
            logger.info(f"Found {len(all_documents)} total documents, {len(documents)} not in any folder")
            
            organization_results = []
            documents_added = 0
            
            if documents:
                for document in documents:
                    try:
                        # Format document with insights
                        # Priority 1: Use document_insights table
                        # Priority 2: Use analysis_result (rich AI-extracted data)
                        # Priority 3: Fallback to document-level fields
                        insights_data = {}
                        if document.get('document_insights') and len(document['document_insights']) > 0:
                            insights_data = document['document_insights'][0]
                        elif document.get('analysis_result'):
                            # Use analysis_result as rich fallback (contains AI-extracted data)
                            analysis = document['analysis_result']
                            insights_data = {
                                "importance_score": analysis.get('importance_score', document.get('importance_score')),
                                "document_type": analysis.get('document_type', document.get('document_type')),
                                "summary": analysis.get('summary'),
                                "key_topics": analysis.get('key_topics', []),
                            }
                        else:
                            # Final fallback to basic document fields
                            insights_data = {
                                "importance_score": document.get('importance_score'),
                                "document_type": document.get('document_type'),
                            }
                        
                        formatted_document = {
                            **document,
                            "insights": insights_data
                        }
                        
                        match_result = self._matches_criteria(formatted_document, folder['ai_criteria'])
                        
                        doc_name = document.get('file_name', 'Unknown')
                        logger.info(f"Document \"{doc_name}\": matches={match_result['matches']}, confidence={match_result['confidence']:.2f}")
                        
                        if match_result['matches']:
                            # Insert relationship
                            try:
                                relationship_response = self.supabase.from_('document_folder_relationships').insert({
                                    "document_id": document['id'],
                                    "folder_id": folder_id,
                                    "confidence_score": match_result['confidence'],
                                    "is_auto_assigned": True,
                                    "assigned_reason": ', '.join(match_result['reasons'][:3]) if match_result['reasons'] else None
                                }).execute()
                                
                                documents_added += 1
                                organization_results.append({
                                    "documentId": document['id'],
                                    "documentName": doc_name,
                                    "confidence": match_result['confidence'],
                                    "reasons": match_result['reasons']
                                })
                                
                                logger.info(f"✓ Added document to folder: {doc_name} (confidence: {match_result['confidence'] * 100:.0f}%)")
                            except Exception as insert_error:
                                logger.error(f"Error inserting relationship for document {doc_name}: {str(insert_error)}")
                    except Exception as e:
                        doc_name = document.get('file_name', 'Unknown')
                        logger.error(f"Error processing document {doc_name}: {str(e)}")
                
                # Update folder document count
                if documents_added > 0:
                    try:
                        count_response = self.supabase.from_('smart_folders').update({
                            "document_count": documents_added
                        }).eq('id', folder_id).execute()
                    except Exception as count_error:
                        logger.error(f"Error updating folder document count: {str(count_error)}")
            
            logger.info(f"Organization complete. Added {documents_added} documents to folder \"{folder['name']}\".")
            
            return {
                "success": True,
                "folderId": folder_id,
                "folderName": folder['name'],
                "documentsEvaluated": len(documents),
                "documentsAdded": documents_added,
                "organizationResults": organization_results,
                "message": f"{documents_added} existing documents organized into \"{folder['name']}\""
            }
            
        except Exception as e:
            logger.error(f"Error in organize existing documents: {str(e)}")
            raise

    def _matches_criteria(self, document: Dict[str, Any], criteria: Dict[str, Any]) -> Dict[str, Any]:
        """Check if document matches smart folder criteria."""
        if not criteria:
            logger.debug("No criteria specified, document does not match")
            return {"matches": False, "confidence": 0, "reasons": []}
        
        total_score = 0
        max_score = 0
        reasons = []
        
        # Content Type Matching - only if content types are specified
        content_types = criteria.get('content_type', [])
        if content_types and isinstance(content_types, list) and len(content_types) > 0:
            max_score += 30
            content_types_lower = [t.lower() for t in content_types]
            document_text = (document.get('extracted_text') or '').lower()
            file_name = (document.get('file_name') or '').lower()
            document_type = (document.get('insights', {}).get('document_type') or '').lower()
            
            # Also check summary and key_topics from analysis_result
            summary = (document.get('insights', {}).get('summary') or '').lower()
            key_topics = document.get('insights', {}).get('key_topics') or []
            key_topics_text = ' '.join([str(topic).lower() for topic in key_topics if topic])
            
            content_match = False
            for content_type in content_types_lower:
                if (content_type in document_text or 
                    content_type in file_name or 
                    content_type in document_type or
                    content_type in summary or
                    content_type in key_topics_text):
                    content_match = True
                    reasons.append(f"Content type match: {content_type}")
                    break
            
            if content_match:
                total_score += 30
        
        # Importance Score Matching
        importance_score = criteria.get('importance_score')
        if importance_score and isinstance(importance_score, dict) and importance_score.get('min'):
            max_score += 25
            doc_importance = document.get('insights', {}).get('importance_score', 0)
            min_importance = importance_score['min']
            
            if doc_importance and doc_importance >= min_importance:
                total_score += 25
                reasons.append(f"Importance score {doc_importance * 100:.0f}% >= {min_importance * 100:.0f}%")
        
        # Age/Recency Matching
        if criteria.get('created_at') and criteria['created_at'].get('days'):
            max_score += 20
            doc_date = document.get('created_at')
            if doc_date:
                from datetime import datetime
                doc_date_obj = datetime.fromisoformat(doc_date.replace('Z', '+00:00'))
                days_ago = (datetime.now(doc_date_obj.tzinfo) - doc_date_obj).days
                max_days = criteria['created_at']['days']
                
                if days_ago <= max_days:
                    total_score += 20
                    reasons.append(f"Created within last {max_days} days ({days_ago} days ago)")
        
        # Days Old Matching (alternative format)
        days_old = criteria.get('days_old')
        if days_old and isinstance(days_old, (int, float)) and days_old > 0:
            max_score += 20
            doc_date = document.get('created_at')
            if doc_date:
                from datetime import datetime
                doc_date_obj = datetime.fromisoformat(doc_date.replace('Z', '+00:00'))
                days_ago = (datetime.now(doc_date_obj.tzinfo) - doc_date_obj).days
                
                if days_ago <= days_old:
                    total_score += 20
                    reasons.append(f"Created within last {days_old} days ({days_ago} days ago)")
        
        # Keywords Matching - only if keywords are specified
        keywords = criteria.get('keywords', [])
        if keywords and isinstance(keywords, list) and len(keywords) > 0:
            max_score += 25
            document_text = (document.get('extracted_text') or '').lower()
            file_name = (document.get('file_name') or '').lower()
            
            # Also search in summary and key_topics from analysis_result
            summary = (document.get('insights', {}).get('summary') or '').lower()
            key_topics = document.get('insights', {}).get('key_topics') or []
            key_topics_text = ' '.join([str(topic).lower() for topic in key_topics if topic])
            
            keyword_matches = 0
            
            for keyword in keywords:
                keyword_lower = keyword.lower()
                if (keyword_lower in document_text or 
                    keyword_lower in file_name or
                    keyword_lower in summary or
                    keyword_lower in key_topics_text):
                    keyword_matches += 1
                    reasons.append(f"Keyword match: {keyword}")
            
            if keyword_matches > 0:
                keyword_score = min(25, (keyword_matches / len(keywords)) * 25)
                total_score += keyword_score
        
        # If no criteria were actually specified (all empty), don't match
        if max_score == 0:
            logger.debug(f"No valid criteria specified for document {document.get('file_name', 'Unknown')}")
            return {"matches": False, "confidence": 0, "reasons": ["No criteria specified"]}
        
        # Calculate confidence as percentage
        confidence = (total_score / max_score) if max_score > 0 else 0
        matches = confidence >= 0.3  # Require at least 30% match
        
        logger.debug(f"Document {document.get('file_name', 'Unknown')}: score={total_score}/{max_score}, confidence={confidence:.2f}, matches={matches}")
        
        return {"matches": matches, "confidence": confidence, "reasons": reasons}
