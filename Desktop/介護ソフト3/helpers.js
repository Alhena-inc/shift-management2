// 検索機能
function setupHelperSearch() {
    const searchInput = document.getElementById('helperSearch');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterHelpers(searchTerm);
    });
}

// ヘルパーフィルター
function filterHelpers(searchTerm) {
    const rows = document.querySelectorAll('.users-table tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    updateHelperCount();
}

// フィルターセレクト
function setupFilters() {
    const filterSelects = document.querySelectorAll('.filter-select');

    filterSelects.forEach(select => {
        select.addEventListener('change', () => {
            applyFilters();
        });
    });
}

// フィルター適用
function applyFilters() {
    const statusFilter = document.querySelector('.filter-select:nth-of-type(1)').value;
    const rows = document.querySelectorAll('.users-table tbody tr');

    rows.forEach(row => {
        let showRow = true;

        // ステータスフィルター
        if (statusFilter !== 'all') {
            const statusBadge = row.querySelector('.status-badge');
            const hasActiveClass = statusBadge.classList.contains('active');
            if (statusFilter === 'active' && !hasActiveClass) showRow = false;
            if (statusFilter === 'inactive' && hasActiveClass) showRow = false;
        }

        row.style.display = showRow ? '' : 'none';
    });

    updateHelperCount();
}

// ヘルパー数更新
function updateHelperCount() {
    const visibleRows = document.querySelectorAll('.users-table tbody tr[style=""]').length;
    const allRows = document.querySelectorAll('.users-table tbody tr').length;
    const countBadge = document.querySelector('.count-badge');
    countBadge.textContent = `${visibleRows}名`;
}

// 新規登録ボタン
function setupAddHelperButton() {
    const addHelperBtn = document.querySelector('.add-user-btn');
    const modal = document.getElementById('new-helper-modal');
    const closeBtn = document.getElementById('new-helper-close');
    const cancelBtn = document.getElementById('cancel-new-helper');
    const form = document.getElementById('new-helper-form');

    // モーダルを開く
    addHelperBtn.addEventListener('click', () => {
        modal.classList.add('show');
        // フォームをクリア
        form.reset();
    });

    // モーダルを閉じる
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // フォーム送信
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('new-helper-name').value;
        const furigana = document.getElementById('new-helper-furigana').value;
        const gender = document.querySelector('input[name="new-gender"]:checked')?.value;

        if (!name || !furigana || !gender) {
            alert('すべての項目を入力してください');
            return;
        }

        // 新規ヘルパーデータを作成
        const newHelper = {
            id: null, // 詳細画面で自動生成
            lastName: name,
            furigana: furigana,
            gender: gender,
            status: '稼働中'
        };

        // localStorageに一時保存
        localStorage.setItem('newHelperData', JSON.stringify(newHelper));

        // 詳細画面へ遷移（まだ作成していない場合は一覧に戻る）
        modal.classList.remove('show');

        // ヘルパーを直接追加
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

        // 既存の最大IDを取得して次のIDを生成
        let maxId = 0;
        helpers.forEach(h => {
            const idNum = parseInt(h.id);
            if (!isNaN(idNum) && idNum > maxId) {
                maxId = idNum;
            }
        });

        const newId = String(maxId + 1).padStart(3, '0');
        newHelper.id = newId;
        helpers.push(newHelper);
        localStorage.setItem('helpers', JSON.stringify(helpers));
        localStorage.setItem(`helper_${newId}`, JSON.stringify(newHelper));

        // リロード
        loadHelpersFromStorage();
        alert('ヘルパーを登録しました');
    });
}

// 氏名クリックのイベント設定
function setupNameClick() {
    const nameElements = document.querySelectorAll('.clickable-name');

    nameElements.forEach(nameEl => {
        nameEl.style.cursor = 'pointer';

        nameEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const helperId = nameEl.dataset.helperId;
            if (helperId) {
                // 詳細画面に遷移
                window.location.href = `helper-detail.html?id=${helperId}`;
            }
        });
    });
}

// localStorageからヘルパーデータを読み込んでテーブルに表示
function loadHelpersFromStorage() {
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
    const tbody = document.querySelector('.users-table tbody');

    // 既存のデータをクリア
    tbody.innerHTML = '';

    if (helpers.length === 0) {
        console.log('保存されたヘルパーデータがありません');
        // 空のメッセージを表示
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #999;">登録されたヘルパーがいません</td></tr>';
        updateHelperCount();
        return;
    }

    // 保存されたヘルパーデータを表示
    helpers.forEach(helper => {
        const row = document.createElement('tr');

        // 性別表示
        let genderText = '-';
        if (helper.gender === 'male') {
            genderText = '男性';
        } else if (helper.gender === 'female') {
            genderText = '女性';
        }

        // ステータスクラスとテキスト
        const statusValue = helper.status || 'active';
        const statusClass = statusValue === 'active' || statusValue === '稼働中' ? 'active' : 'inactive';
        const statusText = statusValue === 'active' || statusValue === '稼働中' ? '稼働中' : '休み';

        row.innerHTML = `
            <td>${helper.id}</td>
            <td class="user-name clickable-name" data-helper-id="${helper.id}">
                <i class="far fa-user-circle"></i>
                ${helper.lastName || '-'}
            </td>
            <td>${genderText}</td>
            <td>${helper.area || '-'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        `;

        tbody.appendChild(row);
    });

    // 氏名クリックイベントを設定
    setupNameClick();

    // ヘルパー数を更新
    updateHelperCount();
}

// 和暦を西暦に変換
function convertToSeireki(warekiDate) {
    const reiwaMatch = warekiDate.match(/令和(\d+)年(\d+)月(\d+)日/);
    if (reiwaMatch) {
        const reiwaYear = parseInt(reiwaMatch[1]);
        const month = parseInt(reiwaMatch[2]);
        const day = parseInt(reiwaMatch[3]);
        const seirekiYear = reiwaYear + 2018;
        return new Date(seirekiYear, month - 1, day);
    }
    return null;
}

// 年齢を計算
function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

// ページネーション
function setupPagination() {
    const paginationBtns = document.querySelectorAll('.pagination-btn');

    paginationBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.disabled) return;

            // アクティブクラスを削除
            paginationBtns.forEach(b => b.classList.remove('active'));

            // 番号ボタンの場合アクティブに
            if (!btn.querySelector('i')) {
                btn.classList.add('active');
            }

            console.log('ページ切り替え:', btn.textContent);
            // 実際にはページデータを読み込み
        });
    });
}

// 既存ヘルパーのIDを001, 002, 003...に変換
function convertHelperIds() {
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    if (helpers.length === 0) return;

    // すでに3桁形式かチェック
    const needsConversion = helpers.some(h => h.id && h.id.length > 3);

    if (!needsConversion) {
        console.log('ヘルパーIDは既に3桁形式です');
        return;
    }

    // IDを001, 002, 003...に変換
    helpers.forEach((helper, index) => {
        const oldId = helper.id;
        const newId = String(index + 1).padStart(3, '0');
        helper.id = newId;

        // 古いキーのデータを削除
        if (oldId) {
            localStorage.removeItem(`helper_${oldId}`);
        }

        // 新しいキーで保存
        localStorage.setItem(`helper_${newId}`, JSON.stringify(helper));
    });

    // helpers配列を更新
    localStorage.setItem('helpers', JSON.stringify(helpers));
    console.log('ヘルパーIDを3桁形式に変換しました');
}

// 社員番号がない既存ヘルパーにIDをセット
function syncEmployeeNumbers() {
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    if (helpers.length === 0) return;

    let needsUpdate = false;

    helpers.forEach(helper => {
        // 社員番号がない場合、IDをセット
        if (!helper.employeeNumber && helper.id) {
            helper.employeeNumber = helper.id;
            needsUpdate = true;

            // 個別データも更新
            localStorage.setItem(`helper_${helper.id}`, JSON.stringify(helper));
        }
    });

    if (needsUpdate) {
        localStorage.setItem('helpers', JSON.stringify(helpers));
        console.log('社員番号をIDと同期しました');
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('ヘルパー管理ページを初期化中...');

    // 既存ヘルパーのIDを変換
    convertHelperIds();

    // 社員番号をIDと同期
    syncEmployeeNumbers();

    // localStorageからデータを読み込み
    loadHelpersFromStorage();

    setupHelperSearch();
    setupFilters();
    setupAddHelperButton();
    setupPagination();

    console.log('ヘルパー管理ページ初期化完了');
});
