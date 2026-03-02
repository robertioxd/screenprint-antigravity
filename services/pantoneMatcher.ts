import pantoneData from '../public/pantone-solid-coated.json';

export interface PantoneColor {
    name: string;
    hex: string;
}

interface LabColor {
    L: number;
    a: number;
    b: number;
}

// Convert Hex to RGB
export function hexToRgb(hex: string): { r: number, g: number, b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// Convert RGB to XYZ
function rgbToXyz(r: number, g: number, b: number): { x: number, y: number, z: number } {
    let [rL, gL, bL] = [r / 255, g / 255, b / 255];

    rL = rL > 0.04045 ? Math.pow((rL + 0.055) / 1.055, 2.4) : rL / 12.92;
    gL = gL > 0.04045 ? Math.pow((gL + 0.055) / 1.055, 2.4) : gL / 12.92;
    bL = bL > 0.04045 ? Math.pow((bL + 0.055) / 1.055, 2.4) : bL / 12.92;

    rL *= 100;
    gL *= 100;
    bL *= 100;

    const x = rL * 0.4124 + gL * 0.3576 + bL * 0.1805;
    const y = rL * 0.2126 + gL * 0.7152 + bL * 0.0722;
    const z = rL * 0.0193 + gL * 0.1192 + bL * 0.9505;

    return { x, y, z };
}

// Convert XYZ to CIELAB
// Using D65 reference white
function xyzToLab(x: number, y: number, z: number): LabColor {
    const ref_X = 95.047;
    const ref_Y = 100.000;
    const ref_Z = 108.883;

    let xL = x / ref_X;
    let yL = y / ref_Y;
    let zL = z / ref_Z;

    xL = xL > 0.008856 ? Math.pow(xL, 1 / 3) : (7.787 * xL) + (16 / 116);
    yL = yL > 0.008856 ? Math.pow(yL, 1 / 3) : (7.787 * yL) + (16 / 116);
    zL = zL > 0.008856 ? Math.pow(zL, 1 / 3) : (7.787 * zL) + (16 / 116);

    const L = (116 * yL) - 16;
    const a = 500 * (xL - yL);
    const b = 200 * (yL - zL);

    return { L, a, b };
}

export function hexToLab(hex: string): LabColor {
    const { r, g, b } = hexToRgb(hex);
    const { x, y, z } = rgbToXyz(r, g, b);
    return xyzToLab(x, y, z);
}

// Calculate Delta E 2000 (CIEDE2000)
// Extremely accurate for human vision perception
export function deltaE2000(lab1: LabColor, lab2: LabColor): number {
    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const Cbar = (C1 + C2) / 2;

    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

    const a1_prime = a1 * (1 + G);
    const a2_prime = a2 * (1 + G);

    const C1_prime = Math.sqrt(a1_prime * a1_prime + b1 * b1);
    const C2_prime = Math.sqrt(a2_prime * a2_prime + b2 * b2);
    const Cbar_prime = (C1_prime + C2_prime) / 2;

    const h1_prime = (a1_prime === 0 && b1 === 0) ? 0 : Math.atan2(b1, a1_prime) * (180 / Math.PI);
    let h1_calc = h1_prime;
    if (h1_calc < 0) h1_calc += 360;

    const h2_prime = (a2_prime === 0 && b2 === 0) ? 0 : Math.atan2(b2, a2_prime) * (180 / Math.PI);
    let h2_calc = h2_prime;
    if (h2_calc < 0) h2_calc += 360;

    const Hbar_prime = (Math.abs(h1_calc - h2_calc) > 180) ? (h1_calc + h2_calc + 360) / 2 : (h1_calc + h2_calc) / 2;
    const T = 1 - 0.17 * Math.cos((Hbar_prime - 30) * Math.PI / 180) +
        0.24 * Math.cos(2 * Hbar_prime * Math.PI / 180) +
        0.32 * Math.cos((3 * Hbar_prime + 6) * Math.PI / 180) -
        0.20 * Math.cos((4 * Hbar_prime - 63) * Math.PI / 180);

    let dh_prime = 0;
    if (Math.abs(h2_calc - h1_calc) <= 180) {
        dh_prime = h2_calc - h1_calc;
    } else if (h2_calc <= h1_calc) {
        dh_prime = h2_calc - h1_calc + 360;
    } else {
        dh_prime = h2_calc - h1_calc - 360;
    }

    const dL_prime = L2 - L1;
    const dC_prime = C2_prime - C1_prime;
    const dH_prime = 2 * Math.sqrt(C1_prime * C2_prime) * Math.sin((dh_prime / 2) * Math.PI / 180);

    const Lbar = (L1 + L2) / 2;
    const SL = 1 + ((0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2)));
    const SC = 1 + 0.045 * Cbar_prime;
    const SH = 1 + 0.015 * Cbar_prime * T;

    const dTheta = 30 * Math.exp(-1 * Math.pow((Hbar_prime - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbar_prime, 7) / (Math.pow(Cbar_prime, 7) + Math.pow(25, 7)));
    const RT = -1 * RC * Math.sin(2 * dTheta * Math.PI / 180);

    const dE = Math.sqrt(
        Math.pow(dL_prime / (kL * SL), 2) +
        Math.pow(dC_prime / (kC * SC), 2) +
        Math.pow(dH_prime / (kH * SH), 2) +
        RT * (dC_prime / (kC * SC)) * (dH_prime / (kH * SH))
    );

    return dE;
}


// Memoization cache to avoid recalculating the entire Pantone database LAB values
// and to avoid recalculating the match for a specific hex if we have seen it before
let pantoneLabCache: { color: PantoneColor, lab: LabColor }[] | null = null;
const matchCache: Record<string, { match: PantoneColor, deltaE: number }> = {};

/**
 * Finds the closest Pantone Solid Coated match for a given HEX color using CIEDE2000
 */
export function findClosestPantone(hex: string): { match: PantoneColor, deltaE: number } {
    const cleanHex = hex.toLowerCase().trim();

    // Return cached result if we have already calculated it
    if (matchCache[cleanHex]) {
        return matchCache[cleanHex];
    }

    const targetLab = hexToLab(cleanHex);

    // Initialize the Pantone LAB cache on first run
    if (!pantoneLabCache) {
        const typedPantoneData = pantoneData as PantoneColor[];
        pantoneLabCache = typedPantoneData.map(color => ({
            color,
            lab: hexToLab(color.hex)
        }));
    }

    let bestMatch: PantoneColor | null = null;
    let minDeltaE = Infinity;

    // Find the color with the minimum Delta E
    for (const item of pantoneLabCache) {
        const dE = deltaE2000(targetLab, item.lab);
        if (dE < minDeltaE) {
            minDeltaE = dE;
            bestMatch = item.color;
        }
    }

    const result = {
        match: bestMatch as PantoneColor,
        deltaE: minDeltaE
    };

    // Cache the result for future identical queries (like identical backgrounds on multiple re-separations)
    matchCache[cleanHex] = result;

    return result;
}
