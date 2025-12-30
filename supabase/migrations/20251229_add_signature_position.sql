-- Add signature_position column to store click position
ALTER TABLE signature_signers ADD COLUMN IF NOT EXISTS signature_position jsonb;

-- Column will store: {"page": 1, "x": 350, "y": 500, "width": 150, "height": 50, "xPercent": 45.2, "yPercent": 78.5}
COMMENT ON COLUMN signature_signers.signature_position IS 'Stores the position where signature should be placed on the document';
