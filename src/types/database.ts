/**
 * Database schema definitions for Supabase PostgreSQL tables and RPCs.
 * Aligned with migration 202611240001_multitenant_core.sql and ARCHITECTURE.md.
 */

export type LegalForm = 'autonomo' | 'sl' | 'other';
export type TaxPeriodicity = 'quarterly' | 'monthly';
export type OrganizationRole = 'owner' | 'admin' | 'accountant' | 'viewer';

export interface Profile {
  id: string; // UUID references auth.users(id)
  full_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string; // UUID primary key
  name: string;
  tax_id: string | null;
  legal_form: LegalForm;
  tax_periodicity: TaxPeriodicity;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string; // UUID primary key
  organization_id: string; // UUID foreign key
  user_id: string; // UUID foreign key
  role: OrganizationRole;
  created_at: string;
}

export interface BusinessActivity {
  id: string; // UUID primary key
  organization_id: string; // UUID foreign key
  name: string;
  iae_code: string | null;
  invoice_series_prefix: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  next_invoice_number?: number | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Payload input for initial activities seeded during onboarding.
 */
export interface CreateBusinessActivityInput {
  name: string;
  iae_code?: string | null;
  invoice_series_prefix: string;
  default_vat_rate?: number;
  default_irpf_rate?: number;
  next_invoice_number?: number | null;
}

/**
 * Parameters for the atomic public.create_tenant_workspace RPC.
 */
export interface CreateTenantWorkspaceParams {
  p_org_name: string;
  p_tax_id?: string | null;
  p_legal_form?: LegalForm;
  p_tax_periodicity?: TaxPeriodicity;
  p_activities?: CreateBusinessActivityInput[];
}

export type CreateTenantWorkspaceResponse = string; // UUID of the newly created organization

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface ClientRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  name: string;
  tax_id: string | null;
  account_code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  payment_terms: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  name: string;
  tax_id: string | null;
  account_code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  default_vat_rate: number;
  default_irpf_rate: number;
  default_expense_category: string | null;
  iban: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  organization_id: string;
  activity_id?: string | null;
  name: string;
  tax_id?: string | null;
  account_code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string;
  default_vat_rate?: number;
  default_irpf_rate?: number;
  payment_terms?: string | null;
  iban?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'organization_id'>>;

export interface CreateSupplierInput {
  organization_id: string;
  activity_id?: string | null;
  name: string;
  tax_id?: string | null;
  account_code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string;
  default_vat_rate?: number;
  default_irpf_rate?: number;
  default_expense_category?: string | null;
  iban?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export type UpdateSupplierInput = Partial<Omit<CreateSupplierInput, 'organization_id'>>;

/**
 * Supabase Generic Database Schema mapping for type-safe client usage.
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & { name: string };
        Update: Partial<Organization>;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMember;
        Insert: Partial<OrganizationMember> & { organization_id: string; user_id: string };
        Update: Partial<OrganizationMember>;
        Relationships: [];
      };
      business_activities: {
        Row: BusinessActivity;
        Insert: Partial<BusinessActivity> & { organization_id: string; name: string; invoice_series_prefix: string };
        Update: Partial<BusinessActivity>;
        Relationships: [];
      };
      clients: {
        Row: ClientRow;
        Insert: Partial<ClientRow> & { organization_id: string; name: string };
        Update: Partial<ClientRow>;
        Relationships: [];
      };
      suppliers: {
        Row: SupplierRow;
        Insert: Partial<SupplierRow> & { organization_id: string; name: string };
        Update: Partial<SupplierRow>;
        Relationships: [];
      };
      issued_invoices: {
        Row: IssuedInvoiceRow;
        Insert: Partial<IssuedInvoiceRow> & {
          organization_id: string;
          series: string;
          invoice_number: string;
          document_type: IssuedInvoiceDocumentType;
          lines: Json;
        };
        Update: Partial<IssuedInvoiceRow>;
        Relationships: [];
      };
      received_invoices: {
        Row: ReceivedInvoiceRow;
        Insert: Partial<ReceivedInvoiceRow> & {
          organization_id: string;
          supplier_invoice_number: string;
          tax_base: number;
          total_amount: number;
          supplier_snapshot: Json;
        };
        Update: Partial<ReceivedInvoiceRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      create_tenant_workspace: {
        Args: Record<string, unknown>;
        Returns: string;
      };
      issue_invoice_atomic: {
        Args: Record<string, unknown>;
        Returns: IssuedInvoiceRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type IssuedInvoiceDocumentType = 'normal' | 'rectificativa' | 'proforma' | 'albaran';
export type IssuedInvoicePaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type VerifactuStatus = 'not_applicable' | 'generated' | 'sent' | 'accepted' | 'rejected';

export interface InvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_rate?: number;
  vat_rate: number;
  irpf_rate: number;
  tax_base: number;
  vat_amount: number;
  irpf_amount: number;
  total: number;
}

export interface IssuerSnapshot {
  name: string;
  tax_id: string;
  legal_form?: string;
  address?: string;
  email?: string;
}

export interface ClientSnapshot {
  name: string;
  tax_id: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface IssuedInvoiceRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  client_id: string | null;
  document_type: IssuedInvoiceDocumentType;
  series: string;
  sequence_number: number;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  issuer_snapshot: IssuerSnapshot;
  client_snapshot: ClientSnapshot;
  lines: InvoiceLineItem[];
  tax_base: number;
  vat_total: number;
  irpf_total: number;
  total_amount: number;
  payment_status: IssuedInvoicePaymentStatus;
  paid_at: string | null;
  payment_method: string | null;
  notes: string | null;
  rectified_invoice_id: string | null;
  rectification_reason: string | null;
  converted_from_id: string | null;
  is_migrated: boolean;
  verifactu_locked: boolean;
  verifactu_hash: string | null;
  verifactu_prev_hash: string | null;
  verifactu_timestamp: string | null;
  verifactu_qr_url: string | null;
  verifactu_status: VerifactuStatus;
  created_at: string;
  updated_at: string;
}

export interface IssueInvoiceAtomicInput {
  organization_id: string;
  series: string;
  document_type: IssuedInvoiceDocumentType;
  issuer_snapshot: IssuerSnapshot;
  client_snapshot: ClientSnapshot;
  lines: InvoiceLineItem[];
  tax_base: number;
  vat_total: number;
  irpf_total: number;
  total_amount: number;
  activity_id?: string | null;
  client_id?: string | null;
  issue_date?: string;
  due_date?: string | null;
  payment_status?: IssuedInvoicePaymentStatus;
  payment_method?: string | null;
  notes?: string | null;
  rectified_invoice_id?: string | null;
  rectification_reason?: string | null;
  converted_from_id?: string | null;
  is_migrated?: boolean;
}

export type ReceivedInvoicePaymentStatus = 'pending' | 'paid' | 'overdue';

export interface ReceivedInvoiceRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  supplier_id: string | null;
  supplier_snapshot: {
    name: string;
    tax_id: string;
    address?: string;
    email?: string;
  };
  supplier_invoice_number: string;
  issue_date: string;
  accounting_date: string;
  expense_category: string;
  description: string | null;
  lines: any[];
  tax_base: number;
  vat_rate: number;
  vat_total: number;
  irpf_rate: number;
  irpf_total: number;
  total_amount: number;
  deductible_vat_pct: number;
  deductible_expense_pct: number;
  payment_status: ReceivedInvoicePaymentStatus;
  paid_at: string | null;
  payment_method: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReceivedInvoiceInput {
  organization_id: string;
  activity_id?: string | null;
  supplier_id?: string | null;
  supplier_snapshot: {
    name: string;
    tax_id: string;
    address?: string;
    email?: string;
  };
  supplier_invoice_number: string;
  issue_date: string;
  accounting_date?: string;
  expense_category?: string;
  description?: string | null;
  lines?: any[];
  tax_base: number;
  vat_rate?: number;
  vat_total?: number;
  irpf_rate?: number;
  irpf_total?: number;
  total_amount?: number;
  deductible_vat_pct?: number;
  deductible_expense_pct?: number;
  payment_status?: ReceivedInvoicePaymentStatus;
  paid_at?: string | null;
  payment_method?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  notes?: string | null;
}

export type UpdateReceivedInvoiceInput = Partial<Omit<CreateReceivedInvoiceInput, 'organization_id'>>;


