import React, { useState, useEffect } from 'react';
import { Layers, Printer, Wand2, Settings, Download, ScanEye, Package, ChevronDown, FileImage, FileArchive, Pipette } from 'lucide-react';
import UploadZone from './components/UploadZone';
import PaletteManager from './components/PaletteManager';
import LayerPreview from './components/LayerPreview';
import ComparisonView from './components/ComparisonView';
import AdvancedSettings from './components/AdvancedSettings';
import Button from './components/Button';
import { Layer, PaletteColor, ProcessingStatus, AdvancedConfig, DEFAULT_CONFIG } from './types';
import { analyzePalette, performSeparation, applyHalftone, initEngine, generateComposite, getPyodideInfo, hexToRgb } from './services/imageProcessing';
import { downloadComposite, downloadChannelsZip } from './services/exportService';

const App: React.FC = () => {
  // State
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [compositeImage, setCompositeImage] = useState<ImageData | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [activeTab, setActiveTab] = useState<'original' | 'separation' | 'halftone' | 'compare'>('original');
  const [engineReady, setEngineReady] = useState(false);
  const [pyodideInfo, setPyodideInfo] = useState<{version: string, packages: string[]} | null>(null);
  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(DEFAULT_CONFIG);
  
  // UI State
  const [showPackageList, setShowPackageList] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(true); // Open by default for easier tuning
  const [isPickerActive, setIsPickerActive] = useState(false);

  // Initialize Pyodide
  useEffect(() => {
    setStatus(ProcessingStatus.LOADING_ENGINE);
    initEngine().then(() => {
        setEngineReady(true);
        setPyodideInfo(getPyodideInfo());
        setStatus(ProcessingStatus.IDLE);
    }).catch(err => {
        console.error("Failed to load python engine", err);
        alert("Failed to load Python Engine. Please refresh.");
    });
  }, []);

  const handleImageLoad = (data: ImageData) => {
    setOriginalImage(data);
    setPalette([]);
    setLayers([]);
    setCompositeImage(null);
    setStatus(ProcessingStatus.IDLE);
    setActiveTab('original');
    setIsPickerActive(false);
  };

  const runAnalysis = async () => {
    if (!originalImage) return;
    setStatus(ProcessingStatus.ANALYZING);
    try {
      await new Promise(r => setTimeout(r, 50));
      const detected = await analyzePalette(originalImage, 8, advancedConfig);
      setPalette(detected);
    } catch (e) {
      console.error(e);
      alert("Error analyzing palette");
    } finally {
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const runSeparation = async () => {
    if (!originalImage || palette.length === 0) return;
    setStatus(ProcessingStatus.SEPARATING);
    try {
        await new Promise(r => setTimeout(r, 50));
        const result = await performSeparation(originalImage, palette, advancedConfig);
        setLayers(result);
        setStatus(ProcessingStatus.COMPOSITING);
        const comp = await generateComposite(result, originalImage.width, originalImage.height, advancedConfig);
        setCompositeImage(comp);
        setActiveTab('separation');
    } catch (e) {
        console.error(e);
        alert("Separation failed");
    } finally {
        setStatus(ProcessingStatus.IDLE);
    }
  };

  const runHalftone = async () => {
    if (layers.length === 0) return;
    setStatus(ProcessingStatus.HALFTONING);
    try {
        await new Promise(r => setTimeout(r, 50));
        const halftonedLayers: Layer[] = [];
        for (const layer of layers) {
             const htData = await applyHalftone(layer.data, advancedConfig);
             halftonedLayers.push({ ...layer, data: htData });
        }
        setLayers(halftonedLayers);
        setStatus(ProcessingStatus.COMPOSITING);
        const comp = await generateComposite(halftonedLayers, originalImage!.width, originalImage!.height, advancedConfig);
        setCompositeImage(comp);
        setActiveTab('halftone');
        setStatus(ProcessingStatus.COMPLETE);
    } catch (e) {
        console.error(e);
        alert("Halftoning failed");
        setStatus(ProcessingStatus.IDLE);
    }
  };

  const handleColorPick = (hex: string) => {
      if (palette.some(p => p.hex === hex)) return;
      const newColor: PaletteColor = {
          id: `picked-${Date.now()}`,
          hex: hex,
          rgb: hexToRgb(hex),
          locked: true
      };
      setPalette([...palette, newColor]);
  };

  useEffect(() => {
    if (layers.length > 0 && originalImage && (activeTab === 'separation' || activeTab === 'halftone' || activeTab === 'compare')) {
        const updateComposite = async () => {
            const comp = await generateComposite(layers, originalImage.width, originalImage.height, advancedConfig);
            setCompositeImage(comp);
        };
        updateComposite();
    }
  }, [advancedConfig.inkOpacity]);

  return (
    <div className="min-h-screen flex flex-col h-screen overflow-hidden" onClick={() => {
        if(showExportMenu) setShowExportMenu(false);
        if(showPackageList) setShowPackageList(false);
    }}>
      <header className="bg-gray-800 border-b border-gray-700 h-16 flex items-center px-6 justify-between flex-shrink-0 z-50 relative">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Printer className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">ScreenPrint <span className="text-blue-500">Pro</span></h1>
        </div>
        <div className="flex gap-4 items-center">
            {!engineReady && (
                <div className="flex items-center gap-2 text-yellow-400 text-sm animate-pulse">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    Loading Engine...
                </div>
            )}
            {engineReady && pyodideInfo && (
                 <div className="relative">
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowPackageList(!showPackageList); setShowExportMenu(false); }}
                        className="flex items-center gap-2 text-green-400 text-xs hover:bg-gray-700 px-2 py-1 rounded transition-colors cursor-pointer border border-transparent hover:border-gray-600"
                     >
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        v{pyodideInfo.version} DIP Ready
                    </button>
                    {showPackageList && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-0 overflow-hidden ring-1 ring-black ring-opacity-5" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-900 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                                <h4 className="text-gray-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                                    <Package className="w-3 h-3" /> Libraries
                                </h4>
                            </div>
                            <ul className="max-h-80 overflow-y-auto custom-scrollbar p-2">
                                {pyodideInfo.packages.sort().map(pkg => (
                                    <li key={pkg} className="text-xs text-gray-400 hover:text-white hover:bg-gray-700 px-2 py-1.5 rounded font-mono transition-colors">
                                        {pkg}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
          <div className="text-xs text-gray-400 flex flex-col items-end border-l border-gray-700 pl-4">
            <span className="text-blue-400 font-bold tracking-tighter">CIEDE2000 SOFT-MASKING</span>
            <span className="opacity-50">Precision Pre-press Suite</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar flex-shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
              <Wand2 className="w-4 h-4" /> 1. Paleta de Tintas
            </div>
            <PaletteManager palette={palette} setPalette={setPalette} onAnalyze={runAnalysis} status={status} />
          </div>

          <div className="space-y-3">
             <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
              <Settings className="w-4 h-4" /> 2. Procesamiento
            </div>
            <AdvancedSettings 
              config={advancedConfig} 
              onChange={setAdvancedConfig} 
              isOpen={showAdvancedSettings} 
              onToggle={() => setShowAdvancedSettings(!showAdvancedSettings)} 
            />
            <div className="space-y-2">
              <Button className="w-full text-sm py-2.5 shadow-lg shadow-blue-900/20" onClick={runSeparation} disabled={palette.length === 0 || !originalImage || !engineReady} isLoading={status === ProcessingStatus.SEPARATING || status === ProcessingStatus.COMPOSITING}>
                Run Separation
              </Button>
              <Button className="w-full text-sm py-2.5" variant="secondary" onClick={runHalftone} disabled={layers.length === 0 || !engineReady} isLoading={status === ProcessingStatus.HALFTONING}>
                Apply Bitmaps
              </Button>
            </div>
          </div>

           <div className="mt-auto pt-6 border-t border-gray-800 relative">
             <div className="relative">
                 <Button variant="danger" className="w-full justify-between group py-2.5 shadow-lg shadow-red-900/10" disabled={layers.length === 0} onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); setShowPackageList(false); }}>
                    <span className="flex items-center">
                        <Download className="w-4 h-4 mr-2" /> Export Results
                    </span>
                    <ChevronDown className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                 </Button>
                 {showExportMenu && layers.length > 0 && (
                     <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                         <button onClick={() => { downloadComposite(compositeImage); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center gap-3 transition-colors text-sm text-gray-200">
                             <FileImage className="w-4 h-4 text-blue-400" />
                             <div><div className="font-medium">Save Composite</div><div className="text-xs text-gray-500">Full artwork simulation</div></div>
                         </button>
                         <div className="h-px bg-gray-700"></div>
                         <button onClick={() => { downloadChannelsZip(layers); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center gap-3 transition-colors text-sm text-gray-200">
                             <FileArchive className="w-4 h-4 text-yellow-400" />
                             <div><div className="font-medium">Download Positives</div><div className="text-xs text-gray-500">ZIP with separated channels</div></div>
                         </button>
                     </div>
                 )}
             </div>
           </div>
        </aside>

        <section className="flex-1 bg-gray-950 relative flex flex-col">
          <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-2 flex-shrink-0">
            <button onClick={() => setActiveTab('original')} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-md transition-all ${activeTab === 'original' ? 'bg-gray-850 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Original</button>
            <button onClick={() => setActiveTab('separation')} disabled={layers.length === 0} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-md transition-all ${activeTab === 'separation' ? 'bg-gray-850 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}>Separations</button>
            <button onClick={() => setActiveTab('compare')} disabled={!compositeImage} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-md transition-all flex items-center gap-2 ${activeTab === 'compare' ? 'bg-gray-850 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}><ScanEye className="w-3 h-3" /> Compare</button>
            <button onClick={() => setActiveTab('halftone')} disabled={layers.length === 0 || status !== ProcessingStatus.COMPLETE} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-md transition-all ${activeTab === 'halftone' ? 'bg-gray-850 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}>Halftones</button>
          </div>

          <div className="flex-1 p-8 overflow-auto flex items-start justify-center custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 to-gray-950">
            {activeTab === 'original' && (
              <div className="w-full max-w-4xl animate-in fade-in duration-500">
                {!originalImage ? <UploadZone onImageLoad={handleImageLoad} /> : (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center bg-gray-900 p-2 rounded-t-lg border border-gray-700 border-b-0">
                        <span className="text-xs font-bold text-gray-400 px-2">ARTWORK WORKSPACE</span>
                        <Button 
                            variant={isPickerActive ? "primary" : "secondary"} 
                            size="sm"
                            className="text-xs py-1"
                            onClick={() => setIsPickerActive(!isPickerActive)}
                            title="Click on the image to add a color to the palette"
                        >
                            <Pipette className="w-3 h-3 mr-1" />
                            {isPickerActive ? "Picker Active" : "Color Picker"}
                        </Button>
                     </div>
                     <div className="border border-gray-700 rounded-b-lg overflow-hidden shadow-2xl">
                        <LayerPreview 
                            imageData={originalImage} 
                            width={originalImage.width} 
                            height={originalImage.height} 
                            onPixelSelect={isPickerActive ? handleColorPick : undefined}
                        />
                     </div>
                     <div className="text-center">
                        <Button variant="ghost" onClick={() => setOriginalImage(null)} className="text-sm opacity-50 hover:opacity-100 transition-opacity">Remove & Upload New</Button>
                     </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'compare' && <div className="w-full max-w-[95%] animate-in zoom-in-95 duration-300"><ComparisonView original={originalImage} composite={compositeImage} /></div>}
            {(activeTab === 'separation' || activeTab === 'halftone') && (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-w-7xl animate-in fade-in duration-500">
                <div className="col-span-full mb-6 bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-50"></div>
                    <h3 className="text-white text-xs mb-6 font-bold flex items-center gap-2 uppercase tracking-widest opacity-70">
                        <Settings className="w-4 h-4 text-blue-500" /> SIMULACIÓN DE ESTAMPADO
                    </h3>
                    {compositeImage && <div className="relative bg-black/50 flex items-center justify-center rounded-lg overflow-hidden border border-gray-700 min-h-[400px] shadow-inner"><LayerPreview imageData={compositeImage} width={compositeImage.width} height={compositeImage.height} /></div>}
                </div>
                {layers.map((layer) => (
                  <div key={layer.id} className="space-y-2 group animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between text-gray-400 text-[10px] uppercase font-bold bg-gray-900 p-3 rounded-t-lg border-x border-t border-gray-800 group-hover:bg-gray-850 transition-colors">
                       <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shadow-sm ring-1 ring-white/10" style={{backgroundColor: layer.color.hex}}></span>{layer.color.hex}</span>
                       <span className="opacity-50 text-[9px]">{activeTab === 'halftone' ? 'TRAMA AM' : 'SEPARACIÓN'}</span>
                    </div>
                    <div className="border-x border-b border-gray-800 rounded-b-lg overflow-hidden shadow-lg group-hover:shadow-blue-500/5 transition-all">
                      <LayerPreview 
                        imageData={layer.data} 
                        width={layer.data.width} 
                        height={layer.data.height} 
                        tint={activeTab === 'separation' ? layer.color.hex : undefined} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      
      {status === ProcessingStatus.LOADING_ENGINE && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center backdrop-blur-md">
            <div className="text-center max-w-md p-10 bg-gray-800 rounded-3xl border border-gray-700 shadow-2xl ring-1 ring-white/10">
                <div className="animate-spin w-16 h-16 border-t-4 border-l-4 border-blue-500 border-transparent rounded-full mx-auto mb-8 shadow-inner"></div>
                <h2 className="text-3xl font-black text-white mb-4 tracking-tighter">Iniciando Motor DIP</h2>
                <p className="text-gray-400 text-base leading-relaxed font-medium">Cargando módulos de visión computacional y modelos de color CIEDE2000...</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;