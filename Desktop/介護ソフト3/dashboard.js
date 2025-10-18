// ダッシュボード用JavaScript - shifts.jsと同じロジックでケア内容を表示

// Google Sheets API設定
const GOOGLE_SHEETS_CONFIG = {
    apiKey: 'AIzaSyDRoNhwY5oaRolDEp9eUny8_B3l9aTFZ2w',
    spreadsheetId: '1718uvoE5eVthZqypmrbFyHj92T30uSogMSsdSF8-wpA',
    refreshInterval: 60000 // 60秒ごとに更新
};

// ポイント集計用のスプレッドシート設定
const POINTS_SHEET_CONFIG = {
    apiKey: 'AIzaSyDRoNhwY5oaRolDEp9eUny8_B3l9aTFZ2w',
    spreadsheetId: '1freFvPKDvQVYGxFrJ-wqeX2vlbVKXp_Nf7Hm7iN0Mkk',
    sheetName: 'ポイント使用ログ'
};

// 報告送信設定（Google Sheets記録）
const REPORT_CONFIG = {
    webhookUrl: 'https://script.google.com/macros/s/AKfycbwEqcWp4ihsnNmr19Q5GeYAXtsyikJMxPe-MdD0y7AAJ7LYs96x7jcGHIlU6t2lJ-mhEA/exec'
};

// 今日の月から自動でシート名を生成
function getCurrentSheetName() {
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const year = String(today.getFullYear()).slice(2); // 25
    return `🔴【今月】${year}.${month}月`;
}

let sheetsData = null;
let autoRefreshTimer = null;
let currentDisplayDate = new Date().getDate(); // 現在表示中の日付

// Google Sheets APIからデータを取得（背景色情報も含む）
async function fetchSheetData() {
    // 読み込み中を表示
    showLoadingState();

    try {
        const { apiKey, spreadsheetId } = GOOGLE_SHEETS_CONFIG;
        const sheetName = getCurrentSheetName();

        console.log('使用するシート名:', sheetName);
        console.log('Google Sheetsからデータを取得中...');

        // シート全体のデータを取得
        const valuesRange = `${sheetName}!A1:HZ1000`;
        const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(valuesRange)}?key=${apiKey}`;

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

        // 背景色情報を含む詳細データを取得
        const dataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(sheetName)}!A1:HZ1000&fields=sheets(data(rowData(values(formattedValue,effectiveFormat.backgroundColor))))&key=${apiKey}`;

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

// スプレッドシートのデータを解析してシフト情報を抽出（shifts.jsと同じロジック）
function parseSheetData(rawData, cellData) {
    if (!rawData || rawData.length === 0) return;

    console.log('データ解析開始...');

    // 週ごとの行を動的に検索
    const weekConfigs = [];

    for (let row = 0; row < rawData.length; row++) {
        const rowData = rawData[row];
        if (!rowData) continue;

        let hasDatePattern = false;
        for (let col = 0; col < rowData.length; col++) {
            const cell = String(rowData[col] || '').trim();
            if (/^\d+\([日月火水木金土]\)$/.test(cell)) {
                hasDatePattern = true;
                break;
            }
        }

        if (hasDatePattern) {
            weekConfigs.push({
                dateRow: row,
                helperRow: row + 1,
                careStartRow: row + 2,
                careEndRow: row + 21
            });
        }
    }

    // 表示中の日付を使用
    const today = currentDisplayDate;
    console.log('表示日付:', today);

    // 日付表示を更新
    updateDateDisplay();

    // 全ての週の日付行から、全ての日付とその列位置を収集
    const allDates = [];
    weekConfigs.forEach((config, weekIndex) => {
        if (config.dateRow >= rawData.length) return;
        const dateRow = rawData[config.dateRow];
        if (!dateRow) return;

        for (let col = 0; col < dateRow.length; col++) {
            const dateCell = String(dateRow[col] || '').trim();
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
            }
        }
    });

    console.log(`全日付を検出: ${allDates.length}個`);

    // 該当日付を探す
    const targetDateInfo = allDates.find(d => d.date === today);

    if (!targetDateInfo) {
        console.warn(`${today}日の日付が見つかりませんでした`);
        displayTodaysCare([]);
        return [];
    }

    console.log(`該当日付を発見！ 週${targetDateInfo.weekIndex + 1}, 行: ${targetDateInfo.row + 1}, 開始列: ${targetDateInfo.col}, 日付: ${targetDateInfo.date}`);

    // ヘルパー行全体をスキャンして、該当日付の範囲内のヘルパーを全て見つける
    const helperRow = rawData[targetDateInfo.config.helperRow];
    const helperColumns = [];

    // 該当日付のセルから右側のヘルパーを探す
    // 次の日付が見つかるまで、または空白セルが連続するまでスキャン
    let consecutiveEmptyCells = 0;
    const maxEmptyCells = 5; // 連続5セル空白で終了

    for (let col = targetDateInfo.col; col < helperRow.length; col++) {
        const helperName = String(helperRow && helperRow[col] ? helperRow[col] : '').trim();

        // 次の日付セルに到達したら終了
        const dateCell = String(rawData[targetDateInfo.row][col] || '').trim();
        if (col > targetDateInfo.col && /^\d+\([日月火水木金土]\)$/.test(dateCell)) {
            break;
        }

        if (helperName) {
            helperColumns.push({ col: col, name: helperName });
            consecutiveEmptyCells = 0;
        } else {
            consecutiveEmptyCells++;
            if (consecutiveEmptyCells >= maxEmptyCells) {
                break;
            }
        }
    }

    console.log(`ヘルパー数: ${helperColumns.length}人`);

    // 各ヘルパーのケア内容を取得
    const foundData = [];

    helperColumns.forEach(({ col, name }) => {
        console.log(`=== ${name}のケア内容詳細 ===`);

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

        console.log(`  取得した全行数: ${allRows.length}`);

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
                cancelledGroups.push(currentGroup);
            } else {
                careGroups.push(currentGroup);
            }
        }

        console.log(`  通常グループ数: ${careGroups.length}`);
        console.log(`  キャンセルグループ数: ${cancelledGroups.length}`);

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
        }
    });

    console.log(`${today}日のケア内容: ${foundData.length}人分`);

    // ダッシュボードに表示
    displayTodaysCare(foundData);

    return foundData;
}

// ダッシュボードに今日のケア内容を表示
function displayTodaysCare(careData) {
    const container = document.getElementById('todays-care-list');
    const countElement = document.getElementById('care-count');

    if (!container) {
        console.error('ケア内容表示エリアが見つかりません');
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
        container.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: #95a5a6; background: #f8f9fa; border-radius: 8px; border: 2px dashed #ddd;">
                <i class="fas fa-calendar-check" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <div style="font-size: 0.95rem; font-weight: 500;">${loggedInHelperName ? `${loggedInHelperName}さんの今日のケア内容はありません` : '今日のケア内容はありません'}</div>
            </div>
        `;
        if (countElement) countElement.textContent = '0件';
        return;
    }

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

    // 時間順にソート（開始時間を正規化して比較）
    allCareItems.sort((a, b) => {
        const timeA = a.time ? a.time.split('-')[0] : '99:99';
        const timeB = b.time ? b.time.split('-')[0] : '99:99';

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

    // ケア内容を表示
    let shiftsHtml = '';
    let totalShifts = 0;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    // 通常のケアとキャンセルのケアを分ける
    const normalCareItems = allCareItems.filter(item => !item.isCancelled);
    const cancelledCareItems = allCareItems.filter(item => item.isCancelled);

    // 通常のケアを表示
    normalCareItems.forEach(item => {
        totalShifts++;

        const careData = {
            time: item.time,
            user: item.user,
            serviceType: item.serviceType,
            helperName: item.helperName,
            date: currentDisplayDate
        };

        // 完了済みかチェック
        const isCompleted = isCareCompleted(careData);

        // ステータス判定
        let statusClass = 'pending';
        let statusText = '予定';
        let statusColor = '#3498db'; // 青

        if (isCompleted) {
            statusClass = 'completed';
            statusText = '完了';
            statusColor = '#95a5a6'; // グレー
        } else if (item.time) {
            const timeMatch = item.time.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
            if (timeMatch) {
                const startHour = parseInt(timeMatch[1]);
                const startMinute = parseInt(timeMatch[2]);
                const endHour = parseInt(timeMatch[3]);
                const endMinute = parseInt(timeMatch[4]);

                const startTime = startHour * 60 + startMinute;
                const endTime = endHour * 60 + endMinute;

                if (currentTime >= endTime) {
                    // 時間は過ぎたが未完了
                    statusClass = 'pending';
                    statusText = '未完了';
                    statusColor = '#e74c3c'; // 赤
                } else if (currentTime >= startTime && currentTime < endTime) {
                    statusClass = 'in-progress';
                    statusText = '介入中';
                    statusColor = '#27ae60'; // 緑
                }
            }
        }

        const careDataStr = JSON.stringify(careData).replace(/"/g, '&quot;');

        shiftsHtml += `
            <div style="background: white; border: 1px solid #e9ecef; border-left: 3px solid ${statusColor}; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                    <div style="color: ${statusColor}; font-weight: 700; font-size: 1rem; min-width: 100px;">
                        <i class="far fa-clock" style="margin-right: 0.4rem;"></i>${item.time || '未設定'}
                    </div>
                    <div style="flex: 1;">
                        <div style="color: #333; font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">
                            <i class="fas fa-user" style="color: #3498db; margin-right: 0.3rem;"></i>${item.user || '利用者未設定'}
                        </div>
                        <div style="color: #6c757d; font-size: 0.85rem; display: flex; align-items: center; gap: 1rem;">
                            ${item.serviceType ? `<span><i class="fas fa-clipboard-list" style="margin-right: 0.3rem;"></i>${item.serviceType}${item.hours ? ' (' + item.hours + '時間)' : ''}</span>` : ''}
                            ${item.location ? `<span><i class="fas fa-map-marker-alt" style="margin-right: 0.3rem;"></i>${item.location}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${statusClass === 'completed' ?
                        `<div style="background: ${statusColor}; color: white; padding: 0.4rem 0.8rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem; white-space: nowrap;">${statusText}</div>` :
                        `<button class="complete-care-btn" data-care="${careDataStr}" style="background: #27ae60; color: white; padding: 0.4rem 0.8rem; border-radius: 4px; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; white-space: nowrap;">完了にする</button>`
                    }
                </div>
            </div>
        `;
    });

    // キャンセルのケアを一番下に表示
    cancelledCareItems.forEach(item => {
        totalShifts++;

        shiftsHtml += `
            <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-left: 3px solid #95a5a6; border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; opacity: 0.7;">
                <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                    <div style="color: #95a5a6; font-weight: 700; font-size: 1rem; min-width: 100px; text-decoration: line-through;">
                        <i class="far fa-clock" style="margin-right: 0.4rem;"></i>${item.time || '未設定'}
                    </div>
                    <div style="flex: 1;">
                        <div style="color: #6c757d; font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; text-decoration: line-through;">
                            <i class="fas fa-user" style="margin-right: 0.3rem;"></i>${item.user || '利用者未設定'}
                        </div>
                        <div style="color: #95a5a6; font-size: 0.85rem; display: flex; align-items: center; gap: 1rem;">
                            ${item.serviceType ? `<span><i class="fas fa-clipboard-list" style="margin-right: 0.3rem;"></i>${item.serviceType}${item.hours ? ' (' + item.hours + '時間)' : ''}</span>` : ''}
                            ${item.location ? `<span><i class="fas fa-map-marker-alt" style="margin-right: 0.3rem;"></i>${item.location}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div style="background: #95a5a6; color: white; padding: 0.4rem 0.8rem; border-radius: 4px; font-weight: 600; font-size: 0.85rem; white-space: nowrap;">
                    キャンセル
                </div>
            </div>
        `;
    });

    container.innerHTML = shiftsHtml;

    // 完了ボタンのイベントリスナーを追加
    const completeButtons = container.querySelectorAll('.complete-care-btn');
    completeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const careDataStr = button.getAttribute('data-care');
            const careData = JSON.parse(careDataStr.replace(/&quot;/g, '"'));
            completeCare(careData);
        });
    });

    // 件数を更新
    if (countElement) {
        countElement.textContent = `${totalShifts}件`;
    }

    console.log(`ダッシュボードに${totalShifts}件のケア内容を表示しました`);
}

// ケア内容を解析
function parseCareContent(contentArray) {
    if (!contentArray || contentArray.length === 0) return [];

    const items = [];
    let currentItem = null;

    contentArray.forEach((contentObj) => {
        const line = typeof contentObj === 'string' ? contentObj : contentObj.text;
        const isCancelled = typeof contentObj === 'object' ? contentObj.isCancelled : false;
        const trimmed = line.trim();

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

// 読み込み中を表示
function showLoadingState() {
    const container = document.getElementById('todays-care-list');
    const dateDisplayElement = document.getElementById('todays-date-display');
    const countElement = document.getElementById('care-count');

    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #95a5a6;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <div style="font-size: 0.95rem; font-weight: 500;">読み込み中...</div>
            </div>
        `;
    }

    if (dateDisplayElement) {
        dateDisplayElement.textContent = '読み込み中...';
    }

    if (countElement) {
        countElement.textContent = '...';
    }
}

// 日付表示を更新
function updateDateDisplay() {
    const dateDisplayElement = document.getElementById('todays-date-display');
    if (!dateDisplayElement) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const targetDate = new Date(year, month - 1, currentDisplayDate);
    const weekday = weekdays[targetDate.getDay()];

    dateDisplayElement.textContent = `${month}月${currentDisplayDate}日（${weekday}）`;
}

// 前の日ボタンの処理
function showPreviousDay() {
    currentDisplayDate--;
    if (currentDisplayDate < 1) {
        currentDisplayDate = 1;
        alert('これ以上前の日付は表示できません');
        return;
    }
    fetchSheetData();
}

// 次の日ボタンの処理
function showNextDay() {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    currentDisplayDate++;
    if (currentDisplayDate > daysInMonth) {
        currentDisplayDate = daysInMonth;
        alert('これ以上先の日付は表示できません');
        return;
    }
    fetchSheetData();
}

// 受給者証の期限アラートをチェック
function checkCertificateExpirations() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const bulletinBoard = document.getElementById('bulletin-board');

    if (!bulletinBoard) return;

    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const expiringCertificates = [];

    users.forEach(user => {
        // certificateHistory配列をチェック
        if (user.certificateHistory && Array.isArray(user.certificateHistory)) {
            user.certificateHistory.forEach((cert, index) => {
                if (cert.validTo) {
                    const expiryDate = parseWarekiDate(cert.validTo);
                    if (expiryDate && expiryDate >= today && expiryDate <= oneMonthLater) {
                        expiringCertificates.push({
                            userName: user.lastName || '名前未設定',
                            userId: user.id,
                            municipality: cert.municipality || '',
                            expiryDate: expiryDate,
                            validTo: cert.validTo,
                            daysLeft: Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))
                        });
                    }
                }
            });
        }
    });

    // アラート件数を更新
    const alertCountElement = document.getElementById('alert-count');
    if (alertCountElement) {
        alertCountElement.textContent = `${expiringCertificates.length}件`;
    }

    if (expiringCertificates.length === 0) {
        bulletinBoard.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; color: #95a5a6; background: #f8f9fa; border-radius: 8px; border: 2px dashed #ddd;">
                <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <div style="font-size: 0.95rem; font-weight: 500;">現在、期限切れが近い受給者証はありません</div>
            </div>
        `;
        return;
    }

    // 期限が近い順にソート
    expiringCertificates.sort((a, b) => a.expiryDate - b.expiryDate);

    let bulletinHtml = '<div style="display: grid; gap: 0.75rem;">';
    expiringCertificates.forEach(cert => {
        const isUrgent = cert.daysLeft <= 7;
        const urgencyColor = isUrgent ? '#dc3545' : '#fd7e14';
        const urgencyBg = isUrgent ? '#fff5f5' : '#fff8f0';
        const urgencyBorder = isUrgent ? '#fecaca' : '#fed7aa';
        const urgencyIcon = 'fa-exclamation-circle';

        bulletinHtml += `
            <div style="background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-left: 3px solid ${urgencyColor}; border-radius: 6px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex: 1;">
                    <div style="color: ${urgencyColor}; flex-shrink: 0;">
                        <i class="fas ${urgencyIcon}" style="font-size: 1.3rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="color: #333; font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">
                            ${cert.userName}さんの受給者証 - <span style="color: ${urgencyColor}; font-weight: 700;">残り${cert.daysLeft}日</span>
                        </div>
                        <div style="color: #6c757d; font-size: 0.85rem; display: flex; align-items: center; gap: 1rem;">
                            <span><i class="far fa-calendar" style="margin-right: 0.3rem;"></i>${cert.validTo}</span>
                            <span><i class="fas fa-map-marker-alt" style="margin-right: 0.3rem;"></i>${cert.municipality}</span>
                        </div>
                    </div>
                </div>
                <a href="user-detail.html?id=${cert.userId}&tab=record&subtab=certificate"
                   style="background: ${urgencyColor}; color: white; padding: 0.5rem 1rem; border-radius: 4px; text-decoration: none; font-weight: 600; white-space: nowrap; font-size: 0.85rem; transition: opacity 0.2s ease;"
                   onmouseover="this.style.opacity='0.9'"
                   onmouseout="this.style.opacity='1'">
                    詳細
                </a>
            </div>
        `;
    });
    bulletinHtml += '</div>';

    bulletinBoard.innerHTML = bulletinHtml;
}

// 和暦の日付をパース（例: "令和7年10月8日" → Date オブジェクト）
function parseWarekiDate(warekiStr) {
    if (!warekiStr) return null;

    // "令和7年10月8日" のような形式をパース
    const match = warekiStr.match(/令和(\d+)年(\d+)月(\d+)日/);
    if (!match) return null;

    const reiwaNen = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);

    // 令和元年 = 2019年
    const year = 2018 + reiwaNen;

    return new Date(year, month - 1, day);
}

// 完了済みケアの一意なキーを生成
function getCareKey(careData) {
    const { helperName, user, time, date } = careData;
    return `${helperName}_${user}_${time}_${date}`;
}

// ケアが完了済みかチェック
function isCareCompleted(careData) {
    const completedCares = JSON.parse(localStorage.getItem('completedCares') || '[]');
    const careKey = getCareKey(careData);
    return completedCares.includes(careKey);
}

// ケアを完了済みとしてマーク
function markCareAsCompleted(careData) {
    let completedCares = JSON.parse(localStorage.getItem('completedCares') || '[]');
    const careKey = getCareKey(careData);

    if (!completedCares.includes(careKey)) {
        completedCares.push(careKey);
        localStorage.setItem('completedCares', JSON.stringify(completedCares));
    }
}

// ケアを完了してポイントを付与
function completeCare(careData) {
    const { user, helperName, time, serviceType, date } = careData;

    // 既に完了済みかチェック
    if (isCareCompleted(careData)) {
        alert('このケアは既に完了しています');
        return;
    }

    if (!confirm(`${user}さんのケアを完了にして、${helperName}さんにポイントを付与しますか？`)) {
        return;
    }

    // 利用者を検索してポイント設定を取得
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const targetUser = users.find(u => {
        const fullName = u.firstName ? `${u.lastName} ${u.firstName}` : u.lastName;
        return u.lastName === user || fullName === user;
    });

    if (!targetUser) {
        alert('利用者が見つかりません');
        return;
    }

    const carePoints = parseInt(targetUser.carePoints) || 0;

    if (carePoints === 0) {
        alert('この利用者にはポイント設定がされていません');
        return;
    }

    // ヘルパーを検索
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
    const targetHelper = helpers.find(h => h.lastName === helperName);

    if (!targetHelper) {
        alert('ヘルパーが見つかりません');
        return;
    }

    // ポイント履歴を取得・更新
    let pointsHistory = JSON.parse(localStorage.getItem('pointsHistory') || '[]');
    let helperPoints = JSON.parse(localStorage.getItem('helperPoints') || '[]');

    // 今日の日付を取得
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${date}日`;

    // ポイント履歴に追加
    pointsHistory.push({
        helperId: targetHelper.id,
        helperName: targetHelper.lastName,
        userId: targetUser.id,
        userName: user,
        careType: serviceType || 'ケア完了',
        points: carePoints,
        date: dateStr,
        time: time,
        timestamp: new Date().toISOString()
    });

    // ヘルパーの累計ポイントを更新
    let helperPointData = helperPoints.find(h => h.id === targetHelper.id);
    if (helperPointData) {
        helperPointData.localPoints = (helperPointData.localPoints || 0) + carePoints;
        helperPointData.totalPoints = (helperPointData.sheetPoints || 0) + helperPointData.localPoints;
        helperPointData.completedCares = (helperPointData.completedCares || 0) + 1;
    } else {
        helperPoints.push({
            id: targetHelper.id,
            helperName: targetHelper.lastName,
            sheetPoints: 0,
            localPoints: carePoints,
            totalPoints: carePoints,
            completedCares: 1
        });
    }

    // ケアを完了済みとしてマーク
    markCareAsCompleted(careData);

    // localStorageに保存
    localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));
    localStorage.setItem('helperPoints', JSON.stringify(helperPoints));

    alert(`完了しました！\n${helperName}さんに${carePoints}ポイントを付与しました。`);

    // 画面を再読み込み
    fetchSheetData();
}

// スプレッドシートからポイント集計データを取得
async function fetchPointsFromSheet() {
    try {
        const { apiKey, spreadsheetId, sheetName } = POINTS_SHEET_CONFIG;

        console.log('ポイント集計データを取得中...');

        // ヘッダー行も含めて広い範囲を取得 (H2:L28)
        // H列: ヘルパー名, I-L列: 合計、使用、残りなどの列
        const range = `${sheetName}!H2:L28`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            console.error('ポイントシート取得エラー:', errorData);
            return;
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            console.warn('ポイントシートにデータがありません');
            return;
        }

        console.log(`取得データ行数: ${data.values.length}`);

        // ヘッダー行から「残り」列のインデックスを探す
        const headerRow = data.values[0];
        let remainingColumnIndex = -1;

        for (let i = 0; i < headerRow.length; i++) {
            if (headerRow[i] && headerRow[i].includes('残り')) {
                remainingColumnIndex = i;
                console.log(`「残り」列を発見: インデックス ${i} (${String.fromCharCode(72 + i)}列)`);
                break;
            }
        }

        // 「残り」列が見つからない場合は、I列（インデックス1）をデフォルトとして使用
        if (remainingColumnIndex === -1) {
            console.warn('「残り」列が見つかりません。I列を使用します。');
            remainingColumnIndex = 1; // I列
        }

        // ヘルパーのポイントデータを取得・更新
        let helperPoints = JSON.parse(localStorage.getItem('helperPoints') || '[]');
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

        // データ行を処理 (ヘッダー行をスキップして3行目から)
        for (let i = 1; i < data.values.length; i++) {
            const row = data.values[i];

            // H列(インデックス0)がヘルパー名、「残り」列がポイント値
            if (!row[0]) continue;

            const nameCell = row[0].trim();
            const points = parseInt(row[remainingColumnIndex]) || 0;

            // 名前から「H3」「H4」「HH14」などの記号を除去して苗字だけを取得
            // 例: "広瀬H3" → "広瀬", "藤田H12" → "藤田", "新小田H13" → "新小田", "小池H16" → "小池"
            let lastName = nameCell.replace(/H+\d+$/, '').trim();

            if (!lastName) continue;

            // ヘルパーを苗字で検索
            const helper = helpers.find(h => h.lastName === lastName);

            if (!helper) {
                console.log(`ヘルパーが見つかりません: ${lastName} (元のセル値: ${nameCell}, 行: H${i + 2})`);
                continue;
            }

            // ヘルパーポイントを更新
            let helperPointData = helperPoints.find(h => h.id === helper.id);
            if (helperPointData) {
                helperPointData.sheetPoints = points;
                helperPointData.totalPoints = (helperPointData.localPoints || 0) + points;
            } else {
                helperPoints.push({
                    id: helper.id,
                    helperName: helper.lastName,
                    sheetPoints: points,
                    localPoints: 0,
                    totalPoints: points,
                    completedCares: 0
                });
            }

            console.log(`${lastName}さんのポイントを更新: ${points}pt (残り列の値, 元のセル値: ${nameCell})`);
        }

        // localStorageに保存
        localStorage.setItem('helperPoints', JSON.stringify(helperPoints));

        console.log('ポイント集計データの取得完了');

    } catch (error) {
        console.error('ポイント取得エラー:', error);
    }
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    console.log('ダッシュボード初期化中...');

    // 受給者証の期限アラートをチェック
    checkCertificateExpirations();

    // ケア内容を取得して表示
    startAutoRefresh();

    // ポイント集計データを取得
    fetchPointsFromSheet();
});

// ページを離れる時に自動更新を停止
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});

// ケア報告を送信する処理
async function sendCareReport(time, user, helper) {
    // 時刻から時間部分だけを取得（例: "8:30-10:00" → "8:30"）
    const reportTime = time ? time.split('-')[0] : new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const reportUser = user || '利用者未設定';
    const reportHelper = helper || '';

    // 報告メッセージを作成
    const reportMessage = `${reportTime}\n${reportUser}\n入ります`;

    // コンソールに表示
    console.log('ケア報告を送信:', reportMessage);

    try {
        // Google Apps Script経由でGoogle Sheetsに記録
        const response = await fetch(REPORT_CONFIG.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: reportMessage
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('報告記録成功:', result);
            alert(`報告をスプレッドシートに記録しました:\n\n${reportMessage}`);
        } else {
            const errorText = await response.text();
            console.error('報告記録エラー:', response.status, errorText);
            alert(`報告の記録に失敗しました。\nエラー: ${response.status}\n\n報告内容:\n${reportMessage}`);
        }
    } catch (error) {
        console.error('報告記録エラー:', error);
        alert(`報告の記録に失敗しました。\nエラー: ${error.message}\n\n報告内容:\n${reportMessage}`);
    }
}
