import React, { useCallback } from 'react';
import { UploadCloud, FileType } from 'lucide-react';

interface UploadZoneProps {
  onImageLoad: (data: ImageData, name: string) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onImageLoad }) => {
  
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type for simulated backend handling
    const isVector = file.name.endsWith('.ai') || file.name.endsWith('.pdf');
    const isPsd = file.name.endsWith('.psd');

    if (isVector || isPsd) {
       alert(`[MOCK BACKEND] Uploaded ${file.name}.\nIn production, Python backend (wand/psd-tools) would rasterize this to 300DPI PNG.\n\nFor this demo, please upload a standard PNG/JPG.`);
       return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Limit size for browser performance in demo
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          onImageLoad(imageData, file.name);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [onImageLoad]);

  return (
    <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center hover:bg-gray-800 transition-colors group cursor-pointer relative">
        <input 
            type="file" 
            onChange={handleFileChange} 
            accept=".png,.jpg,.jpeg,.ai,.psd" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center justify-center pointer-events-none">
            <UploadCloud className="w-16 h-16 text-gray-500 group-hover:text-blue-400 mb-4 transition-colors" />
            <h3 className="text-xl font-medium text-gray-200 mb-2">Drop artwork file here</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
                Supports PNG, JPG. <br/>
                <span className="text-xs text-gray-500">(AI & PSD handled via Python backend in prod)</span>
            </p>
            <div className="flex gap-2 mt-4 text-xs text-gray-600">
                <span className="bg-gray-900 px-2 py-1 rounded flex items-center gap-1"><FileType size={12}/> .AI</span>
                <span className="bg-gray-900 px-2 py-1 rounded flex items-center gap-1"><FileType size={12}/> .PSD</span>
                <span className="bg-gray-900 px-2 py-1 rounded flex items-center gap-1"><FileType size={12}/> .PNG</span>
            </div>
        </div>
    </div>
  );
};

export default UploadZone;
