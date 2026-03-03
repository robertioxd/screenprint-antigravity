import React, { useMemo } from 'react';
import { PaletteColor } from '../types';
import { detectBlockedPairs } from '../services/vectorMath';
import { Grid3X3, RotateCcw } from 'lucide-react';

interface PairMatrixProps {
    palette: PaletteColor[];
    userBlockedPairs: Array<[number, number]>;
    onChange: (pairs: Array<[number, number]>) => void;
}

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const PairMatrix: React.FC<PairMatrixProps> = ({ palette, userBlockedPairs, onChange }) => {
    // Compute auto-detected pairs if user hasn't overridden
    const autoBlockedPairs = useMemo(() => {
        const activeChannelsForMath = palette.map((c, i) => {
            const rgb = hexToRgb(c.hex);
            return { idx: i, rgb: [rgb.r / 255.0, rgb.g / 255.0, rgb.b / 255.0] };
        });
        return detectBlockedPairs(activeChannelsForMath);
    }, [palette]);

    // Determine active pairs
    const isActiveCustom = userBlockedPairs && userBlockedPairs.length > 0;
    const currentBlockedPairs = isActiveCustom ? userBlockedPairs : autoBlockedPairs;

    const isBlocked = (i: number, j: number) => {
        return currentBlockedPairs.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
    };

    const togglePair = (i: number, j: number) => {
        // If we are currently using auto pairs and user toggles, we freeze the current auto pairs into custom state first
        let newPairs = [...currentBlockedPairs];
        const blockedIdx = newPairs.findIndex(([a, b]) => (a === i && b === j) || (a === j && b === i));

        if (blockedIdx >= 0) {
            newPairs.splice(blockedIdx, 1); // Unblock
        } else {
            newPairs.push([i, j]); // Block
        }

        // Pass a dummy pair [-1, -1] if they unblocked everything, so it doesn't revert to auto-detect?
        // Let's just pass the new array. If it's empty, we should explicitly pass [-1, -1] to signify "custom empty"
        // Wait, let's keep it simple.
        if (newPairs.length === 0) {
            newPairs = [[-1, -1]];
        }
        onChange(newPairs);
    };

    const resetToAuto = () => {
        onChange([]);
    };

    if (palette.length < 2) return null;

    return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 space-y-3">
            <div className="flex justify-between items-center">
                <label className="text-gray-300 font-bold text-[10px] uppercase flex items-center gap-1.5">
                    <Grid3X3 className="w-3.5 h-3.5 text-blue-400" /> Matrix de Mezclas (Colinealidad)
                </label>
                {isActiveCustom && (
                    <button
                        onClick={resetToAuto}
                        className="text-[9px] text-yellow-400 border border-yellow-400/30 hover:bg-yellow-400/10 px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                    >
                        <RotateCcw className="w-2.5 h-2.5" /> Reset Auto
                    </button>
                )}
            </div>

            <p className="text-[9px] text-gray-400 leading-tight">
                Controla qué colores pueden mezclarse para formar degradados. Desactiva mezclas para evitar colores "sucios" (muddiness). El sistema auto-detecta bloqueos óptimos.
            </p>

            <div className="overflow-x-auto custom-scrollbar">
                <div className="inline-block min-w-full">
                    <table className="border-collapse border-transparent w-full">
                        <thead>
                            <tr>
                                <th className="p-1"></th>
                                {palette.map((c, i) => (
                                    <th key={`h-${i}`} className="p-1">
                                        <div className="w-4 h-4 rounded-full mx-auto" style={{ backgroundColor: c.hex }} title={c.hex} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {palette.map((cRow, i) => (
                                <tr key={`r-${i}`}>
                                    <td className="p-1">
                                        <div className="w-4 h-4 rounded-full mx-auto" style={{ backgroundColor: cRow.hex }} title={cRow.hex} />
                                    </td>
                                    {palette.map((cCol, j) => {
                                        if (j <= i) {
                                            return <td key={`c-${i}-${j}`} className="p-1 text-center bg-gray-900/30 border border-gray-800 rounded"></td>; // Blank half
                                        }
                                        const blocked = isBlocked(i, j);
                                        return (
                                            <td key={`c-${i}-${j}`} className="p-1 text-center border border-gray-800 rounded hover:bg-gray-750 transition-colors">
                                                <button
                                                    onClick={() => togglePair(i, j)}
                                                    className={`w-full h-full min-w-[20px] min-h-[20px] flex items-center justify-center rounded ${blocked ? 'text-red-500 opacity-80' : 'text-green-500 hover:bg-green-500/10'}`}
                                                    title={blocked ? 'Mezcla Bloqueada (Clic para permitir)' : 'Mezcla Permitida (Clic para bloquear)'}
                                                >
                                                    {blocked ? '✕' : '✓'}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default PairMatrix;
