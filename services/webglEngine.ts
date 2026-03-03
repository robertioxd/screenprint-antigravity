export const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

// POSITIVE separations: Black = ink density, White = no ink
export const SEPARATION_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec3 u_palette[16];     // Separation colors (for weight calculation)
uniform vec3 u_inkPalette[16];  // Ink/display colors (for proof reconstruction)
uniform bool u_channelActive[16];   // Active for weight calculation and export
uniform bool u_channelVisible[16];  // Visible in proof composite only
uniform bool u_channelUnderbase[16];
uniform bool u_channelChoke[16];     // Choke enabled (shrink ink edges)
uniform bool u_channelSpread[16];    // Spread enabled (expand ink edges)
uniform bool u_channelChokeUB[16];   // Choke for underbase contribution
uniform bool u_channelSpreadUB[16];  // Spread for underbase contribution
uniform float u_channelBlackPt[16];  // Per-channel output levels: black point
uniform float u_channelWhitePt[16];  // Per-channel output levels: white point  
uniform float u_channelMidPt[16];    // Per-channel output levels: midpoint (gamma)
uniform int u_paletteSize;
uniform float u_contrast;
uniform bool u_blendEnabled[4]; // enable flags for 1-4 color blends
uniform float u_blendTolerance[4]; // tolerance for each blend level
uniform int u_viewMode; // 0=proof, 1=plate, 2=underbase
uniform int u_selectedChannel;
uniform float u_ubStrength;
uniform float u_ubThreshold;
uniform float u_ubGamma;
uniform float u_ubBlackPt;  // Output levels: black point
uniform float u_ubWhitePt;  // Output levels: white point
uniform float u_ubMidPt;    // Output levels: midpoint (gamma)
uniform float u_spotHardness;
uniform float u_alphaThreshold;
uniform float u_alphaStrength;
uniform vec3 u_bgColor;    // Substrate/shirt color
uniform bool u_ubEnabled;  // Global underbase toggle
uniform bool u_ubVisible;  // Underbase visibility in proof composite

uniform int u_blockedPairs[64]; // Flattened array of blocked pairs [i,j, i,j...]
uniform int u_blockedPairCount; // Number of blocked pairs

// Check if a pair of channel indices is blocked
bool isPairBlocked(int idx1, int idx2) {
    for (int p = 0; p < 32; p++) {
        if (p >= u_blockedPairCount) break;
        int bi = u_blockedPairs[p * 2];
        int bj = u_blockedPairs[p * 2 + 1];
        
        if ((idx1 == bi && idx2 == bj) || (idx1 == bj && idx2 == bi)) {
            return true;
        }
    }
    return false;
}

vec3 screenBlend(vec3 base, vec3 blend) {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

float colorDistance(vec3 a, vec3 b) {
    vec3 d = a - b;
    return sqrt(dot(d, d));
}

float luminance(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec4 texel = texture(u_image, v_texCoord);
    vec3 pixelColor = texel.rgb;
    float pixelAlpha = texel.a;
    
    if (u_contrast != 1.0) {
        pixelColor = (pixelColor - 0.5) * u_contrast + 0.5;
        pixelColor = clamp(pixelColor, 0.0, 1.0);
    }
    
    vec3 activeColors[16];
    int activeIndices[16];
    int numActive = 0;
    
    for (int i = 0; i < 16; i++) {
        if (i < u_paletteSize && u_channelActive[i]) {
            activeColors[numActive] = u_palette[i];
            activeIndices[numActive] = i;
            numActive++;
        }
    }
    
    float weights[16];
    for (int i = 0; i < 16; i++) weights[i] = 0.0;
    
    if (numActive == 0) {
        fragColor = vec4(pixelColor, 1.0);
        return;
    }
    
    float bestError = 999.0;
    float bestWeights[16];
    for (int i = 0; i < 16; i++) bestWeights[i] = 0.0;
    
    bool useHigherBlends = u_blendEnabled[3];

    // Singles
    if (u_blendEnabled[0]) {
        for (int i = 0; i < numActive; i++) {
            float err = colorDistance(pixelColor, activeColors[i]);
            if (err < bestError) {
                bestError = err;
                for (int j = 0; j < 16; j++) bestWeights[j] = 0.0;
                bestWeights[activeIndices[i]] = 1.0;
            }
        }
    }
    
    // Pairs
    if (u_blendEnabled[1]) {
        for (int i = 0; i < numActive; i++) {
            for (int j = i + 1; j < numActive; j++) {
                if (isPairBlocked(activeIndices[i], activeIndices[j])) continue;

                vec3 a = activeColors[i];
                vec3 b = activeColors[j];
                vec3 ab = b - a;
                float t = clamp(dot(pixelColor - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
                vec3 projected = a + t * ab;
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
    if (u_blendEnabled[2]) {
        for (int i = 0; i < numActive; i++) {
            for (int j = i + 1; j < numActive; j++) {
                for (int k = j + 1; k < numActive; k++) {
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
    
    // Quads+ (IDW fallback)
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
            if (i < u_paletteSize && u_channelActive[i]) {
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
    
    // Apply spot hardness
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
            for (int i = 0; i < 16; i++) {
                weights[i] *= scale;
            }
        }
    }
    
    // Apply Alpha Mask Knockout
    float alphaMask = mix(1.0, pixelAlpha, u_alphaStrength);
    alphaMask = smoothstep(u_alphaThreshold, u_alphaThreshold + 0.1, alphaMask);
    for(int i = 0; i < 16; i++) weights[i] *= alphaMask;
    
    float weightsForUB[16];
    for (int i = 0; i < 16; i++) weightsForUB[i] = weights[i];
    
    // Per-channel output levels
    for (int ch = 0; ch < 16; ch++) {
        if (ch < u_paletteSize && u_channelActive[ch]) {
            float w = weights[ch];
            float mPt = u_channelMidPt[ch];
            if (mPt > 0.01 && mPt < 0.99) {
                float gamma = log(0.5) / log(mPt);
                w = pow(w, gamma);
            }
            float bPt = u_channelBlackPt[ch];
            float wPt = u_channelWhitePt[ch];
            w = mix(bPt, wPt, w);
            weights[ch] = clamp(w, 0.0, 1.0);
        }
    }
    
    // Morphology (Choke/Spread)
    vec2 pixelSize = 1.0 / vec2(textureSize(u_image, 0));
    for (int ch = 0; ch < 16; ch++) {
        if (ch < u_paletteSize && u_channelActive[ch]) {
            bool doChoke = u_channelChoke[ch];
            bool doSpread = u_channelSpread[ch];
            
            if ((doChoke || doSpread) && u_viewMode == 1) { // Only apply to plate view for now
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
                    vec4 nTexel = texture(u_image, sampleCoord);
                    vec3 nColor = nTexel.rgb;
                    
                    float dist = colorDistance(nColor, u_palette[ch]);
                    float nWeight = 1.0 / (1.0 + dist * 10.0);
                    nWeight = clamp(nWeight, 0.0, 1.0);
                    
                    minNeighbor = min(minNeighbor, nWeight);
                    maxNeighbor = max(maxNeighbor, nWeight);
                }
                
                if (doChoke && isSolidBlack && minNeighbor < 0.5) weights[ch] = minNeighbor;
                if (doSpread && isSolidWhite && maxNeighbor > 0.5) weights[ch] = maxNeighbor;
            }
        }
    }

    // Morphology for Underbase
    for (int ch = 0; ch < 16; ch++) {
        if (ch < u_paletteSize && u_channelActive[ch] && u_channelUnderbase[ch]) {
            if (u_channelChokeUB[ch] || u_channelSpreadUB[ch]) {
                float origWeight = weightsForUB[ch];
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
                    vec4 nTexel = texture(u_image, sampleCoord);
                    vec3 nColor = nTexel.rgb;
                    
                    float dist = colorDistance(nColor, u_palette[ch]);
                    float nWeight = 1.0 / (1.0 + dist * 10.0);
                    nWeight = clamp(nWeight, 0.0, 1.0);
                    
                    minNeighbor = min(minNeighbor, nWeight);
                    maxNeighbor = max(maxNeighbor, nWeight);
                }
                
                if (u_channelChokeUB[ch] && isSolidBlack && minNeighbor < 0.5) weightsForUB[ch] = minNeighbor;
                if (u_channelSpreadUB[ch] && isSolidWhite && maxNeighbor > 0.5) weightsForUB[ch] = maxNeighbor;
            }
        }
    }
    
    // Linear Burn Underbase
    float underbaseValue = 0.0;
    if (u_ubEnabled) {
        float compositeUB = 1.0;
        for (int i = 0; i < 16; i++) {
            if (i < u_paletteSize && u_channelActive[i] && u_channelUnderbase[i]) {
                compositeUB = max(0.0, compositeUB - weightsForUB[i]);
            }
        }
        underbaseValue = 1.0 - compositeUB;
        underbaseValue = clamp(underbaseValue * u_ubStrength, 0.0, 1.0);
        
        if (underbaseValue < u_ubThreshold) underbaseValue = 0.0;
        if (u_ubGamma != 1.0 && underbaseValue > 0.0) {
            underbaseValue = pow(underbaseValue, u_ubGamma);
        }
    }
    
    // Output
    if (u_viewMode == 0) { // PROOF
        vec3 base = u_bgColor;
        if (u_ubEnabled && u_ubVisible) {
            vec3 ubColor = vec3(0.95);
            base = mix(base, ubColor, underbaseValue);
        }
        
        // Single color channel preview
        if (u_selectedChannel >= 0 && u_selectedChannel < 16) {
            float w = weights[u_selectedChannel];
            vec3 result = mix(base, u_inkPalette[u_selectedChannel], w);
            fragColor = vec4(result, 1.0);
            return;
        }
        
        // Composite
        vec3 result = base;
        for (int i = 0; i < 16; i++) {
            if (i < u_paletteSize && u_channelVisible[i] && weights[i] > 0.0) {
                vec3 inkColor = u_inkPalette[i];
                vec3 layerColor = mix(vec3(1.0), inkColor, weights[i]);
                result = max(vec3(0.0), result + layerColor - 1.0); // Linear burn
            }
        }
        fragColor = vec4(result, pixelAlpha);
    } 
    else if (u_viewMode == 1) { // PLATE
        float channelValue = 0.0;
        if (u_selectedChannel >= 0 && u_selectedChannel < 16) {
            channelValue = weights[u_selectedChannel];
        }
        float positiveValue = 1.0 - channelValue;
        fragColor = vec4(vec3(positiveValue), 1.0);
    } 
    else if (u_viewMode == 2) { // UNDERBASE PLATE
        float finalUB = underbaseValue;
        float bPt = u_ubBlackPt;
        float wPt = u_ubWhitePt;
        finalUB = mix(bPt, wPt, finalUB);
        
        float mPt = u_ubMidPt;
        if (mPt > 0.01 && mPt < 0.99 && finalUB > 0.0) {
            float gamma = log(0.5) / log(mPt);
            finalUB = pow(finalUB, gamma);
        }
        finalUB = clamp(finalUB, 0.0, 1.0);
        float positiveValue = 1.0 - finalUB;
        fragColor = vec4(vec3(positiveValue), 1.0);
    }
    else if (u_viewMode == 3) { // EXTRACTION (Alpha mask for React layers)
        float channelValue = 0.0;
        if (u_selectedChannel >= 0 && u_selectedChannel < 16) {
            channelValue = weights[u_selectedChannel];
        }
        fragColor = vec4(0.0, 0.0, 0.0, channelValue);
    }
}
`;

export class WebGLEngine {
    private canvas: HTMLCanvasElement;
    public gl: WebGL2RenderingContext;
    private program: WebGLProgram | null = null;
    private texture: WebGLTexture | null = null;
    private uniforms: any = {};
    private vao: WebGLVertexArrayObject | null = null;

    constructor(canvas?: HTMLCanvasElement) {
        this.canvas = canvas || document.createElement('canvas');
        const context = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!context) throw new Error("WebGL2 not supported");
        this.gl = context;
        this.init();
    }

    private compileShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type);
        if (!shader) throw new Error("Could not create shader");
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const info = this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error('Shader compilation error: ' + info);
        }
        return shader;
    }

    private init() {
        // Compile Shaders
        const vertShader = this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragShader = this.compileShader(this.gl.FRAGMENT_SHADER, SEPARATION_SHADER);

        this.program = this.gl.createProgram()!;
        this.gl.attachShader(this.program, vertShader);
        this.gl.attachShader(this.program, fragShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            throw new Error('Program link error: ' + this.gl.getProgramInfoLog(this.program));
        }

        this.gl.useProgram(this.program);

        // Map Uniforms
        const uniformNames = [
            'u_image', 'u_palette', 'u_inkPalette', 'u_channelActive', 'u_channelVisible',
            'u_channelUnderbase', 'u_channelChoke', 'u_channelSpread',
            'u_channelChokeUB', 'u_channelSpreadUB',
            'u_channelBlackPt', 'u_channelWhitePt', 'u_channelMidPt',
            'u_paletteSize', 'u_contrast', 'u_blendEnabled', 'u_blendTolerance',
            'u_viewMode', 'u_selectedChannel',
            'u_ubStrength', 'u_ubThreshold', 'u_ubGamma',
            'u_ubBlackPt', 'u_ubWhitePt', 'u_ubMidPt',
            'u_spotHardness', 'u_alphaThreshold', 'u_alphaStrength', 'u_bgColor',
            'u_ubEnabled', 'u_ubVisible', 'u_blockedPairs', 'u_blockedPairCount'
        ];

        uniformNames.forEach(name => {
            this.uniforms[name] = this.gl.getUniformLocation(this.program!, name);
        });

        // Set up geometry
        const positions = new Float32Array([
            -1.0, -1.0, 1.0, -1.0, -1.0, 1.0,
            -1.0, 1.0, 1.0, -1.0, 1.0, 1.0
        ]);
        const texCoords = new Float32Array([
            0.0, 1.0, 1.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 1.0, 1.0, 0.0
        ]);

        this.vao = this.gl.createVertexArray()!;
        this.gl.bindVertexArray(this.vao);

        const posBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
        const posLoc = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

        const uvBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, uvBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
        const uvLoc = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(uvLoc);
        this.gl.vertexAttribPointer(uvLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    public loadImage(image: HTMLImageElement | ImageData | HTMLCanvasElement, width: number, height: number) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);

        if (this.texture) this.gl.deleteTexture(this.texture);
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

        // Disable power of 2 requirements
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        if (image instanceof ImageData) {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image.data);
        } else {
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
        }
    }

    public render(params: any) {
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.uniforms.u_image, 0);

        // Bind palette arrays
        this.gl.uniform3fv(this.uniforms.u_palette, new Float32Array(params.palette.flat()));
        this.gl.uniform3fv(this.uniforms.u_inkPalette, new Float32Array(params.inkPalette.flat()));

        // Bind booleans
        this.gl.uniform1iv(this.uniforms.u_channelActive, new Int32Array(params.channelActive));
        this.gl.uniform1iv(this.uniforms.u_channelVisible, new Int32Array(params.channelVisible));
        this.gl.uniform1iv(this.uniforms.u_channelUnderbase, new Int32Array(params.channelUnderbase));
        this.gl.uniform1iv(this.uniforms.u_channelChoke, new Int32Array(params.channelChoke));
        this.gl.uniform1iv(this.uniforms.u_channelSpread, new Int32Array(params.channelSpread));
        this.gl.uniform1iv(this.uniforms.u_channelChokeUB, new Int32Array(params.channelChokeUB));
        this.gl.uniform1iv(this.uniforms.u_channelSpreadUB, new Int32Array(params.channelSpreadUB));

        // Bind floats
        this.gl.uniform1fv(this.uniforms.u_channelBlackPt, new Float32Array(params.channelBlackPt));
        this.gl.uniform1fv(this.uniforms.u_channelWhitePt, new Float32Array(params.channelWhitePt));
        this.gl.uniform1fv(this.uniforms.u_channelMidPt, new Float32Array(params.channelMidPt));
        this.gl.uniform1iv(this.uniforms.u_blendEnabled, new Int32Array(params.blendEnabled.map(Number)));
        this.gl.uniform1fv(this.uniforms.u_blendTolerance, new Float32Array(params.blendTolerance));

        // Bind globals
        this.gl.uniform1i(this.uniforms.u_paletteSize, params.paletteSize);
        this.gl.uniform1f(this.uniforms.u_contrast, params.contrast || 1.0);
        this.gl.uniform1i(this.uniforms.u_viewMode, params.viewMode);
        this.gl.uniform1i(this.uniforms.u_selectedChannel, params.selectedChannel !== undefined ? params.selectedChannel : -1);

        // Underbase globals
        this.gl.uniform1f(this.uniforms.u_ubStrength, params.ubStrength !== undefined ? params.ubStrength : 1.0);
        this.gl.uniform1f(this.uniforms.u_ubThreshold, params.ubThreshold !== undefined ? params.ubThreshold : 0.05);
        this.gl.uniform1f(this.uniforms.u_ubGamma, params.ubGamma !== undefined ? params.ubGamma : 1.0);
        this.gl.uniform1f(this.uniforms.u_ubBlackPt, params.ubBlackPt !== undefined ? params.ubBlackPt : 0.0);
        this.gl.uniform1f(this.uniforms.u_ubWhitePt, params.ubWhitePt !== undefined ? params.ubWhitePt : 1.0);
        this.gl.uniform1f(this.uniforms.u_ubMidPt, params.ubMidPt !== undefined ? params.ubMidPt : 0.5);
        this.gl.uniform1f(this.uniforms.u_spotHardness, params.spotHardness !== undefined ? params.spotHardness : 0.0);
        this.gl.uniform1f(this.uniforms.u_alphaThreshold, params.alphaThreshold !== undefined ? params.alphaThreshold : 0.01);
        this.gl.uniform1f(this.uniforms.u_alphaStrength, params.alphaStrength !== undefined ? params.alphaStrength : 1.0);

        this.gl.uniform3fv(this.uniforms.u_bgColor, new Float32Array(params.bgColor || [0.1, 0.1, 0.1]));
        this.gl.uniform1i(this.uniforms.u_ubEnabled, params.ubEnabled ? 1 : 0);
        this.gl.uniform1i(this.uniforms.u_ubVisible, params.ubVisible ? 1 : 0);

        // Bind Blocked Pairs
        if (params.blockedPairs && params.blockedPairs.length > 0) {
            const flatPairs = [];
            for (const p of params.blockedPairs) {
                flatPairs.push(p[0], p[1]);
            }
            this.gl.uniform1iv(this.uniforms.u_blockedPairs, new Int32Array(flatPairs));
            this.gl.uniform1i(this.uniforms.u_blockedPairCount, params.blockedPairs.length);
        } else {
            this.gl.uniform1i(this.uniforms.u_blockedPairCount, 0);
        }

        // Draw!
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    public getPixelData(): ImageData {
        const pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
        this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);

        // Flip Y axis because WebGL renders upside down relative to Canvas 2D
        const flippedSize = this.canvas.width * 4;
        const halfHeight = Math.floor(this.canvas.height / 2);
        for (let y = 0; y < halfHeight; y++) {
            const topIndex = y * flippedSize;
            const bottomIndex = (this.canvas.height - 1 - y) * flippedSize;
            for (let x = 0; x < flippedSize; x++) {
                const temp = pixels[topIndex + x];
                pixels[topIndex + x] = pixels[bottomIndex + x];
                pixels[bottomIndex + x] = temp;
            }
        }

        return new ImageData(pixels, this.canvas.width, this.canvas.height);
    }

    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }
}
