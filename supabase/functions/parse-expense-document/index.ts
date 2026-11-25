import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Sorts discovered Gemini models prioritizing 'flash' over 'pro',
 * and ordering by version number (highest first).
 */
function sortGeminiModels(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aIsFlash = aLower.includes('flash');
    const bIsFlash = bLower.includes('flash');
    if (aIsFlash && !bIsFlash) return -1;
    if (!aIsFlash && bIsFlash) return 1;

    const aIsPro = aLower.includes('pro');
    const bIsPro = bLower.includes('pro');
    if (aIsPro && !bIsPro) return -1;
    if (!aIsPro && bIsPro) return 1;

    // Compare versions (e.g. 2.5 vs 2.0 vs 1.5)
    const getVersion = (s: string) => {
      const match = s.match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0;
    };
    const vA = getVersion(a);
    const vB = getVersion(b);
    if (vA !== vB) return vB - vA; // Highest version first

    return a.localeCompare(b);
  });
}

Deno.serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Solo se admite POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. Validate Authorization header and extract JWT explicitly
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Variables de entorno de Supabase no configuradas en Edge Function.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Read GEMINI_API_KEY strictly in server
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error:
            'El servicio de inteligencia artificial no está configurado (falta GEMINI_API_KEY en Supabase Secrets).',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse request body
    const body = await req.json().catch(() => null);
    if (!body || !body.fileBase64 || !body.mimeType) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros requeridos: fileBase64 y mimeType.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fileBase64, mimeType, fileName } = body;

    if (typeof fileBase64 !== 'string' || fileBase64.length === 0) {
      return new Response(
        JSON.stringify({ error: 'El contenido del archivo está vacío o no es válido.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (fileBase64.length > 20 * 1024 * 1024) {
      return new Response(
        JSON.stringify({
          error: 'El documento supera el tamaño máximo permitido. Comprime la imagen o el PDF antes de subirlo.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Prepare Gemini payload with tolerant responseSchema for tickets and receipts
    const promptText = `
Actúa como un experto contable y fiscal español homologado por la AEAT.
Extrae los datos fiscales de este documento español (factura o ticket simplificado). Si un dato no aparece en el documento, devuelve null. Normaliza fechas a YYYY-MM-DD e importes como números decimales.

REGLAS FISCALES OBLIGATORIAS:
1. "supplier_name": Razón social o nombre comercial del PROVEEDOR o EMISOR (quien vende o presta el servicio, NUNCA el cliente receptor). Si no aparece, null.
2. "supplier_tax_id": NIF, CIF o NIE del proveedor emisor en mayúsculas sin espacios, puntos ni guiones (ej. B12345678, 12345678Z). Si es un ticket simplificado sin NIF, devuelve null.
3. "supplier_invoice_number": Número de serie y factura o código identificativo del ticket. Si no aparece, null.
4. "issue_date": Fecha de expedición en formato ISO YYYY-MM-DD. Si no aparece, null.
5. "tax_base": Base imponible total en euros (número decimal con hasta 2 decimales). Si no está desglosada, calcúlala a partir del total y el tipo de IVA (ej. Total / 1.21).
6. "vat_rate": Tipo de IVA predominante en porcentaje (21, 10, 4 o 0).
7. "vat_total": Cuota total de IVA en euros.
8. "irpf_rate": Tipo de retención de IRPF si aplica en profesionales/alquileres (15, 7, 19, 2, 1 o 0). Si no aplica, 0 o null.
9. "irpf_total": Importe retenido en euros (0 o null si no aplica).
10. "total_amount": Importe total de la factura o ticket a pagar.
11. "suggested_pgc_category": Código de cuenta PGC sugerido según la naturaleza del gasto:
    - '600': Compras de mercaderías para la reventa.
    - '621': Arrendamientos y cánones (alquiler de local u oficina).
    - '623': Servicios de profesionales independientes (abogados, gestores, notarios, consultores).
    - '628': Suministros (electricidad, agua, gas, telefonía e internet).
    - '629': Otros servicios (software profesional, hosting, material de oficina, comidas y viajes).
12. "description": Breve resumen descriptivo y profesional del concepto.
13. "has_multiple_vat_rates": true si el documento desglosa más de un tipo de IVA distinto, false si tiene un único tipo.
`;

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            supplier_name: {
              type: 'STRING',
              description: 'Razón social del proveedor emisor o null si no aparece',
              nullable: true,
            },
            supplier_tax_id: {
              type: 'STRING',
              description: 'NIF/CIF del proveedor emisor o null si no aparece',
              nullable: true,
            },
            supplier_invoice_number: {
              type: 'STRING',
              description: 'Número de factura o ticket o null si no aparece',
              nullable: true,
            },
            issue_date: {
              type: 'STRING',
              description: 'Fecha de emisión en formato YYYY-MM-DD o null si no aparece',
              nullable: true,
            },
            tax_base: {
              type: 'NUMBER',
              description: 'Base imponible total en euros o null',
              nullable: true,
            },
            vat_rate: {
              type: 'NUMBER',
              description: 'Tipo de IVA predominante (21, 10, 4 o 0) o null',
              nullable: true,
            },
            vat_total: {
              type: 'NUMBER',
              description: 'Cuota de IVA total o null',
              nullable: true,
            },
            irpf_rate: {
              type: 'NUMBER',
              description: 'Tipo de retención IRPF (15, 7, 19, 2, 1 o 0) o null',
              nullable: true,
            },
            irpf_total: {
              type: 'NUMBER',
              description: 'Cuota de retención IRPF o null',
              nullable: true,
            },
            total_amount: {
              type: 'NUMBER',
              description: 'Total del documento en euros o null',
              nullable: true,
            },
            suggested_pgc_category: {
              type: 'STRING',
              description: 'Código PGC sugerido (600, 621, 623, 628, 629) o null',
              nullable: true,
            },
            description: {
              type: 'STRING',
              description: 'Resumen descriptivo del concepto o null',
              nullable: true,
            },
            has_multiple_vat_rates: {
              type: 'BOOLEAN',
              description: 'true si contiene múltiples tipos de IVA, false si no',
              nullable: true,
            },
          },
          required: [
            'supplier_name',
            'supplier_tax_id',
            'supplier_invoice_number',
            'issue_date',
            'tax_base',
            'vat_rate',
            'vat_total',
            'total_amount',
            'suggested_pgc_category',
            'description',
          ],
        },
      },
    };

    // 6. Configurable primary model with ordered fallback list & dynamic ListModels discovery
    const envModel = Deno.env.get('GEMINI_MODEL');
    const initialCandidates = [
      envModel,
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.8-flash',
    ].filter(Boolean) as string[];

    const candidateModels: string[] = Array.from(new Set(initialCandidates));
    const triedModels = new Set<string>();

    let lastGeminiRes: Response | null = null;
    let lastGoogleMessage = '';
    let lastGoogleStatus = '';
    let rawText: string | null = null;
    let usedModel = '';

    const executeGenerateContent = async (model: string): Promise<boolean> => {
      if (triedModels.has(model)) return false;
      triedModels.add(model);
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiPayload),
        });

        lastGeminiRes = geminiRes;

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
          if (rawText) {
            usedModel = model;
            return true;
          }
        }

        // Parse Google API error details
        let googleMessage = '';
        let googleStatus = '';
        try {
          const errJson = await geminiRes.json();
          googleMessage = errJson?.error?.message || '';
          googleStatus = errJson?.error?.status || '';
        } catch {
          try {
            googleMessage = await geminiRes.text();
          } catch {
            // ignore
          }
        }

        lastGoogleMessage = googleMessage;
        lastGoogleStatus = googleStatus;
        console.warn(`Gemini call failed for model '${model}' (HTTP ${geminiRes.status}):`, googleMessage);
      } catch (networkErr: any) {
        console.warn(`Network error calling model '${model}':`, networkErr?.message);
      }
      return false;
    };

    const isNotFoundError = (status: number, message: string, googleStatus: string): boolean => {
      const msg = (message || '').toLowerCase();
      return (
        status === 404 ||
        googleStatus === 'NOT_FOUND' ||
        msg.includes('is not found') ||
        msg.includes('not found') ||
        msg.includes('is no longer available') ||
        msg.includes('unsupported model') ||
        msg.includes('not supported')
      );
    };

    // 6.1 Try initial candidate models
    let modelNotFoundDetected = false;
    for (const model of candidateModels) {
      const ok = await executeGenerateContent(model);
      if (ok) break;

      const isNotFound = isNotFoundError(
        lastGeminiRes?.status ?? 0,
        lastGoogleMessage,
        lastGoogleStatus
      );

      if (isNotFound) {
        modelNotFoundDetected = true;
        continue;
      }

      // If credentials fail (401/403), stop immediately without looping
      if (lastGeminiRes?.status === 401 || lastGeminiRes?.status === 403) {
        break;
      }
    }

    // 6.2 Dynamic auto-discovery via ListModels if candidates failed with 404/not found
    let discoveredModelNames: string[] = [];
    if (
      !rawText &&
      modelNotFoundDetected &&
      lastGeminiRes?.status !== 401 &&
      lastGeminiRes?.status !== 403
    ) {
      console.log('Querying ListModels to discover active Gemini models for this API key...');
      try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
        const listRes = await fetch(listUrl);
        if (listRes.ok) {
          const listData = await listRes.json();
          const rawModels = Array.isArray(listData?.models) ? listData.models : [];

          const excludeTokens = ['embedding', 'aqa', 'imagen', 'veo', 'tts'];
          const validModels = rawModels
            .filter((m: any) => {
              const name = String(m?.name || '').toLowerCase();
              const methods = Array.isArray(m?.supportedGenerationMethods)
                ? m.supportedGenerationMethods
                : [];
              if (!methods.includes('generateContent')) return false;
              if (!name.includes('gemini')) return false;
              if (excludeTokens.some((tok) => name.includes(tok))) return false;
              return true;
            })
            .map((m: any) => String(m.name || '').replace(/^models\//, ''));

          discoveredModelNames = sortGeminiModels(validModels);
          console.log('Discovered compatible models for API key:', discoveredModelNames.join(', '));

          // Try up to top 3 discovered models that haven't been tried yet
          const modelsToTry = discoveredModelNames.filter((m) => !triedModels.has(m)).slice(0, 3);
          for (const model of modelsToTry) {
            console.log(`Retrying with auto-discovered model: ${model}`);
            const ok = await executeGenerateContent(model);
            if (ok) break;
          }
        } else {
          console.warn('ListModels query returned non-2xx status:', listRes.status);
        }
      } catch (listErr: any) {
        console.warn('Error fetching ListModels:', listErr?.message);
      }
    }

    if (!rawText) {
      let errorMessage = 'Error al procesar el documento con el servicio de IA.';
      const status = lastGeminiRes?.status ?? 502;

      if (
        status === 429 ||
        lastGoogleStatus === 'RESOURCE_EXHAUSTED' ||
        lastGoogleMessage.includes('quota') ||
        lastGoogleMessage.includes('rate limit')
      ) {
        errorMessage =
          'Cuota de uso de Gemini API agotada temporalmente. Por favor, inténtalo de nuevo en unos minutos.';
      } else if (
        status === 401 ||
        status === 403 ||
        lastGoogleStatus === 'UNAUTHENTICATED' ||
        lastGoogleStatus === 'PERMISSION_DENIED'
      ) {
        errorMessage = 'La clave GEMINI_API_KEY no es válida o no tiene permisos de acceso al modelo de IA.';
      } else if (status === 400 || lastGoogleStatus === 'INVALID_ARGUMENT') {
        if (
          lastGoogleMessage.toLowerCase().includes('unsupported') ||
          lastGoogleMessage.toLowerCase().includes('mime')
        ) {
          errorMessage =
            'El formato de archivo no es compatible con el modelo de IA. Utiliza imágenes JPG, PNG, WebP o documentos PDF.';
        } else {
          errorMessage = `El documento no pudo ser procesado por la IA: ${lastGoogleMessage || 'Parámetros no válidos.'}`;
        }
      } else if (isNotFoundError(status, lastGoogleMessage, lastGoogleStatus)) {
        if (discoveredModelNames.length > 0) {
          errorMessage = `Los modelos de Gemini probados (${Array.from(triedModels).join(', ')}) no están disponibles para tu clave. Modelos activos detectados en tu cuenta: ${discoveredModelNames.join(', ')}. Puedes configurar GEMINI_MODEL en Supabase Secrets con uno de ellos.`;
        } else {
          errorMessage = `Los modelos de Gemini probados (${Array.from(triedModels).join(', ')}) no están disponibles para tu clave de API (HTTP 404). Configura la variable GEMINI_MODEL en Supabase Secrets con el modelo activo de tu proyecto de Google AI Studio.`;
        }
      } else if (lastGoogleMessage) {
        errorMessage = `Error del servicio de IA: ${lastGoogleMessage}`;
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          triedModels: Array.from(triedModels),
          availableModels: discoveredModelNames,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsedOcr = JSON.parse(rawText);

    // Normalize numbers and strings with safe fallbacks
    const taxBase =
      typeof parsedOcr.tax_base === 'number' && Number.isFinite(parsedOcr.tax_base)
        ? Math.round(parsedOcr.tax_base * 100) / 100
        : 0;

    const vatRate =
      typeof parsedOcr.vat_rate === 'number' && Number.isFinite(parsedOcr.vat_rate)
        ? parsedOcr.vat_rate
        : 21;

    const vatTotal =
      typeof parsedOcr.vat_total === 'number' && Number.isFinite(parsedOcr.vat_total)
        ? Math.round(parsedOcr.vat_total * 100) / 100
        : 0;

    const irpfRate =
      typeof parsedOcr.irpf_rate === 'number' && Number.isFinite(parsedOcr.irpf_rate)
        ? parsedOcr.irpf_rate
        : 0;

    const irpfTotal =
      typeof parsedOcr.irpf_total === 'number' && Number.isFinite(parsedOcr.irpf_total)
        ? Math.round(parsedOcr.irpf_total * 100) / 100
        : 0;

    let totalAmount =
      typeof parsedOcr.total_amount === 'number' && Number.isFinite(parsedOcr.total_amount)
        ? Math.round(parsedOcr.total_amount * 100) / 100
        : 0;

    if (totalAmount === 0 && (taxBase > 0 || vatTotal > 0)) {
      totalAmount = Math.round((taxBase + vatTotal - irpfTotal) * 100) / 100;
    }

    const sanitizedData = {
      supplier_name: parsedOcr.supplier_name ? String(parsedOcr.supplier_name).trim() : '',
      supplier_tax_id: parsedOcr.supplier_tax_id ? String(parsedOcr.supplier_tax_id).trim() : '',
      supplier_invoice_number: parsedOcr.supplier_invoice_number
        ? String(parsedOcr.supplier_invoice_number).trim()
        : '',
      issue_date: parsedOcr.issue_date ? String(parsedOcr.issue_date).trim() : '',
      tax_base: taxBase,
      vat_rate: vatRate,
      vat_total: vatTotal,
      irpf_rate: irpfRate,
      irpf_total: irpfTotal,
      total_amount: totalAmount,
      suggested_pgc_category: parsedOcr.suggested_pgc_category
        ? String(parsedOcr.suggested_pgc_category).trim()
        : '629',
      description: parsedOcr.description ? String(parsedOcr.description).trim() : '',
      has_multiple_vat_rates: Boolean(parsedOcr.has_multiple_vat_rates),
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: sanitizedData,
        model: usedModel,
        fileName: fileName || 'documento.pdf',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Edge Function unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: err.message || 'Error interno inesperado en la función parse-expense-document.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
