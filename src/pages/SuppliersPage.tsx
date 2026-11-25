import { ContactsPage } from './ContactsPage';
import type { ActivityFilter, Contact, IssuedInvoice, ReceivedInvoice } from '../types';

export interface SuppliersPageProps {
  suppliers: Contact[];
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  globalActivityFilter: ActivityFilter;
  activityOptions?: ActivityFilter[];
  isLoading?: boolean;
  onOpenSupplier: (supplier: Contact) => void;
  onCreateSupplier: () => void;
}

export function SuppliersPage({
  suppliers,
  issuedInvoices,
  receivedInvoices,
  globalActivityFilter,
  activityOptions,
  isLoading,
  onOpenSupplier,
  onCreateSupplier,
}: SuppliersPageProps) {
  return (
    <ContactsPage
      kind="proveedor"
      contacts={suppliers}
      issuedInvoices={issuedInvoices}
      receivedInvoices={receivedInvoices}
      globalActivityFilter={globalActivityFilter}
      activityOptions={activityOptions}
      isLoading={isLoading}
      onOpenContact={onOpenSupplier}
      onCreateContact={onCreateSupplier}
    />
  );
}
