// @ts-nocheck
import React from 'react';
import type { Payslip } from '../../types/payslip';
import type { Helper } from '../../types';
import PayslipSheet from './PayslipSheet';

interface PayslipPrintViewProps {
  payslip: Payslip;
  helper?: Helper;
}

/**
 * 印刷/PDF用の給与明細ビュー
 * 画面と同じレイアウト（編集モーダルと同じ）をそのまま描画
 */
const PayslipPrintView: React.FC<PayslipPrintViewProps> = ({ payslip, helper }) => {
  return (
    <div
      style={{
        width: '1600px',
        background: 'white',
        padding: '8px',
        pointerEvents: 'none', // PDF生成時に編集操作が走らないよう無効化
      }}
    >
      <PayslipSheet
        payslip={payslip}
        helper={helper}
        onChange={() => { /* 読み取り専用 */ }}
      />
    </div>
  );
};

export default PayslipPrintView;
