-- FIX: Infinite recursion in signature_requests RLS policies
-- The problem is that signature_requests policies check signature_signers,
-- but signature_signers policies might check signature_requests, causing infinite recursion

-- Step 1: Drop ALL the problematic SELECT policies that cause recursion
DROP POLICY IF EXISTS "Signers can view requests they are part of" ON signature_requests;
DROP POLICY IF EXISTS "Public can view requests via signer token" ON signature_requests;

-- Step 2: Create a SINGLE combined SELECT policy that avoids recursion
-- Using a security definer function to bypass RLS when checking signers
CREATE OR REPLACE FUNCTION public.is_request_signer(request_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM signature_signers
    WHERE signature_signers.request_id = request_uuid
    AND signature_signers.email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

-- Step 3: Recreate the SELECT policy using the function
DROP POLICY IF EXISTS "Users can view their own requests" ON signature_requests;

CREATE POLICY "Users can view accessible requests"
  ON signature_requests FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id  -- Owner can view
    OR public.is_request_signer(id)  -- Signer can view (via function to avoid recursion)
  );

-- Step 4: Recreate UPDATE policy using the function 
DROP POLICY IF EXISTS "Signers can update request status" ON signature_requests;
DROP POLICY IF EXISTS "Users can update their own requests" ON signature_requests;

CREATE POLICY "Users can update their own requests"
  ON signature_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Signers can update request status"
  ON signature_requests FOR UPDATE
  TO authenticated
  USING (public.is_request_signer(id));
