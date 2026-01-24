// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Helper, Shift } from '../../types';
import type { Payslip, HourlyPayslip } from '../../types/payslip';
import { isHourlyPayslip } from '../../types/payslip';
import {
  loadPayslipsByMonth,
  savePayslip,
  deletePayslip
} from '../../services/payslipService';
import { loadHelpers, loadShiftsForMonth } from '../../services/firestoreService';
import { generatePayslipFromShifts } from '../../utils/payslipCalculation';
import { downloadPayslipPdf, downloadBulkPayslipPdf } from '../../services/pdfService';
import PayslipSheet from './PayslipSheet';
import PayslipPrintView from './PayslipPrintView';

interface PayslipListPageProps {
  onClose: () => void;
  shifts?: Shift[];  // シフトデータ（オプション、外部から渡される場合）
}

export const PayslipListPage: React.FC<PayslipListPageProps> = ({ onClose, shifts: externalShifts }) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedHelperIds, setSelectedHelperIds] = useState<Set<string>>(new Set());

  // PDF関連
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfTargetPayslip, setPdfTargetPayslip] = useState<Payslip | null>(null);
  const [bulkPdfMode, setBulkPdfMode] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState<'all' | 'payslip' | 'attendance'>('all');
  const [activeDownloadMenuHelperId, setActiveDownloadMenuHelperId] = useState<string | null>(null);
  const printViewRef = useRef<HTMLDivElement>(null);

  // ヘルパーをソート・フィルタリング
  const sortedHelpers = useMemo(() => {
    // 1. 重複排除
    const uniqueHelpersMap = new Map();
    helpers.forEach(h => {
      if (!uniqueHelpersMap.has(h.id)) {
        uniqueHelpersMap.set(h.id, h);
      }
    });

    // 2. フィルタリングとソート
    return Array.from(uniqueHelpersMap.values())
      .filter(helper => {
        // 削除されていないヘルパーは常に表示
        if (!helper.deleted) return true;

        // 削除されている場合、その月にデータ（シフト、給与明細）があるかチェック
        // シフトがあるか
        const hasShifts = shifts.some(s => s.helperId === helper.id);

        // 給与明細があるか
        const hasPayslip = payslips.some(p => p.helperId === helper.id);

        return hasShifts || hasPayslip;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
  }, [helpers, shifts, payslips]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedPayslips, loadedHelpers, loadedShifts] = await Promise.all([
        loadPayslipsByMonth(selectedYear, selectedMonth),
        loadHelpers(),
        externalShifts ? Promise.resolve(externalShifts) : loadShiftsForMonth(selectedYear, selectedMonth)
      ]);
      setPayslips(loadedPayslips);
      setHelpers(loadedHelpers);
      setShifts(loadedShifts);
      // 年月切り替えや再読み込み時は選択をリセット
      setSelectedHelperIds(new Set());
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      alert('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, externalShifts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // メニュー外クリックで閉じる処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.download-menu-container')) {
        setActiveDownloadMenuHelperId(null);
      }
    };

    if (activeDownloadMenuHelperId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDownloadMenuHelperId]);

  // 給与明細を削除
  const handleDelete = useCallback(async (payslip: Payslip) => {
    if (!confirm(`${payslip.helperName}さんの給与明細を削除しますか？`)) {
      return;
    }

    try {
      await deletePayslip(payslip.id);
      await loadData();
      alert('削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  }, [loadData]);

  // 編集ボタンハンドラ
  const handleEdit = useCallback((payslip: Payslip) => {
    // 固定給も時給も同じUIで編集可能
    setEditingPayslip(payslip);
    setShowEditModal(true);
  }, []);

  // 編集を保存
  const handleSaveEdit = useCallback(async (updatedPayslip: Payslip) => {
    try {
      await savePayslip(updatedPayslip);
      await loadData();
      setShowEditModal(false);
      setEditingPayslip(null);
      alert('保存しました');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    }
  }, [loadData]);

  // 編集をキャンセル
  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setEditingPayslip(null);
  }, []);

  // 給与明細を作成
  const handleCreatePayslip = useCallback(async (helper: Helper) => {
    if (!confirm(`${helper.name}さんの給与明細を作成しますか？\n${selectedYear}年${selectedMonth}月のシフトデータから自動生成します。`)) {
      return;
    }

    setCreating(true);
    try {
      // シフトデータから給与明細を生成（当月末まで）
      const helperShifts = shifts.filter(s => {
        if (s.helperId !== helper.id) return false;

        const shiftDate = new Date(s.date);
        const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
        const periodEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

        return shiftDate >= periodStart && shiftDate <= periodEnd;
      });

      const payslip = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);

      // Firestoreに保存
      await savePayslip(payslip);

      // データを再読み込み
      await loadData();

      alert(`${helper.name}さんの給与明細を作成しました`);
    } catch (error) {
      console.error('給与明細作成エラー:', error);
      alert('給与明細の作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }, [shifts, selectedYear, selectedMonth, loadData]);

  // 給与明細を一括作成
  const handleBulkCreatePayslips = useCallback(async () => {
    // 未作成のヘルパーを抽出
    const helpersWithoutPayslip = sortedHelpers.filter(helper =>
      !payslips.some(p => p.helperId === helper.id)
    );

    if (helpersWithoutPayslip.length === 0) {
      alert('すべてのヘルパーの給与明細が既に作成されています');
      return;
    }

    if (!confirm(`${helpersWithoutPayslip.length}人分の給与明細を一括作成しますか？\n${selectedYear}年${selectedMonth}月のシフトデータから自動生成します。`)) {
      return;
    }

    setCreating(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (const helper of helpersWithoutPayslip) {
        try {
          // シフトデータから給与明細を生成
          const helperShifts = shifts.filter(s => {
            if (s.helperId !== helper.id) return false;

            const shiftDate = new Date(s.date);
            const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
            let periodEnd: Date;

            periodEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

            return shiftDate >= periodStart && shiftDate <= periodEnd;
          });

          const payslip = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);

          // Firestoreに保存
          await savePayslip(payslip);
          successCount++;
        } catch (error) {
          console.error(`${helper.name}の給与明細作成エラー:`, error);
          errorCount++;
          errors.push(`${helper.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // データを再読み込み
      await loadData();

      // 結果を表示
      if (errorCount === 0) {
        alert(`${successCount}人分の給与明細を作成しました`);
      } else {
        alert(`成功: ${successCount}人\n失敗: ${errorCount}人\n\n失敗したヘルパー:\n${errors.join(', ')}\n\nエラー詳細(最初の1件): ${(errors.length > 0 && errors[0].includes(':')) ? errors[0].split(':')[1] : '不明なエラー'}`);
      }
    } catch (error) {
      console.error('一括作成エラー:', error);
      alert('一括作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }, [sortedHelpers, payslips, shifts, selectedYear, selectedMonth, loadData]);

  // 選択したヘルパーの給与明細を一括作成（未作成は作成、作成済みは上書き再計算）
  const handleBulkCreateSelectedPayslips = useCallback(async () => {
    const selectedIds = Array.from(selectedHelperIds);
    if (selectedIds.length === 0) {
      alert('一括作成するヘルパーを選択してください');
      return;
    }

    const selectedHelpers = sortedHelpers.filter(h => selectedHelperIds.has(h.id));
    const existingCount = selectedHelpers.filter(h => payslips.some(p => p.helperId === h.id)).length;
    const newCount = selectedHelpers.length - existingCount;

    if (!confirm(
      `${selectedHelpers.length}人分の給与明細を一括作成/更新しますか？\n` +
      `未作成: ${newCount}人 / 既存上書き: ${existingCount}人\n` +
      `${selectedYear}年${selectedMonth}月のシフトデータから自動生成します。`
    )) {
      return;
    }

    setCreating(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (const helper of selectedHelpers) {
        try {
          // 対象期間のシフトを抽出（当月末まで）
          const helperShifts = shifts.filter(s => {
            if (s.helperId !== helper.id) return false;
            const shiftDate = new Date(s.date);
            const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
            let periodEnd: Date;
            periodEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
            return shiftDate >= periodStart && shiftDate <= periodEnd;
          });

          const generated = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);

          // 既存がある場合はIDを引き継いで上書き保存
          const existing = payslips.find(p => p.helperId === helper.id);
          if (existing?.id) {
            generated.id = existing.id;
          }

          await savePayslip(generated);
          successCount++;
        } catch (error) {
          console.error(`${helper.name}の給与明細作成/更新エラー:`, error);
          errorCount++;
          errors.push(helper.name);
        }
      }

      await loadData();
      if (errorCount === 0) {
        alert(`${successCount}人分の給与明細を作成/更新しました`);
      } else {
        alert(`成功: ${successCount}人\n失敗: ${errorCount}人\n\n失敗したヘルパー:\n${errors.join(', ')}`);
      }
    } catch (error) {
      console.error('選択一括作成エラー:', error);
      alert('選択一括作成に失敗しました');
    } finally {
      setCreating(false);
    }
  }, [selectedHelperIds, sortedHelpers, payslips, shifts, selectedYear, selectedMonth, loadData]);

  // 給与明細を再計算
  const handleRecalculatePayslip = useCallback(async (helper: Helper, existingPayslip: Payslip) => {
    if (!confirm(`${helper.name}さんの給与明細を再計算しますか？\n最新のシフトデータから勤怠項目を再集計します。`)) {
      return;
    }

    setCreating(true);
    try {
      // 最新のシフトデータを取得（当月末まで）
      const helperShifts = shifts.filter(s => {
        if (s.helperId !== helper.id) return false;

        const shiftDate = new Date(s.date);
        const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
        const periodEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

        return shiftDate >= periodStart && shiftDate <= periodEnd;
      });

      // シフトデータから給与明細を再生成
      const newPayslip = generatePayslipFromShifts(helper, helperShifts, selectedYear, selectedMonth);

      // 既存の給与明細IDを保持（上書き保存）
      newPayslip.id = existingPayslip.id;

      // Firestoreに保存
      await savePayslip(newPayslip);

      // データを再読み込み
      await loadData();

      alert(`${helper.name}さんの給与明細を再計算しました`);
    } catch (error) {
      console.error('給与明細再計算エラー:', error);
      alert('給与明細の再計算に失敗しました');
    } finally {
      setCreating(false);
    }
  }, [shifts, selectedYear, selectedMonth, loadData]);



  // 個別PDF生成
  const handleDownloadPdf = useCallback(async (payslip: Payslip, mode: 'all' | 'payslip' | 'attendance') => {
    setPdfExportMode(mode);
    setPdfTargetPayslip(payslip);
    setBulkPdfMode(false);
    setGeneratingPdf(true);
    setActiveDownloadMenuHelperId(null);
  }, []);

  // PDF生成実行（印刷ビューがレンダリングされた後に実行）
  useEffect(() => {
    if (generatingPdf && pdfTargetPayslip && printViewRef.current && !bulkPdfMode) {
      const generatePdf = async () => {
        try {
          await downloadPayslipPdf(printViewRef.current!, pdfTargetPayslip, pdfExportMode);
        } catch (error) {
          console.error('PDF生成エラー:', error);
          alert('PDFの生成に失敗しました');
        } finally {
          setGeneratingPdf(false);
          setPdfTargetPayslip(null);
        }
      };
      // 少し待ってからPDF生成（レンダリング完了を待つ）
      setTimeout(generatePdf, 100);
    }
  }, [generatingPdf, pdfTargetPayslip, bulkPdfMode, pdfExportMode]);

  // 一括PDFダウンロード
  const handleBulkPdfDownload = useCallback(async () => {
    const hasSelection = selectedHelperIds.size > 0;
    const targetPayslips = sortedHelpers
      .filter(h => !hasSelection || selectedHelperIds.has(h.id))
      .map(h => payslips.find(p => p.helperId === h.id))
      .filter((p): p is Payslip => p !== undefined);

    if (targetPayslips.length === 0) {
      alert('ダウンロードする給与明細がありません');
      return;
    }

    if (hasSelection) {
      const selectedCount = selectedHelperIds.size;
      const missingCount = selectedCount - targetPayslips.length;
      if (missingCount > 0) {
        alert(`選択した${selectedCount}人のうち、${missingCount}人分の給与明細が未作成です。\n先に「選択一括作成」を実行してください。`);
        return;
      }
    }

    const confirmCount = targetPayslips.length;
    const confirmLabel = hasSelection ? '選択した給与明細' : '給与明細';
    if (!confirm(`${confirmCount}件の${confirmLabel}を一括でPDFダウンロードしますか？\n（処理に時間がかかる場合があります）`)) {
      return;
    }

    setBulkPdfMode(true);
    setGeneratingPdf(true);
    setPdfProgress({ current: 0, total: confirmCount });

    let tempContainer: HTMLDivElement | null = null;

    try {
      const payslipElements: { element: HTMLElement; payslip: Payslip }[] = [];
      // クローンを一時的にDOMに追加してhtml2canvasが正しく描画できるようにする
      tempContainer = document.createElement('div');
      tempContainer.id = '__payslip_pdf_temp__';
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '1600px';
      tempContainer.style.background = 'white';
      document.body.appendChild(tempContainer);

      // 各給与明細のPDFを順番に生成
      for (let i = 0; i < targetPayslips.length; i++) {
        const payslip = targetPayslips[i];
        setPdfTargetPayslip(payslip);
        setPdfProgress({ current: i + 1, total: confirmCount });

        // レンダリングを待つ
        await new Promise(resolve => setTimeout(resolve, 200));

        if (printViewRef.current) {
          // cloneNodeはinputの「プロパティ値」を持たないことがあるので、属性へ退避してからクローン
          printViewRef.current.querySelectorAll('input').forEach((n: any) => {
            try {
              const type = (n.getAttribute?.('type') || 'text').toLowerCase();
              if (type === 'checkbox' || type === 'radio') {
                if (n.checked) n.setAttribute('checked', 'checked');
                else n.removeAttribute('checked');
              } else {
                n.setAttribute('value', n.value ?? '');
              }
            } catch { /* noop */ }
          });
          printViewRef.current.querySelectorAll('textarea').forEach((n: any) => {
            try { n.textContent = n.value ?? ''; } catch { /* noop */ }
          });
          printViewRef.current.querySelectorAll('select').forEach((n: any) => {
            try {
              Array.from(n.options || []).forEach((opt: any, idx: number) => {
                if (idx === n.selectedIndex) opt.setAttribute('selected', 'selected');
                else opt.removeAttribute('selected');
              });
            } catch { /* noop */ }
          });

          const clone = printViewRef.current.cloneNode(true) as HTMLElement;
          tempContainer.appendChild(clone);
          payslipElements.push({
            element: clone,
            payslip
          });
        }
      }

      // 一括PDFを生成
      await downloadBulkPayslipPdf(
        payslipElements,
        selectedYear,
        selectedMonth,
        (current, total) => setPdfProgress({ current, total }),
        pdfExportMode
      );

      alert('PDF一括ダウンロードが完了しました');
    } catch (error) {
      console.error('一括PDF生成エラー:', error);
      alert('PDFの一括生成に失敗しました');
    } finally {
      // 一時コンテナを掃除
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setGeneratingPdf(false);
      setBulkPdfMode(false);
      setPdfTargetPayslip(null);
      setPdfProgress({ current: 0, total: 0 });
    }
  }, [payslips, selectedHelperIds, selectedYear, selectedMonth, pdfExportMode]);

  // 一括削除
  const handleBulkDelete = useCallback(async () => {
    if (payslips.length === 0) {
      alert('削除する給与明細がありません');
      return;
    }

    const confirmMessage = `${selectedYear}年${selectedMonth}月の給与明細を${payslips.length}件すべて削除しますか？\n\n⚠️ この操作は取り消せません。`;
    if (!confirm(confirmMessage)) {
      return;
    }

    // 二重確認
    const doubleConfirm = prompt(`本当に削除しますか？\n確認のため「削除」と入力してください。`);
    if (doubleConfirm !== '削除') {
      alert('削除がキャンセルされました');
      return;
    }

    setCreating(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const payslip of payslips) {
        try {
          await deletePayslip(payslip.id);
          successCount++;
        } catch (error) {
          console.error(`${payslip.helperName}の削除エラー:`, error);
          errorCount++;
        }
      }

      await loadData();

      if (errorCount === 0) {
        alert(`${successCount}件の給与明細を削除しました`);
      } else {
        alert(`成功: ${successCount}件\n失敗: ${errorCount}件`);
      }
    } catch (error) {
      console.error('一括削除エラー:', error);
      alert('一括削除に失敗しました');
    } finally {
      setCreating(false);
    }
  }, [payslips, selectedYear, selectedMonth, loadData]);

  // ヘルパーごとの給与明細を取得
  const getPayslipForHelper = (helperId: string): Payslip | undefined => {
    return payslips.find(p => p.helperId === helperId);
  };

  // 選択UI
  const selectedCount = selectedHelperIds.size;
  const isAllSelected = sortedHelpers.length > 0 && sortedHelpers.every(h => selectedHelperIds.has(h.id));

  const toggleSelectHelper = (helperId: string) => {
    setSelectedHelperIds(prev => {
      const next = new Set(prev);
      if (next.has(helperId)) next.delete(helperId);
      else next.add(helperId);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedHelperIds(new Set(sortedHelpers.map(h => h.id)));
    } else {
      setSelectedHelperIds(new Set());
    }
  };

  // 雇用形態のラベルを取得
  const getEmploymentTypeLabel = (type?: string) => {
    switch (type) {
      case 'fulltime': return '正社員';
      case 'parttime': return 'パート';
      case 'contract': return '契約社員';
      case 'temporary': return '派遣';
      case 'outsourced': return '業務委託';
      default: return '未設定';
    }
  };

  // 雇用形態バッジの色
  const getEmploymentTypeBadgeColor = (type?: string) => {
    switch (type) {
      case 'fulltime': return 'bg-blue-100 text-blue-800';
      case 'contract': return 'bg-indigo-100 text-indigo-800';
      case 'parttime': return 'bg-green-100 text-green-800';
      case 'temporary': return 'bg-yellow-100 text-yellow-800';
      case 'outsourced': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  // 金額フォーマット
  const formatCurrency = (amount: number): string => {
    return `¥${amount.toLocaleString()}`;
  };

  // 合計計算
  const totals = useMemo(() => {
    const created = payslips.filter(p => p);
    return {
      count: created.length,
      totalPayment: created.reduce((sum, p) => sum + p.payments.totalPayment, 0),
      totalDeduction: created.reduce((sum, p) => sum + p.deductions.totalDeduction, 0),
      netPayment: created.reduce((sum, p) => sum + p.totals.netPayment, 0)
    };
  }, [payslips]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">給与明細一覧</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              ✕
            </button>
          </div>

          {/* 年月セレクター */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">年:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">月:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                  <option key={month} value={month}>{month}月</option>
                ))}
              </select>
            </div>

            {/* 一括作成ボタン */}
            <button
              onClick={handleBulkCreatePayslips}
              disabled={creating || loading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              一括作成
            </button>

            {/* 選択一括作成ボタン */}
            <button
              onClick={handleBulkCreateSelectedPayslips}
              disabled={creating || loading || selectedCount === 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              title="チェックしたヘルパーの給与明細を作成/更新"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              選択一括作成{selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>

            {/* PDF出力モード選択 */}
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border border-gray-200">
              <label className="text-sm font-medium text-gray-700">出力:</label>
              <select
                value={pdfExportMode}
                onChange={(e) => setPdfExportMode(e.target.value as any)}
                className="bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">全て(給与+勤怠)</option>
                <option value="payslip">給与明細のみ</option>
                <option value="attendance">勤怠・ケアのみ</option>
              </select>
            </div>

            {/* PDF一括ダウンロードボタン */}
            <button
              onClick={handleBulkPdfDownload}
              disabled={generatingPdf || loading || (selectedCount > 0 ? payslips.filter(p => selectedHelperIds.has(p.helperId)).length === 0 : payslips.length === 0)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {generatingPdf ? `PDF生成中 (${pdfProgress.current}/${pdfProgress.total})` : (selectedCount > 0 ? `選択ダウンロード(${selectedCount})` : '一括ダウンロード')}
            </button>

            {/* 一括削除ボタン */}
            <button
              onClick={handleBulkDelete}
              disabled={creating || loading || payslips.length === 0}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              一括削除
            </button>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">読み込み中...</p>
            </div>
          ) : sortedHelpers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              ヘルパーが登録されていません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="w-4 h-4"
                        title="全選択"
                      />
                    </th>
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">No</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-left">ヘルパー名</th>
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">雇用形態</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">支給額</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">控除額</th>
                    <th className="border border-gray-300 px-3 py-2 text-sm font-medium text-right">差引支給額</th>
                    <th className="border border-gray-300 px-2 py-2 text-sm font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHelpers.map((helper, index) => {
                    const payslip = getPayslipForHelper(helper.id);
                    const isSelected = selectedHelperIds.has(helper.id);

                    return (
                      <tr key={helper.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-emerald-50' : ''}`}>
                        <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectHelper(helper.id)}
                            className="w-4 h-4"
                          />
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                          {index + 1}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-sm">
                          {helper.name}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEmploymentTypeBadgeColor(helper.employmentType)}`}>
                            {getEmploymentTypeLabel(helper.employmentType)}
                          </span>
                        </td>
                        {payslip ? (
                          <>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                              {formatCurrency(payslip.payments.totalPayment)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                              {formatCurrency(payslip.deductions.totalDeduction)}
                            </td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-right font-medium text-blue-600">
                              {formatCurrency(payslip.totals.netPayment)}
                            </td>
                            <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                              <div className="flex gap-1 justify-center flex-wrap">
                                <button
                                  onClick={() => handleEdit(payslip)}
                                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                  title="編集"
                                >
                                  編集
                                </button>
                                <button
                                  onClick={() => handleRecalculatePayslip(helper, payslip)}
                                  disabled={creating}
                                  className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 disabled:bg-gray-400"
                                  title="シフトデータから再計算"
                                >
                                  再計算
                                </button>
                                <div className="relative inline-block download-menu-container">
                                  <button
                                    onClick={() => setActiveDownloadMenuHelperId(activeDownloadMenuHelperId === helper.id ? null : helper.id)}
                                    className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1"
                                    title="PDFとしてダウンロード"
                                  >
                                    ダウンロード ▾
                                  </button>
                                  {activeDownloadMenuHelperId === helper.id && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-[60] overflow-hidden">
                                      <button
                                        onClick={() => handleDownloadPdf(payslip, 'all')}
                                        className="w-full text-left px-4 py-2 text-xs hover:bg-purple-50 text-gray-700 border-b border-gray-100"
                                      >
                                        📄 明細 + 勤怠表 (両方)
                                      </button>
                                      <button
                                        onClick={() => handleDownloadPdf(payslip, 'payslip')}
                                        className="w-full text-left px-4 py-2 text-xs hover:bg-purple-50 text-gray-700 border-b border-gray-100"
                                      >
                                        💰 明細のみ
                                      </button>
                                      <button
                                        onClick={() => handleDownloadPdf(payslip, 'attendance')}
                                        className="w-full text-left px-4 py-2 text-xs hover:bg-purple-50 text-gray-700"
                                      >
                                        📅 勤怠表・ケア一覧のみ
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleDelete(payslip)}
                                  className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                  title="削除"
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">未作成</td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">-</td>
                            <td className="border border-gray-300 px-3 py-2 text-sm text-center text-gray-400">-</td>
                            <td className="border border-gray-300 px-2 py-2 text-sm text-center">
                              <button
                                onClick={() => handleCreatePayslip(helper)}
                                disabled={creating}
                                className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 disabled:bg-gray-400"
                                title="給与明細を作成"
                              >
                                {creating ? '作成中...' : '作成'}
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-yellow-50 font-medium">
                    <td colSpan={3} className="border border-gray-300 px-3 py-2 text-sm">
                      合計（作成済み {totals.count}件）
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                      {formatCurrency(totals.totalPayment)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right">
                      {formatCurrency(totals.totalDeduction)}
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-right font-bold text-blue-600">
                      {formatCurrency(totals.netPayment)}
                    </td>
                    <td className="border border-gray-300 px-2 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div>
              合計: {helpers.length}人 / 明細作成済み: {payslips.length}件
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* 編集モーダル */}
      {showEditModal && editingPayslip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg shadow-xl w-[98vw] h-[98vh] flex flex-col">
            {/* ヘッダー */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">
                給与明細編集 - {editingPayslip.helperName}（{editingPayslip.year}年{editingPayslip.month}月）
              </h3>
              <button
                onClick={handleCancelEdit}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 overflow-auto">
              <PayslipSheet
                payslip={editingPayslip}
                helper={helpers.find(h => h.id === editingPayslip.helperId)}
                onChange={setEditingPayslip}
              />
            </div>

            {/* フッター */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleSaveEdit(editingPayslip)}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF生成用の非表示プリントビュー */}
      {generatingPdf && pdfTargetPayslip && (
        <div
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            width: '210mm',
            background: 'white'
          }}
        >
          <div ref={printViewRef}>
            <PayslipPrintView
              payslip={pdfTargetPayslip}
              helper={helpers.find(h => h.id === pdfTargetPayslip.helperId)}
            />
          </div>
        </div>
      )}

      {/* PDF生成中のオーバーレイ */}
      {generatingPdf && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <div>
                <p className="font-medium">PDF生成中...</p>
                {bulkPdfMode && (
                  <p className="text-sm text-gray-600">
                    {pdfProgress.current} / {pdfProgress.total} 件処理中
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
