import { ContactsPage } from './ContactsPage';
import type { ActivityFilter, Contact, IssuedInvoice, ReceivedInvoice } from '../types';

export interface ClientsPageProps {
  clients: Contact[];
  issuedInvoices: IssuedInvoice[];
  receivedInvoices: ReceivedInvoice[];
  globalActivityFilter: ActivityFilter;
  activityOptions?: ActivityFilter[];
  isLoading?: boolean;
  onOpenClient: (client: Contact) => void;
  onCreateClient: () => void;
}

export function ClientsPage({
  clients,
  issuedInvoices,
  receivedInvoices,
  globalActivityFilter,
  activityOptions,
  isLoading,
  onOpenClient,
  onCreateClient,
}: ClientsPageProps) {
  return (
    <ContactsPage
      kind="cliente"
      contacts={clients}
      issuedInvoices={issuedInvoices}
      receivedInvoices={receivedInvoices}
      globalActivityFilter={globalActivityFilter}
      activityOptions={activityOptions}
      isLoading={isLoading}
      onOpenContact={onOpenClient}
      onCreateContact={onCreateClient}
    />
  );
}
