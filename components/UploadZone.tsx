import React, { useCallback, useState } from 'react';
import { UploadCloud, FileType, Loader2 } from 'lucide-react';

interface UploadZoneProps {
  onImageLoad: (data: ImageData, name: string) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onImageLoad }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  
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
            
            // Read the PSD. We only strictly need the composite image for separation
            const psd = readPsd(arrayBuffer);
            
            if (psd && psd.canvas) {
                // If ag-psd returns a canvas directly (browser environment sometimes)
                const ctx = psd.canvas.getContext('2d');
                if (ctx) {
                    const imageData = ctx.getImageData(0, 0, psd.canvas.width, psd.canvas.height);
                    onImageLoad(imageData, file.name);
                }
            } else if (psd && psd.image) {
                // Construct ImageData from raw pixel data
                // psd.image.pixelData is Uint8ClampedArray (RGBA)
                const imageData = new ImageData(
                    psd.image.pixelData, 
                    psd.width, 
                    psd.height
                );
                onImageLoad(imageData, file.name);
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
            
            // Set scale for high quality rasterization (300 DPI equivalent relative to screen)
            const scale = 3.0; 
            const viewport = page.getViewport({ scale });

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
       }
       return;
    }

    // Standard Image Handling
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Limit size for browser performance in demo, but keep it decent for separation
        const maxWidth = 1200;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }

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
  }, [onImageLoad]);

  return (
    <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:bg-gray-800 transition-colors group cursor-pointer relative overflow-hidden">
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
                <h3 className="text-xl font-medium text-gray-200 mb-2">Analyzing File Structure...</h3>
                <p className="text-sm text-gray-400">Decoding binary data</p>
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
                        <FileType size={14} className="text-blue-600"/> .PSD
                    </span>
                    <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                        <FileType size={14} className="text-orange-400"/> .AI
                    </span>
                    <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                        <FileType size={14} className="text-red-400"/> .PDF
                    </span>
                    <span className="bg-gray-900 px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700">
                        <FileType size={14} className="text-blue-400"/> .PNG
                    </span>
                </div>
            </div>
        )}
    </div>
  );
};

export default UploadZone;