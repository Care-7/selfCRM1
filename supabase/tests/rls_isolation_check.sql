-- ==============================================================================
-- Test Script: supabase/tests/rls_isolation_check.sql
-- Description: Automated verification script for multi-tenant isolation and
--              Row Level Security (RLS) enforcement in Supabase (PostgreSQL 15+)
-- Author: Senior Database Architect & Security Engineer (SelfSME)
-- Execution: Run in Supabase SQL Editor or psql connected to test database.
-- Note: Wrapped in a transaction that ends in ROLLBACK to leave no test artifacts.
-- ==============================================================================

BEGIN;

-- Helper to announce test stages
DO $$
BEGIN
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'STARTING MULTI-TENANT RLS ISOLATION VERIFICATION SUITE';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$;

-- ------------------------------------------------------------------------------
-- 1. Setup Mock Authentication Users
-- ------------------------------------------------------------------------------
-- User A (Autónomo: Contabilidad Comunidades)
-- User B (SL: Estudio Creativo SL)
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
BEGIN
  -- Insert into auth.users if not exists (mocking Supabase Auth runtime)
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_user_a, 'user.a@selfsme.local', '{"full_name": "Usuario Tenant A"}'::jsonb, now(), now()),
    (v_user_b, 'user.b@selfsme.local', '{"full_name": "Usuario Tenant B"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '[OK] Mock auth.users created for Tenant A and Tenant B.';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Create Tenant Workspaces via create_tenant_workspace RPC
-- ------------------------------------------------------------------------------
-- Create Workspace for User A
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_a_id uuid;
BEGIN
  -- Impersonate User A
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  v_org_a_id := public.create_tenant_workspace(
    p_org_name := 'Comunidades García - Autónomo',
    p_tax_id := '12345678Z',
    p_legal_form := 'autonomo',
    p_tax_periodicity := 'quarterly',
    p_activities := '[{"name": "Gestión Comunidades", "iae_code": "842", "invoice_series_prefix": "CC", "default_vat_rate": 21.00, "default_irpf_rate": 15.00}]'::jsonb
  );

  -- Store org A ID in a temporary config variable for subsequent steps
  PERFORM set_config('test.org_a_id', v_org_a_id::text, true);
  RAISE NOTICE '[OK] Workspace A created successfully with ID: %', v_org_a_id;
END;
$$;

-- Create Workspace for User B
DO $$
DECLARE
  v_user_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_org_b_id uuid;
BEGIN
  -- Impersonate User B
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  v_org_b_id := public.create_tenant_workspace(
    p_org_name := 'Estudio Creativo SL',
    p_tax_id := 'B99887766',
    p_legal_form := 'sl',
    p_tax_periodicity := 'monthly',
    p_activities := '[{"name": "Diseño y Publicidad", "iae_code": "763", "invoice_series_prefix": "ART", "default_vat_rate": 21.00, "default_irpf_rate": 0.00}]'::jsonb
  );

  PERFORM set_config('test.org_b_id', v_org_b_id::text, true);
  RAISE NOTICE '[OK] Workspace B created successfully with ID: %', v_org_b_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. TEST 1: Tenant A Can Read Org A, but CANNOT Read Org B (SELECT Isolation)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_a_id uuid := current_setting('test.org_a_id')::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_count integer;
BEGIN
  -- Switch role to authenticated and impersonate User A
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  -- Test 1.1: General SELECT on organizations
  SELECT count(*) INTO v_count FROM public.organizations;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 1.1 FAILED: User A should see exactly 1 organization, but saw %', v_count;
  END IF;

  -- Test 1.2: Targeted SELECT for Org B
  SELECT count(*) INTO v_count FROM public.organizations WHERE id = v_org_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1.2 FAILED (SECURITY BREACH): User A was able to read Org B!';
  END IF;

  RAISE NOTICE '[PASS] Test 1: User A cannot read Org B (RLS SELECT on organizations enforced).';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. TEST 2: Tenant A Cannot Update Tenant B Organizations (UPDATE Isolation)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_rows_affected integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  -- Attempt malicious update of Org B
  UPDATE public.organizations
  SET name = 'Compromised Name'
  WHERE id = v_org_b_id;
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected <> 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED (SECURITY BREACH): User A modified Org B! Rows: %', v_rows_affected;
  END IF;

  RAISE NOTICE '[PASS] Test 2: User A cannot update Org B (0 rows affected).';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. TEST 3: Tenant A Cannot Read or Inject Activities in Org B (Activities Isolation)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_count integer;
  v_insert_failed boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  -- Test 3.1: Read activities of Org B
  SELECT count(*) INTO v_count FROM public.business_activities WHERE organization_id = v_org_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 3.1 FAILED (SECURITY BREACH): User A read % activities from Org B!', v_count;
  END IF;

  -- Test 3.2: Malicious INSERT into Org B's activities
  BEGIN
    INSERT INTO public.business_activities (
      organization_id,
      name,
      invoice_series_prefix
    ) VALUES (
      v_org_b_id,
      'Actividad Ilegítima',
      'BAD'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_insert_failed := true;
  END;

  -- If it didn't throw an error, verify if 0 rows were inserted or blocked
  IF NOT v_insert_failed THEN
    SELECT count(*) INTO v_count FROM public.business_activities WHERE organization_id = v_org_b_id AND invoice_series_prefix = 'BAD';
    IF v_count > 0 THEN
      RAISE EXCEPTION 'TEST 3.2 FAILED (SECURITY BREACH): User A inserted an activity into Org B!';
    END IF;
  END IF;

  RAISE NOTICE '[PASS] Test 3: User A cannot read or inject activities into Org B.';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. TEST 4: Tenant A Cannot Read Organization Members of Org B
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_count integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  SELECT count(*) INTO v_count FROM public.organization_members WHERE organization_id = v_org_b_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED (SECURITY BREACH): User A read % members of Org B!', v_count;
  END IF;

  RAISE NOTICE '[PASS] Test 4: User A cannot read organization members of Org B.';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. TEST 5: Symmetrical Verification for Tenant B
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_org_a_id uuid := current_setting('test.org_a_id')::uuid;
  v_count integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  -- User B should see exactly their 1 organization
  SELECT count(*) INTO v_count FROM public.organizations;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 5.1 FAILED: User B should see 1 organization, but saw %', v_count;
  END IF;

  -- User B cannot read Org A
  SELECT count(*) INTO v_count FROM public.organizations WHERE id = v_org_a_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 5.2 FAILED (SECURITY BREACH): User B read Org A!';
  END IF;

  RAISE NOTICE '[PASS] Test 5: Symmetrical isolation confirmed for Tenant B.';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. TEST 6: Clients Isolation and Cross-Tenant Shared NIFs
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_org_a_id uuid := current_setting('test.org_a_id')::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_client_a_id uuid;
  v_client_b_id uuid;
  v_count integer;
  v_duplicate_failed boolean := false;
BEGIN
  -- Impersonate User A and insert a client
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  INSERT INTO public.clients (
    organization_id, name, tax_id, email, address, default_vat_rate, default_irpf_rate
  ) VALUES (
    v_org_a_id, 'Cliente Alfa SL', 'B12345678', 'alfa@example.com', 'Calle Principal 1', 21.00, 15.00
  ) RETURNING id INTO v_client_a_id;

  -- Verify User A sees their client
  SELECT count(*) INTO v_count FROM public.clients;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 6.1 FAILED: User A should see 1 client, saw %', v_count;
  END IF;

  -- Test intra-tenant unique violation for User A
  BEGIN
    INSERT INTO public.clients (
      organization_id, name, tax_id
    ) VALUES (
      v_org_a_id, 'Cliente Alfa Duplicado', 'B12345678'
    );
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_failed := true;
  END;

  IF NOT v_duplicate_failed THEN
    RAISE EXCEPTION 'TEST 6.2 FAILED: Intra-tenant duplicate tax_id was allowed!';
  END IF;

  -- Impersonate User B
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  -- User B must see 0 clients initially (cannot see Client A)
  SELECT count(*) INTO v_count FROM public.clients;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 6.3 FAILED (SECURITY BREACH): User B can see Client A!';
  END IF;

  -- User B inserts client with the SAME tax_id (cross-tenant sharing allowed)
  INSERT INTO public.clients (
    organization_id, name, tax_id, email, address, default_vat_rate, default_irpf_rate
  ) VALUES (
    v_org_b_id, 'Cliente Beta SL (Mismo CIF)', 'B12345678', 'beta@example.com', 'Calle Secundaria 2', 21.00, 0.00
  ) RETURNING id INTO v_client_b_id;

  -- User B should now see only their 1 client
  SELECT count(*) INTO v_count FROM public.clients;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 6.4 FAILED: User B should see 1 client, saw %', v_count;
  END IF;

  -- Impersonate User A again to test cross-tenant UPDATE and DELETE attempts
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  UPDATE public.clients SET name = 'Hackeado' WHERE id = v_client_b_id;
  DELETE FROM public.clients WHERE id = v_client_b_id;

  -- Verify Client B was NOT modified or deleted
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);
  SELECT count(*) INTO v_count FROM public.clients WHERE id = v_client_b_id AND name = 'Cliente Beta SL (Mismo CIF)';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 6.5 FAILED (SECURITY BREACH): User A modified or deleted Client B!';
  END IF;

  RAISE NOTICE '[PASS] Test 6: Clients isolation and cross-tenant uniqueness validated.';
  RESET ROLE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. TEST 7: Suppliers Isolation
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_user_a uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_b uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_org_a_id uuid := current_setting('test.org_a_id')::uuid;
  v_org_b_id uuid := current_setting('test.org_b_id')::uuid;
  v_supplier_a_id uuid;
  v_supplier_b_id uuid;
  v_count integer;
BEGIN
  -- Impersonate User A and insert a supplier
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text)::text, true);

  INSERT INTO public.suppliers (
    organization_id, name, tax_id, default_expense_category
  ) VALUES (
    v_org_a_id, 'Proveedor A Suministros', 'A99112233', 'Material de oficina'
  ) RETURNING id INTO v_supplier_a_id;

  -- Impersonate User B
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text)::text, true);

  -- User B cannot read Supplier A
  SELECT count(*) INTO v_count FROM public.suppliers WHERE id = v_supplier_a_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 7.1 FAILED (SECURITY BREACH): User B read Supplier A!';
  END IF;

  -- User B creates Supplier B
  INSERT INTO public.suppliers (
    organization_id, name, tax_id, default_expense_category
  ) VALUES (
    v_org_b_id, 'Proveedor B Software', 'B88223344', 'Software y SaaS'
  ) RETURNING id INTO v_supplier_b_id;

  -- User B sees only Supplier B
  SELECT count(*) INTO v_count FROM public.suppliers;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 7.2 FAILED: User B should see 1 supplier, saw %', v_count;
  END IF;

  RAISE NOTICE '[PASS] Test 7: Suppliers isolation validated.';
  RESET ROLE;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE 'ALL MULTI-TENANT RLS ISOLATION TESTS PASSED (100%% SUCCESS)';
  RAISE NOTICE '------------------------------------------------------------';
END;
$$;

-- Rollback entire transaction to leave database clean
ROLLBACK;

