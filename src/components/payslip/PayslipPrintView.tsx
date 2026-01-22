import React, { useMemo } from 'react';
import type { Payslip } from '../../types/payslip';
import type { Helper } from '../../types';
import PayslipSheet from './PayslipSheet';
import { recalculatePayslip, deriveInsuranceTypesFromHelper } from '../../utils/payslipUpdater';

interface PayslipPrintViewProps {
  payslip: Payslip;
  helper?: Helper;
}

/**
 * 印刷/PDF用の給与明細ビュー
 * 画面と同じレイアウト（編集モーダルと同じ）をそのまま描画
 * レンダリング直前に再計算を行い、編集画面との整合性を確保する
 */
const PayslipPrintView: React.FC<PayslipPrintViewProps> = ({ payslip, helper }) => {
  const calculatedPayslip = useMemo(() => {
    try {
      const updated = JSON.parse(JSON.stringify(payslip));

      // 保険タイプなどを同期（PayslipMainと同様のロジック）
      updated.insuranceTypes = deriveInsuranceTypesFromHelper(helper, updated.insuranceTypes);

      // ヘルパーマスタに標準報酬月額が設定されている場合は同期
      if (helper?.standardRemuneration && (!updated.standardRemuneration || updated.standardRemuneration === 0)) {
        updated.standardRemuneration = helper.standardRemuneration;
      }

      return recalculatePayslip(updated, helper);
    } catch (e) {
      console.error('Payslip recalculation failed in print view:', e);
      return payslip;
    }
  }, [payslip, helper]);

  return (
    <div
      className="payslip-pdf-root"
      style={{
        width: '1600px',
        background: 'white',
        padding: '8px',
        pointerEvents: 'none', // PDF生成時に編集操作が走らないよう無効化
      }}
    >
      <style>
        {`
          /* PDF用: h-full/overflow-auto のせいで切れるのを防ぐ */
          .payslip-pdf-root .h-full { height: auto !important; }
          .payslip-pdf-root .overflow-auto { overflow: visible !important; }
        `}
      </style>
      <PayslipSheet
        payslip={calculatedPayslip}
        helper={helper}
        onChange={() => { /* 読み取り専用 */ }}
        isPrintMode={true}
      />
    </div>
  );
};

export default PayslipPrintView;
