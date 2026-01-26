
import { ShiftGrid } from '../components/ShiftGrid/ShiftGrid';
import { CellData } from '../components/ShiftGrid/types';

export default function ShiftGridPage() {
    const initialData = new Map<string, CellData>();
    // テストデータ
    initialData.set('0-0', { value: '09:00-18:00', isBold: true, bgColor: '#bfdbfe' });
    initialData.set('1-0', { value: '利用者A (身体)', bgColor: '#bfdbfe' });
    initialData.set('2-0', { value: '1.5', bgColor: '#bfdbfe' });
    initialData.set('3-0', { value: '新宿区', bgColor: '#bfdbfe' });

    return (
        <div className="w-full h-screen p-4 bg-gray-50 flex flex-col">
            <div className="mb-4">
                <h1 className="text-2xl font-bold">ShiftGrid 実装デモ</h1>
                <p className="text-sm text-gray-600">スプレッドシート仕様 + 日本語入力(nあ問題)対策済み / UI完全維持</p>
            </div>
            <div className="flex-1 overflow-hidden shadow-xl rounded-lg">
                <ShiftGrid
                    rowCount={100}
                    colCount={26}
                    initialData={initialData}
                />
            </div>
        </div>
    );
}
