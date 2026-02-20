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
        const { error } = await supabase
            .from('ai_memory')
            .insert({
                final_config: data.final_config,
                separation_type: data.separation_type,
                image_metadata: data.image_metadata,
                is_verified: true,
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
