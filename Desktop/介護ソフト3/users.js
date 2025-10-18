// サンプル利用者データ
const usersData = [
    { id: '001', name: '佐藤 花子', age: 78, careLevel: 3, address: '東京都新宿区西新宿1-1-1', phone: '03-1234-5678', helper: '田中 太郎', status: 'active' },
    { id: '002', name: '鈴木 一郎', age: 82, careLevel: 5, address: '東京都渋谷区渋谷2-2-2', phone: '03-2345-6789', helper: '山田 次郎', status: 'active' },
    { id: '003', name: '田中 美咲', age: 75, careLevel: 2, address: '東京都品川区大崎3-3-3', phone: '03-3456-7890', helper: '佐々木三郎', status: 'active' },
    { id: '004', name: '高橋 健太', age: 80, careLevel: 1, address: '東京都港区赤坂4-4-4', phone: '03-4567-8901', helper: '中村 美希', status: 'inactive' },
    { id: '005', name: '伊藤 和子', age: 76, careLevel: 4, address: '東京都中央区銀座5-5-5', phone: '03-5678-9012', helper: '田中 太郎', status: 'active' },
];

// 検索機能
function setupUserSearch() {
    const searchInput = document.getElementById('userSearch');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterUsers(searchTerm);
    });
}

// ユーザーフィルター
function filterUsers(searchTerm) {
    const rows = document.querySelectorAll('.users-table tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    updateUserCount();
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
    const careLevelFilter = document.querySelector('.filter-select:nth-of-type(2)').value;
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

        // 介護度フィルター
        if (careLevelFilter !== 'all') {
            const careLevel = row.querySelector('.care-level');
            if (!careLevel.classList.contains(`level-${careLevelFilter}`)) {
                showRow = false;
            }
        }

        row.style.display = showRow ? '' : 'none';
    });

    updateUserCount();
}

// ユーザー数更新
function updateUserCount() {
    const visibleRows = document.querySelectorAll('.users-table tbody tr[style=""]').length;
    const allRows = document.querySelectorAll('.users-table tbody tr').length;
    const countBadge = document.querySelector('.count-badge');
    countBadge.textContent = `${visibleRows}名`;
}

// 新規登録ボタン
function setupAddUserButton() {
    const addUserBtn = document.querySelector('.add-user-btn');
    const modal = document.getElementById('new-user-modal');
    const closeBtn = document.getElementById('new-user-close');
    const cancelBtn = document.getElementById('cancel-new-user');
    const form = document.getElementById('new-user-form');

    // モーダルを開く
    addUserBtn.addEventListener('click', () => {
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

        const lastName = document.getElementById('new-user-lastname').value.trim();
        const firstName = document.getElementById('new-user-firstname').value.trim();
        const furiganaLast = document.getElementById('new-user-furigana-last').value.trim();
        const furiganaFirst = document.getElementById('new-user-furigana-first').value.trim();
        const gender = document.querySelector('input[name="new-gender"]:checked')?.value;

        if (!lastName || !firstName || !furiganaLast || !furiganaFirst || !gender) {
            alert('すべての項目を入力してください');
            return;
        }

        // 新規利用者データを作成
        const newUser = {
            id: null, // 詳細画面で自動生成
            lastName: lastName,
            firstName: firstName,
            furiganaLast: furiganaLast,
            furiganaFirst: furiganaFirst,
            gender: gender,
            status: '利用中'
        };

        // localStorageに一時保存
        localStorage.setItem('newUserData', JSON.stringify(newUser));

        // 詳細画面へ遷移
        window.location.href = 'user-detail.html';
    });
}

// 詳細表示ボタン
function setupViewButtons() {
    const viewButtons = document.querySelectorAll('.btn-view');

    viewButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = e.target.closest('tr');
            const userId = row.querySelector('td:first-child').textContent;
            window.location.href = `user-detail.html?id=${userId}`;
        });
    });
}

// 編集ボタン
function setupEditButtons() {
    const editButtons = document.querySelectorAll('.btn-edit');

    editButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = e.target.closest('tr');
            const userId = row.querySelector('td:first-child').textContent;
            window.location.href = `user-detail.html?id=${userId}`;
        });
    });
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

// 氏名クリックのイベント設定
function setupNameClick() {
    const nameElements = document.querySelectorAll('.clickable-name');

    nameElements.forEach(nameEl => {
        nameEl.style.cursor = 'pointer';

        nameEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = nameEl.dataset.userId;
            if (userId) {
                window.location.href = `user-detail.html?id=${userId}`;
            }
        });
    });
}

// localStorageから利用者データを読み込んでテーブルに表示
function loadUsersFromStorage() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const tbody = document.querySelector('.users-table tbody');

    // 既存のサンプルデータを常にクリア
    tbody.innerHTML = '';

    if (users.length === 0) {
        console.log('保存された利用者データがありません');
        // 空のメッセージを表示
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #999;">登録された利用者がいません</td></tr>';
        updateUserCount();
        return;
    }

    // 保存された利用者データを表示
    users.forEach(user => {
        const row = document.createElement('tr');

        // 年齢を計算
        let age = '-';
        if (user.birthDate) {
            const birthDate = convertToSeireki(user.birthDate);
            if (birthDate) {
                age = calculateAge(birthDate) + '歳';
            }
        }

        // ステータスクラス
        const statusClass = user.status === '利用中' ? 'active' : 'inactive';

        row.innerHTML = `
            <td>${user.id}</td>
            <td class="user-name">
                <i class="far fa-user-circle"></i>
                ${user.lastName || '-'}
            </td>
            <td>${age}</td>
            <td><span class="care-level level-1">-</span></td>
            <td>${user.address || '-'}</td>
            <td>${user.phone || user.mobile || '-'}</td>
            <td>-</td>
            <td><span class="status-badge ${statusClass}">${user.status || '利用中'}</span></td>
            <td class="action-buttons">
                <button class="btn-icon btn-view" title="詳細">
                    <i class="far fa-eye"></i>
                </button>
                <button class="btn-icon btn-edit" title="編集">
                    <i class="far fa-edit"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // テーブル行のイベントを再設定
    setupTableRowClick();
    setupViewButtons();
    setupEditButtons();

    // 利用者数を更新
    updateUserCount();
}

// 和暦を西暦に変換（users.jsにも追加）
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

// 年齢を計算（users.jsにも追加）
function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}

// ビュー切り替え機能
function setupViewToggle() {
    const toggleButtons = document.querySelectorAll('.view-toggle-btn');
    const table = document.querySelector('.users-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    // 基本ビューのヘッダー
    const basicHeaders = `
        <th>ID</th>
        <th>氏名</th>
        <th>年齢</th>
        <th>性別</th>
        <th>エリア</th>
        <th>電話番号</th>
        <th>担当ヘルパー</th>
        <th>ポイント</th>
    `;

    // 事業所管理ビューのヘッダー
    const officeHeaders = `
        <th style="width: 60px; min-width: 60px;">ID</th>
        <th style="width: 120px; min-width: 120px;">氏名</th>
        <th style="width: 80px; min-width: 80px;">地域</th>
        <th style="width: 80px; min-width: 80px;">担当</th>
        <th style="width: 100px; min-width: 100px;">希望性別</th>
        <th style="width: 100px; min-width: 100px;">曜日</th>
        <th style="width: 120px; min-width: 120px;">ステータス</th>
        <th style="width: 130px; min-width: 130px;">受給者証状況</th>
        <th style="width: 160px; min-width: 160px;">受給者証預かり状況</th>
        <th style="width: 150px; min-width: 150px;">要対応内容</th>
        <th style="width: 200px; min-width: 200px;">備考・直近要対応内容</th>
        <th style="width: 100px; min-width: 100px;">相談支援</th>
    `;

    // 記録ビューのヘッダー
    const recordHeaders = `
        <th style="width: 80px; text-align: center;">ID</th>
        <th style="width: 150px; text-align: center;">氏名</th>
        <th style="width: 120px; text-align: center;">受給者証</th>
        <th style="width: 140px; text-align: center;">個別支援計画</th>
        <th style="width: 130px; text-align: center;">アセスメント</th>
        <th style="width: 130px; text-align: center;">モニタリング</th>
        <th style="width: 120px; text-align: center;">マニュアル</th>
        <th style="width: 160px; text-align: center;">事故・ヒヤリハット</th>
    `;

    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;

            // アクティブボタンを切り替え
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // ヘッダーを切り替え
            if (view === 'basic') {
                thead.innerHTML = basicHeaders;
            } else if (view === 'office') {
                thead.innerHTML = officeHeaders;
            } else if (view === 'record') {
                thead.innerHTML = recordHeaders;
            }

            // データを再読み込み
            loadUsersFromStorage(view);
        });
    });
}

// localStorageから利用者データを読み込んでテーブルに表示
function loadUsersFromStorage(view = 'basic') {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const tbody = document.querySelector('.users-table tbody');

    // 既存のサンプルデータを常にクリア
    tbody.innerHTML = '';

    if (users.length === 0) {
        console.log('保存された利用者データがありません');
        // 空のメッセージを表示
        let colspan = '8';
        if (view === 'office') colspan = '12';
        else if (view === 'record') colspan = '8';
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 2rem; color: #999;">登録された利用者がいません</td></tr>`;
        updateUserCount();
        return;
    }

    // 保存された利用者データを表示
    users.forEach(user => {
        const row = document.createElement('tr');

        if (view === 'basic') {
            // 年齢を表示（保存された年齢を使用）
            let age = user.age ? user.age + '歳' : '-';

            // 性別を表示
            let genderText = '-';
            if (user.gender === 'male') {
                genderText = '男性';
            } else if (user.gender === 'female') {
                genderText = '女性';
            }

            // エリア（グループ）を表示
            const area = user.group || '-';

            // フルネームを作成
            const fullName = user.lastName + (user.firstName ? ' ' + user.firstName : '');

            // ポイント表示（carePointsがあれば表示）
            const carePoints = user.carePoints ? `${user.carePoints}pt` : '-';

            row.innerHTML = `
                <td>${user.id}</td>
                <td class="user-name clickable-name" data-user-id="${user.id}">
                    <i class="far fa-user-circle"></i>
                    ${fullName.trim() || '-'}
                </td>
                <td>${age}</td>
                <td>${genderText}</td>
                <td>${area}</td>
                <td>${user.phone || user.mobile || '-'}</td>
                <td>-</td>
                <td><span style="color: #f39c12; font-weight: bold;">${carePoints}</span></td>
            `;
        } else if (view === 'office') {
            // ステータスクラス
            const statusClass = user.officeStatus === 'ケア介入中' ? 'active' : 'inactive';

            // フルネームを作成
            const fullName = user.lastName + (user.firstName ? ' ' + user.firstName : '');

            row.innerHTML = `
                <td style="width: 60px; min-width: 60px;">${user.id}</td>
                <td class="user-name clickable-name" data-user-id="${user.id}" style="width: 120px; min-width: 120px;">
                    <i class="far fa-user-circle"></i>
                    ${fullName.trim() || '-'}
                </td>
                <td style="width: 80px; min-width: 80px;">${user.area || user.group || '-'}</td>
                <td class="editable-cell" contenteditable="true" data-field="helperName" data-user-id="${user.id}" style="width: 80px; min-width: 80px;">${user.helperName || ''}</td>
                <td class="gender-select-cell" data-user-id="${user.id}" style="width: 100px; min-width: 100px;">
                    <select class="inline-select gender-select" data-field="desiredGender">
                        <option value="">-</option>
                        <option value="male" ${user.desiredGender === 'male' ? 'selected' : ''}>男</option>
                        <option value="female" ${user.desiredGender === 'female' ? 'selected' : ''}>女</option>
                        <option value="both" ${user.desiredGender === 'both' ? 'selected' : ''}>両</option>
                    </select>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 100px; min-width: 100px;"><button class="detail-btn days-detail-btn" data-user-id="${user.id}">詳細</button></td>
                <td class="status-select-cell multi-select-cell" data-user-id="${user.id}" data-field="officeStatus" style="width: 120px; min-width: 120px;">
                    <div class="multi-select-display">${formatMultiSelectDisplay(user.officeStatus, 'officeStatus')}</div>
                </td>
                <td class="certificate-select-cell multi-select-cell" data-user-id="${user.id}" data-field="certificateStatus" style="width: 130px; min-width: 130px;">
                    <div class="multi-select-display">${formatMultiSelectDisplay(user.certificateStatus, 'certificateStatus')}</div>
                </td>
                <td class="custody-select-cell multi-select-cell" data-user-id="${user.id}" data-field="certificateCustody" style="width: 160px; min-width: 160px;">
                    <div class="multi-select-display">${formatMultiSelectDisplay(user.certificateCustody, 'certificateCustody')}</div>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 150px; min-width: 150px;"><button class="detail-btn response-detail-btn" data-user-id="${user.id}">詳細</button></td>
                <td style="text-align: center; vertical-align: middle; width: 200px; min-width: 200px;"><button class="detail-btn notes-detail-btn" data-user-id="${user.id}">詳細</button></td>
                <td style="text-align: center; vertical-align: middle; width: 100px; min-width: 100px;"><button class="detail-btn consultation-detail-btn" data-user-id="${user.id}">詳細</button></td>
            `;
        } else if (view === 'record') {
            // フルネームを作成
            const fullName = user.lastName + (user.firstName ? ' ' + user.firstName : '');

            // 各記録項目の有無を判定
            // 受給者証は新しい配列形式(certificateHistory)または旧形式の個別フィールドをチェック
            const hasCertificate = (user.certificateHistory && Array.isArray(user.certificateHistory) && user.certificateHistory.length > 0) ||
                                   (user.certMunicipality && user.certMunicipality.trim().length > 0) ||
                                   (user.certNumber && user.certNumber.trim().length > 0) ||
                                   (user.certValidFrom && user.certValidFrom.trim().length > 0) ||
                                   (user.certValidTo && user.certValidTo.trim().length > 0) ||
                                   (user.certNotes && user.certNotes.trim().length > 0);
            const hasSupportPlan = user.supportPlan && user.supportPlan.trim().length > 0;
            const hasAssessment = user.assessment && user.assessment.trim().length > 0;
            const hasMonitoring = user.monitoring && user.monitoring.trim().length > 0;
            const hasManual = user.manual && user.manual.trim().length > 0;
            const hasIncident = user.incident && user.incident.trim().length > 0;

            row.innerHTML = `
                <td style="width: 80px; text-align: center;">${user.id}</td>
                <td class="user-name clickable-name" data-user-id="${user.id}" style="width: 150px; text-align: center;">
                    <i class="far fa-user-circle"></i>
                    ${fullName.trim() || '-'}
                </td>
                <td style="text-align: center; vertical-align: middle; width: 120px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="certificate">
                    <span style="color: ${hasCertificate ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasCertificate ? 'あり' : 'なし'}</span>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 140px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="supportPlan">
                    <span style="color: ${hasSupportPlan ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasSupportPlan ? 'あり' : 'なし'}</span>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 130px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="assessment">
                    <span style="color: ${hasAssessment ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasAssessment ? 'あり' : 'なし'}</span>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 130px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="monitoring">
                    <span style="color: ${hasMonitoring ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasMonitoring ? 'あり' : 'なし'}</span>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 120px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="manual">
                    <span style="color: ${hasManual ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasManual ? 'あり' : 'なし'}</span>
                </td>
                <td style="text-align: center; vertical-align: middle; width: 160px; cursor: pointer;" class="record-cell" data-user-id="${user.id}" data-record-type="incident">
                    <span style="color: ${hasIncident ? '#27ae60' : '#95a5a6'}; font-weight: bold;">${hasIncident ? 'あり' : 'なし'}</span>
                </td>
            `;
        }

        tbody.appendChild(row);
    });

    // テーブル行のイベントを再設定（基本ビューのみ）
    if (view === 'basic') {
        setupViewButtons();
        setupEditButtons();
    }

    // 氏名クリックイベントを設定
    setupNameClick();

    // 事業所管理ビューの場合、編集可能セルのイベントを設定
    if (view === 'office') {
        setupEditableCells();
        setupInlineSelects();
        setupDetailButtons();
        setupDaysDetailButtons();
        setupResponseDetailButtons();
        setupNotesDetailButtons();
        setupMultiSelectCells();
    }

    // 記録ビューの場合、記録セルのイベントを設定
    if (view === 'record') {
        setupRecordCells();
    }

    // 列リサイズ機能を有効化
    // 列幅を復元してからリサイズ機能を設定
    setTimeout(() => {
        setupColumnResize();
    }, 50);

    // 利用者数を更新
    updateUserCount();
}

// 編集可能セルの設定
function setupEditableCells() {
    const editableCells = document.querySelectorAll('.editable-cell');

    editableCells.forEach(cell => {
        cell.addEventListener('blur', function() {
            const userId = this.dataset.userId;
            const field = this.dataset.field;
            const value = this.textContent.trim();

            saveUserField(userId, field, value);
        });

        // Enterキーで次のセルに移動
        cell.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
        });

        // クリック時に行のクリックイベントを停止
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
}

// インライン選択の設定
function setupInlineSelects() {
    const selects = document.querySelectorAll('.inline-select');

    selects.forEach(select => {
        // 希望性別の初期色を設定
        if (select.classList.contains('gender-select')) {
            updateGenderSelectColor(select);
        }

        select.addEventListener('change', function() {
            const userId = this.closest('td').dataset.userId;
            const field = this.dataset.field;

            // 複数選択の場合は配列として保存
            let value;
            if (this.multiple) {
                value = Array.from(this.selectedOptions).map(option => option.value);
            } else {
                value = this.value;
            }

            saveUserField(userId, field, value);

            // 希望性別の色を更新
            if (this.classList.contains('gender-select')) {
                updateGenderSelectColor(this);
            }
        });

        // クリック時に行のクリックイベントを停止
        select.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
}

// 希望性別の選択肢の色を更新
function updateGenderSelectColor(select) {
    const value = select.value;

    // すべての色クラスを削除
    select.classList.remove('gender-male', 'gender-female', 'gender-both');

    // 選択された値に応じて色クラスを追加
    if (value === 'male') {
        select.classList.add('gender-male');
    } else if (value === 'female') {
        select.classList.add('gender-female');
    } else if (value === 'both') {
        select.classList.add('gender-both');
    }
}

// 複数選択の表示をカラーバッジでフォーマット
function formatMultiSelectDisplay(value, field) {
    let values = Array.isArray(value) ? value : (value ? [value] : []);

    if (values.length === 0) {
        return '-';
    }

    return values.map(val => {
        let colorClass = '';

        if (field === 'officeStatus') {
            // ステータスの色分け
            if (val === 'ケア介入中') colorClass = 'status-badge-care';
            else if (val === '未契約') colorClass = 'status-badge-not-contracted';
            else if (val === '契約済み') colorClass = 'status-badge-contracted';
            else if (val === 'ツナグ案件') colorClass = 'status-badge-tsunagu';
            else if (val === '同行中') colorClass = 'status-badge-accompanying';
            else if (val === '検討中') colorClass = 'status-badge-considering';
        } else if (field === 'certificateStatus') {
            // 受給者証状況の色分け
            if (val === '有効') colorClass = 'cert-status-valid';
            else if (val === '期限切れ') colorClass = 'cert-status-expired';
            else if (val === '未提出') colorClass = 'cert-status-not-submitted';
        } else if (field === 'certificateCustody') {
            // 受給者証預かり状況の色分け
            if (val === '預かり中') colorClass = 'cert-custody-holding';
            else if (val === '返却済み') colorClass = 'cert-custody-returned';
        }

        return `<span class="multi-badge ${colorClass}">${val}</span>`;
    }).join(' ');
}

// ユーザーフィールドを保存
function saveUserField(userId, field, value) {
    try {
        // localStorageからユーザーデータを取得
        const users = JSON.parse(localStorage.getItem('users') || '[]');
        const userIndex = users.findIndex(u => u.id === userId);

        if (userIndex >= 0) {
            // フィールドを更新
            users[userIndex][field] = value;

            // localStorageに保存
            localStorage.setItem('users', JSON.stringify(users));
            localStorage.setItem(`user_${userId}`, JSON.stringify(users[userIndex]));

            console.log(`保存完了: ID=${userId}, ${field}=${value}`);
        }
    } catch (error) {
        console.error('保存エラー:', error);
    }
}

// 相談支援詳細ボタンの設定
function setupDetailButtons() {
    const detailButtons = document.querySelectorAll('.consultation-detail-btn');

    detailButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            showConsultationDetailModal(userId);
        });
    });
}

// 相談支援詳細モーダルを表示
function showConsultationDetailModal(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'consultation-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>相談支援情報</h3>
                <button class="modal-close" id="consultation-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="form-row">
                        <label>相談支援事業所:</label>
                        <span style="flex: 1; padding: 0.5rem;">${user.soudanShienOffice || '-'}</span>
                    </div>
                    <div class="form-row">
                        <label>担当者名:</label>
                        <span style="flex: 1; padding: 0.5rem;">${user.soudanShienName || '-'}</span>
                    </div>
                    <div class="form-row">
                        <label>相談支援TEL:</label>
                        <span style="flex: 1; padding: 0.5rem;">${user.soudanShienTel || '-'}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#consultation-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 曜日詳細ボタンの設定
function setupDaysDetailButtons() {
    const daysButtons = document.querySelectorAll('.days-detail-btn');

    daysButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            showDaysDetailModal(userId);
        });
    });
}

// 曜日詳細モーダルを表示
function showDaysDetailModal(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'days-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>曜日情報</h3>
                <button class="modal-close" id="days-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="form-row">
                        <label>曜日:</label>
                        <textarea id="days-textarea" style="flex: 1; padding: 0.5rem; min-height: 150px; border: 1px solid #d0d0d0; border-radius: 4px; font-family: inherit;">${user.officeDays || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button id="days-cancel-btn" style="padding: 0.5rem 1rem; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">キャンセル</button>
                    <button id="days-save-btn" style="padding: 0.5rem 1rem; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 保存ボタンのイベント
    const saveBtn = modal.querySelector('#days-save-btn');
    saveBtn.addEventListener('click', () => {
        const textarea = modal.querySelector('#days-textarea');
        const value = textarea.value.trim();
        saveUserField(userId, 'officeDays', value);
        modal.remove();
    });

    // キャンセルボタンのイベント
    const cancelBtn = modal.querySelector('#days-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#days-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 複数選択セルの設定
function setupMultiSelectCells() {
    const multiSelectCells = document.querySelectorAll('.multi-select-cell');

    multiSelectCells.forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            const field = this.dataset.field;
            showMultiSelectModal(userId, field);
        });
    });
}

// 複数選択モーダルを表示
function showMultiSelectModal(userId, field) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // フィールドに応じた選択肢を設定
    let options = [];
    let title = '';

    if (field === 'officeStatus') {
        title = 'ステータス';
        options = ['ケア介入中', '未契約', '契約済み', 'ツナグ案件', '同行中', '検討中'];
    } else if (field === 'certificateStatus') {
        title = '受給者証状況';
        options = ['有効', '期限切れ', '未提出'];
    } else if (field === 'certificateCustody') {
        title = '受給者証預かり状況';
        options = ['預かり中', '返却済み'];
    }

    // 配列でない場合は空配列として処理
    let currentValues = user[field] || [];
    if (!Array.isArray(currentValues)) {
        currentValues = currentValues ? [currentValues] : [];
    }

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'multi-select-modal';

    const optionsHTML = options.map(option => {
        const checked = currentValues.includes(option) ? 'checked' : '';
        return `
            <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer; border-radius: 4px; transition: background 0.2s;">
                <input type="checkbox" value="${option}" ${checked} style="cursor: pointer;">
                <span>${option}</span>
            </label>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" id="multi-select-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    ${optionsHTML}
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button id="multi-select-cancel-btn" style="padding: 0.5rem 1rem; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">キャンセル</button>
                    <button id="multi-select-save-btn" style="padding: 0.5rem 1rem; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // ホバー効果
    const labels = modal.querySelectorAll('label');
    labels.forEach(label => {
        label.addEventListener('mouseenter', () => {
            label.style.background = '#f8f9fa';
        });
        label.addEventListener('mouseleave', () => {
            label.style.background = 'transparent';
        });
    });

    // 保存ボタンのイベント
    const saveBtn = modal.querySelector('#multi-select-save-btn');
    saveBtn.addEventListener('click', () => {
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
        const values = Array.from(checkboxes).map(cb => cb.value);
        saveUserField(userId, field, values);

        // 表示を更新（カラーバッジで）
        const cell = document.querySelector(`.multi-select-cell[data-user-id="${userId}"][data-field="${field}"]`);
        if (cell) {
            const display = cell.querySelector('.multi-select-display');
            display.innerHTML = formatMultiSelectDisplay(values, field);
        }

        modal.remove();
    });

    // キャンセルボタンのイベント
    const cancelBtn = modal.querySelector('#multi-select-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#multi-select-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 要対応内容詳細ボタンの設定
function setupResponseDetailButtons() {
    const responseButtons = document.querySelectorAll('.response-detail-btn');

    responseButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            showResponseDetailModal(userId);
        });
    });
}

// 要対応内容詳細モーダルを表示
function showResponseDetailModal(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'response-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>要対応内容</h3>
                <button class="modal-close" id="response-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="form-row">
                        <label>要対応内容:</label>
                        <textarea id="response-textarea" style="flex: 1; padding: 0.5rem; min-height: 150px; border: 1px solid #d0d0d0; border-radius: 4px; font-family: inherit;">${user.responseRequired || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button id="response-cancel-btn" style="padding: 0.5rem 1rem; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">キャンセル</button>
                    <button id="response-save-btn" style="padding: 0.5rem 1rem; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 保存ボタンのイベント
    const saveBtn = modal.querySelector('#response-save-btn');
    saveBtn.addEventListener('click', () => {
        const textarea = modal.querySelector('#response-textarea');
        const value = textarea.value.trim();
        saveUserField(userId, 'responseRequired', value);
        modal.remove();
    });

    // キャンセルボタンのイベント
    const cancelBtn = modal.querySelector('#response-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#response-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 備考・直近要対応内容詳細ボタンの設定
function setupNotesDetailButtons() {
    const notesButtons = document.querySelectorAll('.notes-detail-btn');

    notesButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            showNotesDetailModal(userId);
        });
    });
}

// 備考・直近要対応内容詳細モーダルを表示
function showNotesDetailModal(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'notes-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>備考・直近要対応内容</h3>
                <button class="modal-close" id="notes-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="form-row">
                        <label>備考・直近要対応内容:</label>
                        <textarea id="notes-textarea" style="flex: 1; padding: 0.5rem; min-height: 150px; border: 1px solid #d0d0d0; border-radius: 4px; font-family: inherit;">${user.officeNotes || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button id="notes-cancel-btn" style="padding: 0.5rem 1rem; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">キャンセル</button>
                    <button id="notes-save-btn" style="padding: 0.5rem 1rem; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 保存ボタンのイベント
    const saveBtn = modal.querySelector('#notes-save-btn');
    saveBtn.addEventListener('click', () => {
        const textarea = modal.querySelector('#notes-textarea');
        const value = textarea.value.trim();
        saveUserField(userId, 'officeNotes', value);
        modal.remove();
    });

    // キャンセルボタンのイベント
    const cancelBtn = modal.querySelector('#notes-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#notes-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 記録セルの設定
function setupRecordCells() {
    const recordCells = document.querySelectorAll('.record-cell');

    recordCells.forEach(cell => {
        cell.addEventListener('click', function(e) {
            e.stopPropagation();
            const userId = this.dataset.userId;
            const recordType = this.dataset.recordType;
            showRecordDetailModal(userId, recordType);
        });

        // ホバー効果
        cell.addEventListener('mouseenter', function() {
            this.style.background = '#f8f9fa';
        });
        cell.addEventListener('mouseleave', function() {
            this.style.background = '';
        });
    });
}

// 受給者証履歴一覧モーダルを表示
function showCertificateHistoryModal(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // 受給者証履歴を取得（certificateHistory配列、または現在のデータから生成）
    let certificates = [];

    // 新しい形式: certificateHistory配列
    if (user.certificateHistory && Array.isArray(user.certificateHistory)) {
        certificates = user.certificateHistory;
    }
    // 現在のデータを履歴として使用
    else if (user.certMunicipality || user.certNumber || user.certValidFrom || user.certValidTo || user.certNotes) {
        certificates = [{
            municipality: user.certMunicipality || '',
            number: user.certNumber || '',
            validFrom: user.certValidFrom || '',
            validTo: user.certValidTo || '',
            notes: user.certNotes || '',
            createdAt: new Date().toISOString()
        }];
    }

    // 履歴がない場合
    if (certificates.length === 0) {
        alert('受給者証の履歴がありません');
        return;
    }

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'certificate-history-modal';

    // 履歴一覧のHTMLを生成
    const historyItemsHTML = certificates.map((cert, index) => {
        return `
            <div class="certificate-history-item" data-user-id="${userId}" data-cert-index="${index}" style="padding: 1rem; border: 1px solid #e0e0e0; border-radius: 4px; cursor: pointer; transition: background 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; margin-bottom: 0.5rem;">${cert.municipality || '-'}</div>
                        <div style="color: #666; font-size: 0.9rem;">${cert.number || '-'}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.9rem; color: #666;">${cert.validFrom || '-'}〜${cert.validTo || '-'}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>受給者証履歴</h3>
                <button class="modal-close" id="certificate-history-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${historyItemsHTML}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 履歴アイテムのクリックイベント
    const historyItems = modal.querySelectorAll('.certificate-history-item');
    historyItems.forEach(item => {
        item.addEventListener('click', function() {
            const userId = this.dataset.userId;
            const certIndex = this.dataset.certIndex;

            // 利用者詳細ページに遷移（記録タブの受給者証を開く）
            window.location.href = `user-detail.html?id=${userId}&tab=record&subtab=certificate&certIndex=${certIndex}`;
        });

        // ホバー効果
        item.addEventListener('mouseenter', function() {
            this.style.background = '#f8f9fa';
        });
        item.addEventListener('mouseleave', function() {
            this.style.background = 'transparent';
        });
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#certificate-history-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 記録詳細モーダルを表示
function showRecordDetailModal(userId, recordType) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);

    if (!user) return;

    // 受給者証の場合は履歴一覧モーダルを表示
    if (recordType === 'certificate') {
        showCertificateHistoryModal(userId);
        return;
    }

    // レコードタイプに応じたタイトルとフィールド名を設定
    let title = '';
    let fieldName = '';

    switch (recordType) {
        case 'supportPlan':
            title = '個別支援計画';
            fieldName = 'supportPlan';
            break;
        case 'assessment':
            title = 'アセスメント';
            fieldName = 'assessment';
            break;
        case 'monitoring':
            title = 'モニタリング';
            fieldName = 'monitoring';
            break;
        case 'manual':
            title = 'マニュアル';
            fieldName = 'manual';
            break;
        case 'incident':
            title = '事故・ヒヤリハット';
            fieldName = 'incident';
            break;
    }

    // モーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'record-modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" id="record-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="form-row">
                        <label>${title}:</label>
                        <textarea id="record-textarea" style="flex: 1; padding: 0.5rem; min-height: 300px; border: 1px solid #d0d0d0; border-radius: 4px; font-family: inherit;">${user[fieldName] || ''}</textarea>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                    <button id="record-cancel-btn" style="padding: 0.5rem 1rem; background: #f0f0f0; border: 1px solid #d0d0d0; border-radius: 4px; cursor: pointer;">キャンセル</button>
                    <button id="record-save-btn" style="padding: 0.5rem 1rem; background: #2c3e50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // 保存ボタンのイベント
    const saveBtn = modal.querySelector('#record-save-btn');
    saveBtn.addEventListener('click', () => {
        const textarea = modal.querySelector('#record-textarea');
        const value = textarea.value.trim();
        saveUserField(userId, fieldName, value);
        modal.remove();
        alert('保存しました');

        // 記録ビューを再読み込みして「あり/なし」表示を更新
        const activeViewBtn = document.querySelector('.view-toggle-btn.active');
        if (activeViewBtn && activeViewBtn.dataset.view === 'record') {
            loadUsersFromStorage('record');
        }
    });

    // キャンセルボタンのイベント
    const cancelBtn = modal.querySelector('#record-cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });

    // 閉じるボタンのイベント
    const closeBtn = modal.querySelector('#record-modal-close');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 列幅をlocalStorageから復元
function restoreColumnWidths(view = 'basic') {
    const savedWidths = localStorage.getItem(`columnWidths_${view}`);
    if (!savedWidths) {
        console.log(`保存された列幅がありません (${view})`);
        return;
    }

    try {
        const widths = JSON.parse(savedWidths);
        const table = document.querySelector('.users-table');
        if (!table) return;

        const thead = table.querySelector('thead');
        if (!thead) return;

        const ths = thead.querySelectorAll('th');
        const rows = table.querySelectorAll('tbody tr');

        ths.forEach((th, index) => {
            if (widths[index]) {
                th.style.width = widths[index] + 'px';
                th.style.minWidth = widths[index] + 'px';

                // 同じ列の全てのセルに幅を適用
                rows.forEach(row => {
                    const cell = row.children[index];
                    if (cell) {
                        cell.style.width = widths[index] + 'px';
                        cell.style.minWidth = widths[index] + 'px';
                    }
                });
            }
        });

        console.log(`列幅を復元しました (${view}):`, widths);
    } catch (error) {
        console.error('列幅の復元エラー:', error);
    }
}

// 列幅をlocalStorageに保存
function saveColumnWidths(view = 'basic') {
    const table = document.querySelector('.users-table');
    if (!table) return;

    const thead = table.querySelector('thead');
    if (!thead) return;

    const ths = thead.querySelectorAll('th');
    const widths = [];

    ths.forEach(th => {
        widths.push(th.offsetWidth);
    });

    localStorage.setItem(`columnWidths_${view}`, JSON.stringify(widths));
    console.log(`列幅を保存しました (${view}):`, widths);
}

// テーブル列のリサイズ機能
function setupColumnResize() {
    const table = document.querySelector('.users-table');
    if (!table) return;

    const thead = table.querySelector('thead');
    if (!thead) return;

    const ths = thead.querySelectorAll('th');

    // 現在のビューを判定
    const activeViewBtn = document.querySelector('.view-toggle-btn.active');
    const currentView = activeViewBtn ? activeViewBtn.dataset.view : 'basic';

    ths.forEach((th, index) => {
        // 既存のリサイザーを削除（重複防止）
        const existingResizer = th.querySelector('.column-resizer');
        if (existingResizer) {
            existingResizer.remove();
        }

        // リサイズハンドルを作成
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';
        th.style.position = 'relative';
        th.appendChild(resizer);

        let startX, startWidth, startNextWidth, nextTh;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            startX = e.pageX;
            startWidth = th.offsetWidth;

            // 対応する全てのセルの幅を設定
            const colIndex = Array.from(th.parentElement.children).indexOf(th);
            const rows = table.querySelectorAll('tbody tr');

            const mouseMoveHandler = (e) => {
                const diff = e.pageX - startX;
                const newWidth = Math.max(50, startWidth + diff); // 最小幅50px

                th.style.width = newWidth + 'px';
                th.style.minWidth = newWidth + 'px';

                // 同じ列の全てのセルに幅を適用
                rows.forEach(row => {
                    const cell = row.children[colIndex];
                    if (cell) {
                        cell.style.width = newWidth + 'px';
                        cell.style.minWidth = newWidth + 'px';
                    }
                });
            };

            const mouseUpHandler = () => {
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
                document.body.style.cursor = '';

                // リサイズ完了時に列幅を保存
                saveColumnWidths(currentView);
            };

            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });

        // ダブルクリックで自動調整
        resizer.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();

            th.style.width = 'auto';
            th.style.minWidth = 'auto';

            const colIndex = Array.from(th.parentElement.children).indexOf(th);
            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {
                const cell = row.children[colIndex];
                if (cell) {
                    cell.style.width = 'auto';
                    cell.style.minWidth = 'auto';
                }
            });

            // 自動調整後に列幅を保存
            setTimeout(() => {
                saveColumnWidths(currentView);
            }, 100);
        });
    });

    // 保存された列幅を復元
    restoreColumnWidths(currentView);
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('利用者管理ページを初期化中...');

    // localStorageからデータを読み込み
    loadUsersFromStorage();

    setupUserSearch();
    setupFilters();
    setupAddUserButton();
    setupPagination();
    setupViewToggle();
    setupColumnResize(); // 列リサイズ機能を有効化

    console.log('利用者管理ページ初期化完了');
});
