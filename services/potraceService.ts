import { potrace, init } from 'esm-potrace-wasm';
import type { TracedPath, TraceResult } from './vectorTracer';

// Ensure WASM is initialized only once
let isInitialized = false;

export async function initPotrace() {
    if (!isInitialized) {
        await init();
        isInitialized = true;
    }
}

/**
 * Advanced Potrace options.
 */
export interface PotraceOptions {
    turdSize?: number;      // Suppress speckles of up to this many pixels (default 2)
    alphaMax?: number;      // Corner threshold parameter (default 1)
    optCurve?: boolean;     // Curve optimization (default true)
    optTolerance?: number;  // Curve optimization tolerance (default 0.2)
    threshold?: number;     // Threshold for binary layer (0-255, default 128)
    blackOnWhite?: boolean; // Default true
}

/**
 * Traces an ImageData object using Potrace WASM.
 * Returns a TraceResult matching the interface expected by epsExport.
 * 
 * @param imageData - The layer's image data
 * @param options - Potrace configuration
 */
export async function traceBitmapWASM(
    imageData: ImageData,
    options: PotraceOptions = {}
): Promise<TraceResult> {
    await initPotrace();

    const width = imageData.width;
    const height = imageData.height;

    // Default configuration for high-quality screen print positives
    const config = {
        turdSize: typeof options.turdSize === 'number' ? options.turdSize : 2,
        alphaMax: typeof options.alphaMax === 'number' ? options.alphaMax : 1,
        optCurve: options.optCurve !== false,
        optTolerance: typeof options.optTolerance === 'number' ? options.optTolerance : 0.2,
        blackOnWhite: options.blackOnWhite !== false,
        threshold: typeof options.threshold === 'number' ? options.threshold : 128
    };

    // Step 1: Potrace requires a pure binary or grayscale image. Usually it relies on the alpha channel 
    // or luminance. For our layers, the ink is in the RGB AND Alpha, but usually Alpha determines presence.
    // esm-potrace-wasm generally expects an ImageBitmapSource (ImageData works).
    // Let's create an optimized offscreen canvas or pure binary ImageData to feed to Potrace to ensure
    // we strictly trace the Alpha channel (since our layers might be tinted).

    // Convert to a strict B&W ImageData where ink (alpha >= threshold) is black, and empty is white.
    // Potrace by default traces black on white.
    const binaryData = new ImageData(width, height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        const alpha = imageData.data[i + 3];
        // Potrace with blackOnWhite:true traces DARK (0) pixels as the foreground shape.
        // Ink pixels → BLACK (0), empty pixels → WHITE (255).
        const isInk = alpha >= config.threshold;
        const color = isInk ? 0 : 255;

        binaryData.data[i] = color; // R
        binaryData.data[i + 1] = color; // G
        binaryData.data[i + 2] = color; // B
        binaryData.data[i + 3] = 255;   // A
    }

    try {
        // Step 2: Trace the binary bitmap to SVG
        // Note: The esm-potrace-wasm interface accepts general potrace parameters.
        const svgString = await potrace(binaryData, {
            turdSize: config.turdSize,
            alphaMax: config.alphaMax,
            optCurve: config.optCurve,
            optTolerance: config.optTolerance,
            blackOnWhite: config.blackOnWhite,
            color: 'black'
        });

        // Debug removed — uncomment to inspect SVG output:
        // console.log("POTRACE SVG:", svgString.substring(0, 500));

        // Step 3: Parse the returned SVG to extract path logic
        // Potrace typically returns an SVG containing one or more `<path>` elements.
        const paths = extractPathsFromSVG(svgString);

        return {
            paths,
            width,
            height
        };

    } catch (err) {
        console.error("Potrace WASM error:", err);
        throw err;
    }
}

/**
 * Extracts SVG path strings (`d` attribute) and transform matrices from an SVG string
 */
function extractPathsFromSVG(svgString: string): TracedPath[] {
    const paths: TracedPath[] = [];

    // We are in the browser, so we can use DOMParser for robust SVG parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');

    // Potrace WASM outputs multiple <g> elements for different colors.
    // We only want the black #000000 shape (the ink we specified).
    const inkGroup = doc.querySelector('g[fill="#000000"]');
    if (!inkGroup) {
        console.warn("No ink group found in Potrace SVG.");
        return [];
    }

    // Extract scale from transform: e.g. "translate(0.000000,928.000000) scale(0.100000,-0.100000)"
    const transformStr = inkGroup.getAttribute('transform') || '';
    let sx = 1, sy = 1, tx = 0, ty = 0;

    const scaleMatch = transformStr.match(/scale\(([^,]+),([^)]+)\)/);
    if (scaleMatch) {
        sx = parseFloat(scaleMatch[1]);
        sy = parseFloat(scaleMatch[2]);
    }

    const translateMatch = transformStr.match(/translate\(([^,]+),([^)]+)\)/);
    if (translateMatch) {
        tx = parseFloat(translateMatch[1]);
        ty = parseFloat(translateMatch[2]);
    }

    const pathNodes = inkGroup.querySelectorAll('path');
    pathNodes.forEach(node => {
        const d = node.getAttribute('d');
        if (d) {
            paths.push({
                d,
                isOuter: true, // Potrace handles winding rules in compound paths
                transform: { sx, sy, tx, ty }
            });
        }
    });

    return paths;
}
