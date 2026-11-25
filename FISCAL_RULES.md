# SelfSME — Normativa Fiscal Española Innegociable

> **Marco Normativo de Referencia:**  
> - Ley 58/2003, General Tributaria (LGT) y Ley 11/2021 de medidas contra el fraude fiscal.  
> - Real Decreto 1007/2023 (Reglamento de requisitos de los sistemas informáticos de facturación - *VeriFactu*).  
> - Real Decreto 1619/2012 (Reglamento por el que se regulan las obligaciones de facturación).  
> - Real Decreto 1514/2007 y 1515/2007 (Plan General de Contabilidad y PGC PYMEs).  
> - Ley 37/1992 del IVA y Ley 35/2006 del IRPF.

---

## 1. Tipología y Separación Estricta de Documentos Emitidos

En el sistema `SelfSME`, los documentos emitidos se dividen estrictamente en tres categorías con implicaciones legales y contables diferenciadas:

| Propiedad | Factura Normal (`normal`) | Factura Proforma (`proforma`) | Albarán de Entrega (`albaran`) |
| :--- | :--- | :--- | :--- |
| **Validez Fiscal / Legal** | **Sí** (título ejecutivo fiscal) | **No** (documento meramente informativo) | **No** (justificante mercantil de entrega) |
| **Sello VeriFactu (AEAT)** | **Obligatorio** al emitir | **Terminantemente Prohibido** | **Terminantemente Prohibido** |
| **Asiento Contable** | **Sí** (Libro Diario, P&G, Balance) | **No** (sin reflejo patrimonial) | **No** (sin reflejo patrimonial) |
| **Inclusión en Modelos AEAT** | **Sí** (Modelos 303, 130, 390) | **No** | **No** |
| **Numeración / Serie** | Serie ordinaria correlativa (ej. `CC-2026-XXXX`) | Serie específica (ej. `PRO-2026-XXXX`) | Serie específica (ej. `ALB-2026-XXXX`) |
| **Conversión a Factura** | N/A (documento final) | Acción rápida `Convertir a Factura` | Acción rápida `Facturar Albarán` |

### Reglas Técnicas de Documentos:
1. **Nunca estampar huella VeriFactu ni código QR fiscal en Proformas o Albaranes.**
2. **Los Albaranes admiten el modo "sin valorar" (`isValued === false`):** muestran conceptos y cantidades de las mercancías, pero omiten bases, impuestos y totales.
3. La conversión de una Proforma o Albarán **no modifica ni sobreescribe** el documento original; genera una **nueva Factura Normal** en estado Borrador (`status: 'Borrador'`), y marca el documento de origen como `Convertida` o `Facturado` enlazando el ID de la factura resultante (`convertedToInvoiceId`).

---

## 2. Inmutabilidad de Facturas Emitidas y Sistema VeriFactu

De acuerdo con el Real Decreto 1007/2023:

1. **Inmutabilidad Absoluta una vez Emitida:**
   - Toda factura que pase a estado `Emitida` (o `Cobrada`) queda **congelada en base de datos** (`veriFactuLocked === true`).
   - Queda prohibida la edición, alteración o eliminación física (`DELETE`) de una factura emitida o de sus líneas.
2. **Correcciones únicamente mediante Factura Rectificativa:**
   - La rectificación de errores en importes, tipos impositivos o datos identificativos exige la emisión de una **Factura Rectificativa** con serie diferenciada (ej. `REC-2026-XXXX`), indicando expresamente la factura de referencia y el motivo de rectificación (art. 15 RD 1619/2012).
3. **Encadenamiento Criptográfico (Fase 2 - VeriFactu):**
   - Cada registro de facturación de alta genera una huella SHA-256 compuesta por:
     - NIF del emisor
     - Número de serie y factura
     - Fecha de expedición
     - Tipo de factura e importes totales
     - **Huella SHA-256 de la factura inmediatamente anterior** en la misma serie.
   - Toda factura física o PDF emitida debe incluir el código QR reglamentario con la URL de cotejo en la sede electrónica de la AEAT.

---

## 3. Tratamiento de Facturas Históricas Migradas

Las facturas introducidas a través del **Asistente de Migración de Datos** (desde Excel, CSV, Holded, Quipu, etc.):

1. **Bandera `isMigrated: true`:**
   - Deben persistirse con la marca de migración histórica para distinguir claramente los documentos preexistentes.
2. **Exclusión de la Cadena VeriFactu:**
   - Las facturas históricas importadas **nunca participan en el cálculo de huellas encadenadas** ni se remitirán a la plataforma VeriFactu de la AEAT, dado que pertenecen a ejercicios anteriores o fueron registradas en sistemas informáticos previos.
3. **Finalidad Exclusiva:**
   - Alimentar estadísticas de facturación, histórico de clientes, Libro de IVA previo y comparativas interanuales.

---

## 4. Multi-Actividad Económica (Epígrafes IAE)

El sistema soporta de forma nativa la coexistencia de múltiples actividades económicas independientes para un mismo titular o NIF (por ejemplo: `Contabilidad Comunidades` en epígrafe empresarial vs. `Actividad Artística` en epígrafe profesional):

1. **Series de Facturación Independientes:**
   - Cada actividad económica gestiona sus propias series de numeración sin intercalación (ejemplo: serie `CC-2026` para Comunidades y serie `AR-2026` para Artística).
   - La numeración dentro de cada serie debe ser correlativa y cronológica sin saltos injustificados.
2. **Retención de IRPF diferenciada:**
   - Los ingresos profesionales procedentes de actividades artísticas u honorarios profesionales están sujetos a retención legal de IRPF (habitualmente 15% general o 7% para nuevos autónomos), mientras que las actividades de carácter empresarial no llevan retención en factura emitida.
3. **Prorrata y Deducibilidad de Gastos:**
   - El sistema de contabilidad debe asignar cada gasto recibido a su actividad correspondiente para calcular con exactitud el IVA deducible y el rendimiento neto computable en el Modelo 130 o Impuesto de Sociedades.
