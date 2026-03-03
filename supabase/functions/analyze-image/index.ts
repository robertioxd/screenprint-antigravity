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
  "gamma": number (0.1-3.0),
  "halftoneLpi": number (30-90),
  "halftoneAngle": number (0-90),
  "useVectorAntiAliasing": boolean,
  "vectorAASigma": number (0.1-5.0),
  "spotHardness": number (0.0-1.0),
  "blendEnabled": [boolean, boolean, boolean, boolean],
  "blendTolerances": [number, number, number, number],
  "alphaThreshold": number (0.0-0.1),
  "alphaStrength": number (0.0-1.0),
  "ubStrength": number (0.0-2.0),
  "ubGamma": number (0.1-3.0),
  "underbaseChoke": number (0-5),
  "reasoning": string (Explica brevemente por qué elegiste esta configuración)
}
`

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { image, metadata, prompt } = await req.json()

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

        // 3. Fetch RAG Context (Verified Memories) via Vector Similarity
        let ragContext = ""
        try {
            // A. Generate Descriptive Text for the query image
            const descriptionPrompt = `Actúa como un analista experto en serigrafía textil.
He analizado matemáticamente la imagen adjunta y obtenido estos datos:
- Dimensiones: ${metadata?.width || 'N/A'}x${metadata?.height || 'N/A'}
- Número de colores: ${metadata?.num_colors || 'N/A'}
- Paleta Hexadecimal: ${metadata?.palette_hex?.join(', ') || 'N/A'}

Genera UNA sola descripción técnica y concisa (máximo 2 párrafos) destacando el ESTILO VISUAL de la imagen y las CARACTERÍSTICAS DEL BORDE (fotorrealista, ilustración, bordes limpios, medios tonos, vector, etc.). No inventes colores.`;

            const geminiVisionUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            const visionResponse = await fetch(geminiVisionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: descriptionPrompt },
                            { inline_data: { mime_type: "image/png", data: image.replace(/^data:image\/\w+;base64,/, "") } }
                        ]
                    }],
                    generationConfig: { temperature: 0.3 }
                })
            });

            if (visionResponse.ok) {
                const visionData = await visionResponse.json();
                const descriptiveText = visionData.candidates?.[0]?.content?.parts?.[0]?.text;

                if (descriptiveText) {
                    const finalVectorText = `Data:\nColors: ${metadata?.num_colors || 'N/A'}\nHex: ${metadata?.palette_hex?.join(', ') || 'N/A'}\n\nStyle:\n${descriptiveText}`;

                    // B. Embed the text
                    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
                    const embedResponse = await fetch(embedUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "models/text-embedding-004",
                            content: { parts: [{ text: finalVectorText }] }
                        })
                    });

                    if (embedResponse.ok) {
                        const embedData = await embedResponse.json();
                        const queryEmbedding = embedData.embedding?.values;

                        if (queryEmbedding && Array.isArray(queryEmbedding)) {
                            // C. Query RPC
                            // Set threshold low enough to find at least something, or rely on count (LIMIT 3). cosine distance < 0.8 => similarity > 0.2
                            const { data: memories, error: rpcError } = await supabase.rpc('match_ai_memory', {
                                query_embedding: queryEmbedding,
                                match_threshold: 0.4,
                                match_count: 3
                            });

                            if (rpcError) {
                                console.error("RAG RPC error:", rpcError);
                            } else if (memories && memories.length > 0) {
                                // Exclude the embeddings/ids from JSON stringification to save tokens
                                const cleanMemories = memories.map((m: any) => ({
                                    final_config: m.final_config,
                                    separation_type: m.separation_type,
                                    similarity_score: m.similarity
                                }));
                                ragContext = "\n\nAquí tienes ejemplos de configuraciones exitosas anteriores para imágenes SIMILARES guardadas en memoria:\n" + JSON.stringify(cleanMemories, null, 2);
                            } else {
                                console.log("RAG RPC returned 0 matches above threshold.");
                            }
                        }
                    } else {
                        console.error("Gemini Embed Failed:", await embedResponse.text());
                    }
                }
            } else {
                console.error("Gemini Vision Failed:", await visionResponse.text());
            }
        } catch (ragError) {
            console.warn("RAG Context fetch failed, proceeding without it:", ragError);
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
