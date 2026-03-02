/**
 * Potrace-lite: Pure TypeScript bitmap-to-vector tracer
 * 
 * Implements a simplified but production-quality contour tracing algorithm
 * that converts binary bitmaps into SVG-style path data (M, L, C, Z commands).
 * 
 * Based on the Suzuki-Abe contour tracing algorithm with Bezier curve fitting.
 * Optimized for screen printing separation masks (binary images).
 */

export interface TracedPath {
    d: string;           // SVG path string ('M... L... C... Z')
    isOuter?: boolean;   // Whether this is an outer contour or a hole
    transform?: {        // Optional SVG transform matrix to apply (e.g. from Potrace)
        sx: number;
        sy: number;
        tx: number;
        ty: number;
    }
}

export interface TraceResult {
    paths: TracedPath[];
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
}

// Direction vectors for 8-connectivity (clockwise from east)
const DIR_X = [1, 1, 0, -1, -1, -1, 0, 1];
const DIR_Y = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * Trace a binary bitmap (from ImageData alpha channel) into vector paths.
 * 
 * @param imageData - The ImageData of the layer
 * @param alphaThreshold - Alpha value threshold to consider a pixel as "ink" (default 128)
 * @returns TraceResult containing SVG-compatible path data
 */
export function traceBitmap(imageData: ImageData, alphaThreshold: number = 128): TraceResult {
    const { width, height, data } = imageData;

    // Step 1: Build binary bitmap from alpha channel
    const bitmap = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        bitmap[i] = data[i * 4 + 3] >= alphaThreshold ? 1 : 0;
    }

    // Step 2: Find all contours using the Suzuki-Abe algorithm
    const contours = findContours(bitmap, width, height);

    // Step 3: Simplify contours using Douglas-Peucker
    const simplified = contours.map(c => ({
        points: douglasPeucker(c.points, 1.0),
        isOuter: c.isOuter
    }));

    // Step 4: Fit smooth Bezier curves to simplified contours
    const paths: TracedPath[] = simplified
        .filter(c => c.points.length >= 3)
        .map(c => ({
            d: pointsToSVGPath(c.points, true),
            isOuter: c.isOuter
        }));

    return { paths, width, height };
}

/**
 * Find contours in a binary image using a modified Suzuki-Abe algorithm.
 */
function findContours(bitmap: Uint8Array, w: number, h: number): { points: Point[], isOuter: boolean }[] {
    // Create a padded copy to simplify boundary handling
    const padW = w + 2;
    const padH = h + 2;
    const padded = new Int32Array(padW * padH);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            padded[(y + 1) * padW + (x + 1)] = bitmap[y * w + x];
        }
    }

    const contours: { points: Point[], isOuter: boolean }[] = [];
    const labels = new Int32Array(padW * padH); // label map
    let currentLabel = 1;

    for (let y = 1; y < padH - 1; y++) {
        for (let x = 1; x < padW - 1; x++) {
            const idx = y * padW + x;

            if (padded[idx] !== 1) continue;

            // Check if this is an outer border (pixel above is 0)
            const isOuterBorder = padded[(y - 1) * padW + x] === 0 && labels[idx] === 0;
            // Check if this is a hole border (pixel below is 0)
            const isHoleBorder = padded[(y + 1) * padW + x] === 0 && labels[(y + 1) * padW + x] === 0;

            if (!isOuterBorder && !isHoleBorder) continue;

            let startDir: number;
            let isOuter: boolean;

            if (isOuterBorder) {
                startDir = 6; // start looking up
                isOuter = true;
                currentLabel++;
                labels[idx] = currentLabel;
            } else {
                startDir = 2; // start looking down
                isOuter = false;
            }

            // Trace the contour using Moore neighborhood tracing
            const points: Point[] = [];
            let cx = x, cy = y;
            let dir = startDir;
            let firstStep = true;

            do {
                points.push({ x: cx - 1, y: cy - 1 }); // Remove padding offset

                // Search for next border pixel (rotate clockwise)
                let found = false;
                for (let i = 0; i < 8; i++) {
                    const nd = (dir + i) % 8;
                    const nx = cx + DIR_X[nd];
                    const ny = cy + DIR_Y[nd];

                    if (nx >= 0 && nx < padW && ny >= 0 && ny < padH && padded[ny * padW + nx] === 1) {
                        labels[ny * padW + nx] = currentLabel;
                        cx = nx;
                        cy = ny;
                        dir = (nd + 5) % 8; // Turn back (opposite + 1)
                        found = true;
                        break;
                    }
                }

                if (!found) break;
                if (firstStep) firstStep = false;

            } while (cx !== x || cy !== y);

            if (points.length >= 3) {
                contours.push({ points, isOuter });
            }
        }
    }

    return contours;
}

/**
 * Douglas-Peucker line simplification algorithm.
 * Reduces the number of points while preserving shape.
 */
function douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from the line segment
    let maxDist = 0;
    let maxIdx = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const d = perpendicularDistance(points[i], start, end);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }

    // If max distance exceeds epsilon, recursively simplify
    if (maxDist > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIdx), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [start, end];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        const ex = point.x - lineStart.x;
        const ey = point.y - lineStart.y;
        return Math.sqrt(ex * ex + ey * ey);
    }

    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    const ex = point.x - projX;
    const ey = point.y - projY;
    return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Convert an array of points into an SVG path string with smooth cubic Bezier curves.
 * Uses Catmull-Rom to cubic Bezier conversion for smooth curves through all points.
 */
function pointsToSVGPath(points: Point[], closed: boolean): string {
    if (points.length < 2) return '';

    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}` + (closed ? ' Z' : '');
    }

    const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

    // Use Catmull-Rom spline → Cubic Bezier conversion for smooth curves
    const n = points.length;
    const tension = 0.5; // Catmull-Rom tension

    for (let i = 0; i < n - 1; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];

        // Catmull-Rom to cubic Bezier control points
        const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 3;

        parts.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
    }

    if (closed) {
        parts.push('Z');
    }

    return parts.join(' ');
}
