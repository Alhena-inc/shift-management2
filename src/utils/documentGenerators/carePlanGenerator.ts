import ExcelJS from 'exceljs';
import { generateWithFiles, generateText } from '../../services/geminiService';
import { loadShogaiDocuments, loadShogaiCarePlanDocuments, loadBillingRecordsForMonth, uploadCarePlanFile, saveShogaiCarePlanDocument, loadGoalPeriods } from '../../services/dataService';
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

### 1a. 以下のADL身体介護項目は、アセスメントで明確に「一部介助」「全介助」と判定されている場合のみ生成すること
- 食事介助: アセスメントの食事項目に「一部介助」「全介助」の記載がある場合のみ。「自立」「見守り」の場合は含めない
- 更衣介助: アセスメントの更衣項目に介助が必要との記載がある場合のみ。チェックなし・「自立」の場合は含めない
- 排泄介助: アセスメントの排泄項目に介助が必要との記載がある場合のみ。チェックなし・「自立」の場合は含めない
- 入浴介助: アセスメントの入浴項目に介助が必要との記載がある場合のみ。チェックなし・「自立」の場合は含めない
- 服薬管理/服薬確認: 居宅介護で服薬管理を担当する場合のみ。訪問看護が服薬管理を担当している場合は絶対に含めない
★上記5項目が「自立」レベルの場合や、他事業所（訪問看護・デイサービス等）が担当の場合は、身体介護ブロックに含めてはいけない。

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
■ セクション②：サービス内容（最重要：枠数の決定方法）
═══════════════════════════════════════════════════

### 枠数決定の基本ルール（最重要）
サービス内容の枠は、週間予定表に存在するサービス種別ごとに1枠ずつ作成すること。
【サービス種別判定結果】に記載された種別数 ＝ サービス内容ブロック数。

例：
- 家事援助が存在する → サービス枠を1つ作成（service_type="家事援助"）
- 身体介護が存在する → サービス枠を1つ作成（service_type="身体介護"）
- 重度訪問介護が存在する → サービス枠を1つ作成（service_type="重度訪問介護"）
- 家事援助＋身体介護の両方が存在する → サービス枠は2つ

★同じ種別で時間帯が複数あっても、1つの枠にまとめること。

### 各枠の援助項目の記載内容（混在禁止）

各サービス種別の枠には、そのサービス種別に該当する援助項目のみを記載すること。

■ 家事援助の枠に記載する項目：
  調理・配膳・片付け・掃除・洗濯・買い物・環境整備・ゴミ処理 など

■ 身体介護の枠に記載する項目：
  服薬確認・更衣介助・整容介助・排泄介助・入浴介助・移乗介助・
  体調確認・就寝準備・食事介助・口腔ケア・食事見守り など

■ 重度訪問介護の枠に記載する項目：
  上記身体介護に加え、長時間の見守り・行動障害への対応・
  外出時の全般的支援 など（身体介護と家事援助の混在OK）

■ 通院等介助（身体介護を伴う）の枠に記載する項目：
  通院時の移動介助・乗降介助・院内での介助 など

■ 通院等介助（身体介護を伴わない）の枠に記載する項目：
  通院の付き添い・見守り など

### 絶対禁止事項
- ❌ 身体介護の枠に家事援助の内容（掃除・洗濯・調理等）を含めること
- ❌ 家事援助の枠に身体介護の内容（排泄介助・入浴介助・服薬確認等）を含めること
- ❌ 1つの枠に複数の種別の援助項目を混在させること（重度訪問介護を除く）
- ❌ 【サービス種別判定結果】と異なる数の枠を生成すること
- ❌ 援助項目に「記録」「記録作成」「報告・記録」「報告」「申し送り」「状況報告」を含めること（これらはヘルパーの内部事務であり利用者への援助ではない）

### 各ブロックの記載ルール
- そのサービス種別で実施するケアの手順を時系列で記載する
- ★重要：各ステップの「content」の先頭に、ケアを実施する具体的な時刻を記載すること
  - 時刻は週間予定表のそのサービス種別の開始時刻から振り分ける
  - 各ケアの所要時間を考慮して自然な時間配分にする
- ★重要：各ステップの「category」フィールドはそのブロックのservice_typeと一致させること
  - 身体介護ブロック → 全stepsのcategory = "身体介護"
  - 家事援助ブロック → 全stepsのcategory = "家事援助"

### ★★★ サービス内容欄の具体性ルール（最重要） ★★★
「援助項目」(item)は簡潔な項目名でよいが、「サービスの内容」(content)は何をするか一目で分かる具体的な動作表現にすること。
「留意事項」(note)はその利用者固有の状態・リスク・配慮点が分かる具体表現にすること。

■ 禁止する抽象表現（contentに使ってはいけない）：
  ❌ 「調理支援」→ ○ 「夕食の献立確認・食材の下準備・調理」
  ❌ 「掃除支援」→ ○ 「居室・トイレ等の清掃」
  ❌ 「見守り支援」→ ○ 「室内移動の見守り・声かけ」
  ❌ 「服薬確認」→ ○ 「服薬状況の見守り・声かけ確認」
  ❌ 「安全配慮」→ ○ 「居室内の安全確認・環境チェック」
  ❌ 「清潔保持」→ ○ 「衣類の洗濯・干し」

■ 禁止する抽象表現（noteに使ってはいけない）：
  ❌ 「安全に配慮」→ ○ 「足の震えによる転倒予防のため動線上の障害物を確認」
  ❌ 「体調に注意」→ ○ 「手の震えにより調理困難な場合がある」
  ❌ 「適宜対応」→ ○ 「意欲低下時は声かけで励まし支援」

■ 各ステップの具体性基準：
  - 「content」は時刻の後に具体的な介助方法・手順を記述する（40〜60文字）
  - 「note」はその利用者の個別状況に基づく留意点を記述する（40〜60文字）
  - アセスメント記載の具体的な状態像（麻痺の部位、震えの症状、福祉用具名等）を反映する

═══════════════════════════════════════════════════
■ 時間帯に応じた現実性ルール（絶対遵守）
═══════════════════════════════════════════════════
サービス内容は訪問時間帯に対して現実的でなければならない。
以下の時間帯ルールに従うこと。

### 夜間・深夜帯（21:00〜翌6:00）に許容する内容
- 体位変換、排泄介助、服薬確認、水分補給、睡眠前後の見守り、安全確認、体調確認、就寝準備
### 夜間・深夜帯に禁止する内容
- ❌ 買い物、外出、公園で遊ぶ、大掃除、洗濯干し
### 夕方〜夜帯（17:00〜21:00）に許容する内容
- 夕食準備・調理・配膳・片付け、服薬確認、就寝準備、入浴介助、更衣介助、整容、安全確認
### 日中帯（6:00〜17:00）に許容する内容
- 全般（アセスメントに根拠がある援助項目すべて）
### 全時間帯共通の禁止事項
- ❌ アセスメントに記載のない外出支援・余暇活動
- ❌ サービス種別に合わない内容（身体介護ブロックに掃除等、家事援助ブロックに排泄介助等）

═══════════════════════════════════════════════════
■ 生成手順（必ずこの順番で思考すること）
═══════════════════════════════════════════════════
1. 【シフト・実績情報】末尾の【サービス種別判定結果】を確認する。ここに記載された種別数・種別名が正解
2. アセスメントを網羅的に読み取り、介助・援助が必要な全項目をリストアップする
3. リストアップした全項目を、サービス種別に従って該当するブロックに振り分ける
   - 調理・掃除・洗濯・買い物等 → 家事援助ブロックへ
   - 服薬確認・排泄・入浴・移動・更衣等 → 身体介護ブロックへ
4. 種別数と同数のサービス内容ブロック（service1〜）を生成する
5. 生成後、以下を自己検証する：
   - ブロック数が【サービス種別判定結果】の種別数と一致しているか
   - 各ブロックのservice_typeが種別名と一致しているか
   - 各ブロックに他の種別の内容が混ざっていないか
   - アセスメントに記載のある援助項目がすべてサービス内容に含まれているか

═══════════════════════════════════════════════════

以下をJSON形式のみで出力（JSON以外不要、マークダウン記法不要）。

{
  "user_wish": "本人の希望（60〜120文字。2〜3行。主体的表現で具体的な生活場面を含む）",
  "family_wish": "家族の希望（60〜120文字。2〜3行。具体的な不安や要望を含む）",
  "goal_long": "長期目標（60〜100文字。具体的な到達点を記載。期間は書かない）",
  "goal_short": "短期目標（60〜100文字。具体的な到達点を記載。期間は書かない）",
  "needs": "解決すべき課題（60〜100文字。アセスメントに基づく具体的課題）",
  "schedule_remarks": "備考欄（0〜200文字。注意：他サービスの利用時間帯・曜日について具体的に記載する場合、上記の【シフト・実績情報】の計画予定表と矛盾しないことを必ず検証すること。例えば計画予定表に月〜金の日中にケアが入っている場合、同じ時間帯にデイサービスや学校に行っているという記載は矛盾になる。矛盾が生じる可能性がある場合はnullにして空欄にすること。矛盾が生じない確実な情報のみ記載する）",
  "service1": {
    "service_type": "身体介護 or 家事援助 or 重度訪問介護 等（このブロックの主たるサービス種別）",
    "visit_label": "月〜金 午前の身体介護 等（訪問パターンの説明）",
    "steps": [
      {"item": "援助項目名（15文字以内）", "content": "HH:MM 具体的な援助内容・手順（先頭に時刻を付けて40〜60文字）", "note": "この利用者固有の留意事項（40〜60文字）", "category": "身体介護 or 家事援助"}
    ]
  },
  "service2": {
    "service_type": "...",
    "visit_label": "...",
    "steps": [...]
  },
  "service3": null,
  "service4": null,
  "short_term_goal_months": 3,
  "long_term_goal_months": 6,
  "period_reasoning": "障害支援区分○、状態安定のため標準的な期間設定",
  "severity_level": "standard",
  "assessment_adl_summary": {
    "食事": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "排泄": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "入浴": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "更衣": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "移動": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "整容": "自立 or 見守り or 一部介助 or 全介助 or 他サービス担当",
    "服薬": "自己管理 or 居宅介護担当 or 訪問看護担当 or 他サービス担当"
  }
}

★assessment_adl_summaryはアセスメント資料がある場合のみ記入。ない場合はnullにする。
アセスメントの各ADL/IADL項目を読み取り、介助レベルを正確に判定すること。
チェックが入っていない項目・記載がない項目は「自立」として扱う。

【目標期間の判定基準】
short_term_goal_months / long_term_goal_months は以下の基準で設定すること:
- 標準ケース（severity_level: "standard"）: 障害支援区分3以下、状態安定 → 短期3ヶ月/長期6ヶ月
- 中間ケース（severity_level: "moderate"）: 障害支援区分4、重度要素が一部該当 → 短期2-3ヶ月/長期4-6ヶ月
- 重度・変動ケース（severity_level: "severe"）: 障害支援区分5-6、行動障害・医療的ケア・状態変動大・新規利用 → 短期1-2ヶ月/長期3-4ヶ月
period_reasoning には期間設定の根拠を具体的に記述すること（運営指導時の説明根拠として使用）。

【出力ルール】
1. ブロック数は【サービス種別判定結果】の種別数と厳密に一致させる。種別が1つならservice1のみ（service2〜4はnull）、2つならservice1とservice2のみ。
2. 各ブロックのservice_typeは【サービス種別判定結果】の種別名と一致させること。
3. ★各ブロックにはそのservice_typeに該当する援助項目のみ記載。混在禁止（重度訪問介護を除く）。
4. 各ブロックのstepsのcategoryは全てそのブロックのservice_typeと一致させること。
5. 使用するブロック（service1〜）のstepsは5〜8項目とする。
6. 各サービス枠のstepsは時系列順に並べる。
7. visit_labelは「月〜金 夕方の家事援助」「火・木・土 夜間の身体介護」等、曜日と時間帯とサービス種別を含める。
8. contentは具体的な手順を40文字以上で記述する。「〜の介助」だけの短い記述は不可。
9. noteはその利用者の個別状況に基づく留意点を40文字以上で記述する。
10. 不要なサービス枠は必ずnullにする。種別数以上のブロックを生成しない。`;

const DEFAULT_SYSTEM_INSTRUCTION = `あなたは日本の障害福祉サービス（居宅介護・重度訪問介護）における居宅介護計画書作成の専門家です。
運営指導（実地指導）で行政から指摘を受けない品質の計画書を作成してください。

## 基本姿勢
- 利用者のアセスメントデータを根拠とした計画を立てる
- データがない項目については推測で記載せず、「要確認」と明示する
- アセスメントデータなしでの計画書生成は本来認められない（システム側でブロック済み）

## 最重要ルール
- アセスメント資料がある場合: 内容を網羅的に読み取り、記載されている援助内容をすべて漏れなく計画に反映する。記載のない項目は生成しない。
- ★特に注意：アセスメントに調理・掃除・洗濯・買い物等の生活援助項目がある場合、身体介護と同様に必ずサービス内容に含めること。生活援助の見落としは不可。
- アセスメント資料がない場合: 実績データ・契約支給量から利用者に合ったサービス内容を作成。
- 他サービス事業所の担当内容は居宅介護計画に含めない。
- 使用するサービスブロック（service1〜）は必ず5件以上のstepsを持つこと。ブロック数は【サービス種別判定結果】の種別数と一致させ、各ブロックのservice_typeも種別名と一致させる。
- 必ず有効なJSON形式のみ出力。余計な説明文・マークダウン記法は不要。

## 書類作成ルール
- ニーズ・課題はアセスメントの内容から抽出すること
- 目標は具体的かつ測定可能な表現にすること（「安定した生活を送る」等の抽象的すぎる目標設定は不可、必ず具体化する）
- サービス内容は受給者証の支給決定内容と整合させること
- 受給者証の支給量を超えるサービス内容は記載しないこと

## 目標期間の設定ルール
アセスメントデータから利用者の障害支援区分、ADL状況、行動障害の程度、医療的ケアの有無、状態の安定性を総合的に判断し、目標期間を設定してください。

- 重度の利用者（区分5-6、行動障害が顕著、医療的ケア必要）は短期目標1-2ヶ月、長期目標3-4ヶ月に短縮
- 中間レベル（区分4、重度要素が一部該当）は短期目標2-3ヶ月、長期目標4-6ヶ月
- 標準ケース（区分3以下、状態安定）は短期目標3ヶ月、長期目標6ヶ月
- 新規利用者の初回計画は、状態把握のため短期目標を短め（1-2ヶ月）に設定

## サービス枠の分け方（最重要）
- 【サービス種別判定結果】に記載された種別ごとに1枠作成する
- 家事援助があれば家事援助枠を1つ、身体介護があれば身体介護枠を1つ作成
- ★最重要：各枠にはそのサービス種別の援助項目のみ記載。絶対に混ぜないこと
  - 家事援助枠：調理・配膳・片付け・掃除・洗濯・買い物・環境整備・ゴミ処理
  - 身体介護枠：服薬確認・更衣介助・整容介助・排泄介助・入浴介助・移乗介助・体調確認・食事介助・口腔ケア
  - 重度訪問介護枠：身体介護と家事援助の混在OK

## 文章品質の基準
- 「content」（援助内容）は先頭に「HH:MM 」形式の時刻を必ず付け、40〜60文字で具体的な手順・方法を記述
  - 例: "12:00 入室し、体調確認を行う。顔色・表情を観察し変化がないか確認する"
  - 時刻はパターンの開始時刻から開始し、各ケアの所要時間を考慮して自然に振り分ける
- 「note」（留意事項）は40〜60文字でその利用者固有の注意点を記述
- 一般的・テンプレート的な短い表現は不可（「転倒に注意」「異変時は連絡」等の定型文だけでは不十分）
- アセスメントの記載をもとに、個別性のある内容にすること

## 用語の正確性
- 福祉用具名は正式名称を使用（リハビリパンツ、ロフストランドクラッチ等）
- 排泄用品名はアセスメント記載通り（勝手に「おむつ」に統一しない）
- 疾患名・障害名は正式名称を使用

## 備考欄（schedule_remarks）のルール
- 備考欄に訪問曜日を記載する場合、計画予定表（シフト・実績情報のグリッド）に入力されている全曜日と一致させること。グリッドにサービスが入っている曜日が備考欄に漏れていてはいけない
- 備考欄に他サービス（デイサービス・支援学校・就労支援等）の利用時間帯・曜日を記載する場合、計画予定表と矛盾しないか必ず検証すること
- 計画予定表に居宅介護のケアが入っている時間帯に、同時に他サービスに行っているような記載は矛盾であり絶対に不可
- 矛盾が生じる可能性が少しでもある場合は、備考欄はnull（空欄）にすること
- 矛盾なく記載できる確実な情報（例：ケア時間帯外の生活パターン、家庭内ルール等）のみ記載する

## 禁止事項
- アセスメントデータなしでの根拠のない計画書生成
- 受給者証の支給量を超えるサービス内容の記載
- 抽象的すぎる目標設定（必ず具体化すること）
- テンプレートの使い回し（個別性のある計画を作成すること）

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
  cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'middle', horizontal: 'center' };
}

// ==================== 型定義 ====================
interface ServiceStep {
  item: string;
  content: string;
  note: string;
  /** ステップの種別（身体介護/家事援助）。Excel出力時にグルーピングに使用 */
  category?: string;
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
  // 目標期間メタデータ（AI判定）
  short_term_goal_months: number;
  long_term_goal_months: number;
  period_reasoning: string;
  severity_level: 'standard' | 'moderate' | 'severe';
}

/** AI出力の生JSONを正規化（旧フォーマット・新フォーマット両対応） */
function normalizeCarePlan(raw: Record<string, unknown>): CarePlan {
  // 目標期間メタデータの解析（デフォルト: 標準ケース）
  const shortTermMonths = typeof raw.short_term_goal_months === 'number' ? raw.short_term_goal_months : 3;
  const longTermMonths = typeof raw.long_term_goal_months === 'number' ? raw.long_term_goal_months : 6;
  const severityLevel = (['standard', 'moderate', 'severe'].includes(raw.severity_level as string))
    ? raw.severity_level as 'standard' | 'moderate' | 'severe'
    : 'standard';

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
    short_term_goal_months: shortTermMonths,
    long_term_goal_months: longTermMonths,
    period_reasoning: (raw.period_reasoning as string) || '',
    severity_level: severityLevel,
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

/** 時刻文字列(HH:MM)をExcelの行番号に変換（開始時刻用）。
 * テンプレートのレイアウト（0:00始まりの24時間）:
 *   Row21=0:00, Row22=0:30, Row23=1:00, Row24=1:30, ...
 *   Row37=8:00, Row38=8:30, Row39=9:00, Row40=9:30, ...
 *   Row57=18:00, Row58=18:30, Row59=19:00, Row60=19:30, ...
 *   Row67=23:00, Row68=23:30
 * 各時間2行（正時 + 30分）、0:00起点。
 */
function timeToRow(time: string): number {
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  // 0:00を起点: 0→Row21, 1→Row23, ..., 23→Row67
  return 21 + h * 2 + (m >= 30 ? 1 : 0);
}

/** 終了時刻からブロックの最終行を計算する。
 * endTimeが30分刻み（00分 or 30分）ならその行の1つ前まで使う。
 * それ以外（例: 09:20, 15:45）はその行自体まで使う。
 * 例: end=09:30 → Row39(9:00)まで, end=10:00 → Row40(9:30)まで, end=09:20 → Row39(9:00)まで
 */
function endTimeToLastRow(time: string): number {
  const parts = time.split(':');
  const m = parseInt(parts[1] || '0', 10);
  const row = timeToRow(time);
  // ちょうど30分刻みのときは「その行は次ブロック」なので-1
  if (m === 0 || m === 30) return row - 1;
  // 端数分（例: 20, 45）はその行に含まれる
  return row;
}

/** 罫線を明示的に消すための hair スタイル（テンプレートの元の細線に戻す） */
const hairBorder: Partial<ExcelJS.Border> = { style: 'hair' };

/**
 * サービスブロックの代表的な援助項目を最大2つ取得する
 * 計画予定表セルに「サービス種別（代表内容）」形式で表示するため。
 */
function getRepresentativeItems(serviceBlocks: Array<{ service_type: string; steps: Array<{ item: string; category?: string }> }> | undefined, serviceType: string): string {
  if (!serviceBlocks || serviceBlocks.length === 0) return '';
  // service_typeが一致するブロックを探す
  const block = serviceBlocks.find(b => {
    const bst = (b.service_type || '').replace(/\s+/g, '');
    const st = serviceType.replace(/\s+/g, '');
    if (st.includes('身体') && bst.includes('身体')) return true;
    if ((st.includes('家事') || st.includes('生活')) && (bst.includes('家事') || bst.includes('生活'))) return true;
    if (st.includes('重度') && bst.includes('重度')) return true;
    if (st.includes('通院') && bst.includes('通院')) return true;
    if (st.includes('同行') && bst.includes('同行')) return true;
    if (st.includes('行動') && bst.includes('行動')) return true;
    return false;
  });
  if (!block || block.steps.length === 0) return '';
  // 到着・挨拶・退室・体温測定を除いた代表的な項目を最大3つ
  // ★体温測定は除外し「体調確認」に統一（実測値がない場合と整合）
  const meaningful = block.steps.filter(s =>
    !/到着|挨拶|退室|訪問開始|バイタル|体温測定/.test(s.item)
  );
  // ★ 身体介護セルサマリーは current journals 実態に固定:
  //   「体調確認・服薬確認・排泄介助・食事見守り」
  const st = serviceType.replace(/\s+/g, '');
  if (st.includes('身体') || st.includes('重度')) {
    return '体調確認・服薬確認・排泄介助・食事見守り';
  }
  // 家事援助等はステップから代表項目を抽出
  const items = meaningful.length > 0 ? meaningful : block.steps;
  const picked = items.slice(0, 3).map(s => s.item);
  return [...new Set(picked)].join('・');
}

/**
 * 実績表から週間ケアパターンを抽出して計画予定表に書き込む
 *
 * 仕様書に従い以下の順番で必ず実行:
 * STEP 1: 予定表エリアの全マージセルを解除
 * STEP 2: 全セルの値・罫線を完全リセット（罫線を空に）
 * STEP 3: サービスブロックだけ再描画（結合→罫線→ラベル）
 */
function fillScheduleFromBilling(ws: ExcelJS.Worksheet, records: BillingRecord[], serviceBlocks?: Array<{ service_type: string; steps: Array<{ item: string; category?: string }> }>) {
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
  // 実績レコードを「曜日 × 時間帯」のユニークパターンに集約する。
  // サービス種別が異なっても同じ曜日・同じ時間帯なら1つのブロックにまとめる。
  //
  // テンプレートは0:00始まりの24時間（Row21=0:00, Row22=0:30, ..., Row67=23:00, Row68=23:30）。
  // 日またぎ（endTime < startTime、例: 23:00→翌08:00）は最終行(23:30)まで描画する。
  //
  // 処理の流れ:
  // 1. 全レコードから (曜日, 開始行, 終了行, ラベル) を抽出
  // 2. 同じ曜日で隣接・重複する行範囲を統合（サービス種別問わず）
  // 3. 統合したブロックのラベルを結合（例: "身体介護\n家事援助"）

  // Step 1: 全レコードを行範囲に変換
  interface RawPattern { dayName: string; labels: Set<string>; startRow: number; endRow: number; startTime: string; endTime: string }
  const rawPatterns: RawPattern[] = [];

  /** ヘルパー: パターンを追加（同一曜日・同一行範囲は統合） */
  function addPattern(dayName: string, label: string, startRow: number, endRow: number, startTime: string, endTime: string) {
    const cs = Math.max(startRow, minRow);
    const ce = Math.min(endRow, maxRow);
    if (cs > ce) return;
    const key = `${dayName}_${cs}_${ce}`;
    const existing = rawPatterns.find(p => `${p.dayName}_${p.startRow}_${p.endRow}` === key);
    if (existing) {
      existing.labels.add(label);
    } else {
      rawPatterns.push({ dayName, labels: new Set([label]), startRow: cs, endRow: ce, startTime, endTime });
    }
  }

  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const d = new Date(r.serviceDate);
    const dayName = WEEKDAY_NAMES[d.getDay()];
    const label = serviceCodeToLabel(r.serviceCode);

    if (!label) {
      console.log(`[CarePlan] スキップ（コード空）: ${dayName} ${r.startTime}-${r.endTime} コード="${r.serviceCode}"`);
      continue;
    }

    const sRow = timeToRow(r.startTime);
    const eLastRow = endTimeToLastRow(r.endTime);

    if (eLastRow >= sRow) {
      // 通常ケース（例: 08:30→09:30、18:30→19:30）
      addPattern(dayName, label, sRow, eLastRow, r.startTime, r.endTime);
    } else if (r.startTime !== r.endTime) {
      // 日またぎ（例: 23:00→翌08:00）→ 開始行→最終行まで描画
      addPattern(dayName, label, sRow, maxRow, r.startTime, r.endTime);
    }
  }

  console.log(`[CarePlan] 実績レコード → ユニークパターン: ${rawPatterns.length}件`);
  for (const p of rawPatterns) {
    console.log(`  ${p.dayName} ${p.startTime}-${p.endTime} [${[...p.labels].join(',')}] (Row${p.startRow}-${p.endRow})`);
  }

  // Step 2: 同じ曜日で隣接・重複する行範囲を統合（サービス種別問わず）
  rawPatterns.sort((a, b) => {
    if (a.dayName !== b.dayName) return WEEKDAY_NAMES.indexOf(a.dayName) - WEEKDAY_NAMES.indexOf(b.dayName);
    return a.startRow - b.startRow;
  });

  const merged: RawPattern[] = [];
  for (const p of rawPatterns) {
    const last = merged[merged.length - 1];
    if (last && last.dayName === p.dayName && last.endRow + 1 >= p.startRow) {
      // 隣接 or 重複 → マージ
      last.endRow = Math.max(last.endRow, p.endRow);
      for (const l of p.labels) last.labels.add(l);
      // 時刻も更新（元のサービス時刻を保持）
      if (p.startTime < last.startTime) last.startTime = p.startTime;
      if (p.endTime > last.endTime) last.endTime = p.endTime;
    } else {
      merged.push({
        dayName: p.dayName,
        labels: new Set(p.labels),
        startRow: p.startRow,
        endRow: p.endRow,
        startTime: p.startTime,
        endTime: p.endTime,
      });
    }
  }

  console.log(`[CarePlan] 計画予定表パターン: ${rawPatterns.length}件 → マージ後: ${merged.length}件`);
  for (const p of merged) {
    console.log(`  ${p.dayName} ${p.startTime}-${p.endTime} [${[...p.labels].join(',')}] (Row${p.startRow}-${p.endRow})`);
  }

  // ========== STEP 3: サービスブロック再描画 ==========
  // 複数サービス種別がある場合は行を分割して別々のセルに描画
  const planFont: Partial<ExcelJS.Font> = { name: 'HG正楷書体-PRO', size: 12 };

  for (const p of merged) {
    const col = DAY_TO_COL[p.dayName];
    if (!col) continue;
    const colNum = colToNum(col);
    const isLeftEdge = (colNum === minCol);
    const isRightEdge = (colNum === maxCol);
    const blockBorder = {
      top: hairBorder,
      bottom: hairBorder,
      left: isLeftEdge ? undefined : hairBorder,
      right: isRightEdge ? undefined : hairBorder,
    };

    const labels = [...p.labels];
    const totalRows = p.endRow - p.startRow + 1;

    // セル表示用のラベルを構築: 「サービス種別\n（代表内容）」
    const buildCellLabel = (label: string): string => {
      const repItems = getRepresentativeItems(serviceBlocks, label);
      if (repItems) {
        return `${label}\n（${repItems}）`;
      }
      return label;
    };

    // フォントサイズ: 代表内容があれば少し小さく
    const cellFont: Partial<ExcelJS.Font> = { name: 'HG正楷書体-PRO', size: 10 };

    if (labels.length <= 1 || totalRows < 2) {
      // 単一サービス or 行数不足 → 従来通り1ブロック
      if (p.endRow > p.startRow) {
        ws.mergeCells(p.startRow, colNum, p.endRow, colNum);
      }
      const cell = ws.getCell(`${col}${p.startRow}`);
      cell.value = labels.map(buildCellLabel).join('\n');
      cell.font = cellFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = blockBorder;
    } else {
      // 複数サービス → 行を種別ごとに均等分割して別セルに描画
      const rowsPerLabel = Math.floor(totalRows / labels.length);
      let currentRow = p.startRow;
      for (let i = 0; i < labels.length; i++) {
        const isLast = (i === labels.length - 1);
        const blockEnd = isLast ? p.endRow : currentRow + rowsPerLabel - 1;
        if (blockEnd > currentRow) {
          ws.mergeCells(currentRow, colNum, blockEnd, colNum);
        }
        const cell = ws.getCell(`${col}${currentRow}`);
        cell.value = buildCellLabel(labels[i]);
        cell.font = cellFont;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = blockBorder;
        currentRow = blockEnd + 1;
      }
    }
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

  // サービス種別集計: 週間予定表に存在するサービス種別のユニーク一覧を抽出
  // サービス種別ごとに1枠作成する（時間帯が違っても同じ種別なら1枠にまとめる）
  const serviceTypeSet = new Set<string>();
  for (const r of records) {
    if (!r.startTime || !r.endTime) continue;
    const label = serviceCodeToLabel(r.serviceCode) || '不明';
    if (label !== '不明') serviceTypeSet.add(label);
  }
  const serviceTypeList = [...serviceTypeSet];
  const typeText = serviceTypeList.map((t, i) => `枠${i + 1}: ${t}`).join('、');
  lines.push('');
  // 実績に含まれる全曜日を抽出
  const allDays = new Set<string>();
  for (const r of records) {
    if (!r.serviceDate) continue;
    const d = new Date(r.serviceDate + 'T00:00:00');
    allDays.add(['日', '月', '火', '水', '木', '金', '土'][d.getDay()]);
  }
  const allDaysList = ['月', '火', '水', '木', '金', '土', '日'].filter(d => allDays.has(d));

  lines.push(`【サービス種別判定結果】全${serviceTypeList.length}種別（${typeText}）`);
  lines.push(`【実績のある全曜日】${allDaysList.join('・')}（この全曜日をvisit_labelとschedule_remarksに漏れなく含めること）`);
  lines.push(`→ サービス内容ブロック数は${serviceTypeList.length}つにすること（サービス種別ごとに1枠）`);
  lines.push(`→ 各ブロックのservice_typeは上記の種別名と一致させること`);
  lines.push(`→ 各ブロックのstepsには、そのサービス種別に該当する援助項目のみ記載すること（混在禁止）`);

  // サービス種別ごとの代表的な時間帯を明記（AIが時間帯と種別を正しく対応付けるため）
  const typeTimeMap = new Map<string, { days: Set<string>; times: Set<string> }>();
  for (const r of records) {
    if (!r.startTime || !r.endTime || !r.serviceDate) continue;
    const label = serviceCodeToLabel(r.serviceCode);
    if (!label) continue;
    const d = new Date(r.serviceDate);
    const dayName2 = WEEKDAY_NAMES[d.getDay()];
    if (!typeTimeMap.has(label)) typeTimeMap.set(label, { days: new Set(), times: new Set() });
    const entry = typeTimeMap.get(label)!;
    entry.days.add(dayName2);
    entry.times.add(`${r.startTime}~${r.endTime}`);
  }
  if (typeTimeMap.size > 1) {
    lines.push('');
    lines.push('【サービス種別ごとの実績時間帯】');
    for (const [label, info] of typeTimeMap) {
      const days = dayOrder.filter(d => info.days.has(d)).join('・');
      const times = [...info.times].sort().join(', ');
      lines.push(`  ${label}: ${days} ${times}`);
    }
    lines.push('★重要：各サービス内容ブロックのservice_typeは、上記の実績時間帯に基づいて正しく設定すること。');
    lines.push('★身体介護の実績がある場合は必ずservice_type="身体介護"のブロックを生成し、家事援助の実績がある場合は必ずservice_type="家事援助"のブロックを生成すること。');
  }

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

/**
 * 対象年月に有効な契約支給量のみを返すフィルタ。
 * validFrom/validUntilが設定されていれば、対象月と期間が重なるレコードのみ返す。
 * 期間未設定のレコードは常に有効として扱う。
 */
function filterSupplyByPeriod(supplyAmounts: ShogaiSupplyAmount[], clientId: string, year: number, month: number): ShogaiSupplyAmount[] {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  return supplyAmounts.filter(s => {
    if (s.careClientId !== clientId) return false;
    // 期間未設定なら常に有効
    if (!s.validFrom && !s.validUntil) return true;
    // validUntilが対象月初より前なら期限切れ
    if (s.validUntil && s.validUntil < monthStart) return false;
    // validFromが対象月末より後ならまだ有効でない
    if (s.validFrom && s.validFrom > monthEnd) return false;
    return true;
  });
}

function buildSupplyAmountsText(supplyAmounts: ShogaiSupplyAmount[], clientId: string, year?: number, month?: number): string {
  const clientSupply = (year && month)
    ? filterSupplyByPeriod(supplyAmounts, clientId, year, month)
    : supplyAmounts.filter(s => s.careClientId === clientId);
  if (clientSupply.length === 0) return 'なし';
  return clientSupply.map(s =>
    `${s.serviceCategory} ${s.serviceContent}: ${s.supplyAmount} (${s.validFrom}〜${s.validUntil})`
  ).join('\n');
}

/**
 * 契約支給量からサービス種類ごとの時間数マップを構築。
 * キーはサービス種類の正規化名（「身体介護」「家事援助」「重度訪問介護」等）。
 * year/monthが指定されている場合、その月に有効な支給量のみを使用する。
 */
function getSupplyHours(supplyAmounts: ShogaiSupplyAmount[], clientId: string, year?: number, month?: number): Record<string, string> {
  const result: Record<string, string> = {};
  const clientSupply = (year && month)
    ? filterSupplyByPeriod(supplyAmounts, clientId, year, month)
    : supplyAmounts.filter(s => s.careClientId === clientId);
  for (const s of clientSupply) {
    const cat = s.serviceCategory || '';
    const content = s.serviceContent || '';

    // サービス種類が「居宅介護」の場合、serviceContentから細分類を判定
    if (cat === '居宅介護') {
      if (content.includes('身体介護') && !content.includes('通院')) {
        result['身体介護'] = s.supplyAmount || '';
      } else if (content.includes('家事援助') || content.includes('生活援助')) {
        result['家事援助'] = s.supplyAmount || '';
      } else if (content.includes('通院') && content.includes('伴う') && !content.includes('伴わない')) {
        result['通院等介助(身体介護を伴う)'] = s.supplyAmount || '';
      } else if (content.includes('通院') && content.includes('伴わない')) {
        result['通院等介助(身体介護を伴わない)'] = s.supplyAmount || '';
      } else if (content.includes('乗降')) {
        result['通院等乗降介助'] = s.supplyAmount || '';
      } else {
        // 判別できない場合はserviceContentそのまま
        result[content || cat] = s.supplyAmount || '';
      }
    } else if (cat === '重度訪問介護') {
      result['重度訪問介護'] = s.supplyAmount || '';
    } else if (cat === '同行援護') {
      result['同行援護'] = s.supplyAmount || '';
    } else if (cat === '行動援護') {
      result['行動援護'] = s.supplyAmount || '';
    } else {
      // その他はそのまま
      result[cat || content] = s.supplyAmount || '';
    }
  }
  return result;
}

// ==================== チェックボックス ====================
/**
 * 正規化済みのキーで完全一致検索。
 * supplyHoursのキーは「身体介護」「重度訪問介護」等の正規化名。
 */
function checkService(
  keys: string[],
  supplyH: Record<string, string>,
  serviceTypes: string[],
): { checked: boolean; hours: string } {
  // 契約支給量から完全一致で検索
  for (const k of keys) {
    if (supplyH[k] !== undefined) {
      return { checked: true, hours: supplyH[k] };
    }
  }
  // 契約支給量データがある場合はそちらのみで判定（実績フォールバックしない）
  if (Object.keys(supplyH).length > 0) {
    return { checked: false, hours: '' };
  }
  // 契約支給量データが一切ない場合のみ、実績データのサービス種別からフォールバック
  for (const k of keys) {
    for (const st of serviceTypes) {
      if (st === k || st.includes(k)) return { checked: true, hours: '' };
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
  if (!plan.user_wish) warnings.push('本人の希望が空です（デフォルト文を使用）');
  if (!plan.family_wish) warnings.push('家族の希望が空です（デフォルト文を使用）');
  if (!plan.goal_long) errors.push('長期目標が空です');
  if (!plan.goal_short) errors.push('短期目標が空です');

  // 文字数チェック（最低文字数）
  if (plan.user_wish && plan.user_wish.length < 10) warnings.push(`本人の希望が短すぎます（${plan.user_wish.length}文字）`);
  if (plan.family_wish && plan.family_wish.length < 10) warnings.push(`家族の希望が短すぎます（${plan.family_wish.length}文字）`);
  if (plan.goal_long && plan.goal_long.length < 15) warnings.push(`長期目標が短すぎます（${plan.goal_long.length}文字）`);
  if (plan.goal_short && plan.goal_short.length < 15) warnings.push(`短期目標が短すぎます（${plan.goal_short.length}文字）`);

  // service1は必須（最低1つのサービス種別が存在するため）
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
export interface CarePlanGenerationResult {
  short_term_goal_months: number;
  long_term_goal_months: number;
  period_reasoning: string;
  severity_level: 'standard' | 'moderate' | 'severe';
  goal_long_text: string;
  goal_short_text: string;
  /** 手順書生成に引き継ぐサービス内容ブロック */
  serviceBlocks: Array<{
    service_type: string;
    visit_label: string;
    steps: Array<{ item: string; content: string; note: string; category?: string }>;
  }>;
}

export async function generate(ctx: GeneratorContext): Promise<CarePlanGenerationResult> {
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
    throw new Error(`${year}年${month}月の実績記録がありません。先に実績データを取り込んでください。`);
  }

  const serviceTypes = getServiceTypesFromBilling(clientRecords);
  const totalVisits = clientRecords.length;
  const billingSummary = buildBillingSummary(clientRecords);
  const supplyText = buildSupplyAmountsText(supplyAmounts, client.id, year, month);
  const supplyHours = getSupplyHours(supplyAmounts, client.id, year, month);
  console.log(`[CarePlan] サービス種別: ${serviceTypes.join(', ')}, 契約支給量: ${JSON.stringify(supplyHours)}`);

  // アセスメントファイル取得
  let assessmentFileUrls: string[] = [];
  try {
    const docs = await loadShogaiDocuments(client.id, 'assessment');
    assessmentFileUrls = docs.filter(d => d.fileUrl).slice(0, 3).map(d => d.fileUrl);
  } catch { /* skip */ }

  // 前回目標の達成状況を取得
  let previousGoalsNote = '';
  try {
    const prevGoals = await loadGoalPeriods(client.id);
    const inactiveGoals = prevGoals.filter((g: any) => !g.isActive && g.goalText);
    if (inactiveGoals.length > 0) {
      const ACHIEVEMENT_LABELS: Record<string, string> = {
        achieved: '達成',
        partially_achieved: '一部達成',
        not_achieved: '未達成',
        pending: '未評価',
      };
      const goalLines = inactiveGoals.map((g: any) => {
        const typeLabel = g.goalType === 'long_term' ? '長期' : '短期';
        const status = ACHIEVEMENT_LABELS[g.achievementStatus] || '未評価';
        const note = g.achievementNote ? `（${g.achievementNote}）` : '';
        return `- 前回${typeLabel}目標: ${g.goalText} → ${status}${note}`;
      });
      previousGoalsNote = `\n【前回目標の達成状況】\n${goalLines.join('\n')}\n\n★ 達成済みの目標は新しい目標を設定してください。未達成の目標は「前回目標が未達成のため継続」として同じ内容を引き継いでください。`;
    }
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
    assessment_note: (assessmentFileUrls.length > 0
      ? '【添付アセスメント資料あり】添付のアセスメント資料の内容（利用者の心身状態・ADL・IADL・生活環境・介護者の状況等）を必ず読み取り、それに基づいて援助目標・サービス内容・留意事項を具体的に作成してください。'
      : '【アセスメント資料なし】利用者情報・実績データ・契約支給量から推測して、一般的な訪問介護計画を作成してください。')
      + previousGoalsNote,
  };

  // inheritLongTermGoal: 長期目標が期間内のため前版から引き継ぐ
  if (ctx.inheritLongTermGoal) {
    templateVars.assessment_note += `

【重要：長期目標の引き継ぎ】
長期目標はまだ期間内のため、前回と同じ文言・期間（long_term_goal_months）を返してください。
長期目標の文言や期間を変更してはいけません。変更してよいのは短期目標のみです。`;
  }

  // inheritServiceContent: 短期目標のみ変更・パターン変更なしの場合
  // AIには前版のサービス内容をそのまま返すよう指示
  if (ctx.inheritServiceContent) {
    templateVars.assessment_note += `

【重要：サービス内容引き継ぎモード】
今回は短期目標の期間更新のみです。週間介入パターンに変更はありません。
以下の項目は前回と同じ内容をそのまま返してください：
- 援助項目（item）
- サービスの内容（content）
- 留意事項（note）
- 週間サービス計画の内容`;
    if (ctx.inheritShortTermGoal) {
      templateVars.assessment_note += `
★短期目標も前回と完全に同じ文言を返してください。文言を変更してはいけません。`;
    } else {
      templateVars.assessment_note += `
変更してよいのは短期目標の文言と期間のみです。`;
    }
  }

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

  // 長期目標引き継ぎ: 前版の長期目標を強制適用（AIが変更しても上書き）
  // ★最優先: ctx.previousCarePlan（前回計画書Excelから読み込んだ確定値）
  // DBフォールバック（loadGoalPeriods）はExcelセル値と乖離するリスクがあるため最終手段にする
  if (ctx.inheritLongTermGoal) {
    let inheritedLongGoal = '';
    let inheritedLongMonths = 0;

    // ★最優先: ctx.previousCarePlan
    if (ctx.previousCarePlan?.longTermGoal) {
      inheritedLongGoal = ctx.previousCarePlan.longTermGoal;
      inheritedLongMonths = ctx.previousCarePlan.goalPeriod?.longTermMonths || 0;
      console.log(`[CarePlan] 長期目標引き継ぎ（previousCarePlan経由, source=${ctx.previousCarePlan.source}）: "${inheritedLongGoal}"`);
    } else if (ctx.previousPlanGoals?.longTermGoal) {
      // 後方互換
      inheritedLongGoal = ctx.previousPlanGoals.longTermGoal;
      console.log(`[CarePlan] 長期目標引き継ぎ（previousPlanGoals経由, legacy）: "${inheritedLongGoal}"`);
    }

    // フォールバック: loadGoalPeriods
    if (!inheritedLongGoal) {
      try {
        const prevGoals = await loadGoalPeriods(client.id);
        const activeLongTerm = prevGoals.find((g: any) => g.isActive && g.goalType === 'long_term');
        if (activeLongTerm?.goalText) {
          inheritedLongGoal = activeLongTerm.goalText;
          console.log(`[CarePlan] 長期目標引き継ぎ（DB経由）: "${inheritedLongGoal}"`);
          if (activeLongTerm.startDate && activeLongTerm.endDate) {
            const start = new Date(activeLongTerm.startDate);
            const end = new Date(activeLongTerm.endDate);
            const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            if (diffMonths > 0) inheritedLongMonths = diffMonths;
          }
        }
      } catch (err) {
        console.warn('[CarePlan] 長期目標引き継ぎ取得失敗:', err);
      }
    }

    // 適用
    if (inheritedLongGoal) {
      if (plan.goal_long !== inheritedLongGoal) {
        console.warn(`[CarePlan] ⚠ AIが長期目標を変更していたため前版で上書き: AI「${plan.goal_long?.substring(0, 30)}...」→ 前版「${inheritedLongGoal.substring(0, 30)}...」`);
      }
      plan.goal_long = inheritedLongGoal;
      if (inheritedLongMonths > 0) {
        plan.long_term_goal_months = inheritedLongMonths;
      }
    }
  }

  // 短期目標引き継ぎ: モニタリングで「目標継続」→ 前版の短期目標を強制適用（AIが変更しても上書き）
  // ★最重要: 「目標を継続する」と判定した場合、次の計画書の短期目標は前版と完全同一でなければならない
  // 前回計画resolverの確定値 > loadGoalPeriods の順で取得する
  if (ctx.inheritShortTermGoal) {
    let inheritedGoal = '';

    // ★最優先: ctx.previousCarePlan（前回計画書Excelから読み込んだ確定値）
    if (ctx.previousCarePlan?.shortTermGoal) {
      inheritedGoal = ctx.previousCarePlan.shortTermGoal;
      console.log(`[CarePlan] 短期目標引き継ぎ（previousCarePlan経由, source=${ctx.previousCarePlan.source}）: "${inheritedGoal}"`);
    } else if (ctx.previousPlanGoals?.shortTermGoal) {
      // 後方互換
      inheritedGoal = ctx.previousPlanGoals.shortTermGoal;
      console.log(`[CarePlan] 短期目標引き継ぎ（previousPlanGoals経由, legacy）: "${inheritedGoal}"`);
    }

    // フォールバック: loadGoalPeriods
    if (!inheritedGoal) {
      try {
        const prevGoals = await loadGoalPeriods(client.id);
        const activeShortTerm = prevGoals.find((g: any) => g.isActive && g.goalType === 'short_term');
        if (activeShortTerm?.goalText) {
          inheritedGoal = activeShortTerm.goalText;
          console.log(`[CarePlan] 短期目標引き継ぎ（loadGoalPeriods経由）: "${inheritedGoal}"`);
          // 短期目標期間も前版から算出して引き継ぐ
          if (activeShortTerm.startDate && activeShortTerm.endDate) {
            const start = new Date(activeShortTerm.startDate);
            const end = new Date(activeShortTerm.endDate);
            const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            if (diffMonths > 0) plan.short_term_goal_months = diffMonths;
          }
        }
      } catch (err) {
        console.warn('[CarePlan] 短期目標引き継ぎ取得失敗:', err);
      }
    }

    if (inheritedGoal) {
      plan.goal_short = inheritedGoal;
      console.log(`[CarePlan] ★短期目標を前版から強制引き継ぎ完了: "${plan.goal_short}"`);
    } else {
      console.warn(`[CarePlan] ⚠ inheritShortTermGoal=trueだが前版短期目標が取得できませんでした`);
    }
  }

  // === service_type と実際のステップ内容の不一致を検出・修正 ===
  // ★重要：混在除去より先にservice_type修正を実行する。
  // 理由：混在除去がservice_typeに基づいてステップを削除するため、
  // service_typeが誤っていると正しいステップが除外されてしまう。
  // 例：家事援助内容（調理・掃除等）のブロックでservice_type="身体介護"の場合、
  // 先に混在除去すると全ての家事ステップが削除され、service_type修正が発火しなくなる。
  const BODY_KEYWORDS = /服薬|排泄|入浴|更衣|整容|移乗|移動介助|体調確認|体調|食事介助|口腔ケア|清拭|体位|見守り|安全確認|体温/;
  const HOUSE_KEYWORDS = /調理|配膳|盛り付|片付|掃除|洗濯|買い物|環境整備|ゴミ|献立|食材|台所|食器|キッチン|居室整理|シンク|コンロ/;

  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    const st = (service.service_type || '').replace(/\s+/g, '');
    if (st.includes('重度')) continue;

    // 全ステップのテキストから、身体介護/家事援助のキーワード出現数を集計
    let bodyCount = 0;
    let houseCount = 0;
    for (const step of service.steps) {
      const text = `${step.item} ${step.content}`;
      if (BODY_KEYWORDS.test(text)) bodyCount++;
      if (HOUSE_KEYWORDS.test(text)) houseCount++;
    }

    const currentIsBody = st.includes('身体');
    const currentIsHouse = st.includes('家事') || st.includes('生活');

    // ステップ内容のキーワードからservice_typeを修正する
    // ケース1: 身体介護宣言だが家事KWが多い → 家事援助に修正
    // ケース2: 家事援助宣言だが身体KWが多い → 身体介護に修正
    // ケース3: 宣言なし/不明だがKWから判定可能 → 多い方に設定
    if (currentIsBody && houseCount > bodyCount) {
      console.log(`[CarePlan] service_type修正: サービス${i} 「${service.service_type}」→「家事援助」（身体KW=${bodyCount}, 家事KW=${houseCount}/${service.steps.length}件）`);
      service.service_type = '家事援助';
      for (const step of service.steps) {
        step.category = '家事援助';
      }
    } else if (currentIsHouse && bodyCount > houseCount) {
      console.log(`[CarePlan] service_type修正: サービス${i} 「${service.service_type}」→「身体介護」（身体KW=${bodyCount}, 家事KW=${houseCount}/${service.steps.length}件）`);
      service.service_type = '身体介護';
      for (const step of service.steps) {
        step.category = '身体介護';
      }
    } else if (!currentIsBody && !currentIsHouse && (bodyCount > 0 || houseCount > 0)) {
      // service_typeが空 or 不明な値の場合: キーワード多数派で設定
      const inferred = houseCount >= bodyCount ? '家事援助' : '身体介護';
      console.log(`[CarePlan] service_type推定: サービス${i} 「${service.service_type || '(空)'}」→「${inferred}」（身体KW=${bodyCount}, 家事KW=${houseCount}）`);
      service.service_type = inferred;
      for (const step of service.steps) {
        step.category = inferred;
      }
    }
  }

  // === 実績種別の網羅性チェック: 実績に存在する種別がAI出力に欠けていないか検証 ===
  // ★重要：実績に身体介護と家事援助の両方があるのに、AIが片方しか生成しなかった場合に修正する。
  // 例：実績に身体介護+家事援助があるが、AIが2つとも家事援助で生成した場合、
  //     キーワードベースで一方を身体介護に修正する。
  {
    const aiServiceTypes = new Set<string>();
    for (let i = 1; i <= 4; i++) {
      const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
      if (service && service.steps.length > 0 && service.service_type) {
        const st = service.service_type.replace(/\s+/g, '');
        if (st.includes('身体')) aiServiceTypes.add('身体介護');
        else if (st.includes('家事') || st.includes('生活')) aiServiceTypes.add('家事援助');
        else if (st.includes('重度')) aiServiceTypes.add('重度訪問');
        else aiServiceTypes.add(service.service_type);
      }
    }

    // 実績には存在するがAI出力に欠けている種別を検出
    const missingTypes: string[] = [];
    for (const billingType of serviceTypes) {
      if (!aiServiceTypes.has(billingType)) {
        missingTypes.push(billingType);
      }
    }

    if (missingTypes.length > 0) {
      console.log(`[CarePlan] 実績種別欠落検出: AI出力=${[...aiServiceTypes].join(',')}, 実績=${serviceTypes.join(',')}, 欠落=${missingTypes.join(',')}`);

      // 同じservice_typeが重複しているブロックを探して、欠落種別に割り当てる
      for (const missing of missingTypes) {
        // 重複ブロックを探す（同じservice_typeが2つ以上ある場合）
        const typeCountMap = new Map<string, number[]>();
        for (let i = 1; i <= 4; i++) {
          const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
          if (!service || service.steps.length === 0) continue;
          const normType = service.service_type.replace(/\s+/g, '');
          const key = normType.includes('身体') ? '身体介護' : (normType.includes('家事') || normType.includes('生活')) ? '家事援助' : service.service_type;
          if (!typeCountMap.has(key)) typeCountMap.set(key, []);
          typeCountMap.get(key)!.push(i);
        }

        // 重複ブロックの中でキーワードが欠落種別に近いものを変更
        for (const [existingType, indices] of typeCountMap) {
          if (indices.length < 2) continue; // 重複なし
          if (existingType === missing) continue; // 既に正しい種別

          // 重複ブロックの中でキーワードマッチが欠落種別寄りなものを探す
          let bestIdx = -1;
          let bestScore = -1;
          for (const idx of indices) {
            const service = plan[`service${idx}` as keyof CarePlan] as ServiceBlock | null;
            if (!service) continue;
            let score = 0;
            for (const step of service.steps) {
              const text = `${step.item} ${step.content}`;
              if (missing === '身体介護' && BODY_KEYWORDS.test(text)) score++;
              if (missing === '家事援助' && HOUSE_KEYWORDS.test(text)) score++;
            }
            if (score > bestScore) {
              bestScore = score;
              bestIdx = idx;
            }
          }

          if (bestIdx > 0) {
            const service = plan[`service${bestIdx}` as keyof CarePlan] as ServiceBlock | null;
            if (service) {
              console.log(`[CarePlan] 実績種別欠落修正: サービス${bestIdx} 「${service.service_type}」→「${missing}」（重複ブロックを割り当て）`);
              service.service_type = missing;
              for (const step of service.steps) {
                step.category = missing;
              }
            }
          }
        }
      }
    }
  }

  // === 現実性フィルタ: 時間帯に対して非現実的な内容を除外 ===
  const NIGHT_UNREALISTIC = /買い物|外出|公園|散歩|通院|デイ|学校|就労|大掃除|洗濯干し|遊び|レクリエーション/;
  const EVENING_UNREALISTIC = /外出|公園|散歩|通院|デイ|学校|就労|遊び|レクリエーション/;
  const ALWAYS_UNREALISTIC = /公園で遊|夜中.*買い物|深夜.*外出/;
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    // visit_labelから開始時刻を抽出
    const timeMatch = service.visit_label?.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) continue;
    const startHour = parseInt(timeMatch[1], 10);
    const isNightDeep = startHour >= 21 || startHour < 6; // 深夜帯
    const isEvening = startHour >= 17 && startHour < 21; // 夕方〜夜帯

    const before = service.steps.length;
    service.steps = service.steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      // 全時間帯で明らかに非現実的な内容を除外
      if (ALWAYS_UNREALISTIC.test(text)) {
        console.log(`[CarePlan] 現実性フィルタ: 非現実的な「${step.item}」を除外`);
        return false;
      }
      if (isNightDeep && NIGHT_UNREALISTIC.test(text)) {
        console.log(`[CarePlan] 現実性フィルタ: 深夜帯に非現実的な「${step.item}」を除外`);
        return false;
      }
      if (isEvening && EVENING_UNREALISTIC.test(text)) {
        console.log(`[CarePlan] 現実性フィルタ: 夕方〜夜帯に非現実的な「${step.item}」を除外`);
        return false;
      }
      return true;
    });
    if (before !== service.steps.length) {
      console.log(`[CarePlan] サービス${i}: ${before}件→${service.steps.length}件（現実性フィルタ）`);
    }
  }

  // === 「記録」「申し送り」「情報共有」ステップの除外 ===
  // ヘルパーの内部事務であり、利用者への援助ではないため計画書から除外する
  // ★ 完全一致（^...$）ではなく、itemの主語が「記録」「報告」「申し送り」「情報共有」であるかをチェック
  // ★ 要件E対応: 「記録報告」（中黒なし）、「情報共有」、「連絡報告」も除外対象に追加
  const RECORD_STEP_PATTERN = /^(記録|記録作成|記録確認|記録[・]?報告|連絡[・]?報告|申し送り|申し送り事項|サービス記録|支援記録|支援内容.*記録|状況.*記録|報告・記録|報告|状況報告|退室.*報告|情報共有|.*への記録|.*の記録|.*への報告|連絡・調整|連絡調整)$/;
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    const before = service.steps.length;
    service.steps = service.steps.filter(step => {
      const item = step.item?.trim() || '';
      // item自体が内部事務項目
      if (RECORD_STEP_PATTERN.test(item)) {
        console.log(`[CarePlan] 内部事務ステップ除外: サービス${i}から「${item}」を除外`);
        return false;
      }
      // contentが「サービス実施内容の記録」「情報共有」のみの場合も除外
      const content = step.content?.trim() || '';
      if (/^(サービス実施内容の記録|実施内容の記録|訪問看護との情報共有|他事業所との情報共有|記録の作成|記録作成|報告書の作成)$/.test(content.replace(/^\d{1,2}:\d{2}\s*/, ''))) {
        console.log(`[CarePlan] 内部事務コンテンツ除外: サービス${i}から「${item}: ${content}」を除外`);
        return false;
      }
      return true;
    });
    if (before !== service.steps.length) {
      console.log(`[CarePlan] サービス${i}: ${before}件→${service.steps.length}件（内部事務ステップ除外）`);
    }
  }

  // === サービス内容の種別混在を修正（後処理バリデーション） ===
  // ★service_type修正後に実行するので、正しいservice_typeに基づいて混在除去される
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    const st = (service.service_type || '').replace(/\s+/g, '');
    if (st.includes('重度')) continue; // 重度訪問介護は混在OK

    const isBodyBlock = st.includes('身体');
    const isHouseBlock = st.includes('家事') || st.includes('生活');
    if (!isBodyBlock && !isHouseBlock) continue;

    const before = service.steps.length;
    service.steps = service.steps.filter(step => {
      const text = `${step.item} ${step.content}`;
      const hasBodyKW = BODY_KEYWORDS.test(text);
      const hasHouseKW = HOUSE_KEYWORDS.test(text);
      if (isBodyBlock && hasHouseKW && !hasBodyKW) {
        console.log(`[CarePlan] 混在除去: 身体介護ブロックから家事項目「${step.item}」を除外`);
        return false;
      }
      if (isHouseBlock && hasBodyKW && !hasHouseKW) {
        console.log(`[CarePlan] 混在除去: 家事援助ブロックから身体項目「${step.item}」を除外`);
        return false;
      }
      return true;
    });
    // categoryも強制設定
    for (const step of service.steps) {
      step.category = isBodyBlock ? '身体介護' : '家事援助';
    }
    if (before !== service.steps.length) {
      console.log(`[CarePlan] サービス${i}(${st}): ${before}件→${service.steps.length}件（混在除去）`);
    }
  }

  // === アセスメントADL根拠チェック: 証拠のない身体介護項目を除外 ===
  const adlSummary = rawJson.assessment_adl_summary as Record<string, string> | undefined;
  if (adlSummary && assessmentFileUrls.length > 0) {
    // 介助不要（自立・見守り・他サービス担当）のADL項目に対応するキーワードマップ
    const NO_ASSIST_VALUES = ['自立', '見守り', '他サービス担当', '訪問看護担当', 'デイサービス担当', '自己管理'];
    const ADL_TO_KEYWORDS: Record<string, RegExp> = {
      '食事': /食事介助/,
      '排泄': /排泄介助|おむつ交換|トイレ介助/,
      '入浴': /入浴介助|入浴の見守り|清拭/,
      '更衣': /更衣介助|着脱介助/,
      '服薬': /服薬確認|服薬管理|服薬介助/,
    };

    for (let i = 1; i <= 4; i++) {
      const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
      if (!service || service.steps.length === 0) continue;
      const st = (service.service_type || '').replace(/\s+/g, '');
      if (!st.includes('身体')) continue;

      const before = service.steps.length;
      service.steps = service.steps.filter(step => {
        const itemText = step.item || '';
        for (const [adlKey, pattern] of Object.entries(ADL_TO_KEYWORDS)) {
          if (pattern.test(itemText)) {
            const adlLevel = adlSummary[adlKey] || '';
            if (NO_ASSIST_VALUES.some(v => adlLevel.includes(v))) {
              console.log(`[CarePlan] ADL根拠フィルタ: 「${step.item}」除外（${adlKey}=${adlLevel}）`);
              return false;
            }
          }
        }
        return true;
      });
      if (before !== service.steps.length) {
        console.log(`[CarePlan] サービス${i}(${st}): ${before}件→${service.steps.length}件（ADL根拠フィルタ）`);
      }
    }
  }

  // === 援助項目(item)の文字数制約: 15文字以内 ===
  const MAX_ITEM_LEN = 15;
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    for (const step of service.steps) {
      if (step.item && step.item.length > MAX_ITEM_LEN) {
        step.item = step.item.substring(0, MAX_ITEM_LEN);
      }
    }
  }

  // === サービス内容(content)・留意事項(note)の文字数制約: 40〜60字 ===
  const MIN_CONTENT_LEN = 40;
  const MAX_CONTENT_LEN = 60;
  for (let i = 1; i <= 4; i++) {
    const service = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
    if (!service || service.steps.length === 0) continue;
    for (const step of service.steps) {
      // content: 長すぎる場合は末尾を句点で切る、短すぎる場合は補足
      if (step.content && step.content.length > MAX_CONTENT_LEN) {
        // 句点で区切れるところで切る
        const cut = step.content.substring(0, MAX_CONTENT_LEN);
        const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
        step.content = lastPeriod > MIN_CONTENT_LEN ? cut.substring(0, lastPeriod + 1) : cut;
      }
      // note: 同様に制約
      if (step.note && step.note.length > MAX_CONTENT_LEN) {
        const cut = step.note.substring(0, MAX_CONTENT_LEN);
        const lastPeriod = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('、'));
        step.note = lastPeriod > MIN_CONTENT_LEN ? cut.substring(0, lastPeriod + 1) : cut;
      }
    }
  }

  console.log(`[CarePlan] AI応答 - service1: ${plan.service1?.steps.length || 0}件 (${plan.service1?.service_type || '未判定'}), service2: ${plan.service2?.steps.length || 0}件 (${plan.service2?.service_type || '未判定'})`);
  console.log(`[CarePlan] 目標期間判定 - 重度度: ${plan.severity_level}, 短期: ${plan.short_term_goal_months}ヶ月, 長期: ${plan.long_term_goal_months}ヶ月`);
  console.log(`[CarePlan] 期間設定根拠: ${plan.period_reasoning}`);
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
  const ws0 = workbook.getWorksheet('居宅介護計画書（表）') || workbook.worksheets[0];
  if (!ws0) throw new Error('居宅介護計画書（表）シートが見つかりません');

  // 作成日の決定
  // 1. ctx.planCreationDate が指定されていればそれを使用（一括生成時）
  // 2. 初回のみ契約開始日の2日前（ケア開始前に利用者確認が必要なため）
  // 3. それ以外は対象年月の1日
  let planDate: Date;
  let planDateText: string;
  // 年末年始（12/30〜1/4）を避ける
  const avoidNewYear = (d: Date): Date => {
    const m = d.getMonth() + 1, day = d.getDate();
    if (m === 12 && day >= 30) { d.setMonth(11, 29); }
    if (m === 1 && day <= 4) { d.setFullYear(d.getFullYear() - 1, 11, 29); }
    return d;
  };
  if (ctx.planCreationDate) {
    planDate = avoidNewYear(new Date(ctx.planCreationDate + 'T00:00:00'));
    planDateText = `令和${toReiwa(planDate.getFullYear())}年${planDate.getMonth() + 1}月${planDate.getDate()}日`;
  } else if (client.contractStart) {
    planDate = new Date(client.contractStart + 'T00:00:00');
    planDate.setDate(planDate.getDate() - 2);
    planDate = avoidNewYear(planDate);
    planDateText = `令和${toReiwa(planDate.getFullYear())}年${planDate.getMonth() + 1}月${planDate.getDate()}日`;
  } else {
    planDate = avoidNewYear(new Date(year, month - 1, 1));
    planDateText = `令和${toReiwa(planDate.getFullYear())}年${planDate.getMonth() + 1}月${planDate.getDate()}日`;
  }

  ws0.getCell('H3').value = planDateText;
  ws0.getCell('H3').alignment = { vertical: 'middle' };
  ws0.getCell('K3').value = officeInfo.serviceManager || '未設定';
  ws0.getCell('K3').alignment = { vertical: 'middle' };
  // 児童名が設定されている場合は「利用者名（児童名）様」形式
  const displayName = client.childName ? `${client.name}（${client.childName}）` : client.name;
  ws0.getCell('A5').value = `${displayName}　様`;
  ws0.getCell('A5').alignment = { vertical: 'middle' };
  ws0.getCell('E5').value = client.birthDate || '';
  ws0.getCell('E5').alignment = { vertical: 'middle' };
  // G5:J6 が結合セル（郵便番号＋住所）
  const addressText = (client.postalCode ? `〒${client.postalCode}\n` : '') + (client.address || '');
  const addrCell = ws0.getCell('G5');
  addrCell.value = addressText;
  addrCell.alignment = { wrapText: true, vertical: 'middle' };
  ws0.getCell('K5').value = client.phone ? `TEL：${client.phone}` : '';
  ws0.getCell('K5').alignment = { vertical: 'middle' };
  ws0.getCell('K6').value = client.mobilePhone ? `FAX：${client.mobilePhone}` : '';
  ws0.getCell('K6').alignment = { vertical: 'middle' };

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
  // 家族なしの場合は空欄
  let familyWishText = '';
  if (client.hasFamily === false) {
    familyWishText = '';
  } else {
    familyWishText = plan.family_wish || DEFAULT_FAMILY_WISH;
    if (familyWishText.length < MIN_WISH_LENGTH) {
      familyWishText = `${familyWishText}${FAMILY_WISH_SUPPLEMENT}`;
    }
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
  goalCell12.value = `長期（${plan.long_term_goal_months}ヶ月）: ${goalLongText}`;
  setWrapText(goalCell12);
  const goalCell13 = ws0.getCell('E13');
  goalCell13.value = `短期（${plan.short_term_goal_months}ヶ月）: ${goalShortText}`;
  setWrapText(goalCell13);
  const goalCell14 = ws0.getCell('E14');
  goalCell14.value = plan.needs ? `課題: ${plan.needs}` : '';
  setWrapText(goalCell14);

  // サービス内容チェックボックス
  // 判定優先: 1.実績サービス種別 → 2.契約支給量 → 3.AIブロックのservice_type → 4.steps.category
  const allPlanServices = [plan.service1, plan.service2, plan.service3, plan.service4].filter(Boolean) as ServiceBlock[];
  const allSvcTypes = allPlanServices.map(s => (s.service_type || '').replace(/\s+/g, ''));

  // 実績サービス種別から判定（最も信頼性が高い）
  const billingHasBody = serviceTypes.some(st => st.includes('身体'));
  const billingHasHouse = serviceTypes.some(st => st.includes('家事') || st.includes('生活'));
  const billingHasHeavy = serviceTypes.some(st => st.includes('重度'));
  const billingHasVisit = serviceTypes.some(st => st.includes('通院'));
  const billingHasAccompany = serviceTypes.some(st => st.includes('同行'));
  const billingHasBehavior = serviceTypes.some(st => st.includes('行動'));

  // AIブロックのservice_typeから判定
  const planHasBody = allSvcTypes.some(st => st.includes('身体介護') || st.includes('身体'));
  const planHasHouse = allSvcTypes.some(st => st.includes('家事') || st.includes('生活'));

  // 契約支給量から時間数を取得
  const bodyHours = supplyHours['身体介護'] || '';
  const houseHours = supplyHours['家事援助'] || '';
  const heavyHours = supplyHours['重度訪問介護'] || '';
  const visitBodyHours = supplyHours['通院等介助(身体介護を伴う)'] || '';
  const visitNoBodyHours = supplyHours['通院等介助(身体介護を伴わない)'] || '';
  const rideHours = supplyHours['通院等乗降介助'] || '';
  const accompanyHours = supplyHours['同行援護'] || '';
  const behaviorHours = supplyHours['行動援護'] || '';

  // チェック判定: 実績 or 契約支給量 or AI出力のいずれかで該当すればチェック
  const hasBody = billingHasBody || !!bodyHours || planHasBody;
  const hasHouse = billingHasHouse || !!houseHours || planHasHouse;
  const hasHeavy = billingHasHeavy || !!heavyHours || allSvcTypes.some(st => st.includes('重度'));
  // 通院等介助: 支給量 or 実績がある場合のみチェック
  // AI出力だけ（プランにステップがない空ブロック）では根拠不十分なのでチェックしない
  const planHasVisitBodyContent = allPlanServices.some(s => {
    const sst = (s.service_type || '').replace(/\s+/g, '');
    return sst.includes('通院') && !sst.includes('伴わない') && s.steps.length > 0;
  });
  const hasVisitBody = !!visitBodyHours || billingHasVisit || planHasVisitBodyContent;
  const planHasVisitNoBodyContent = allPlanServices.some(s => {
    const sst = (s.service_type || '').replace(/\s+/g, '');
    return sst.includes('通院') && sst.includes('伴わない') && s.steps.length > 0;
  });
  const hasVisitNoBody = !!visitNoBodyHours || (billingHasVisit && planHasVisitNoBodyContent);
  const hasRide = !!rideHours || allSvcTypes.some(st => st.includes('乗降'));
  const hasAccompany = billingHasAccompany || !!accompanyHours || allSvcTypes.some(st => st.includes('同行'));
  const hasBehavior = billingHasBehavior || !!behaviorHours || allSvcTypes.some(st => st.includes('行動'));

  console.log(`[CarePlan] チェックボックス判定: 実績=${serviceTypes.join(',')}, 支給量=${JSON.stringify(supplyHours)}, AI種別=${allSvcTypes.join(',')}`);
  console.log(`[CarePlan] → 身体=${hasBody}, 家事=${hasHouse}, 重度=${hasHeavy}, 通院(伴)=${hasVisitBody}, 通院(非)=${hasVisitNoBody}`);

  // 表紙チェック根拠ログ（運営指導対応用）
  if (hasVisitBody) {
    const reasons: string[] = [];
    if (visitBodyHours) reasons.push(`契約支給量: ${visitBodyHours}時間`);
    if (billingHasVisit) reasons.push('実績に通院あり');
    if (planHasVisitBodyContent) reasons.push('AIプランに通院(身体伴う)ブロックあり');
    console.log(`[CarePlan] 通院等介助(身体伴う)チェック根拠: ${reasons.join(', ')}`);
  }
  if (hasVisitNoBody) {
    const reasons: string[] = [];
    if (visitNoBodyHours) reasons.push(`契約支給量: ${visitNoBodyHours}時間`);
    if (billingHasVisit && planHasVisitNoBodyContent) reasons.push('実績+AIプランの根拠あり');
    console.log(`[CarePlan] 通院等介助(身体伴わない)チェック根拠: ${reasons.join(', ')}`);

    // ★不整合チェック: G17で■なのにサービスブロック内に通院枠がない場合
    if (!planHasVisitNoBodyContent && !billingHasVisit) {
      console.warn(`[CarePlan] ⚠ 通院等介助(身体伴わない)不整合: G17=■(${visitNoBodyHours}時間) だがサービスブロック内に通院枠なし・実績にも通院なし → manual review推奨`);
      console.warn(`[CarePlan]   根拠: 契約支給量のみ(${visitNoBodyHours}時間)。予定表・サービス内容との突合が必要`);
    }
  }

  // === 「契約支給量にあるが実績にない」サービスの条件付き例外処理 ===
  const supplyOnlyServices: Array<{ label: string; hours: string }> = [];
  const visitBodySupplyOnly = !!visitBodyHours && !billingHasVisit && !planHasVisitBodyContent;
  if (visitBodySupplyOnly) supplyOnlyServices.push({ label: '通院等介助(身体介護を伴う)', hours: visitBodyHours });
  const visitNoBodySupplyOnly = !!visitNoBodyHours && !billingHasVisit && !planHasVisitNoBodyContent;
  if (visitNoBodySupplyOnly) supplyOnlyServices.push({ label: '通院等介助(身体介護を伴わない)', hours: visitNoBodyHours });
  const accompanySupplyOnly = !!accompanyHours && !billingHasAccompany && !allSvcTypes.some(st => st.includes('同行'));
  if (accompanySupplyOnly) supplyOnlyServices.push({ label: '同行援護', hours: accompanyHours });
  const behaviorSupplyOnly = !!behaviorHours && !billingHasBehavior && !allSvcTypes.some(st => st.includes('行動'));
  if (behaviorSupplyOnly) supplyOnlyServices.push({ label: '行動援護', hours: behaviorHours });
  if (supplyOnlyServices.length > 0) {
    console.log(`[CarePlan] 契約あり＆実績なし: ${supplyOnlyServices.map(s => `${s.label}(${s.hours}h)`).join(', ')} → チェックOFF・本体除外・備考記載`);
  }

  // チェックボックス: 「契約あり＆実績なし」はチェックOFF
  const effectiveVisitBody = visitBodySupplyOnly ? false : hasVisitBody;
  const effectiveVisitNoBody = visitNoBodySupplyOnly ? false : hasVisitNoBody;
  const effectiveAccompany = accompanySupplyOnly ? false : hasAccompany;
  const effectiveBehavior = behaviorSupplyOnly ? false : hasBehavior;

  const checkboxAlignment: Partial<ExcelJS.Alignment> = { vertical: 'middle', wrapText: true };
  ws0.getCell('D16').value = checkboxText('身体介護', { checked: hasBody, hours: bodyHours });
  ws0.getCell('D16').alignment = checkboxAlignment;
  ws0.getCell('G16').value = checkboxText('家事援助', { checked: hasHouse, hours: houseHours });
  ws0.getCell('G16').alignment = checkboxAlignment;
  ws0.getCell('J16').value = checkboxText('重度訪問介護', { checked: hasHeavy, hours: heavyHours });
  ws0.getCell('J16').alignment = checkboxAlignment;
  ws0.getCell('D17').value = checkboxText('通院等介助(身体介護を伴う)', { checked: effectiveVisitBody, hours: effectiveVisitBody ? visitBodyHours : '' });
  ws0.getCell('D17').alignment = checkboxAlignment;
  ws0.getCell('G17').value = checkboxText('通院等介助(身体介護を伴わない)', { checked: effectiveVisitNoBody, hours: effectiveVisitNoBody ? visitNoBodyHours : '' });
  ws0.getCell('G17').alignment = checkboxAlignment;
  ws0.getCell('J17').value = checkboxText('通院等乗降介助', { checked: hasRide, hours: rideHours });
  ws0.getCell('J17').alignment = checkboxAlignment;
  ws0.getCell('D18').value = checkboxText('同行援護', { checked: effectiveAccompany, hours: effectiveAccompany ? accompanyHours : '' });
  ws0.getCell('D18').alignment = checkboxAlignment;
  ws0.getCell('G18').value = checkboxText('行動援護', { checked: effectiveBehavior, hours: effectiveBehavior ? behaviorHours : '' });
  ws0.getCell('G18').alignment = checkboxAlignment;

  // 計画予定表（実績表ベース）- 「契約あり＆実績なし」サービスを予定表から除外
  const supplyOnlyLabels = new Set(supplyOnlyServices.map(s => s.label));
  const planServiceBlocksForSchedule = allPlanServices
    .filter(s => {
      const sType = (s.service_type || '').replace(/\s+/g, '');
      if (sType.includes('通院') && (supplyOnlyLabels.has('通院等介助(身体介護を伴う)') || supplyOnlyLabels.has('通院等介助(身体介護を伴わない)'))) {
        console.log(`[CarePlan] 予定表から通院ブロック除外: ${s.service_type}`);
        return false;
      }
      if (sType.includes('同行') && supplyOnlyLabels.has('同行援護')) return false;
      if (sType.includes('行動') && supplyOnlyLabels.has('行動援護')) return false;
      return true;
    })
    .map(s => ({
      service_type: s.service_type,
      steps: s.steps.map(st => ({ item: st.item, category: st.category })),
    }));
  console.log(`[CarePlan] 計画予定表書き込み - 実績件数: ${clientRecords.length}, 除外: ${supplyOnlyServices.map(s => s.label).join(', ') || 'なし'}`);
  fillScheduleFromBilling(ws0, clientRecords, planServiceBlocksForSchedule);

  // 備考欄（K21:K68をマージして全文表示）
  // ★K21の時間枠ごとのサービス記載が、計画書本文のservice_typeと矛盾しないよう後処理
  if (plan.schedule_remarks) {
    let remarks = plan.schedule_remarks;
    // 計画書サービスブロックの時間枠→service_typeマッピングを構築
    const planTimeSlotTypes = new Map<string, string>();
    for (let i = 1; i <= 4; i++) {
      const svc = plan[`service${i}` as keyof CarePlan] as ServiceBlock | null;
      if (!svc || !svc.visit_label || !svc.service_type) continue;
      // visit_labelから時刻を抽出（例: "月〜金 18:30〜19:30 家事援助" → "18:30"）
      const timeMatch = svc.visit_label.match(/(\d{1,2}:\d{2})/);
      if (timeMatch) {
        planTimeSlotTypes.set(timeMatch[1], svc.service_type);
      }
    }
    // K21中の時間枠記載の種別を実際のservice_typeと一致させる
    for (const [time, actualType] of planTimeSlotTypes) {
      const timeRegex = new RegExp(`${time.replace(':', '[：:]')}[^\\n]*?(身体介護|家事援助)`);
      const match = remarks.match(timeRegex);
      if (match && match[1] !== actualType) {
        console.log(`[CarePlan] K21修正: ${time}枠 「${match[1]}」→「${actualType}」（計画書本文に合わせ）`);
        remarks = remarks.replace(match[0], match[0].replace(match[1], actualType));
      }
    }

    // === ★K21援助項目整合: schedule_remarksの援助項目サマリーを計画書本文(steps)と一致させる ===
    // K21に「家事援助（調理・清掃）」と書かれていても、計画書本文のstepsに調理がなければ
    // K21から「調理」を除去する。K21だけが強くて本文・日誌と追随しない状態を解消。
    {
      // 全サービスブロックのsteps本文テキストを結合
      const planServices = [plan.service1, plan.service2, plan.service3, plan.service4];
      const allStepText = planServices
        .filter((s): s is ServiceBlock => s !== null)
        .flatMap(s => s.steps.map(st => `${st.item} ${st.content}`))
        .join(' ');
      // 家事援助の援助項目キーワードと本文の存在チェック
      const houseItemChecks: Array<{ keyword: string; pattern: RegExp; bodyPattern: RegExp }> = [
        { keyword: '調理', pattern: /調理/, bodyPattern: /調理|料理|献立|食事.*準備/ },
        { keyword: '清掃', pattern: /清掃|掃除/, bodyPattern: /清掃|掃除|掃き|拭き/ },
        { keyword: '洗濯', pattern: /洗濯/, bodyPattern: /洗濯|干し|たたみ|取り込み/ },
        { keyword: '買物', pattern: /買い?物/, bodyPattern: /買い?物|買い出し/ },
      ];
      // K21中の「家事援助（調理・清掃）」等のサマリーを修正
      const houseSummaryMatch = remarks.match(/家事援助[（(]([^）)]+)[）)]/);
      if (houseSummaryMatch) {
        const originalItems = houseSummaryMatch[1];
        const filteredItems = originalItems.split(/[・、,]/).filter(item => {
          const check = houseItemChecks.find(c => c.pattern.test(item));
          if (!check) return true; // 未知の項目はそのまま残す
          const existsInBody = check.bodyPattern.test(allStepText);
          if (!existsInBody) {
            console.log(`[CarePlan] K21整合: 「${item}」は計画書本文に存在しないため除去`);
          }
          return existsInBody;
        });
        if (filteredItems.length > 0 && filteredItems.join('・') !== originalItems) {
          const newSummary = `家事援助（${filteredItems.join('・')}）`;
          remarks = remarks.replace(houseSummaryMatch[0], newSummary);
          console.log(`[CarePlan] K21整合: 「${houseSummaryMatch[0]}」→「${newSummary}」（計画書本文と一致）`);
        } else if (filteredItems.length === 0) {
          // 全項目が本文にない → サマリー自体を「家事援助」に簡略化
          remarks = remarks.replace(houseSummaryMatch[0], '家事援助');
          console.log(`[CarePlan] K21整合: 「${houseSummaryMatch[0]}」→「家事援助」（詳細項目が本文に不在）`);
        }
      }
      // ★ K21身体介護サマリーを「体調確認・服薬確認・排泄介助・食事見守り」に固定
      // AI出力の内容に関わらず、current journals の実態に合わせた固定サマリーに置換する。
      const BODY_SUMMARY = '体調確認・服薬確認・排泄介助・食事見守り';
      const bodySummaryMatch = remarks.match(/身体介護[（(]([^）)]+)[）)]/);
      if (bodySummaryMatch) {
        const newSummary = `身体介護（${BODY_SUMMARY}）`;
        if (bodySummaryMatch[0] !== newSummary) {
          remarks = remarks.replace(bodySummaryMatch[0], newSummary);
          console.log(`[CarePlan] K21整合: 「${bodySummaryMatch[0]}」→「${newSummary}」（current journals に統一）`);
        }
      } else if (/身体介護/.test(remarks)) {
        // 裸の「身体介護」→ 括弧付きに具体化
        const newSummary = `身体介護（${BODY_SUMMARY}）`;
        remarks = remarks.replace(/身体介護(?![（(])/, newSummary);
        console.log(`[CarePlan] K21整合: 裸の「身体介護」→「${newSummary}」に具体化`);
      }
      // ★ 家事援助も括弧なしの場合は具体化
      if (/家事援助/.test(remarks) && !/家事援助[（(]/.test(remarks)) {
        const houseHasCooking = /調理|料理|献立|食事.*準備/.test(allStepText);
        const houseHasCleaning = /清掃|掃除|掃き|拭き/.test(allStepText);
        if (houseHasCooking || houseHasCleaning) {
          const houseParts: string[] = [];
          if (houseHasCooking) houseParts.push('調理');
          if (houseHasCleaning) houseParts.push('掃除');
          const newHouseSummary = `家事援助（${houseParts.join('・')}）`;
          remarks = remarks.replace(/家事援助(?![（(])/, newHouseSummary);
          console.log(`[CarePlan] K21整合: 裸の「家事援助」→「${newHouseSummary}」に具体化`);
        }
      }
    }

    // === 「契約支給量あり＋実績なし」のサービス種別に対する備考文自動追加 ===
    // 契約上の保有枠はあるが、当該計画期間の実績に提供記録がないサービスを検出し、
    // 備考欄に説明文を追加する。定例サービスではないため計画予定表やサービス内容には載せない。
    {
      const supplyOnlyServices: Array<{ label: string; hours: string }> = [];
      // 各サービス種別について「契約あり＋実績なし」を判定
      const supplyVsBilling: Array<{ key: string; label: string; supplyHour: string; hasBilling: boolean }> = [
        { key: '通院等介助(身体介護を伴わない)', label: '通院等介助（身体介護を伴わない）', supplyHour: visitNoBodyHours, hasBilling: billingHasVisit },
        { key: '通院等介助(身体介護を伴う)', label: '通院等介助（身体介護を伴う）', supplyHour: visitBodyHours, hasBilling: billingHasVisit },
        { key: '通院等乗降介助', label: '通院等乗降介助', supplyHour: rideHours, hasBilling: serviceTypes.some(st => st.includes('乗降')) },
        { key: '同行援護', label: '同行援護', supplyHour: accompanyHours, hasBilling: billingHasAccompany },
        { key: '行動援護', label: '行動援護', supplyHour: behaviorHours, hasBilling: billingHasBehavior },
      ];
      for (const svc of supplyVsBilling) {
        if (svc.supplyHour && !svc.hasBilling) {
          supplyOnlyServices.push({ label: svc.label, hours: svc.supplyHour });
          console.log(`[CarePlan] 契約あり＋実績なし検出: ${svc.label}（${svc.supplyHour}時間）→ 備考欄に説明追加`);
        }
      }

      if (supplyOnlyServices.length > 0) {
        const supplyNotes = supplyOnlyServices.map(s =>
          `${s.label}については契約支給量上の保有枠（${s.hours}時間/月）があるが、当該計画期間において実績・定例利用がないため計画予定表には記載していない。必要が生じた場合は、支給決定範囲内で対応する。`
        );
        // 既存の備考に追記（改行で区切る）
        if (remarks) {
          remarks = remarks + '\n\n' + supplyNotes.join('\n');
        } else {
          remarks = supplyNotes.join('\n');
        }
      }
    }

    ws0.mergeCells('K21:K68');
    const remarkCell = ws0.getCell('K21');
    remarkCell.value = remarks;
    remarkCell.alignment = { vertical: 'top', wrapText: true };
  } else {
    // 備考欄がAI出力にない場合でも、「契約あり＋実績なし」のサービスがあれば備考欄を生成
    const supplyOnlyForEmpty: Array<{ label: string; hours: string }> = [];
    const checkPairs: Array<{ label: string; hours: string; hasBilling: boolean }> = [
      { label: '通院等介助（身体介護を伴わない）', hours: visitNoBodyHours, hasBilling: billingHasVisit },
      { label: '通院等介助（身体介護を伴う）', hours: visitBodyHours, hasBilling: billingHasVisit },
      { label: '同行援護', hours: accompanyHours, hasBilling: billingHasAccompany },
      { label: '行動援護', hours: behaviorHours, hasBilling: billingHasBehavior },
    ];
    for (const p of checkPairs) {
      if (p.hours && !p.hasBilling) {
        supplyOnlyForEmpty.push({ label: p.label, hours: p.hours });
      }
    }
    if (supplyOnlyForEmpty.length > 0) {
      const notes = supplyOnlyForEmpty.map(s =>
        `${s.label}については契約支給量上の保有枠（${s.hours}時間/月）があるが、当該計画期間において実績・定例利用がないため計画予定表には記載していない。必要が生じた場合は、支給決定範囲内で対応する。`
      );
      ws0.mergeCells('K21:K68');
      const remarkCell = ws0.getCell('K21');
      remarkCell.value = notes.join('\n');
      remarkCell.alignment = { vertical: 'top', wrapText: true };
      console.log(`[CarePlan] 備考欄なし→契約あり実績なし説明を自動追加: ${supplyOnlyForEmpty.map(s => s.label).join(', ')}`);
    }
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

  for (let blockIdx = 0; blockIdx < serviceBlocks.length; blockIdx++) {
    const block = serviceBlocks[blockIdx];
    const service = allServices[blockIdx];

    // === 「契約あり＆実績なし」のサービスブロックは本体表示から除外 ===
    if (service?.service_type && supplyOnlyLabels.size > 0) {
      const sType = (service.service_type || '').replace(/\s+/g, '');
      if (sType.includes('通院') && (supplyOnlyLabels.has('通院等介助(身体介護を伴う)') || supplyOnlyLabels.has('通院等介助(身体介護を伴わない)'))) {
        console.log(`[CarePlan] サービス${blockIdx + 1}: 通院ブロック「${service.service_type}」を本体表示から除外（契約あり＆実績なし）`);
        continue; // このブロックをスキップ — 行は空欄のまま
      }
      if (sType.includes('同行') && supplyOnlyLabels.has('同行援護')) {
        console.log(`[CarePlan] サービス${blockIdx + 1}: 同行援護ブロックを本体表示から除外`);
        continue;
      }
      if (sType.includes('行動') && supplyOnlyLabels.has('行動援護')) {
        console.log(`[CarePlan] サービス${blockIdx + 1}: 行動援護ブロックを本体表示から除外`);
        continue;
      }
    }

    const steps = service?.steps || [];
    const maxRows = block.dataEndRow - block.dataStartRow + 1; // 8 rows

    console.log(`[CarePlan] サービス${blockIdx + 1}: ${steps.length}件 (${service?.service_type || '未使用'}) → Row${block.dataStartRow}-${block.dataEndRow}`);

    // ★身体介護ステップの体温関連正規化
    // 「訪問時挨拶・体温測定」→「訪問時挨拶・体調確認」
    // 「体温測定」→「体調確認」
    // detail/noteから「毎回体温を測定し」等の前提を「体調を確認する」に変更
    for (const step of steps) {
      if (step.item) {
        step.item = step.item
          .replace(/体温測定・体調確認/g, '体調確認')
          .replace(/体調確認・体温測定/g, '体調確認')
          .replace(/訪問時挨拶・体温測定/g, '訪問時挨拶・体調確認')
          .replace(/^体温測定$/g, '体調確認')
          .replace(/バイタルチェック/g, '体調確認')
          .replace(/バイタル測定/g, '体調確認')
          .replace(/バイタル確認/g, '体調確認');
      }
      if (step.content) {
        step.content = step.content
          .replace(/毎回体温を測定し[、,]?体調を確認する/g, '体調を確認する')
          .replace(/訪問時に挨拶後、毎回体温を測定し体調を確認する/g, '訪問時に挨拶後、体調を確認する')
          .replace(/バイタルチェック/g, '体調確認')
          .replace(/バイタル測定/g, '体調確認');
      }
      if (step.note) {
        step.note = step.note
          .replace(/バイタルチェック/g, '体調確認')
          .replace(/バイタル/g, '体調');
      }
    }

    // カテゴリ別にグルーピング（身体介護→家事援助の順）
    let bodySteps = steps.filter(s => s.category === '身体介護');
    const houseSteps = steps.filter(s => s.category === '家事援助');
    const otherSteps = steps.filter(s => s.category !== '身体介護' && s.category !== '家事援助');
    const hasMultipleCategories = bodySteps.length > 0 && houseSteps.length > 0;

    // ★ 身体介護ステップを current journals 実態に固定置換
    // AI 出力のステップ内容にかかわらず、B89-J93 相当を正規化する
    if (bodySteps.length > 0) {
      const normalizedBodySteps: ServiceStep[] = [
        { item: '訪問時確認', content: '表情・体調・食欲の確認', note: '著変や食欲低下の有無を確認する', category: '身体介護' },
        { item: '服薬確認', content: '本日分の服薬確認と声かけ', note: '漢方薬への抵抗感に配慮し確実な服薬を確認する', category: '身体介護' },
        { item: '排泄介助', content: 'トイレ誘導・排泄後の清拭等を行う', note: '清潔保持と転倒予防に配慮する', category: '身体介護' },
        { item: '食事見守り', content: '食事量・水分摂取量の確認と見守り', note: 'むせ込みや摂取状況に注意する', category: '身体介護' },
        { item: '終了確認', content: '退室前の体調確認と安全確認', note: '不安や訴えを傾聴する', category: '身体介護' },
      ];
      bodySteps = normalizedBodySteps;
      console.log(`[CarePlan] 身体介護ステップを current journals 実態に正規化（${normalizedBodySteps.length}件）`);
    }

    // データ行に書き込み（テンプレートのセル結合済み: B:E, F:I, J:L）
    let rowIdx = 0;
    const writeSteps = (categorySteps: ServiceStep[], categoryLabel?: string) => {
      // カテゴリヘッダー行（複数カテゴリがある場合のみ）
      if (categoryLabel && hasMultipleCategories && rowIdx < maxRows) {
        const row = block.dataStartRow + rowIdx;
        const bCell = ws0.getCell(`B${row}`);
        bCell.value = categoryLabel;
        bCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        bCell.font = { bold: true };
        rowIdx++;
      }
      for (const step of categorySteps) {
        if (rowIdx >= maxRows) break;
        const row = block.dataStartRow + rowIdx;
        const bCell = ws0.getCell(`B${row}`);
        bCell.value = step.item || '';
        bCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const fCell = ws0.getCell(`F${row}`);
        fCell.value = step.content || '';
        setWrapText(fCell);
        const jCell = ws0.getCell(`J${row}`);
        jCell.value = step.note || '';
        setWrapText(jCell);
        rowIdx++;
      }
    };
    if (bodySteps.length > 0) writeSteps(bodySteps, '身体介護');
    if (houseSteps.length > 0) writeSteps(houseSteps, '家事援助');
    if (otherSteps.length > 0) writeSteps(otherSteps);

    // チェックボックス行: service_type + ステップcategoryから判定
    const blockFlags: CheckFlags = {
      body: false, house: false, heavy: false,
      visitBody: false, visitNoBody: false,
      ride: false, behavior: false, accompany: false,
    };

    // 未使用ブロック（ステップなし）はチェック全て未選択のまま
    if (steps.length === 0) {
      // 何もしない — 全てfalseのまま
    } else {
      // 1. service_typeから全種別を判定（最優先・最終権限）
      // ★service_typeが明示的に設定されている場合、そのフラグのみを使い、
      //   categoryやキーワードでの追加フラグ立ては行わない。
      //   これにより「service_type=家事援助なのにcategory由来でbody=trueが追加される」問題を防止。
      //   ただし重度訪問介護は混在OKなので、category由来のbody/houseも追加する。
      if (service?.service_type) {
        const stFlags = serviceTypeToCheckFlags(service.service_type);
        Object.assign(blockFlags, stFlags);
        // 重度訪問介護の場合: categoryからbody/houseを追加（混在OK）
        if (blockFlags.heavy) {
          if (bodySteps.length > 0) blockFlags.body = true;
          if (houseSteps.length > 0) blockFlags.house = true;
        }
      } else {
        // 2. service_typeがない場合のみ、categoryやキーワードでフォールバック
        if (bodySteps.length > 0) blockFlags.body = true;
        if (houseSteps.length > 0) blockFlags.house = true;
        // 3. categoryもない場合のみ、キーワードから推定
        if (!blockFlags.body && !blockFlags.house && !blockFlags.heavy && otherSteps.length > 0) {
          const allText = steps.map(s => `${s.item} ${s.content}`).join(' ');
          if (/排泄|入浴|移動|更衣|整容|体調|バイタル|介助|服薬|移乗|清拭|体位|口腔/.test(allText)) blockFlags.body = true;
          if (/掃除|洗濯|調理|買い物|配膳|片付|ゴミ|献立|食材|環境整備/.test(allText)) blockFlags.house = true;
        }
        // 4. それでもフラグが立たない場合、ステップがあるなら身体介護をデフォルトとする
        if (!blockFlags.body && !blockFlags.house && !blockFlags.heavy && steps.length > 0) {
          blockFlags.body = true;
          console.warn(`[CarePlan] サービス${blockIdx + 1}: 種別判定不能のためデフォルト身体介護`);
        }
        // 5. 混在禁止: 重度訪問介護以外は身体/家事の一方のみ
        if (!blockFlags.heavy && blockFlags.body && blockFlags.house) {
          const st2 = (service?.service_type || '').replace(/\s+/g, '');
          if (st2.includes('家事') || st2.includes('生活')) {
            blockFlags.body = false;
          } else {
            blockFlags.house = false;
          }
        }
      }
    }
    console.log(`[CarePlan] サービス${blockIdx + 1}チェック: body=${blockFlags.body}, house=${blockFlags.house}, heavy=${blockFlags.heavy}, visitBody=${blockFlags.visitBody}, visitNoBody=${blockFlags.visitNoBody}`);

    const chk = block.chkStartRow;
    const chkFont = { name: 'ＭＳ Ｐゴシック', size: 9 };
    const chkAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', wrapText: false, horizontal: 'left' };

    // Row chk (84/97/110/123): B:E結合済み（テンプレート）、F-G, H-Iは未結合→結合して表示
    // テンプレートの B:E 結合を上書き
    ws0.getCell(`B${chk}`).value = checkboxTextBack('身体介護', blockFlags.body);
    ws0.getCell(`B${chk}`).font = chkFont;
    ws0.getCell(`B${chk}`).alignment = chkAlign;
    ws0.getCell(`F${chk}`).value = checkboxTextBack('家事援助', blockFlags.house);
    ws0.getCell(`F${chk}`).font = chkFont;
    ws0.getCell(`F${chk}`).alignment = chkAlign;
    ws0.getCell(`H${chk}`).value = checkboxTextBack('重度訪問介護', blockFlags.heavy);
    ws0.getCell(`H${chk}`).font = chkFont;
    ws0.getCell(`H${chk}`).alignment = chkAlign;

    // Row chk+1 (85/98/111/124): 結合なし→B:E, F:G を結合して長いテキストを収める
    try { ws0.mergeCells(`B${chk + 1}:E${chk + 1}`); } catch { /* already merged */ }
    ws0.getCell(`B${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴う)', blockFlags.visitBody);
    ws0.getCell(`B${chk + 1}`).font = chkFont;
    ws0.getCell(`B${chk + 1}`).alignment = chkAlign;
    try { ws0.mergeCells(`F${chk + 1}:I${chk + 1}`); } catch { /* already merged */ }
    ws0.getCell(`F${chk + 1}`).value = checkboxTextBack('通院等介助(身体介護を伴わない)', blockFlags.visitNoBody);
    ws0.getCell(`F${chk + 1}`).font = chkFont;
    ws0.getCell(`F${chk + 1}`).alignment = chkAlign;

    // Row chk+2 (86/99/112/125): 結合なし→B:E, F:G, H:I を結合
    try { ws0.mergeCells(`B${chk + 2}:E${chk + 2}`); } catch { /* already merged */ }
    ws0.getCell(`B${chk + 2}`).value = checkboxTextBack('通院等乗降介助', blockFlags.ride);
    ws0.getCell(`B${chk + 2}`).font = chkFont;
    ws0.getCell(`B${chk + 2}`).alignment = chkAlign;
    try { ws0.mergeCells(`F${chk + 2}:G${chk + 2}`); } catch { /* already merged */ }
    ws0.getCell(`F${chk + 2}`).value = checkboxTextBack('行動援護', blockFlags.behavior);
    ws0.getCell(`F${chk + 2}`).font = chkFont;
    ws0.getCell(`F${chk + 2}`).alignment = chkAlign;
    try { ws0.mergeCells(`H${chk + 2}:I${chk + 2}`); } catch { /* already merged */ }
    ws0.getCell(`H${chk + 2}`).value = checkboxTextBack('同行援護', blockFlags.accompany);
    ws0.getCell(`H${chk + 2}`).font = chkFont;
    ws0.getCell(`H${chk + 2}`).alignment = chkAlign;
  }

  // === サービス内容引き継ぎ: 前版Excelからサービス内容セルをコピー ===
  if (ctx.inheritServiceContent) {
    try {
      const prevDocs = await loadShogaiCarePlanDocuments(client.id, 'kyotaku');
      // 最新の前版を取得（createdAt降順で最初）
      const prevDoc = prevDocs.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
      if (prevDoc?.fileUrl) {
        console.log('[CarePlan] サービス内容引き継ぎ: 前版を読み込み中...');
        const prevResponse = await fetch(prevDoc.fileUrl);
        if (prevResponse.ok) {
          const prevBuffer = await prevResponse.arrayBuffer();
          const prevWorkbook = new ExcelJS.Workbook();
          await prevWorkbook.xlsx.load(prevBuffer);
          const prevWs = prevWorkbook.getWorksheet('居宅介護計画書（表）') || prevWorkbook.worksheets[0];

          if (prevWs) {
            // サービス内容セル（Row76-125）を前版からコピー
            const serviceCellRefs: string[] = [];
            for (const block of serviceBlocks) {
              for (let row = block.dataStartRow; row <= block.dataEndRow; row++) {
                serviceCellRefs.push(`B${row}`, `F${row}`, `J${row}`);
              }
              // チェックボックス行もコピー
              for (let offset = 0; offset < 3; offset++) {
                const chkRow = block.chkStartRow + offset;
                serviceCellRefs.push(`B${chkRow}`, `F${chkRow}`, `H${chkRow}`);
              }
            }
            // 週間サービス計画表（Row21-68）もコピー
            for (let row = 21; row <= 68; row++) {
              for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
                serviceCellRefs.push(`${col}${row}`);
              }
            }

            let copiedCount = 0;
            for (const ref of serviceCellRefs) {
              const prevCell = prevWs.getCell(ref);
              if (prevCell.value !== null && prevCell.value !== undefined) {
                const newCell = ws0.getCell(ref);
                newCell.value = prevCell.value;
                if (prevCell.alignment) newCell.alignment = prevCell.alignment;
                copiedCount++;
              }
            }
            console.log(`[CarePlan] サービス内容引き継ぎ完了: ${copiedCount}セルコピー`);

            // 矛盾検出: AIが生成したサービス内容と前版を比較
            // （AI指示で同じ内容を返すよう求めているが、念のため前版を強制適用済み）
          }
        }
      }
    } catch (err) {
      console.warn('[CarePlan] サービス内容引き継ぎに失敗（新規生成内容を使用）:', err);
    }
  }

  const outputBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `居宅介護計画書_${client.name}_${year}年${month}月.xlsx`;

  // 自動保存: 利用者情報の居宅介護計画書セクションに保存
  try {
    const file = new File([outputBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const { url: fileUrl } = await uploadCarePlanFile(client.id, 'kyotaku', file);
    await saveShogaiCarePlanDocument({
      id: '',
      careClientId: client.id,
      planCategory: 'kyotaku',
      fileName,
      fileUrl,
      fileSize: file.size,
      notes: `${year}年${month}月分 AI自動生成`,
      sortOrder: 0,
    });
    console.log('[CarePlan] 利用者情報に自動保存完了');
  } catch (err) {
    console.warn('[CarePlan] 利用者情報への自動保存に失敗（ダウンロードは成功）:', err);
  }

  return {
    short_term_goal_months: plan.short_term_goal_months,
    long_term_goal_months: plan.long_term_goal_months,
    period_reasoning: plan.period_reasoning,
    severity_level: plan.severity_level,
    goal_long_text: goalLongText,
    goal_short_text: goalShortText,
    // 手順書生成にサービス内容を引き継ぐ（「契約あり＆実績なし」ブロックは除外）
    serviceBlocks: ([plan.service1, plan.service2, plan.service3, plan.service4].filter(Boolean) as Array<{
      service_type: string;
      visit_label: string;
      steps: Array<{ item: string; content: string; note: string; category?: string }>;
    }>).filter(s => {
      const sType = (s.service_type || '').replace(/\s+/g, '');
      if (sType.includes('通院') && (supplyOnlyLabels.has('通院等介助(身体介護を伴う)') || supplyOnlyLabels.has('通院等介助(身体介護を伴わない)'))) return false;
      if (sType.includes('同行') && supplyOnlyLabels.has('同行援護')) return false;
      if (sType.includes('行動') && supplyOnlyLabels.has('行動援護')) return false;
      return true;
    }),
  };
}
