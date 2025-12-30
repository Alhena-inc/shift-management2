/**
 * スプレッドシート情報取得サービス
 * 埋め込みスプレッドシートの全データ（値、書式、レイアウト）を取得
 */

const SPREADSHEET_ID = '1hrNbQ3X9bkFqNe3zoZgs3vQF54K2rmFxXNJm_0Xg5m0';
const SHEET_ID = 503376053;

export interface CellData {
  row: number;
  col: number;
  value: string;
  backgroundColor: string | null;
  textColor: string | null;
  fontSize: number | null;
  bold: boolean | null;
  horizontalAlignment: string | null;
  verticalAlignment: string | null;
}

export interface SpreadsheetData {
  title: string;
  rowCount: number;
  columnCount: number;
  columnWidths: number[];
  rowHeights: number[];
  merges: any[];
  cells: CellData[];
}

/**
 * RGB色を16進数に変換
 */
const rgbToHex = (color: { red?: number; green?: number; blue?: number }): string => {
  const r = Math.round((color.red || 0) * 255);
  const g = Math.round((color.green || 0) * 255);
  const b = Math.round((color.blue || 0) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * スプレッドシートの全情報を取得（メタデータ + セルデータ + 書式）
 */
export const getSpreadsheetData = async (accessToken: string): Promise<any> => {
  console.log('📊 スプレッドシートデータ取得開始...');
  console.log('🔑 アクセストークン:', accessToken.substring(0, 30) + '...');

  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?includeGridData=true`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log('📡 レスポンス:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ スプレッドシートデータ取得エラー:', errorText);
      throw new Error(`スプレッドシートデータの取得に失敗しました (${response.status})`);
    }

    const data = await response.json();
    console.log('✅ スプレッドシートデータ取得成功');
    console.log('📋 シート数:', data.sheets?.length);

    return data;
  } catch (error) {
    console.error('❌ スプレッドシートデータ取得エラー:', error);
    throw error;
  }
};

/**
 * 取得したスプレッドシートデータを解析
 */
export const parseSpreadsheetData = (data: any): SpreadsheetData => {
  console.log('🔍 スプレッドシートデータ解析開始...');

  // 指定したシートIDのシートを取得
  const sheet = data.sheets.find((s: any) => s.properties.sheetId === SHEET_ID);

  if (!sheet) {
    throw new Error(`Sheet with ID ${SHEET_ID} not found`);
  }

  console.log('📄 シート名:', sheet.properties.title);

  const gridData = sheet.data[0]; // 最初のグリッドデータ

  const result: SpreadsheetData = {
    title: sheet.properties.title,
    rowCount: sheet.properties.gridProperties.rowCount,
    columnCount: sheet.properties.gridProperties.columnCount,

    // 列幅
    columnWidths: gridData.columnMetadata?.map((col: any) => col.pixelSize || 100) || [],

    // 行高
    rowHeights: gridData.rowMetadata?.map((row: any) => row.pixelSize || 21) || [],

    // マージされたセル
    merges: sheet.merges || [],

    // セルデータ
    cells: [],
  };

  console.log('📐 グリッド情報:', {
    rowCount: result.rowCount,
    columnCount: result.columnCount,
    mergesCount: result.merges.length
  });

  // セルデータを解析
  gridData.rowData?.forEach((row: any, rowIndex: number) => {
    row.values?.forEach((cell: any, colIndex: number) => {
      if (cell.effectiveValue || cell.effectiveFormat) {
        // 値を取得（文字列、数値、日付など）
        let value = '';
        if (cell.effectiveValue) {
          if (cell.effectiveValue.stringValue !== undefined) {
            value = cell.effectiveValue.stringValue;
          } else if (cell.effectiveValue.numberValue !== undefined) {
            value = String(cell.effectiveValue.numberValue);
          } else if (cell.effectiveValue.boolValue !== undefined) {
            value = String(cell.effectiveValue.boolValue);
          } else if (cell.effectiveValue.formulaValue !== undefined) {
            value = cell.effectiveValue.formulaValue;
          }
        }

        const cellData: CellData = {
          row: rowIndex,
          col: colIndex,
          value,
          backgroundColor: cell.effectiveFormat?.backgroundColor
            ? rgbToHex(cell.effectiveFormat.backgroundColor)
            : null,
          textColor: cell.effectiveFormat?.textFormat?.foregroundColor
            ? rgbToHex(cell.effectiveFormat.textFormat.foregroundColor)
            : null,
          fontSize: cell.effectiveFormat?.textFormat?.fontSize || null,
          bold: cell.effectiveFormat?.textFormat?.bold || null,
          horizontalAlignment: cell.effectiveFormat?.horizontalAlignment || null,
          verticalAlignment: cell.effectiveFormat?.verticalAlignment || null,
        };

        result.cells.push(cellData);
      }
    });
  });

  console.log('✅ スプレッドシートデータ解析完了');
  console.log('📊 統計:', {
    セル数: result.cells.length,
    マージ数: result.merges.length,
    列幅配列: result.columnWidths.length,
    行高配列: result.rowHeights.length,
  });

  return result;
};

/**
 * スプレッドシートデータをJSON形式でダウンロード
 */
export const downloadSpreadsheetDataAsJson = (data: SpreadsheetData, filename = 'spreadsheet-data.json'): void => {
  console.log('💾 JSONファイルとしてダウンロード...');

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  console.log('✅ ダウンロード完了:', filename);
};
