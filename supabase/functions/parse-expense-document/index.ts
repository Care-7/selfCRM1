import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
    // 2. Validate Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'No se ha proporcionado un token de autorización válido.' }),
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

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Sesión no válida o expirada. Por favor, vuelve a iniciar sesión.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Read GEMINI_API_KEY strictly in server
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error:
            'El servicio de inteligencia artificial no está configurado (falta GEMINI_API_KEY en Supabase Edge Function Secrets).',
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

    // 5. Call Gemini 2.5 Flash API with strict responseSchema
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const promptText = `
Actúa como un experto contable y fiscal español homologado por la AEAT.
Analiza este documento (factura o ticket de gasto recibido en España) y extrae sus datos fiscales con máxima fidelidad.

REGLAS FISCALES OBLIGATORIAS:
1. "supplier_name": Razón social o nombre comercial del PROVEEDOR o EMISOR (quien vende o presta el servicio, NUNCA el cliente receptor).
2. "supplier_tax_id": NIF, CIF o NIE del proveedor emisor en mayúsculas sin espacios, puntos ni guiones (ej. B12345678, 12345678Z).
3. "supplier_invoice_number": Número de serie y factura o código del ticket.
4. "issue_date": Fecha de expedición en formato ISO YYYY-MM-DD.
5. "tax_base": Base imponible total en euros (número con hasta 2 decimales).
6. "vat_rate": Tipo de IVA predominante en porcentaje (21, 10, 4 o 0).
7. "vat_total": Cuota total de IVA en euros.
8. "irpf_rate": Tipo de retención de IRPF si aplica en profesionales/alquileres (15, 7, 19, 2, 1 o 0).
9. "irpf_total": Importe retenido en euros (0 si no aplica).
10. "total_amount": Importe total de la factura o ticket a pagar.
11. "suggested_pgc_category": Código de cuenta PGC sugerido según la naturaleza del gasto:
    - '600': Compras de mercaderías para la reventa.
    - '621': Arrendamientos y cánones (alquiler de local u oficina).
    - '623': Servicios de profesionales independientes (abogados, gestores, notarios, consultores).
    - '628': Suministros (electricidad, agua, gas, telefonía e internet).
    - '629': Otros servicios (software profesional, hosting, material de oficina, viajes y dietas).
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
              description: 'Razón social del proveedor emisor',
            },
            supplier_tax_id: {
              type: 'STRING',
              description: 'NIF/CIF del proveedor normalizado en mayúsculas sin guiones',
            },
            supplier_invoice_number: {
              type: 'STRING',
              description: 'Número de factura o ticket',
            },
            issue_date: {
              type: 'STRING',
              description: 'Fecha de emisión en formato YYYY-MM-DD',
            },
            tax_base: {
              type: 'NUMBER',
              description: 'Base imponible total',
            },
            vat_rate: {
              type: 'NUMBER',
              description: 'Tipo de IVA predominante (21, 10, 4 o 0)',
            },
            vat_total: {
              type: 'NUMBER',
              description: 'Cuota de IVA total',
            },
            irpf_rate: {
              type: 'NUMBER',
              description: 'Tipo de retención IRPF (15, 7, 19, 2, 1 o 0)',
            },
            irpf_total: {
              type: 'NUMBER',
              description: 'Cuota de retención IRPF',
            },
            total_amount: {
              type: 'NUMBER',
              description: 'Total del documento',
            },
            suggested_pgc_category: {
              type: 'STRING',
              description: 'Código PGC sugerido (600, 621, 623, 628, 629)',
            },
            description: {
              type: 'STRING',
              description: 'Resumen descriptivo del concepto',
            },
            has_multiple_vat_rates: {
              type: 'BOOLEAN',
              description: 'true si contiene múltiples tipos de IVA',
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

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return new Response(
        JSON.stringify({
          error: `Error al procesar el documento con la IA de Gemini: ${geminiRes.statusText}`,
          details: errText,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: 'La IA no devolvió datos estructurados para este documento.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsedOcr = JSON.parse(rawText);

    return new Response(
      JSON.stringify({
        success: true,
        data: parsedOcr,
        fileName: fileName || 'documento.pdf',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Edge Function unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: err.message || 'Error interno inesperado en la Edge Function parse-expense-document.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
