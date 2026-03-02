import "jsr:@supabase/functions-js/edge-runtime.d.ts";


/**
 * render-hires Edge Function
 * 
 * Accepts a PDF/AI file (base64) and renders it at high DPI using pdf.js
 * in a server-side Deno environment. Returns the rasterized image as base64 PNG.
 * 
 * This bypasses the browser canvas limitations and provides consistent
 * 300 DPI rendering regardless of client device capabilities.
 * 
 * Request body:
 *   { fileBase64: string, dpi?: number, maxWidth?: number }
 * 
 * Response:
 *   { imageBase64: string, width: number, height: number, effectiveDpi: number }
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use a canvas polyfill for server-side rendering
// We use the Deno-compatible canvas library
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs";
const PDFJS_WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs";

Deno.serve(async (req: Request) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { fileBase64, dpi = 300, maxWidth = 6000 } = await req.json();

        if (!fileBase64) {
            throw new Error("Missing 'fileBase64' in request body");
        }

        console.log(`[render-hires] Starting render at ${dpi} DPI, maxWidth=${maxWidth}`);

        // 1. Decode the file from base64
        const binaryString = atob(fileBase64.replace(/^data:[^;]+;base64,/, ""));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // 2. Load pdf.js dynamically
        const pdfjsLib = await import(PDFJS_CDN);

        // Disable worker in Deno environment (single-threaded)
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";

        // 3. Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // 4. Calculate scale for target DPI
        // PDF default is 72 DPI, so scale = targetDPI / 72
        const scale = dpi / 72;
        const viewport = page.getViewport({ scale });

        let renderWidth = Math.round(viewport.width);
        let renderHeight = Math.round(viewport.height);

        // Cap at maxWidth to prevent memory issues
        if (renderWidth > maxWidth) {
            const ratio = maxWidth / renderWidth;
            renderWidth = maxWidth;
            renderHeight = Math.round(renderHeight * ratio);
        }

        console.log(`[render-hires] Viewport: ${renderWidth}x${renderHeight} (scale=${scale.toFixed(2)})`);

        // 5. Create OffscreenCanvas for rendering
        // Supabase Edge Functions support OffscreenCanvas in Deno
        const canvas = new OffscreenCanvas(renderWidth, renderHeight);
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error("Failed to create OffscreenCanvas 2D context");
        }

        // Fill with white background
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, renderWidth, renderHeight);

        // 6. Render PDF page
        const adjustedViewport = page.getViewport({
            scale: renderWidth / (page.getViewport({ scale: 1 }).width)
        });

        await page.render({
            canvasContext: context,
            viewport: adjustedViewport,
        }).promise;

        console.log(`[render-hires] Page rendered successfully`);

        // 7. Export as PNG blob
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const arrayBuffer = await blob.arrayBuffer();

        // Convert to base64
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryStr = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            binaryStr += String.fromCharCode(...chunk);
        }
        const base64Image = btoa(binaryStr);

        const effectiveDpi = Math.round((renderWidth / (page.getViewport({ scale: 1 }).width)) * 72);

        console.log(`[render-hires] Complete: ${renderWidth}x${renderHeight} at ~${effectiveDpi} DPI, output size: ${(base64Image.length / 1024 / 1024).toFixed(1)}MB`);



        // Return both the PNG for preview and raw pixel dimensions
        return new Response(JSON.stringify({
            imageBase64: `data:image/png;base64,${base64Image}`,
            width: renderWidth,
            height: renderHeight,
            effectiveDpi: effectiveDpi,
            pixelCount: renderWidth * renderHeight,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("[render-hires] Error:", error);
        return new Response(JSON.stringify({
            error: error.message,
            hint: "Ensure the file is a valid PDF/AI with 'Create PDF Compatible File' enabled.",
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
