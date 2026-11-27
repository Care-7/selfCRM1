-- ==============================================================================
-- Migration: 202611270001_add_account_code_to_contacts.sql
-- Description: Add PGC subaccount (account_code) to clients and suppliers with
--              partial unique indexes, and next_invoice_number to business_activities.
-- Author: Senior Full-Stack & FinTech Engineer
-- Target: PostgreSQL 15+ (Supabase)
-- ==============================================================================

-- 1. Add account_code to public.clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- 2. Create partial UNIQUE index for clients: account_code unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_account_code_unique_idx
  ON public.clients (organization_id, account_code)
  WHERE account_code IS NOT NULL AND account_code <> '';

-- 3. Add account_code to public.suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- 4. Create partial UNIQUE index for suppliers: account_code unique per organization
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_account_code_unique_idx
  ON public.suppliers (organization_id, account_code)
  WHERE account_code IS NOT NULL AND account_code <> '';

-- 5. Add next_invoice_number to public.business_activities
ALTER TABLE public.business_activities
  ADD COLUMN IF NOT EXISTS next_invoice_number INTEGER DEFAULT 1;
