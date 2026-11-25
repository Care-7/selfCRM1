# SelfSME — Protocolo de Aseguramiento de Calidad (QA)

> **Estado:** Obligatorio para cualquier commit, Pull Request o cierre de tarea por desarrolladores o agentes de IA.  
> **Tolerancia de Fallo:** Cero (0 errores permitidos).

---

## 1. Quality Gates Previos al Cierre de Tarea

Ningún cambio de código o nueva funcionalidad puede considerarse completado sin la ejecución y verificación exitosa de las siguientes tres compuertas de calidad:

### 1.1 Verificación de Tipos (`npm run lint`)
```bash
npm run lint
```
- Debe finalizar con **código de salida 0**.
- Cero advertencias o errores de TypeScript (`tsc --noEmit`).
- No está permitido el uso indiscriminado de `any` o aserciones de tipo forzadas (`as unknown as ...`) que silencien fallos estructurales.

### 1.2 Compilación de Producción (`npm run build`)
```bash
npm run build
```
- Debe generar el bundle de producción en `dist/` sin errores de resolución de módulos ni conflictos de empaquetado.

### 1.3 Suite de Pruebas Unitarias (`npm test`)
```bash
npm test
```
- Todos los tests unitarios (`src/utils/finance.test.ts` y suites complementarias) deben ejecutarse al **100% de éxito**.
- Cobertura crítica exigida en:
  - Cálculo de bases imponibles, IVA (21%, 10%, 4%, 0%) e IRPF (15%, 7%, 0%).
  - Doble partida contable estricta en Libro Diario: **$\sum \text{Debe} \equiv \sum \text{Haber}$** en cada asiento automático.
  - Ecuación fundamental del Balance de Situación: **$\text{Activo} \equiv \text{Pasivo} + \text{Patrimonio Neto}$**.
  - Numeración correlativa de series y separación de documentos normales, proformas y albaranes.

---

## 2. Protocolo de Pruebas Multi-Tenant Obligatorio

En cada migración de base de datos, creación de tabla en Supabase o desarrollo de servicio de datos:

1. **Test de Aislamiento Negativo:**
   - Debe comprobarse explícitamente que un usuario autenticado con `organization_id = "ORG_A"` **no puede** leer, insertar, modificar ni eliminar registros con `organization_id = "ORG_B"`.
   - La consulta SQL sin cláusula `WHERE organization_id` debe retornar **únicamente** las filas del tenant activo gracias a las políticas RLS.
2. **Prevención de Fuga de Claves:**
   - La clave `SUPABASE_SERVICE_ROLE_KEY` está prohibida en el cliente frontend. En el frontend solo se utiliza `VITE_SUPABASE_ANON_KEY`, sometida a las restricciones de RLS.
3. **Validación de Clave Foránea:**
   - Ninguna fila puede crearse con `organization_id` nulo o inexistente en la tabla `organizations`.

---

## 3. Checklist de Integridad Visual y Experiencia de Usuario

Antes de dar por finalizada una tarea en la interfaz:
- [ ] **Lienzo iOS:** Fondo `#F5F5F7`, tarjetas `#FFFFFF`, sin bordes duros (`border-black/[0.04]`).
- [ ] **Números tabulares:** Toda cifra o importe en tablas y paneles utiliza la clase Tailwind `tabular-nums`.
- [ ] **Hojas de estilo:** `src/index.css` no ha sido alterado sin autorización expresa.
- [ ] **Filtros de actividad:** Los selectores globales filtran correctamente las vistas de Dashboard, Facturas, Clientes, Proveedores y Contabilidad.
- [ ] **Responsive Mobile:** La barra superior móvil permanece por debajo de 56px y el menú lateral slide-over funciona correctamente en pantallas pequeñas.
