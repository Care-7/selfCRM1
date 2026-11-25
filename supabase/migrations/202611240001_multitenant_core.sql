-- ==============================================================================
-- Migration: 202611240001_multitenant_core.sql
-- Description: Core Multi-Tenant Architecture, User Profiles, Business Activities,
--              Security Definer Helpers, and Strict Row Level Security (RLS)
-- Author: Senior Database Architect & Security Engineer (SelfSME)
-- Target: PostgreSQL 15+ (Supabase)
-- ==============================================================================

-- 0. Ensure Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. Helper Function: Automatic updated_at Timestamps
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. Table: public.profiles
-- Linked 1:1 with auth.users for identity and fiscal user information
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User identity and presentation profiles mirroring auth.users';

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Trigger to automatically create or synchronize profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 3. Table: public.organizations
-- Primary Multi-Tenant boundary for Autónomos, SLs and entities
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  legal_form TEXT NOT NULL DEFAULT 'autonomo' CHECK (legal_form IN ('autonomo', 'sl', 'other')),
  tax_periodicity TEXT NOT NULL DEFAULT 'quarterly' CHECK (tax_periodicity IN ('quarterly', 'monthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS 'Tenant organizations (Autónomos, SLs) establishing data boundaries';

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- 4. Table: public.organization_members
-- Multi-Tenant membership and role assignment
-- Roles: owner (full authority), admin, accountant (fiscal/reporting), viewer
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'admin', 'accountant', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_org_user_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_user
  ON public.organization_members(organization_id, user_id);

COMMENT ON TABLE public.organization_members IS 'User membership and role assignments within tenant organizations';

-- ==============================================================================
-- 5. Table: public.business_activities
-- Native multi-activity support (Epígrafes IAE, independent series, VAT/IRPF)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.business_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  iae_code TEXT,
  invoice_series_prefix TEXT NOT NULL,
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00 CHECK (default_vat_rate >= 0),
  default_irpf_rate NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (default_irpf_rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_activities_org_id
  ON public.business_activities(organization_id);

COMMENT ON TABLE public.business_activities IS 'Economic activities (IAE headings) per organization with independent invoice series';

-- ==============================================================================
-- 6. Helper Security Definer Functions for RLS (Recursion-Safe)
-- By executing as SECURITY DEFINER with fixed search_path, these functions
-- bypass RLS on organization_members internally, preventing infinite recursion loops.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_org_member(uuid) IS 'Returns true if current auth user is a member of the given organization';

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_org_admin(uuid) IS 'Returns true if current auth user is an owner or admin of the given organization';

-- ==============================================================================
-- 7. Row Level Security (RLS) Activation & Strict Policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 7.1 RLS: public.profiles
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_colleagues" ON public.profiles;
CREATE POLICY "profiles_select_own_or_colleagues"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members m1
      JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
      WHERE m1.user_id = auth.uid()
        AND m2.user_id = public.profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------------------------
-- 7.2 RLS: public.organizations
-- ------------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_member" ON public.organizations;
CREATE POLICY "organizations_select_member"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "organizations_update_admin" ON public.organizations;
CREATE POLICY "organizations_update_admin"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

DROP POLICY IF EXISTS "organizations_insert_authenticated" ON public.organizations;
CREATE POLICY "organizations_insert_authenticated"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "organizations_delete_owner" ON public.organizations;
CREATE POLICY "organizations_delete_owner"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- ------------------------------------------------------------------------------
-- 7.3 RLS: public.organization_members
-- ------------------------------------------------------------------------------
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_members_select" ON public.organization_members;
CREATE POLICY "organization_members_select"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "organization_members_insert" ON public.organization_members;
CREATE POLICY "organization_members_insert"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "organization_members_update" ON public.organization_members;
CREATE POLICY "organization_members_update"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "organization_members_delete" ON public.organization_members;
CREATE POLICY "organization_members_delete"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.is_org_admin(organization_id)
  );

-- ------------------------------------------------------------------------------
-- 7.4 RLS: public.business_activities
-- ------------------------------------------------------------------------------
ALTER TABLE public.business_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_activities_select" ON public.business_activities;
CREATE POLICY "business_activities_select"
  ON public.business_activities
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "business_activities_insert" ON public.business_activities;
CREATE POLICY "business_activities_insert"
  ON public.business_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "business_activities_update" ON public.business_activities;
CREATE POLICY "business_activities_update"
  ON public.business_activities
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "business_activities_delete" ON public.business_activities;
CREATE POLICY "business_activities_delete"
  ON public.business_activities
  FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- ==============================================================================
-- 8. Atomic Onboarding RPC: public.create_tenant_workspace
-- Creates organization, assigns caller as 'owner', and configures initial activities
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_tenant_workspace(
  p_org_name text,
  p_tax_id text DEFAULT NULL,
  p_legal_form text DEFAULT 'autonomo',
  p_tax_periodicity text DEFAULT 'quarterly',
  p_activities jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_activity jsonb;
  v_name text;
  v_iae_code text;
  v_prefix text;
  v_vat numeric(5,2);
  v_irpf numeric(5,2);
BEGIN
  -- 1. Verify caller authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado. Inicie sesión para crear una organización.';
  END IF;

  -- 2. Validate parameters
  IF TRIM(p_org_name) IS NULL OR TRIM(p_org_name) = '' THEN
    RAISE EXCEPTION 'El nombre de la organización es obligatorio.';
  END IF;

  IF p_legal_form NOT IN ('autonomo', 'sl', 'other') THEN
    RAISE EXCEPTION 'Forma jurídica no válida: %', p_legal_form;
  END IF;

  IF p_tax_periodicity NOT IN ('quarterly', 'monthly') THEN
    RAISE EXCEPTION 'Periodicidad fiscal no válida: %', p_tax_periodicity;
  END IF;

  -- 3. Create Organization
  INSERT INTO public.organizations (
    name,
    tax_id,
    legal_form,
    tax_periodicity
  ) VALUES (
    TRIM(p_org_name),
    NULLIF(TRIM(p_tax_id), ''),
    p_legal_form,
    p_tax_periodicity
  )
  RETURNING id INTO v_org_id;

  -- 4. Associate Current User as 'owner'
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner'
  );

  -- 5. Insert initial activities from JSON array if provided
  IF p_activities IS NOT NULL AND jsonb_typeof(p_activities) = 'array' THEN
    FOR v_activity IN SELECT * FROM jsonb_array_elements(p_activities)
    LOOP
      v_name := TRIM(COALESCE(v_activity->>'name', ''));
      v_iae_code := NULLIF(TRIM(COALESCE(v_activity->>'iae_code', '')), '');
      v_prefix := TRIM(COALESCE(v_activity->>'invoice_series_prefix', 'FAC'));
      v_vat := COALESCE((v_activity->>'default_vat_rate')::numeric, 21.00);
      v_irpf := COALESCE((v_activity->>'default_irpf_rate')::numeric, 15.00);

      IF v_name <> '' THEN
        INSERT INTO public.business_activities (
          organization_id,
          name,
          iae_code,
          invoice_series_prefix,
          default_vat_rate,
          default_irpf_rate,
          is_active
        ) VALUES (
          v_org_id,
          v_name,
          v_iae_code,
          v_prefix,
          v_vat,
          v_irpf,
          true
        );
      END IF;
    END LOOP;
  END IF;

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.create_tenant_workspace(text, text, text, text, jsonb)
  IS 'Atomic RPC creating an organization, setting caller as owner, and seeding initial activities';

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_workspace(text, text, text, text, jsonb) TO authenticated;
