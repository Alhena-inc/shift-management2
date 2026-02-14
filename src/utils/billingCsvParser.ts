/**
 * かんたん介護 実績CSV パーサー
 * Shift-JIS エンコードの CSV を読み取り、BillingRecord 形式に変換する
 */

export interface ParsedBillingRecord {
  serviceDate: string;   // YYYY-MM-DD
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  helperName: string;
  clientName: string;
  serviceCode: string;
}

export interface SkippedRow {
  rowNumber: number;
  originalLine: string;
  reason: string;
}

export interface ParseResult {
  records: ParsedBillingRecord[];
  skippedRows: SkippedRow[];
}

/**
 * Shift-JIS の ArrayBuffer を UTF-8 文字列にデコード
 */
function decodeShiftJIS(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder('shift-jis');
  return decoder.decode(buffer);
}

/**
 * CSV行パーサー（クォート対応）
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * 日付文字列を YYYY-MM-DD 形式に正規化
 * 対応形式: 2026/1/5, 2026年1月5日, 20260105, 2026-01-05
 */
function normalizeDate(raw: string): string | null {
  const s = raw.trim();

  // YYYY/M/D or YYYY/MM/DD
  const slashMatch = s.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (slashMatch) {
    const [, y, m, d] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY年M月D日
  const kanjiMatch = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (kanjiMatch) {
    const [, y, m, d] = kanjiMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYYMMDD
  const compactMatch = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, y, m, d] = compactMatch;
    return `${y}-${m}-${d}`;
  }

  // YYYY-MM-DD (already normalized)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return s;
  }

  return null;
}

/**
 * 時間文字列を HH:mm 形式に正規化
 * 対応形式: 9:00, 09:00, 0900
 */
function normalizeTime(raw: string): string | null {
  const s = raw.trim();

  // H:mm or HH:mm
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const [, h, m] = colonMatch;
    return `${h.padStart(2, '0')}:${m}`;
  }

  // HHMM (4桁)
  const compactMatch = s.match(/^(\d{2})(\d{2})$/);
  if (compactMatch) {
    const [, h, m] = compactMatch;
    return `${h}:${m}`;
  }

  return null;
}

/**
 * ヘッダー行からカラムインデックスを自動検出
 */
interface ColumnMapping {
  serviceDate: number;
  startTime: number;
  endTime: number;
  helperName: number;
  clientName: number;
  serviceCode: number;
}

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  serviceDate: ['提供日', 'サービス提供日', '日付', '実施日', 'サービス日'],
  startTime: ['開始時間', '開始', '開始時刻', 'サービス開始'],
  endTime: ['終了時間', '終了', '終了時刻', 'サービス終了'],
  helperName: ['ヘルパー名', 'ヘルパー', '担当者', '担当者名', '従業者名'],
  clientName: ['利用者名', '利用者', '氏名', 'お客様名'],
  serviceCode: ['サービスコード', 'サービス種類', 'サービス内容', 'コード'],
};

function detectColumns(headerFields: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headerFields.findIndex(h =>
      aliases.some(alias => h.includes(alias))
    );
    if (idx >= 0) {
      mapping[key as keyof ColumnMapping] = idx;
    }
  }

  // 必須フィールドチェック
  const required: (keyof ColumnMapping)[] = ['serviceDate', 'startTime', 'endTime', 'helperName', 'clientName'];
  for (const field of required) {
    if (mapping[field] === undefined) {
      return null;
    }
  }

  // serviceCode はオプション（見つからなければ -1）
  if (mapping.serviceCode === undefined) {
    mapping.serviceCode = -1;
  }

  return mapping as ColumnMapping;
}

/**
 * CSV ファイル（ArrayBuffer）をパースして BillingRecord 配列に変換
 */
export function parseBillingCsv(buffer: ArrayBuffer): ParseResult {
  const text = decodeShiftJIS(buffer);
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  if (lines.length < 2) {
    return { records: [], skippedRows: [{ rowNumber: 0, originalLine: '', reason: 'CSVにデータ行がありません' }] };
  }

  // ヘッダー行の解析
  const headerFields = parseCsvLine(lines[0]);
  const columns = detectColumns(headerFields);

  if (!columns) {
    return {
      records: [],
      skippedRows: [{
        rowNumber: 1,
        originalLine: lines[0],
        reason: '必須カラムが見つかりません（提供日, 開始時間, 終了時間, ヘルパー名, 利用者名）',
      }],
    };
  }

  const records: ParsedBillingRecord[] = [];
  const skippedRows: SkippedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rowNumber = i + 1;

    // 空行スキップ
    if (fields.every(f => f === '')) continue;

    // 日付
    const rawDate = fields[columns.serviceDate] || '';
    const serviceDate = normalizeDate(rawDate);
    if (!serviceDate) {
      skippedRows.push({ rowNumber, originalLine: lines[i], reason: `日付を解析できません: "${rawDate}"` });
      continue;
    }

    // 開始時間
    const rawStart = fields[columns.startTime] || '';
    const startTime = normalizeTime(rawStart);
    if (!startTime) {
      skippedRows.push({ rowNumber, originalLine: lines[i], reason: `開始時間を解析できません: "${rawStart}"` });
      continue;
    }

    // 終了時間
    const rawEnd = fields[columns.endTime] || '';
    const endTime = normalizeTime(rawEnd);
    if (!endTime) {
      skippedRows.push({ rowNumber, originalLine: lines[i], reason: `終了時間を解析できません: "${rawEnd}"` });
      continue;
    }

    // ヘルパー名
    const helperName = (fields[columns.helperName] || '').trim();
    if (!helperName) {
      skippedRows.push({ rowNumber, originalLine: lines[i], reason: 'ヘルパー名が空です' });
      continue;
    }

    // 利用者名
    const clientName = (fields[columns.clientName] || '').trim();
    if (!clientName) {
      skippedRows.push({ rowNumber, originalLine: lines[i], reason: '利用者名が空です' });
      continue;
    }

    // サービスコード（オプション）
    const serviceCode = columns.serviceCode >= 0 ? (fields[columns.serviceCode] || '').trim() : '';

    records.push({
      serviceDate,
      startTime,
      endTime,
      helperName,
      clientName,
      serviceCode,
    });
  }

  return { records, skippedRows };
}
