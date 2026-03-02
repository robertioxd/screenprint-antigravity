
import React, { useCallback, useState } from 'react';
import { UploadCloud, FileType, Loader2, Zap, Crown, Server } from 'lucide-react';
import { renderHiRes } from '../services/supabase';

interface UploadZoneProps {
    onImageLoad: (data: ImageData, name: string) => void;
}

// Quality modes control resolution at load time — the #1 factor for separation quality
const QUALITY_MODES = {
    draft: {
        label: 'Draft',
        description: 'Fast processing, lower quality',
        icon: Zap,
        pdfScale: 3.0,       // ~216 DPI
        maxRasterWidth: 1200,
    },
    production: {
        label: 'Production',
        description: '300 DPI quality, slower',
        icon: Crown,
        pdfScale: 4.17,      // ~300 DPI (72 × 4.17 ≈ 300)
        maxRasterWidth: 3000,
    },
} as const;

type QualityMode = keyof typeof QUALITY_MODES;

const UploadZone: React.FC<UploadZoneProps> = ({ onImageLoad }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [qualityMode, setQualityMode] = useState<QualityMode>('production');
    const [renderStatus, setRenderStatus] = useState('');

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);

        const name = file.name.toLowerCase();
        const isVector = name.endsWith('.ai') || name.endsWith('.pdf');
        const isPsd = name.endsWith('.psd');

        if (isPsd) {
            try {
                // Dynamic import to use the module defined in importmap
                // @ts-ignore
                const { readPsd } = await import('ag-psd');

                const arrayBuffer = await file.arrayBuffer();

                // Read the PSD. We only strictly need the composite image for separation.
                // In a browser environment, ag-psd typically returns the composite image in the 'canvas' property.
                const psd = readPsd(arrayBuffer);

                // Fix: Property 'image' does not exist on type 'Psd'. Relying on psd.canvas for the composite image.
                if (psd && psd.canvas) {
                    // If ag-psd returns a canvas directly (browser environment sometimes)
                    const ctx = psd.canvas.getContext('2d');
                    if (ctx) {
                        const imageData = ctx.getImageData(0, 0, psd.canvas.width, psd.canvas.height);
                        onImageLoad(imageData, file.name);
                    }
                } else {
                    throw new Error("No composite image found in PSD. Please save with 'Maximize Compatibility'.");
                }

            } catch (err) {
                console.error("PSD parsing error:", err);
                alert("Error reading .PSD file. Ensure the file was saved with 'Maximize Compatibility' enabled.");
            } finally {
                setIsProcessing(false);
            }
            return;
        }

        if (isVector) {
            try {
                const arrayBuffer = await file.arrayBuffer();

                // === ATTEMPT 1: Server-Side Hi-Res Rendering (Production Mode Only) ===
                if (qualityMode === 'production') {
                    setRenderStatus('Server-side 300 DPI rendering...');
                    try {
                        // Convert ArrayBuffer to base64 for the Edge Function
                        const uint8Array = new Uint8Array(arrayBuffer);
                        let binaryStr = '';
                        const chunkSize = 8192;
                        for (let i = 0; i < uint8Array.length; i += chunkSize) {
                            const chunk = uint8Array.subarray(i, i + chunkSize);
                            binaryStr += String.fromCharCode(...chunk);
                        }
                        const fileBase64 = btoa(binaryStr);

                        const result = await renderHiRes(fileBase64, 300, 6000);

                        if (result && result.imageBase64) {
                            setRenderStatus(`Server rendered: ${result.width}x${result.height} (${result.effectiveDpi} DPI)`);
                            // Load the server-rendered image
                            const img = new Image();
                            await new Promise<void>((resolve, reject) => {
                                img.onload = () => resolve();
                                img.onerror = () => reject(new Error('Failed to load server image'));
                                img.src = result.imageBase64;
                            });

                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0);
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                console.log(`[UploadZone] Server-side render OK: ${result.width}x${result.height} at ${result.effectiveDpi} DPI`);
                                onImageLoad(imageData, file.name);
                                setIsProcessing(false);
                                setRenderStatus('');
                                return;
                            }
                        }
                    } catch (serverErr) {
                        console.warn('[UploadZone] Server render unavailable, falling back to client-side:', serverErr);
                    }
                    setRenderStatus('Fallback: client-side rendering...');
                }

                // === FALLBACK: Client-Side pdf.js Rendering ===
                const pdfjsLib = (window as any).pdfjsLib;

                if (!pdfjsLib) {
                    alert("PDF Engine loading... please wait a moment.");
                    setIsProcessing(false);
                    return;
                }

                // Load the document
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;

                // Get the first page
                const page = await pdf.getPage(1);

                // Scale controls DPI: 72 × scale = effective DPI
                // Draft=3.0 (216 DPI), Production=4.17 (≈300 DPI)
                const mode = QUALITY_MODES[qualityMode];
                const scale = mode.pdfScale;
                const viewport = page.getViewport({ scale });
                console.log(`[UploadZone] Client-side PDF render at scale=${scale} (≈${Math.round(72 * scale)} DPI), viewport: ${Math.round(viewport.width)}x${Math.round(viewport.height)}`);

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    // Render PDF page into canvas context
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    onImageLoad(imageData, file.name);
                }
            } catch (err) {
                console.error("Vector parsing error:", err);
                alert("Error reading .AI/.PDF file. Ensure the file was saved with 'Create PDF Compatible File' checked in Illustrator.");
            } finally {
                setIsProcessing(false);
                setRenderStatus('');
            }
            return;
        }

        // Standard Image Handling
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Resolution cap: Draft=1200px, Production=3000px
                const mode = QUALITY_MODES[qualityMode];
                const maxWidth = mode.maxRasterWidth;
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                console.log(`[UploadZone] Raster loaded at ${width}x${Math.round(height)} (max: ${maxWidth}px, mode: ${qualityMode})`);

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = ctx.getImageData(0, 0, width, height);
                    onImageLoad(imageData, file.name);
                }
                setIsProcessing(false);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, [onImageLoad, qualityMode]);

    return (
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:bg-gray-800 transition-colors group cursor-pointer relative overflow-hidden">
            {/* Quality Mode Selector */}
            <div className="absolute top-3 right-3 z-30 flex gap-1 bg-gray-900/90 rounded-lg p-1 border border-gray-700" onClick={(e) => e.stopPropagation()}>
                {(Object.entries(QUALITY_MODES) as [QualityMode, typeof QUALITY_MODES[QualityMode]][]).map(([key, mode]) => {
                    const Icon = mode.icon;
                    const isActive = qualityMode === key;
                    return (
                        <button
                            key={key}
                            onClick={(e) => { e.stopPropagation(); setQualityMode(key); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isActive
                                ? key === 'production'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'text-gray-500 hover:text-gray-300 border border-transparent'
                                }`}
                            title={mode.description}
                        >
                            <Icon size={12} />
                            {mode.label}
                        </button>
                    );
                })}
            </div>

            <input
                type="file"
                onChange={handleFileChange}
                accept=".png,.jpg,.jpeg,.ai,.pdf,.psd"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                disabled={isProcessing}
            />

            {isProcessing ? (
                <div className="flex flex-col items-center justify-center animate-pulse">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
                    <h3 className="text-xl font-medium text-gray-200 mb-2">
                        {qualityMode === 'production' ? 'High-Quality Rendering...' : 'Processing...'}
                    </h3>
                    <p className="text-sm text-gray-400">
                        {renderStatus || (qualityMode === 'production'
                            ? 'Rendering at ≈300 DPI for maximum separation quality'
                            : 'Fast mode — decoding binary data')}
                    </p>
                    {qualityMode === 'production' && (
                        <p className="text-xs text-amber-400/60 mt-2">Production mode — this may take longer</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center pointer-events-none z-10">
                    <UploadCloud className="w-16 h-16 text-gray-500 group-hover:text-blue-400 mb-4 transition-colors" />
                    <h3 className="text-xl font-medium text-gray-200 mb-2">Drop artwork file here</h3>
                    <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
                        Supports high-res raster & vector files.
                    </p>
                    <div className="flex gap-2 justify-center text-xs text-gray-500 flex-wrap">
                        <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                            <FileType size={14} className="text-blue-600" /> .PSD
                        </span>
                        <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                            <FileType size={14} className="text-orange-400" /> .AI
                        </span>
                        <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                            <FileType size={14} className="text-red-400" /> .PDF
                        </span>
                        <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                            <FileType size={14} className="text-blue-400" /> .PNG
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UploadZone;
