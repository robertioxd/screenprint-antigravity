import React, { useState, useEffect } from 'react';
import { AdvancedConfig } from '../types';
import { getLoadouts, saveLoadout, deleteLoadout, Loadout } from '../services/supabase';
import { Save, Trash2, FolderOpen, ChevronDown, Lock } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface LoadoutManagerProps {
    config: AdvancedConfig;
    onLoadConfig: (config: AdvancedConfig) => void;
    user: User | null;
    onRequestAuth: () => void;
}

const LoadoutManager: React.FC<LoadoutManagerProps> = ({ config, onLoadConfig, user, onRequestAuth }) => {
    const [loadouts, setLoadouts] = useState<Loadout[]>([]);
    const [newName, setNewName] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && user) {
            fetchLoadouts();
        }
    }, [isOpen, user]);

    const fetchLoadouts = async () => {
        setLoading(true);
        const data = await getLoadouts();
        setLoadouts(data);
        setLoading(false);
    };

    const handleSave = async () => {
        if (!newName.trim() || !user) return;
        setSaving(true);
        const result = await saveLoadout(newName.trim(), config as unknown as Record<string, unknown>);
        if (result) {
            setLoadouts(prev => [result, ...prev]);
            setNewName('');
        }
        setSaving(false);
    };

    const handleLoad = (loadout: Loadout) => {
        onLoadConfig(loadout.config as unknown as AdvancedConfig);
    };

    const handleDelete = async (id: string) => {
        if (!user) return;
        if (window.confirm('¿Estás seguro de que deseas eliminar este preset?')) {
            const success = await deleteLoadout(id);
            if (success) {
                setLoadouts(prev => prev.filter(l => l.id !== id));
            }
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-750 transition-colors"
            >
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
                    Loadouts
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-700">
                    {!user ? (
                        <div className="py-4 text-center space-y-3">
                            <div className="flex justify-center text-gray-600">
                                <Lock size={24} />
                            </div>
                            <p className="text-[11px] text-gray-400 leading-tight">
                                Inicia sesión para guardar<br />tus configuraciones.
                            </p>
                            <button
                                onClick={onRequestAuth}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                Conectar
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Save new */}
                            <div className="flex gap-1.5 mt-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Nombre del preset..."
                                    className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                                <button
                                    onClick={handleSave}
                                    disabled={saving || !newName.trim()}
                                    className="px-2 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-[10px] font-bold uppercase flex items-center gap-1 transition-colors"
                                >
                                    <Save className="w-3 h-3" />
                                    {saving ? '...' : 'Save'}
                                </button>
                            </div>

                            {/* List */}
                            {loading ? (
                                <p className="text-[10px] text-gray-500 text-center py-2">Cargando...</p>
                            ) : loadouts.length === 0 ? (
                                <p className="text-[10px] text-gray-500 text-center py-2">Sin presets guardados.</p>
                            ) : (
                                <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                    {loadouts.map((l) => (
                                        <div key={l.id} className="flex items-center justify-between bg-gray-900 rounded p-1.5 group hover:border-gray-600 border border-transparent transition-all">
                                            <button
                                                onClick={() => handleLoad(l)}
                                                className="flex-1 text-left text-[11px] text-gray-300 hover:text-purple-300 truncate transition-colors"
                                                title={`Cargar: ${l.name}`}
                                            >
                                                {l.name}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(l.id)}
                                                className="text-gray-600 hover:text-red-400 p-0.5 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default LoadoutManager;
