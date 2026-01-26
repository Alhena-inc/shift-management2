
export type GridMode = 'ready' | 'edit';

export interface CellData {
    value: string;
    readOnly?: boolean;
    className?: string;
    bgColor?: string;
    isBold?: boolean;
    hasWarning?: boolean;
}

export interface GridCoord {
    row: number; // rowIndex (0-4) * 4 + lineIndex (0-3)
    col: number; // helpersIndex * daysCount + dayIndex
}

export interface ShiftCellInfo {
    helperId: string;
    date: string;
    rowIndex: number;
    lineIndex: number;
}
