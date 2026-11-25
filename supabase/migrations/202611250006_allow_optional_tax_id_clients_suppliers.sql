-- ==============================================================================
-- Migration: 202611250006_allow_optional_tax_id_clients_suppliers.sql
-- Description: Allow optional (NULL) tax_id for clients and suppliers (e.g. retail clients,
--              tenants from ContaSol migrations) while enforcing unique tax_id per organization
--              only when tax_id is present via partial unique indexes.
-- Author: Senior Full-Stack & FinTech Engineer
-- Target: PostgreSQL 15+ (Supabase)
-- ==============================================================================

-- 1. Alter public.clients: drop NOT NULL on tax_id
ALTER TABLE public.clients ALTER COLUMN tax_id DROP NOT NULL;

-- 2. Drop existing full UNIQUE constraint on (organization_id, tax_id)
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_org_tax_id_unique;

-- 3. Create partial UNIQUE index for clients: only enforce uniqueness when tax_id is not empty
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_tax_id_unique_idx
  ON public.clients (organization_id, tax_id)
  WHERE tax_id IS NOT NULL AND tax_id <> '';

-- 4. Alter public.suppliers: drop NOT NULL on tax_id
ALTER TABLE public.suppliers ALTER COLUMN tax_id DROP NOT NULL;

-- 5. Drop existing full UNIQUE constraint on (organization_id, tax_id)
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_org_tax_id_unique;

-- 6. Create partial UNIQUE index for suppliers: only enforce uniqueness when tax_id is not empty
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_tax_id_unique_idx
  ON public.suppliers (organization_id, tax_id)
  WHERE tax_id IS NOT NULL AND tax_id <> '';
