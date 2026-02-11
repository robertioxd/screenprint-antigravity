import React, { useRef, useEffect } from 'react';

interface LayerPreviewProps {
  imageData: ImageData | null;
  width: number;
  height: number;
  label?: string;
  tint?: string; // If provided, renders the grayscale mask in this color
}

const LayerPreview: React.FC<LayerPreviewProps> = ({ imageData, width, height, label, tint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We can't just put ImageData if we want to apply a tint or scaling
    // For direct preview:
    if (!tint) {
        ctx.putImageData(imageData, 0, 0);
    } else {
        // Create a temporary canvas to apply tint
        // In screen printing preview: 
        // Input ImageData is: R=0,G=0,B=0 (Ink) and Alpha=255. Background is white/transparent.
        // Wait, our separation logic made Ink = Black (0,0,0,255).
        // To visualize "Red Ink" on screen:
        // We iterate pixels. If pixel is Black, we draw Red.
        
        const tempImg = ctx.createImageData(width, height);
        const d = tempImg.data;
        const src = imageData.data;
        
        // Parse tint hex
        const rT = parseInt(tint.slice(1, 3), 16);
        const gT = parseInt(tint.slice(3, 5), 16);
        const bT = parseInt(tint.slice(5, 7), 16);

        for(let i=0; i<src.length; i+=4) {
            // Check if pixel represents ink. 
            // In our logic: Black (0,0,0) is ink. White (255,255,255) is paper.
            // Or we check intensity.
            const intensity = src[i]; // 0 is dark (ink), 255 is light (no ink)
            const alpha = 255 - intensity; // Ink opacity
            
            d[i] = rT;
            d[i+1] = gT;
            d[i+2] = bT;
            d[i+3] = alpha; // Use the inverted intensity as alpha for the composite view
        }
        ctx.putImageData(tempImg, 0, 0);
    }

  }, [imageData, width, height, tint]);

  return (
    <div className="relative group bg-white border border-gray-600 rounded overflow-hidden shadow-sm">
      {label && (
        <div className="absolute top-0 left-0 bg-black/70 text-white text-xs px-2 py-1 z-10">
          {label}
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        width={width} 
        height={height} 
        className="w-full h-auto block bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')]"
      />
    </div>
  );
};

export default LayerPreview;
