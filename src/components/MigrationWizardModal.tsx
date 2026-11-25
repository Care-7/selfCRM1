import { useState } from 'react';
import {
  X,
  Users,
  Building2,
  FileText,
  UploadCloud,
  Download,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FileSpreadsheet,
  AlertCircle,
  Clock,
} from 'lucide-react';
import type { Contact, IssuedInvoice, NavSection } from '../types';
import { REFERENCE_DATE } from '../data/mockData';

export type MigrationEntity = 'clientes' | 'proveedores' | 'facturas';
export type MigrationSource = 'excel' | 'holded' | 'quipu' | 'facturadirecta' | 'otro';

interface MigrationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportClients: (newClients: Contact[]) => void;
  onImportSuppliers: (newSuppliers: Contact[]) => void;
  onImportInvoices: (newInvoices: IssuedInvoice[]) => void;
  onNavigateSection: (section: NavSection) => void;
}

const SOURCES: { id: MigrationSource; name: string }[] = [
  { id: 'excel', name: 'Excel / CSV' },
  { id: 'holded', name: 'Holded' },
  { id: 'quipu', name: 'Quipu' },
  { id: 'facturadirecta', name: 'FacturaDirecta' },
  { id: 'otro', name: 'Otro software' },
];

export function MigrationWizardModal({
  isOpen,
  onClose,
  onImportClients,
  onImportSuppliers,
  onImportInvoices,
  onNavigateSection,
}: MigrationWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [entity, setEntity] = useState<MigrationEntity>('clientes');
  const [source, setSource] = useState<MigrationSource>('excel');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  if (!isOpen) return null;

  const resetWizard = () => {
    setCurrentStep(1);
    setEntity('clientes');
    setSource('excel');
    setFileName('');
    setIsDragging(false);
    setIsSuccess(false);
    setImportedCount(0);
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  // Step 2 actions: Download template
  const handleDownloadTemplate = () => {
    let csvContent = '';
    let downloadName = '';

    if (entity === 'clientes') {
      csvContent = 'Razon_Social,NIF_CIF,Email,Direccion,Actividad,Tipo_IVA_Habitual\n' +
        '"Asociación Cultural Bellas Artes Madrid","G28491823","contacto@culturamadridartes.es","C/ Serrano 54, Madrid","Actividad Artística",10\n' +
        '"Comunidad Residencial Puerta de Hierro","H28192847","administracion@puertahierro12.org","C/ Puerta de Hierro 12, Madrid","Contabilidad Comunidades",21';
      downloadName = 'plantilla_migracion_clientes.csv';
    } else if (entity === 'proveedores') {
      csvContent = 'Razon_Social,NIF_CIF,Email,Direccion,Actividad,Cuenta_PGC_Gasto\n' +
        '"Papelería Técnica & Bellas Artes Minerva","B82910483","pedidos@minervabellasartes.es","C/ Barquillo 19, Madrid","Actividad Artística",602\n' +
        '"Servicios Informáticos FincasNet S.L.","B85910284","facturacion@fincasnet.es","Av. Brasil 14, Madrid","Contabilidad Comunidades",629';
      downloadName = 'plantilla_migracion_proveedores.csv';
    } else {
      csvContent = 'Numero_Factura,Cliente_NIF,Cliente_Nombre,Fecha_Emision,Fecha_Vencimiento,Concepto,Base_Imponible,Tipo_IVA,Retencion_IRPF,Actividad\n' +
        '"HIST-2025-089","H28491023","Comunidad de Propietarios C/ Alcalá 42","2025-11-15","2025-12-15","Honorarios administración ejercicio anterior",950,21,15,"Contabilidad Comunidades"\n' +
        '"HIST-2025-090","B87312940","Galería Espacio Norte S.L.","2025-12-02","2026-01-02","Venta obra histórica catálogo 2025",1800,10,15,"Actividad Artística"';
      downloadName = 'plantilla_migracion_facturas_historicas.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Step 2: Simulate sample file
  const handleSimulateSample = () => {
    const sourceLabel = SOURCES.find((s) => s.id === source)?.name ?? 'Export';
    const sampleFileName =
      entity === 'clientes'
        ? `clientes_${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_2026.csv`
        : entity === 'proveedores'
        ? `proveedores_${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_2026.csv`
        : `facturas_historicas_${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}.xlsx`;

    setFileName(sampleFileName);
    setCurrentStep(3);
  };

  // File drop / input upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name);
      setCurrentStep(3);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFileName(e.dataTransfer.files[0].name);
      setCurrentStep(3);
    } else {
      handleSimulateSample();
    }
  };

  // Step 3: Column mapping definitions
  const columnMappings = {
    clientes: [
      { sourceCol: 'Razon_Social / Nombre', targetField: 'Nombre completo o razón social', confidence: '100%' },
      { sourceCol: 'CIF_NIF', targetField: 'NIF / CIF', confidence: '100%' },
      { sourceCol: 'Email_Contacto', targetField: 'Email de facturación', confidence: '98%' },
      { sourceCol: 'Direccion_Fiscal', targetField: 'Domicilio fiscal', confidence: '95%' },
      { sourceCol: 'Tipo_Actividad', targetField: 'Actividad (Comunidades / Arte)', confidence: '99%' },
      { sourceCol: 'IVA_Defecto', targetField: 'Tipo de IVA habitual (21% / 10%)', confidence: '96%' },
    ],
    proveedores: [
      { sourceCol: 'Nombre_Fiscal', targetField: 'Nombre o razón social', confidence: '100%' },
      { sourceCol: 'CIF_Proveedor', targetField: 'NIF / CIF', confidence: '100%' },
      { sourceCol: 'Email_Facturacion', targetField: 'Email de contacto', confidence: '97%' },
      { sourceCol: 'Direccion', targetField: 'Domicilio fiscal', confidence: '95%' },
      { sourceCol: 'Cuenta_Gasto_PGC', targetField: 'Cuenta contable PGC (602 / 629)', confidence: '100%' },
    ],
    facturas: [
      { sourceCol: 'Numero_Factura', targetField: 'Número documental', confidence: '100%' },
      { sourceCol: 'Cliente_NIF', targetField: 'NIF del cliente', confidence: '100%' },
      { sourceCol: 'Fecha_Emision', targetField: 'Fecha de emisión', confidence: '100%' },
      { sourceCol: 'Base_Imponible', targetField: 'Base imponible (€)', confidence: '100%' },
      { sourceCol: 'Tipo_IVA', targetField: 'Tipo de IVA (%)', confidence: '99%' },
      { sourceCol: 'Total_Factura', targetField: 'Total cobrado (€)', confidence: '100%' },
    ],
  };

  // Simulated records to inject
  const handleConfirmImport = () => {
    if (entity === 'clientes') {
      const mockClients: Contact[] = [
        {
          id: `cli-mig-${Date.now()}-1`,
          kind: 'cliente',
          name: 'Asociación Cultural Bellas Artes Madrid',
          nif: 'G28491823',
          email: 'contacto@culturamadridartes.es',
          address: 'C/ Serrano 54, 28001 Madrid',
          activity: 'Actividad Artística',
          defaultIva: 10,
          defaultIrpf: 15,
          status: 'Activo',
          historicalVolume: 3450,
          notes: 'Importado vía Asistente de Migración',
        },
        {
          id: `cli-mig-${Date.now()}-2`,
          kind: 'cliente',
          name: 'Comunidad Residencial Puerta de Hierro 12',
          nif: 'H28192847',
          email: 'administracion@puertahierro12.org',
          address: 'C/ Puerta de Hierro 12, 28035 Madrid',
          activity: 'Contabilidad Comunidades',
          defaultIva: 21,
          defaultIrpf: 15,
          status: 'Activo',
          historicalVolume: 4200,
          notes: 'Importado vía Asistente de Migración',
        },
        {
          id: `cli-mig-${Date.now()}-3`,
          kind: 'cliente',
          name: 'Espacio Creativo Malasaña S.L.',
          nif: 'B86928174',
          email: 'hola@espaciomalasana.com',
          address: 'C/ del Pez 22, 28004 Madrid',
          activity: 'Actividad Artística',
          defaultIva: 21,
          defaultIrpf: 15,
          status: 'Activo',
          historicalVolume: 1800,
          notes: 'Importado vía Asistente de Migración',
        },
      ];
      onImportClients(mockClients);
      setImportedCount(mockClients.length);
    } else if (entity === 'proveedores') {
      const mockSuppliers: Contact[] = [
        {
          id: `sup-mig-${Date.now()}-1`,
          kind: 'proveedor',
          name: 'Papelería Técnica & Bellas Artes Minerva S.L.',
          nif: 'B82910483',
          email: 'pedidos@minervabellasartes.es',
          address: 'C/ Barquillo 19, 28004 Madrid',
          activity: 'Actividad Artística',
          defaultIva: 21,
          defaultIrpf: 0,
          status: 'Activo',
          historicalVolume: 920,
          notes: 'Importado vía Asistente de Migración',
        },
        {
          id: `sup-mig-${Date.now()}-2`,
          kind: 'proveedor',
          name: 'Servicios Informáticos FincasNet S.L.',
          nif: 'B85910284',
          email: 'facturacion@fincasnet.es',
          address: 'Av. Brasil 14, 28020 Madrid',
          activity: 'Contabilidad Comunidades',
          defaultIva: 21,
          defaultIrpf: 0,
          status: 'Activo',
          historicalVolume: 1450,
          notes: 'Importado vía Asistente de Migración',
        },
        {
          id: `sup-mig-${Date.now()}-3`,
          kind: 'proveedor',
          name: 'Asesoría Jurídica LexFincas S.L.P.',
          nif: 'B89104829',
          email: 'admin@lexfincas.com',
          address: 'C/ Goya 45, 28001 Madrid',
          activity: 'Contabilidad Comunidades',
          defaultIva: 21,
          defaultIrpf: 15,
          status: 'Activo',
          historicalVolume: 2100,
          notes: 'Importado vía Asistente de Migración',
        },
      ];
      onImportSuppliers(mockSuppliers);
      setImportedCount(mockSuppliers.length);
    } else {
      const mockInvoices: IssuedInvoice[] = [
        {
          id: `inv-mig-${Date.now()}-1`,
          number: 'HIST-2025-089',
          series: 'HIST',
          documentType: 'normal',
          clientId: 'cli-1',
          clientName: 'Comunidad de Propietarios C/ Alcalá 42',
          clientNif: 'H28491023',
          activity: 'Contabilidad Comunidades',
          issueDate: '2025-11-15',
          dueDate: '2025-12-15',
          lines: [
            {
              id: `lm-1`,
              description: 'Honorarios administración ejercicio anterior (Histórico)',
              quantity: 1,
              unitPrice: 950,
            },
          ],
          ivaRate: 21,
          irpfRate: 15,
          status: 'Cobrada',
          veriFactuLocked: false,
        },
        {
          id: `inv-mig-${Date.now()}-2`,
          number: 'HIST-2025-090',
          series: 'HIST',
          documentType: 'normal',
          clientId: 'cli-2',
          clientName: 'Galería Espacio Norte S.L.',
          clientNif: 'B87312940',
          activity: 'Actividad Artística',
          issueDate: '2025-12-02',
          dueDate: '2026-01-02',
          lines: [
            {
              id: `lm-2`,
              description: 'Venta obra histórica catálogo 2025 (Histórico)',
              quantity: 1,
              unitPrice: 1800,
            },
          ],
          ivaRate: 10,
          irpfRate: 15,
          status: 'Cobrada',
          veriFactuLocked: false,
        },
        {
          id: `inv-mig-${Date.now()}-3`,
          number: 'HIST-2026-001',
          series: 'HIST',
          documentType: 'normal',
          clientId: 'cli-3',
          clientName: 'Comunidad Residencial Retiro Sur',
          clientNif: 'H28910455',
          activity: 'Contabilidad Comunidades',
          issueDate: '2026-01-10',
          dueDate: '2026-02-10',
          lines: [
            {
              id: `lm-3`,
              description: 'Liquidación presupuestaria extraordinaria (Histórico)',
              quantity: 1,
              unitPrice: 750,
            },
          ],
          ivaRate: 21,
          irpfRate: 15,
          status: 'Cobrada',
          veriFactuLocked: false,
        },
      ];
      onImportInvoices(mockInvoices);
      setImportedCount(mockInvoices.length);
    }

    setIsSuccess(true);
  };

  const handleNavigateToResult = () => {
    const targetSection: NavSection =
      entity === 'clientes' ? 'clientes' : entity === 'proveedores' ? 'proveedores' : 'facturas';
    onNavigateSection(targetSection);
    handleClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="migration-modal-title"
    >
      <div
        className="fixed inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.14)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.05]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071E3]/[0.08] text-[#0071E3]">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="migration-modal-title"
                className="text-[18px] font-semibold tracking-[-0.02em] text-[#1D1D1F]"
              >
                Asistente de migración de datos
              </h2>
              <p className="text-[12px] text-[#6E6E73]">
                Importa registros históricos desde otras plataformas contables
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar asistente"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#6E6E73] transition-colors hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb Steps */}
        {!isSuccess && (
          <div className="flex items-center justify-between px-6 py-3 bg-[#FBFBFD] border-b border-black/[0.04] text-[12px] font-medium text-[#6E6E73]">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 1 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                1
              </span>
              <span className={currentStep === 1 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Origen y entidad
              </span>
            </div>
            <span className="text-[#86868B]">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 2 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                2
              </span>
              <span className={currentStep === 2 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Subida de archivo
              </span>
            </div>
            <span className="text-[#86868B]">→</span>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  currentStep >= 3 ? 'bg-[#0071E3] text-white' : 'bg-black/10 text-[#6E6E73]'
                }`}
              >
                3
              </span>
              <span className={currentStep === 3 ? 'font-semibold text-[#1D1D1F]' : ''}>
                Mapeo IA y confirmación
              </span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isSuccess ? (
            /* Success confirmation screen */
            <div className="py-8 text-center flex flex-col items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F8EE] text-[#1D7A3F]">
                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                ¡Migración completada con éxito!
              </h3>
              <p className="mt-1.5 text-[14px] text-[#6E6E73] max-w-md">
                Se han importado correctamente <strong>{importedCount} registros</strong> en tu cuenta de SelfSME.
                {entity === 'facturas' &&
                  ' Las facturas históricas han quedado registradas para análisis estadísticos sin vincularse a VeriFactu.'}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleNavigateToResult}
                  className="rounded-xl bg-[#0071E3] px-5 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
                >
                  Ver {entity === 'clientes' ? 'Clientes' : entity === 'proveedores' ? 'Proveedores' : 'Facturas'} importados
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="rounded-xl bg-[#F5F5F7] px-4 py-2.5 text-[14px] font-medium text-[#1D1D1F] hover:bg-black/[0.05] transition-colors"
                >
                  Importar otra entidad
                </button>
              </div>
            </div>
          ) : currentStep === 1 ? (
            /* Step 1: Entity & Source */
            <div className="space-y-6">
              <div>
                <label className="block text-[13px] font-semibold text-[#1D1D1F] mb-2.5">
                  ¿Qué datos deseas importar?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setEntity('clientes')}
                    className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'clientes'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                        entity === 'clientes' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Clientes</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Cartera de clientes, NIF, contactos y condiciones de IVA.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEntity('proveedores')}
                    className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'proveedores'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                        entity === 'proveedores' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                      }`}
                    >
                      <Building2 className="h-5 w-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Proveedores</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Proveedores recurrentes y cuentas de gasto contable PGC.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEntity('facturas')}
                    className={`flex flex-col items-start p-4 rounded-2xl text-left transition-all ${
                      entity === 'facturas'
                        ? 'bg-white border-2 border-[#0071E3] shadow-[0_4px_16px_rgba(0,113,227,0.12)]'
                        : 'bg-[#F5F5F7] border border-transparent hover:bg-black/[0.04]'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                        entity === 'facturas' ? 'bg-[#0071E3] text-white' : 'bg-white text-[#6E6E73]'
                      }`}
                    >
                      <FileText className="h-5 w-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-[#1D1D1F]">Facturas históricas</p>
                    <p className="text-[12px] text-[#6E6E73] mt-0.5">
                      Ventas de ejercicios anteriores para análisis comparativo.
                    </p>
                  </button>
                </div>
              </div>

              {/* Informative Note for Historical Invoices */}
              {entity === 'facturas' && (
                <div className="flex items-start gap-3 rounded-2xl bg-[#FFF4E5] p-3.5 text-[13px] text-[#B25E09] border border-[#B25E09]/10">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="leading-relaxed">
                    <strong>Nota fiscal:</strong> Las facturas importadas se guardarán como histórico para estadísticas y nunca se enviarán a VeriFactu.
                  </p>
                </div>
              )}

              {/* Origin Selection */}
              <div>
                <label htmlFor="migration-source" className="block text-[13px] font-semibold text-[#1D1D1F] mb-1.5">
                  ¿De qué software provienen los datos?
                </label>
                <div className="relative">
                  <select
                    id="migration-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value as MigrationSource)}
                    className="w-full appearance-none rounded-xl bg-[#F5F5F7] px-4 py-3 text-[14px] font-medium text-[#1D1D1F] border border-transparent focus:bg-white focus:border-[#0071E3] focus:outline-none"
                  >
                    {SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[12px] text-[#6E6E73] mt-1.5">
                  SelfSME adaptará los nombres de columna y formatos de fecha/moneda según el software de origen.
                </p>
              </div>
            </div>
          ) : currentStep === 2 ? (
            /* Step 2: Upload File */
            <div className="space-y-6">
              <div>
                <p className="text-[13px] font-semibold text-[#1D1D1F] mb-1">
                  Sube el archivo de exportación de {SOURCES.find((s) => s.id === source)?.name}
                </p>
                <p className="text-[12px] text-[#6E6E73]">
                  Formatos admitidos: archivos delimitados por comas (`.csv`) o libros Excel (`.xlsx`).
                </p>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-[#0071E3] bg-[#0071E3]/[0.04]'
                    : 'border-black/[0.1] bg-[#FBFBFD] hover:border-black/[0.2]'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0071E3]/[0.08] text-[#0071E3]">
                  <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[14px] font-medium text-[#1D1D1F]">
                  Arrastra aquí tu archivo .csv o .xlsx
                </p>
                <p className="mt-0.5 text-[12px] text-[#6E6E73]">
                  o selecciona un archivo desde tu equipo
                </p>
                <label className="mt-3 cursor-pointer rounded-xl bg-white px-4 py-2 text-[13px] font-medium text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-black/[0.04] hover:bg-[#F5F5F7] transition-colors">
                  <span>Examinar equipo</span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Action shortcuts */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0071E3] hover:underline"
                >
                  <Download className="h-4 w-4" />
                  Descargar plantilla CSV para {entity}
                </button>

                {/* 1-Click Simulation Button */}
                <button
                  type="button"
                  onClick={handleSimulateSample}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3]/[0.09] px-4 py-2.5 text-[13px] font-medium text-[#0071E3] hover:bg-[#0071E3]/[0.18] transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  Simular archivo de ejemplo (1 clic)
                </button>
              </div>
            </div>
          ) : (
            /* Step 3: AI Column Mapping & Review */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#F5F5F7] p-3.5 rounded-2xl">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#0071E3]" />
                    <span className="text-[13px] font-semibold text-[#1D1D1F]">
                      Mapeo automático de columnas con IA
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6E6E73] mt-0.5">
                    Archivo analizado: <span className="font-mono text-[#1D1D1F]">{fileName}</span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-[#E8F8EE] px-2.5 py-1 text-[12px] font-semibold text-[#1D7A3F]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  3 registros listos · 0 errores
                </span>
              </div>

              {/* Column Mapping Table */}
              <div className="overflow-hidden rounded-xl border border-black/[0.05] bg-white">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-black/[0.05] bg-[#FBFBFD] text-[11px] font-medium text-[#6E6E73]">
                      <th className="py-2.5 px-4">Columna detectada en origen</th>
                      <th className="py-2.5 px-4">Campo en SelfSME</th>
                      <th className="py-2.5 px-4 text-right">Coincidencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {columnMappings[entity].map((col, idx) => (
                      <tr key={idx} className="hover:bg-[#F5F5F7]/50 transition-colors">
                        <td className="py-2.5 px-4 font-mono text-[12px] text-[#1D1D1F]">
                          {col.sourceCol}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-[#0071E3]">
                          {col.targetField}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className="inline-flex items-center rounded-md bg-[#E8F8EE] px-1.5 py-0.5 text-[11px] font-medium text-[#1D7A3F]">
                            {col.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview of rows to be imported */}
              <div>
                <p className="text-[12px] font-semibold text-[#6E6E73] uppercase tracking-wider mb-2">
                  Vista previa de registros a importar ({entity})
                </p>
                <div className="space-y-2">
                  {entity === 'clientes' ? (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Asociación Cultural Bellas Artes Madrid</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: G28491823 · C/ Serrano 54 · Actividad Artística</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Comunidad Residencial Puerta de Hierro 12</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: H28192847 · C/ Puerta de Hierro 12 · Contabilidad Comunidades</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Espacio Creativo Malasaña S.L.</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: B86928174 · C/ del Pez 22 · Actividad Artística</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                    </>
                  ) : entity === 'proveedores' ? (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Papelería Técnica & Bellas Artes Minerva S.L.</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: B82910483 · Cuenta PGC 602 (Aprovisionamientos)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Servicios Informáticos FincasNet S.L.</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: B85910284 · Cuenta PGC 629 (Software gestión)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold text-[#1D1D1F]">Asesoría Jurídica LexFincas S.L.P.</p>
                          <p className="text-[12px] text-[#6E6E73]">CIF: B89104829 · Cuenta PGC 623 (Servicios profesionales)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#34C759]">Válido</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold font-mono text-[#1D1D1F]">HIST-2025-089</p>
                          <p className="text-[12px] text-[#6E6E73]">Comunidad C/ Alcalá 42 · 15/11/2025 · 1.007,00 € (Cobrada)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#86868B]">Histórico · No VeriFactu</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold font-mono text-[#1D1D1F]">HIST-2025-090</p>
                          <p className="text-[12px] text-[#6E6E73]">Galería Espacio Norte · 02/12/2025 · 1.710,00 € (Cobrada)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#86868B]">Histórico · No VeriFactu</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] text-[13px]">
                        <div>
                          <p className="font-semibold font-mono text-[#1D1D1F]">HIST-2026-001</p>
                          <p className="text-[12px] text-[#6E6E73]">Comunidad Retiro Sur · 10/01/2026 · 795,00 € (Cobrada)</p>
                        </div>
                        <span className="text-[12px] font-medium text-[#86868B]">Histórico · No VeriFactu</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        {!isSuccess && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-black/[0.05] bg-[#FBFBFD]">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2)}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F] transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Anterior
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-4 py-2 text-[13px] font-medium text-[#6E6E73] hover:bg-black/[0.05] hover:text-[#1D1D1F] transition-colors"
              >
                Cancelar
              </button>
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-5 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleSimulateSample}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0071E3] px-5 py-2 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
              >
                Procesar archivo
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0071E3] px-6 py-2.5 text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(0,113,227,0.25)] hover:bg-[#0077ED] transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar importación
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
