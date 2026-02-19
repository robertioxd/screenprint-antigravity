import React from 'react';
import { Layers, Image as ImageIcon, Sparkles, Feather, Grid3X3, Ruler, Info, BookOpen, Wand2, Calculator, Droplets, ScanFace, FileText, Download } from 'lucide-react';
import Button from './Button';
import { generateTechnicalDocumentation } from '../services/docGenerator';

const GuideSection: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="text-center space-y-4 mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center justify-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-500" />
          Guía de Usuario y Documentación
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Aprende a configurar ScreenPrint Pro para obtener separaciones de color de calidad profesional optimizadas para serigrafía.
        </p>
        
        <div className="flex justify-center mt-4">
             <Button 
                onClick={generateTechnicalDocumentation} 
                className="bg-gray-800 border border-gray-600 hover:bg-gray-700 text-gray-200 shadow-lg"
             >
                <FileText className="w-4 h-4 mr-2 text-blue-400" />
                Descargar Documentación Técnica (PDF)
             </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 0. Pre-procesamiento */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl md:col-span-2">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
                <Droplets className="w-5 h-5 text-cyan-400" />
                0. Pre-procesamiento (Denoise)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                        Antes de separar colores, es crucial limpiar la imagen original. Utilizamos un <strong>Filtro Bilateral</strong>, una técnica avanzada que suaviza las superficies planas (eliminando ruido JPG o grano de escaneo) pero <strong>preserva los bordes afilados</strong>.
                    </p>
                    <div className="flex gap-4 items-start">
                        <div className="bg-cyan-900/20 p-2 rounded-lg border border-cyan-800/50 mt-1">
                             <ScanFace className="w-5 h-5 text-cyan-400"/>
                        </div>
                        <div>
                            <h4 className="font-bold text-cyan-300 text-sm uppercase">¿Por qué es importante?</h4>
                            <p className="text-xs text-gray-500 mt-1">
                                A diferencia de un desenfoque normal que "emborrona" todo, este filtro mantiene la definición de tu diseño mientras simplifica los colores internos. Esto resulta en separaciones mucho más limpias y fáciles de vectorizar o tramar.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="space-y-3 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                     <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-300 uppercase">Intensidad Color (SigmaColor)</span>
                            <span className="text-[10px] bg-gray-700 px-1.5 rounded text-gray-400">Default: 5</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-tight">
                            Controla cuánto se mezclan colores similares. Valores altos crean un efecto "Cartoon" o posterizado, ideal para reducir la cantidad de colores en una fotografía.
                        </p>
                     </div>
                     <div className="w-full h-px bg-gray-700"></div>
                     <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-gray-300 uppercase">Espacio (SigmaSpace)</span>
                            <span className="text-[10px] bg-gray-700 px-1.5 rounded text-gray-400">Default: 5</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-tight">
                            Define el radio de influencia. Valores altos afectan áreas más grandes, suavizando texturas rugosas.
                        </p>
                     </div>
                </div>
            </div>
        </div>

        {/* 1. Motores de Separación */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-gray-800 pb-2">
            <Wand2 className="w-5 h-5 text-purple-400" />
            1. Motores de Separación
          </h3>
          <div className="space-y-6">
            
            {/* Vector Mode */}
            <div className="space-y-3">
                <div className="flex gap-4">
                    <div className="bg-blue-900/20 p-3 rounded-lg h-fit border border-blue-800/50">
                        <Layers className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h4 className="font-bold text-blue-300 text-sm uppercase">Vector (Sólido)</h4>
                        <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                        Cada píxel se asigna al 100% a un solo color ("Spot Color"). Genera bordes duros.
                        </p>
                    </div>
                </div>
                
                {/* Anti-Aliasing Explanation */}
                <div className="ml-14 bg-blue-950/30 p-3 rounded border border-blue-900/50">
                    <div className="text-xs font-bold text-blue-200 uppercase mb-1 flex items-center gap-2">
                        <Wand2 className="w-3 h-3"/> Anti-Aliasing
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed mb-2">
                        Suaviza los bordes dentados ("pixelados") de las formas sólidas aplicando un desenfoque gaussiano seguido de un umbral duro (threshold).
                    </p>
                    <ul className="text-[10px] text-gray-500 space-y-1 list-disc pl-3">
                        <li><strong>Sigma:</strong> Radio del suavizado. Aumenta para curvas más orgánicas.</li>
                        <li><strong>Threshold:</strong> Punto de corte. Define el grosor de la forma final.</li>
                    </ul>
                </div>
            </div>

            {/* Raster Mode */}
            <div className="flex gap-4 pt-4 border-t border-gray-800">
              <div className="bg-green-900/20 p-3 rounded-lg h-fit border border-green-800/50">
                <ImageIcon className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h4 className="font-bold text-green-300 text-sm uppercase">Raster (Simulated Process)</h4>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  Calcula porcentajes de tinta (transparencias) basados en la similitud de color (CIEDE2000). Ideal para degradados, humo y fotos.
                </p>
                 <div className="mt-2 text-[10px] bg-green-900/20 text-green-200 px-2 py-1 rounded inline-block border border-green-800/30">
                   <strong>Adaptive Threshold:</strong> Ajusta dinámicamente el rango de captura según la proximidad de otros colores en la paleta.
                 </div>
              </div>
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
                Elimina "basura" o ruido post-separación usando operaciones morfológicas (Apertura/Cierre). El valor (1-10) escala con el tamaño de la imagen.
              </p>
            </li>
            <li className="space-y-1">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Feather className="w-4 h-4" /> Suavizado de Bordes (Smooth)
              </div>
              <p className="text-gray-400 text-xs pl-6">
                Aplica un desenfoque gaussiano al canal final. Útil si el resultado vectorizado quedó demasiado "duro" o angular.
              </p>
            </li>
            <li className="space-y-1">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <Info className="w-4 h-4" /> Cobertura Mínima
              </div>
              <p className="text-gray-400 text-xs pl-6">
                Descarta automáticamente canales que tienen muy poca información (ej. &lt; 0.5% del área total). Ahorra tiempo y materiales.
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
                ScreenPrint Pro reescala tu imagen internamente usando <strong>OpenCV (Lanczos4)</strong> antes de procesarla para asegurar que los puntos de trama tengan la resolución correcta.
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
                    <div className="text-2xl font-bold text-white mb-1">Lanczos4</div>
                    <div className="text-xs text-gray-400 uppercase font-bold">Algoritmo</div>
                    <p className="text-[10px] text-gray-500 mt-2">Usamos interpolación Lanczos de OpenCV para aumentar la resolución sin perder nitidez.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default GuideSection;