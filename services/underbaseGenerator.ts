/**
 * Underbase Generator Service
 * 
 * Generates a white underbase layer by combining all color separation alpha masks
 * into a union mask, then eroding it by a configurable "choke" value.
 * 
 * The underbase is the first layer printed on dark garments, providing a neutral
 * white foundation so top colors appear vibrant.
 */

import type { Layer, PaletteColor } from '../types';

/**
 * Generate an underbase layer from the union of all separation layers.
 * 
 * Algorithm:
 * 1. OR all alpha channels → every pixel with ink in any layer = white
 * 2. Erode (choke) the mask by N pixels → prevents white edges peeking out
 * 3. Create a white (#FFFFFF) ImageData with the resulting alpha mask
 * 
 * @param layers - All color separation layers (post-separation)
 * @param chokePixels - Number of pixels to erode inward (0 = no choke)
 * @param width - Image width
 * @param height - Image height
 * @returns A new Layer with white color and the underbase mask
 */
export function generateUnderbaseLayer(
    layers: Layer[],
    chokePixels: number,
    width: number,
    height: number,
    underbaseColorHex: string = '#FFFFFF'
): Layer {
    const totalPixels = width * height;

    // Step 1: Create union mask (OR of all alpha channels)
    const unionMask = new Uint8Array(totalPixels);

    const underbaseLayers = layers.filter(l => l.color.isUnderbase);

    for (const layer of underbaseLayers) {
        const data = layer.data.data;
        for (let i = 0; i < totalPixels; i++) {
            const alpha = data[i * 4 + 3];
            if (alpha > 0) {
                unionMask[i] = 255;
            }
        }
    }

    // Step 2: Erode (choke) the mask if choke > 0
    let finalMask = unionMask;
    if (chokePixels > 0) {
        finalMask = erodeMask(unionMask, width, height, chokePixels);
    }

    // Step 3: Create white ImageData with the union mask as alpha
    // We import hexToRgb or implement a quick parser
    const rgbMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(underbaseColorHex);
    const r = rgbMatch ? parseInt(rgbMatch[1], 16) : 255;
    const g = rgbMatch ? parseInt(rgbMatch[2], 16) : 255;
    const b = rgbMatch ? parseInt(rgbMatch[3], 16) : 255;

    const underbaseData = new Uint8ClampedArray(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
        underbaseData[i * 4] = r;     // R
        underbaseData[i * 4 + 1] = g; // G
        underbaseData[i * 4 + 2] = b; // B
        underbaseData[i * 4 + 3] = finalMask[i]; // Alpha from mask
    }

    const underbaseColor: PaletteColor = {
        id: `underbase-${Date.now()}`,
        hex: underbaseColorHex,
        rgb: { r, g, b },
        locked: true,
        isUnderbase: true
    };

    return {
        id: `layer-underbase-${Date.now()}`,
        color: underbaseColor,
        data: new ImageData(underbaseData, width, height),
        visible: true
    };
}

/**
 * Erode a binary mask by N pixels using a circular structuring element.
 * This shrinks the white areas inward, creating the "choke" effect.
 * 
 * Uses a simple box erosion iterated N times for performance
 * (approximates circular erosion for small radii).
 */
function erodeMask(
    mask: Uint8Array,
    width: number,
    height: number,
    iterations: number
): Uint8Array {
    let current = new Uint8Array(mask);
    let next = new Uint8Array(mask.length);

    for (let iter = 0; iter < iterations; iter++) {
        next.fill(0);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;

                // 3x3 minimum filter (erosion)
                // A pixel survives only if ALL its 8-neighbors + itself are white
                if (
                    current[idx] > 0 &&
                    current[(y - 1) * width + (x - 1)] > 0 &&
                    current[(y - 1) * width + x] > 0 &&
                    current[(y - 1) * width + (x + 1)] > 0 &&
                    current[y * width + (x - 1)] > 0 &&
                    current[y * width + (x + 1)] > 0 &&
                    current[(y + 1) * width + (x - 1)] > 0 &&
                    current[(y + 1) * width + x] > 0 &&
                    current[(y + 1) * width + (x + 1)] > 0
                ) {
                    next[idx] = 255;
                }
            }
        }

        // Swap buffers
        const temp = current;
        current = next;
        next = temp;
    }

    return current;
}
