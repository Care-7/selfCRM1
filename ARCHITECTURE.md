# SelfSME — Guía Normativa de Arquitectura Técnica

> **Estado:** Vigente y de obligado cumplimiento  
> **Ámbito:** Repositorio completo `SelfSME` (`SelfCRM1`)  
> **Audiencia:** Ingenieros de Software, Arquitectos y Agentes de IA

---

## 1. Visión General del Sistema y Stack Tecnológico

`SelfSME` es una solución integral de facturación, gestión contable (Libro Diario, Balance de Situación, Pérdidas y Ganancias) y control fiscal orientada a autónomos y PYMEs en España, diseñada bajo un paradigma **Offline-First / Desktop-Ready** y una arquitectura **Multi-Tenant estricta**.

### Stack Tecnológico Oficial

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Frontend Runtime** | React 19 + TypeScript | Interfaz reactiva fuertemente tipada |
| **Tooling & Build** | Vite 8 + Tailwind CSS v4 | Bundling ultra-rápido, estandarización de utilidades CSS |
| **Backend & Persistencia** | Supabase (PostgreSQL 16+) | Base de datos relacional, Auth JWT, Row Level Security (RLS) |
| **Capa de Abstracción** | Repository / Service Pattern | Desacoplamiento entre datos mock en memoria y Supabase live |
| **Empaquetado Futuro** | Tauri (Rust) | Despliegue de aplicación de escritorio ligera, multiplataforma |

---

## 2. Principio "Desktop-Ready" y Abstracción de APIs

Para garantizar que la aplicación pueda compilarse y distribuirse de forma nativa mediante **Tauri** sin refactorizaciones traumáticas:

1. **Prohibición de acoplamiento a APIs exclusivas del navegador:**
   - Está prohibido invocar directamente primitivas de navegador que no existan o se comporten de manera dispar en runtimes de escritorio (`window.location.reload()`, APIs web no estandarizadas, dependencias duras de esquemas HTTP específicos) sin una capa de abstracción.
   - La persistencia no debe delegarse de forma monolítica en `localStorage` o `sessionStorage`. La persistencia definitiva reside en Supabase (o SQLite local encapsulado vía repositorios en Tauri).
2. **Desacoplamiento de Lógica de Negocio:**
   - Las reglas de cálculo financiero (IVA, IRPF, series, balance contable, cálculo de modelos AEAT) residen en módulos puros en `src/utils/finance.ts` libres de efectos secundarios del DOM.
   - La generación de documentos, exportaciones o manipulaciones de archivos debe estructurarse mediante adaptadores (`src/services/` o `src/lib/`) que permitan alternar entre descarga de navegador (`Blob`, `URL.createObjectURL`) y operaciones de sistema de archivos (`tauri-plugin-fs`).

---

## 3. Modelo Multi-Tenant Estricto (Seguridad Innegociable)

El aislamiento entre organizaciones (autónomos o empresas distintas) debe ser **físico a nivel de base de datos** y nunca confiado a filtros del cliente frontend.

### Reglas de Base de Datos y Supabase:

1. **Columna de Inquilino Obligatoria:**
   - Toda tabla de negocio (`clients`, `suppliers`, `invoices`, `invoice_lines`, `journal_entries`, `tax_declarations`, `user_profiles`, etc.) debe incluir de forma mandatoria:
     ```sql
     organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT
     ```
2. **Row Level Security (RLS) Obligatorio:**
   - Ninguna tabla de negocio puede crearse sin habilitar RLS explícitamente:
     ```sql
     ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
     ```
   - Las políticas RLS deben validar la pertenencia del usuario autenticado (`auth.uid()`) a la organización mediante claims JWT o tabla de membresía:
     ```sql
     CREATE POLICY "Tenant isolation for <table_name>"
     ON public.<table_name>
     AS RESTRICTIVE
     FOR ALL
     USING (
       organization_id IN (
         SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
       )
     );
     ```
3. **El Frontend NO es frontera de seguridad:**
   - En el cliente, los filtros por actividad económica o fechas responden a ergonomía del usuario, nunca a control de acceso de datos. Un cliente solo puede recibir de Supabase registros filtrados por RLS.

---

## 4. Sistema de Diseño Inmutable (Apple iOS Minimalist)

La identidad visual de `SelfSME` es un activo de diseño consolidado y de alta fidelidad que debe preservarse estrictamente en cada pantalla y componente nuevo.

### Fundamentos Estéticos:
- **Lienzo y Contraste:** Lienzo base en gris suave `#F5F5F7` con tarjetas y paneles en blanco puro `#FFFFFF`.
- **Ausencia de bordes duros:** Prohibido el uso de bordes negros o grises agresivos (`border-gray-300`, `border-black`). Se utilizan divisiones ultra-sutiles (`border-black/[0.04]` a `border-black/[0.06]`) o sombras de elevación orgánica (`shadow-[0_1px_3px_rgba(0,0,0,0.04)]`, `shadow-[0_8px_24px_rgba(0,0,0,0.06)]`).
- **Acento Primario:** Azul iOS (`#0071E3` / hover `#0077ED`), reservado para acciones principales y estados activos.
- **Tipografía y Legibilidad Financiera:**
   - Familia del sistema Apple (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display"`).
   - Uso obligatorio de `tabular-nums` en toda cifra numérica, importe monetario, base imponible, porcentaje de IVA/IRPF y códigos de cuenta contable para evitar saltos ópticos en tablas y balances.
- **Microinteracciones y Esquinas:**
   - Botones y selects con `rounded-xl` (12px) o `rounded-2xl` (16px).
   - Modales y paneles con desenfoque de fondo sutil (`backdrop-blur-md` o `backdrop-blur-[2px]`).
- **Integridad de Hojas de Estilo:**
   - **Queda terminantemente prohibido modificar `src/index.css`** o alterar las clases base de Tailwind CSS sin una orden explícita del usuario. Todo componente debe estilarse mediante clases Tailwind compuestas alineadas con este sistema de diseño.

---

## 5. Arquitectura de Estado y Capa de Datos

### Modo Dual: Mock en Memoria vs. Supabase Live
- El sistema cuenta con inicialización segura en `src/lib/supabase.ts`.
- La bandera `isSupabaseConfigured` detecta si existen credenciales válidas en variables de entorno (`.env`).
- Si `isSupabaseConfigured === false`, la aplicación opera fluidamente con los datos simulados en `src/data/mockData.ts`.
- Cuando se conecte la persistencia en Supabase, los componentes consumirán servicios que encapsulen las queries, manteniendo idénticas las interfaces de TypeScript de `src/types/index.ts`.
