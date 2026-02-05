import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ShiftTable } from '../components/ShiftTable';
import { SalaryCalculation } from '../components/SalaryCalculation';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SERVICE_CONFIG, Helper, Shift } from '../types';
import {
    saveHelpers,
    loadHelpers,
    loadShiftsForMonth,
    subscribeToShiftsForMonth,
    subscribeToHelpers,
    backupToFirebase
} from '../services/dataService';
import { testFirebaseConnection } from '../lib/firebase';
import { helpers as initialHelpers } from '../data/mockData';

export default function EmployeeShiftGridPage() {
    // 従業員シフト管理用のコレクション名
    const shiftCollection = 'employee_shifts';

    const [helpers, setHelpers] = useState<Helper[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);

    // 現在の年月を自動的に取得
    const now = new Date();
    const currentYearValue = now.getFullYear();
    const currentMonthValue = now.getMonth() + 1;

    const [currentYear, setCurrentYear] = useState(currentYearValue);
    const [currentMonth, setCurrentMonth] = useState(currentMonthValue);
    const [currentView, setCurrentView] = useState<'shift' | 'salary'>('shift');
    const [isInitialized, setIsInitialized] = useState(false);

    // Firebase接続テスト
    useEffect(() => {
        testFirebaseConnection();
    }, []);

    // ヘルパー情報を読み込み（リアルタイム監視）
    useEffect(() => {
        const unsubscribe = subscribeToHelpers(async (loadedHelpers) => {
            if (loadedHelpers.length > 0) {
                setHelpers(loadedHelpers);
            } else {
                // 一般的な仕様に変更: データがない場合は空のままにする（勝手に初期データを入れない）
                // await saveHelpers(initialHelpers);
                console.log('ℹ️ ヘルパーデータは0件です');
            }
            setIsInitialized(true);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // シフト情報を読み込み（リアルタイム監視）
    useEffect(() => {
        const unsubscribe = subscribeToShiftsForMonth(currentYear, currentMonth, (allShifts) => {
            setShifts(allShifts);
        }, shiftCollection);

        return () => {
            unsubscribe();
        };
    }, [currentYear, currentMonth]);

    const handleUpdateHelpers = useCallback(async (updatedHelpers: Helper[]) => {
        setHelpers(updatedHelpers);
        try {
            await saveHelpers(updatedHelpers);
        } catch (error) {
            console.error('❌ ヘルパー情報の保存に失敗しました:', error);
            throw error;
        }
    }, []);

    // setShiftsをデバウンスして再レンダリングを抑制
    const shiftsUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
    const latestShiftsRef = useRef<Shift[]>(shifts);

    useEffect(() => {
        latestShiftsRef.current = shifts;
    }, [shifts]);

    const handleUpdateShifts = useCallback((updatedShifts: Shift[], debounce: boolean = false) => {
        latestShiftsRef.current = updatedShifts;

        if (debounce) {
            shiftsUpdateTimerRef.current = setTimeout(() => {
                setShifts(latestShiftsRef.current);
                shiftsUpdateTimerRef.current = null;
            }, 100);
        } else {
            if (shiftsUpdateTimerRef.current) {
                clearTimeout(shiftsUpdateTimerRef.current);
                shiftsUpdateTimerRef.current = null;
            }
            setShifts(updatedShifts);
        }
    }, []);

    const handlePreviousMonth = useCallback(() => {
        setCurrentMonth(prev => {
            if (prev === 1) {
                setCurrentYear(year => year - 1);
                return 12;
            }
            return prev - 1;
        });
    }, []);

    const handleNextMonth = useCallback(() => {
        setCurrentMonth(prev => {
            if (prev === 12) {
                setCurrentYear(year => year + 1);
                return 1;
            }
            return prev + 1;
        });
    }, []);

    const handleManualBackup = useCallback(async () => {
        if (!confirm('現在の全ヘルパー情報と今月の従業員シフト情報を内部バックアップしますか？')) {
            return;
        }

        try {
            await backupToFirebase('helpers', helpers, '手動実行時の内部バックアップ(従業員)');
            await backupToFirebase(shiftCollection, shifts, `${currentYear}年${currentMonth}月の手動内部バックアップ(従業員)`);
            alert('✅ 内部バックアップを保存しました。');
        } catch (error: any) {
            console.error('Fatal backup error:', error);
            alert('❌ バックアップに失敗しました：' + (error.message || 'Unknown'));
        }
    }, [helpers, shifts, currentYear, currentMonth]);

    // SERVICE_CONFIGの表示をメモ化
    const serviceConfigDisplay = useMemo(() => {
        return Object.entries(SERVICE_CONFIG)
            .filter(([key, config]) => {
                const hiddenTypes = ['shinya', 'shinya_doko', 'kaigi', 'other', 'yasumi_kibou', 'shitei_kyuu', 'yotei'];
                return !hiddenTypes.includes(key) && config.label !== '';
            })
            .map(([key, config]) => (
                <span key={key} className="px-2 py-1 rounded" style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.color}` }}>
                    {config.label}
                </span>
            ));
    }, []);

    if (currentView === 'salary') {
        return (
            <SalaryCalculation
                helpers={helpers}
                shifts={shifts}
                year={currentYear}
                month={currentMonth}
                onClose={() => setCurrentView('shift')}
            />
        );
    }

    if (!isInitialized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-teal-500 mb-4"></div>
                    <p className="text-xl font-bold text-gray-700">読み込み中...</p>
                    <p className="text-sm text-gray-500 mt-2">従業員シフトデータを読み込んでいます</p>
                </div>
            </div>
        );
    }

    return (
        <ErrorBoundary>
            <div className="p-4 bg-teal-50 min-h-screen">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                                title="ホームに戻る"
                            >
                                🏠 ホーム
                            </button>
                            <button
                                onClick={handlePreviousMonth}
                                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition-colors"
                            >
                                ◀
                            </button>
                            <h1 className="text-2xl font-bold text-teal-800">📊 {currentYear}年{currentMonth}月 従業員シフト表</h1>
                            <button
                                onClick={handleNextMonth}
                                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold transition-colors"
                            >
                                ▶
                            </button>
                        </div>
                        <div className="flex gap-3 text-sm flex-wrap">
                            {serviceConfigDisplay}
                        </div>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                        {/* 給与計算とバックアップのみ残す（読み取り/安全な操作） */}
                        <button
                            onClick={() => setCurrentView('salary')}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                        >
                            💰 給与計算
                        </button>
                        <button
                            onClick={handleManualBackup}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            ☁️ 内部バックアップ
                        </button>
                    </div>
                </div>

                {currentView === 'shift' && (
                    <div style={{ zoom: '0.85' }}>
                        <ShiftTable
                            helpers={helpers}
                            shifts={shifts}
                            year={currentYear}
                            month={currentMonth}
                            onUpdateShifts={handleUpdateShifts}
                        />
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}

