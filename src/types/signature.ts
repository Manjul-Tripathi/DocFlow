// Electronic Signature Types

export type SignatureRequestStatus = 'draft' | 'pending' | 'completed' | 'declined' | 'expired' | 'cancelled';
export type SigningOrder = 'parallel' | 'sequential';
export type SignerRole = 'signer' | 'approver' | 'viewer' | 'cc';
export type SignerStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
export type SignatureFieldType = 'signature' | 'initial' | 'date' | 'text' | 'checkbox' | 'dropdown' | 'stamp';
export type SignatureType = 'signature' | 'initial';
export type AuditAction = 'created' | 'sent' | 'viewed' | 'signed' | 'declined' | 'completed' | 'reminded' | 'cancelled' | 'expired';

export interface SignatureRequest {
  id: string;
  user_id: string;
  title: string;
  message?: string;
  document_id?: string;
  document_name?: string;
  document_url?: string;
  status: SignatureRequestStatus;
  signing_order: SigningOrder;
  current_signer_index: number;
  expires_at?: string;
  completed_at?: string;
  reminder_frequency_days: number;
  last_reminder_sent_at?: string;
  access_code?: string;
  is_template: boolean;
  template_name?: string;
  certificate_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  signers?: SignatureSigner[];
  fields?: SignatureField[];
}

export interface SignatureSigner {
  id: string;
  request_id: string;
  user_id?: string;
  name: string;
  email: string;
  role: SignerRole;
  signing_order: number;
  status: SignerStatus;
  signed_at?: string;
  declined_at?: string;
  decline_reason?: string;
  viewed_at?: string;
  sent_at?: string;
  access_token: string;
  ip_address?: string;
  user_agent?: string;
  signature_data_url?: string;
  signature_data?: Record<string, unknown>;
  signature_position?: SignaturePosition;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  fields?: SignatureField[];
}

// Position data for click-to-place signatures
export interface SignaturePosition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xPercent: number;
  yPercent: number;
}

export interface SignatureField {
  id: string;
  request_id: string;
  signer_id: string;
  field_type: SignatureFieldType;
  label?: string;
  placeholder?: string;
  is_required: boolean;
  page_number: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  font_size: number;
  font_family: string;
  options?: string[];
  value?: string;
  filled_at?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserSignature {
  id: string;
  user_id: string;
  signature_type: SignatureType;
  name: string;
  data_url: string;
  font_family?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignatureAuditLog {
  id: string;
  request_id: string;
  signer_id?: string;
  action: AuditAction;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface SignatureTemplate {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  document_name?: string;
  roles: TemplateRole[];
  fields: TemplateField[];
  default_message?: string;
  default_expiry_days: number;
  is_active: boolean;
  use_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TemplateRole {
  id: string;
  name: string;
  role: SignerRole;
  signing_order: number;
}

export interface TemplateField {
  id: string;
  role_id: string;
  field_type: SignatureFieldType;
  label?: string;
  placeholder?: string;
  is_required: boolean;
  page_number: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface SignatureStats {
  total_requests: number;
  pending: number;
  completed: number;
  declined: number;
  expired: number;
  awaiting_my_signature: number;
  completion_rate: number;
}

export const SIGNATURE_FONTS = [
  { name: 'Dancing Script', value: "'Dancing Script', cursive" },
  { name: 'Great Vibes', value: "'Great Vibes', cursive" },
  { name: 'Pacifico', value: "'Pacifico', cursive" },
  { name: 'Satisfy', value: "'Satisfy', cursive" },
  { name: 'Caveat', value: "'Caveat', cursive" },
  { name: 'Homemade Apple', value: "'Homemade Apple', cursive" },
];

export const FIELD_TYPE_CONFIG: Record<SignatureFieldType, { label: string; icon: string; color: string }> = {
  signature: { label: 'Signature', icon: 'PenTool', color: 'bg-blue-500' },
  initial: { label: 'Initials', icon: 'Type', color: 'bg-purple-500' },
  date: { label: 'Date', icon: 'Calendar', color: 'bg-green-500' },
  text: { label: 'Text', icon: 'AlignLeft', color: 'bg-orange-500' },
  checkbox: { label: 'Checkbox', icon: 'CheckSquare', color: 'bg-pink-500' },
  dropdown: { label: 'Dropdown', icon: 'ChevronDown', color: 'bg-cyan-500' },
  stamp: { label: 'Stamp', icon: 'Stamp', color: 'bg-red-500' },
};

export const STATUS_CONFIG: Record<SignatureRequestStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
  pending: { label: 'Pending', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  completed: { label: 'Completed', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  declined: { label: 'Declined', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  expired: { label: 'Expired', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
};

export const SIGNER_STATUS_CONFIG: Record<SignerStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-gray-500' },
  sent: { label: 'Sent', color: 'text-blue-500' },
  viewed: { label: 'Viewed', color: 'text-yellow-500' },
  signed: { label: 'Signed', color: 'text-green-500' },
  declined: { label: 'Declined', color: 'text-red-500' },
};
