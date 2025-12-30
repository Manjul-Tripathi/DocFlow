from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from app.core.auth import get_current_user
from app.core.supabase import supabase
import traceback

router = APIRouter(prefix="/api/rules", tags=["rules"])

# Models
class CreateRuleRequest(BaseModel):
    name: str
    description: Optional[str] = None
    file_types: Optional[List[str]] = []
    name_patterns: Optional[List[str]] = []
    content_keywords: Optional[List[str]] = []
    folder_ids: Optional[List[str]] = []
    size_min_bytes: Optional[int] = None
    size_max_bytes: Optional[int] = None
    
    # Auto actions
    auto_apply_permission: Optional[str] = None
    auto_apply_tags: Optional[List[str]] = []
    auto_move_to_folder: Optional[str] = None
    
    # Restrictions
    restrict_download: bool = False
    restrict_print: bool = False
    restrict_share: bool = False
    restrict_external_share: bool = False
    watermark_required: bool = False
    notify_on_match: bool = False
    
    is_active: bool = True
    priority: int = 100
    document_ids: Optional[List[str]] = []

class RuleResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    file_types: List[str]
    name_patterns: List[str]
    content_keywords: List[str]
    folder_ids: List[str]
    
    restrict_download: bool
    restrict_print: bool
    restrict_share: bool
    restrict_external_share: bool
    watermark_required: bool
    notify_on_match: bool
    
    auto_apply_permission: Optional[str]
    auto_apply_tags: List[str]
    auto_move_to_folder: Optional[str]
    
    is_active: bool
    priority: int
    created_at: str
    updated_at: str

class RuleStats(BaseModel):
    total: int
    active: int
    with_restrictions: int
    with_auto_actions: int

# Endpoints

@router.get("/", response_model=List[RuleResponse])
async def get_rules(current_user = Depends(get_current_user)):
    """Get all rules for the current user"""
    try:
        response = supabase.table('content_access_rules')\
            .select('*')\
            .eq('user_id', current_user.id)\
            .order('priority', desc=False)\
            .execute()
            
        return response.data
    except Exception as e:
        print(f"ERROR: Exception in get_rules: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats", response_model=RuleStats)
async def get_rule_stats(current_user = Depends(get_current_user)):
    """Get statistics about rules"""
    try:
        response = supabase.table('content_access_rules')\
            .select('*')\
            .eq('user_id', current_user.id)\
            .execute()
            
        rules = response.data
        
        total = len(rules)
        active = len([r for r in rules if r.get('is_active', False)])
        
        with_restrictions = len([
            r for r in rules 
            if r.get('restrict_download') or r.get('restrict_print') or r.get('restrict_share')
        ])
        
        with_auto_actions = len([
            r for r in rules
            if r.get('auto_move_to_folder') or (r.get('auto_apply_tags') and len(r.get('auto_apply_tags', [])) > 0)
        ])
        
        return {
            "total": total,
            "active": active,
            "with_restrictions": with_restrictions,
            "with_auto_actions": with_auto_actions
        }
    except Exception as e:
        print(f"ERROR: Exception in get_rule_stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/", response_model=RuleResponse)
async def create_rule(
    rule: CreateRuleRequest,
    current_user = Depends(get_current_user)
):
    """Create a new access rule"""
    try:
        rule_data = rule.dict()
        rule_data['user_id'] = current_user.id
        
        print(f"DEBUG: Creating rule for user {current_user.id}")
        print(f"DEBUG: Rule data: {rule_data}")
        
        response = supabase.table('content_access_rules').insert(rule_data).execute()
        
        print(f"DEBUG: Supabase response: {response}")
        
        if not response.data:
            print("ERROR: Response data is empty")
            raise HTTPException(status_code=500, detail="Failed to create rule - No data returned from DB")
        
        created_rule = response.data[0]
        
        # Trigger automatic matching for the new rule
        print(f"🔍 ATTEMPTING AUTO-MATCH for rule {created_rule['id']}")
        try:
            match_result = await match_documents_to_rule(created_rule['id'], current_user.id)
            print(f"✅ AUTO-MATCH COMPLETED: {match_result} documents matched")
        except Exception as match_error:
            print(f"❌ WARNING: Auto-matching failed: {match_error}")
            traceback.print_exc()
            # Don't fail the whole request if matching fails
            
        return created_rule
    except Exception as e:
        print(f"ERROR: Exception in create_rule: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backend Error: {str(e)}")

@router.put("/{rule_id}")
async def update_rule(
    rule_id: str,
    updates: Dict[str, Any],
    current_user = Depends(get_current_user)
):
    """Update a rule"""
    try:
        # Verify ownership
        check = supabase.table('content_access_rules').select('user_id').eq('id', rule_id).single().execute()
        if not check.data or check.data['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        response = supabase.table('content_access_rules').update(updates).eq('id', rule_id).execute()
        return response.data[0]
    except Exception as e:
        print(f"ERROR: Exception in update_rule: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    current_user = Depends(get_current_user)
):
    """Delete a rule"""
    try:
        # Verify ownership
        check = supabase.table('content_access_rules').select('user_id').eq('id', rule_id).single().execute()
        if not check.data or check.data['user_id'] != current_user.id:
            raise HTTPException(status_code=430, detail="Not authorized")
            
        supabase.table('content_access_rules').delete().eq('id', rule_id).execute()
        return {"success": True}
    except Exception as e:
        print(f"ERROR: Exception in delete_rule: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ToggleRuleRequest(BaseModel):
    is_active: bool


@router.post("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    toggle_data: ToggleRuleRequest,
    current_user = Depends(get_current_user)
):
    """Toggle a rule on/off and apply/remove its applications"""
    try:
        # Verify ownership
        check = supabase.table('content_access_rules').select('user_id').eq('id', rule_id).single().execute()
        if not check.data or check.data['user_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        is_active = toggle_data.is_active
        
        # Update the is_active status
        supabase.table('content_access_rules').update({'is_active': is_active}).eq('id', rule_id).execute()
        
        if is_active:
            # Rule is being enabled - re-apply to matching documents
            print(f"🔄 Rule {rule_id} enabled - applying to matching documents")
            matched_count = await match_documents_to_rule(rule_id, current_user.id)
            return {
                "success": True,
                "is_active": True,
                "action": "applied",
                "matched_count": matched_count,
                "message": f"Rule enabled and applied to {matched_count} document(s)"
            }
        else:
            # Rule is being disabled - remove all applications
            print(f"🔄 Rule {rule_id} disabled - removing applications")
            delete_result = supabase.table('content_rule_applications').delete().eq('rule_id', rule_id).execute()
            removed_count = len(delete_result.data) if delete_result.data else 0
            return {
                "success": True,
                "is_active": False,
                "action": "removed",
                "removed_count": removed_count,
                "message": f"Rule disabled and removed from {removed_count} document(s)"
            }
    except Exception as e:
        print(f"ERROR: Exception in toggle_rule: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def match_documents_to_rule(rule_id: str, user_id: str):
    """
    Automatically match documents to a rule based on matching criteria
    """
    print(f"🔍 match_documents_to_rule CALLED with rule_id={rule_id}, user_id={user_id}")
    try:
        # Get the rule
        print(f"📖 Fetching rule {rule_id}...")
        rule_response = supabase.table('content_access_rules').select('*').eq('id', rule_id).single().execute()
        if not rule_response.data:
            print(f"❌ Rule {rule_id} not found!")
            return 0
        
        rule = rule_response.data
        print(f"✅ Rule fetched: {rule['name']}, file_types={rule.get('file_types')}")
        
        # Get user's documents (exclude deleted/trashed)
        docs_response = supabase.table('documents')\
            .select('*')\
            .eq('user_id', user_id)\
            .is_('deleted_at', 'null')\
            .execute()
        documents = docs_response.data if docs_response.data else []
        
        print(f"📊 Found {len(documents)} active documents to check")
        
        matched_count = 0
        
        for doc in documents:
            is_match = True  # Start assuming match, then check each criterion
            matched_criteria = {}
            
            print(f"  🔍 Checking document: {doc.get('file_name')}")
            
            # ALL criteria must match (AND logic)
            
            # Check file type match - REQUIRED if specified
            if rule.get('file_types') and len(rule['file_types']) > 0:
                doc_extension = doc.get('file_type', '').replace('application/', '').replace('text/', '')
                print(f"    File type check: rule wants {rule['file_types']}, doc has '{doc_extension}'")
                file_type_matches = any(ft.lower() in doc_extension.lower() or doc_extension.lower() in ft.lower() for ft in rule['file_types'])
                if not file_type_matches:
                    print(f"    ❌ File type FAILED")
                    is_match = False
                    continue  # Skip this document
                print(f"    ✅ File type PASSED")
                matched_criteria['file_type'] = doc_extension
            
            # Check name pattern match - REQUIRED if specified
            if is_match and rule.get('name_patterns') and len(rule['name_patterns']) > 0:
                doc_name = doc.get('file_name', '').lower()
                print(f"    Name pattern check: rule wants {rule['name_patterns']}, doc name is '{doc_name}'")
                name_matches = any(pattern.lower() in doc_name for pattern in rule['name_patterns'])
                if not name_matches:
                    print(f"    ❌ Name pattern FAILED")
                    is_match = False
                    continue  # Skip this document
                print(f"    ✅ Name pattern PASSED")
                matched_criteria['name_patterns'] = rule['name_patterns']
            
            # Check content keywords - REQUIRED if specified
            if is_match and rule.get('content_keywords') and len(rule['content_keywords']) > 0:
                doc_content = doc.get('extracted_text', '').lower()
                # All keywords must be present in content
                keywords_match = all(keyword.lower() in doc_content for keyword in rule['content_keywords'])
                if not keywords_match:
                    is_match = False
                    continue  # Skip this document
                matched_criteria['content_keywords'] = rule['content_keywords']
            
            # Check size range - REQUIRED if specified
            if is_match and (rule.get('size_min_bytes') or rule.get('size_max_bytes')):
                doc_size = doc.get('file_size', 0)
                size_matches = True
                if rule.get('size_min_bytes') and doc_size < rule['size_min_bytes']:
                    size_matches = False
                if rule.get('size_max_bytes') and doc_size > rule['size_max_bytes']:
                    size_matches = False
                if not size_matches:
                    is_match = False
                    continue
                matched_criteria['size'] = doc_size
            
            # If document matches ALL criteria, create rule application
            if is_match:
                # Check if already applied
                existing = (supabase.table('content_rule_applications')
                    .select('id')
                    .eq('rule_id', rule_id)
                    .eq('document_id', doc['id'])
                    .execute())
                
                if not existing.data:
                    # Create new application
                    application = {
                        'rule_id': rule_id,
                        'document_id': doc['id'],
                        'matched_criteria': matched_criteria,
                        'actions_applied': {
                            'restrict_download': rule.get('restrict_download', False),
                            'restrict_print': rule.get('restrict_print', False),
                            'restrict_share': rule.get('restrict_share', False),
                            'restrict_external_share': rule.get('restrict_external_share', False),
                            'watermark_required': rule.get('watermark_required', False),
                        }
                    }
                    
                    supabase.table('content_rule_applications').insert(application).execute()
                    matched_count += 1
        
        print(f"✅ Rule {rule_id} matched {matched_count} documents")
        return matched_count
        
    except Exception as e:
        print(f"ERROR in match_documents_to_rule: {e}")
        traceback.print_exc()
        raise
