import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Actúa como un Ingeniero experto en Separación de Color para Serigrafía Textil (Screen Printing). Tu objetivo es analizar la imagen proporcionada y determinar la configuración técnica óptima para separarla en canales de color.

Debes devolver ONLY a JSON object with the following structure:
{
  "separationType": "vector" | "raster",
  "denoiseStrength": number (0-50),
  "denoiseSpatial": number (0-15),
  "cleanupStrength": number (0-10),
  "minCoverage": number (0.0-5.0),
  "useRasterAdaptive": boolean,
  "useSubstrateKnockout": boolean,
  "substrateColorHex": string (#RRGGBB),
  "substrateThreshold": number (0-100),
  "gamma": number (0.1-3.0),
  "halftoneLpi": number (30-90),
  "halftoneAngle": number (0-90),
  "reasoning": string (Explica brevemente por qué elegiste esta configuración)
}
`

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { image, prompt } = await req.json()

        // 1. Get Secret
        const apiKey = Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) {
            console.error("Missing GEMINI_API_KEY")
            throw new Error('GEMINI_API_KEY is not set in Edge Function secrets')
        }

        // 2. Initialize Supabase Client for RAG
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')
        const supabase = createClient(supabaseUrl!, supabaseKey!)

        // 3. Fetch RAG Context (Verified Memories)
        // We try to fetch context, but don't fail if it errors (e.g. table verify fails)
        let ragContext = ""
        try {
            const { data: memories } = await supabase
                .from('ai_memory')
                .select('final_config, separation_type, image_metadata')
                .eq('is_verified', true)
                .limit(3)
                .order('created_at', { ascending: false })

            if (memories && memories.length > 0) {
                ragContext = "\n\nAquí tienes ejemplos de configuraciones exitosas anteriores:\n" + JSON.stringify(memories, null, 2)
            }
        } catch (ragError) {
            console.warn("RAG Context fetch failed, proceeding without it:", ragError)
        }

        // 4. Construct Prompt
        const fullPrompt = `${SYSTEM_PROMPT}\n${ragContext}\n\nInstrucción del usuario: ${prompt || "Analiza esta imagen y dame la mejor configuración."}`

        console.log("Calling Gemini API...")

        // 5. Call Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

        const response = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: fullPrompt },
                        { inline_data: { mime_type: "image/png", data: image.replace(/^data:image\/\w+;base64,/, "") } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2, // Low temp for deterministic output
                    response_mime_type: "application/json"
                }
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error("Gemini API Error:", errorText)
            throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`)
        }

        const data = await response.json()
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!textResult) {
            throw new Error("No text result from Gemini")
        }

        let parsedResult
        try {
            parsedResult = JSON.parse(textResult)
        } catch (e) {
            // Fallback cleanup if JSON is wrapped in markdown code blocks
            const cleanText = textResult.replace(/```json/g, '').replace(/```/g, '')
            try {
                parsedResult = JSON.parse(cleanText)
            } catch (e2) {
                console.error("Failed to parse Gemini JSON:", textResult)
                throw new Error("Invalid JSON response from Gemini")
            }
        }

        return new Response(JSON.stringify(parsedResult), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error("Edge Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
