import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Printer, Wand2, Settings, Download, ScanEye, Package, ChevronDown, FileImage, FileArchive, Pipette, Maximize2, X, BookOpen, Undo, Redo, Eye, EyeOff, GripVertical, Palette, ScanFace, FileText, Brain, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import UploadZone from './components/UploadZone';
import PaletteManager from './components/PaletteManager';
import LayerPreview, { LayerViewMode } from './components/LayerPreview';
import ComparisonView from './components/ComparisonView';
import AdvancedSettings from './components/AdvancedSettings';
import LoadoutManager from './components/LoadoutManager';
import OutputSizePanel from './components/OutputSizePanel';
import GuideSection from './components/GuideSection';
import Button from './components/Button';
import LayerDetailModal from './components/LayerDetailModal';
import { ChopModal, MergeModal, EditColorModal } from './components/LayerActionModals';
import { Layer, PaletteColor, ProcessingStatus, AdvancedConfig, DEFAULT_CONFIG } from './types';
import { analyzePalette, performSeparation, applyHalftone, initEngine, generateComposite, getPyodideInfo, hexToRgb, mergeLayersData, createGrayscaleFromAlpha, resizeImage } from './services/imageProcessing';
import { downloadComposite, downloadChannelsZip } from './services/exportService';
import { analyzeWithAI, AIAnalysisResult, supabase, saveTrainingData } from './services/supabase';
import { exportLayersAsEPS } from './services/zipExport';
import { User } from '@supabase/supabase-js';
import { AuthModal } from './components/Auth/AuthModal';
import { UserMenu } from './components/Auth/UserMenu';

const App: React.FC = () => {
    // State
    const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
    const [compositeImage, setCompositeImage] = useState<ImageData | null>(null);
    const [palette, setPalette] = useState<PaletteColor[]>([]);
    const [shirtColor, setShirtColor] = useState('#111827'); // Default to Gray-900/Black

    // Layer & History State
    const [layers, setLayers] = useState<Layer[]>([]);
    const [history, setHistory] = useState<Layer[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [layerViewModes, setLayerViewModes] = useState<Record<string, LayerViewMode>>({});

    const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
    const [activeTab, setActiveTab] = useState<'original' | 'separation' | 'halftone' | 'compare' | 'guide'>('original');
    const [engineReady, setEngineReady] = useState(false);
    const [pyodideInfo, setPyodideInfo] = useState<{ version: string, packages: string[] } | null>(null);
    const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(DEFAULT_CONFIG);

    // UI State
    const [showPackageList, setShowPackageList] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(true);
    const [aiLoading, setAiLoading] = useState(false);
    const [isPickerActive, setIsPickerActive] = useState(false);

    // AI Prompt Modal State
    const [showAIPromptModal, setShowAIPromptModal] = useState(false);
    const [aiUserPrompt, setAiUserPrompt] = useState('');
    const [aiReasoning, setAiReasoning] = useState<string | null>(null);
    const [trainingStatus, setTrainingStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

    // Auth State
    const [user, setUser] = useState<User | null>(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);

    // Layer Management State
    const [previewLayerIndex, setPreviewLayerIndex] = useState<number | null>(null);
    const [modalMode, setModalMode] = useState<'view' | 'chop' | 'merge' | 'edit'>('view');
    const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);

    // Auth Effect
    useEffect(() => {
        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setSessionLoading(false);
        });

        // 2. Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setSessionLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

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
        setLayerViewModes({});
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

    const toggleLayerVisibility = (index: number) => {
        const newLayers = [...layers];
        newLayers[index] = { ...newLayers[index], visible: !newLayers[index].visible };
        updateLayersWithHistory(newLayers);
    };

    const setLayerViewMode = (id: string, mode: LayerViewMode) => {
        setLayerViewModes(prev => ({ ...prev, [id]: mode }));
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

    // --- DRAG AND DROP HANDLERS ---
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedLayerIndex(index);
        // Standard effect allowed
        e.dataTransfer.effectAllowed = "move";
        // Optional: Set a clean drag image if needed, for now default is okay
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault();
        if (draggedLayerIndex === null || draggedLayerIndex === dropIndex) return;

        const newLayers = [...layers];
        const [movedLayer] = newLayers.splice(draggedLayerIndex, 1);
        newLayers.splice(dropIndex, 0, movedLayer);

        updateLayersWithHistory(newLayers);
        setDraggedLayerIndex(null);
    };

    return (
        <div className="min-h-screen flex flex-col h-screen overflow-hidden" onClick={() => {
            if (showExportMenu) setShowExportMenu(false);
            if (showPackageList) setShowPackageList(false);
        }}>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

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

                {/* User Guide Download */}
                <div className="flex items-center border-l border-gray-700 pl-4 ml-4 h-8">
                    <a
                        href="/USER_GUIDE.pdf"
                        download="ScreenPrintPro_UserGuide.pdf"
                        className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-wider group"
                        title="Download User Guide PDF"
                    >
                        <BookOpen className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                        <span className="hidden sm:inline">Guide</span>
                    </a>
                </div>

                {/* User Auth Section */}
                <div className="flex items-center gap-4 border-l border-gray-700 pl-4 ml-4">
                    {!sessionLoading && (
                        user ? (
                            <UserMenu userEmail={user.email} />
                        ) : (
                            <button
                                onClick={() => setIsAuthModalOpen(true)}
                                className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wider"
                            >
                                Login / Sign Up
                            </button>
                        )
                    )}
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
                        <PaletteManager palette={palette} setPalette={setPalette} onAnalyze={runAnalysis} status={status} separationType={advancedConfig.separationType} />
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
                            onAIAnalyze={() => {
                                if (!originalImage) return;
                                setAiUserPrompt('');
                                setShowAIPromptModal(true);
                            }}
                            aiLoading={aiLoading}
                            hasImage={!!originalImage}
                        />

                        <LoadoutManager
                            config={advancedConfig}
                            onLoadConfig={setAdvancedConfig}
                            user={user}
                            onRequestAuth={() => setIsAuthModalOpen(true)}
                        />
                        <div className="space-y-2">
                            <Button className="w-full text-sm py-2.5 shadow-lg shadow-blue-900/20" onClick={runSeparation} disabled={palette.length === 0 || !originalImage || !engineReady} isLoading={status === ProcessingStatus.SEPARATING || status === ProcessingStatus.COMPOSITING || status === ProcessingStatus.RESIZING}>
                                {status === ProcessingStatus.RESIZING ? 'Rescaling Image...' : 'Run Separation'}
                            </Button>
                            <Button className="w-full text-sm py-2.5" variant="secondary" onClick={runHalftone} disabled={layers.length === 0 || !engineReady} isLoading={status === ProcessingStatus.HALFTONING}>
                                Apply Bitmaps
                            </Button>

                            {/* TRAIN IA BUTTON */}
                            {layers.length > 0 && originalImage && (
                                <button
                                    onClick={async () => {
                                        if (!originalImage || layers.length === 0) return;
                                        setTrainingStatus('saving');
                                        try {
                                            const success = await saveTrainingData({
                                                final_config: advancedConfig as unknown as Record<string, unknown>,
                                                separation_type: advancedConfig.separationType as 'vector' | 'raster',
                                                image_metadata: {
                                                    width: originalImage.width,
                                                    height: originalImage.height,
                                                    num_colors: palette.length,
                                                    palette_hex: palette.map(p => p.hex),
                                                    timestamp: new Date().toISOString(),
                                                },
                                            });
                                            setTrainingStatus(success ? 'success' : 'error');
                                            setTimeout(() => setTrainingStatus('idle'), 3000);
                                        } catch {
                                            setTrainingStatus('error');
                                            setTimeout(() => setTrainingStatus('idle'), 3000);
                                        }
                                    }}
                                    disabled={trainingStatus === 'saving'}
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all duration-300 border ${trainingStatus === 'success'
                                        ? 'bg-green-600/20 border-green-500 text-green-400'
                                        : trainingStatus === 'error'
                                            ? 'bg-red-600/20 border-red-500 text-red-400'
                                            : trainingStatus === 'saving'
                                                ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-wait'
                                                : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-purple-500 hover:text-purple-300'
                                        }`}
                                >
                                    {trainingStatus === 'success' ? (
                                        <><CheckCircle className="w-4 h-4" /> Entrenamiento Guardado ✓</>
                                    ) : trainingStatus === 'error' ? (
                                        <><XCircle className="w-4 h-4" /> Error al guardar</>
                                    ) : trainingStatus === 'saving' ? (
                                        <><Brain className="w-4 h-4 animate-pulse" /> Guardando...</>
                                    ) : (
                                        <><Brain className="w-4 h-4" /> 🧠 Train IA</>
                                    )}
                                </button>
                            )}
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
                        {activeTab === 'compare' && <div className="w-full max-w-[95%] animate-in zoom-in-95 duration-300"><ComparisonView original={originalImage} composite={compositeImage} shirtColor={shirtColor} onShirtColorChange={setShirtColor} /></div>}
                        {(activeTab === 'separation' || activeTab === 'halftone') && (
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full max-w-7xl animate-in fade-in duration-500">
                                <div className="col-span-full mb-6 bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-50"></div>
                                    <div className="flex justify-between items-start mb-6">
                                        <h3 className="text-white text-xs font-bold flex items-center gap-2 uppercase tracking-widest opacity-70">
                                            <Settings className="w-4 h-4 text-blue-500" /> SIMULACIÓN DE ESTAMPADO
                                        </h3>
                                        {/* SHIRT COLOR PICKER FOR COMPOSITE PREVIEW */}
                                        <div className="flex items-center gap-2 bg-black/30 px-2 py-1 rounded-full border border-gray-700/50">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">Shirt Color</span>
                                            <input
                                                type="color"
                                                value={shirtColor}
                                                onChange={(e) => setShirtColor(e.target.value)}
                                                className="w-4 h-4 p-0 border-0 rounded-full cursor-pointer overflow-hidden"
                                            />
                                        </div>
                                        {/* EXPORT EPS BUTTON */}
                                        <button
                                            onClick={() => exportLayersAsEPS(layers, advancedConfig, 'screenprint')}
                                            disabled={layers.length === 0}
                                            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-emerald-500/30 disabled:border-gray-600 transition-all duration-300 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
                                            title="Export all layers as EPS files in a ZIP archive (for I-Image CTS)"
                                        >
                                            <Printer className="w-3.5 h-3.5" />
                                            Export EPS
                                        </button>
                                    </div>
                                    {/* Changed bg-gray-900 to dynamic shirtColor style */}
                                    {compositeImage && <div className="relative flex items-center justify-center rounded-lg overflow-hidden border border-gray-700 min-h-[400px] shadow-inner transition-colors duration-300" style={{ backgroundColor: shirtColor }}><LayerPreview imageData={compositeImage} width={compositeImage.width} height={compositeImage.height} forceBackground="none" /></div>}
                                </div>
                                {layers.map((layer, index) => {
                                    const currentMode = layerViewModes[layer.id] || 'color';
                                    return (
                                        <div
                                            key={layer.id}
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, index)}
                                            className={`space-y-2 group animate-in slide-in-from-bottom-4 duration-300 relative ${!layer.visible ? 'opacity-50 grayscale' : ''} ${draggedLayerIndex === index ? 'opacity-50 cursor-grabbing' : 'cursor-grab'}`}
                                        >
                                            {/* Updated Header Style for White Card Look */}
                                            <div className="flex flex-col bg-white rounded-t-lg border-x border-t border-gray-200 group-hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center justify-between p-3 pb-2">
                                                    <div className="flex items-center gap-2">
                                                        {/* Grip Icon for visual affordance */}
                                                        <GripVertical className="w-3 h-3 text-gray-300 group-hover:text-gray-500 cursor-grab active:cursor-grabbing" />
                                                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPreviewLayerIndex(index)}>
                                                            <span className="w-3 h-3 rounded-full shadow-sm ring-1 ring-black/10" style={{ backgroundColor: layer.color.hex }}></span>
                                                            <span className="text-[10px] text-gray-800 uppercase font-bold">{layer.color.hex}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(index); }}
                                                            className="text-gray-400 hover:text-gray-900 transition-colors"
                                                            title={layer.visible ? "Hide Layer" : "Show Layer"}
                                                        >
                                                            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <div className="flex items-center gap-2 cursor-pointer border-l border-gray-200 pl-3" onClick={() => setPreviewLayerIndex(index)}>
                                                            <Maximize2 className="w-3 h-3 text-gray-400 hover:text-blue-600 transition-colors" />
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* View Mode Toggles */}
                                                <div className="flex px-2 pb-2 gap-1 justify-center">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setLayerViewMode(layer.id, 'color'); }}
                                                        className={`flex-1 flex items-center justify-center py-1 rounded text-[9px] font-bold uppercase transition-colors ${currentMode === 'color' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                        title="Color Preview"
                                                    >
                                                        <Palette className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setLayerViewMode(layer.id, 'mask'); }}
                                                        className={`flex-1 flex items-center justify-center py-1 rounded text-[9px] font-bold uppercase transition-colors ${currentMode === 'mask' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                        title="Alpha Mask (White Ink / Black Background)"
                                                    >
                                                        <ScanFace className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setLayerViewMode(layer.id, 'positive'); }}
                                                        className={`flex-1 flex items-center justify-center py-1 rounded text-[9px] font-bold uppercase transition-colors ${currentMode === 'positive' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                                        title="Film Positive (Black Ink / White Background)"
                                                    >
                                                        <FileText className="w-3 h-3" />
                                                    </button>
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
                                                    viewMode={currentMode}
                                                />
                                                <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                            </div>
                                        </div>
                                    )
                                })}
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
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => { if (modalMode !== 'chop') setModalMode('view'); }}>
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

            {/* AI PROMPT MODAL */}
            {showAIPromptModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => !aiLoading && setShowAIPromptModal(false)}>
                    <div onClick={e => e.stopPropagation()} className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-lg ring-1 ring-white/10 animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-gray-700">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-2 rounded-lg">
                                    <Brain className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-lg font-bold text-white">AI Auto-Config</h3>
                            </div>
                            <p className="text-sm text-gray-400 mt-2">La IA analizará tu imagen y ajustará automáticamente los parámetros de configuración avanzada.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <MessageSquare className="w-3 h-3" /> Instrucciones Adicionales (Opcional)
                                </label>
                                <textarea
                                    value={aiUserPrompt}
                                    onChange={e => setAiUserPrompt(e.target.value)}
                                    placeholder="Ej: 'Es un diseño para camiseta negra con 6 colores', 'Priorizar bordes nítidos', 'Usar halftone fino'..."
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-24 transition-colors"
                                    disabled={aiLoading}
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Si no escribes nada, la IA analizará basándose solo en la imagen y su entrenamiento previo.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setShowAIPromptModal(false); setAiUserPrompt(''); }}
                                    disabled={aiLoading}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-400 bg-gray-700 hover:bg-gray-600 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!originalImage) return;
                                        setAiLoading(true);
                                        setAiReasoning(null);
                                        try {
                                            const canvas = document.createElement('canvas');
                                            canvas.width = originalImage.width;
                                            canvas.height = originalImage.height;
                                            const ctx = canvas.getContext('2d')!;
                                            ctx.putImageData(originalImage, 0, 0);
                                            const base64 = canvas.toDataURL('image/png');
                                            const result = await analyzeWithAI(base64, aiUserPrompt || undefined);
                                            if (result) {
                                                setAdvancedConfig(prev => ({
                                                    ...prev,
                                                    separationType: result.separationType,
                                                    denoiseStrength: result.denoiseStrength,
                                                    denoiseSpatial: result.denoiseSpatial,
                                                    cleanupStrength: result.cleanupStrength,
                                                    minCoverage: result.minCoverage,
                                                    useRasterAdaptive: result.useRasterAdaptive,
                                                    useSubstrateKnockout: result.useSubstrateKnockout,
                                                    substrateColorHex: result.substrateColorHex,
                                                    substrateThreshold: result.substrateThreshold,
                                                    gamma: result.gamma,
                                                    halftoneLpi: result.halftoneLpi,
                                                }));
                                                setAiReasoning(result.reasoning);
                                                setShowAIPromptModal(false);
                                            } else {
                                                alert('La IA no pudo analizar la imagen. Revisa la consola para más detalles.');
                                            }
                                        } catch (err) {
                                            console.error('[AI Analysis] Error:', err);
                                            alert('Error al conectar con la IA. Verifica tu conexión y la API Key.');
                                        } finally {
                                            setAiLoading(false);
                                        }
                                    }}
                                    disabled={aiLoading}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500 hover:from-purple-500 hover:via-blue-500 hover:to-cyan-400 transition-all shadow-lg shadow-purple-900/30 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                                >
                                    {aiLoading ? (
                                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Analizando...</>
                                    ) : (
                                        <><Wand2 className="w-4 h-4" /> Analizar con IA</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI REASONING TOAST */}
            {aiReasoning && (
                <div className="fixed bottom-6 right-6 z-[80] max-w-sm animate-in slide-in-from-right-4 duration-300">
                    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl ring-1 ring-white/10 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-gray-700">
                            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                                <Brain className="w-3 h-3" /> AI Reasoning
                            </span>
                            <button onClick={() => setAiReasoning(null)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-gray-300 leading-relaxed">{aiReasoning}</p>
                        </div>
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