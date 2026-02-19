import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadBillingRecordsForMonth } from '../../services/dataService';
import type { GeneratorContext } from './types';
import type { CareClient, BillingRecord, ShogaiSupplyAmount } from '../../types';

// ==================== プロンプト ====================
const DEFAULT_PROMPT = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式な居宅介護計画書を作成してください。

【利用者情報】
- 氏名: {{client_name}}
- 性別: {{client_gender}}
- 生年月日: {{client_birthDate}}
- 住所: {{client_address}}
- 障害支援区分/介護度: {{client_careLevel}}
- 利用サービス種別: {{service_types}}
- 月間サービス回数: 約{{total_visits}}回
- 契約開始日: {{contract_start}}

【契約支給量】
{{supply_amounts}}

【シフト・実績情報（{{year}}年{{month}}月）- 曜日別パターン】
{{billing_summary}}

{{assessment_note}}

═══════════════════════════════════════════════════
■ 絶対遵守ルール
═══════════════════════════════════════════════════

### 1. アセスメントに記載のない援助項目は絶対に生成しない
- アセスメント資料がある場合、「身体状況」「援助内容」「生活援助」欄に記載がある項目のみ対象
- テンプレートや一般的な介護内容を流用しない
- 「念のため入れておく」で項目を追加しない

### 2. 他サービス事業所が担当しているケア内容は含めない
- 「訪問看護が担当」「デイサービスで実施」等の援助は含めない

### 3. 用語完全一致ルール
- 福祉用具名、移動手段、排泄用品名等はアセスメントの記載通りに使用
- 勝手に言い換えない（例: リハビリパンツ→おむつに変えない、ロフストランドクラッチ→杖に変えない）
- ADL/IADL項目名もアセスメントの表記に合わせる

### 4. アセスメント読み取りルール（資料がある場合）- 漏れなく全項目を反映すること
以下のチェックリストに沿ってアセスメントを網羅的に読み取り、介助・援助が必要と記載されている項目は1つも漏らさずサービス内容に反映すること。

【ADL項目チェックリスト】各項目の自立度を確認し、「一部介助」「全介助」「見守り」の項目はすべてサービス内容に含める
□ 移動（歩行・車椅子移動等）
□ 移乗（ベッド⇔車椅子等）
□ 排泄（トイレ移動・排泄介助・おむつ交換等）
□ 食事（食事介助・見守り等）
□ 入浴（入浴介助・清拭等）
□ 更衣（着脱介助等）
□ 整容（口腔ケア・洗面・整髪等）

【IADL項目チェックリスト】各項目の自立度を確認し、援助が必要と記載されている項目はすべてサービス内容に含める
□ 調理（食事の準備・配膳・片付け等）
□ 洗濯（洗濯・干し・取り込み・たたみ等）
□ 掃除（居室・トイレ・浴室等の清掃）
□ 買い物（買い物代行・同行等）
□ 金銭管理
□ 服薬管理（服薬確認・声かけ等）

【その他の確認項目】
- 使用している福祉用具・自助具の正式名称を抽出
- 排泄用品の種類・サイズがあればそのまま記載
- 「一部介助」「全介助」「見守り」等の介助レベルを反映
- 疾患名・障害名は正式名称を使用
- コミュニケーション・認知に関する記載があれば声かけ・見守りとして反映

★重要：アセスメントに「調理」「掃除」「洗濯」「買い物」等の生活援助項目が記載されている場合、それらを見落とさずに必ずサービス内容に含めること。身体介護の項目だけでなく、生活援助（家事援助）の項目も同等に重要である。

### 5. 留意事項の根拠チェック
- 留意事項は必ずアセスメントの記載内容に基づくこと
- アセスメントに記載のない一般的な注意（「転倒に注意」等）は、根拠なく使わない
- 具体的な状態像（麻痺の部位、関節拘縮の程度、嚥下機能等）を反映させる

### 6. アセスメントがない場合
- 実績データ・契約支給量から利用サービス種別に合った計画を作成
- この場合は一般的な注意事項の使用を許可

═══════════════════════════════════════════════════
■ サービス種別の自動判定ルール
═══════════════════════════════════════════════════
以下の優先順位で各サービス枠のservice_typeを判定する:
1. 契約支給量の種別名（「居宅介護 身体介護」→「身体介護」）
2. 実績のサービスコード（身体=11xxxx、生活=12xxxx、重度=14xxxx）
3. 訪問時間帯と援助内容から推測（排泄・入浴・食事介助→身体介護、掃除・洗濯・調理→家事援助）

重度訪問介護の場合: 身体介護と家事援助が一体的に提供されるため、1つの枠に混在可。

═══════════════════════════════════════════════════
■ セクション①：利用者・家族の希望（重要：2〜3行で具体的に記述）
═══════════════════════════════════════════════════
- 必ず2〜3行（60〜120文字）の具体的な文章にすること。1行の短文は不可。
- アセスメントの意向をもとに、計画書にふさわしい主体的表現で自然にまとめ直す
- アセスメントの文面をそのままコピーしない（言い回しを変えて再構成）
- 本人の希望は「〜したい」「〜を続けたい」等の主体的表現で記載
- 家族の希望は「〜してほしい」「〜を望んでいる」等の表現で記載
- 具体的な生活場面や行動を含め、抽象的すぎない文章にする
- NG例：「自宅で安心して暮らしたい」（短すぎ・抽象的すぎ）
- OK例：「身体機能の低下はあるが、住み慣れた自宅で生活を続けたい。日常の家事や身の回りのことは手伝ってもらいながら、できることは自分でやっていきたい。」

═══════════════════════════════════════════════════
■ セクション②：サービス内容（最重要：ブロック数の決定方法）
═══════════════════════════════════════════════════

### ブロック数決定の基本ルール（最重要）
サービス内容のブロック数は、【計画予定表（シフト・実績情報）】の時間帯パターンの数のみによって決まる。
アセスメントの援助項目の種類（身体介護・家事援助）でブロックを分けてはいけない。
自由に内容を分割してはいけない。必ず以下のルールに従うこと。

1. 上記の【シフト・実績情報】を確認し、サービスが入っている「異なる時間帯パターン」を特定する
2. 「異なる時間帯パターン」の数 ＝ サービス内容ブロック（service1〜service4）の数（厳密に一致させること）
3. 各ブロックは、対応する時間帯パターンで実施するサービス内容をすべてまとめて記載する
4. アセスメントの援助項目（身体介護系・家事援助系）は、該当する時間帯パターンのブロックに統合して記載する

### 「異なる時間帯パターン」の定義
- 開始時刻と終了時刻が同一であれば、曜日が異なっても「同じパターン」とみなす
- 開始時刻または終了時刻が異なる場合は「別パターン」とみなす
- ★重要：提供内容の種類（身体介護か家事援助か）ではパターンを分けない。時間帯のみで判定する

### 具体例
#### 例1：時間帯が2パターンの場合 → ブロックは2つ
計画予定表：土曜 11:00〜14:00（日中）、金・土・日 23:00〜翌7:00（夜間）
→ パターンA（11:00〜14:00）→ service1：この時間帯の身体介護＋家事援助を1ブロックにまとめる
→ パターンB（23:00〜翌7:00）→ service2：この時間帯の身体介護＋家事援助を1ブロックにまとめる
→ service3・service4はnull

#### 例2：時間帯が1パターンの場合 → ブロックは1つ
計画予定表：月〜金 9:00〜12:00
→ パターンA（9:00〜12:00）→ service1：身体介護も家事援助もすべてこの1ブロックに記載
→ service2〜4はnull

#### 例3：時間帯が3パターンの場合 → ブロックは3つ
計画予定表：月・水・金 9:00〜12:00、火・木 14:00〜16:00、毎日 22:00〜翌6:00
→ パターンA（9:00〜12:00）→ service1
→ パターンB（14:00〜16:00）→ service2
→ パターンC（22:00〜翌6:00）→ service3
→ service4はnull

### やってはいけないこと（厳守）
- ★絶対禁止：アセスメントの「身体介護」項目と「家事援助」項目を別ブロックに分けること（同じ時間帯なら1つのブロックにまとめる）
- ★絶対禁止：同じ時間帯パターンの援助内容を複数ブロックに分割すること
- ★絶対禁止：1回の長時間訪問の中の時間経過（夕方→夜→朝など）を理由にブロックを分割すること。23:00〜翌7:00のような長時間訪問でも、それは1つの訪問＝1ブロックである
- 同じ時間帯パターンなのに曜日ごとにブロックを分けること
- 計画予定表の時間帯パターン数と異なる数のブロックを生成すること

### 各ブロックの記載ルール
- 1回の訪問で実施するケアの流れ（手順）を時系列で記載する
- 長時間の訪問（重度訪問介護等）では、その訪問中に行うすべての援助（身体介護・家事援助・見守り等）を1ブロック内にまとめる
- 同じ時間帯に身体介護と家事援助の両方がある場合、1ブロック内に両方のステップを含める
- 各ステップの「content」は具体的な介助方法・手順を記述する（「〜の介助」だけでなく「〜の状態を確認し、〜を介助する」等）
- 各ステップの「note」はその利用者固有の留意点を記述する（一般論ではなく個別性のある内容）

═══════════════════════════════════════════════════
■ 生成手順（必ずこの順番で思考すること）
═══════════════════════════════════════════════════
1. 【シフト・実績情報】の末尾にある【時間帯パターン判定結果】を確認する。ここに記載されたパターン数が正解のブロック数である
2. アセスメントを網羅的に読み取り、介助・援助が必要な全項目をリストアップする（ADL：移動・排泄・食事・入浴・更衣・整容、IADL：調理・洗濯・掃除・買い物・服薬管理等）
3. リストアップした全項目を、該当する時間帯パターンごとに振り分ける（1つも漏らさないこと）
4. パターン数と同数のサービス内容ブロック（service1〜）を生成する（各ブロックには身体介護・家事援助が混在してよい）
5. 生成後、以下を自己検証する：
   - ブロック数が【時間帯パターン判定結果】のパターン数と一致しているか
   - アセスメントに記載のある援助項目がすべてサービス内容に含まれているか（特に調理・掃除・洗濯・買い物等の生活援助を見落としていないか）

═══════════════════════════════════════════════════

以下をJSON形式のみで出力（JSON以外不要、マークダウン記法不要）。

{
  "user_wish": "本人の希望（60〜120文字。2〜3行。主体的表現で具体的な生活場面を含む）",
  "family_wish": "家族の希望（60〜120文字。2〜3行。具体的な不安や要望を含む）",
  "goal_long": "長期目標（60〜100文字。具体的な到達点を記載。期間は書かない）",
  "goal_short": "短期目標（60〜100文字。具体的な到達点を記載。期間は書かない）",
  "needs": "解決すべき課題（60〜100文字。アセスメントに基づく具体的課題）",
  "schedule_remarks": "備考欄（100〜200文字。他サービス利用状況・緊急連絡先・特記事項）",
  "service1": {
    "service_type": "身体介護 or 家事援助 or 重度訪問介護 等",
    "visit_label": "月〜金 午前の身体介護 等（訪問パターンの説明）",
    "steps": [
      {"item": "援助項目名（15文字以内）", "content": "具体的な援助内容・手順（40〜60文字）", "note": "この利用者固有の留意事項（40〜60文字）"}
    ]
  },
  "service2": {
    "service_type": "...",
    "visit_label": "...",
    "steps": [...]
  },
  "service3": null,
  "service4": null
}

【出力ルール】
1. ブロック数は【シフト・実績情報】の時間帯パターン数と厳密に一致させる。パターンが1つならservice1のみ（service2〜4はnull）、2つならservice1とservice2のみ（service3・4はnull）。
2. 使用するブロック（service1〜）のstepsは5〜8項目とする。
3. 各サービス枠のstepsは、その訪問で実施するケアの流れ（手順）を時系列順に並べる。
4. service_typeは必ず判定ルールに従って正確に設定する。
5. visit_labelは「月〜金 午前の身体介護」「火・木 午後の家事援助」等、曜日と時間帯を含める。
6. 重度訪問介護の場合、service_typeは「重度訪問介護」とし、身体・家事の混在を許可する。
7. contentは具体的な手順を40文字以上で記述する。「〜の介助」だけの短い記述は不可。
8. noteはその利用者の個別状況に基づく留意点を40文字以上で記述する。
9. 不要なサービス枠は必ずnullにする。パターン数以上のブロックを生成しない。`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは障害福祉サービスの居宅介護事業所に勤務するベテランのサービス提供責任者です。
運営指導（実地指導）に耐える正式な居宅介護計画書を作成します。

## 最重要ルール
- アセスメント資料がある場合: 内容を網羅的に読み取り、記載されている援助内容をすべて漏れなく計画に反映する。記載のない項目は生成しない。
- ★特に注意：アセスメントに調理・掃除・洗濯・買い物等の生活援助項目がある場合、身体介護と同様に必ずサービス内容に含めること。生活援助の見落としは不可。
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合ったサービス内容を作成。
- 他サービス事業所の担当内容は居宅介護計画に含めない。
- 使用するサービスブロック（service1〜）は必ず5件以上のstepsを持つこと。ブロック数は計画予定表の時間帯パターン数と一致させる。
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要。

## サービス枠の分け方（最重要）
- 【シフト・実績情報】の末尾に【時間帯パターン判定結果】が記載されている。そのパターン数がブロック数の正解である
- ブロック数はこのパターン数と厳密に一致させる。自分で独自にパターンを判定しないこと
- 1回の連続した訪問は、何時間の長さであっても1ブロックにまとめる
- アセスメントの援助項目は種類（身体介護/家事援助）ではなく時間帯パターンごとに振り分ける
- 同じ時間帯パターンなのに曜日ごとにブロックを分けない
- 各枠のservice_typeを正確に判定する（契約支給量→実績コード→内容から推測の優先順）

## 文章品質の基準
- 「content」（援助内容）は40〜60文字で具体的な手順・方法を記述
- 「note」（留意事項）は40〜60文字でその利用者固有の注意点を記述
- 一般的・テンプレート的な短い表現は不可（「転倒に注意」「異変時は連絡」等の定型文だけでは不十分）
- アセスメントの記載をもとに、個別性のある内容にすること

## 用語の正確性
- 福祉用具名は正式名称を使用（リハビリパンツ、ロフストランドクラッチ等）
- 排泄用品名はアセスメント記載通り（勝手に「おむつ」に統一しない）
- 疾患名・障害名は正式名称を使用

## 運営指導チェックポイント
- アセスメント→計画の整合性（計画の各項目がアセスメントのどこに根拠があるか）
- 計画→実績の整合性（計画のサービス種別が実績と一致するか）
- 他サービスとの役割分担（居宅介護の範囲を逸脱していないか）
- 予定表とサービス内容の連動（曜日・時間帯が実績と一致するか）
- 用語の正確性（アセスメントと計画で用語が統一されているか）
- 個別性の確保（テンプレートの使い回しではなく利用者固有の計画か）`;

// ==================== ユーティリティ ====================
function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function toReiwa(year: number): number {
  return year - 2018;
}

function setWrapText(cell: ExcelJS.Cell) {
  cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'top' };
}

// ==================== 型定義 ====================
interface ServiceStep {
  item: string;
  content: string;
  note: string;
}

/** 新フォーマット: サービス枠ごとに種別・ラベル・ステップを持つ */
interface ServiceBlock {
  service_type: string;
  visit_label: string;
  steps: ServiceStep[];
}

/** 旧フォーマット互換用 */
interface ServiceStepBack {
  item: string;
  content: string;
  note: string;
}

/** 正規化後の計画データ */
interface CarePlan {
  user_wish: string;
  family_wish: string;
  goal_long: string;
  goal_short: string;
  needs: string;
  schedule_remarks: string;
  service1: ServiceBlock | null;
  service2: ServiceBlock | null;
  service3: ServiceBlock | null;
  service4: ServiceBlock | null;
}

/** AI出力の生JSONを正規化（旧フォーマット・新フォーマット両対応） */
function normalizeCarePlan(raw: Record<string, unknown>): CarePlan {
  const plan: CarePlan = {
    user_wish: (raw.user_wish as string) || '',
    family_wish: (raw.family_wish as string) || '',
    goal_long: (raw.goal_long as string) || '',
    goal_short: (raw.goal_short as string) || '',
    needs: (raw.needs as string) || '',
    schedule_remarks: (raw.schedule_remarks as string) || '',
    service1: null,
    service2: null,
    service3: null,
    service4: null,
  };

  const serviceKeys = ['service1', 'service2', 'service3', 'service4'] as const;
  for (const key of serviceKeys) {
    const oldKey = `${key}_steps`;

    if (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
      // 新フォーマット: { service_type, visit_label, steps }
      const block = raw[key] as Record<string, unknown>;
      const steps = Array.isArray(block.steps) ? block.steps as ServiceStep[] : [];
      if (steps.length > 0) {
        plan[key] = {
          service_type: (block.service_type as string) || '',
          visit_label: (block.visit_label as string) || '',
          steps,
        };
      }
    } else if (Array.isArray(raw[oldKey])) {
      // 旧フォーマット: service1_steps: [...]
      const steps = raw[oldKey] as ServiceStep[];
      if (steps.length > 0) {
        plan[key] = {
          service_type: '',
          visit_label: '',
          steps,
        };
      }
    }
  }

  return plan;
}

// ==================== スケジュール（実績表ベース） ====================
const DAY_TO_COL: Record<string, string> = {
  '月': 'D', '火': 'E', '水': 'F', '木': 'G', '金': 'H', '土': 'I', '日': 'J',
};
const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/** サービスコードからサービス種別名に変換（空白を除去して判定） */
function serviceCodeToLabel(code: string): string {
  if (!code) return '';
  const c = code.replace(/\s+/g, ''); // 空白除去（"身 体" → "身体"）
  if (c.includes('身体') || /^11[12]/.test(c)) return '身体介護';
  if (c.includes('生活') || c.includes('家事') || /^12[12]/.test(c)) return '家事援助';
  if (c.includes('重度') || /^14/.test(c)) return '重度訪問';
  if (c.includes('通院')) return '通院';
  if (c.includes('同行') || /^15/.test(c)) return '同行援護';
  if (c.includes('行動') || /^16/.test(c)) return '行動援護';
  // 不明なコードでもサービスとして描画する（コードの先頭4文字をラベルに使用）
  return c.length > 4 ? c.substring(0, 4) : c;
}

/** 列文字→列番号 */
function colToNum(col: string): number {
  return col.charCodeAt(0) - 64; // A=1, B=2, ..., K=11
}

/** 薄い罫線スタイル */
const thinBorder: Partial<ExcelJS.Border> = { style: 'thin' };

/** 時刻文字列(HH:MM)をExcelの行番号に変換。30分以降は次の行 */
function timeToRow(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  // Row21=0:00(上半分), Row22=0:00(下半分=0:30), Row23=1:00, ...
  return 21 + h * 2 + (m >= 30 ? 1 : 0);
}

/** 罫線を明示的に消すための hair スタイル（テンプレートの元の細線に戻す） */
const hairBorder: Partial<ExcelJS.Border> = { style: 'hair' };

/**
 * 実績表から週間ケアパターンを抽出して計画予定表に書き込む
 *
 * 仕様書に従い以下の順番で必ず実行:
 * STEP 1: 予定表エリアの全マージセルを解除
 * STEP 2: 全セルの値・罫線を完全リセット（罫線を空に）
 * STEP 3: サービスブロックだけ再描画（結合→罫線→ラベル）
 */
function fillScheduleFromBilling(ws: ExcelJS.Worksheet, records: BillingRecord[]) {
  const minCol = colToNum('D'); // 4
  const maxCol = colToNum('J'); // 10
  const minRow = 21;
  const maxRow = 68;

  // ========== STEP 1: 既存マージセルを解除 ==========
  // ExcelJSの_mergesはキー=セル参照(例:"D37")、値=mergeオブジェクト(model.top/left/bottom/right, range)
  const mergesObj = (ws as unknown as { _merges: Record<string, { model: { top: number; left: number; bottom: number; right: number }; range: string }> })._merges || {};
  const rangesToRemove: string[] = [];
  for (const key of Object.keys(mergesObj)) {
    const merge = mergesObj[key];
    if (!merge?.model) continue;
    const { top, left, bottom, right } = merge.model;
    // 予定表エリア（行21〜68, 列D=4〜J=10）に完全に含まれるマージのみ対象
    if (top >= minRow && bottom <= maxRow && left >= minCol && right <= maxCol) {
      rangesToRemove.push(merge.range); // 例: "D37:D40"
    }
  }
  console.log(`[CarePlan] STEP1: 予定表エリアのマージ解除 ${rangesToRemove.length}件`);
  for (const range of rangesToRemove) {
    try { ws.unMergeCells(range); } catch { /* skip */ }
  }

  // ========== STEP 2: 全セルの値をクリアし、罫線をテンプレートの元のhairに復元 ==========
  // テンプレートの予定表エリアは全セルがhair罫線で構成されている。
  // STEP1でunMergeCellsするとスレーブセルの罫線がundefinedに消えるため、
  // 全セルをhair罫線で統一的にリセットする必要がある。
  // テンプレートのパターン:
  //   Row21: top=thin (エリア上端), bottom=hair, left/right=hair (端は省略)
  //   Row22-65: top=hair, bottom=hair, left/right=hair (端は省略)
  //   Row66-68: top=hair, bottomなし (エリア下端)
  //   D列(col4): leftなし (エリア左端)
  //   J列(col10): rightなし (エリア右端)
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cell = ws.getCell(row, col);
      cell.value = null;
      cell.font = {};
      cell.alignment = {};
      cell.border = {
        top: row === minRow ? thinBorder : hairBorder,
        bottom: row >= 66 ? undefined : hairBorder,
        left: col === minCol ? undefined : hairBorder,
        right: col === maxCol ? undefined : hairBorder,
      };
    }
  }

  // ========== パターン集約 ==========
  // 実績レコードを「曜日 × 時間帯 × サービス種別」のユニークパターンに集約する。
  //
  // 重要な処理:
  // 1. endTime が startTime より小さい場合（日またぎ）→ endTime を 24:00 として扱う
  //    例: 18:00→00:00 は 18:00→24:00、18:00→02:00 は 18:00→24:00（予定表は23:30まで）
  // 2. startTime=00:00 のレコード（前日からの続き）→ そのレコードの曜日の0:00から描画
  //    例: 月曜 00:00→08:30 は月曜の0:00-8:30に表示
  // 3. 同一曜日・同一種別・同一時間帯は1つに集約（重複排除）

  const seen = new Set<string>();
  const patterns: { dayName: string; type: string; startRow: number; endRow: number }[] = [];

  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const label = serviceCodeToLabel(r.serviceCode);

    // ラベルが完全に空（コードが空の場合のみ）はスキップ
    if (!label) {
      console.log(`[CarePlan] スキップ（コード空）: ${dayName} ${r.startTime}-${r.endTime} コード="${r.serviceCode}"`);
      continue;
    }

    const startParts = r.startTime.split(':');
    const endParts = r.endTime.split(':');
    const startH = parseInt(startParts[0], 10);
    const startM = parseInt(startParts[1] || '0', 10);
    let endH = parseInt(endParts[0], 10);
    const endM = parseInt(endParts[1] || '0', 10);
    if (isNaN(startH) || isNaN(endH)) continue;

    // 日またぎ判定: endTime <= startTime の場合は翌日にまたがるため、24時として扱う
    // 例: 18:00→00:00 → endH=24, 23:00→00:00 → endH=24, 18:00→02:00 → endH=24+2=26(ただし予定表は24hまで)
    if (endH < startH || (endH === startH && endM <= startM) || (endH === 0 && endM === 0)) {
      // 日またぎ: endを24時以降に補正（予定表は最大24:00=row68まで）
      endH = endH === 0 && endM === 0 ? 24 : 24 + endH;
    }

    // 開始行: 30分刻み (Row21=0:00, Row22=0:30, Row23=1:00, ...)
    const sRow = 21 + startH * 2 + (startM >= 30 ? 1 : 0);
    // 終了行: endTimeの直前の30分枠
    let eRow: number;
    if (endH >= 24) {
      // 24時以降 → 予定表の最終行(68=23:30)まで
      eRow = maxRow;
    } else if (endM > 0) {
      eRow = 21 + endH * 2 + (endM >= 30 ? 1 : 0) - 1;
    } else {
      eRow = 21 + endH * 2 - 1;
    }

    const clampedStart = Math.max(sRow, minRow);
    const clampedEnd = Math.min(eRow, maxRow);
    if (clampedStart > clampedEnd) continue;

    // 重複排除（同一曜日・同一行範囲・同一ラベル）
    const key = `${dayName}_${clampedStart}_${clampedEnd}_${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    patterns.push({ dayName, type: label, startRow: clampedStart, endRow: clampedEnd });
  }

  // ========== 隣接・重複パターンのマージ ==========
  // 同じ曜日・同じサービス種別で、連続する時間帯（endRow+1 === 次のstartRow）を結合
  // 例: 火曜 重度 Row67-68 + 水曜 重度 Row21-37 → これは別曜日なので結合しない
  // 例: 月曜 家事 Row53-55 + 月曜 家事 Row55-57 → Row53-57に結合
  patterns.sort((a, b) => {
    if (a.dayName !== b.dayName) return WEEKDAY_NAMES.indexOf(a.dayName) - WEEKDAY_NAMES.indexOf(b.dayName);
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.startRow - b.startRow;
  });

  const merged: typeof patterns = [];
  for (const p of patterns) {
    const last = merged[merged.length - 1];
    if (last && last.dayName === p.dayName && last.type === p.type && last.endRow + 1 >= p.startRow) {
      // 隣接 or 重複 → マージ（endRowを大きい方に拡張）
      last.endRow = Math.max(last.endRow, p.endRow);
    } else {
      merged.push({ ...p });
    }
  }

  console.log(`[CarePlan] 計画予定表パターン: ${patterns.length}件 → マージ後: ${merged.length}件`);
  for (const p of merged) {
    const startTime = `${Math.floor((p.startRow - 21) / 2)}:${(p.startRow - 21) % 2 === 0 ? '00' : '30'}`;
    const endTime = `${Math.floor((p.endRow - 21 + 1) / 2)}:${(p.endRow - 21 + 1) % 2 === 0 ? '00' : '30'}`;
    console.log(`  ${p.dayName} ${startTime}-${endTime} ${p.type} (Row${p.startRow}-${p.endRow})`);
  }

  // 同じ曜日列で異なるサービスが重なる場合の警告（重なりがあっても描画はする）
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i], b = merged[j];
      if (a.dayName === b.dayName && a.startRow <= b.endRow && b.startRow <= a.endRow) {
        console.warn(`[CarePlan] ⚠ 重なり検出: ${a.dayName} ${a.type}(Row${a.startRow}-${a.endRow}) と ${b.type}(Row${b.startRow}-${b.endRow})`);
      }
    }
  }

  // ========== STEP 3: サービスブロック再描画 ==========
  // 重要: ExcelJSではthin罫線を使うと隣接セルにも伝播して太い黒線が出る。
  // サービスブロックの罫線はhairのまま（テンプレートと同じ細さ）にして、
  // 結合セルの値とフォントでブロックを視覚的に区別する。
  const planFont: Partial<ExcelJS.Font> = { name: 'HG正楷書体-PRO', size: 12 };

  for (const p of merged) {
    const col = DAY_TO_COL[p.dayName];
    if (!col) continue;
    const colNum = colToNum(col);

    // セル結合（2行以上の場合のみ結合、1行の場合は単一セルに書き込み）
    if (p.endRow > p.startRow) {
      ws.mergeCells(p.startRow, colNum, p.endRow, colNum);
    }

    // マスターセル（結合の先頭 or 単一セル）にラベル・スタイル・罫線を設定
    // 罫線はhair（テンプレートの元の細線と同じ）→ 太い黒線は出ない
    const cell = ws.getCell(`${col}${p.startRow}`);
    cell.value = p.type;
    cell.font = planFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const isLeftEdge = (colNum === minCol);
    const isRightEdge = (colNum === maxCol);
    cell.border = {
      top: hairBorder,
      bottom: hairBorder,
      left: isLeftEdge ? undefined : hairBorder,
      right: isRightEdge ? undefined : hairBorder,
    };
  }
}

/**
 * 実績表から曜日別サマリーテキスト生成（AIプロンプト用）
 */
function buildBillingSummary(records: BillingRecord[]): string {
  const byDay = new Map<string, string[]>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    if (!byDay.has(dayName)) byDay.set(dayName, []);
    const label = serviceCodeToLabel(r.serviceCode) || r.serviceCode || '不明';
    byDay.get(dayName)!.push(`${r.startTime}~${r.endTime} ${label}`);
  }
  const dayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  const lines: string[] = [];
  for (const day of dayOrder) {
    const entries = byDay.get(day);
    if (!entries) continue;
    const countMap = new Map<string, number>();
    for (const e of entries) countMap.set(e, (countMap.get(e) || 0) + 1);
    const details = [...countMap.entries()].map(([e, c]) => `${e}(${c}回)`).join(', ');
    lines.push(`${day}曜: ${details}`);
  }
  if (lines.length === 0) return '実績データなし';

  // 時間帯パターン集計: 全曜日から「開始時刻〜終了時刻」のユニークパターンを抽出
  const timePatterns = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime) continue;
    timePatterns.add(`${r.startTime}〜${r.endTime}`);
  }
  const patternList = [...timePatterns];
  const patternText = patternList.map((p, i) => `パターン${i + 1}: ${p}`).join('、');
  lines.push('');
  lines.push(`【時間帯パターン判定結果】全${patternList.length}パターン（${patternText}）`);
  lines.push(`→ サービス内容ブロック数は${patternList.length}つにすること（これと異なる数のブロックを生成してはいけない）`);

  return lines.join('\n');
}

/** 実績表からサービス種別一覧を取得 */
function getServiceTypesFromBilling(records: BillingRecord[]): string[] {
  const types = new Set<string>();
  for (const r of records) {
    const label = serviceCodeToLabel(r.serviceCode);
    if (label) types.add(label);
  }
  return [...types];
}

// ==================== 契約支給量 ====================
function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string): string {
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

function getSupplyHours(supplyAmounts: ShogaiSupplyAmount[], clientId: string): Record<string, string> {
  const result: Record<string, string> = {};
  const clientSupply = supplyAmounts.filter(s => s.careClientId === clientId);
  for (const s of clientSupply) {
    const cat = s.serviceCategory || s.serviceContent || '';
    result[cat] = s.supplyAmount || '';
  }
  return result;
}

// ==================== チェックボックス ====================
function checkService(
  keys: string[],
  supplyH: Record<string, string>,
  serviceTypes: string[],
): { checked: boolean; hours: string } {
  for (const k of keys) {
    for (const [cat, amt] of Object.entries(supplyH)) {
      if (cat.includes(k)) return { checked: true, hours: amt };
    }
  }
  for (const k of keys) {
    for (const st of serviceTypes) {
      if (st.includes(k)) return { checked: true, hours: '' };
    }
  }
  return { checked: false, hours: '' };
}

function checkboxText(label: string, check: { checked: boolean; hours: string }): string {
  if (check.checked) {
    return check.hours ? `■${label}　${check.hours}時間` : `■${label}　　時間`;
  }
  return `□${label}　　時間`;
}

function checkboxTextBack(label: string, checked: boolean): string {
  return checked ? `■${label}` : `□${label}`;
}

// ==================== サービス枠ごとのチェックフラグ ====================
interface CheckFlags {
  body: boolean;
  house: boolean;
  heavy: boolean;
  visitBody: boolean;
  visitNoBody: boolean;
  ride: boolean;
  behavior: boolean;
  accompany: boolean;
}

/** サービス種別文字列からチェックフラグを生成（該当する種別のみ■） */
function serviceTypeToCheckFlags(serviceType: string): CheckFlags {
  const flags: CheckFlags = {
    body: false, house: false, heavy: false,
    visitBody: false, visitNoBody: false,
    ride: false, behavior: false, accompany: false,
  };
  if (!serviceType) return flags;

  const st = serviceType.replace(/\s+/g, '');
  if (st.includes('身体介護') || st.includes('身体')) flags.body = true;
  if (st.includes('家事援助') || st.includes('家事') || st.includes('生活援助') || st.includes('生活')) flags.house = true;
  if (st.includes('重度訪問') || st.includes('重度')) flags.heavy = true;
  if (st.includes('通院') && st.includes('伴う')) flags.visitBody = true;
  if (st.includes('通院') && st.includes('伴わない')) flags.visitNoBody = true;
  if (st.includes('通院') && !st.includes('伴う') && !st.includes('伴わない')) flags.visitBody = true; // 通院等介助はデフォルト身体あり
  if (st.includes('乗降')) flags.ride = true;
  if (st.includes('同行')) flags.accompany = true;
  if (st.includes('行動')) flags.behavior = true;

  return flags;
}

// ==================== バリデーション ====================
interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/** AI出力のバリデーション */
function validateCarePlan(plan: CarePlan): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 必須フィールドチェック
  if (!plan.user_wish) errors.push('本人の希望が空です');
  if (!plan.family_wish) errors.push('家族の希望が空です');
  if (!plan.goal_long) errors.push('長期目標が空です');
  if (!plan.goal_short) errors.push('短期目標が空です');

  // 文字数チェック（最低文字数）
  if (plan.user_wish && plan.user_wish.length < 10) warnings.push(`本人の希望が短すぎます（${plan.user_wish.length}文字）`);
  if (plan.family_wish && plan.family_wish.length < 10) warnings.push(`家族の希望が短すぎます（${plan.family_wish.length}文字）`);
  if (plan.goal_long && plan.goal_long.length < 15) warnings.push(`長期目標が短すぎます（${plan.goal_long.length}文字）`);
  if (plan.goal_short && plan.goal_short.length < 15) warnings.push(`短期目標が短すぎます（${plan.goal_short.length}文字）`);

  // service1は必須（最低1つの時間帯パターンが存在するため）
  if (!plan.service1 || plan.service1.steps.length === 0) {
    errors.push('サービス1の援助項目がありません。AIの出力を確認してください。');
  }

  // 各サービス枠のステップ数チェック
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (service && service.steps.length > 0) {
      if (service.steps.length < 5) {
        warnings.push(`サービス${i}の援助項目が少なすぎます（${service.steps.length}件、推奨5〜8件）`);
      }
      // 各ステップの内容チェック
      for (let j = 0; j < service.steps.length; j++) {
        const step = service.steps[j];
        if (!step.item) warnings.push(`サービス${i}のステップ${j + 1}: 援助項目名が空です`);
        if (!step.content) warnings.push(`サービス${i}のステップ${j + 1}: 援助内容が空です`);
        if (step.content && step.content.length < 10) warnings.push(`サービス${i}のステップ${j + 1}: 援助内容が短すぎます（${step.content.length}文字）`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ==================== メイン生成関数 ====================
export async function generate(ctx: GeneratorContext): Promise<void> {
  const { careClients, billingRecords, supplyAmounts, year, month, officeInfo, customPrompt, customSystemInstruction, selectedClient } = ctx;

  const client: CareClient = selectedClient || careClients[0];
  if (!client) throw new Error('利用者が選択されていません');

  // テンプレート読み込み
  const response = await fetch('/templates/kyotaku_kaigo_keikaku.xlsx');
  if (!response.ok) throw new Error('テンプレートファイルの取得に失敗しました');
  const buffer = await response.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const promptTemplate = customPrompt || DEFAULT_PROMPT;
  const systemInstruction = customSystemInstruction || DEFAULT_SYSTEM_INSTRUCTION;

  // === 実績表データ取得 ===
  let clientRecords = billingRecords.filter(r => r.clientName === client.name);
  console.log(`[CarePlan] 利用者: ${client.name}, 実績件数: ${clientRecords.length}/${billingRecords.length}`);

  // billingRecordsが空またはこの利用者の実績がない場合、直接ロード
  if (clientRecords.length === 0) {
    console.log(`[CarePlan] 実績なし → 直接ロード (${year}年${month}月)`);
    try {
      const loaded = await loadBillingRecordsForMonth(year, month);
      clientRecords = loaded.filter(r => r.clientName === client.name);
      console.log(`[CarePlan] 直接ロード結果: ${clientRecords.length}/${loaded.length}件`);
    } catch (e) {
      console.warn(`[CarePlan] 実績ロード失敗:`, e);
    }
  }

  // 当月になければ最大6ヶ月遡って直近の実績がある月を探す
  if (clientRecords.length === 0) {
    let searchYear = year;
    let searchMonth = month;
    for (let i = 0; i < 6; i++) {
      searchMonth--;
      if (searchMonth === 0) { searchMonth = 12; searchYear--; }
      console.log(`[CarePlan] 実績検索: ${searchYear}年${searchMonth}月`);
      try {
        const prevRecords = await loadBillingRecordsForMonth(searchYear, searchMonth);
        clientRecords = prevRecords.filter(r => r.clientName === client.name);
        if (clientRecords.length > 0) {
          console.log(`[CarePlan] ${searchYear}年${searchMonth}月に実績発見: ${clientRecords.length}件`);
          break;
        }
      } catch { /* skip */ }
    }
  }

  if (clientRecords.length > 0) {
    console.log(`[CarePlan] 実績例:`, clientRecords.slice(0, 3).map(r => `${r.serviceDate} ${r.startTime}-${r.endTime} ${r.serviceCode}`));
  } else {
    console.warn(`[CarePlan] 実績データが見つかりません（6ヶ月遡って検索済み）`);
  }

  const serviceTypes = getServiceTypesFromBilling(clientRecords);
  const totalVisits = clientRecords.length;
  const billingSummary = buildBillingSummary(clientRecords);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id);
  const supplyHours = getSupplyHours(supplyAmounts, client.id);
  console.log(`[CarePlan] サービス種別: ${serviceTypes.join(', ')}, 契約支給量: ${JSON.stringify(supplyHours)}`);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter(d => d.fileUrl).slice(0, 3).map(d => d.fileUrl);
  } catch { /* skip */ }

  // テンプレート変数
  const templateVars: Record<string, string> = {
    client_name: client.name,
    client_gender: client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : '不明',
    client_birthDate: client.birthDate || '不明',
    client_address: client.address || '不明',
    client_careLevel: client.careLevel || '不明',
    service_types: serviceTypes.join(', ') || '不明',
    total_visits: String(totalVisits),
    contract_start: client.contractStart || '不明',
    year: String(year),
    month: String(month),
    billing_summary: billingSummary,
    supply_amounts: supplyText,
    assessment_note: assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容（利用者の心身状態・ADL・IADL・生活環境・介護者の状況等）を必ず読み取り、それに基づいて援助目標・サービス内容・留意事項を具体的に作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、一般的な訪問介護計画を作成してください。',
  };

  const prompt = applyTemplate(promptTemplate, templateVars);

  // AI生成
  const res = assessmentFileUrls.length > 0
    ? await generateWithFiles(prompt, assessmentFileUrls, systemInstruction)
    : await generateText(prompt, systemInstruction);

  if (res.error) throw new Error(`AI生成エラー: ${res.error}`);
  if (!res.text) throw new Error('AIからの応答が空です。');

  const jsonMatch = res.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`JSON抽出失敗: ${res.text.substring(0, 200)}`);

  let rawJson: Record<string, unknown>;
  try {
    rawJson = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error(`JSON解析失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 新旧フォーマット両対応で正規化
  const plan = normalizeCarePlan(rawJson);

  console.log(`[CarePlan] AI応答 - service1: ${plan.service1?.steps.length || 0}件 (${plan.service1?.service_type || '未判定'}), service2: ${plan.service2?.steps.length || 0}件 (${plan.service2?.service_type || '未判定'})`);
  console.log(`[CarePlan] AI応答全文（先頭500文字）:`, res.text.substring(0, 500));
  if (plan.service1?.steps.length) console.log(`[CarePlan] service1例:`, plan.service1.steps[0]);
  if (plan.service2?.steps.length) console.log(`[CarePlan] service2例:`, plan.service2.steps[0]);

  // バリデーション（フォールバック廃止 → エラー通知）
  const validation = validateCarePlan(plan);
  if (validation.warnings.length > 0) {
    console.warn(`[CarePlan] バリデーション警告:`, validation.warnings);
  }
  if (!validation.valid) {
    const errorMsg = validation.errors.join('\n');
    console.error(`[CarePlan] バリデーションエラー:`, validation.errors);
    throw new Error(`居宅介護計画書の生成内容に不備があります。アセスメントデータや実績データを確認してください。\n\n${errorMsg}`);
  }

  // ==============================
  // Sheet 0: 居宅介護計画書（表）
  // ==============================
  const ws0 = workbook.worksheets[0];
  if (!ws0) throw new Error('Sheet0が見つかりません');

  // 作成日 = 契約開始日
  let planDateText: string;
  if (client.contractStart) {
    const p = client.contractStart.split('-');
    if (p.length === 3) {
      planDateText = `令和${toReiwa(Number(p[0]))}年${Number(p[1])}月${Number(p[2])}日`;
    } else {
      planDateText = `令和${toReiwa(year)}年${month}月1日`;
    }
  } else {
    planDateText = `令和${toReiwa(year)}年${month}月1日`;
  }

  ws0.getCell('H3').value = planDateText;
  ws0.getCell('K3').value = officeInfo.serviceManager || '未設定';
  ws0.getCell('A5').value = `${client.name}　様`;
  ws0.getCell('E5').value = client.birthDate || '';
  // G5:J6 が結合セル（郵便番号＋住所）
  const addressText = (client.postalCode ? `〒${client.postalCode}\n` : '') + (client.address || '');
  const addrCell = ws0.getCell('G5');
  addrCell.value = addressText;
  setWrapText(addrCell);
  ws0.getCell('K5').value = client.phone ? `TEL：${client.phone}` : '';
  ws0.getCell('K6').value = client.mobilePhone ? `FAX：${client.mobilePhone}` : '';

  // 本人(家族)の希望 — AIが短い文を返した場合は補足文を追加して2〜3行にする
  const DEFAULT_USER_WISH = '身体機能の低下はあるが、住み慣れた自宅での生活を続けたい。日常の家事や身の回りのことは手伝ってもらいながら、できることは自分でやっていきたい。';
  const DEFAULT_FAMILY_WISH = '本人が安全に自宅で生活できるよう、日常生活の支援をお願いしたい。転倒や体調変化が心配なので、定期的な見守りと適切な介助をしていただきたい。';
  const USER_WISH_SUPPLEMENT = 'できる限り自分の力で日常生活を送りながら、必要な支援を受けて安心して暮らしていきたい。';
  const FAMILY_WISH_SUPPLEMENT = '日常生活の中での安全確保と、本人の意思を尊重した適切な支援をお願いしたい。';
  const MIN_WISH_LENGTH = 40;

  let userWishText = plan.user_wish || DEFAULT_USER_WISH;
  if (userWishText.length < MIN_WISH_LENGTH) {
    userWishText = `${userWishText}${USER_WISH_SUPPLEMENT}`;
  }
  let familyWishText = plan.family_wish || DEFAULT_FAMILY_WISH;
  if (familyWishText.length < MIN_WISH_LENGTH) {
    familyWishText = `${familyWishText}${FAMILY_WISH_SUPPLEMENT}`;
  }

  const wishCell8 = ws0.getCell('E8');
  wishCell8.value = userWishText;
  setWrapText(wishCell8);
  const wishCell9 = ws0.getCell('E9');
  wishCell9.value = familyWishText;
  setWrapText(wishCell9);

  // 援助目標 — 同様にAIが短い場合は補足
  // 期間テキスト（「（1年間）」「（6ヶ月）」「（○月まで）」「（○日まで）」等）を除去する関数
  function stripPeriodText(text: string): string {
    // 括弧で囲まれた期間表現を除去
    return text
      .replace(/[（(][^）)]*(?:年間|ヶ月|か月|カ月|月まで|日まで|年まで|年|月|期間)[^）)]*[）)]/g, '')
      .replace(/\s+$/, '');
  }

  const DEFAULT_GOAL_LONG = '必要な介護サービスを利用しながら、住み慣れた自宅での安定した日常生活を継続する';
  const DEFAULT_GOAL_SHORT = '定期的な支援を受けながら、日常生活動作の維持・向上を図り、安全に生活できる環境を整える';
  const MIN_GOAL_LENGTH = 30;

  let goalLongText = stripPeriodText(plan.goal_long || DEFAULT_GOAL_LONG);
  if (goalLongText.length < MIN_GOAL_LENGTH) {
    goalLongText = `${goalLongText}（介護サービスを活用しながら在宅生活を継続する）`;
  }
  let goalShortText = stripPeriodText(plan.goal_short || DEFAULT_GOAL_SHORT);
  if (goalShortText.length < MIN_GOAL_LENGTH) {
    goalShortText = `${goalShortText}（安全な生活環境を整え、日常動作の維持を図る）`;
  }

  const goalCell12 = ws0.getCell('E12');
  goalCell12.value = `長期: ${goalLongText}`;
  setWrapText(goalCell12);
  const goalCell13 = ws0.getCell('E13');
  goalCell13.value = `短期: ${goalShortText}`;
  setWrapText(goalCell13);
  const goalCell14 = ws0.getCell('E14');
  goalCell14.value = plan.needs ? `課題: ${plan.needs}` : '';
  setWrapText(goalCell14);

  // サービス内容チェックボックス
  const bodyCheck = checkService(['身体介護', '身体'], supplyHours, serviceTypes);
  const houseCheck = checkService(['家事援助', '家事'], supplyHours, serviceTypes);
  const heavyCheck = checkService(['重度訪問', '重度'], supplyHours, serviceTypes);
  const visitWithBody = checkService(['通院等介助(身体介護を伴う)', '通院介助（身体あり）'], supplyHours, serviceTypes);
  const visitWithoutBody = checkService(['通院等介助(身体介護を伴わない)', '通院介助（身体なし）'], supplyHours, serviceTypes);
  const rideCheck = checkService(['通院等乗降', '乗降'], supplyHours, serviceTypes);
  const accompanyCheck = checkService(['同行援護', '同行'], supplyHours, serviceTypes);
  const behaviorCheck = checkService(['行動援護', '行動'], supplyHours, serviceTypes);

  ws0.getCell('D16').value = checkboxText('身体介護', bodyCheck);
  ws0.getCell('G16').value = checkboxText('家事援助', houseCheck);
  ws0.getCell('J16').value = checkboxText('重度訪問介護', heavyCheck);
  ws0.getCell('D17').value = checkboxText('通院等介助(身体介護を伴う)', visitWithBody);
  ws0.getCell('G17').value = checkboxText('通院等介助(身体介護を伴わない)', visitWithoutBody);
  ws0.getCell('J17').value = checkboxText('通院等乗降介助', rideCheck);
  ws0.getCell('D18').value = checkboxText('同行援護', accompanyCheck);
  ws0.getCell('G18').value = checkboxText('行動援護', behaviorCheck);

  // 計画予定表（実績表ベース）
  console.log(`[CarePlan] 計画予定表書き込み - 実績件数: ${clientRecords.length}`);
  fillScheduleFromBilling(ws0, clientRecords);

  // 備考欄
  if (plan.schedule_remarks) {
    const remarkCell = ws0.getCell('K21');
    remarkCell.value = plan.schedule_remarks;
    setWrapText(remarkCell);
  }

  // ==============================
  // サービス内容セクション（テンプレートの固定位置に書き込み）
  // サービス1: Row76-83 (data), Row84-86 (checkboxes)
  // サービス2: Row89-96 (data), Row97-99 (checkboxes)
  // サービス3: Row102-109 (data), Row110-112 (checkboxes)
  // サービス4: Row115-122 (data), Row123-125 (checkboxes)
  // ==============================

  // サービスブロック定義（テンプレートの固定行位置）
  const serviceBlocks = [
    { dataStartRow: 76, dataEndRow: 83, chkStartRow: 84 }, // サービス1
    { dataStartRow: 89, dataEndRow: 96, chkStartRow: 97 }, // サービス2
    { dataStartRow: 102, dataEndRow: 109, chkStartRow: 110 }, // サービス3
    { dataStartRow: 115, dataEndRow: 122, chkStartRow: 123 }, // サービス4
  ];

  const allServices: (ServiceBlock | null)[] = [
    plan.service1,
    plan.service2,
    plan.service3,
    plan.service4,
  ];

  // 表面チェックボックス用のグローバルフラグ（従来と同じ: 契約支給量・実績から判定）
  const globalCheckFlags: CheckFlags = {
    body: bodyCheck.checked, house: houseCheck.checked, heavy: heavyCheck.checked,
    visitBody: visitWithBody.checked, visitNoBody: visitWithoutBody.checked,
    ride: rideCheck.checked, behavior: behaviorCheck.checked, accompany: accompanyCheck.checked,
  };

  for (let blockIdx = 0; blockIdx < serviceBlocks.length; blockIdx++) {
    const block = serviceBlocks[blockIdx];
    const service = allServices[blockIdx];
    const steps = service?.steps || [];
    const maxRows = block.dataEndRow - block.dataStartRow + 1; // 8 rows

    console.log(`[CarePlan] サービス${blockIdx + 1}: ${steps.length}件 (${service?.service_type || '未使用'}) → Row${block.dataStartRow}-${block.dataEndRow}`);

    // データ行に書き込み（テンプレートのセル結合済み: B:E, F:I, J:L）
    for (let i = 0; i < maxRows; i++) {
      const row = block.dataStartRow + i;
      if (i < steps.length) {
        const bCell = ws0.getCell(`B${row}`);
        bCell.value = steps[i].item || '';
        setWrapText(bCell);
        const fCell = ws0.getCell(`F${row}`);
        fCell.value = steps[i].content || '';
        setWrapText(fCell);
        const jCell = ws0.getCell(`J${row}`);
        jCell.value = steps[i].note || '';
        setWrapText(jCell);
      }
    }

    // チェックボックス行: サービス枠ごとに個別判定
    // service_typeがある場合はそれに基づく、なければグローバルフラグを使用
    const blockFlags = (service?.service_type)
      ? serviceTypeToCheckFlags(service.service_type)
      : globalCheckFlags;

    const chk = block.chkStartRow;
    ws0.getCell(`B${chk}`).value = checkboxTextBack('身体介護', blockFlags.body);
    ws0.getCell(`F${chk}`).value = checkboxTextBack('家事援助', blockFlags.house);
    ws0.getCell(`H${chk}`).value = checkboxTextBack('重度訪問介護', blockFlags.heavy);

    ws0.getCell(`B${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', blockFlags.visitBody);
    ws0.getCell(`F${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', blockFlags.visitNoBody);

    ws0.getCell(`B${chk + 2}`).value = checkboxTextBack('通院等乗降介助', blockFlags.ride);
    ws0.getCell(`F${chk + 2}`).value = checkboxTextBack('行動援護', blockFlags.behavior);
    ws0.getCell(`H${chk + 2}`).value = checkboxTextBack('同行援護', blockFlags.accompany);
  }

  // ダウンロード
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outputBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `居宅介護計画書_${client.name}_${year}年${month}月.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
