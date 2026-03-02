import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing env vars. Cloud features (Loadouts, AI) will be disabled.');
}

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// ==========================================
// LOADOUTS API
// ==========================================

export interface Loadout {
    id: string;
    name: string;
    config: Record<string, unknown>;
    created_at: string;
}

export async function getLoadouts(): Promise<Loadout[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('loadouts')
        .select('id, name, config, created_at')
        .order('created_at', { ascending: false });
    if (error) { console.error('[Supabase] getLoadouts:', error.message); return []; }
    return data ?? [];
}

export async function saveLoadout(name: string, config: Record<string, unknown>): Promise<Loadout | null> {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { console.error('[Supabase] Not authenticated'); return null; }

    const { data, error } = await supabase
        .from('loadouts')
        .insert({ user_id: user.id, name, config })
        .select('id, name, config, created_at')
        .single();
    if (error) { console.error('[Supabase] saveLoadout:', error.message); return null; }
    return data;
}

export async function deleteLoadout(id: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('loadouts').delete().eq('id', id);
    if (error) { console.error('[Supabase] deleteLoadout:', error.message); return false; }
    return true;
}

// ==========================================
// AI ANALYSIS API
// ==========================================

export interface AIAnalysisResult {
    separationType: 'vector' | 'raster';
    denoiseStrength: number;
    denoiseSpatial: number;
    cleanupStrength: number;
    minCoverage: number;
    useRasterAdaptive: boolean;
    useSubstrateKnockout: boolean;
    substrateColorHex: string;
    substrateThreshold: number;
    gamma: number;
    halftoneLpi: number;
    reasoning: string;
}

/**
 * Sends the current image to the Supabase Edge Function for AI analysis.
 * The Edge Function handles Gemini API calls and RAG lookups internally.
 */
// ==========================================
// AI TRAINING API
// ==========================================

export interface TrainingData {
    image: string; // Base64 image
    final_config: Record<string, unknown>;
    separation_type: 'vector' | 'raster';
    image_metadata: {
        width: number;
        height: number;
        num_colors: number;
        palette_hex: string[];
        timestamp: string;
    };
}

/**
 * Saves a successful separation result to ai_memory for RAG-based learning.
 * The Edge Function will query verified records to provide context for future analyses.
 */
export async function saveTrainingData(data: TrainingData): Promise<boolean> {
    if (!supabase) {
        console.error('[Supabase] Client not initialized');
        return false;
    }

    try {
        const { error } = await supabase.functions.invoke('train-memory', {
            body: {
                image: data.image,
                final_config: data.final_config,
                separation_type: data.separation_type,
                image_metadata: data.image_metadata
            }
        });

        if (error) {
            console.error('[AI Training] Save error:', error.message);
            return false;
        }

        console.log('[AI Training] Successfully saved training data');
        return true;
    } catch (err) {
        console.error('[AI Training] Unexpected error:', err);
        return false;
    }
}

export async function analyzeWithAI(
    imageBase64: string,
    image_metadata: { width: number, height: number, num_colors: number, palette_hex: string[] },
    userPrompt?: string
): Promise<AIAnalysisResult | null> {
    if (!supabase) {
        console.error('[Supabase] Client not initialized');
        return null;
    }

    try {
        const { data, error } = await supabase.functions.invoke('analyze-image', {
            body: {
                image: imageBase64,
                metadata: image_metadata,
                prompt: userPrompt ?? '',
            },
        });

        if (error) {
            console.error('[AI Analysis] Edge Function error:', error.message);
            return null;
        }

        return data as AIAnalysisResult;
    } catch (err) {
        console.error('[AI Analysis] Unexpected error:', err);
        return null;
    }
}

// ==========================================
// HIGH-RES SERVER-SIDE RENDERING API
// ==========================================

export interface HiResRenderResult {
    imageBase64: string;
    width: number;
    height: number;
    effectiveDpi: number;
    pixelCount: number;
}

/**
 * Sends a PDF/AI file to the server for high-resolution rasterization.
 * Bypasses browser canvas limitations for maximum separation quality.
 */
export async function renderHiRes(
    fileBase64: string,
    dpi: number = 300,
    maxWidth: number = 6000
): Promise<HiResRenderResult | null> {
    if (!supabase) {
        console.warn('[Supabase] Client not initialized. Using client-side rendering.');
        return null;
    }

    try {
        console.log(`[HiRes Render] Requesting server-side render at ${dpi} DPI...`);

        const { data, error } = await supabase.functions.invoke('render-hires', {
            body: {
                fileBase64,
                dpi,
                maxWidth,
            },
        });

        if (error) {
            console.warn('[HiRes Render] Edge Function error:', error.message);
            return null;
        }

        if (data?.error) {
            console.warn('[HiRes Render] Server error:', data.error);
            return null;
        }

        console.log(`[HiRes Render] Success: ${data.width}x${data.height} at ${data.effectiveDpi} DPI`);
        return data as HiResRenderResult;
    } catch (err) {
        console.warn('[HiRes Render] Falling back to client-side:', err);
        return null;
    }
}

