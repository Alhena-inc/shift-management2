// シフト管理JavaScript（月間カレンダー形式 - PDF完全再現）

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let selectedShift = null;

// Google Sheets API設定
const GOOGLE_SHEETS_CONFIG = {
    apiKey: 'AIzaSyDRoNhwY5oaRolDEp9eUny8_B3l9aTFZ2w',
    spreadsheetId: '1718uvoE5eVthZqypmrbFyHj92T30uSogMSsdSF8-wpA',
    refreshInterval: 60000 // 60秒ごとに更新
};

// 今日の月から自動でシート名を生成
function getCurrentSheetName() {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const year = String(today.getFullYear()).slice(2); // 25
    return `🔴【今月】${year}.${month}月`;
}

let sheetsData = null; // Google Sheetsから取得したデータ
let autoRefreshTimer = null;
let currentDisplayDate = new Date().getDate(); // 今日の日付を使用

// Google Sheets APIからデータを取得（背景色情報も含む）
async function fetchSheetData() {
    try {
        const { apiKey, spreadsheetId } = GOOGLE_SHEETS_CONFIG;
        const sheetName = getCurrentSheetName(); // 月ごとに自動でシート名を生成

        console.log('使用するシート名:', sheetName);
        console.log('Google Sheetsからデータを取得中...');

        // シート全体のデータを取得（範囲を十分に広げる）
        // FT列 = 176列目なので、余裕を持ってHZ列（234列）まで取得
        const valuesRange = `${sheetName}!A1:HZ1000`;
        const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(valuesRange)}?key=${apiKey}`;

        console.log('データ取得範囲:', valuesRange);

        const valuesResponse = await fetch(valuesUrl);
        if (!valuesResponse.ok) {
            const errorData = await valuesResponse.json();
            console.error('Google Sheets API エラー:', errorData);
            throw new Error(`API Error: ${errorData.error?.message || valuesResponse.statusText}`);
        }

        const valuesData = await valuesResponse.json();
        console.log('値データ取得成功');

        if (!valuesData.values || valuesData.values.length === 0) {
            console.warn('シートにデータがありません');
            displayTodaysCare([]);
            return null;
        }

        const rawData = valuesData.values;
        console.log(`取得したデータ: ${rawData.length}行`);
        console.log(`最大列数: ${Math.max(...rawData.map(row => row.length))}列`);

        // 背景色情報を含む詳細データを取得
        const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(sheetName)}!A1:HZ1000&fields=sheets(data(rowData(values(formattedValue,effectiveFormat.backgroundColor))))&key=${apiKey}`;

        console.log('背景色データ取得範囲:', `${sheetName}!A1:HZ1000`);

        const dataResponse = await fetch(dataUrl);
        if (!dataResponse.ok) {
            const errorData = await dataResponse.json();
            console.error('Google Sheets API エラー:', errorData);
            throw new Error(`API Error: ${errorData.error?.message || dataResponse.statusText}`);
        }

        const detailedData = await dataResponse.json();
        console.log('背景色データ取得成功');

        let cellData = null;
        if (detailedData.sheets && detailedData.sheets[0] && detailedData.sheets[0].data && detailedData.sheets[0].data[0]) {
            cellData = detailedData.sheets[0].data[0].rowData;
        }

        parseSheetData(rawData, cellData);

        return rawData;
    } catch (error) {
        console.error('データ取得エラー:', error);
        displayTodaysCare([]);
        return null;
    }
}

// スプレッドシートのデータを解析してシフト情報を抽出
function parseSheetData(rawData, cellData) {
    if (!rawData || rawData.length === 0) return;

    console.log('データ解析開始...');

    // 週ごとの行を動的に検索（固定の行番号を使わない）
    const weekConfigs = [];

    // 全行をスキャンして「○(曜日)」パターンを含む行を日付行として検出
    for (let row = 0; row < rawData.length; row++) {
        const rowData = rawData[row];
        if (!rowData) continue;

        // この行に日付パターン（例: "1(水)", "19(日)"）が含まれているか確認
        let hasDatePattern = false;
        let detectedDates = []; // デバッグ用
        for (let col = 0; col < rowData.length; col++) {
            const cell = String(rowData[col] || '').trim();
            if (/^\d+\([日月火水木金土]\)$/.test(cell)) {
                hasDatePattern = true;
                detectedDates.push(`${cell}@列${col}`);
            }
        }

        if (hasDatePattern) {
            // この行が日付行
            // 次の行がヘルパー行、その次の行からケア内容開始
            weekConfigs.push({
                dateRow: row,
                helperRow: row + 1,
                careStartRow: row + 2,
                careEndRow: row + 21  // 20行分のケア内容
            });
            console.log(`週${weekConfigs.length}を検出: 日付行=${row + 1} (Excel行=${row + 1}), ヘルパー行=${row + 2}, ケア行=${row + 3}〜${row + 22}`);
            console.log(`  検出された日付: ${detectedDates.join(', ')}`);
        }
    }

    // 表示日付を取得
    const today = currentDisplayDate;
    console.log('表示日付:', today);

    // ステップ1: 全ての週の日付行から、全ての日付とその列位置を収集
    const allDates = []; // { date: 16, row: 63, col: 76, weekIndex: 2 }
    weekConfigs.forEach((config, weekIndex) => {
        if (config.dateRow >= rawData.length) return;
        const dateRow = rawData[config.dateRow];
        if (!dateRow) return;

        for (let col = 0; col < dateRow.length; col++) {
            const dateCell = String(dateRow[col] || '').trim();
            // 厳密に「数字(曜日)」の形式のみマッチ（例：9(木)、19(土)）
            const dateMatch = dateCell.match(/^(\d+)\([日月火水木金土]\)$/);
            if (dateMatch) {
                allDates.push({
                    date: parseInt(dateMatch[1]),
                    row: config.dateRow,
                    col: col,
                    weekIndex: weekIndex,
                    config: config,
                    cellValue: dateCell
                });
                console.log(`  日付検出: ${dateCell} (週${weekIndex + 1}, 行${config.dateRow + 1} (Excel行=${config.dateRow + 1}), 列${col}, ヘルパー行=${config.helperRow + 1}, ケア行=${config.careStartRow + 1})`);
            }
        }
    });

    console.log(`全日付を検出: ${allDates.length}個`);

    // ステップ2: 該当日付を探す
    const targetDateInfo = allDates.find(d => d.date === today);

    if (!targetDateInfo) {
        console.warn(`${today}日の日付が見つかりませんでした`);
        displayTodaysCare([]);
        return [];
    }

    console.log(`該当日付を発見！ 週${targetDateInfo.weekIndex + 1}, 行: ${targetDateInfo.row + 1} (Excel行=${targetDateInfo.row + 1}), 開始列: ${targetDateInfo.col}, 日付: ${targetDateInfo.date}`);
    console.log(`使用する設定: 日付行=${targetDateInfo.config.dateRow + 1} (Excel行=${targetDateInfo.config.dateRow + 1}), ヘルパー行=${targetDateInfo.config.helperRow + 1} (Excel行=${targetDateInfo.config.helperRow + 1}), ケア開始行=${targetDateInfo.config.careStartRow + 1} (Excel行=${targetDateInfo.config.careStartRow + 1})`);

    // ステップ3: ヘルパー行全体をスキャンして、該当日付の範囲内のヘルパーを全て見つける
    const helperRow = rawData[targetDateInfo.config.helperRow];
    const helperColumns = [];

    console.log(`ヘルパー行: ${targetDateInfo.config.helperRow + 1} (Excel行=${targetDateInfo.config.helperRow + 1})`);
    console.log(`ヘルパー行の長さ: ${helperRow ? helperRow.length : 0}列`);
    console.log(`開始列: ${targetDateInfo.col}`);

    // 該当日付のセルから右側のヘルパーを探す
    // 次の日付が見つかるまで、または空白セルが連続するまでスキャン
    let consecutiveEmptyCells = 0;
    const maxEmptyCells = 5; // 連続5セル空白で終了

    for (let col = targetDateInfo.col; col < helperRow.length; col++) {
        const helperName = String(helperRow && helperRow[col] ? helperRow[col] : '').trim();

        // 次の日付セルに到達したら終了
        const dateCell = String(rawData[targetDateInfo.row][col] || '').trim();
        if (col > targetDateInfo.col && /^\d+\([日月火水木金土]\)$/.test(dateCell)) {
            console.log(`次の日付を検出: ${dateCell} (列${col})、スキャン終了`);
            break;
        }

        if (helperName) {
            helperColumns.push({ col: col, name: helperName });
            console.log(`  列${col}: "${helperName}" を追加`);
            consecutiveEmptyCells = 0;
        } else {
            consecutiveEmptyCells++;
            if (consecutiveEmptyCells >= maxEmptyCells) {
                console.log(`連続${maxEmptyCells}列が空白、スキャン終了`);
                break;
            }
        }
    }

    console.log(`ヘルパー数: ${helperColumns.length}人`);

    // ステップ5: 各ヘルパーのケア内容を取得
    const foundData = [];

    helperColumns.forEach(({ col, name }) => {
        console.log(`  処理中: ${name} (列${col})`);
        console.log(`    ケア内容範囲: 行${targetDateInfo.config.careStartRow + 1}〜${targetDateInfo.config.careEndRow + 1} (Excel行=${targetDateInfo.config.careStartRow + 1}〜${targetDateInfo.config.careEndRow + 1})`);

        // この列の全ケア内容を取得（行番号付き）
        const allRows = [];
        for (let row = targetDateInfo.config.careStartRow; row <= targetDateInfo.config.careEndRow && row < rawData.length; row++) {
            const careRow = rawData[row];
            const content = careRow && careRow[col] ? String(careRow[col]).trim() : '';

            if (content) {
                // 背景色をチェック
                let isRed = false;
                if (cellData && cellData[row] && cellData[row].values && cellData[row].values[col]) {
                    const cell = cellData[row].values[col];
                    const bgColor = cell.effectiveFormat?.backgroundColor;
                    isRed = bgColor && bgColor.red > 0.8 && bgColor.green < 0.3 && bgColor.blue < 0.3;
                }

                const hasCancelText = content.includes('キャンセル') || content.includes('CANCEL') || content.toLowerCase().includes('cancel');

                allRows.push({
                    row: row,
                    content: content,
                    isCancel: isRed || hasCancelText
                });
            }
        }

        console.log(`    取得した全行数: ${allRows.length}`);

        // 各行をグループに分ける（時間帯または利用者名(サービス)で新グループ開始）
        const careGroups = [];
        const cancelledGroups = [];
        let currentGroup = [];
        let groupHasCancel = false;

        allRows.forEach((rowData, index) => {
            const content = rowData.content;
            const isTimeSlot = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(content) || /^\d{1,2}:\d{2}$/.test(content);
            const isUserWithService = /^.+?\(.+?\)$/.test(content); // 例: "辻本(重度)", "特別(事務)"

            // 新しいグループを開始する条件：
            // 1. 時間帯（例: 8:30-10:00）
            // 2. 利用者名(サービス)（例: 辻本(重度)、特別(事務)）で、かつ既にグループに内容がある場合
            if (isTimeSlot || (isUserWithService && currentGroup.length > 0)) {
                // 前のグループを保存
                if (currentGroup.length > 0) {
                    if (groupHasCancel) {
                        console.log(`    キャンセルグループを保存: ${currentGroup.map(r => r.content).join(', ')}`);
                        cancelledGroups.push([...currentGroup]);
                    } else {
                        careGroups.push([...currentGroup]);
                    }
                }
                // 新しいグループ開始
                currentGroup = [rowData];
                groupHasCancel = rowData.isCancel;
            } else {
                // 既存グループに追加
                currentGroup.push(rowData);
                if (rowData.isCancel) {
                    groupHasCancel = true;
                }
            }
        });

        // 最後のグループを保存
        if (currentGroup.length > 0) {
            if (groupHasCancel) {
                console.log(`    最終キャンセルグループを保存: ${currentGroup.map(r => r.content).join(', ')}`);
                cancelledGroups.push(currentGroup);
            } else {
                careGroups.push(currentGroup);
            }
        }

        console.log(`    通常グループ数: ${careGroups.length}`);
        console.log(`    キャンセルグループ数: ${cancelledGroups.length}`);

        // 通常グループを先に統合（キャンセル情報を保持）
        const careContents = [];
        careGroups.forEach(group => {
            group.forEach(rowData => {
                careContents.push({
                    text: rowData.content,
                    isCancelled: false
                });
            });
        });

        // キャンセルグループを後に統合（キャンセルフラグ付き）
        cancelledGroups.forEach(group => {
            group.forEach(rowData => {
                careContents.push({
                    text: rowData.content,
                    isCancelled: true
                });
            });
        });

        if (careContents.length > 0) {
            foundData.push({
                week: targetDateInfo.weekIndex + 1,
                column: col,
                date: today,
                helperName: name,
                careContents: careContents
            });
            console.log(`    ${name}: ${careContents.length}件のケア内容`);
        } else {
            console.log(`    ${name}: ケア内容なし`);
        }
    });

    console.log(`${today}日のケア内容: ${foundData.length}人分`);

    // 今日のケア内容を表示
    displayTodaysCare(foundData);

    return foundData;
}

// 今日のケア内容を表示
function displayTodaysCare(careData) {
    const section = document.getElementById('todays-care-section');
    const dateDisplay = document.getElementById('todays-date-display');
    const listContainer = document.getElementById('todays-care-list');

    if (!section || !dateDisplay || !listContainer) {
        console.error('表示エリアが見つかりません', {
            section: !!section,
            dateDisplay: !!dateDisplay,
            listContainer: !!listContainer
        });
        return;
    }

    // ログインユーザー情報を取得
    const currentUser = sessionStorage.getItem('currentUser');
    let loggedInHelperName = null;

    if (currentUser) {
        try {
            const user = JSON.parse(currentUser);
            loggedInHelperName = user.lastName; // 姓のみで比較
            console.log('ログイン中のヘルパー:', loggedInHelperName);
        } catch (error) {
            console.error('ユーザー情報の取得エラー:', error);
        }
    }

    // ログインユーザーのケア内容のみをフィルタリング
    const filteredCareData = loggedInHelperName
        ? careData.filter(data => data.helperName === loggedInHelperName)
        : careData;

    console.log(`フィルタリング前: ${careData.length}人分, フィルタリング後: ${filteredCareData.length}人分`);

    if (!filteredCareData || filteredCareData.length === 0) {
        section.style.display = 'block';
        listContainer.innerHTML = `<div style="text-align: center; padding: 3rem; color: #999; font-size: 1.1rem;"><i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>${loggedInHelperName ? `${loggedInHelperName}さんの今日のケア内容はありません` : '今日のケア内容はありません'}</div>`;
        console.log('今日のケア内容はありません');
        return;
    }

    // 今日の日付を表示
    const today = new Date();
    const displayDate = currentDisplayDate; // 表示日付を使用
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${displayDate}日`;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    // 表示日付の曜日を計算
    const targetDate = new Date(today.getFullYear(), today.getMonth(), displayDate);
    const weekdayStr = weekdays[targetDate.getDay()];
    dateDisplay.textContent = `${dateStr}(${weekdayStr})`;

    // 全てのケア内容を時間順に統合
    let allCareItems = [];

    filteredCareData.forEach((helperData) => {
        const careItems = parseCareContent(helperData.careContents);
        careItems.forEach(item => {
            allCareItems.push({
                ...item,
                helperName: helperData.helperName,
                week: helperData.week
            });
        });
    });

    // 時間順にソート（開始時間を数値に変換して比較）
    allCareItems.sort((a, b) => {
        const timeA = a.time ? a.time.split('-')[0] : '99:99';
        const timeB = b.time ? b.time.split('-')[0] : '99:99';

        // "9:00" を "09:00" に正規化
        const normalizeTime = (time) => {
            const parts = time.split(':');
            const hour = parts[0].padStart(2, '0');
            const minute = parts[1] || '00';
            return `${hour}:${minute}`;
        };

        const normalizedA = normalizeTime(timeA);
        const normalizedB = normalizeTime(timeB);

        return normalizedA.localeCompare(normalizedB);
    });

    // ケア内容リストを生成（時間順・ダッシュボード風カード形式）
    let html = '';

    if (allCareItems.length > 0) {
        // 表示日付と現在日付を比較してステータスを判定
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute; // 分単位に変換
        const currentDate = now.getDate(); // 現在の日
        const displayDate = currentDisplayDate; // 表示日付を使用

        // 通常のケアとキャンセルのケアを分ける
        const normalCareItems = allCareItems.filter(item => !item.isCancelled);
        const cancelledCareItems = allCareItems.filter(item => item.isCancelled);

        // 通常のケアを表示
        normalCareItems.forEach(item => {
            // 時刻からステータスを判定
            let statusClass = 'status-scheduled'; // デフォルトは予定
            let statusText = '予定';

            // 表示日付が現在日付より未来なら、全て「予定」
            if (displayDate > currentDate) {
                statusClass = 'status-scheduled';
                statusText = '予定';
            }
            // 表示日付が現在日付より過去なら、全て「終了」
            else if (displayDate < currentDate) {
                statusClass = 'status-completed';
                statusText = '終了';
            }
            // 表示日付が今日なら、時刻で判定
            else if (displayDate === currentDate && item.time) {
                // 時刻を解析（例: "09:00-11:00"）
                const timeMatch = item.time.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
                if (timeMatch) {
                    const startHour = parseInt(timeMatch[1]);
                    const startMinute = parseInt(timeMatch[2]);
                    const endHour = parseInt(timeMatch[3]);
                    const endMinute = parseInt(timeMatch[4]);

                    const startTime = startHour * 60 + startMinute;
                    const endTime = endHour * 60 + endMinute;

                    // ステータス判定
                    if (currentTime >= endTime) {
                        statusClass = 'status-completed';
                        statusText = '終了';
                    } else if (currentTime >= startTime && currentTime < endTime) {
                        statusClass = 'status-in-progress';
                        statusText = '介入中';
                    } else {
                        statusClass = 'status-scheduled';
                        statusText = '予定';
                    }
                }
            }

            // 終了ステータスの場合、自動的にポイントを加算
            if (statusClass === 'status-completed') {
                autoAddPointsForCompletedCare(item.helperName, item.user, item.serviceType, item.time);
            }

            html += `
                <div class="shift-card">
                    <div class="shift-time-badge">
                        <i class="far fa-clock"></i>
                        ${item.time || '時間未設定'}
                    </div>
                    <div class="shift-card-content">
                        <div class="shift-card-info">
                            <div class="shift-helper">
                                <i class="fas fa-user-nurse"></i>
                                ${item.helperName || '不明'}
                            </div>
                            <div class="shift-user">
                                <i class="fas fa-user"></i>
                                ${item.user || '利用者未設定'}
                            </div>
                            ${item.serviceType ? `
                            <div class="shift-care-type">
                                <i class="fas fa-clipboard-list"></i>
                                ケア内容: ${item.serviceType}${item.hours ? ` (${item.hours}時間)` : ''}
                            </div>
                            ` : ''}
                            ${item.location ? `
                            <div class="shift-service-type">
                                <i class="fas fa-map-marker-alt"></i>
                                ${item.location}
                            </div>
                            ` : ''}
                        </div>
                        <div class="shift-status ${statusClass}">${statusText}</div>
                    </div>
                </div>
            `;
        });

        // キャンセルのケアを一番下に表示
        cancelledCareItems.forEach(item => {
            html += `
                <div class="shift-card" style="opacity: 0.6; background: #f5f5f5;">
                    <div class="shift-time-badge" style="background: #999;">
                        <i class="far fa-clock"></i>
                        ${item.time || '時間未設定'}
                    </div>
                    <div class="shift-card-content">
                        <div class="shift-card-info">
                            <div class="shift-helper">
                                <i class="fas fa-user-nurse"></i>
                                ${item.helperName || '不明'}
                            </div>
                            <div class="shift-user">
                                <i class="fas fa-user"></i>
                                ${item.user || '利用者未設定'}
                            </div>
                            ${item.serviceType ? `
                            <div class="shift-care-type">
                                <i class="fas fa-clipboard-list"></i>
                                ケア内容: ${item.serviceType}${item.hours ? ` (${item.hours}時間)` : ''}
                            </div>
                            ` : ''}
                            ${item.location ? `
                            <div class="shift-service-type">
                                <i class="fas fa-map-marker-alt"></i>
                                ${item.location}
                            </div>
                            ` : ''}
                        </div>
                        <div class="shift-status status-cancelled" style="background: #ef5350; color: white;">キャンセル</div>
                    </div>
                </div>
            `;
        });
    } else {
        html = '<div style="text-align: center; padding: 3rem; color: #999; font-size: 1.1rem;">今日のケア内容はありません</div>';
    }

    listContainer.innerHTML = html;
    section.style.display = 'block';

    console.log('今日のケア内容を時間順に表示しました:', allCareItems.length + '件');
}

// 終了したケアに対して自動的にポイントを加算（重複加算を防ぐ）
function autoAddPointsForCompletedCare(helperName, userName, serviceType, time) {
    // ケアの一意なキーを生成（日付 + ヘルパー名 + 利用者名 + 時間）
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(currentDisplayDate).padStart(2, '0')}`;
    const careKey = `${dateStr}_${helperName}_${userName}_${time}`;

    // 既に加算済みかチェック
    let completedCares = JSON.parse(localStorage.getItem('completedCares') || '[]');
    if (completedCares.includes(careKey)) {
        console.log('既にポイント加算済み:', careKey);
        return; // 既に加算済みの場合は何もしない
    }

    // 利用者情報からケアポイントを取得
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.lastName === userName);

    if (!user || !user.carePoints) {
        console.log('ケアポイント未設定:', userName);
        return;
    }

    const points = parseInt(user.carePoints);

    // ヘルパー情報からヘルパーIDを取得（部分一致も対応）
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
    let helper = helpers.find(h => h.lastName === helperName);
    if (!helper) {
        helper = helpers.find(h => h.lastName && h.lastName.includes(helperName));
    }
    if (!helper) {
        helper = helpers.find(h => helperName && helperName.includes(h.lastName));
    }

    if (!helper) {
        console.error('ヘルパーが見つかりません:', { helperName, availableHelpers: helpers.map(h => h.lastName) });
        return;
    }

    console.log(`自動ポイント加算: ${helperName}さんに${points}ポイントを加算 (利用者: ${userName})`);

    // ポイントを加算
    addPointsToHelper(helper.id, helperName, points, userName, serviceType);

    // 加算済みリストに追加
    completedCares.push(careKey);
    localStorage.setItem('completedCares', JSON.stringify(completedCares));
}

// ヘルパーにポイントを加算（points.jsと共通で使用）
function addPointsToHelper(helperId, helperName, points, userName, careType) {
    // ヘルパーポイントを更新
    let helperPoints = JSON.parse(localStorage.getItem('helperPoints') || '[]');
    let helper = helperPoints.find(h => h.id === helperId);

    if (helper) {
        helper.totalPoints += points;
        helper.completedCares += 1;
        helper.name = helperName; // 名前を最新に更新
    } else {
        helperPoints.push({
            id: helperId,
            name: helperName,
            totalPoints: points,
            completedCares: 1
        });
    }

    // ポイント履歴を追加
    let pointsHistory = JSON.parse(localStorage.getItem('pointsHistory') || '[]');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    pointsHistory.unshift({
        date: dateStr,
        helperId: helperId,
        helperName: helperName,
        userName: userName,
        points: points,
        careType: careType
    });

    // LocalStorageに保存
    localStorage.setItem('helperPoints', JSON.stringify(helperPoints));
    localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));

    console.log(`ポイント加算: ${helperName} (ID: ${helperId}) に ${points}pt 加算しました`);
}

// ケア内容を解析（キャンセル情報も含む）
function parseCareContent(contentArray) {
    if (!contentArray || contentArray.length === 0) return [];

    const items = [];
    let currentItem = null;

    contentArray.forEach((contentObj, index) => {
        // contentObjは {text: "...", isCancelled: true/false} の形式
        const line = typeof contentObj === 'string' ? contentObj : contentObj.text;
        const isCancelled = typeof contentObj === 'object' ? contentObj.isCancelled : false;
        const trimmed = line.trim();

        // 時間の検出（2パターン）
        const timeRangeMatch = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.test(trimmed);
        const singleTimeMatch = /^\d{1,2}:\d{2}$/.test(trimmed);
        const isUserWithService = /^.+?\(.+?\)$/.test(trimmed); // 例: "辻本(重度)", "特別(事務)"

        if (timeRangeMatch || singleTimeMatch) {
            // 時間帯がある → 前のアイテムを保存して新しいアイテム開始
            if (currentItem) {
                items.push(currentItem);
            }
            currentItem = {
                time: trimmed,
                user: null,
                serviceType: null,
                hours: null,
                location: null,
                isCancelled: isCancelled
            };
        } else if (isUserWithService) {
            // 利用者名(サービス)パターン
            const match = trimmed.match(/^(.+?)\((.+?)\)/);

            if (currentItem) {
                // 既存のアイテムに利用者情報を追加
                if (!currentItem.user) {
                    currentItem.user = match ? match[1] : trimmed;
                    currentItem.serviceType = match ? match[2] : null;
                } else {
                    // 既に利用者がいる場合は新しいアイテムとして作成（時間帯なし）
                    items.push(currentItem);
                    currentItem = {
                        time: null,
                        user: match ? match[1] : trimmed,
                        serviceType: match ? match[2] : null,
                        hours: null,
                        location: null,
                        isCancelled: isCancelled
                    };
                }
            } else {
                // アイテムがない場合は新規作成（時間帯なし）
                currentItem = {
                    time: null,
                    user: match ? match[1] : trimmed,
                    serviceType: match ? match[2] : null,
                    hours: null,
                    location: null,
                    isCancelled: isCancelled
                };
            }
        } else if (currentItem) {
            // その他のデータ（時間数、場所など）
            if (isCancelled) {
                currentItem.isCancelled = true;
            }

            if (/^\d+\.?\d*$/.test(trimmed)) {
                currentItem.hours = trimmed;
            } else if (trimmed.endsWith('区') || trimmed.endsWith('市') || trimmed.endsWith('事務所')) {
                currentItem.location = trimmed;
            } else if (!currentItem.user && trimmed.length > 0) {
                currentItem.user = trimmed;
            }
        }
    });

    if (currentItem) {
        items.push(currentItem);
    }

    return items;
}

// 自動更新を開始
function startAutoRefresh() {
    // 既存のタイマーをクリア
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }

    // 初回データ取得
    fetchSheetData();

    // 定期的にデータを更新
    autoRefreshTimer = setInterval(async () => {
        console.log('自動更新: データを再取得中...');
        await fetchSheetData();
    }, GOOGLE_SHEETS_CONFIG.refreshInterval);

    console.log(`自動更新を開始しました（${GOOGLE_SHEETS_CONFIG.refreshInterval / 1000}秒ごと）`);
}

// 自動更新を停止
function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
        console.log('自動更新を停止しました');
    }
}

// 月の日数を取得
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// 曜日を取得
function getWeekday(year, month, day) {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(year, month, day);
    return weekdays[date.getDay()];
}

// 月タイトルを更新
function updateMonthTitle() {
    document.getElementById('current-month-title').textContent = `${currentYear}年${currentMonth + 1}月`;
}

// 週番号を計算（その月の第何週目か）
function getWeekNumber(day) {
    return Math.floor((day - 1) / 7) + 1;
}

// 月間シフトテーブルを描画（PDF完全再現）
function renderMonthTable() {
    const table = document.getElementById('shift-month-table');
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    // デバッグ: ヘルパーの性別データを確認
    console.log('ヘルパーデータ:', helpers.map(h => ({ name: h.lastName, gender: h.gender })));

    if (helpers.length === 0) {
        table.innerHTML = '<tr><td style="padding: 2rem; text-align: center; color: #999;">ヘルパーが登録されていません</td></tr>';
        return;
    }

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);

    // 月曜始まりのカレンダー形式で週ごとにグループ化
    const weeks = [];
    let currentWeek = [];

    // 月初の曜日を取得（0=日曜, 1=月曜, ..., 6=土曜）
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

    // 月曜始まりに調整（日曜=6, 月曜=0, 火曜=1, ...）
    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    // 月初前の空白セルを追加（グレーアウト用）
    for (let i = 0; i < startOffset; i++) {
        currentWeek.push(null); // nullは空白セル
    }

    // 実際の日付を追加
    for (let day = 1; day <= daysInMonth; day++) {
        currentWeek.push(day);

        // 日曜日（週の最後）または月末で週を区切る
        const weekday = getWeekday(currentYear, currentMonth, day);
        if (weekday === '日' || day === daysInMonth) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }
    }

    let html = '<thead>';

    // 週ごとにテーブルを作成
    weeks.forEach((week, weekIndex) => {
        // 日付ヘッダー行
        html += '<tr class="week-header-row">';
        week.forEach(day => {
            const colSpan = helpers.length;
            if (day === null) {
                // グレーアウトセル（空白）
                html += `<th class="date-header empty-date-header" colspan="${colSpan}"></th>`;
            } else {
                const weekday = getWeekday(currentYear, currentMonth, day);
                html += `<th class="date-header" colspan="${colSpan}">${day}(${weekday})</th>`;
            }
        });
        html += '</tr>';

        // ヘルパー名ヘッダー行
        html += '<tr class="helper-header-row">';
        week.forEach(day => {
            helpers.forEach(helper => {
                // 姓だけを抽出（スペースで区切られている場合は最初の部分のみ）
                const displayName = helper.lastName ? helper.lastName.split(/\s+/)[0] : '';

                // 性別による色分け
                const genderClass = helper.gender === '男性' ? 'helper-male' :
                                   helper.gender === '女性' ? 'helper-female' : '';

                if (day === null) {
                    // グレーアウトセル（苗字は表示）
                    html += `<th class="helper-name-cell empty-helper-cell ${genderClass}">${displayName}</th>`;
                } else {
                    html += `<th class="helper-name-cell ${genderClass}">${displayName}</th>`;
                }
            });
        });
        html += '</tr>';

        html += '</thead><tbody>';

        // シフトデータ行（最大10行を想定）
        const maxRows = 10;

        for (let row = 0; row < maxRows; row++) {
            html += '<tr class="shift-data-row">';

            week.forEach(day => {
                if (day === null) {
                    // グレーアウトセル（空白）
                    helpers.forEach(() => {
                        html += '<td class="empty-shift-cell grayed-out-cell"></td>';
                    });
                } else {
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    helpers.forEach(helper => {
                        const shiftsForDay = getShiftsByHelperAndDate(helper.id, dateStr);
                        const shift = shiftsForDay[row];

                        if (shift) {
                            const bgColor = getServiceTypeColor(shift.serviceType);
                            html += `<td class="shift-cell" style="background-color: ${bgColor};" data-shift-id="${shift.id}">`;
                            html += `<div class="shift-time">${shift.startTime}-${shift.endTime}</div>`;
                            html += `<div class="shift-user">${shift.userName || ''}</div>`;
                            if (shift.serviceHours) {
                                html += `<div class="shift-hours">${shift.serviceHours}</div>`;
                            }
                            if (shift.location) {
                                html += `<div class="shift-location">${shift.location}</div>`;
                            }
                            html += `</td>`;
                        } else {
                            html += '<td class="empty-shift-cell"></td>';
                        }
                    });
                }
            });

            html += '</tr>';
        }

        // 週の区切り行
        if (weekIndex < weeks.length - 1) {
            html += `</tbody><thead><tr class="week-separator"><td colspan="${week.length * helpers.length}" class="week-label">${weekIndex + 1}週目</td></tr>`;
        }
    });

    html += '</tbody>';

    // 集計行を追加
    html += renderSummaryRows(helpers, daysInMonth);

    table.innerHTML = html;

    // シフトセルクリックイベント
    setupShiftCellClick();
    updateMonthTitle();
}

// 集計行を描画
function renderSummaryRows(helpers, daysInMonth) {
    const serviceTypes = ['身体', '重度', '家事', '通院', '移動', '事務', '営業', '同行'];

    let html = '<tbody class="summary-section">';

    serviceTypes.forEach(serviceType => {
        html += `<tr class="summary-row">`;
        html += `<td class="summary-label" colspan="${helpers.length}">${serviceType}</td>`;

        // 各ヘルパーの合計を計算
        helpers.forEach(helper => {
            let total = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const shifts = getShiftsByHelperAndDate(helper.id, dateStr);

                shifts.forEach(shift => {
                    if (shift.serviceType === serviceType && shift.serviceHours) {
                        total += parseFloat(shift.serviceHours);
                    }
                });
            }

            html += `<td class="summary-cell">${total > 0 ? total.toFixed(1) : '0.0'}</td>`;
        });

        html += '</tr>';
    });

    html += '</tbody>';

    return html;
}

// ヘルパーと日付でシフトを取得
function getShiftsByHelperAndDate(helperId, dateStr) {
    const shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
    return shifts.filter(shift => shift.helperId === helperId && shift.date === dateStr);
}

// サービス種別による色を取得
function getServiceTypeColor(serviceType) {
    const colorMap = {
        '家事': '#FFEB3B',
        '重度': '#FF9800',
        '身体': '#FFB3BA',
        '移動': '#BAE1FF',
        '通院': '#BAFFC9',
        '同行': '#E0BBE4',
        '行動援護': '#FFD9B3',
        '事務': '#E0E0E0',
        '営業': '#D0D0D0'
    };
    return colorMap[serviceType] || '#F5F5F5';
}

// シフトセルクリックイベント
function setupShiftCellClick() {
    const shiftCells = document.querySelectorAll('.shift-cell[data-shift-id]');

    shiftCells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const shiftId = cell.dataset.shiftId;
            showEditShiftModal(shiftId);
        });
    });
}

// 前月ボタン
function setupPrevMonthButton() {
    const btn = document.getElementById('prev-month-btn');
    btn.addEventListener('click', () => {
        currentMonth--;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        }
        renderMonthTable();
    });
}

// 次月ボタン
function setupNextMonthButton() {
    const btn = document.getElementById('next-month-btn');
    btn.addEventListener('click', () => {
        currentMonth++;
        if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderMonthTable();
    });
}

// シフト追加モーダル
function setupAddShiftModal() {
    const addBtn = document.getElementById('add-shift-btn');
    const modal = document.getElementById('add-shift-modal');
    const closeBtn = document.getElementById('shift-modal-close');
    const cancelBtn = document.getElementById('cancel-shift');
    const form = document.getElementById('shift-form');

    addBtn.addEventListener('click', () => {
        loadHelpersToSelect();
        loadUsersToSelect();
        modal.classList.add('show');
        form.reset();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const helperId = document.getElementById('shift-helper').value;
        const userId = document.getElementById('shift-user').value;
        const startTime = document.getElementById('shift-start-time').value;
        const endTime = document.getElementById('shift-end-time').value;
        const serviceType = document.getElementById('shift-service-type').value;
        const serviceHours = document.getElementById('shift-service-hours').value;
        const location = document.getElementById('shift-location').value;

        // 日付を入力させる
        const dateStr = prompt(`日付を入力してください（例：${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01）:`,
                               `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`);

        if (!dateStr) {
            alert('日付が入力されませんでした');
            return;
        }

        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const helper = helpers.find(h => h.id === helperId);
        const user = users.find(u => u.id === userId);

        const shift = {
            id: generateShiftId(),
            date: dateStr,
            helperId,
            helperName: helper ? helper.lastName : '',
            userId,
            userName: user ? user.lastName : '',
            startTime,
            endTime,
            serviceType,
            serviceHours,
            location
        };

        const shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
        shifts.push(shift);
        localStorage.setItem('shifts', JSON.stringify(shifts));

        modal.classList.remove('show');
        renderMonthTable();
        alert('シフトを追加しました');
    });
}

// シフト編集モーダル
function setupEditShiftModal() {
    const modal = document.getElementById('edit-shift-modal');
    const closeBtn = document.getElementById('edit-modal-close');
    const cancelBtn = document.getElementById('cancel-edit');
    const deleteBtn = document.getElementById('delete-shift-btn');
    const form = document.getElementById('edit-shift-form');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    deleteBtn.addEventListener('click', () => {
        if (!selectedShift) return;

        if (confirm('このシフトを削除しますか？')) {
            const shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
            const filtered = shifts.filter(s => s.id !== selectedShift.id);
            localStorage.setItem('shifts', JSON.stringify(filtered));

            modal.classList.remove('show');
            renderMonthTable();
            alert('シフトを削除しました');
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        if (!selectedShift) return;

        const shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
        const shiftIndex = shifts.findIndex(s => s.id === selectedShift.id);

        if (shiftIndex === -1) return;

        const helperId = document.getElementById('edit-shift-helper').value;
        const userId = document.getElementById('edit-shift-user').value;
        const startTime = document.getElementById('edit-shift-start-time').value;
        const endTime = document.getElementById('edit-shift-end-time').value;
        const serviceType = document.getElementById('edit-shift-service-type').value;
        const serviceHours = document.getElementById('edit-shift-service-hours').value;
        const location = document.getElementById('edit-shift-location').value;

        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const helper = helpers.find(h => h.id === helperId);
        const user = users.find(u => u.id === userId);

        shifts[shiftIndex] = {
            ...shifts[shiftIndex],
            helperId,
            helperName: helper ? helper.lastName : '',
            userId,
            userName: user ? user.lastName : '',
            startTime,
            endTime,
            serviceType,
            serviceHours,
            location
        };

        localStorage.setItem('shifts', JSON.stringify(shifts));

        modal.classList.remove('show');
        renderMonthTable();
        alert('シフトを更新しました');
    });
}

// シフト編集モーダルを表示
function showEditShiftModal(shiftId) {
    const shifts = JSON.parse(localStorage.getItem('shifts') || '[]');
    const shift = shifts.find(s => s.id === shiftId);

    if (!shift) return;

    selectedShift = shift;

    loadHelpersToSelect('edit-shift-helper');
    loadUsersToSelect('edit-shift-user');

    document.getElementById('edit-shift-helper').value = shift.helperId;
    document.getElementById('edit-shift-user').value = shift.userId;
    document.getElementById('edit-shift-start-time').value = shift.startTime;
    document.getElementById('edit-shift-end-time').value = shift.endTime;
    document.getElementById('edit-shift-service-type').value = shift.serviceType || '';
    document.getElementById('edit-shift-service-hours').value = shift.serviceHours || '';
    document.getElementById('edit-shift-location').value = shift.location || '';

    document.getElementById('edit-shift-modal').classList.add('show');
}

// シフトIDを生成
function generateShiftId() {
    return 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ヘルパーをセレクトボックスに読み込み
function loadHelpersToSelect(selectId = 'shift-helper') {
    const select = document.getElementById(selectId);
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    select.innerHTML = '<option value="">選択してください</option>';
    helpers.forEach(helper => {
        const option = document.createElement('option');
        option.value = helper.id;
        option.textContent = helper.lastName;
        select.appendChild(option);
    });
}

// 利用者をセレクトボックスに読み込み
function loadUsersToSelect(selectId = 'shift-user') {
    const select = document.getElementById(selectId);
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    select.innerHTML = '<option value="">選択してください</option>';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.lastName;
        select.appendChild(option);
    });
}

// 日付表示を更新
function updateDateDisplay() {
    const dateDisplay = document.getElementById('todays-date-display');
    if (!dateDisplay) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const targetDate = new Date(year, month - 1, currentDisplayDate);
    const weekday = weekdays[targetDate.getDay()];

    dateDisplay.textContent = `${year}年${month}月${currentDisplayDate}日（${weekday}）`;
}

// 読み込み中表示を設定
function showLoading() {
    const listContainer = document.getElementById('todays-care-list');
    const section = document.getElementById('todays-care-section');

    if (listContainer) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #999; font-size: 1.1rem;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                読み込み中...
            </div>
        `;
    }

    if (section) {
        section.style.display = 'block';
    }
}

// 日付ナビゲーションボタンのイベント設定
function setupDateNavigation() {
    const prevBtn = document.getElementById('prev-day-btn');
    const nextBtn = document.getElementById('next-day-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            // 前の日に戻る（1日より前には戻らない）
            if (currentDisplayDate > 1) {
                currentDisplayDate--;
                updateDateDisplay(); // 日付表示を更新
                showLoading(); // 読み込み中表示
                stopAutoRefresh();
                fetchSheetData();
                startAutoRefresh();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            // 次の日に進む（31日より後には進まない）
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            if (currentDisplayDate < daysInMonth) {
                currentDisplayDate++;
                updateDateDisplay(); // 日付表示を更新
                showLoading(); // 読み込み中表示
                stopAutoRefresh();
                fetchSheetData();
                startAutoRefresh();
            }
        });
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('シフト管理ページを初期化中...');

    // 日付ナビゲーションボタンを設定
    setupDateNavigation();

    // 今日の日付を初期表示
    updateDateDisplay();

    // Google Sheetsからデータを取得して自動更新を開始
    startAutoRefresh();

    console.log('シフト管理ページ初期化完了');
    console.log('今日のケア内容をスプレッドシートから取得して表示します');
});

// ページを離れる時に自動更新を停止
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
