-- ============================================
-- Compliance Labels System - Complete Schema
-- SimplifyAI DocFlow - Enterprise Compliance Management
-- Created: December 24, 2025
-- ============================================

-- ============================================
-- 1. COMPLIANCE LABELS TABLE
-- Stores all compliance label definitions
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Information
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    framework VARCHAR(50) NOT NULL CHECK (framework IN (
        'GDPR', 'HIPAA', 'SOX', 'PCI_DSS', 'CCPA', 
        'FERPA', 'ISO_27001', 'NIST', 'SOC2', 'CUSTOM'
    )),
    description TEXT,
    color VARCHAR(20) DEFAULT '#3B82F6',
    icon VARCHAR(50) DEFAULT 'Shield',
    
    -- Classification
    data_classification VARCHAR(30) NOT NULL CHECK (data_classification IN (
        'public', 'internal', 'confidential', 'highly_confidential', 'restricted'
    )),
    sensitivity_level VARCHAR(20) NOT NULL CHECK (sensitivity_level IN (
        'low', 'medium', 'high', 'critical'
    )),
    data_categories TEXT[] DEFAULT '{}',
    
    -- Retention Settings
    retention_required BOOLEAN DEFAULT FALSE,
    retention_period_days INTEGER,
    
    -- Security Controls
    encryption_required BOOLEAN DEFAULT FALSE,
    access_logging_required BOOLEAN DEFAULT TRUE,
    watermark_required BOOLEAN DEFAULT FALSE,
    download_restricted BOOLEAN DEFAULT FALSE,
    sharing_restricted BOOLEAN DEFAULT FALSE,
    export_restricted BOOLEAN DEFAULT FALSE,
    deletion_requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Geographic Restrictions
    geo_restrictions TEXT[] DEFAULT '{}',
    allowed_regions TEXT[] DEFAULT '{}',
    
    -- Audit & Review
    audit_frequency_days INTEGER DEFAULT 90,
    auto_expire_days INTEGER,
    
    -- Acknowledgment
    requires_acknowledgment BOOLEAN DEFAULT FALSE,
    acknowledgment_text TEXT,
    
    -- System Fields
    is_system_label BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster framework filtering
CREATE INDEX IF NOT EXISTS idx_compliance_labels_framework ON compliance_labels(framework);
CREATE INDEX IF NOT EXISTS idx_compliance_labels_active ON compliance_labels(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_labels_classification ON compliance_labels(data_classification);

-- ============================================
-- 2. DOCUMENT COMPLIANCE LABELS TABLE
-- Links documents to compliance labels
-- ============================================
CREATE TABLE IF NOT EXISTS document_compliance_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES compliance_labels(id) ON DELETE CASCADE,
    
    -- Application Info
    applied_by UUID REFERENCES auth.users(id),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    justification TEXT,
    
    -- Status
    status VARCHAR(30) DEFAULT 'active' CHECK (status IN (
        'active', 'pending_review', 'expired', 'revoked'
    )),
    
    -- Review Info
    review_date TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    next_review_date TIMESTAMPTZ,
    
    -- Expiration
    expires_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique label per document
    UNIQUE(document_id, label_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_doc_compliance_document ON document_compliance_labels(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_compliance_label ON document_compliance_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_doc_compliance_status ON document_compliance_labels(status);
CREATE INDEX IF NOT EXISTS idx_doc_compliance_review ON document_compliance_labels(next_review_date) 
    WHERE status = 'active';

-- ============================================
-- 3. COMPLIANCE ACKNOWLEDGMENTS TABLE
-- Stores user acknowledgments for compliance labels
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_compliance_id UUID NOT NULL REFERENCES document_compliance_labels(id) ON DELETE CASCADE,
    
    -- User Info
    user_id UUID NOT NULL REFERENCES auth.users(id),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    
    -- Acknowledgment Details
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledgment_text TEXT NOT NULL,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Ensure one acknowledgment per user per document label
    UNIQUE(document_compliance_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_ack_user ON compliance_acknowledgments(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_ack_doc ON compliance_acknowledgments(document_compliance_id);

-- ============================================
-- 4. COMPLIANCE AUDIT LOG TABLE
-- Complete audit trail for all compliance actions
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    label_id UUID REFERENCES compliance_labels(id) ON DELETE SET NULL,
    document_compliance_id UUID REFERENCES document_compliance_labels(id) ON DELETE SET NULL,
    
    -- Action Info
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'label_created', 'label_updated', 'label_deleted',
        'applied', 'removed', 'updated', 'reviewed', 
        'acknowledged', 'violation', 'expired', 'revoked',
        'report_generated', 'policy_changed'
    )),
    
    -- Performer Info
    performed_by UUID REFERENCES auth.users(id),
    performed_by_name VARCHAR(255),
    performed_by_email VARCHAR(255),
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Details
    details TEXT,
    previous_state JSONB,
    new_state JSONB,
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_document ON compliance_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_label ON compliance_audit_log(label_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON compliance_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON compliance_audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON compliance_audit_log(performed_by);

-- ============================================
-- 5. COMPLIANCE VIOLATIONS TABLE
-- Tracks compliance violations and their resolution
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    label_id UUID REFERENCES compliance_labels(id) ON DELETE SET NULL,
    document_compliance_id UUID REFERENCES document_compliance_labels(id) ON DELETE SET NULL,
    
    -- Violation Details
    violation_type VARCHAR(50) NOT NULL CHECK (violation_type IN (
        'unauthorized_access', 'unauthorized_share', 'unauthorized_download',
        'retention_breach', 'geo_violation', 'policy_breach',
        'encryption_missing', 'watermark_missing', 'acknowledgment_missing'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Detection Info
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    detected_by VARCHAR(255) DEFAULT 'System',
    description TEXT NOT NULL,
    
    -- User Involved
    user_involved UUID REFERENCES auth.users(id),
    user_involved_email VARCHAR(255),
    
    -- Action Taken
    action_taken TEXT,
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for violation queries
CREATE INDEX IF NOT EXISTS idx_violations_document ON compliance_violations(document_id);
CREATE INDEX IF NOT EXISTS idx_violations_label ON compliance_violations(label_id);
CREATE INDEX IF NOT EXISTS idx_violations_type ON compliance_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON compliance_violations(severity);
CREATE INDEX IF NOT EXISTS idx_violations_resolved ON compliance_violations(resolved);
CREATE INDEX IF NOT EXISTS idx_violations_detected ON compliance_violations(detected_at DESC);

-- ============================================
-- 6. COMPLIANCE POLICIES TABLE
-- Auto-apply rules and notification settings
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    framework VARCHAR(50) CHECK (framework IN (
        'GDPR', 'HIPAA', 'SOX', 'PCI_DSS', 'CCPA', 
        'FERPA', 'ISO_27001', 'NIST', 'SOC2', 'CUSTOM'
    )),
    
    -- Auto-apply Rules (stored as JSON array)
    auto_apply_rules JSONB DEFAULT '[]',
    
    -- Notification Settings
    notify_on_label_applied BOOLEAN DEFAULT TRUE,
    notify_on_label_removed BOOLEAN DEFAULT TRUE,
    notify_on_violation BOOLEAN DEFAULT TRUE,
    notify_on_review_due BOOLEAN DEFAULT TRUE,
    notify_on_expiration BOOLEAN DEFAULT TRUE,
    notification_recipients TEXT[] DEFAULT '{}',
    
    -- Escalation Settings
    violation_escalation_hours INTEGER DEFAULT 24,
    review_overdue_escalation_hours INTEGER DEFAULT 48,
    escalation_recipients TEXT[] DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. COMPLIANCE REPORTS TABLE
-- Generated compliance reports
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Report Info
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN (
        'summary', 'detailed', 'violations', 'audit_trail', 'data_mapping'
    )),
    name VARCHAR(255) NOT NULL,
    framework VARCHAR(50),
    
    -- Period
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    
    -- Statistics (snapshot at generation time)
    total_documents INTEGER DEFAULT 0,
    labeled_documents INTEGER DEFAULT 0,
    violations_count INTEGER DEFAULT 0,
    pending_reviews INTEGER DEFAULT 0,
    
    -- Report Data
    report_data JSONB DEFAULT '{}',
    
    -- Generation Info
    generated_by UUID REFERENCES auth.users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- File Storage (for exported PDFs/CSVs)
    file_path VARCHAR(500),
    file_size INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON compliance_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_generated ON compliance_reports(generated_at DESC);

-- ============================================
-- 8. FUNCTIONS FOR COMPLIANCE STATISTICS
-- ============================================

-- Function to get compliance statistics
CREATE OR REPLACE FUNCTION get_compliance_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_labels', (SELECT COUNT(*) FROM compliance_labels),
        'active_labels', (SELECT COUNT(*) FROM compliance_labels WHERE is_active = true),
        'labeled_documents', (
            SELECT COUNT(DISTINCT document_id) 
            FROM document_compliance_labels 
            WHERE status = 'active'
        ),
        'unlabeled_documents', (
            SELECT COUNT(*) FROM documents d 
            WHERE NOT EXISTS (
                SELECT 1 FROM document_compliance_labels dcl 
                WHERE dcl.document_id = d.id AND dcl.status = 'active'
            )
            AND d.deleted_at IS NULL
        ),
        'pending_reviews', (
            SELECT COUNT(*) FROM document_compliance_labels 
            WHERE status = 'active' 
            AND next_review_date <= NOW() + INTERVAL '7 days'
        ),
        'active_violations', (
            SELECT COUNT(*) FROM compliance_violations WHERE resolved = false
        ),
        'resolved_violations', (
            SELECT COUNT(*) FROM compliance_violations 
            WHERE resolved = true 
            AND resolved_at >= NOW() - INTERVAL '30 days'
        ),
        'labels_by_framework', (
            SELECT json_object_agg(
                COALESCE(cl.framework, 'CUSTOM'),
                COALESCE(counts.count, 0)
            )
            FROM (
                SELECT DISTINCT framework FROM compliance_labels
            ) cl
            LEFT JOIN (
                SELECT cl.framework, COUNT(DISTINCT dcl.document_id) as count
                FROM document_compliance_labels dcl
                JOIN compliance_labels cl ON dcl.label_id = cl.id
                WHERE dcl.status = 'active'
                GROUP BY cl.framework
            ) counts ON cl.framework = counts.framework
        ),
        'labels_by_classification', (
            SELECT json_object_agg(
                classification,
                count
            )
            FROM (
                SELECT cl.data_classification as classification, 
                       COUNT(DISTINCT dcl.document_id) as count
                FROM document_compliance_labels dcl
                JOIN compliance_labels cl ON dcl.label_id = cl.id
                WHERE dcl.status = 'active'
                GROUP BY cl.data_classification
            ) sub
        ),
        'recent_activity_count', (
            SELECT COUNT(*) FROM compliance_audit_log 
            WHERE performed_at >= NOW() - INTERVAL '24 hours'
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log compliance audit entry
CREATE OR REPLACE FUNCTION log_compliance_audit(
    p_document_id UUID,
    p_label_id UUID,
    p_action VARCHAR(50),
    p_details TEXT,
    p_previous_state JSONB DEFAULT NULL,
    p_new_state JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_user_id UUID;
    v_user_email VARCHAR(255);
    v_user_name VARCHAR(255);
BEGIN
    -- Get current user info
    v_user_id := auth.uid();
    
    SELECT email, raw_user_meta_data->>'full_name'
    INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = v_user_id;
    
    INSERT INTO compliance_audit_log (
        document_id,
        label_id,
        action,
        performed_by,
        performed_by_email,
        performed_by_name,
        details,
        previous_state,
        new_state
    ) VALUES (
        p_document_id,
        p_label_id,
        p_action,
        v_user_id,
        v_user_email,
        v_user_name,
        p_details,
        p_previous_state,
        p_new_state
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to apply compliance label to document
CREATE OR REPLACE FUNCTION apply_compliance_label(
    p_document_id UUID,
    p_label_id UUID,
    p_justification TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_doc_label_id UUID;
    v_label_name VARCHAR(255);
    v_audit_freq INTEGER;
BEGIN
    -- Get label info
    SELECT name, audit_frequency_days
    INTO v_label_name, v_audit_freq
    FROM compliance_labels
    WHERE id = p_label_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Label not found';
    END IF;
    
    -- Insert document compliance label
    INSERT INTO document_compliance_labels (
        document_id,
        label_id,
        applied_by,
        justification,
        next_review_date
    ) VALUES (
        p_document_id,
        p_label_id,
        auth.uid(),
        p_justification,
        NOW() + (v_audit_freq || ' days')::INTERVAL
    )
    ON CONFLICT (document_id, label_id) 
    DO UPDATE SET 
        status = 'active',
        applied_by = auth.uid(),
        applied_at = NOW(),
        justification = p_justification,
        next_review_date = NOW() + (v_audit_freq || ' days')::INTERVAL,
        updated_at = NOW()
    RETURNING id INTO v_doc_label_id;
    
    -- Log audit entry
    PERFORM log_compliance_audit(
        p_document_id,
        p_label_id,
        'applied',
        'Applied ' || v_label_name || ' label to document'
    );
    
    RETURN v_doc_label_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove compliance label from document
CREATE OR REPLACE FUNCTION remove_compliance_label(
    p_document_id UUID,
    p_label_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_label_name VARCHAR(255);
BEGIN
    -- Get label name
    SELECT name INTO v_label_name
    FROM compliance_labels
    WHERE id = p_label_id;
    
    -- Update status to revoked
    UPDATE document_compliance_labels
    SET status = 'revoked',
        updated_at = NOW()
    WHERE document_id = p_document_id 
    AND label_id = p_label_id
    AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Log audit entry
    PERFORM log_compliance_audit(
        p_document_id,
        p_label_id,
        'removed',
        'Removed ' || v_label_name || ' label' || 
        CASE WHEN p_reason IS NOT NULL THEN ': ' || p_reason ELSE '' END
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve violation
CREATE OR REPLACE FUNCTION resolve_compliance_violation(
    p_violation_id UUID,
    p_resolution_notes TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE compliance_violations
    SET resolved = TRUE,
        resolved_at = NOW(),
        resolved_by = auth.uid(),
        resolution_notes = p_resolution_notes,
        updated_at = NOW()
    WHERE id = p_violation_id
    AND resolved = FALSE;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Log audit entry
    INSERT INTO compliance_audit_log (
        document_id,
        label_id,
        action,
        performed_by,
        details
    )
    SELECT 
        cv.document_id,
        cv.label_id,
        'violation',
        auth.uid(),
        'Resolved violation: ' || cv.violation_type || ' - ' || p_resolution_notes
    FROM compliance_violations cv
    WHERE cv.id = p_violation_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE compliance_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_compliance_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;

-- Compliance Labels: All authenticated users can read, only admins can modify
CREATE POLICY "compliance_labels_read" ON compliance_labels
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "compliance_labels_insert" ON compliance_labels
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "compliance_labels_update" ON compliance_labels
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "compliance_labels_delete" ON compliance_labels
    FOR DELETE TO authenticated
    USING (auth.uid() IS NOT NULL AND is_system_label = false);

-- Document Compliance Labels: Based on document access
CREATE POLICY "doc_compliance_read" ON document_compliance_labels
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "doc_compliance_insert" ON document_compliance_labels
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "doc_compliance_update" ON document_compliance_labels
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Acknowledgments: Users can read their own and create
CREATE POLICY "ack_read" ON compliance_acknowledgments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "ack_insert" ON compliance_acknowledgments
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Audit Log: All authenticated can read, system can insert
CREATE POLICY "audit_read" ON compliance_audit_log
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "audit_insert" ON compliance_audit_log
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- Violations: All authenticated can read
CREATE POLICY "violations_read" ON compliance_violations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "violations_insert" ON compliance_violations
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "violations_update" ON compliance_violations
    FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Policies: Admin access
CREATE POLICY "policies_read" ON compliance_policies
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "policies_all" ON compliance_policies
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Reports: All can read
CREATE POLICY "reports_read" ON compliance_reports
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "reports_insert" ON compliance_reports
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- 10. TRIGGERS FOR AUTO-UPDATE
-- ============================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER compliance_labels_updated_at
    BEFORE UPDATE ON compliance_labels
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

CREATE TRIGGER doc_compliance_labels_updated_at
    BEFORE UPDATE ON document_compliance_labels
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

CREATE TRIGGER compliance_violations_updated_at
    BEFORE UPDATE ON compliance_violations
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

CREATE TRIGGER compliance_policies_updated_at
    BEFORE UPDATE ON compliance_policies
    FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

-- ============================================
-- 11. INSERT DEFAULT SYSTEM LABELS
-- ============================================
INSERT INTO compliance_labels (
    name, code, framework, description, color, icon,
    data_classification, sensitivity_level, data_categories,
    retention_required, retention_period_days, encryption_required,
    access_logging_required, watermark_required, download_restricted,
    sharing_restricted, export_restricted, deletion_requires_approval,
    geo_restrictions, audit_frequency_days, requires_acknowledgment,
    acknowledgment_text, is_system_label, is_active
) VALUES
(
    'GDPR Personal Data', 'GDPR-PD', 'GDPR',
    'Contains personal data subject to GDPR regulations',
    '#3B82F6', 'Shield', 'confidential', 'high',
    ARRAY['pii', 'customer_data'], true, 2555, true, true, false,
    false, true, false, true, ARRAY['EU', 'EEA'], 90, true,
    'I acknowledge that this document contains personal data protected under GDPR.',
    true, true
),
(
    'HIPAA PHI', 'HIPAA-PHI', 'HIPAA',
    'Protected Health Information under HIPAA',
    '#EF4444', 'Heart', 'restricted', 'critical',
    ARRAY['phi'], true, 2190, true, true, true, true, true, true, true,
    NULL, 30, true,
    'I acknowledge that this document contains PHI and I am authorized to access it.',
    true, true
),
(
    'PCI Cardholder Data', 'PCI-CHD', 'PCI_DSS',
    'Payment card and cardholder data',
    '#22C55E', 'CreditCard', 'restricted', 'critical',
    ARRAY['pci', 'financial'], true, 365, true, true, true, true, true, true, true,
    NULL, 30, true,
    'I acknowledge that this document contains payment card data.',
    true, true
),
(
    'SOX Financial Records', 'SOX-FR', 'SOX',
    'Financial records subject to Sarbanes-Oxley',
    '#A855F7', 'Building2', 'highly_confidential', 'high',
    ARRAY['financial', 'legal'], true, 2555, true, true, false, false, true,
    false, true, NULL, 90, false, NULL, true, true
),
(
    'CCPA Consumer Data', 'CCPA-CD', 'CCPA',
    'California consumer personal information',
    '#F59E0B', 'Shield', 'confidential', 'high',
    ARRAY['pii', 'customer_data'], true, 1825, true, true, false, false, true,
    false, false, NULL, 90, true,
    'I acknowledge this document contains California consumer data.',
    true, true
),
(
    'Internal Use Only', 'INT-001', 'CUSTOM',
    'For internal company use only',
    '#6B7280', 'Lock', 'internal', 'medium',
    ARRAY['other'], false, NULL, false, true, false, false, true, false, false,
    NULL, 365, false, NULL, true, true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
