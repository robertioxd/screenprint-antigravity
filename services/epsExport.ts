/**
 * EPS Export Service — VECTOR Edition
 * 
 * Converts a Layer's ImageData into a valid Encapsulated PostScript (EPS) file
 * using TRUE VECTOR paths (moveto, curveto, fill) instead of rasterized bitmaps.
 * 
 * Pipeline: ImageData → Binary mask → Contour tracing → Bezier curves → PostScript paths → EPS
 * 
 * Convention: Black fill = Ink area (Film Positive).
 */

import type { Layer, AdvancedConfig } from '../types';
import { traceBitmapWASM } from './potraceService';
import type { TraceResult, TracedPath } from './vectorTracer';

/**
 * Parse an SVG path data string into PostScript path commands.
 * Handles absolute (M, L, C, Z) and relative (m, l, c, z) commands.
 * Flips the Y axis for the PostScript coordinate system.
 */
function svgPathToPostScript(
    pathData: string,
    height: number,
    transform?: { sx: number, sy: number, tx: number, ty: number }
): string {
    const commands: string[] = [];

    // Default transform: scale(1, -1) and translate(0, height) if coming from Potrace,
    // but the extracted transform from Potrace usually provides the correct scale.
    const sx = transform?.sx ?? 1;
    const sy = transform?.sy ?? 1;
    const tx = transform?.tx ?? 0;
    const ty = transform?.ty ?? 0;

    // Tokenize: split into commands and numbers
    const matches = pathData.match(/[MmLlCcZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
    if (!matches) return '';

    let currentX = 0;
    let currentY = 0;
    let subpathStartX = 0;
    let subpathStartY = 0;
    let cmd = 'M';

    let i = 0;
    while (i < matches.length) {
        const token = matches[i];
        if (/[MmLlCcZz]/.test(token)) {
            cmd = token;
            i++;
        }

        if (cmd === 'Z' || cmd === 'z') {
            commands.push('closepath');
            currentX = subpathStartX;
            currentY = subpathStartY;
            cmd = ''; // Reset to avoid re-entering Z on next loop iteration
            continue;
        }

        // M, m, L, l take 2 numeric arguments
        if (cmd.match(/[MmLl]/)) {
            if (i + 1 >= matches.length) break;
            let nx = Number(matches[i]);
            let ny = Number(matches[i + 1]);
            i += 2;

            if (cmd === 'm' || cmd === 'l') {
                nx += currentX;
                ny += currentY;
            }

            if (cmd.toUpperCase() === 'M') {
                subpathStartX = nx;
                subpathStartY = ny;
            }

            currentX = nx;
            currentY = ny;

            // Apply SVG transform
            const svgX = tx + nx * sx;
            const svgY = ty + ny * sy;

            // Convert to PostScript coordinates (flip Y because PS origin is bottom-left)
            const psX = svgX;
            const psY = height - svgY;

            const psCmd = cmd.toUpperCase() === 'M' ? 'moveto' : 'lineto';
            commands.push(`${psX.toFixed(3)} ${psY.toFixed(3)} ${psCmd}`);

            // In SVG, subsequent coordinate pairs after an M are treated as L
            if (cmd === 'M') cmd = 'L';
            if (cmd === 'm') cmd = 'l';

            // C, c take 6 numeric arguments
        } else if (cmd.match(/[Cc]/)) {
            if (i + 5 >= matches.length) break;
            let nx1 = Number(matches[i]);
            let ny1 = Number(matches[i + 1]);
            let nx2 = Number(matches[i + 2]);
            let ny2 = Number(matches[i + 3]);
            let nx = Number(matches[i + 4]);
            let ny = Number(matches[i + 5]);
            i += 6;

            if (cmd === 'c') {
                nx1 += currentX; ny1 += currentY;
                nx2 += currentX; ny2 += currentY;
                nx += currentX; ny += currentY;
            }

            currentX = nx;
            currentY = ny;

            // Transform all curve points
            const sx1 = tx + nx1 * sx, sy1 = ty + ny1 * sy;
            const sx2 = tx + nx2 * sx, sy2 = ty + ny2 * sy;
            const sX = tx + nx * sx, sY = ty + ny * sy;

            commands.push(
                `${sx1.toFixed(3)} ${(height - sy1).toFixed(3)} ` +
                `${sx2.toFixed(3)} ${(height - sy2).toFixed(3)} ` +
                `${sX.toFixed(3)} ${(height - sY).toFixed(3)} curveto`
            );
        } else {
            // Failsafe exit if unrecognized token
            i++;
        }
    }

    return commands.join('\n');
}

/**
 * Convert a single Layer to a VECTOR EPS Blob.
 *
 * The Layer's ImageData alpha channel is used as the ink mask.
 * Contours are traced to Bezier curves and written as PostScript vector paths.
 *
 * @param layer - The layer to convert
 * @param config - Advanced config for DPI and size settings
 * @returns A Blob containing valid vector EPS data
 */
export async function layerToEPS(layer: Layer, config: AdvancedConfig): Promise<Blob> {
    const { data } = layer;
    const width = data.width;
    const height = data.height;

    // Calculate bounding box in PostScript points (1 point = 1/72 inch)
    const dpi = config.outputDpi || 300;
    const widthPts = (width / dpi) * 72;
    const heightPts = (height / dpi) * 72;

    // Step 1: Trace the bitmap into vector paths using Potrace WASM
    const traceResult: TraceResult = await traceBitmapWASM(data);

    // Step 2: Convert traced paths to PostScript
    const psPathCommands = buildPSPaths(traceResult, height);

    const psContent = `
% --- Separation Background (White) ---
newpath
0 0 moveto
${width.toFixed(2)} 0 lineto
${width.toFixed(2)} ${height.toFixed(2)} lineto
0 ${height.toFixed(2)} lineto
closepath
1 setgray
fill

% --- Separation Ink (Black) ---
0 setgray
${psPathCommands}
`;

    // Step 3: Build the complete EPS document
    const eps = buildVectorEPSDocument(
        width, height,
        widthPts, heightPts,
        psContent
    );

    return new Blob([eps], { type: 'application/postscript' });
}

/**
 * Convert an array of Layers to a single MULTI-COLOR VECTOR COMPOSITE EPS Blob.
 *
 * @param layers - The layers to trace and combine
 * @param config - Advanced config for DPI and size settings
 * @returns A Blob containing the composite EPS
 */
export async function layersToCompositeEPS(layers: Layer[], config: AdvancedConfig): Promise<Blob> {
    if (layers.length === 0) throw new Error("No layers provided");
    const { width, height } = layers[0].data;

    // Calculate bounding box
    const dpi = config.outputDpi || 300;
    const widthPts = (width / dpi) * 72;
    const heightPts = (height / dpi) * 72;

    const allPsCommands: string[] = [];

    // Base background
    allPsCommands.push(`
% --- Composite Background (White) ---
newpath
0 0 moveto
${width.toFixed(2)} 0 lineto
${width.toFixed(2)} ${height.toFixed(2)} lineto
0 ${height.toFixed(2)} lineto
closepath
1 setgray
fill
`);

    for (const layer of layers) {
        if (!layer.visible) continue;
        const traceResult = await traceBitmapWASM(layer.data);
        const psCmds = buildPSPaths(traceResult, height);

        // Convert hex RGB to 0-1 PostScript RGB values
        const r = layer.color.rgb.r / 255;
        const g = layer.color.rgb.g / 255;
        const b = layer.color.rgb.b / 255;

        allPsCommands.push(`
% --- Layer: ${layer.color.hex} ---
${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} setrgbcolor
${psCmds}
`);
    }

    const eps = buildVectorEPSDocument(width, height, widthPts, heightPts, allPsCommands.join('\n'));
    return new Blob([eps], { type: 'application/postscript' });
}

/**
 * Convert all traced paths into PostScript path rendering commands.
 */
function buildPSPaths(traceResult: TraceResult, pixelHeight: number): string {
    const { paths } = traceResult;

    if (paths.length === 0) {
        return '% No vector paths traced\n';
    }

    const sections: string[] = [];

    // Outer contours and holes are rendered correctly using the even-odd rule (eofill).
    // This is required because we flip the Y-axis which reverses the SVG winding direction,
    // making standard non-zero winding (fill) incorrectly fill holes.
    for (const path of paths) {
        const psCmds = svgPathToPostScript(path.d, pixelHeight, path.transform);
        if (psCmds.length > 0) {
            sections.push(`newpath\n${psCmds}\neofill`);
        }
    }

    return sections.join('\n\n');
}

/**
 * Build a complete vector EPS document.
 */
function buildVectorEPSDocument(
    pixelWidth: number,
    pixelHeight: number,
    ptsWidth: number,
    ptsHeight: number,
    psPathCommands: string
): string {
    return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${Math.round(ptsWidth)} ${Math.round(ptsHeight)}
%%HiResBoundingBox: 0.000 0.000 ${ptsWidth.toFixed(3)} ${ptsHeight.toFixed(3)}
%%Creator: ScreenPrint Pro - Antigravity (Vector Export)
%%Title: Color Separation Channel (Vector)
%%Pages: 1
%%DocumentData: Clean7Bit
%%EndComments

%%BeginProlog
%%EndProlog

%%Page: 1 1

% Save graphics state
gsave

% Scale from pixel coordinates to PostScript points
${(ptsWidth / pixelWidth).toFixed(6)} ${(ptsHeight / pixelHeight).toFixed(6)} scale

% --- Vector Paths Begin ---
${psPathCommands}
% --- Vector Paths End ---

% Restore graphics state
grestore

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
