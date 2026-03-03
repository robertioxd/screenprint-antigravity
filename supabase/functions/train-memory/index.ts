import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const payload = await req.json()
        const { image, final_config, separation_type, image_metadata } = payload

        if (!image || !final_config || !separation_type || !image_metadata) {
            throw new Error('Missing required fields: image, final_config, separation_type, image_metadata')
        }

        // 1. Get Gemini API Key
        const apiKey = Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set in Edge Function secrets')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')
        const supabase = createClient(supabaseUrl!, supabaseKey!)

        // 2. Generate Descriptive Text using Gemini 1.5 Flash Vision
        const descriptionPrompt = `Actúa como un analista experto en serigrafía textil.
He analizado matemáticamente la imagen adjunta y he obtenido estos datos exactos:
- Dimensiones: ${image_metadata.width}x${image_metadata.height}
- Número de colores: ${image_metadata.num_colors}
- Paleta Hexadecimal: ${image_metadata.palette_hex.join(', ')}
- Tiene Underbase (Blanco Base): ${image_metadata.has_underbase ? 'Sí' : 'No'}
- Tipo de separación usada: ${separation_type}
- Pares de colores bloqueados (Anti-muddying): ${image_metadata.blocked_pairs_count}

Basándote en la imagen y estos datos, genera UNA sola descripción técnica y concisa (máximo 2 párrafos) que destaque el **ESTILO VISUAL** de la imagen y las **CARACTERÍSTICAS DEL BORDE**.
Enfócate en palabras clave como: Alto contraste, bajo contraste, fotorrealista, ilustración vectorial, bordes limpios (aliased), bordes difuminados (anti-aliased/halftones), tintas planas, acuarela, desgaste (vintage/distressed), trazos finos, masas sólidas, etc.
No inventes colores, cíñete a los proporcionados. Esta descripción se convertirá en un vector para recuperar la técnica de separación de color adecuada ("RAG").`;

        console.log("[Train Memory] Generating stylistic description...")
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        const visionResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: descriptionPrompt },
                        { inline_data: { mime_type: "image/png", data: image.replace(/^data:image\/\w+;base64,/, "") } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.3, // Low temp for more factual descriptions
                }
            })
        })

        if (!visionResponse.ok) {
            const errorText = await visionResponse.text()
            throw new Error(`Gemini Vision API Error: ${visionResponse.status} - ${errorText}`)
        }

        const visionData = await visionResponse.json()
        const descriptiveText = visionData.candidates?.[0]?.content?.parts?.[0]?.text

        if (!descriptiveText) {
            throw new Error("Failed to generate description from Gemini")
        }

        // Combine deterministic data + semantic description for the vector
        const finalVectorText = `Data:\nColors: ${image_metadata.num_colors}\nHex: ${image_metadata.palette_hex.join(', ')}\n\nStyle:\n${descriptiveText}`
        console.log("[Train Memory] Final text for embedding:", finalVectorText)

        // 3. Generate Vector Embedding using text-embedding-004
        console.log("[Train Memory] Generating text embedding...")
        const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`
        const embedResponse = await fetch(embedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: {
                    parts: [{ text: finalVectorText }]
                }
            })
        })

        if (!embedResponse.ok) {
            const errorText = await embedResponse.text()
            throw new Error(`Gemini Embed API Error: ${embedResponse.status} - ${errorText}`)
        }

        const embedData = await embedResponse.json()
        const embedding = embedData.embedding?.values

        if (!embedding || !Array.isArray(embedding)) {
            throw new Error("Failed to get valid embedding array from Gemini")
        }

        // 4. Save everything to Supabase ai_memory
        console.log("[Train Memory] Saving to Supabase...")
        const { error: dbError } = await supabase
            .from('ai_memory')
            .insert({
                image_embedding: embedding, // Supabase pgvector handles JS arrays
                final_config: final_config,
                separation_type: separation_type,
                image_metadata: { ...image_metadata, rag_description: finalVectorText }, // Store the descriptive text for debugging/reference
                is_verified: true,
            })

        if (dbError) {
            throw new Error(`Supabase Insert Error: ${dbError.message}`)
        }

        return new Response(JSON.stringify({ success: true, message: "Memory trained securely." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error("[Train Memory] Edge Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
