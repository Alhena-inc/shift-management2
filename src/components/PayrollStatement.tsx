import { useState } from 'react';
import type { Helper, Shift } from '../types';
import { calculatePayrollData } from '../services/zapierPayrollService';

interface Props {
  helper: Helper;
  shifts: Shift[];
  year: number;
  month: number;
}

export function PayrollStatement({ helper, shifts, year, month }: Props) {
  // 給与データを計算
  const initialData = calculatePayrollData(helper, shifts, year, month);

  // 編集可能な状態
  const [editableData, setEditableData] = useState(initialData);
  const [isEditing, setIsEditing] = useState<string | null>(null);

  // 報酬計算（編集可能データから）
  const normalPayAmount = Math.round(editableData.normalHours * 2000);
  const dokoPayAmount = Math.round(editableData.dokoHours * 2000);
  const jimuEigyoPayAmount = Math.round(editableData.jimuEigyoHours * 1200);
  const nightPayAmount = Math.round(editableData.normalNightHours * 2000 * 1.5);
  const nightDokoPayAmount = Math.round(editableData.dokoNightHours * 2000 * 1.5);

  const totalPayAmount = normalPayAmount + dokoPayAmount + jimuEigyoPayAmount +
                        nightPayAmount + nightDokoPayAmount +
                        editableData.expenses + editableData.transportation;

  const isHourly = helper.salaryType === 'hourly';

  // 編集ハンドラー
  const handleEdit = (field: string, value: number) => {
    setEditableData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="payroll-statement bg-white p-6" style={{ fontFamily: 'Arial, Hiragino Sans, Meiryo, sans-serif', fontSize: '12px' }}>
      {/* ヘッダー部分 */}
      <div className="mb-4">
        <div className="grid grid-cols-3 gap-4 mb-2">
          {/* 左: 承認印欄 */}
          <div>
            <div className="border-2 border-gray-700 p-2 text-center" style={{ height: '60px' }}>
              <div className="text-xs text-gray-600">承認印</div>
            </div>
          </div>

          {/* 中央: タイトル */}
          <div className="text-center">
            <h1 className="text-xl font-bold">賃金明細 {year}年{month}月分</h1>
            <div className="text-sm text-gray-600">(支払通知書)</div>
          </div>

          {/* 右: 会社情報 */}
          <div className="text-right text-xs">
            <div className="font-bold">Alhena合同会社</div>
            <div>訪問介護事業所のあ</div>
            <div className="text-gray-600">大阪府大阪市大正区三軒家東4丁目15-4</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 左側: 基本情報・勤怠・支給 */}
        <div>
          {/* 基本情報 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">基本情報</div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1 w-1/3">部署</td>
                  <td className="border border-gray-700 px-2 py-1">介護事業</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">氏名</td>
                  <td className="border border-gray-700 px-2 py-1 font-bold">{editableData.helperName} 様</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">雇用形態</td>
                  <td className="border border-gray-700 px-2 py-1">アルバイト</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">基本単価</td>
                  <td className="border border-gray-700 px-2 py-1">1,200円</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">処遇改善加算</td>
                  <td className="border border-gray-700 px-2 py-1">800円</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">合計時間単価</td>
                  <td className="border border-gray-700 px-2 py-1 font-bold">2,000円</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 勤怠項目 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">勤怠項目</div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1 w-1/3">通常稼働日数</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.normalDays}日</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">同行稼働日数</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.dokoDays}日</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">欠勤回数</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">0回</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">遅刻・早退回数</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">0回</td>
                </tr>
                <tr className="bg-blue-50">
                  <td className="border border-gray-700 bg-blue-100 px-2 py-1 font-bold">合計稼働日数</td>
                  <td className="border border-gray-700 px-2 py-1 text-right font-bold">{editableData.totalDays}日</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 稼働時間 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">稼働時間</div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1 w-1/3">通常稼働時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right"
                      onDoubleClick={() => setIsEditing('normalHours')}>
                    {isEditing === 'normalHours' ? (
                      <input
                        type="number"
                        value={editableData.normalHours}
                        onChange={(e) => handleEdit('normalHours', parseFloat(e.target.value) || 0)}
                        onBlur={() => setIsEditing(null)}
                        className="w-full text-right"
                        autoFocus
                      />
                    ) : (
                      `${editableData.normalHours}h`
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">同行時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.dokoHours}h</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">(深夜)稼働時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.normalNightHours}h</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">(深夜)同行時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.dokoNightHours}h</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">事務・営業業務時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">{editableData.jimuEigyoHours}h</td>
                </tr>
                <tr className="bg-blue-50">
                  <td className="border border-gray-700 bg-blue-100 px-2 py-1 font-bold">合計稼働時間</td>
                  <td className="border border-gray-700 px-2 py-1 text-right font-bold">{editableData.totalHours}h</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 支給項目 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">支給項目</div>
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1 w-1/3">通常稼働報酬</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{normalPayAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">同行稼働報酬</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{dokoPayAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">事務・営業報酬</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{jimuEigyoPayAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">(深夜)稼働報酬</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{nightPayAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">(深夜)同行報酬</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{nightDokoPayAmount.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">経費精算</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{editableData.expenses.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 bg-gray-100 px-2 py-1">交通費立替手当</td>
                  <td className="border border-gray-700 px-2 py-1 text-right">¥{editableData.transportation.toLocaleString()}</td>
                </tr>
                <tr className="bg-green-50">
                  <td className="border border-gray-700 bg-green-100 px-2 py-1 font-bold">支給額合計</td>
                  <td className="border border-gray-700 px-2 py-1 text-right font-bold text-base text-green-700">¥{totalPayAmount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 備考欄 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">備考</div>
            <div className="border border-gray-700 px-2 py-2 min-h-[60px] text-xs"></div>
          </div>
        </div>

        {/* 右側: 月勤怠表とケア一覧 */}
        <div>
          {/* 月勤怠表 */}
          <div className="mb-3">
            <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">{month}月勤怠表</div>
            <div className="border border-gray-700 overflow-auto" style={{ maxHeight: isHourly ? '300px' : '500px' }}>
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-200">
                  <tr>
                    <th className="border border-gray-700 px-1 py-1 text-xs">日付</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">曜日</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">通常</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">深夜</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">同行</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">事務</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs">営業</th>
                    <th className="border border-gray-700 px-1 py-1 text-xs bg-blue-100">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {editableData.dailyData.map((day) => (
                    <tr key={day.day} className={day.totalHours > 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-700 px-1 py-0.5 text-center text-xs">
                        {month}/{day.day}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-center text-xs">
                        {day.dayOfWeek}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right text-xs">
                        {day.normalHours > 0 ? day.normalHours : ''}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right text-xs">
                        {day.normalNightHours > 0 ? day.normalNightHours : ''}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right text-xs">
                        {(day.dokoHours + day.dokoNightHours) > 0 ? (day.dokoHours + day.dokoNightHours) : ''}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right text-xs">
                        {day.jimuHours > 0 ? day.jimuHours : ''}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right text-xs">
                        {day.eigyoHours > 0 ? day.eigyoHours : ''}
                      </td>
                      <td className="border border-gray-700 px-1 py-0.5 text-right font-semibold bg-blue-50 text-xs">
                        {day.totalHours > 0 ? day.totalHours : ''}
                      </td>
                    </tr>
                  ))}
                  {/* 合計行 */}
                  <tr className="bg-green-100 font-bold">
                    <td colSpan={2} className="border border-gray-700 px-1 py-1 text-center text-xs">
                      合計
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right text-xs">
                      {editableData.normalHours}
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right text-xs">
                      {editableData.normalNightHours}
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right text-xs">
                      {editableData.dokoHours + editableData.dokoNightHours}
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right text-xs">
                      {editableData.dailyData.reduce((sum, day) => sum + day.jimuHours, 0)}
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right text-xs">
                      {editableData.dailyData.reduce((sum, day) => sum + day.eigyoHours, 0)}
                    </td>
                    <td className="border border-gray-700 px-1 py-1 text-right bg-green-200 text-xs">
                      {editableData.totalHours}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ケア一覧表（時給のみ） */}
          {isHourly && editableData.careListData && (
            <div className="mb-3">
              <div className="bg-gray-200 px-2 py-1 font-bold text-sm border border-gray-700">ケア一覧表</div>
              <div className="border border-gray-700 overflow-auto" style={{ maxHeight: '300px' }}>
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-200">
                    <tr>
                      <th className="border border-gray-700 px-1 py-1 text-xs w-16">日付</th>
                      <th className="border border-gray-700 px-1 py-1 text-xs">ケア内容・時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableData.careListData.map((careDay) => {
                      if (careDay.cares.length === 0) return null;
                      return (
                        <tr key={careDay.day}>
                          <td className="border border-gray-700 px-1 py-1 text-center text-xs">
                            {month}/{careDay.day}
                          </td>
                          <td className="border border-gray-700 px-1 py-1 text-xs">
                            {careDay.cares.map((care, idx) => (
                              <div key={idx} className="mb-0.5">
                                {care.clientName}（{care.serviceType} {care.hours}h）
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* フッター */}
      <div className="mt-3 pt-2 border-t text-xs text-gray-600">
        <p>※深夜時間帯（22:00〜翌8:00）は通常単価の1.5倍で計算しています</p>
        <p>※通常稼働単価: 2,000円/時、同行単価: 2,000円/時、事務・営業単価: 1,200円/時</p>
        <p className="text-right text-gray-500 mt-2">※項目をダブルクリックで編集できます</p>
      </div>
    </div>
  );
}
