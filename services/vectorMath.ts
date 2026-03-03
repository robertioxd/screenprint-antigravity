// services/vectorMath.ts

/**
 * Calculates the Euclidean distance between two colors in 3D RGB space.
 * Assuming inputs are [r, g, b] where components are 0-1 or 0-255 (must be consistent)
 */
export function colorDistance3D(a: number[], b: number[]): number {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Calculates distance from a point to a line segment defined by points a and b.
 */
export function distanceToLineSegment(point: number[], a: number[], b: number[]): number {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];

    const abLen2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if (abLen2 === 0) return colorDistance3D(point, a);

    let t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLen2;
    t = Math.max(0, Math.min(1, t));

    const closest = [
        a[0] + t * ab[0],
        a[1] + t * ab[1],
        a[2] + t * ab[2]
    ];

    return colorDistance3D(point, closest);
}

/**
 * Calculates distance from a point to a triangle defined by points a, b, and c.
 */
export function distanceToTriangle(point: number[], a: number[], b: number[], c: number[]): number {
    // Calculate normal of triangle
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];

    const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
    ];

    const normLen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (normLen === 0) {
        // Degenerate triangle, use line distance
        return Math.min(
            distanceToLineSegment(point, a, b),
            distanceToLineSegment(point, b, c),
            distanceToLineSegment(point, a, c)
        );
    }

    // Distance to plane
    const ap = [point[0] - a[0], point[1] - a[1], point[2] - a[2]];
    const dist = Math.abs(ap[0] * normal[0] + ap[1] * normal[1] + ap[2] * normal[2]) / normLen;

    return dist;
}

/**
 * Calculates distance to a convex hull given a set of vertices.
 * Simplified algorithm that checks vertices, lines, and triangles.
 */
export function distanceToConvexHull(point: number[], vertices: number[][]): number {
    let minDist = Infinity;

    for (const v of vertices) {
        const d = colorDistance3D(point, v);
        minDist = Math.min(minDist, d);
    }

    if (vertices.length >= 2) {
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                const d = distanceToLineSegment(point, vertices[i], vertices[j]);
                minDist = Math.min(minDist, d);
            }
        }
    }

    if (vertices.length >= 3) {
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                for (let k = j + 1; k < vertices.length; k++) {
                    const d = distanceToTriangle(point, vertices[i], vertices[j], vertices[k]);
                    minDist = Math.min(minDist, d);
                }
            }
        }
    }

    return minDist;
}

/**
 * Performs Iterative Furthest Point Sampling (IFPS) to find extreme colors.
 * Useful for automated spot color selection (gamut boundary detection).
 * 
 * @param pixels Array of RGB colors as [r,g,b] (normalized to 0-1)
 * @param numPoints How many points to select
 * @returns Array of furthest points [r,g,b]
 */
export function iterativeFurthestPointSampling(pixels: number[][], numPoints: number): number[][] {
    if (pixels.length === 0) return [];

    const result: number[][] = [];

    // Step 1: Find mean color
    let meanR = 0, meanG = 0, meanB = 0;
    for (const p of pixels) {
        meanR += p[0];
        meanG += p[1];
        meanB += p[2];
    }
    const n = pixels.length;
    const mean = [meanR / n, meanG / n, meanB / n];

    // Step 2: Find furthest from mean (Point A)
    let maxDist = -1;
    let furthest = pixels[0];
    for (const p of pixels) {
        const d = colorDistance3D(p, mean);
        if (d > maxDist) {
            maxDist = d;
            furthest = p;
        }
    }
    result.push([...furthest]);

    // Step 3+: Iteratively find points furthest from existing set
    while (result.length < numPoints && result.length < pixels.length) {
        maxDist = -1;
        let nextFurthest: number[] | null = null;

        for (const p of pixels) {
            // Skip if too close to existing points
            let tooClose = false;
            for (const r of result) {
                if (colorDistance3D(p, r) < 0.01) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            let minDistToSet;

            if (result.length === 1) {
                minDistToSet = colorDistance3D(p, result[0]);
            } else if (result.length === 2) {
                minDistToSet = distanceToLineSegment(p, result[0], result[1]);
            } else if (result.length === 3) {
                minDistToSet = distanceToTriangle(p, result[0], result[1], result[2]);
            } else {
                minDistToSet = distanceToConvexHull(p, result);
            }

            if (minDistToSet > maxDist) {
                maxDist = minDistToSet;
                nextFurthest = p;
            }
        }

        if (nextFurthest) {
            result.push([...nextFurthest]);
        } else {
            break;
        }
    }

    return result;
}

// ============================================================
// COLINEARITY DETECTION FOR PAIR BLOCKING
// ============================================================

export function pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
    const dx = lineEnd[0] - lineStart[0];
    const dy = lineEnd[1] - lineStart[1];
    const dz = lineEnd[2] - lineStart[2];
    const lenSq = dx * dx + dy * dy + dz * dz;

    if (lenSq === 0) return Math.sqrt(
        Math.pow(point[0] - lineStart[0], 2) +
        Math.pow(point[1] - lineStart[1], 2) +
        Math.pow(point[2] - lineStart[2], 2)
    );

    const t = Math.max(0, Math.min(1,
        ((point[0] - lineStart[0]) * dx +
            (point[1] - lineStart[1]) * dy +
            (point[2] - lineStart[2]) * dz) / lenSq
    ));

    const projX = lineStart[0] + t * dx;
    const projY = lineStart[1] + t * dy;
    const projZ = lineStart[2] + t * dz;

    return Math.sqrt(
        Math.pow(point[0] - projX, 2) +
        Math.pow(point[1] - projY, 2) +
        Math.pow(point[2] - projZ, 2)
    );
}

export function isBetween(point: number[], a: number[], c: number[], tolerance = 0.05): boolean {
    const dist = pointToLineDistance(point, a, c);
    if (dist > tolerance) return false;

    const ac = Math.sqrt(Math.pow(c[0] - a[0], 2) + Math.pow(c[1] - a[1], 2) + Math.pow(c[2] - a[2], 2));
    const ab = Math.sqrt(Math.pow(point[0] - a[0], 2) + Math.pow(point[1] - a[1], 2) + Math.pow(point[2] - a[2], 2));
    const bc = Math.sqrt(Math.pow(c[0] - point[0], 2) + Math.pow(c[1] - point[1], 2) + Math.pow(c[2] - point[2], 2));

    const minDist = tolerance;
    return ab > minDist && bc > minDist && Math.abs(ab + bc - ac) < tolerance;
}

/**
 * Detects pairs of colors that should be blocked from blending because a third color
 * lies perfectly between them (colinearity).
 * 
 * @param activeChannels Array of active channels with their indices and normalized RGB arrays
 * @returns Array of blocked pair indices like [ [0, 2], [1, 4] ]
 */
export function detectBlockedPairs(activeChannels: { idx: number, rgb: number[] }[]): [number, number][] {
    const blocked: [number, number][] = [];

    // Check all triplets of colors to find colinearities
    for (let a = 0; a < activeChannels.length; a++) {
        for (let c = a + 2; c < activeChannels.length; c++) {
            for (let b = a + 1; b < c; b++) {
                const colA = activeChannels[a].rgb;
                const colB = activeChannels[b].rgb;
                const colC = activeChannels[c].rgb;

                // If B lies between A and C on a line, block the A-C pair
                if (isBetween(colB, colA, colC, 0.08)) {
                    const pairToBlock: [number, number] = [activeChannels[a].idx, activeChannels[c].idx];

                    // Check for duplicates
                    const exists = blocked.some(p =>
                        (p[0] === pairToBlock[0] && p[1] === pairToBlock[1]) ||
                        (p[0] === pairToBlock[1] && p[1] === pairToBlock[0])
                    );

                    if (!exists) {
                        blocked.push(pairToBlock);
                    }
                }
            }
        }
    }

    return blocked;
}
