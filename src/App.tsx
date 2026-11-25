import { useState, useEffect } from 'react';
import { Menu, CheckCircle2 } from 'lucide-react';
import type {
  ActivityFilter,
  ActivityType,
  Contact,
  ContactKind,
  IssuedInvoice,
  IssuedInvoiceStatus,
  IvaRate,
  IrpfRate,
  NavSection,
  PeriodFilter,
  ReceivedInvoice,
  TaxRegime,
  UserProfile,
} from './types';
import {
  INITIAL_CLIENTS,
  INITIAL_ISSUED_INVOICES,
  INITIAL_RECEIVED_INVOICES,
  INITIAL_SUPPLIERS,
  INITIAL_USER_PROFILE,
  REFERENCE_DATE,
} from './data/mockData';
import { getNextInvoiceNumber } from './utils/finance';
import { Sidebar } from './components/Sidebar';
import { ContactSlideOver } from './components/ContactSlideOver';
import { InvoiceEditorModal } from './components/InvoiceEditorModal';
import { AiExpenseModal } from './components/AiExpenseModal';
import { SettingsModal } from './components/SettingsModal';
import { MigrationWizardModal } from './components/MigrationWizardModal';
import type { ParsedContactRow } from './utils/csvImport';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { InvoicesPage, type InvoicesTab } from './pages/InvoicesPage';
import { AccountingPage } from './pages/AccountingPage';
import { TaxesPage } from './pages/TaxesPage';
import { TenantProvider, useTenant } from './context/TenantContext';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { Loader2 } from 'lucide-react';
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  archiveClient,
} from './services/clientsService';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  archiveSupplier,
} from './services/suppliersService';
import {
  listIssuedInvoices,
  issueInvoice,
  updateInvoicePaymentStatus,
  convertDraftDocumentToNormal,
  deleteNonFiscalDocument,
} from './services/issuedInvoicesService';
import {
  clientRowToContact,
  supplierRowToContact,
} from './services/contactMappers';
import {
  invoiceRowToIssuedInvoice,
  createIssuerSnapshot,
  createClientSnapshot,
  convertInvoiceLinesToDbItems,
} from './services/invoiceMappers';
import { isValidUuid } from './services/databaseErrors';

function MainApp() {
  const {
    isConfigured,
    session,
    loading,
    needsOnboarding,
    organization,
    activities,
    profile,
    signOut,
  } = useTenant();

  const [activeSection, setActiveSection] = useState<NavSection>('inicio');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('Todas las actividades');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('quarter');
  const [invoicesTab, setInvoicesTab] = useState<InvoicesTab>('emitidas');
  const [taxRegime, setTaxRegime] = useState<TaxRegime>('autonomo');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isDemo = !isConfigured;

  // In-memory stateful domain collections (Strictly empty in live mode)
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [clients, setClients] = useState<Contact[]>(() => (isDemo ? INITIAL_CLIENTS : []));
  const [suppliers, setSuppliers] = useState<Contact[]>(() => (isDemo ? INITIAL_SUPPLIERS : []));
  const [issuedInvoices, setIssuedInvoices] = useState<IssuedInvoice[]>(() => (isDemo ? INITIAL_ISSUED_INVOICES : []));
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoice[]>(() => (isDemo ? INITIAL_RECEIVED_INVOICES : []));

  // Reset in-memory state on sign-out / session loss in live mode (only after initial auth loading completes)
  useEffect(() => {
    if (isConfigured && !loading && !session) {
      setClients([]);
      setSuppliers([]);
      setIssuedInvoices([]);
      setReceivedInvoices([]);
    }
  }, [isConfigured, loading, session]);

  // Slide-over & modal state
  const [contactModal, setContactModal] = useState<{
    open: boolean;
    kind: ContactKind;
    contact: Contact | null;
  }>({ open: false, kind: 'cliente', contact: null });

  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    invoice: IssuedInvoice | null;
  }>({ open: false, invoice: null });

  const [rectifyingInvoice, setRectifyingInvoice] = useState<IssuedInvoice | null>(null);
  const [aiExpenseOpen, setAiExpenseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

  // Subtle loading state for Supabase data
  const [isContactsLoading, setIsContactsLoading] = useState(false);
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false);

  // Subtle confirmation feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  };

  // Load real clients, suppliers, and issued invoices from Supabase when organization is active and auth loading is done
  useEffect(() => {
    if (isConfigured && !loading && session && organization?.id) {
      let isMounted = true;
      setIsContactsLoading(true);
      setIsInvoicesLoading(true);

      Promise.all([
        listClients(organization.id),
        listSuppliers(organization.id),
        listIssuedInvoices(organization.id),
      ])
        .then(([clientsRows, suppliersRows, invoicesRows]) => {
          if (!isMounted) return;
          setClients(clientsRows.map((r) => clientRowToContact(r, activities)));
          setSuppliers(suppliersRows.map((r) => supplierRowToContact(r, activities)));
          setIssuedInvoices(invoicesRows.map((r) => invoiceRowToIssuedInvoice(r, activities)));
        })
        .catch((err) => {
          console.error('Error al sincronizar datos desde Supabase:', err);
          showToast(
            err instanceof Error
              ? err.message
              : 'Error al sincronizar los datos de Supabase. Revisa tu conexión.'
          );
        })
        .finally(() => {
          if (isMounted) {
            setIsContactsLoading(false);
            setIsInvoicesLoading(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isConfigured, loading, session, organization?.id, activities]);

  const defaultActivity: ActivityType =
    activityFilter === 'Todas las actividades'
      ? (activities[0]?.name || (isDemo ? 'Contabilidad Comunidades' : 'Actividad Principal'))
      : activityFilter;

  const handleSaveContact = async (saved: Contact, isNew: boolean) => {
    if (isConfigured) {
      if (!session || !organization?.id) {
        throw new Error('No hay una organización activa o sesión válida en Supabase. Espera o recarga la página.');
      }

      const matchedActivity = activities.find(
        (a) => a.id === saved.activityId || a.name === saved.activity
      );
      const targetActivityId =
        matchedActivity && isValidUuid(matchedActivity.id)
          ? matchedActivity.id
          : isValidUuid(saved.activityId)
          ? saved.activityId!
          : null;

      if (saved.kind === 'cliente') {
        if (isNew) {
          const row = await createClient({
            organization_id: organization.id,
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          // ONLY mutate local state on confirmed database persistence
          const mapped = clientRowToContact(row, activities);
          setClients((prev) => [mapped, ...prev]);
          showToast(`Cliente «${mapped.name}» guardado en Supabase.`);
        } else {
          const row = await updateClient(saved.id, organization.id, {
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          // ONLY mutate local state on confirmed database persistence
          const mapped = clientRowToContact(row, activities);
          setClients((prev) => prev.map((c) => (c.id === saved.id ? mapped : c)));
          showToast(`Ficha de «${mapped.name}» actualizada en Supabase.`);
        }
      } else {
        if (isNew) {
          const row = await createSupplier({
            organization_id: organization.id,
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          // ONLY mutate local state on confirmed database persistence
          const mapped = supplierRowToContact(row, activities);
          setSuppliers((prev) => [mapped, ...prev]);
          showToast(`Proveedor «${mapped.name}» guardado en Supabase.`);
        } else {
          const row = await updateSupplier(saved.id, organization.id, {
            activity_id: targetActivityId,
            name: saved.name,
            tax_id: saved.nif,
            email: saved.email || null,
            phone: saved.phone || null,
            address: saved.address || null,
            default_vat_rate: saved.defaultIva,
            default_irpf_rate: saved.defaultIrpf,
            notes: saved.notes || null,
            is_active: saved.status === 'Activo',
          });
          // ONLY mutate local state on confirmed database persistence
          const mapped = supplierRowToContact(row, activities);
          setSuppliers((prev) => prev.map((s) => (s.id === saved.id ? mapped : s)));
          showToast(`Ficha de «${mapped.name}» actualizada en Supabase.`);
        }
      }
    } else {
      // In-memory demo mode fallback (strictly when isSupabaseConfigured === false)
      if (saved.kind === 'cliente') {
        setClients((prev) =>
          isNew ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c))
        );
        showToast(isNew ? `Cliente «${saved.name}» añadido.` : `Ficha de «${saved.name}» actualizada.`);
      } else {
        setSuppliers((prev) =>
          isNew ? [saved, ...prev] : prev.map((s) => (s.id === saved.id ? saved : s))
        );
        showToast(isNew ? `Proveedor «${saved.name}» añadido.` : `Ficha de «${saved.name}» actualizada.`);
      }
    }
  };

  const handleDeleteContact = async (id: string, kind: ContactKind) => {
    if (isConfigured) {
      if (!session || !organization?.id) {
        throw new Error('No hay una organización activa en Supabase.');
      }
      if (kind === 'cliente') {
        await deleteClient(id, organization.id);
        setClients((prev) => prev.filter((c) => c.id !== id));
        showToast('Cliente eliminado de Supabase.');
      } else {
        await deleteSupplier(id, organization.id);
        setSuppliers((prev) => prev.filter((s) => s.id !== id));
        showToast('Proveedor eliminado de Supabase.');
      }
    } else {
      if (kind === 'cliente') {
        setClients((prev) => prev.filter((c) => c.id !== id));
      } else {
        setSuppliers((prev) => prev.filter((s) => s.id !== id));
      }
      showToast('Registro eliminado de la memoria.');
    }
  };

  const handleArchiveContact = async (id: string, kind: ContactKind, nextActive: boolean) => {
    const statusLabel = nextActive ? 'Activo' : 'Inactivo';
    if (isConfigured) {
      if (!session || !organization?.id) {
        throw new Error('No hay una organización activa en Supabase.');
      }
      if (kind === 'cliente') {
        const updated = await archiveClient(id, organization.id, nextActive);
        const mapped = clientRowToContact(updated, activities);
        setClients((prev) => prev.map((c) => (c.id === id ? mapped : c)));
      } else {
        const updated = await archiveSupplier(id, organization.id, nextActive);
        const mapped = supplierRowToContact(updated, activities);
        setSuppliers((prev) => prev.map((s) => (s.id === id ? mapped : s)));
      }
    } else {
      if (kind === 'cliente') {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: statusLabel } : c))
        );
      } else {
        setSuppliers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: statusLabel } : s))
        );
      }
    }
    showToast(nextActive ? 'Contacto reactivado.' : 'Contacto archivado.');
  };

  const handleSaveInvoice = async (
    saved: IssuedInvoice,
    isNew: boolean,
    rectifiedInvoiceId?: string,
    rectificationReason?: string
  ) => {
    if (isConfigured) {
      if (!session || !organization?.id) {
        throw new Error('No hay una organización activa o sesión válida en Supabase.');
      }

      const matchedActivity = activities.find(
        (a) => a.id === saved.activityId || a.name === saved.activity
      );
      const targetActivityId =
        matchedActivity && isValidUuid(matchedActivity.id)
          ? matchedActivity.id
          : isValidUuid(saved.activityId)
          ? saved.activityId!
          : null;

      const targetClientId = isValidUuid(saved.clientId) ? saved.clientId : null;

      const issuerSnapshot = createIssuerSnapshot(organization, profile);
      const clientSnapshot = createClientSnapshot({
        name: saved.clientName,
        nif: saved.clientNif,
      });

      const dbLines = convertInvoiceLinesToDbItems(
        saved.lines,
        saved.ivaRate,
        saved.irpfRate
      );

      let taxBase = 0;
      let vatTotal = 0;
      let irpfTotal = 0;
      let totalAmount = 0;
      for (const l of dbLines) {
        taxBase += l.tax_base;
        vatTotal += l.vat_amount;
        irpfTotal += l.irpf_amount;
        totalAmount += l.total;
      }

      // Round to 2 decimals
      taxBase = Math.round(taxBase * 100) / 100;
      vatTotal = Math.round(vatTotal * 100) / 100;
      irpfTotal = Math.round(irpfTotal * 100) / 100;
      totalAmount = Math.round(totalAmount * 100) / 100;

      const row = await issueInvoice({
        organization_id: organization.id,
        series: saved.series,
        document_type: saved.documentType,
        activity_id: targetActivityId,
        client_id: targetClientId,
        issuer_snapshot: issuerSnapshot,
        client_snapshot: clientSnapshot,
        lines: dbLines,
        tax_base: taxBase,
        vat_total: vatTotal,
        irpf_total: irpfTotal,
        total_amount: totalAmount,
        issue_date: saved.issueDate,
        due_date: saved.dueDate || null,
        payment_status: saved.status === 'Cobrada' ? 'paid' : 'pending',
        rectified_invoice_id: rectifiedInvoiceId || saved.rectifiedInvoiceId || null,
        rectification_reason: rectificationReason || saved.rectificationReason || null,
        converted_from_id: saved.convertedFromId || null,
        is_migrated: saved.isMigrated ?? false,
      });

      // ONLY mutate state on confirmed database persistence
      const mapped = invoiceRowToIssuedInvoice(row, activities);
      setIssuedInvoices((prev) => [mapped, ...prev]);
      showToast(
        mapped.veriFactuLocked
          ? `Factura ${mapped.number} emitida y sellada en VeriFactu.`
          : `${mapped.documentType === 'proforma' ? 'Proforma' : mapped.documentType === 'albaran' ? 'Albarán' : 'Borrador'} ${mapped.number} guardado.`
      );
    } else {
      setIssuedInvoices((prev) =>
        isNew ? [saved, ...prev] : prev.map((inv) => (inv.id === saved.id ? saved : inv))
      );
      showToast(
        saved.veriFactuLocked
          ? `Factura ${saved.number} emitida, sellada en VeriFactu y contabilizada.`
          : `Borrador ${saved.number} guardado.`
      );
    }
  };

  const handleMarkInvoicePaid = async (invoiceId: string) => {
    if (isConfigured) {
      if (!session || !organization?.id) {
        throw new Error('No hay una organización activa en Supabase.');
      }
      const row = await updateInvoicePaymentStatus(invoiceId, organization.id, 'paid');
      const mapped = invoiceRowToIssuedInvoice(row, activities);
      setIssuedInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? mapped : inv))
      );
      showToast(`Cobro de ${mapped.number} registrado en Supabase.`);
    } else {
      setIssuedInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'Cobrada' } : inv))
      );
      showToast('Cobro registrado correctamente.');
    }
  };

  const handleConvertDocumentToInvoice = async (doc: IssuedInvoice) => {
    if (isConfigured && organization) {
      const matchedActivity = activities.find(
        (a) => a.id === doc.activityId || a.name === doc.activity
      );
      const prefix = matchedActivity?.invoice_series_prefix || 'F';
      const normalSeries = `${prefix}-2026`;
      const row = await convertDraftDocumentToNormal(
        doc.id,
        organization.id,
        normalSeries,
        matchedActivity?.id
      );
      const mapped = invoiceRowToIssuedInvoice(row, activities);
      setIssuedInvoices((prev) => [
        mapped,
        ...prev.map((inv) =>
          inv.id === doc.id
            ? {
                ...inv,
                status: (doc.documentType === 'albaran' ? 'Facturado' : 'Convertida') as IssuedInvoiceStatus,
                convertedToInvoiceId: mapped.id,
              }
            : inv
        ),
      ]);
      showToast(
        `${doc.documentType === 'albaran' ? 'Albarán' : 'Proforma'} ${doc.number} convertido a Factura ${mapped.number} (VeriFactu).`
      );
    } else {
      const numInfo = getNextInvoiceNumber(issuedInvoices, doc.activity, 'normal');

      const newInvoice: IssuedInvoice = {
        id: `inv-${Date.now()}`,
        number: numInfo.number,
        series: numInfo.series,
        documentType: 'normal',
        clientId: doc.clientId,
        clientName: doc.clientName,
        clientNif: doc.clientNif,
        activity: doc.activity,
        issueDate: REFERENCE_DATE,
        dueDate: doc.dueDate || '2026-12-24',
        lines: doc.lines.map((l, idx) => ({
          ...l,
          id: `line-${Date.now()}-${idx}`,
        })),
        ivaRate: doc.ivaRate,
        irpfRate: doc.irpfRate,
        status: 'Borrador',
        veriFactuLocked: false,
      };

      const updatedStatus: IssuedInvoiceStatus =
        doc.documentType === 'albaran' ? 'Facturado' : 'Convertida';

      setIssuedInvoices((prev) => [
        newInvoice,
        ...prev.map((inv) =>
          inv.id === doc.id
            ? {
                ...inv,
                status: updatedStatus,
                convertedToInvoiceId: newInvoice.id,
              }
            : inv
        ),
      ]);

      if (doc.documentType === 'albaran') {
        showToast(`Albarán ${doc.number} facturado. Se ha creado el borrador ${newInvoice.number}.`);
      } else {
        showToast(`Proforma ${doc.number} convertida. Se ha creado el borrador ${newInvoice.number}.`);
      }
    }
  };

  const handleDeleteInvoice = async (doc: IssuedInvoice) => {
    if (isConfigured && organization) {
      await deleteNonFiscalDocument(doc.id, organization.id);
      setIssuedInvoices((prev) => prev.filter((inv) => inv.id !== doc.id));
      showToast(`${doc.documentType === 'proforma' ? 'Proforma' : 'Albarán'} ${doc.number} eliminado.`);
    } else {
      setIssuedInvoices((prev) => prev.filter((inv) => inv.id !== doc.id));
      showToast('Documento eliminado.');
    }
  };

  const handleOpenRectificativa = (inv: IssuedInvoice) => {
    setRectifyingInvoice(inv);
    setInvoiceModal({ open: true, invoice: null });
  };

  const handleCloseInvoiceModal = () => {
    setInvoiceModal({ open: false, invoice: null });
    setRectifyingInvoice(null);
  };

  const handleSaveReceivedExpense = (expense: ReceivedInvoice) => {
    setReceivedInvoices((prev) => [expense, ...prev]);
    showToast(`Gasto ${expense.number} contabilizado en el Libro Diario.`);
  };

  const handleImportClients = async (newClients: ParsedContactRow[]) => {
    if (isConfigured && organization) {
      let imported = 0;
      let skipped = 0;

      for (const row of newClients) {
        try {
          await createClient({
            organization_id: organization.id,
            name: row.name,
            tax_id: row.tax_id,
            email: row.email || null,
            phone: row.phone || null,
            address: row.address || null,
            city: row.city || null,
            postal_code: row.postal_code || null,
            country: row.country || 'ES',
            default_vat_rate: row.default_vat_rate,
            default_irpf_rate: row.default_irpf_rate,
            iban: row.iban || null,
            payment_terms: row.payment_terms || null,
            notes: row.notes || 'Importado vía Asistente de Migración',
            is_active: true,
          });
          imported++;
        } catch (err: any) {
          skipped++;
          console.warn(`Omitido cliente ${row.name} (${row.tax_id}):`, err.message);
        }
      }

      // Reload fresh list from Supabase
      const freshRows = await listClients(organization.id);
      setClients(freshRows.map((r) => clientRowToContact(r, activities)));

      showToast(
        `Se han importado ${imported} clientes en Supabase${
          skipped > 0 ? ` (${skipped} omitidos por duplicado)` : ''
        }.`
      );
      return { imported, skipped };
    } else {
      const defaultActivity = (activities[0]?.name as ActivityType) || 'Contabilidad Comunidades';
      const mappedContacts: Contact[] = newClients.map((row, idx) => ({
        id: `cli-mig-${Date.now()}-${idx}`,
        kind: 'cliente',
        name: row.name,
        nif: row.tax_id,
        email: row.email || '',
        phone: row.phone || undefined,
        address: row.address || '',
        city: row.city || undefined,
        postalCode: row.postal_code || undefined,
        activity: defaultActivity,
        defaultIva: (row.default_vat_rate != null ? Number(row.default_vat_rate) : 21) as IvaRate,
        defaultIrpf: (row.default_irpf_rate != null ? Number(row.default_irpf_rate) : 0) as IrpfRate,
        iban: row.iban || undefined,
        paymentTerms: row.payment_terms || undefined,
        notes: row.notes || 'Importado vía Asistente de Migración',
        historicalVolume: 0,
        status: 'Activo',
      }));
      setClients((prev) => [...mappedContacts, ...prev]);
      showToast(`${mappedContacts.length} clientes importados en modo demo.`);
      return { imported: mappedContacts.length, skipped: 0 };
    }
  };

  const handleImportSuppliers = async (newSuppliers: ParsedContactRow[]) => {
    if (isConfigured && organization) {
      let imported = 0;
      let skipped = 0;

      for (const row of newSuppliers) {
        try {
          await createSupplier({
            organization_id: organization.id,
            name: row.name,
            tax_id: row.tax_id,
            email: row.email || null,
            phone: row.phone || null,
            address: row.address || null,
            city: row.city || null,
            postal_code: row.postal_code || null,
            country: row.country || 'ES',
            default_vat_rate: row.default_vat_rate,
            default_irpf_rate: row.default_irpf_rate,
            iban: row.iban || null,
            notes: row.notes || 'Importado vía Asistente de Migración',
            is_active: true,
          });
          imported++;
        } catch (err: any) {
          skipped++;
          console.warn(`Omitido proveedor ${row.name} (${row.tax_id}):`, err.message);
        }
      }

      // Reload fresh list from Supabase
      const freshRows = await listSuppliers(organization.id);
      setSuppliers(freshRows.map((r) => supplierRowToContact(r, activities)));

      showToast(
        `Se han importado ${imported} proveedores en Supabase${
          skipped > 0 ? ` (${skipped} omitidos por duplicado)` : ''
        }.`
      );
      return { imported, skipped };
    } else {
      const defaultActivity = (activities[0]?.name as ActivityType) || 'Contabilidad Comunidades';
      const mappedContacts: Contact[] = newSuppliers.map((row, idx) => ({
        id: `sup-mig-${Date.now()}-${idx}`,
        kind: 'proveedor',
        name: row.name,
        nif: row.tax_id,
        email: row.email || '',
        phone: row.phone || undefined,
        address: row.address || '',
        city: row.city || undefined,
        postalCode: row.postal_code || undefined,
        activity: defaultActivity,
        defaultIva: (row.default_vat_rate != null ? Number(row.default_vat_rate) : 21) as IvaRate,
        defaultIrpf: (row.default_irpf_rate != null ? Number(row.default_irpf_rate) : 0) as IrpfRate,
        iban: row.iban || undefined,
        paymentTerms: row.payment_terms || undefined,
        notes: row.notes || 'Importado vía Asistente de Migración',
        historicalVolume: 0,
        status: 'Activo',
      }));
      setSuppliers((prev) => [...mappedContacts, ...prev]);
      showToast(`${mappedContacts.length} proveedores importados en modo demo.`);
      return { imported: mappedContacts.length, skipped: 0 };
    }
  };

  const handleImportInvoices = (newInvoices: IssuedInvoice[]) => {
    setIssuedInvoices((prev) => [...newInvoices, ...prev]);
    showToast(`${newInvoices.length} facturas históricas importadas correctamente.`);
  };

  const handleSaveProfile = (next: UserProfile) => {
    setUserProfile(next);
    setTaxRegime(next.regime);
    showToast('Ajustes fiscales actualizados.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0071E3] mb-3" />
        <p className="text-[13px] text-[#6E6E73] font-medium">Cargando espacio de trabajo...</p>
      </div>
    );
  }

  if (isConfigured && !session) {
    return <AuthPage />;
  }

  if (isConfigured && session && needsOnboarding) {
    return <OnboardingPage />;
  }

  const handleSignOut = async () => {
    setClients([]);
    setSuppliers([]);
    setIssuedInvoices([]);
    setReceivedInvoices([]);
    await signOut();
  };

  const effectiveUserProfile: UserProfile = {
    fullName: organization?.name || profile?.full_name || (isDemo ? userProfile.fullName : 'Mi Empresa'),
    nif: organization?.tax_id || (isDemo ? userProfile.nif : ''),
    roleLabel: organization?.legal_form === 'sl' ? 'Sociedad Limitada' : 'Autónomo',
    email: profile?.email || session?.user?.email || (isDemo ? userProfile.email : ''),
    address: isDemo ? userProfile.address : '',
    regime: organization?.legal_form === 'sl' ? 'empresa' : 'autonomo',
    veriFactuEnabled: userProfile.veriFactuEnabled,
    avatarUrl: undefined,
  };

  const activityOptions: ActivityFilter[] = [
    'Todas las actividades',
    ...(activities.length > 0
      ? activities.map((a) => a.name as ActivityFilter)
      : ['Contabilidad Comunidades', 'Actividad Artística']),
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      {/* Mobile Header (< lg) — kept compact (56px, well under 15% mobile viewport cap) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-[#FBFBFD]/90 backdrop-blur-md px-4 border-b border-black/[0.05] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menú de navegación"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#1D1D1F] hover:bg-black/[0.05]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
          SelfSME
        </span>
        <button
          type="button"
          onClick={() => setInvoiceModal({ open: true, invoice: null })}
          className="rounded-xl bg-[#0071E3] px-3 py-1.5 text-[12px] font-medium text-white"
        >
          + Factura
        </button>
      </header>

      {/* Fixed Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        activityFilter={activityFilter}
        onChangeActivity={setActivityFilter}
        activityOptions={activityOptions}
        userProfile={effectiveUserProfile}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMigration={() => setMigrationModalOpen(true)}
        onSignOut={isConfigured && session ? handleSignOut : undefined}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Canvas */}
      <main className="lg:pl-[264px]">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
          {activeSection === 'inicio' && (
            <DashboardPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              period={periodFilter}
              onChangePeriod={setPeriodFilter}
              taxRegime={taxRegime}
              onNavigate={setActiveSection}
              onSelectInvoice={(invoice) => setInvoiceModal({ open: true, invoice })}
              onNewInvoice={() => setInvoiceModal({ open: true, invoice: null })}
            />
          )}

          {activeSection === 'clientes' && (
            <ContactsPage
              kind="cliente"
              contacts={clients}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              globalActivityFilter={activityFilter}
              activityOptions={activityOptions}
              isLoading={isContactsLoading}
              onOpenContact={(contact) =>
                setContactModal({ open: true, kind: 'cliente', contact })
              }
              onCreateContact={() =>
                setContactModal({ open: true, kind: 'cliente', contact: null })
              }
            />
          )}

          {activeSection === 'proveedores' && (
            <ContactsPage
              kind="proveedor"
              contacts={suppliers}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              globalActivityFilter={activityFilter}
              activityOptions={activityOptions}
              isLoading={isContactsLoading}
              onOpenContact={(contact) =>
                setContactModal({ open: true, kind: 'proveedor', contact })
              }
              onCreateContact={() =>
                setContactModal({ open: true, kind: 'proveedor', contact: null })
              }
            />
          )}

          {activeSection === 'facturas' && (
            <InvoicesPage
              activeTab={invoicesTab}
              onChangeTab={setInvoicesTab}
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              onOpenNewInvoice={() => setInvoiceModal({ open: true, invoice: null })}
              onSelectIssuedInvoice={(invoice) => setInvoiceModal({ open: true, invoice })}
              onOpenAiExpenseModal={() => setAiExpenseOpen(true)}
              onConvertToInvoice={handleConvertDocumentToInvoice}
            />
          )}

          {activeSection === 'contabilidad' && (
            <AccountingPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
            />
          )}

          {activeSection === 'impuestos' && (
            <TaxesPage
              issuedInvoices={issuedInvoices}
              receivedInvoices={receivedInvoices}
              activityFilter={activityFilter}
              regime={taxRegime}
              onChangeRegime={setTaxRegime}
            />
          )}
        </div>
      </main>

      {/* Interactive Modals & Slide-overs */}
      <ContactSlideOver
        isOpen={contactModal.open}
        kind={contactModal.kind}
        contact={contactModal.contact}
        defaultActivity={defaultActivity}
        availableActivities={activities.map((a) => ({ id: a.id, name: a.name }))}
        issuedInvoices={issuedInvoices}
        receivedInvoices={receivedInvoices}
        onClose={() => setContactModal((prev) => ({ ...prev, open: false }))}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
        onArchive={handleArchiveContact}
      />

      <InvoiceEditorModal
        isOpen={invoiceModal.open}
        invoice={invoiceModal.invoice}
        clients={clients}
        allIssuedInvoices={issuedInvoices}
        defaultActivity={defaultActivity}
        initialRectifiedInvoice={rectifyingInvoice}
        onClose={handleCloseInvoiceModal}
        onSaveInvoice={handleSaveInvoice}
        onMarkPaid={handleMarkInvoicePaid}
        onConvertToInvoice={handleConvertDocumentToInvoice}
        onDeleteDocument={handleDeleteInvoice}
        onEmitRectificativa={handleOpenRectificativa}
      />

      <AiExpenseModal
        isOpen={aiExpenseOpen}
        suppliers={suppliers}
        onClose={() => setAiExpenseOpen(false)}
        onSaveExpense={handleSaveReceivedExpense}
      />

      <SettingsModal
        isOpen={settingsOpen}
        profile={effectiveUserProfile}
        onClose={() => setSettingsOpen(false)}
        onSaveProfile={handleSaveProfile}
        onOpenMigration={() => setMigrationModalOpen(true)}
      />

      <MigrationWizardModal
        isOpen={migrationModalOpen}
        onClose={() => setMigrationModalOpen(false)}
        onImportClients={handleImportClients}
        onImportSuppliers={handleImportSuppliers}
        onImportInvoices={handleImportInvoices}
        onNavigateSection={setActiveSection}
      />

      {/* Quiet Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl bg-[#1D1D1F] px-4 py-3 text-[13px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
        >
          <CheckCircle2 className="h-4 w-4 text-[#34C759] shrink-0" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <TenantProvider>
      <MainApp />
    </TenantProvider>
  );
}
