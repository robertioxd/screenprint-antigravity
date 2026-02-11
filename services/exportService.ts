import JSZip from 'jszip';
import saveAs from 'file-saver';
import { Layer } from '../types';

// Helper to convert ImageData to Blob via a temporary canvas
const imageDataToBlob = (imageData: ImageData): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas to Blob failed'));
    }, 'image/png');
  });
};

export const downloadComposite = async (compositeData: ImageData | null) => {
  if (!compositeData) return;
  try {
    const blob = await imageDataToBlob(compositeData);
    saveAs(blob, `screenprint-composite-${Date.now()}.png`);
  } catch (err) {
    console.error("Export failed", err);
    alert("Failed to export image.");
  }
};

export const downloadChannelsZip = async (layers: Layer[], fileNamePrefix: string = 'separations') => {
  if (layers.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder(fileNamePrefix) || zip;

  try {
    // Generate blobs for all layers
    const promises = layers.map(async (layer, index) => {
      const blob = await imageDataToBlob(layer.data);
      // Clean hex for filename
      const colorName = layer.color.hex.replace('#', '');
      const filename = `${index + 1}_${colorName}.png`;
      folder.file(filename, blob);
    });

    await Promise.all(promises);

    // Generate zip file
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${fileNamePrefix}-${Date.now()}.zip`);

  } catch (err) {
    console.error("Zip generation failed", err);
    alert("Failed to generate ZIP file.");
  }
};
