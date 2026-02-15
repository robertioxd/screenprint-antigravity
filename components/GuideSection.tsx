import React from 'react';
import { Layers, Image as ImageIcon, Sparkles, Feather, Grid3X3, Ruler, Info, BookOpen, Wand2, Calculator } from 'lucide-react';

const GuideSection: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center justify-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-500" />
          Guía de Usuario y Documentación
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Aprende a configurar ScreenPrint Pro para obtener separaciones de color de calidad profesional optimizadas para serigrafía.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. Motores de Separación */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
            <Wand2 className="w-5 h-5 text-purple-400" />
            1. Motores de Separación
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="bg-blue-900/20 p-3 rounded-lg h-fit border border-blue-800/50">
                <Layers className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h4 className="font-bold text-blue-300 text-sm uppercase">Vector (Sólido)</h4>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                  Ideal para ilustraciones planas, logotipos y dibujos animados ("Spot Color"). 
                  Cada píxel se asigna al 100% a un solo color. Genera bordes duros y definidos.
                  <br/><span className="text-xs text-gray-500 italic">Recomendado para: Diseños vectoriales, textos, logos deportivos.</span>
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="bg-green-900/20 p-3 rounded-lg h-fit border border-green-800/50">
                <ImageIcon className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h4 className="font-bold text-green-300 text-sm uppercase">Raster (Simulated Process)</h4>
                <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                  Ideal para fotografías y degradados complejos. Utiliza transparencias y mezclas de color. 
                  Calcula qué tanto porcentaje de tinta se necesita en cada píxel basándose en CIEDE2000.
                  <br/><span className="text-xs text-gray-500 italic">Recomendado para: Fotos, arte digital complejo, humo, fuego.</span>
                </p>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-700">
               <div className="flex items-center gap-2 mb-1">
                   <Calculator className="w-4 h-4 text-green-500" />
                   <h4 className="font-bold text-green-400 text-xs uppercase">Adaptive Threshold (Umbral Adaptativo)</h4>
               </div>
               <p className="text-gray-400 text-xs leading-relaxed">
                   Calcula automáticamente el rango de captura de color basándose en la distancia entre los colores de tu paleta.
                   <br/><br/>
                   <strong className="text-gray-300">¿Cuándo usarlo?</strong> En imágenes con degradados sutiles (ej. tonos de piel) donde los colores de la paleta son muy similares. Ayuda a fusionarlos suavemente.
                   <br/><br/>
                   <strong className="text-gray-300">¿Cuándo apagarlo?</strong> En imágenes de alto contraste (ej. Negro sobre Blanco) o diseños con fondos sólidos. Si notas "ruido" o suciedad en el fondo, apágalo para usar el umbral estándar fijo.
               </p>
            </div>
          </div>
        </div>

        {/* 2. Limpieza y Refinamiento */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            2. Limpieza y Refinamiento
          </h3>
          <ul className="space-y-4">
            <li className="space-y-1">
              <div className="flex items-center gap-2 text-yellow-200 font-bold text-sm">
                <Sparkles className="w-4 h-4" /> Limpieza Inteligente (Cleanup)
              </div>
              <p className="text-gray-400 text-xs pl-6">
                Elimina "basura" o ruido. El valor (0-10) es relativo al tamaño de la capa. 
                Úsalo para quitar puntos aislados que son demasiado pequeños para revelarse en la malla.
              </p>
            </li>
            <li className="space-y-1">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Feather className="w-4 h-4" /> Suavizado de Bordes (Smooth)
              </div>
              <p className="text-gray-400 text-xs pl-6">
                Aplica un desenfoque gaussiano y re-enfoca. Convierte bordes pixelados (aliasing) en curvas suaves.
                Vital si la imagen original es de baja calidad o tiene bordes dentados.
              </p>
            </li>
            <li className="space-y-1">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <Info className="w-4 h-4" /> Cobertura Mínima
              </div>
              <p className="text-gray-400 text-xs pl-6">
                Descarta automáticamente canales que tienen muy poca información (ej. &lt; 0.5% del área).
                Ayuda a evitar generar positivos para capas que apenas son visibles.
              </p>
            </li>
          </ul>
        </div>

        {/* 3. Tramado y LPI */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl md:col-span-2">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
            <Grid3X3 className="w-5 h-5 text-blue-400" />
            3. Guía de Trama y Mallas (LPI vs Mesh)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
               <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Configuración de LPI</h4>
               <p className="text-gray-400 text-xs mb-4">
                 La LPI (Líneas por pulgada) define el tamaño del punto. 
                 <br/>Fórmula general: <code className="bg-gray-800 px-1 rounded text-blue-300">Malla / 4.5 = LPI Máximo</code>
               </p>
               <div className="space-y-2">
                 <div className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                    <span className="text-blue-300 font-bold text-xs">35-45 LPI</span>
                    <span className="text-gray-400 text-xs text-right">Mallas 90-120 (Textil base agua/Plastisol grueso)</span>
                 </div>
                 <div className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                    <span className="text-blue-300 font-bold text-xs">45-55 LPI</span>
                    <span className="text-gray-400 text-xs text-right">Mallas 120-160 (Estándar textil)</span>
                 </div>
                 <div className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                    <span className="text-blue-300 font-bold text-xs">55-65 LPI</span>
                    <span className="text-gray-400 text-xs text-right">Mallas 230-305 (Alta definición/Simulado)</span>
                 </div>
                 <div className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                    <span className="text-blue-300 font-bold text-xs">85+ LPI</span>
                    <span className="text-gray-400 text-xs text-right">Mallas 305+ o Papel/Offset</span>
                 </div>
               </div>
            </div>
            <div>
                <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Tipos de Trama</h4>
                <div className="space-y-4">
                    <div className="p-3 border border-gray-700 rounded bg-gray-800/50">
                        <div className="font-bold text-white text-sm mb-1">AM (Amplitude Modulation)</div>
                        <p className="text-gray-400 text-xs">
                            La trama de semitonos clásica. Puntos ordenados en rejilla que varían de tamaño.
                            Es la más fácil de revelar y estampar. Usa Ángulo (ej. 22.5°) para evitar Moiré.
                        </p>
                    </div>
                    <div className="p-3 border border-gray-700 rounded bg-gray-800/50">
                        <div className="font-bold text-white text-sm mb-1">FM (Frequency Modulation / Difusión)</div>
                        <p className="text-gray-400 text-xs">
                            Puntos del mismo tamaño distribuidos aleatoriamente (Estocástica). 
                            Ofrece un detalle fotográfico increíble pero es más difícil de revelar en la malla (puede causar ganancia de punto alta).
                        </p>
                    </div>
                </div>
            </div>
          </div>
        </div>

        {/* 4. Resolución de Salida */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl md:col-span-2">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
                <Ruler className="w-5 h-5 text-orange-400" />
                4. Resolución y Tamaño de Salida
            </h3>
            <p className="text-gray-400 text-sm mb-4">
                ScreenPrint Pro reescala tu imagen internamente antes de procesarla para asegurar que los puntos de trama tengan la resolución correcta.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-white mb-1">300 DPI</div>
                    <div className="text-xs text-gray-400 uppercase font-bold">Estándar Oro</div>
                    <p className="text-[10px] text-gray-500 mt-2">La resolución recomendada para generar positivos de alta calidad.</p>
                </div>
                <div className="bg-gray-800 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-white mb-1">Tamaño Físico</div>
                    <div className="text-xs text-gray-400 uppercase font-bold">Pulgadas Reales</div>
                    <p className="text-[10px] text-gray-500 mt-2">Configura el ancho en pulgadas al tamaño real que imprimirás en la camiseta.</p>
                </div>
                <div className="bg-gray-800 p-4 rounded text-center">
                    <div className="text-2xl font-bold text-white mb-1">Lanczos</div>
                    <div className="text-xs text-gray-400 uppercase font-bold">Algoritmo</div>
                    <p className="text-[10px] text-gray-500 mt-2">Usamos interpolación Lanczos para aumentar la resolución sin perder nitidez.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default GuideSection;