-- ==============================================================================
-- Migration: 202611250001_clients_suppliers.sql
-- Description: Multi-tenant Tables for Clients and Suppliers with Strict Row Level
--              Security (RLS), Organization Scoping, and Activity Association
-- Author: Full-Stack & Database Engineer (SelfSME)
-- Target: PostgreSQL 15+ (Supabase)
-- ==============================================================================

-- ==============================================================================
-- 1. Table: public.clients
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.business_activities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'ES',
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00 CHECK (default_vat_rate >= 0),
  default_irpf_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (default_irpf_rate >= 0),
  payment_terms TEXT,
  iban TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clients_org_tax_id_unique UNIQUE (organization_id, tax_id)
);

COMMENT ON TABLE public.clients IS 'Organization clients for invoicing with per-tenant isolation';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_activity_id ON public.clients(activity_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- 2. Table: public.suppliers
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.business_activities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'ES',
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00 CHECK (default_vat_rate >= 0),
  default_irpf_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (default_irpf_rate >= 0),
  default_expense_category TEXT,
  iban TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_org_tax_id_unique UNIQUE (organization_id, tax_id)
);

COMMENT ON TABLE public.suppliers IS 'Organization suppliers and service providers with per-tenant isolation';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON public.suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_activity_id ON public.suppliers(activity_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- 3. Row Level Security (RLS) Policies
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 3.1 RLS: public.clients
-- ------------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(clients.organization_id));

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(clients.organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(clients.organization_id));

-- ------------------------------------------------------------------------------
-- 3.2 RLS: public.suppliers
-- ------------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
CREATE POLICY "suppliers_select"
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(suppliers.organization_id));

DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
CREATE POLICY "suppliers_insert"
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
CREATE POLICY "suppliers_update"
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (public.is_org_member(suppliers.organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;
CREATE POLICY "suppliers_delete"
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (public.is_org_member(suppliers.organization_id));

-- ------------------------------------------------------------------------------
-- 3.3 Permissions / Table Grants for authenticated users
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.suppliers TO authenticated;

