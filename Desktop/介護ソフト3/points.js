// ポイント管理ページのJavaScript

let helperPoints = [];
let pointsHistory = [];

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', function() {
    // LocalStorageからデータを読み込む
    loadPointsFromStorage();

    // 実際のヘルパーデータと同期
    syncWithHelpers();

    // ポイントランキングを表示
    renderPointsRanking();

    // ポイント履歴を表示
    renderPointsHistory();

    // 期間更新ボタンのイベントリスナー
    const updateBtn = document.getElementById('update-period-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', function() {
            const startDate = document.getElementById('period-start').value;
            const endDate = document.getElementById('period-end').value;

            // 期間に基づいてデータを再読み込み
            // TODO: 実際のデータ取得処理を実装
            console.log('期間更新:', startDate, '〜', endDate);
            alert(`期間を更新しました: ${startDate} 〜 ${endDate}`);
        });
    }
});

// ポイントランキングを表示
function renderPointsRanking() {
    const tbody = document.getElementById('points-table-body');
    if (!tbody) return;

    // ポイント順にソート
    const sortedHelpers = [...helperPoints].sort((a, b) => b.totalPoints - a.totalPoints);

    tbody.innerHTML = sortedHelpers.map((helper, index) => {
        const rank = index + 1;
        let rankIcon = '';
        let rankClass = '';

        // 上位3位にメダルアイコンを表示
        if (rank === 1) {
            rankIcon = '<i class="fas fa-medal" style="color: #FFD700; margin-right: 0.3rem;"></i>';
            rankClass = 'rank-1';
        } else if (rank === 2) {
            rankIcon = '<i class="fas fa-medal" style="color: #C0C0C0; margin-right: 0.3rem;"></i>';
            rankClass = 'rank-2';
        } else if (rank === 3) {
            rankIcon = '<i class="fas fa-medal" style="color: #CD7F32; margin-right: 0.3rem;"></i>';
            rankClass = 'rank-3';
        }

        return `
            <tr class="${rankClass}">
                <td style="text-align: center; font-weight: bold; font-size: 1.1rem;">
                    ${rankIcon}${rank}
                </td>
                <td class="user-name">
                    <i class="fas fa-user-nurse"></i>
                    ${helper.name}
                </td>
                <td style="text-align: center;">
                    <span style="font-size: 1.2rem; font-weight: bold; color: #f39c12;">
                        <i class="fas fa-star"></i> ${helper.totalPoints}
                    </span>
                </td>
                <td style="text-align: center;">
                    ${helper.completedCares} 件
                </td>
                <td style="text-align: center;">
                    <button class="btn-icon btn-view" onclick="viewHelperDetail('${helper.id}')" title="詳細">
                        <i class="far fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ポイント履歴を表示
function renderPointsHistory() {
    const historyList = document.getElementById('points-history-list');
    if (!historyList) return;

    historyList.innerHTML = pointsHistory.map(history => {
        return `
            <div class="history-item">
                <div class="history-date">${history.date}</div>
                <div class="history-content">
                    <div class="history-title">
                        <i class="fas fa-user-nurse" style="margin-right: 0.5rem;"></i>
                        ${history.helperName}
                    </div>
                    <div class="history-helper">
                        利用者: ${history.userName} | ${history.careType}
                    </div>
                </div>
                <span class="history-status" style="background: #f39c12; color: white; padding: 0.3rem 0.8rem; border-radius: 4px;">
                    <i class="fas fa-star"></i> +${history.points}pt
                </span>
            </div>
        `;
    }).join('');
}

// ヘルパー詳細を表示
function viewHelperDetail(helperId) {
    // ヘルパー詳細ページに遷移
    window.location.href = `helper-detail.html?id=${helperId}`;
}

// ポイントを追加する関数（他のページから呼び出される）
function addPointsToHelper(helperId, points, userName, careType) {
    // ヘルパーのポイントを更新
    const helper = helperPoints.find(h => h.id === helperId);
    if (helper) {
        helper.totalPoints += points;
        helper.completedCares += 1;
    } else {
        // 新しいヘルパーの場合
        helperPoints.push({
            id: helperId,
            name: '不明', // 実際にはヘルパー名を取得
            totalPoints: points,
            completedCares: 1
        });
    }

    // 履歴を追加
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    pointsHistory.unshift({
        date: dateStr,
        helperName: helper ? helper.name : '不明',
        userName: userName,
        points: points,
        careType: careType
    });

    // LocalStorageに保存
    localStorage.setItem('helperPoints', JSON.stringify(helperPoints));
    localStorage.setItem('pointsHistory', JSON.stringify(pointsHistory));

    console.log(`ポイント追加: ${helperId} に ${points}pt`);
}

// LocalStorageからデータを読み込む
function loadPointsFromStorage() {
    const savedPoints = localStorage.getItem('helperPoints');
    const savedHistory = localStorage.getItem('pointsHistory');

    if (savedPoints) {
        helperPoints = JSON.parse(savedPoints);
    }

    if (savedHistory) {
        pointsHistory = JSON.parse(savedHistory);
    }
}

// 実際のヘルパーデータと同期
function syncWithHelpers() {
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    // 各ヘルパーのポイントデータを確認
    helpers.forEach(helper => {
        const existingPoint = helperPoints.find(hp => hp.id === helper.id);

        if (!existingPoint) {
            // ポイントデータがないヘルパーを追加
            helperPoints.push({
                id: helper.id,
                name: helper.lastName || '不明',
                totalPoints: 0,
                completedCares: 0
            });
        } else {
            // 名前を最新に更新
            existingPoint.name = helper.lastName || '不明';
        }
    });

    // LocalStorageに保存
    localStorage.setItem('helperPoints', JSON.stringify(helperPoints));
}
