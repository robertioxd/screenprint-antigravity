// services/webglEngine.ts

import { PaletteColor, Layer, AdvancedConfig } from '../types';
import { detectBlockedPairs } from './vectorMath';

// We import the hexToRgb utility here or define it locally
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const VERTEX_SHADER = `#version 300 es
    in vec4 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;

    void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
    }
`;

const SEPARATION_SHADER = `#version 300 es
    precision highp float;
    
    in vec2 v_texCoord;
    out vec4 fragColor;
    
    uniform sampler2D u_image;
    
    // Palette parameters
    uniform int u_paletteSize;
    uniform vec3 u_palette[16];        // Separation colors
    uniform vec3 u_inkPalette[16];     // Ink output colors (for proof)
    
    // Channel states (bools as ints)
    uniform int u_channelActive[16];   // Included in calculation
    uniform int u_channelVisible[16];  // Visible in proof composite
    uniform int u_channelUnderbase[16]; // Included in underbase
    
    // Engine parameters
    uniform float u_contrast;          // 0.5 to 3.0
    uniform int u_blendEnabled[4];     // Single, Pair, Triplet, Quad
    uniform float u_blendTolerance[4]; // Tolerances for blend levels
    
    // Morphology/Trapping
    uniform int u_channelChoke[16];
    uniform int u_channelSpread[16];
    uniform int u_channelChokeUB[16];
    uniform int u_channelSpreadUB[16];
    
    // Color constraints
    uniform int u_blockedPairs[64];    // Array of pairs [a1, b1, a2, b2...]
    uniform int u_blockedPairCount;
    
    // Output Levels per channel
    uniform float u_channelBlackPt[16];
    uniform float u_channelWhitePt[16];
    uniform float u_channelMidPt[16];
    
    // Underbase parameters
    uniform int u_ubEnabled;
    uniform int u_ubVisible;
    uniform float u_ubStrength;        // 0 to 2
    uniform float u_ubThreshold;       // 0 to 1
    uniform float u_ubGamma;           // 0.1 to 3.0
    uniform float u_ubBlackPt;
    uniform float u_ubWhitePt;
    uniform float u_ubMidPt;
    
    // Global rendering controls
    uniform float u_spotHardness;      // 0 to 1
    uniform float u_alphaThreshold;    // 0 to 0.1
    uniform float u_alphaStrength;     // 0 to 1
    
    // Background (Substrate)
    uniform vec3 u_bgColor;            // Default white or shirt color
    
    // View mode: 0=Proof, 1=Plate, 2=Underbase Plate, 3=Packed Batch Extraction
    uniform int u_viewMode;
    uniform int u_selectedChannel;     // Which plate to show (0-15)
    uniform int u_packBatch;           // Which batch of 4 to extract

    
    // -------------------------------------------------------------
    // Helper: Calculate distance in RGB space
    float colorDistance(vec3 c1, vec3 c2) {
        vec3 d = c1 - c2;
        return sqrt(dot(d, d));
    }
    
    // Check if a pair of colors is blocked by colinearity rules
    bool isPairBlocked(int idx1, int idx2) {
        for(int i = 0; i < u_blockedPairCount; i++) {
            int a = u_blockedPairs[i * 2];
            int b = u_blockedPairs[i * 2 + 1];
            if ((a == idx1 && b == idx2) || (a == idx2 && b == idx1)) {
                return true;
            }
        }
        return false;
    }

    // Isolated weight calculation function (needed for morphology loops)
    float calcWeightAt(vec2 coord, int channelIdx, vec3 activeColors[16], int activeIndices[16], int numActive, float contrast) {
        vec4 texel = texture(u_image, coord);
        vec3 pixelColor = texel.rgb;
        float alpha = texel.a;
        if (alpha < 0.05) return 0.0;
        
        float bestError = 999.0;
        float bestWeights[16];
        for(int i=0; i<16; i++) bestWeights[i] = 0.0;
        
        // Single colors
        if (u_blendEnabled[0] == 1) {
            for(int i = 0; i < numActive; i++) {
                float err = colorDistance(pixelColor, activeColors[i]);
                if (err < bestError - u_blendTolerance[0]) {
                    bestError = err;
                    for(int j=0; j<16; j++) bestWeights[j] = 0.0;
                    bestWeights[activeIndices[i]] = 1.0;
                }
            }
        }
        
        // Pairs
        if (u_blendEnabled[1] == 1) {
            for(int i = 0; i < numActive; i++) {
                for(int j = i + 1; j < numActive; j++) {
                    if (isPairBlocked(activeIndices[i], activeIndices[j])) continue;
                    
                    vec3 c1 = activeColors[i];
                    vec3 c2 = activeColors[j];
                    vec3 v = c2 - c1;
                    float vLenSq = dot(v, v);
                    
                    float t = 0.0;
                    if (vLenSq > 0.0) {
                        t = dot(pixelColor - c1, v) / vLenSq;
                        t = clamp(t, 0.0, 1.0);
                    }
                    
                    vec3 projected = mix(c1, c2, t);
                    float err = colorDistance(pixelColor, projected);
                    
                    if (err < bestError - u_blendTolerance[1]) {
                        bestError = err;
                        for(int k=0; k<16; k++) bestWeights[k] = 0.0;
                        bestWeights[activeIndices[i]] = 1.0 - t;
                        bestWeights[activeIndices[j]] = t;
                    }
                }
            }
        }
        
        // Note: Triplets and Quads omitted in this helper to save instructions.
        // Morphology only desperately needs accurate edge detection for primary colors.
        
        // Apply spot hardness contrast
        if (u_spotHardness > 0.0) {
            float sumBefore = 0.0;
            for(int i=0; i<16; i++) sumBefore += bestWeights[i];
            
            float contrastPower = 1.0 + u_spotHardness * 4.0;
            float sumAfter = 0.0;
            for(int i=0; i<16; i++) {
                bestWeights[i] = pow(bestWeights[i], contrastPower);
                sumAfter += bestWeights[i];
            }
            if (sumAfter > 0.001 && sumBefore > 0.001) {
                float scale = sumBefore / sumAfter;
                for(int i=0; i<16; i++) bestWeights[i] *= scale;
            }
        }
        
        return bestWeights[channelIdx];
    }
    
    void main() {
        vec4 sourceTexel = texture(u_image, v_texCoord);
        vec3 pixelColor = sourceTexel.rgb;
        float pixelAlpha = sourceTexel.a;
        
        // Skip fully transparent pixels
        if (pixelAlpha < 0.01) {
            if (u_viewMode == 0) {
                fragColor = vec4(u_bgColor, 1.0); // Show substrate
            } else {
                fragColor = vec4(1.0); // White plate = no ink
            }
            return;
        }
        
        // Build active palette structures
        vec3 activeColors[16];
        int activeIndices[16];
        int numActive = 0;
        
        for (int i = 0; i < 16; i++) {
            if (i < u_paletteSize && u_channelActive[i] == 1) {
                activeColors[numActive] = u_palette[i];
                activeIndices[numActive] = i;
                numActive++;
            }
        }
        
        if (numActive == 0) {
            fragColor = vec4(1.0);
            return;
        }
        
        float weights[16];
        for (int i = 0; i < 16; i++) weights[i] = 0.0;
        
        float bestError = 999.0;
        float bestWeights[16];
        for (int i = 0; i < 16; i++) bestWeights[i] = 0.0;
        
        // Add blend fallbacks based on config tolerances
        bool useHigherBlends = u_blendEnabled[3] == 1; // Quad/IDW fallback
        
        // ----------------------------------------
        // Main Core: Multi-Tier Blending Hierarchy
        // ----------------------------------------
        
        // Singles
        if (u_blendEnabled[0] == 1) {
            for (int i = 0; i < numActive; i++) {
                float err = colorDistance(pixelColor, activeColors[i]);
                if (err < bestError - u_blendTolerance[0]) {
                    bestError = err;
                    for (int j = 0; j < 16; j++) bestWeights[j] = 0.0;
                    bestWeights[activeIndices[i]] = 1.0;
                }
            }
        }
        
        // Pairs
        if (u_blendEnabled[1] == 1 && bestError > 0.01) {
            for (int i = 0; i < numActive; i++) {
                for (int j = i + 1; j < numActive; j++) {
                    if (bestError < 0.005) break;
                    if (isPairBlocked(activeIndices[i], activeIndices[j])) continue;
                    
                    vec3 c1 = activeColors[i];
                    vec3 c2 = activeColors[j];
                    vec3 v = c2 - c1;
                    float vLenSq = dot(v, v);
                    
                    float t = 0.0;
                    if (vLenSq > 0.0) {
                        t = dot(pixelColor - c1, v) / vLenSq;
                        t = clamp(t, 0.0, 1.0);
                    }
                    
                    vec3 projected = mix(c1, c2, t);
                    float err = colorDistance(pixelColor, projected);
                    
                    if (err < bestError - u_blendTolerance[1]) {
                        bestError = err;
                        for (int k = 0; k < 16; k++) bestWeights[k] = 0.0;
                        bestWeights[activeIndices[i]] = 1.0 - t;
                        bestWeights[activeIndices[j]] = t;
                    }
                }
            }
        }
        
        // Triplets
        if (u_blendEnabled[2] == 1 && bestError > 0.015) {
            for (int i = 0; i < numActive; i++) {
                for (int j = i + 1; j < numActive; j++) {
                    if (bestError < 0.005) break;
                    for (int k = j + 1; k < numActive; k++) {
                        if (bestError < 0.005) break;
                        vec3 a = activeColors[i];
                        vec3 b = activeColors[j];
                        vec3 c = activeColors[k];
                        
                        vec3 v0 = b - a;
                        vec3 v1 = c - a;
                        vec3 v2 = pixelColor - a;
                        
                        float d00 = dot(v0, v0);
                        float d01 = dot(v0, v1);
                        float d11 = dot(v1, v1);
                        float d20 = dot(v2, v0);
                        float d21 = dot(v2, v1);
                        
                        float denom = d00 * d11 - d01 * d01;
                        if (abs(denom) < 0.0001) continue;
                        
                        float bv = (d11 * d20 - d01 * d21) / denom;
                        float bw = (d00 * d21 - d01 * d20) / denom;
                        float bu = 1.0 - bv - bw;
                        
                        bu = clamp(bu, 0.0, 1.0);
                        bv = clamp(bv, 0.0, 1.0);
                        bw = clamp(bw, 0.0, 1.0);
                        float sum = bu + bv + bw;
                        if (sum > 0.0) { bu /= sum; bv /= sum; bw /= sum; }
                        
                        vec3 projected = a * bu + b * bv + c * bw;
                        float err = colorDistance(pixelColor, projected);
                        
                        if (err < bestError - u_blendTolerance[2]) {
                            bestError = err;
                            for (int l = 0; l < 16; l++) bestWeights[l] = 0.0;
                            bestWeights[activeIndices[i]] = bu;
                            bestWeights[activeIndices[j]] = bv;
                            bestWeights[activeIndices[k]] = bw;
                        }
                    }
                }
            }
        }
        
        // Quads+ / IDW (Inverse Distance Weighting)
        if (useHigherBlends && bestError > 0.05) {
            float totalW = 0.0;
            float idwWeights[16];
            for (int i = 0; i < 16; i++) idwWeights[i] = 0.0;
            
            for (int i = 0; i < numActive; i++) {
                float dist = colorDistance(pixelColor, activeColors[i]);
                float w = 1.0 / (pow(dist, 3.0) + 0.001);
                idwWeights[activeIndices[i]] = w;
                totalW += w;
            }
            if (totalW > 0.0) {
                for (int i = 0; i < 16; i++) idwWeights[i] /= totalW;
            }
            
            vec3 idwResult = vec3(0.0);
            for (int i = 0; i < 16; i++) {
                if (i < u_paletteSize && u_channelActive[i] == 1) {
                    idwResult += u_palette[i] * idwWeights[i];
                }
            }
            float idwErr = colorDistance(pixelColor, idwResult);
            if (idwErr < bestError - u_blendTolerance[3]) {
                bestError = idwErr;
                for (int i = 0; i < 16; i++) bestWeights[i] = idwWeights[i];
            }
        }
        
        for (int i = 0; i < 16; i++) weights[i] = bestWeights[i];
        
        // Contrasting / Spot Hardness
        if (u_spotHardness > 0.0) {
            float sumBefore = 0.0;
            for (int i = 0; i < 16; i++) sumBefore += weights[i];
            
            float contrastPower = 1.0 + u_spotHardness * 4.0;
            float sumAfter = 0.0;
            for (int i = 0; i < 16; i++) {
                weights[i] = pow(weights[i], contrastPower);
                sumAfter += weights[i];
            }
            
            if (sumAfter > 0.001 && sumBefore > 0.001) {
                float scale = sumBefore / sumAfter;
                for (int i = 0; i < 16; i++) weights[i] *= scale;
            }
        }
        
        // Alpha Match & Grayscale Knockout
        float alphaMask = mix(1.0, pixelAlpha, u_alphaStrength);
        alphaMask = smoothstep(u_alphaThreshold, u_alphaThreshold + 0.1, alphaMask);
        
        for(int i = 0; i < 16; i++) {
            weights[i] *= alphaMask;
        }
        
        // Store for Linear Burn underbase
        float weightsForUB[16];
        for (int i = 0; i < 16; i++) weightsForUB[i] = weights[i];
        
        // Apply Output Levels
        for (int ch = 0; ch < 16; ch++) {
            if (ch < u_paletteSize && u_channelActive[ch] == 1) {
                float w = weights[ch];
                
                float mPt = u_channelMidPt[ch];
                if (mPt > 0.01 && mPt < 0.99) {
                    float gammaParam = log(0.5) / log(mPt);
                    w = pow(w, gammaParam);
                }
                
                float bPt = u_channelBlackPt[ch];
                float wPt = u_channelWhitePt[ch];
                w = mix(bPt, wPt, w);
                
                weights[ch] = clamp(w, 0.0, 1.0);
            }
        }
        
        // Edge Choke/Spread Morphology for PLATE
        vec2 pixelSize = 1.0 / vec2(textureSize(u_image, 0));
        for (int ch = 0; ch < 16; ch++) {
            if (ch < u_paletteSize && u_channelActive[ch] == 1) {
                bool doChoke = u_channelChoke[ch] == 1;
                bool doSpread = u_channelSpread[ch] == 1;
                
                if (doChoke || doSpread) {
                    float origWeight = weights[ch];
                    bool isSolidBlack = origWeight > 0.95;
                    bool isSolidWhite = origWeight < 0.05;
                    
                    float minNeighbor = origWeight;
                    float maxNeighbor = origWeight;
                    
                    for (int d = 0; d < 4; d++) {
                        vec2 offset;
                        if (d == 0) offset = vec2(-1.0, 0.0);
                        else if (d == 1) offset = vec2(1.0, 0.0);
                        else if (d == 2) offset = vec2(0.0, -1.0);
                        else offset = vec2(0.0, 1.0);
                        
                        vec2 sampleCoord = v_texCoord + offset * pixelSize;
                        vec4 neighborTexel = texture(u_image, sampleCoord);
                        vec3 neighborColor = neighborTexel.rgb;
                        
                        float dist = colorDistance(neighborColor, u_palette[ch]);
                        float neighborWeight = 1.0 / (1.0 + dist * 10.0);
                        neighborWeight = clamp(neighborWeight, 0.0, 1.0);
                        
                        minNeighbor = min(minNeighbor, neighborWeight);
                        maxNeighbor = max(maxNeighbor, neighborWeight);
                    }
                    
                    if (doChoke && isSolidBlack) {
                        if (minNeighbor < 0.5) weights[ch] = minNeighbor;
                    }
                    if (doSpread && isSolidWhite) {
                        if (maxNeighbor > 0.5) weights[ch] = maxNeighbor;
                    }
                }
            }
        }
        
        // Calculate Underbase (Linear Burn)
        float underbaseValue = 0.0;
        if (u_ubEnabled == 1 && u_ubStrength > 0.0) {
            float composite = 1.0;
            bool hasAnyUB = false;
            
            for (int i = 0; i < 16; i++) {
                if (i < u_paletteSize && u_channelActive[i] == 1 && u_channelUnderbase[i] == 1 && weightsForUB[i] > 0.01) {
                    float ubWeight = weightsForUB[i];
                    
                    // UB Choke/Spread
                    bool doChokeUB = u_channelChokeUB[i] == 1;
                    bool doSpreadUB = u_channelSpreadUB[i] == 1;
                    
                    if (doChokeUB || doSpreadUB) {
                        float minN = ubWeight;
                        float maxN = ubWeight;
                        bool isSBlack = ubWeight > 0.95;
                        bool isSWhite = ubWeight < 0.05;
                        
                        for (int d = 0; d < 4; d++) {
                            vec2 offset;
                            if (d == 0) offset = vec2(-1.0, 0.0);
                            else if (d == 1) offset = vec2(1.0, 0.0);
                            else if (d == 2) offset = vec2(0.0, -1.0);
                            else offset = vec2(0.0, 1.0);
                            
                            float nw = calcWeightAt(v_texCoord + offset * pixelSize, i, activeColors, activeIndices, numActive, u_contrast);
                            minN = min(minN, nw);
                            maxN = max(maxN, nw);
                        }
                        
                        if (doChokeUB && isSBlack && minN < 0.5) ubWeight = minN;
                        if (doSpreadUB && isSWhite && maxN > 0.5) ubWeight = maxN;
                    }
                    
                    composite = max(0.0, composite - ubWeight);
                    hasAnyUB = true;
                }
            }
            
            if (hasAnyUB) {
                underbaseValue = 1.0 - composite;
                underbaseValue = underbaseValue * u_ubStrength;
                underbaseValue = pow(underbaseValue, u_ubGamma);
                if (underbaseValue <= u_ubThreshold) underbaseValue = 0.0;
                underbaseValue = clamp(underbaseValue, 0.0, 1.0);
                underbaseValue = mix(u_ubBlackPt, u_ubWhitePt, underbaseValue);
            }
        }
        
        if (u_viewMode == 0) {
            // Proof
            vec3 base = u_bgColor;
            if (u_ubEnabled == 1 && u_ubVisible == 1 && underbaseValue > 0.0) {
                base = mix(u_bgColor, vec3(1.0), underbaseValue);
            }
            vec3 result = base;
            for (int i = 0; i < 16; i++) {
                if (i < u_paletteSize && u_channelVisible[i] == 1 && weights[i] > 0.0) {
                    vec3 inkColor = u_inkPalette[i];
                    float positiveValue = 1.0 - weights[i];
                    vec3 layerColor = mix(inkColor, vec3(1.0), positiveValue);
                    result = max(vec3(0.0), result + layerColor - 1.0);
                }
            }
            fragColor = vec4(result, pixelAlpha);
        }
        else if (u_viewMode == 1) {
            // Plate
            float channelValue = 0.0;
            if (u_selectedChannel >= 0 && u_selectedChannel < u_paletteSize && u_channelActive[u_selectedChannel] == 1) {
                channelValue = weights[u_selectedChannel];
            }
            float positiveValue = 1.0 - channelValue;
            fragColor = vec4(vec3(positiveValue), 1.0);
        }
        else if (u_viewMode == 2) {
            // Underbase Plate
            float finalUB = underbaseValue;
            float ubGammaParam = (u_ubMidPt > 0.001 && u_ubMidPt < 0.999) ? log(0.5) / log(u_ubMidPt) : 1.0;
            finalUB = pow(finalUB, ubGammaParam);
            finalUB = clamp(finalUB, 0.0, 1.0);
            
            float positiveValue = 1.0 - finalUB;
            fragColor = vec4(vec3(positiveValue), 1.0);
        }
        else if (u_viewMode == 3) {
            // Packed layer extraction (4 channels packed into RGBA)
            int c0 = u_packBatch * 4 + 0;
            int c1 = u_packBatch * 4 + 1;
            int c2 = u_packBatch * 4 + 2;
            int c3 = u_packBatch * 4 + 3;
            
            float v0 = (c0 < u_paletteSize && u_channelActive[c0] == 1) ? weights[c0] : 0.0;
            float v1 = (c1 < u_paletteSize && u_channelActive[c1] == 1) ? weights[c1] : 0.0;
            float v2 = (c2 < u_paletteSize && u_channelActive[c2] == 1) ? weights[c2] : 0.0;
            float v3 = (c3 < u_paletteSize && u_channelActive[c3] == 1) ? weights[c3] : 0.0;
            
            fragColor = vec4(v0, v1, v2, v3);
        }
    }
`;

export class WebGLEngine {
    private gl: WebGL2RenderingContext | null = null;
    private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private texture: WebGLTexture | null = null;

    constructor() {
        this.init();
    }

    private init() {
        if (typeof document !== 'undefined') {
            this.canvas = document.createElement('canvas');
        } else if (typeof OffscreenCanvas !== 'undefined') {
            this.canvas = new OffscreenCanvas(1, 1);
        } else {
            console.error('No canvas support found');
            return;
        }

        // Must explicitly request webgl2
        this.gl = this.canvas.getContext('webgl2', {
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        }) as WebGL2RenderingContext;

        if (!this.gl) {
            console.error('WebGL2 not supported');
            return;
        }

        this.program = this.createProgram(VERTEX_SHADER, SEPARATION_SHADER);
        if (!this.program) return;

        // Quad geometry covering -1 to 1 space
        const positions = new Float32Array([
            -1, -1, 0, 1,
            1, -1, 1, 1,
            -1, 1, 0, 0,
            1, 1, 1, 0
        ]);

        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const posLoc = this.gl.getAttribLocation(this.program, 'a_position');
        const texLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');

        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(texLoc);
        this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 16, 8);
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        if (!this.gl) return null;
        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
        if (!this.gl) return null;
        const vs = this.compileShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(this.gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    public dispose() {
        if (!this.gl) return;
        if (this.program) this.gl.deleteProgram(this.program);
        if (this.vao) this.gl.deleteVertexArray(this.vao);
        if (this.texture) this.gl.deleteTexture(this.texture);
        this.gl.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
        this.canvas = null;
    }

    /**
     * Executes the WebGL separation algorithm.
     * Evaluates all palette colors on the GPU and extracts the channel logic as layered masks.
     */
    public async separate(imageData: ImageData, palette: PaletteColor[], config: any): Promise<Layer[]> {
        const gl = this.gl;
        if (!gl || !this.program || !this.vao || !this.canvas) {
            throw new Error('WebGLEngine not fully initialized');
        }

        const width = imageData.width;
        const height = imageData.height;
        this.canvas.width = width;
        this.canvas.height = height;
        gl.viewport(0, 0, width, height);

        // Upload Source Image
        if (this.texture) gl.deleteTexture(this.texture);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);

        // Map configs and parameters to Uniforms
        const paletteData = new Float32Array(16 * 3);
        const inkPaletteData = new Float32Array(16 * 3);
        const activeData = new Int32Array(16);
        const underbaseData = new Int32Array(16);

        const activeChannelsForMath: { idx: number, rgb: number[] }[] = [];

        for (let i = 0; i < 16; i++) {
            if (i < palette.length) {
                const c = palette[i];
                const rgb = hexToRgb(c.hex);
                const rF = rgb.r / 255.0;
                const gF = rgb.g / 255.0;
                const bF = rgb.b / 255.0;

                paletteData[i * 3 + 0] = rF;
                paletteData[i * 3 + 1] = gF;
                paletteData[i * 3 + 2] = bF;

                inkPaletteData[i * 3 + 0] = rF;
                inkPaletteData[i * 3 + 1] = gF;
                inkPaletteData[i * 3 + 2] = bF;

                activeData[i] = 1; // True
                underbaseData[i] = c.isUnderbase ? 1 : 0;

                activeChannelsForMath.push({ idx: i, rgb: [rF, gF, bF] });
            } else {
                activeData[i] = 0;
                underbaseData[i] = 0;
            }
        }

        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_palette'), paletteData);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_inkPalette'), inkPaletteData);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_paletteSize'), Math.min(palette.length, 16));

        // Use standard substrate color setup implicitly
        const bgHex = config.substrateColorHex || '#ffffff';
        const bgRgb = hexToRgb(bgHex);
        gl.uniform3f(gl.getUniformLocation(this.program, 'u_bgColor'), bgRgb.r / 255, bgRgb.g / 255, bgRgb.b / 255);

        // Precompute Blocked Colinear Pairs
        const blockedPairsRaw = detectBlockedPairs(activeChannelsForMath);
        const blockedPairsFlat = new Int32Array(64);
        for (let i = 0; i < Math.min(blockedPairsRaw.length, 32); i++) {
            blockedPairsFlat[i * 2] = blockedPairsRaw[i][0];
            blockedPairsFlat[i * 2 + 1] = blockedPairsRaw[i][1];
        }
        gl.uniform1iv(gl.getUniformLocation(this.program, 'u_blockedPairs'), blockedPairsFlat);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_blockedPairCount'), Math.min(blockedPairsRaw.length, 32));

        // New Raster Settings based on AdvancedConfig implementation plan
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), 1.0); // Kept default

        // Blend Enable [Singles, Pairs, Triplets, Quads/IDW]
        gl.uniform1iv(gl.getUniformLocation(this.program, 'u_blendEnabled'), new Int32Array([1, 1, 1, 1]));

        // Dynamic Blend Tolerance based on config
        const bt = config.blendTolerance || 0.05;
        // Increase tolerance per level naturally
        gl.uniform1fv(gl.getUniformLocation(this.program, 'u_blendTolerance'), new Float32Array([bt, bt * 1.5, bt * 2.0, bt * 3.0]));

        gl.uniform1f(gl.getUniformLocation(this.program, 'u_spotHardness'), config.spotHardness ?? 0.5);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_alphaThreshold'), config.alphaThreshold ?? 0.1);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_alphaStrength'), config.alphaStrength ?? 1.0);

        gl.uniform1i(gl.getUniformLocation(this.program, 'u_ubEnabled'), palette.some(c => c.isUnderbase) ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_ubVisible'), 1);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubStrength'), config.ubStrength ?? 1.0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubGamma'), config.ubGamma ?? 1.5);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubThreshold'), 0.05); // Fixed sensible default
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubBlackPt'), 0.0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubWhitePt'), 1.0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_ubMidPt'), 0.5);

        for (let i = 0; i < 16; i++) {
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelActive[${i}]`), activeData[i]);
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelVisible[${i}]`), activeData[i]); // ViewMode 1 overrides visibility anyway
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelUnderbase[${i}]`), underbaseData[i]);

            // Hardcode plate morphology defaults (optional configuration can be wired later)
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelChoke[${i}]`), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelSpread[${i}]`), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelChokeUB[${i}]`), 0);
            gl.uniform1i(gl.getUniformLocation(this.program, `u_channelSpreadUB[${i}]`), 0);

            gl.uniform1f(gl.getUniformLocation(this.program, `u_channelBlackPt[${i}]`), 0.0);
            gl.uniform1f(gl.getUniformLocation(this.program, `u_channelWhitePt[${i}]`), 1.0);
            gl.uniform1f(gl.getUniformLocation(this.program, `u_channelMidPt[${i}]`), 0.5);
        }

        const layers: Layer[] = [];

        // Extract native WebGL Underbase plate if any color requested it
        if (palette.some(c => c.isUnderbase)) {
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_viewMode'), 2);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            const ubPixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, ubPixels);

            const len = width * height * 4;
            const finalData = new Uint8ClampedArray(len);
            for (let pIdx = 0; pIdx < len; pIdx += 4) {
                // u_viewMode = 2 outputs vec4(vec3(positiveValue), 1.0)
                // positiveValue = 1.0 - underbaseValue -> we want 255 - pixel -> underbaseValue * 255
                finalData[pIdx + 3] = 255 - ubPixels[pIdx];
            }

            layers.push({
                id: `layer-underbase-${Date.now()}`,
                color: { id: `ub-${Date.now()}`, hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 }, locked: true, isUnderbase: true },
                data: new ImageData(finalData, width, height),
                visible: true
            });
        }

        const numBatches = Math.ceil(palette.length / 4);

        // Extract layers in batches of 4 channels packed into RGBA to boost performance 4x
        for (let batch = 0; batch < numBatches; batch++) {

            gl.uniform1i(gl.getUniformLocation(this.program, 'u_viewMode'), 3);
            gl.uniform1i(gl.getUniformLocation(this.program, 'u_packBatch'), batch);

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            const rawPixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rawPixels);

            // Unpack RGBA to up to 4 sequential layers
            for (let c = 0; c < 4; c++) {
                const channelIdx = batch * 4 + c;
                if (channelIdx >= palette.length) break;

                const colorInfo = palette[channelIdx];

                const len = width * height * 4;
                const finalData = new Uint8ClampedArray(len);

                // Fast loop: rawPixels mapped to [0-255] ink densities
                for (let pIdx = 0; pIdx < len; pIdx += 4) {
                    finalData[pIdx + 3] = rawPixels[pIdx + c]; // Assign specific channel from RGBA to Alpha
                }

                layers.push({
                    id: `layer-${colorInfo.id}-${Date.now()}`,
                    color: colorInfo,
                    data: new ImageData(finalData, width, height),
                    visible: true
                });
            }
        }

        return layers;
    }
}

// Export single singleton instance
let sharedEngine: WebGLEngine | null = null;
export function getWebGLEngine(): WebGLEngine {
    if (!sharedEngine) {
        sharedEngine = new WebGLEngine();
    }
    return sharedEngine;
}
