import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEFAULT_CONFIG } from '../types';

export const generateTechnicalDocumentation = () => {
  const doc = new jsPDF();
  const lineHeight = 7;
  let cursorY = 20;

  // Helper for headers
  const addHeader = (text: string, level: 1 | 2 = 1) => {
    if (cursorY > 270) { doc.addPage(); cursorY = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(level === 1 ? 16 : 12);
    doc.setTextColor(level === 1 ? 0 : 60);
    doc.text(text, 14, cursorY);
    cursorY += level === 1 ? 10 : 8;
  };

  // Helper for text
  const addText = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    const splitText = doc.splitTextToSize(text, 180);
    if (cursorY + (splitText.length * 5) > 280) { doc.addPage(); cursorY = 20; }
    doc.text(splitText, 14, cursorY);
    cursorY += (splitText.length * 5) + 2;
  };

  // Helper for bullet points
  const addBullet = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(text, 175);
    if (cursorY + (splitText.length * 5) > 280) { doc.addPage(); cursorY = 20; }
    doc.text("\u2022", 14, cursorY);
    doc.text(splitText, 18, cursorY);
    cursorY += (splitText.length * 5) + 2;
  };

  // --- 0. COVER ---
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Documentación Técnica de Arquitectura", 14, 20);
  
  doc.setFontSize(14);
  doc.text("ScreenPrint Pro - Sistema de Separación de Color", 14, 30);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 14, 40);
  doc.text("Versión del motor: Pyodide v0.27.2 / OpenCV JS", 14, 45);
  
  cursorY = 60;

  // --- 1. IDENTIDAD Y PROPÓSITO ---
  addHeader("1. Identidad y Propósito del Sistema");
  addText("Esta aplicación es una solución de ingeniería de software tipo SPA (Single Page Application) diseñada para descentralizar el proceso de pre-prensa en serigrafía textil.");
  
  addHeader("Objetivo Real", 2);
  addText("Proveer un motor de separación de color matemático y determinista (no basado en IA generativa alucinatoria) que ejecute algoritmos de visión computacional directamente en el navegador del cliente (Client-Side), eliminando latencia de servidor y garantizando privacidad de datos.");
  
  addHeader("Problema que Resuelve", 2);
  addText("La separación de color tradicional requiere software costoso (Photoshop, Separation Studio) y conocimientos avanzados. ScreenPrint Pro automatiza la conversión de imágenes RGB continuas a canales de tinta discretos (Spot Channels) listos para quemado de mallas.");

  addHeader("Usuario Objetivo", 2);
  addText("Serigrafistas intermedios/avanzados, diseñadores textiles y operadores de pre-prensa que requieren simulación inmediata de resultados.");

  // --- 2. ARQUITECTURA ---
  addHeader("2. Arquitectura Real Implementada");
  addText("El sistema sigue una arquitectura 'Thick Client' donde toda la lógica pesada reside en el frontend.");
  
  addHeader("Componentes y Flujo de Datos", 2);
  addBullet("Ingesta: React gestiona File API. Soporte nativo para PSD (ag-psd) y PDF (pdf.js).");
  addBullet("Motor de Cálculo: Pyodide (WebAssembly). Carga un entorno Python completo en memoria.");
  addBullet("Intercambio de Memoria: Los datos de imagen se transfieren como Uint8ClampedArray desde JS a Python (NumPy Heap).");
  addBullet("Procesamiento: OpenCV-Python y Scikit-Image ejecutan las transformaciones matriciales.");
  addBullet("Visualización: Los resultados vuelven a JS como Proxies y se renderizan en Canvas HTML5.");

  addHeader("Diagrama Lógico (Texto)", 2);
  addText("[Browser DOM] -> [File Input] -> [Canvas Context (Read RGB)] -> [SharedArrayBuffer]");
  addText("      | ");
  addText("      v ");
  addText("[WASM / Pyodide Worker]");
  addText("   1. NumPy Array Creation");
  addText("   2. cv2.bilateralFilter (Pre-process)");
  addText("   3. cv2.kmeans (Palette Analysis)");
  addText("   4. Color Distance Calculation (CIEDE2000)");
  addText("   5. Mask Generation & Morphology");
  addText("      | ");
  addText("      v ");
  addText("[JS Main Thread] <- [Layer Data Object]");
  addText("[React State Update] -> [LayerPreview Component]");

  // --- 3. MOTORES DE SEPARACIÓN ---
  addHeader("3. Motores de Separación Implementados");
  
  addHeader("A. Motor Vectorial (Spot Color)", 2);
  addBullet("Tipo: Clasificación Dura (Hard Clustering / Nearest Neighbor).");
  addBullet("Ejecución: Función `separate_colors_py` cuando config.separationType == 'vector'.");
  addBullet("Lógica: Calcula distancia de cada píxel a la paleta. Asigna 100% al color más cercano. Aplica Anti-aliasing (Gaussian Blur + Threshold) para suavizar bordes pixelados.");
  addBullet("Ventajas: Ideal para logotipos, textos y vectores planos. Fácil de revelar.");
  addBullet("Limitaciones: No soporta degradados suaves ni transparencias parciales.");

  addHeader("B. Motor Raster (Simulated Process)", 2);
  addBullet("Tipo: Segmentación Suave (Soft Probability Map).");
  addBullet("Ejecución: Función `separate_colors_py` cuando config.separationType == 'raster'.");
  addBullet("Lógica: Algoritmo heurístico propietario.");
  addBullet("Fórmula: Alpha = (1 - (Distancia / MaxDist)) * Exclusividad.");
  addBullet("Parámetros Internos: Adaptive Thresholding (calcula distancias relativas entre colores de la paleta para definir el radio de captura).");
  addBullet("Ventajas: Reproduce fotorealismo, humos y degradados complejos.");
  addBullet("Limitaciones: Requiere mallas altas (60-90 hilos/cm) y control preciso en prensa.");

  // --- 4. PIPELINE ---
  addHeader("4. Pipeline Completo de Procesamiento");
  
  const pipelineSteps = [
    ["1. Ingestión", "Decodificación de Blob a ImageData. Rasterización vectorial si es PDF/AI."],
    ["2. Pre-proceso", "Filtro Bilateral (OpenCV). Elimina ruido ISO/JPG manteniendo bordes de formas."],
    ["3. Análisis", "K-Means++ para encontrar centroides de color si no se provee paleta manual."],
    ["4. Conversión", "Transformación RGB a CIELAB para cálculos de distancia perceptual."],
    ["5. Segmentación", "Cálculo matricial de distancias (Delta E). Generación de mapas de probabilidad."],
    ["6. Limpieza", "Operaciones Morfológicas (cv2.morphologyEx): Opening (quita ruido), Closing (cierra huecos)."],
    ["7. Halftoning", "Conversión de canal Alpha (8-bit) a Bitmap (1-bit) usando celdas AM o difusión FM."],
    ["8. Composición", "Mezcla sustractiva simulada para vista previa (Porter-Duff Source-Over con opacidad de tinta)."]
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [['Fase', 'Descripción Técnica']],
    body: pipelineSteps,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 10;

  // --- 5. PARÁMETROS ---
  addHeader("5. Parámetros Configurables");

  const paramsData = [
    ["inkOpacity", "Float (0-1)", "0.90", "Simulación visual de densidad de tinta. No afecta el RIP."],
    ["cleanupStrength", "Int (0-10)", "0", "Tamaño del Kernel morfológico. Alto = Pérdida de detalle fino."],
    ["minCoverage", "Float %", "0.2%", "Elimina capas con pocos píxeles para ahorrar pantallas."],
    ["denoiseStrength", "Int", "5", "SigmaColor del filtro Bilateral. Alto = Efecto 'acurela'."],
    ["gamma", "Float", "1.25", "Curva de potencia para ganancia de punto en modo Raster."],
    ["halftoneLpi", "Int", "45", "Frecuencia de trama. Límite físico: Malla / 4.5."]
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [['Parámetro', 'Tipo', 'Default', 'Impacto Técnico']],
    body: paramsData,
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [22, 163, 74] } // Green header
  });
  cursorY = (doc as any).lastAutoTable.finalY + 10;

  addHeader("Configuración Oculta / Avanzada", 2);
  addBullet("Adaptive Threshold Logic: En modo Raster, el sistema calcula la distancia entre colores de la paleta. Si dos colores son muy cercanos (ej. Rojo y Rojo Oscuro), el radio de captura se reduce automáticamente (75% de la distancia mínima) para evitar contaminación cruzada.");
  addBullet("Vector AA Threshold: Fijo en 127 para binarización después del blur.");

  // --- 6. LIMITACIONES Y RIESGOS ---
  addHeader("6. Limitaciones y Riesgos Técnicos");
  addBullet("Bloqueo de UI: Al correr Pyodide en el hilo principal (Main Thread), la interfaz se congela durante operaciones pesadas (Separación/Halftoning). Solución pendiente: Mover a WebWorker.");
  addBullet("Memoria (OOM): El navegador limita la memoria WASM (aprox 2GB). Imágenes mayores a 4000x4000px pueden causar crash.");
  addBullet("Precisión de Color: La conversión RGB -> CMYK/Spot en pantalla es simulada. La física de la tinta real (opacidad, mezcla sustractiva) varía en prensa.");

  // --- 7. FORMATOS ---
  addHeader("7. Formats Soportados");
  addText("Entrada: JPG, PNG, WEBP (Raster nativo). PDF, AI (vía Rasterización vector-to-bitmap). PSD (Solo Composite).");
  addText("Salida: Visualización en navegador. Descarga ZIP conteniendo canales individuales como PNG 8-bit (Alpha) o 1-bit (Tramado).");

  // Save the PDF
  doc.save('ScreenPrintPro_Arquitectura_Tecnica.pdf');
};
