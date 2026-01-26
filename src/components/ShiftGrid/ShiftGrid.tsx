
import React, { useState, useCallback, useMemo } from 'react';
import { Cell } from './Cell';
import { CellData, GridCoord, GridMode } from './types';

interface ShiftGridProps {
    rowCount: number;
    colCount: number;
    initialData: Map<string, CellData>;
    onDataChange?: (key: string, value: string) => void;
    renderHeaderCol?: (col: number) => React.ReactNode;
    renderHeaderRow?: (row: number) => React.ReactNode;
}

export const ShiftGrid: React.FC<ShiftGridProps> = ({
    rowCount,
    colCount,
    initialData,
    onDataChange,
    renderHeaderCol,
    renderHeaderRow,
}) => {
    const [data, setData] = useState<Map<string, CellData>>(initialData);
    const [selectedCoord, setSelectedCoord] = useState<GridCoord>({ row: 0, col: 0 });
    const [mode, setMode] = useState<GridMode>('ready');

    const handleValueChange = useCallback((row: number, col: number, value: string) => {
        const key = `${row}-${col}`;
        const cell = data.get(key) || { value: '' };
        const newData = new Map(data);
        newData.set(key, { ...cell, value });
        setData(newData);
        onDataChange?.(key, value);
    }, [data, onDataChange]);

    const handleNavigate = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'next') => {
        setSelectedCoord(prev => {
            let { row, col } = prev;
            switch (direction) {
                case 'up': row = Math.max(0, row - 1); break;
                case 'down': row = Math.min(rowCount - 1, row + 1); break;
                case 'left': col = Math.max(0, col - 1); break;
                case 'right': col = Math.min(colCount - 1, col + 1); break;
                case 'next':
                    if (col < colCount - 1) col++;
                    else { col = 0; row = Math.min(rowCount - 1, row + 1); }
                    break;
            }
            return { row, col };
        });
        setMode('ready');
    }, [rowCount, colCount]);

    const rows = useMemo(() => Array.from({ length: rowCount }, (_, i) => i), [rowCount]);
    const cols = useMemo(() => Array.from({ length: colCount }, (_, i) => i), [colCount]);

    return (
        <div className="flex flex-col w-full h-full bg-white border border-gray-300 overflow-auto">
            {/* ツールバー代わりのヘッダー区域 */}
            <div className="sticky top-0 left-0 z-40 bg-gray-100 border-b border-gray-300 p-1 flex items-center gap-4 h-10">
                <div className="font-bold text-sm px-2">ShiftGrid</div>
                <div className="flex-1 bg-white border border-gray-300 rounded px-2 text-xs py-1 h-7 flex items-center">
                    {data.get(`${selectedCoord.row}-${selectedCoord.col}`)?.value || ''}
                </div>
            </div>

            <table className="border-collapse table-fixed w-full">
                <thead>
                    <tr>
                        <th className="w-10 bg-gray-200 border border-gray-400 sticky top-10 left-0 z-50"></th>
                        {cols.map(c => (
                            <th key={c} className="w-20 bg-gray-200 border border-gray-400 sticky top-10 z-30 text-xs py-1">
                                {renderHeaderCol ? renderHeaderCol(c) : String.fromCharCode(65 + c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r} className="h-5">
                            <td className="w-10 bg-gray-200 border border-gray-400 sticky left-0 z-30 text-center text-[10px] font-bold">
                                {renderHeaderRow ? renderHeaderRow(r) : r + 1}
                            </td>
                            {cols.map(c => {
                                const key = `${r}-${c}`;
                                const isSelected = selectedCoord.row === r && selectedCoord.col === c;
                                return (
                                    <td key={c} className="p-0 border border-gray-300 relative overflow-visible" style={{ width: '80px', height: '20px' }}>
                                        <Cell
                                            data={data.get(key) || { value: '' }}
                                            isSelected={isSelected}
                                            mode={mode}
                                            onValueChange={(val) => handleValueChange(r, c, val)}
                                            onModeChange={setMode}
                                            onNavigate={handleNavigate}
                                            row={r}
                                            col={c}
                                        />
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
