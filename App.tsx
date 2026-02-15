import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Printer, Wand2, Settings, Download, ScanEye, Package, ChevronDown, FileImage, FileArchive, Pipette, Maximize2, X, BookOpen, Undo, Redo } from 'lucide-react';
import UploadZone from './components/UploadZone';
import PaletteManager from './components/PaletteManager';
import LayerPreview from './components/LayerPreview';
import ComparisonView from './components/ComparisonView';
import AdvancedSettings from './components/AdvancedSettings';
import OutputSizePanel from './components/OutputSizePanel';
import GuideSection from './components/GuideSection';
import Button from './components/Button';
import LayerDetailModal from './components/LayerDetailModal';
import { ChopModal, MergeModal, EditColorModal } from './components/LayerActionModals';
import { Layer, PaletteColor, ProcessingStatus, AdvancedConfig, DEFAULT_CONFIG } from './types';
import { analyzePalette, performSeparation, applyHalftone, initEngine, generateComposite, getPyodideInfo, hexToRgb, mergeLayersData, createGrayscaleFromAlpha, resizeImage } from './services/imageProcessing';
import { downloadComposite, downloadChannelsZip } from './services/exportService';

const App: React.FC = () => {
  // State
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [compositeImage, setCompositeImage] = useState<ImageData | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  
  // Layer & History State
  const [layers, setLayers] = useState<Layer[]>([]);
  const [history, setHistory] = useState<Layer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [activeTab, setActiveTab] = useState<'original' | 'separation' | 'halftone' | 'compare' | 'guide'>('original');
  const [engineReady, setEngineReady] = useState(false);
  const [pyodideInfo, setPyodideInfo] = useState<{version: string, packages: string[]} | null>(null);
  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(DEFAULT_CONFIG);
  
  // UI State
  const [showPackageList, setShowPackageList] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(true); 
  const [isPickerActive, setIsPickerActive] = useState(false);
  
  // Layer Management State
  const [previewLayerIndex, setPreviewLayerIndex] = useState<number | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'chop' | 'merge' | 'edit'>('view');

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
    setHistory([]);
    setHistoryIndex(-1);
    setCompositeImage(null);
    setStatus(ProcessingStatus.IDLE);
    setActiveTab('original');
    setIsPickerActive(false);
  };

  // --- UNDO / REDO LOGIC ---
  const updateLayersWithHistory = (newLayers: Layer[]) => {
      // 1. Slice history if we are in the middle of the stack
      const currentHistory = history.slice(0, historyIndex + 1);
      
      // 2. Add current state to history (Max 10 steps to save memory with ImageData)
      const newHistory = [...currentHistory, newLayers];
      if (newHistory.length > 10) newHistory.shift();

      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setLayers(newLayers);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          setLayers(history[prevIndex]);
          setHistoryIndex(prevIndex);
      } else if (historyIndex === 0) {
          // If at index 0, check if we want to clear or just keep 0?
          // Usually index 0 is the "start".
          setLayers(history[0]);
          setHistoryIndex(0);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          setLayers(history[nextIndex]);
          setHistoryIndex(nextIndex);
      }
  };

  // When running separation, we initialize history
  const initializeLayerHistory = (initialLayers: Layer[]) => {
      setHistory([initialLayers]);
      setHistoryIndex(0);
      setLayers(initialLayers);
  };

  // --- END UNDO/REDO ---

  const runAnalysis = async (numColors: number) => {
    if (!originalImage) return;
    setStatus(ProcessingStatus.ANALYZING);
    try {
      await new Promise(r => setTimeout(r, 50));
      const detected = await analyzePalette(originalImage, numColors, advancedConfig);
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
    
    try {
        let workingImage = originalImage;

        // 1. Check for Resize Requirement
        const aspectRatio = originalImage.width / originalImage.height;
        let targetW, targetH;
        
        if (advancedConfig.outputMeasurement === 'width') {
            targetW = Math.round(advancedConfig.outputSizeInches * advancedConfig.outputDpi);
            targetH = Math.round(targetW / aspectRatio);
        } else {
            targetH = Math.round(advancedConfig.outputSizeInches * advancedConfig.outputDpi);
            targetW = Math.round(targetH * aspectRatio);
        }

        // Allow some tolerance to avoid unnecessary resizing
        if (Math.abs(targetW - originalImage.width) > 2 || Math.abs(targetH - originalImage.height) > 2) {
            setStatus(ProcessingStatus.RESIZING);
            await new Promise(r => setTimeout(r, 20)); 
            workingImage = await resizeImage(originalImage, targetW, targetH);
            setOriginalImage(workingImage);
        }

        setStatus(ProcessingStatus.SEPARATING);
        await new Promise(r => setTimeout(r, 50));
        
        const result = await performSeparation(workingImage, palette, advancedConfig);
        initializeLayerHistory(result);
        
        setStatus(ProcessingStatus.COMPOSITING);
        const comp = await generateComposite(result, workingImage.width, workingImage.height, advancedConfig);
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
        updateLayersWithHistory(halftonedLayers);
        
        setStatus(ProcessingStatus.COMPOSITING);
        const currentWidth = layers[0].data.width;
        const currentHeight = layers[0].data.height;
        
        const comp = await generateComposite(halftonedLayers, currentWidth, currentHeight, advancedConfig);
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

  // Update composite whenever layers or configs change (debounced composite)
  useEffect(() => {
    if (layers.length > 0 && (activeTab === 'separation' || activeTab === 'halftone' || activeTab === 'compare')) {
        const updateComposite = async () => {
            const width = layers[0].data.width;
            const height = layers[0].data.height;
            const comp = await generateComposite(layers, width, height, advancedConfig);
            setCompositeImage(comp);
        };
        updateComposite();
    }
  }, [advancedConfig.inkOpacity, layers, activeTab]);

  /* --- LAYER ACTIONS LOGIC --- */
  
  const handleLayerAction = (action: 'chop' | 'merge' | 'edit' | 'delete', layer: Layer) => {
      if (action === 'delete') {
          if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el canal ${layer.color.hex}?`)) {
              setPreviewLayerIndex(null);
              const newLayers = layers.filter(l => l.id !== layer.id);
              updateLayersWithHistory(newLayers);
              // We don't remove palette color just in case they want to use it again or undo
          }
      } else {
          setModalMode(action);
      }
  };

  const handleEditColorSave = (newHex: string) => {
      if (previewLayerIndex === null) return;
      const targetLayer = layers[previewLayerIndex];
      const newLayers = [...layers];
      newLayers[previewLayerIndex] = {
          ...targetLayer,
          color: { ...targetLayer.color, hex: newHex, rgb: hexToRgb(newHex) }
      };
      updateLayersWithHistory(newLayers);
      setModalMode('view');
  };

  const handleMergeLayers = (layersToMerge: Layer[], finalColorHex: string) => {
      if (previewLayerIndex === null) return;
      const targetLayer = layers[previewLayerIndex];
      
      const mergedData = mergeLayersData(targetLayer.data, layersToMerge.map(l => l.data));
      
      const newLayer: Layer = {
          id: targetLayer.id,
          color: { ...targetLayer.color, hex: finalColorHex, rgb: hexToRgb(finalColorHex) },
          data: mergedData,
          visible: true
      };
      
      const idsToRemove = new Set(layersToMerge.map(l => l.id));
      const newLayerList = layers.filter(l => !idsToRemove.has(l.id)).map(l => {
          if (l.id === targetLayer.id) return newLayer;
          return l;
      });
      
      updateLayersWithHistory(newLayerList);
      setModalMode('view');
  };

  const handleChopGenerate = async (config: AdvancedConfig, count: number): Promise<Layer[]> => {
      if (previewLayerIndex === null) return [];
      const targetLayer = layers[previewLayerIndex];
      const grayData = createGrayscaleFromAlpha(targetLayer);
      const subPalette = await analyzePalette(grayData, count, { ...config, sampleSize: 50000 });
      const separated = await performSeparation(grayData, subPalette, config);
      
      return separated.map(l => ({
          ...l,
          color: targetLayer.color 
      }));
  };

  const handleChopApply = (keptLayers: Layer[], layersToMerge: Layer[]) => {
      if (previewLayerIndex === null) return;
      const targetLayer = layers[previewLayerIndex];

      let mergedResidue: Layer | null = null;
      if (layersToMerge && layersToMerge.length > 0) {
           const mergedData = mergeLayersData(layersToMerge[0].data, layersToMerge.slice(1).map(l => l.data));
           mergedResidue = {
               id: `residue-${Date.now()}`,
               color: targetLayer.color,
               data: mergedData,
               visible: true
           };
      }

      const finalNewLayers: Layer[] = [];
      layers.forEach(l => {
          if (l.id === targetLayer.id) {
              finalNewLayers.push(...keptLayers);
              if (mergedResidue) finalNewLayers.push(mergedResidue);
          } else {
              finalNewLayers.push(l);
          }
      });
      
      updateLayersWithHistory(finalNewLayers);
      setPreviewLayerIndex(null);
      setModalMode('view');
  };


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
        
        {/* UNDO / REDO CONTROLS */}
        {layers.length > 0 && (
             <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-700 absolute left-1/2 transform -translate-x-1/2">
                <button 
                    onClick={handleUndo} 
                    disabled={historyIndex <= 0}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Undo"
                >
                    <Undo className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-700 mx-1"></div>
                <button 
                    onClick={handleRedo} 
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                    title="Redo"
                >
                    <Redo className="w-4 h-4" />
                </button>
             </div>
        )}

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
          
          {/* Output Size Panel */}
          {originalImage && (
              <OutputSizePanel 
                config={advancedConfig} 
                onChange={setAdvancedConfig} 
                originalWidth={originalImage.width}
                originalHeight={originalImage.height}
              />
          )}

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
              <Button className="w-full text-sm py-2.5 shadow-lg shadow-blue-900/20" onClick={runSeparation} disabled={palette.length === 0 || !originalImage || !engineReady} isLoading={status === ProcessingStatus.SEPARATING || status === ProcessingStatus.COMPOSITING || status === ProcessingStatus.RESIZING}>
                {status === ProcessingStatus.RESIZING ? 'Rescaling Image...' : 'Run Separation'}
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
            <button onClick={() => setActiveTab('guide')} className={`ml-auto px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-t-md transition-all flex items-center gap-2 ${activeTab === 'guide' ? 'bg-gray-850 text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}><BookOpen className="w-3 h-3" /> Guía / Ayuda</button>
          </div>

          <div className="flex-1 p-8 overflow-auto flex items-start justify-center custom-scrollbar bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 to-gray-950">
            {activeTab === 'guide' && <GuideSection />}
            {activeTab === 'original' && (
              <div className="w-full max-w-4xl animate-in fade-in duration-500">
                {!originalImage ? <UploadZone onImageLoad={handleImageLoad} /> : (
                  <div className="space-y-4">
                     <div className="flex justify-between items-center bg-gray-900 p-2 rounded-t-lg border border-gray-700 border-b-0">
                        <span className="text-xs font-bold text-gray-400 px-2">ARTWORK WORKSPACE</span>
                        <div className="flex gap-2">
                            <span className="bg-gray-800 text-gray-500 text-[10px] px-2 py-1 rounded border border-gray-700 font-mono">
                                {originalImage.width}x{originalImage.height}px
                            </span>
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
                {layers.map((layer, index) => (
                  <div 
                    key={layer.id} 
                    className="space-y-2 group animate-in slide-in-from-bottom-4 duration-300 relative"
                  >
                    {/* Updated Header Style for White Card Look */}
                    <div className="flex items-center justify-between text-gray-800 text-[10px] uppercase font-bold bg-white p-3 rounded-t-lg border-x border-t border-gray-200 group-hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setPreviewLayerIndex(index)}>
                       <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shadow-sm ring-1 ring-black/10" style={{backgroundColor: layer.color.hex}}></span>{layer.color.hex}</span>
                       <div className="flex items-center gap-2">
                            <span className="opacity-50 text-[9px]">{activeTab === 'halftone' ? 'AM' : 'SEP'}</span>
                            <Maximize2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600" />
                       </div>
                    </div>
                    <div 
                        className="border-x border-b border-gray-200 rounded-b-lg overflow-hidden shadow-lg group-hover:shadow-blue-500/20 transition-all cursor-zoom-in relative bg-white"
                        onClick={() => setPreviewLayerIndex(index)}
                    >
                      <LayerPreview 
                        imageData={layer.data} 
                        width={layer.data.width} 
                        height={layer.data.height} 
                        tint={activeTab === 'separation' ? layer.color.hex : undefined} 
                        forceBackground="white" 
                      />
                      <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      
      {/* LAYER MANAGEMENT MODALS */}
      {previewLayerIndex !== null && layers[previewLayerIndex] && modalMode === 'view' && (
          <LayerDetailModal 
            layer={layers[previewLayerIndex]}
            index={previewLayerIndex}
            totalLayers={layers.length}
            onClose={() => setPreviewLayerIndex(null)}
            onNavigate={(dir) => {
                if (dir === 'prev') setPreviewLayerIndex(Math.max(0, previewLayerIndex - 1));
                if (dir === 'next') setPreviewLayerIndex(Math.min(layers.length - 1, previewLayerIndex + 1));
            }}
            onAction={handleLayerAction}
            isHalftone={activeTab === 'halftone'}
          />
      )}

      {/* COMPLEX ACTION MODALS */}
      {previewLayerIndex !== null && layers[previewLayerIndex] && modalMode !== 'view' && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { if(modalMode !== 'chop') setModalMode('view'); }}>
             <div onClick={e => e.stopPropagation()} className="w-full flex justify-center">
                 {modalMode === 'chop' && (
                     <ChopModal 
                        layer={layers[previewLayerIndex]}
                        onClose={() => setModalMode('view')}
                        onGenerate={handleChopGenerate}
                        onApply={(kept, toMerge) => handleChopApply(kept, toMerge as Layer[])}
                     />
                 )}
                 {modalMode === 'merge' && (
                     <MergeModal 
                        targetLayer={layers[previewLayerIndex]}
                        allLayers={layers}
                        onClose={() => setModalMode('view')}
                        onMerge={handleMergeLayers}
                     />
                 )}
                 {modalMode === 'edit' && (
                     <EditColorModal 
                        layer={layers[previewLayerIndex]}
                        onClose={() => setModalMode('view')}
                        onSave={handleEditColorSave}
                     />
                 )}
             </div>
          </div>
      )}

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