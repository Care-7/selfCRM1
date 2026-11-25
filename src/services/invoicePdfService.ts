import { jsPDF } from 'jspdf';
import type { IssuedInvoice } from '../types';
import {
  formatCurrency,
  formatDateES,
  getIssuedInvoiceTotals,
  round2,
} from '../utils/finance';
import {
  buildVerifactuQrUrl,
  generateQrMatrix,
} from '../utils/verifactu';

export interface GenerateInvoicePdfOptions {
  organizationName?: string;
  organizationTaxId?: string;
  organizationAddress?: string;
  organizationCity?: string;
  organizationPostalCode?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationIban?: string;
  notes?: string;
}

/**
 * Normalizes and sanitizes filename for OS file systems and cross-platform desktop/browser downloads.
 */
export function sanitizePdfFileName(invoiceNumber: string, clientName?: string): string {
  const cleanInvNum = (invoiceNumber || 'Factura')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_');

  const cleanClient = (clientName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30);

  return cleanClient ? `${cleanInvNum}_${cleanClient}.pdf` : `${cleanInvNum}.pdf`;
}

/**
 * Pure TypeScript vector engine generating executive A4 PDFs with Apple-like minimalism
 * and cryptographic VeriFactu RD 1007/2023 QR codes.
 */
export function generateInvoicePdf(
  invoice: IssuedInvoice,
  options?: GenerateInvoicePdfOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2; // 178 mm

  // Palette: Apple Executive Grayscale + Discrete Accent
  const colorPrimary = [29, 29, 31] as const; // #1D1D1F
  const colorSecondary = [110, 110, 115] as const; // #6E6E73
  const colorMuted = [134, 134, 139] as const; // #86868B
  const colorBorder = [229, 229, 234] as const; // #E5E5EA
  const colorHeaderBg = [245, 245, 247] as const; // #F5F5F7
  const colorAccent = [0, 113, 227] as const; // #0071E3
  const colorWarningText = [178, 94, 9] as const; // #B25E09
  const colorWarningBg = [255, 244, 229] as const; // #FFF4E5
  const colorDangerText = [211, 47, 47] as const; // #D32F2F
  const colorDangerBg = [255, 240, 240] as const; // #FFF0F0

  const docType = invoice.documentType ?? 'normal';
  const isValued = invoice.isValued !== false;
  const isVerifactuActive =
    Boolean(invoice.veriFactuLocked) &&
    !invoice.isMigrated &&
    (docType === 'normal' || docType === 'rectificativa');

  // Resolving Issuer snapshot or fallback
  const issuer = {
    name:
      invoice.issuerSnapshot?.name ||
      options?.organizationName ||
      'Emisor',
    taxId:
      invoice.issuerSnapshot?.tax_id ||
      options?.organizationTaxId ||
      '',
    address:
      invoice.issuerSnapshot?.address ||
      options?.organizationAddress ||
      '',
    city:
      invoice.issuerSnapshot?.city ||
      options?.organizationCity ||
      '',
    postalCode:
      invoice.issuerSnapshot?.postal_code ||
      options?.organizationPostalCode ||
      '',
    email:
      invoice.issuerSnapshot?.email ||
      options?.organizationEmail ||
      '',
    iban:
      invoice.issuerSnapshot?.iban ||
      options?.organizationIban ||
      '',
  };

  // Resolving Client snapshot or fallback
  const client = {
    name: invoice.clientSnapshot?.name || invoice.clientName || 'Cliente',
    taxId: invoice.clientSnapshot?.tax_id || invoice.clientNif || '',
    address: invoice.clientSnapshot?.address || '',
    city: invoice.clientSnapshot?.city || '',
    postalCode: invoice.clientSnapshot?.postal_code || '',
    email: invoice.clientSnapshot?.email || '',
    phone: invoice.clientSnapshot?.phone || '',
  };

  // Resolving Totals
  const fallbackTotals = getIssuedInvoiceTotals(invoice);
  const taxBase = invoice.taxBase != null ? Number(invoice.taxBase) : fallbackTotals.baseImponible;
  const vatTotal = invoice.vatTotal != null ? Number(invoice.vatTotal) : fallbackTotals.ivaAmount;
  const irpfTotal = invoice.irpfTotal != null ? Number(invoice.irpfTotal) : fallbackTotals.irpfAmount;
  const totalAmount = invoice.totalAmount != null ? Number(invoice.totalAmount) : fallbackTotals.total;

  let currentY = 18;

  // 1. TOP HEADER & DOCUMENT TITLE
  doc.setFont('helvetica', 'bold');

  if (docType === 'normal') {
    doc.setTextColor(...colorPrimary);
    doc.setFontSize(22);
    doc.text('FACTURA', marginX, currentY + 6);
  } else if (docType === 'rectificativa') {
    doc.setTextColor(...colorDangerText);
    doc.setFontSize(19);
    doc.text('FACTURA RECTIFICATIVA', marginX, currentY + 6);
  } else if (docType === 'proforma') {
    doc.setTextColor(...colorPrimary);
    doc.setFontSize(20);
    doc.text('FACTURA PROFORMA', marginX, currentY + 6);
  } else {
    // Albarán
    doc.setTextColor(...colorPrimary);
    doc.setFontSize(20);
    doc.text('ALBARÁN DE ENTREGA', marginX, currentY + 6);
  }

  // Right-aligned Document Metadata
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...colorPrimary);
  doc.text(invoice.number || 'SIN NÚMERO', pageWidth - marginX, currentY + 2, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colorSecondary);
  const dateStr = formatDateES(invoice.issueDate);
  doc.text(`Fecha de emisión: ${dateStr}`, pageWidth - marginX, currentY + 7, { align: 'right' });

  if (invoice.dueDate) {
    const dueStr = formatDateES(invoice.dueDate);
    doc.text(`Vencimiento: ${dueStr}`, pageWidth - marginX, currentY + 11.5, { align: 'right' });
  }

  if (invoice.series || invoice.activity) {
    const metaLine = [
      invoice.series ? `Serie: ${invoice.series}` : null,
      invoice.activity ? `Actividad: ${invoice.activity}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    doc.setFontSize(8);
    doc.text(metaLine, pageWidth - marginX, currentY + 16, { align: 'right' });
  }

  currentY += 12;

  // Document Type Specific Badges
  if (docType === 'proforma' || docType === 'albaran') {
    doc.setFillColor(...colorWarningBg);
    doc.setDrawColor(...colorWarningText);
    doc.roundedRect(marginX, currentY, 80, 6.5, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...colorWarningText);
    doc.text('DOCUMENTO SIN VALIDEZ FISCAL', marginX + 3.5, currentY + 4.5);
    currentY += 10;
  } else if (docType === 'rectificativa') {
    doc.setFillColor(...colorDangerBg);
    doc.setDrawColor(...colorDangerText);
    doc.roundedRect(marginX, currentY, 95, 11, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...colorDangerText);
    doc.text('DOCUMENTO RECTIFICATIVO (Art. 15 RD 1619/2012)', marginX + 3, currentY + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const refText = invoice.rectifiedInvoiceId ? `Ref: ${invoice.rectifiedInvoiceId}` : 'Ref: Factura anterior';
    const reasonText = invoice.rectificationReason ? ` | Motivo: ${invoice.rectificationReason}` : '';
    doc.text(`${refText}${reasonText}`, marginX + 3, currentY + 8);
    currentY += 14;
  } else {
    currentY += 4;
  }

  // Divider
  doc.setDrawColor(...colorBorder);
  doc.setLineWidth(0.3);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);
  currentY += 6;

  // 2. ISSUER & CLIENT FISCAL DATA (Side-by-side cards)
  const colWidth = (contentWidth - 10) / 2; // 84 mm
  const clientColX = marginX + colWidth + 10;

  // Issuer Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...colorMuted);
  doc.text('DATOS DEL EMISOR', marginX, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colorPrimary);
  doc.text(issuer.name || 'Empresa Emisora', marginX, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...colorSecondary);
  let issuerY = currentY + 9.5;
  if (issuer.taxId) {
    doc.text(`NIF/CIF: ${issuer.taxId}`, marginX, issuerY);
    issuerY += 4;
  }
  if (issuer.address) {
    doc.text(issuer.address, marginX, issuerY);
    issuerY += 4;
  }
  const issuerCityLine = [issuer.postalCode, issuer.city].filter(Boolean).join(' ');
  if (issuerCityLine) {
    doc.text(issuerCityLine, marginX, issuerY);
    issuerY += 4;
  }
  if (issuer.email) {
    doc.text(issuer.email, marginX, issuerY);
    issuerY += 4;
  }

  // Client Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...colorMuted);
  doc.text('DATOS DEL CLIENTE', clientColX, currentY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...colorPrimary);
  doc.text(client.name || 'Cliente', clientColX, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...colorSecondary);
  let clientY = currentY + 9.5;
  if (client.taxId) {
    doc.text(`NIF/CIF: ${client.taxId}`, clientColX, clientY);
    clientY += 4;
  }
  if (client.address) {
    doc.text(client.address, clientColX, clientY);
    clientY += 4;
  }
  const clientCityLine = [client.postalCode, client.city].filter(Boolean).join(' ');
  if (clientCityLine) {
    doc.text(clientCityLine, clientColX, clientY);
    clientY += 4;
  }
  if (client.email) {
    doc.text(client.email, clientColX, clientY);
    clientY += 4;
  }

  currentY = Math.max(issuerY, clientY) + 6;

  // Helper to draw Table Header
  const drawTableHeader = (y: number) => {
    doc.setFillColor(...colorHeaderBg);
    doc.rect(marginX, y, contentWidth, 7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...colorSecondary);

    if (docType === 'albaran' && !isValued) {
      doc.text('DESCRIPCIÓN / CONCEPTO', marginX + 3, y + 4.8);
      doc.text('CANTIDAD', pageWidth - marginX - 3, y + 4.8, { align: 'right' });
    } else {
      doc.text('DESCRIPCIÓN / CONCEPTO', marginX + 3, y + 4.8);
      doc.text('CANT.', marginX + 94, y + 4.8, { align: 'right' });
      doc.text('PRECIO UD.', marginX + 118, y + 4.8, { align: 'right' });
      doc.text('DTO. %', marginX + 138, y + 4.8, { align: 'right' });
      doc.text('IVA %', marginX + 156, y + 4.8, { align: 'right' });
      doc.text('TOTAL', pageWidth - marginX - 3, y + 4.8, { align: 'right' });
    }
  };

  // 3. TABLE OF INVOICE LINES
  drawTableHeader(currentY);
  currentY += 7;

  const lines = invoice.lines && invoice.lines.length > 0
    ? invoice.lines
    : [{ id: 'empty-1', description: 'Servicios prestados', quantity: 1, unitPrice: 0 }];

  lines.forEach((line) => {
    const desc = line.description || '—';
    const qty = Number(line.quantity ?? 1);
    const unitPrice = Number(line.unitPrice ?? (line as any).unit_price ?? 0);
    const discountRate = Number((line as any).discount_rate ?? (line as any).discount ?? 0);
    const vatRate = (line as any).vat_rate != null ? Number((line as any).vat_rate) : invoice.ivaRate ?? 21;
    const baseLine = round2(qty * unitPrice * (1 - discountRate / 100));

    // Description text wrapping
    const descMaxWidth = docType === 'albaran' && !isValued ? contentWidth - 40 : 80;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const splitDesc = doc.splitTextToSize(desc, descMaxWidth);
    const rowHeight = Math.max(7, splitDesc.length * 4.2 + 3);

    // Page break handling
    if (currentY + rowHeight > 250) {
      doc.addPage();
      currentY = 18;
      // Repeat small header
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...colorMuted);
      doc.text(`${invoice.number || 'Factura'} · Continuación`, marginX, currentY);
      currentY += 4;
      drawTableHeader(currentY);
      currentY += 7;
    }

    // Print text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...colorPrimary);

    // Multi-line description
    doc.text(splitDesc, marginX + 3, currentY + 4.2);

    if (docType === 'albaran' && !isValued) {
      doc.text(String(qty), pageWidth - marginX - 3, currentY + 4.2, { align: 'right' });
    } else {
      doc.text(String(qty), marginX + 94, currentY + 4.2, { align: 'right' });
      doc.text(formatCurrency(unitPrice), marginX + 118, currentY + 4.2, { align: 'right' });
      doc.text(discountRate > 0 ? `${discountRate}%` : '—', marginX + 138, currentY + 4.2, { align: 'right' });
      doc.text(`${vatRate}%`, marginX + 156, currentY + 4.2, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(baseLine), pageWidth - marginX - 3, currentY + 4.2, { align: 'right' });
    }

    currentY += rowHeight;

    // Bottom subtle line for row
    doc.setDrawColor(240, 240, 242);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY, pageWidth - marginX, currentY);
  });

  currentY += 5;

  // 4. TOTALS & PAYMENT DETAILS
  // Ensure enough room for totals (approx 45mm)
  if (currentY + 45 > 255) {
    doc.addPage();
    currentY = 20;
  }

  // Left Column: Notes & Payment Info
  const notesX = marginX;
  const notesWidth = 90;
  let notesY = currentY + 2;

  const paymentTerms = (invoice as any).paymentTerms || (invoice as any).payment_terms || options?.notes;
  const iban = issuer.iban || options?.organizationIban;

  if (iban || paymentTerms || invoice.dueDate) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...colorMuted);
    doc.text('DATOS DE PAGO Y CONDICIONES', notesX, notesY);
    notesY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colorSecondary);

    if (iban) {
      doc.text(`IBAN: ${iban}`, notesX, notesY);
      notesY += 4;
    }
    if (invoice.dueDate) {
      doc.text(`Fecha límite de pago: ${formatDateES(invoice.dueDate)}`, notesX, notesY);
      notesY += 4;
    }
    if (paymentTerms) {
      const splitTerms = doc.splitTextToSize(String(paymentTerms), notesWidth);
      doc.text(splitTerms, notesX, notesY);
      notesY += splitTerms.length * 3.8;
    }
  }

  // Right Column: Fiscal Totals Breakdown (only if valued)
  if (isValued) {
    const totalsX = pageWidth - marginX - 80;
    const totalsValueX = pageWidth - marginX - 3;
    let totalsY = currentY + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...colorSecondary);

    // Base Imponible
    doc.text('Base Imponible:', totalsX, totalsY);
    doc.text(formatCurrency(taxBase), totalsValueX, totalsY, { align: 'right' });
    totalsY += 5;

    // IVA Total
    doc.text(`IVA (${invoice.ivaRate ?? 21}%):`, totalsX, totalsY);
    doc.text(formatCurrency(vatTotal), totalsValueX, totalsY, { align: 'right' });
    totalsY += 5;

    // IRPF Total (if applied)
    if (irpfTotal > 0) {
      doc.text(`Retención IRPF (${invoice.irpfRate ?? 15}%):`, totalsX, totalsY);
      doc.text(`-${formatCurrency(irpfTotal)}`, totalsValueX, totalsY, { align: 'right' });
      totalsY += 5;
    }

    // Total Factura Box
    totalsY += 1.5;
    doc.setFillColor(...colorHeaderBg);
    doc.roundedRect(totalsX - 3, totalsY - 4, 83, 9, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...colorAccent);
    doc.text('TOTAL FACTURA', totalsX, totalsY + 2);
    doc.text(formatCurrency(totalAmount), totalsValueX, totalsY + 2, { align: 'right' });

    currentY = Math.max(notesY, totalsY + 9) + 4;
  } else {
    currentY = notesY + 6;
  }

  // 5. LEGAL VERIFACTU BLOCK (RD 1007/2023)
  // ONLY for real fiscal locked invoices (normal & rectificativa)
  if (isVerifactuActive) {
    const blockHeight = 27;
    if (currentY + blockHeight > 275) {
      doc.addPage();
      currentY = 20;
    }

    // Container box
    doc.setFillColor(252, 252, 253);
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, currentY, contentWidth, blockHeight, 1.8, 1.8, 'FD');

    // Vector QR Code (21x21 modules + 1 module quiet zone = 23 modules)
    const qrSeed =
      invoice.verifactuQrUrl ||
      buildVerifactuQrUrl({
        issuerTaxId: issuer.taxId,
        invoiceNumber: invoice.number,
        issueDate: invoice.issueDate,
        totalAmount: totalAmount,
      }) ||
      invoice.veriFactuHash ||
      invoice.number;

    const qrSize = 22; // 22mm x 22mm
    const qrX = marginX + 2.5;
    const qrY = currentY + 2.5;
    const qrCells = generateQrMatrix(qrSeed);
    const cellSize = qrSize / 23; // 21 + 2 border quiet modules

    // QR background
    doc.setFillColor(255, 255, 255);
    doc.rect(qrX, qrY, qrSize, qrSize, 'F');

    // Draw vector QR modules
    doc.setFillColor(...colorPrimary);
    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        if (qrCells[r][c]) {
          doc.rect(qrX + (c + 1) * cellSize, qrY + (r + 1) * cellSize, cellSize, cellSize, 'F');
        }
      }
    }

    // QR Details Text
    const textX = qrX + qrSize + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...colorPrimary);
    doc.text('Sello Digital VeriFactu — Real Decreto 1007/2023', textX, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...colorSecondary);
    doc.text(
      'QR tributario — Factura verificable en la sede electrónica de la AEAT (VERI*FACTU)',
      textX,
      currentY + 10
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(...colorMuted);
    const hashStr = invoice.veriFactuHash || '—';
    doc.text(`Huella SHA-256: ${hashStr}`, textX, currentY + 14.5);

    const tsStr = invoice.veriFactuTimestamp
      ? new Date(invoice.veriFactuTimestamp).toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : formatDateES(invoice.issueDate);
    doc.text(`Registro sellado el: ${tsStr} · Registro inmutable y encadenado`, textX, currentY + 18.5);

    // Green verification pill
    doc.setFillColor(232, 248, 238);
    doc.roundedRect(textX, currentY + 21, 28, 4.5, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(29, 122, 63);
    doc.text('COTEJO OFICIAL AEAT', textX + 2, currentY + 24.2);

    currentY += blockHeight + 4;
  }

  // 6. GLOBAL FOOTER ON ALL PAGES
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...colorMuted);
    doc.text('SelfSME · Facturación & Gestión Fiscal', marginX, pageHeight - 8.5);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginX, pageHeight - 8.5, {
      align: 'right',
    });
  }

  return doc;
}

/**
 * Generates and triggers downloading the PDF in standard browsers or desktop environments.
 */
export function downloadInvoicePdf(
  invoice: IssuedInvoice,
  options?: GenerateInvoicePdfOptions
): { success: boolean; fileName: string; blob: Blob; doc: jsPDF } {
  const doc = generateInvoicePdf(invoice, options);
  const fileName = sanitizePdfFileName(
    invoice.number,
    invoice.clientSnapshot?.name || invoice.clientName
  );

  const arrayBuffer = doc.output('arraybuffer');
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

  // Browser download trigger
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    doc.save(fileName);
  }

  return { success: true, fileName, blob, doc };
}
