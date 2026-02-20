/**
 * EPS Export Service
 * Converts a Layer's ImageData into a valid Encapsulated PostScript (EPS) file.
 * Each EPS is a grayscale raster image suitable for I-Image CTS plate makers.
 *
 * Convention: Black = Ink, White = No Ink (Film Positive).
 */

import type { Layer, AdvancedConfig } from '../types';

/**
 * Convert a single Layer to an EPS Blob.
 *
 * The Layer's ImageData alpha channel is used as the ink mask:
 * - Alpha > 0 → Black pixel (ink present)
 * - Alpha = 0 → White pixel (no ink)
 *
 * @param layer - The layer to convert
 * @param config - Advanced config for DPI and size settings
 * @returns A Blob containing valid EPS data
 */
export function layerToEPS(layer: Layer, config: AdvancedConfig): Blob {
    const { data } = layer;
    const width = data.width;
    const height = data.height;

    // Calculate bounding box in PostScript points (1 point = 1/72 inch)
    const dpi = config.outputDpi || 300;
    const widthPts = Math.round((width / dpi) * 72);
    const heightPts = Math.round((height / dpi) * 72);

    // Extract grayscale mask from the alpha channel
    // Convention: black (0x00) = ink, white (0xFF) = no ink
    const pixels = data.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
    const grayscaleSize = width * height;
    const grayscale = new Uint8Array(grayscaleSize);

    for (let i = 0; i < grayscaleSize; i++) {
        const alpha = pixels[i * 4 + 3]; // Alpha channel
        // Invert: alpha 255 (opaque/ink) → 0x00 (black), alpha 0 (transparent) → 0xFF (white)
        grayscale[i] = 255 - alpha;
    }

    // Encode pixel data as ASCII Hex (most compatible with CTS RIPs)
    const hexData = encodeASCIIHex(grayscale);

    // Build the EPS file content
    const eps = buildEPSDocument(width, height, widthPts, heightPts, hexData);

    return new Blob([eps], { type: 'application/postscript' });
}

/**
 * Encode a Uint8Array as an ASCII Hex string.
 * Each byte becomes two hex characters. Lines are wrapped at 72 chars for PostScript compliance.
 */
function encodeASCIIHex(data: Uint8Array): string {
    const hexChars = '0123456789abcdef';
    const parts: string[] = [];
    let line = '';

    for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        line += hexChars[(byte >> 4) & 0x0f];
        line += hexChars[byte & 0x0f];

        // PostScript convention: wrap lines at ~72 characters
        if (line.length >= 72) {
            parts.push(line);
            line = '';
        }
    }

    // Flush remaining hex chars
    if (line.length > 0) {
        parts.push(line);
    }

    return parts.join('\n');
}

/**
 * Build a complete EPS document string.
 */
function buildEPSDocument(
    pixelWidth: number,
    pixelHeight: number,
    ptsWidth: number,
    ptsHeight: number,
    hexData: string
): string {
    // PostScript image matrix: maps pixel coordinates to point coordinates
    // [width 0 0 -height 0 height] flips Y axis (screen coords → PS coords)
    return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${ptsWidth} ${ptsHeight}
%%HiResBoundingBox: 0.0 0.0 ${ptsWidth}.0 ${ptsHeight}.0
%%Creator: ScreenPrint Pro - Antigravity
%%Title: Color Separation Channel
%%Pages: 1
%%EndComments

%%BeginProlog
%%EndProlog

%%Page: 1 1

% Scale to bounding box
${ptsWidth} ${ptsHeight} scale

% Image operator: width height bits/sample [matrix] datasrc image
${pixelWidth} ${pixelHeight} 8
[${pixelWidth} 0 0 -${pixelHeight} 0 ${pixelHeight}]
{currentfile ${pixelWidth} string readhexstring pop}
image
${hexData}

%%Trailer
%%EOF
`;
}

/**
 * Generate a safe filename for the EPS file.
 * @param index - Layer index (1-based)
 * @param colorHex - Hex color string (e.g., "#FF0000")
 * @returns A filename like "01_FF0000.eps"
 */
export function generateEPSFilename(index: number, colorHex: string): string {
    const cleanHex = colorHex.replace('#', '').toUpperCase();
    const paddedIndex = String(index).padStart(2, '0');
    return `${paddedIndex}_${cleanHex}.eps`;
}
