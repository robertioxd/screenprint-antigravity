import React, { useState, useEffect } from 'react';
import { Layers, Printer, Wand2, Settings, Download, ScanEye, Package, ChevronDown, FileImage, FileArchive } from 'lucide-react';
import UploadZone from './components/UploadZone';
import PaletteManager from './components/PaletteManager';
import LayerPreview from './components/LayerPreview';
import ComparisonView from './components/ComparisonView';
import AdvancedSettings from './components/AdvancedSettings';
import Button from './components/Button';
import { Layer, PaletteColor, ProcessingStatus, AdvancedConfig, DEFAULT_CONFIG } from './types';
import { analyzePalette, performSeparation, applyHalftone, initEngine, generateComposite, getPyodideInfo } from './services/imageProcessing';
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
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

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
  };

  const runAnalysis = async () => {
    if (!originalImage) return;
    setStatus(ProcessingStatus.ANALYZING);
    try {
      await new Promise(r => setTimeout(r, 50));
      const detected = await analyzePalette(originalImage, 6, advancedConfig);
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
             const htData = await applyHalftone(layer.data);
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

  // Re-generate composite if config changes while viewing separations/halftones
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
                    Loading High-Precision Engine...
                </div>
            )}
            {engineReady && pyodideInfo && (
                 <div className="relative">
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowPackageList(!showPackageList); setShowExportMenu(false); }}
                        className="flex items-center gap-2 text-green-400 text-xs hover:bg-gray-700 px-2 py-1 rounded transition-colors cursor-pointer border border-transparent hover:border-gray-600"
                     >
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        Pyodide v{pyodideInfo.version} High Precision Ready
                    </button>
                    {showPackageList && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-0 overflow-hidden ring-1 ring-black ring-opacity-5" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-900 px-4 py-2 border-b border-gray-700 flex justify-between items-center">
                                <h4 className="text-gray-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                                    <Package className="w-3 h-3" /> Installed Libraries
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
            <span className="text-blue-400 font-bold">CIEDE2000 Precision Mode</span>
            <span>Clustering: LAB Space K-Means</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col p-4 gap-6 overflow-y-auto custom-scrollbar flex-shrink-0">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
              <Wand2 className="w-4 h-4" /> 1. Palette Config
            </div>
            <PaletteManager palette={palette} setPalette={setPalette} onAnalyze={runAnalysis} status={status} />
          </div>

          <div className="space-y-4">
             <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-widest px-1">
              <Layers className="w-4 h-4" /> 2. Processing
            </div>
            <AdvancedSettings 
              config={advancedConfig} 
              onChange={setAdvancedConfig} 
              isOpen={showAdvancedSettings} 
              onToggle={() => setShowAdvancedSettings(!showAdvancedSettings)} 
            />
            <div className="space-y-2">
              <Button className="w-full text-sm py-2.5" onClick={runSeparation} disabled={palette.length === 0 || !originalImage || !engineReady} isLoading={status === ProcessingStatus.SEPARATING || status === ProcessingStatus.COMPOSITING}>
                Run High-Precision Sep
              </Button>
              <Button className="w-full text-sm py-2.5" variant="secondary" onClick={runHalftone} disabled={layers.length === 0 || !engineReady} isLoading={status === ProcessingStatus.HALFTONING}>
                Apply Bitmaps
              </Button>
            </div>
          </div>

           <div className="mt-auto pt-6 border-t border-gray-800 relative">
             <div className="relative">
                 <Button variant="danger" className="w-full justify-between group py-2.5" disabled={layers.length === 0} onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); setShowPackageList(false); }}>
                    <span className="flex items-center">
                        <Download className="w-4 h-4 mr-2" /> Export Results
                    </span>
                    <ChevronDown className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                 </Button>
                 {showExportMenu && layers.length > 0 && (
                     <div className="absolute bottom-full left-0 w-full mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
                         <button onClick={() => { downloadComposite(compositeImage); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center gap-3 transition-colors text-sm text-gray-200">
                             <FileImage className="w-4 h-4 text-blue-400" />
                             <div><div className="font-medium">Save Composite</div><div className="text-xs text-gray-500">Simulated Print (PNG)</div></div>
                         </button>
                         <div className="h-px bg-gray-700"></div>
                         <button onClick={() => { downloadChannelsZip(layers); setShowExportMenu(false); }} className="w-full px-4 py-3 text-left hover:bg-gray-700 flex items-center gap-3 transition-colors text-sm text-gray-200">
                             <FileArchive className="w-4 h-4 text-yellow-400" />
                             <div><div className="font-medium">Download Positives</div><div className="text-xs text-gray-500">Individual Screens (ZIP)</div></div>
                         </button>
                     </div>
                 )}
             </div>
           </div>
        </aside>

        <section className="flex-1 bg-gray-950 relative flex flex-col">
          <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-2 flex-shrink-0">
            <button onClick={() => setActiveTab('original')} className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === 'original' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>Original</button>
            <button onClick={() => setActiveTab('separation')} disabled={layers.length === 0} className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === 'separation' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}>Separations</button>
            <button onClick={() => setActiveTab('compare')} disabled={!compositeImage} className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors flex items-center gap-2 ${activeTab === 'compare' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}><ScanEye className="w-4 h-4" /> Compare</button>
            <button onClick={() => setActiveTab('halftone')} disabled={layers.length === 0 || status !== ProcessingStatus.COMPLETE} className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${activeTab === 'halftone' ? 'bg-gray-800 text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}>Halftones</button>
          </div>

          <div className="flex-1 p-8 overflow-auto flex items-start justify-center custom-scrollbar">
            {activeTab === 'original' && (
              <div className="w-full max-w-4xl">
                {!originalImage ? <UploadZone onImageLoad={handleImageLoad} /> : (
                  <div className="space-y-4">
                     <LayerPreview imageData={originalImage} width={originalImage.width} height={originalImage.height} label="Original Composite" />
                     <div className="text-center">
                        <Button variant="ghost" onClick={() => setOriginalImage(null)} className="text-sm">Remove & Upload New</Button>
                     </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'compare' && <div className="w-full max-w-[90%]"><ComparisonView original={originalImage} composite={compositeImage} /></div>}
            {(activeTab === 'separation' || activeTab === 'halftone') && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl">
                <div className="col-span-full mb-4 bg-gray-900 p-6 rounded-lg border border-gray-800 shadow-xl">
                    <h3 className="text-white text-sm mb-4 font-bold flex items-center gap-2 uppercase tracking-widest opacity-70"><Settings className="w-4 h-4" /> Accurate Print Simulation</h3>
                    {compositeImage && <div className="relative bg-black/50 flex items-center justify-center rounded-lg overflow-hidden border border-gray-700 min-h-[400px]"><LayerPreview imageData={compositeImage} width={compositeImage.width} height={compositeImage.height} /></div>}
                </div>
                {layers.map((layer) => (
                  <div key={layer.id} className="space-y-2 group">
                    <div className="flex items-center justify-between text-gray-400 text-[10px] uppercase font-bold bg-gray-900 p-3 rounded-t-lg border-x border-t border-gray-800 group-hover:bg-gray-850 transition-colors">
                       <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shadow-sm" style={{backgroundColor: layer.color.hex}}></span>{layer.color.hex}</span>
                       <span className="opacity-50">{activeTab === 'halftone' ? 'Positive' : 'Channel'}</span>
                    </div>
                    <div className="border-x border-b border-gray-800 rounded-b-lg overflow-hidden">
                      <LayerPreview imageData={layer.data} width={layer.data.width} height={layer.data.height} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      
      {status === ProcessingStatus.LOADING_ENGINE && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
            <div className="text-center max-w-md p-8 bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl scale-110">
                <div className="animate-spin w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-6"></div>
                <h2 className="text-2xl font-bold text-white mb-3">Initializing Python DIP Engine</h2>
                <p className="text-gray-400 text-base leading-relaxed">Loading CIEDE2000 math modules...<br/>Preparing high-fidelity color separation.</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;