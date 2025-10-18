// ヘルパー詳細画面のJavaScript

// ポイント集計用のスプレッドシート設定
const POINTS_SHEET_CONFIG = {
    apiKey: 'AIzaSyDRoNhwY5oaRolDEp9eUny8_B3l9aTFZ2w',
    spreadsheetId: '1freFvPKDvQVYGxFrJ-wqeX2vlbVKXp_Nf7Hm7iN0Mkk',
    sheetName: 'ポイント使用ログ'
};

let isFormDirty = false;
let currentHelperId = null;

// 資格の選択肢
const qualificationOptions = [
    '看護師',
    '准看護師',
    '介護職員初任者研修',
    '介護職員実務者研修',
    '介護福祉士',
    '介護支援専門員',
    '移動介護従業者',
    '視覚障害者移動介護従業者',
    '全身性障害者移動介護従業者',
    '知的障害者移動介護従業者',
    '介護事務',
    '社会福祉士',
    '福祉住環境コーディネーター1級',
    '福祉住環境コーディネーター2級',
    '福祉住環境コーディネーター3級',
    '福祉用具専門相談員',
    '居宅介護従業者',
    '重度訪問介護従業者',
    '訪問介護員1級',
    '訪問介護員2級',
    '訪問介護員3級',
    '介護職員基礎研修',
    '重度訪問介護研修',
    '重度訪問介護追加研修',
    '行動援護従業者養成研修',
    '強度行動障害支援者養成研修（基礎研修）',
    '強度行動障害支援者養成研修（実践研修）',
    '同行援護従業者養成研修（一般課程）',
    '同行援護従業者養成研修（応用課程）',
    '喀痰吸引等第1号研修',
    '喀痰吸引等第2号研修',
    '喀痰吸引等第3号研修',
    '盲ろう者向け通訳・介助員',
    '精神保健福祉士',
    '作業療法士',
    '理学療法士',
    '言語聴覚士',
    '保育士',
    '福祉有償運送運転者講習',
    '市町村独自研修',
    'その他'
];

// URLからヘルパーIDを取得
function getHelperIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// 新規ヘルパー作成
function createNewHelper() {
    const lastName = document.getElementById('last-name').value;
    const furigana = document.getElementById('furigana').value;
    const gender = document.querySelector('input[name="gender"]:checked')?.value;
    const employeeNumber = document.getElementById('employee-number').value;

    if (!lastName || !furigana) {
        alert('氏名とフリガナは必須です');
        return;
    }

    if (!employeeNumber) {
        alert('社員番号を入力してください。「自動」ボタンで自動生成できます。');
        return;
    }

    // localStorageから全ヘルパーを取得
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    // 社員番号をIDとして使用
    const newId = employeeNumber;

    // フォームデータを収集
    const helperData = collectFormData();
    helperData.id = newId;
    helperData.employeeNumber = employeeNumber; // 社員番号も明示的に保存

    // helpersリストに追加
    helpers.push(helperData);
    localStorage.setItem('helpers', JSON.stringify(helpers));

    // 個別データとして保存
    localStorage.setItem(`helper_${newId}`, JSON.stringify(helperData));

    isFormDirty = false;
    alert('ヘルパーを登録しました');
    window.location.href = `helper-detail.html?id=${newId}`;
}

// 既存ヘルパー更新
function updateHelper(helperId) {
    const helperData = collectFormData();
    const newEmployeeNumber = helperData.employeeNumber;

    // 社員番号が変更された場合、IDも更新
    if (newEmployeeNumber && newEmployeeNumber !== helperId) {
        // 既存のヘルパーデータを削除
        localStorage.removeItem(`helper_${helperId}`);

        // 新しいIDで保存
        helperData.id = newEmployeeNumber;
        localStorage.setItem(`helper_${newEmployeeNumber}`, JSON.stringify(helperData));

        // helpersリスト内も更新
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
        const index = helpers.findIndex(h => h.id === helperId);
        if (index !== -1) {
            helpers[index] = helperData;
            localStorage.setItem('helpers', JSON.stringify(helpers));
        }

        isFormDirty = false;
        alert('ヘルパー情報を更新しました');

        // 新しいIDで詳細画面を再読み込み
        window.location.href = `helper-detail.html?id=${newEmployeeNumber}`;
    } else {
        // 社員番号が変更されていない場合は通常の更新
        helperData.id = helperId;

        // 個別データを更新
        localStorage.setItem(`helper_${helperId}`, JSON.stringify(helperData));

        // helpersリスト内も更新
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
        const index = helpers.findIndex(h => h.id === helperId);
        if (index !== -1) {
            helpers[index] = helperData;
            localStorage.setItem('helpers', JSON.stringify(helpers));
        }

        isFormDirty = false;
        alert('ヘルパー情報を更新しました');
    }
}

// フォームデータ収集
function collectFormData() {
    // 基本タブ
    const lastName = document.getElementById('last-name').value;
    const furigana = document.getElementById('furigana').value;
    const gender = document.querySelector('input[name="gender"]:checked')?.value;
    const birthDate = document.getElementById('birth-date').value;
    const employeeNumber = document.getElementById('employee-number').value;
    const nickname = document.getElementById('nickname').value;
    const postalCode = document.getElementById('postal-code').value;
    const address = document.getElementById('address').value;
    const phone = document.getElementById('phone').value;
    const mobile = document.getElementById('mobile').value;
    const email = document.getElementById('email').value;
    const jobTitle = document.getElementById('job-title').value;
    const area = document.getElementById('area').value;
    const isHelper = document.getElementById('is-helper').value;
    const kaigoSupportSenmonin = document.getElementById('kaigo-support-senmonin').value;
    const kaigoSupportNumber = document.getElementById('kaigo-support-number').value;
    const serviceProviderOfficer = document.getElementById('service-provider-officer').value;
    const soudanSupportSenmonin = document.getElementById('soudan-support-senmonin').value;
    const employmentType = document.getElementById('employment-type').value;
    const contractStart = document.getElementById('contract-start').value;
    const contractEnd = document.getElementById('contract-end').value;
    const notes = document.getElementById('notes').value;

    // 資格タブ
    const qualifications = collectQualifications();

    // 健康診断タブ
    const healthFiles = collectHealthFiles();

    // ステータスの取得 (ラジオボタンから)
    const status = document.querySelector('input[name="status"]:checked')?.value || 'active';

    return {
        lastName,
        furigana,
        gender,
        birthDate,
        employeeNumber,
        nickname,
        postalCode,
        address,
        phone,
        mobile,
        email,
        jobTitle,
        area,
        isHelper,
        kaigoSupportSenmonin,
        kaigoSupportNumber,
        serviceProviderOfficer,
        soudanSupportSenmonin,
        employmentType,
        contractStart,
        contractEnd,
        notes,
        qualifications,
        healthFiles,
        status
    };
}

// 削除ボタンの設定
function setupDeleteButton() {
    const deleteBtn = document.getElementById('delete-btn');

    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const helperId = getHelperIdFromUrl();

        if (!helperId) {
            alert('新規登録中のヘルパーは削除できません');
            return;
        }

        const helperName = document.getElementById('helper-name-title')?.textContent || 'ヘルパー';

        // 二段階確認
        if (!confirm(`本当に「${helperName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
            return;
        }

        if (!confirm(`最終確認: 「${helperName}」を完全に削除します。よろしいですか？`)) {
            return;
        }

        // helpersリストから削除
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');
        const filteredHelpers = helpers.filter(h => h.id !== helperId);
        localStorage.setItem('helpers', JSON.stringify(filteredHelpers));

        // 個別データを削除
        localStorage.removeItem(`helper_${helperId}`);

        isFormDirty = false;
        alert('ヘルパーを削除しました');
        window.location.href = 'helpers.html';
    });
}

// 保存ボタンの設定
function setupSaveButton() {
    const saveBtn = document.getElementById('save-btn');

    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const helperId = getHelperIdFromUrl();

        if (helperId) {
            // 既存ヘルパーを更新
            updateHelper(helperId);
        } else {
            // 新規ヘルパーを作成
            createNewHelper();
        }
    });
}

// キャンセルボタンの設定
function setupCancelButton() {
    const cancelBtn = document.getElementById('cancel-btn');

    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (isFormDirty) {
            if (!confirm('変更が保存されていません。戻りますか？')) {
                return;
            }
        }

        window.location.href = 'helpers.html';
    });
}

// フォーム変更検知
function setupFormChangeDetection() {
    const form = document.getElementById('helper-detail-form');
    const inputs = document.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
        input.addEventListener('change', () => {
            isFormDirty = true;
        });

        input.addEventListener('input', () => {
            isFormDirty = true;
        });
    });
}

// タブ切り替え
function setupTabs() {
    const tabs = document.querySelectorAll('.detail-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // アクティブクラスを削除
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // 新しいタブをアクティブに
            tab.classList.add('active');
            const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // ポイントタブが選択された場合、最新データを取得
            if (targetTab === 'points' && currentHelperId) {
                fetchPointsFromSheet().then(() => {
                    loadHelperPoints(currentHelperId);
                });
            }
        });
    });
}

// 日付ピッカーボタン
function setupDatePickers() {
    const datePickerBtns = document.querySelectorAll('.date-picker-btn');

    datePickerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = btn.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                showCalendar(input, btn);
            }
        });
    });
}

// カレンダーを表示
let currentCalendar = null;

function showCalendar(inputElement, buttonElement) {
    // 既存のカレンダーを閉じる
    if (currentCalendar) {
        currentCalendar.remove();
    }

    // カレンダー要素を作成
    const calendar = document.createElement('div');
    calendar.className = 'calendar-popup show';

    // 現在の日付を取得
    const today = new Date();
    let currentYear = today.getFullYear();
    let currentMonth = today.getMonth();

    // 入力値があれば解析
    if (inputElement.value) {
        const parsed = parseDateString(inputElement.value);
        if (parsed) {
            currentYear = parsed.getFullYear();
            currentMonth = parsed.getMonth();
        }
    }

    // カレンダーを描画
    function renderCalendar(year, month) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const prevLastDay = new Date(year, month, 0);
        const firstDayOfWeek = firstDay.getDay();
        const lastDate = lastDay.getDate();
        const prevLastDate = prevLastDay.getDate();

        // 西暦表示
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

        // 年選択用のオプションを生成（1998年から現在+1年まで）
        const todayYear = new Date().getFullYear();
        let yearOptions = '';
        for (let y = 1998; y <= todayYear + 1; y++) {
            const selected = y === year ? 'selected' : '';
            yearOptions += `<option value="${y}" ${selected}>${y}年</option>`;
        }

        let html = `
            <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" data-action="prev-month">◀</button>
                <div class="calendar-title">
                    <select class="calendar-year-select">${yearOptions}</select>
                    <select class="calendar-month-select">
                        ${monthNames.map((m, i) => `<option value="${i}" ${i === month ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
                <button type="button" class="calendar-nav-btn" data-action="next-month">▶</button>
            </div>
            <div class="calendar-weekdays">
                <div class="calendar-weekday sunday">日</div>
                <div class="calendar-weekday">月</div>
                <div class="calendar-weekday">火</div>
                <div class="calendar-weekday">水</div>
                <div class="calendar-weekday">木</div>
                <div class="calendar-weekday">金</div>
                <div class="calendar-weekday saturday">土</div>
            </div>
            <div class="calendar-days">
        `;

        // 前月の日付を表示
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            html += `<div class="calendar-day other-month">${prevLastDate - i}</div>`;
        }

        // 今月の日付を表示
        for (let day = 1; day <= lastDate; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            let classes = 'calendar-day';

            if (dayOfWeek === 0) classes += ' sunday';
            if (dayOfWeek === 6) classes += ' saturday';

            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                classes += ' today';
            }

            html += `<div class="${classes}" data-year="${year}" data-month="${month}" data-day="${day}">${day}</div>`;
        }

        // 次月の日付を表示（グリッドを埋める）
        const totalCells = firstDayOfWeek + lastDate;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remainingCells; i++) {
            html += `<div class="calendar-day other-month">${i}</div>`;
        }

        html += '</div>';
        calendar.innerHTML = html;

        // 年選択のイベント
        calendar.querySelector('.calendar-year-select').addEventListener('change', (e) => {
            e.stopPropagation();
            currentYear = parseInt(e.target.value);
            renderCalendar(currentYear, currentMonth);
        });

        // 月選択のイベント
        calendar.querySelector('.calendar-month-select').addEventListener('change', (e) => {
            e.stopPropagation();
            currentMonth = parseInt(e.target.value);
            renderCalendar(currentYear, currentMonth);
        });

        // ナビゲーションボタンのイベント
        calendar.querySelector('[data-action="prev-month"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar(currentYear, currentMonth);
        });

        calendar.querySelector('[data-action="next-month"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar(currentYear, currentMonth);
        });

        // 日付選択のイベント
        calendar.querySelectorAll('.calendar-day:not(.other-month)').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const year = parseInt(dayEl.dataset.year);
                const month = parseInt(dayEl.dataset.month) + 1;
                const day = parseInt(dayEl.dataset.day);

                // 西暦形式で入力
                const seireki = `${year}/${month}/${day}`;

                inputElement.value = seireki;
                isFormDirty = true;

                // カレンダーを閉じる
                calendar.remove();
                currentCalendar = null;
            });
        });
    }

    renderCalendar(currentYear, currentMonth);

    // ボタンの位置にカレンダーを配置
    const rect = buttonElement.getBoundingClientRect();
    calendar.style.position = 'fixed';
    calendar.style.top = (rect.bottom + 5) + 'px';
    calendar.style.left = rect.left + 'px';

    document.body.appendChild(calendar);
    currentCalendar = calendar;

    // 外側をクリックしたら閉じる
    setTimeout(() => {
        document.addEventListener('click', function closeCalendar(e) {
            if (!calendar.contains(e.target) && e.target !== buttonElement) {
                calendar.remove();
                currentCalendar = null;
                document.removeEventListener('click', closeCalendar);
            }
        });
    }, 0);
}

// 日付文字列をDateオブジェクトに変換（西暦・和暦両対応）
function parseDateString(dateStr) {
    // 西暦形式 (YYYY/M/D, YYYY-M-D)
    const seirekiMatch = dateStr.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (seirekiMatch) {
        const year = parseInt(seirekiMatch[1]);
        const month = parseInt(seirekiMatch[2]);
        const day = parseInt(seirekiMatch[3]);
        return new Date(year, month - 1, day);
    }

    // 和暦形式 (令和XX年X月X日)
    const warekiMatch = dateStr.match(/令和(\d+)年(\d+)月(\d+)日/);
    if (warekiMatch) {
        const reiwaYear = parseInt(warekiMatch[1]);
        const month = parseInt(warekiMatch[2]);
        const day = parseInt(warekiMatch[3]);
        const seirekiYear = reiwaYear + 2018;
        return new Date(seirekiYear, month - 1, day);
    }

    return null;
}

// 和暦文字列をDateオブジェクトに変換（後方互換性のため残す）
function parseWarekiDate(warekiStr) {
    return parseDateString(warekiStr);
}

// 郵便番号→住所
function setupAddressButton() {
    const addressBtns = document.querySelectorAll('.address-btn');

    addressBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('郵便番号検索機能は準備中です');
        });
    });
}

// 地図ボタン
function setupMapButton() {
    const mapBtns = document.querySelectorAll('.map-btn');

    mapBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('地図表示機能は準備中です');
        });
    });
}

// 自動ボタン（従業員番号）
function setupAutoButton() {
    const autoBtn = document.querySelector('.auto-btn');

    if (autoBtn) {
        autoBtn.addEventListener('click', (e) => {
            e.preventDefault();

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
            document.getElementById('employee-number').value = newId;
            isFormDirty = true;
        });
    }
}

// 年齢表示の更新
function updateAgeDisplay() {
    const birthDateInput = document.getElementById('birth-date');
    const ageDisplay = document.querySelector('.age-display');

    if (!birthDateInput || !ageDisplay) return;

    birthDateInput.addEventListener('change', () => {
        const birthDate = convertToSeireki(birthDateInput.value);
        if (birthDate) {
            const age = calculateAge(birthDate);
            ageDisplay.textContent = `(${age}歳)`;
        }
    });
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

// ヘルパーデータを読み込んでフォームに反映
function loadHelperData(helperId) {
    const helperData = JSON.parse(localStorage.getItem(`helper_${helperId}`));

    if (!helperData) {
        console.error('ヘルパーデータが見つかりません:', helperId);
        return;
    }

    // 基本情報
    document.getElementById('last-name').value = helperData.lastName || '';
    document.getElementById('furigana').value = helperData.furigana || '';
    // 社員番号がない場合はIDをセット
    document.getElementById('employee-number').value = helperData.employeeNumber || helperData.id || '';
    document.getElementById('nickname').value = helperData.nickname || '';
    document.getElementById('birth-date').value = helperData.birthDate || '';
    document.getElementById('postal-code').value = helperData.postalCode || '';
    document.getElementById('address').value = helperData.address || '';
    document.getElementById('phone').value = helperData.phone || '';
    document.getElementById('mobile').value = helperData.mobile || '';
    document.getElementById('email').value = helperData.email || '';
    document.getElementById('job-title').value = helperData.jobTitle || '';
    document.getElementById('area').value = helperData.area || '';
    document.getElementById('is-helper').value = helperData.isHelper || '';
    document.getElementById('kaigo-support-senmonin').value = helperData.kaigoSupportSenmonin || '';
    document.getElementById('kaigo-support-number').value = helperData.kaigoSupportNumber || '';
    document.getElementById('service-provider-officer').value = helperData.serviceProviderOfficer || '';
    document.getElementById('soudan-support-senmonin').value = helperData.soudanSupportSenmonin || '';
    document.getElementById('employment-type').value = helperData.employmentType || '';
    document.getElementById('contract-start').value = helperData.contractStart || '';
    document.getElementById('contract-end').value = helperData.contractEnd || '';
    document.getElementById('notes').value = helperData.notes || '';

    // 性別
    if (helperData.gender) {
        const genderRadio = document.querySelector(`input[name="gender"][value="${helperData.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
    }

    // ステータス
    const statusValue = helperData.status || 'active';
    const statusRadio = document.querySelector(`input[name="status"][value="${statusValue}"]`);
    if (statusRadio) statusRadio.checked = true;

    // 年齢表示
    if (helperData.birthDate) {
        const birthDate = convertToSeireki(helperData.birthDate);
        if (birthDate) {
            const age = calculateAge(birthDate);
            const ageDisplay = document.querySelector('.age-display');
            if (ageDisplay) {
                ageDisplay.textContent = `(${age}歳)`;
            }
        }
    }

    // 資格情報
    if (helperData.qualifications) {
        loadQualifications(helperData.qualifications);
    }

    // 健康診断ファイル
    if (helperData.healthFiles) {
        loadHealthFiles(helperData.healthFiles);
    }

    // タイトルとステータスを更新
    document.getElementById('helper-name-title').textContent = helperData.lastName || 'ヘルパー';
    document.getElementById('breadcrumb-name').textContent = helperData.lastName || 'ヘルパー詳細';

    const statusBadge = document.getElementById('helper-status');
    if (statusBadge) {
        const statusValue = helperData.status || 'active';
        statusBadge.textContent = statusValue === 'active' ? '稼働中' : '休み';
        statusBadge.className = 'status-badge ' + statusValue;
    }

    isFormDirty = false;
}

// ファイルアップロード機能
function setupHealthFileUpload() {
    const uploadBtn = document.getElementById('upload-health-file-btn');
    const fileInput = document.getElementById('health-file-input');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleHealthFileUpload(file);
                fileInput.value = ''; // リセット
            }
        });
    }
}

function handleHealthFileUpload(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const fileData = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: e.target.result,
            uploadDate: new Date().toISOString()
        };

        addHealthFileToList(fileData);
        isFormDirty = true;
    };

    reader.readAsDataURL(file);
}

function addHealthFileToList(fileData) {
    const list = document.getElementById('health-files-list');

    const fileItem = document.createElement('div');
    fileItem.className = 'health-file-item';
    fileItem.dataset.fileData = JSON.stringify(fileData);

    const icon = getFileIcon(fileData.type, fileData.name);
    const fileSize = formatFileSize(fileData.size);
    const uploadDate = new Date(fileData.uploadDate).toLocaleString('ja-JP');

    fileItem.innerHTML = `
        <div class="file-info">
            <i class="${icon}"></i>
            <div class="file-details">
                <div class="file-name">${fileData.name}</div>
                <div class="file-meta">${fileSize} - ${uploadDate}</div>
            </div>
        </div>
        <div class="file-actions">
            <button type="button" class="btn-icon download-file-btn" title="ダウンロード">
                <i class="fas fa-download"></i>
            </button>
            <button type="button" class="btn-icon remove-file-btn" title="削除">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    // ダウンロードボタン
    fileItem.querySelector('.download-file-btn').addEventListener('click', () => {
        downloadFile(fileData);
    });

    // 削除ボタン
    fileItem.querySelector('.remove-file-btn').addEventListener('click', () => {
        if (confirm(`「${fileData.name}」を削除しますか？`)) {
            fileItem.remove();
            isFormDirty = true;
        }
    });

    list.appendChild(fileItem);
}

function getFileIcon(fileType, fileName) {
    const ext = fileName.split('.').pop().toLowerCase();

    if (fileType.includes('pdf') || ext === 'pdf') {
        return 'fas fa-file-pdf file-icon-pdf';
    } else if (fileType.includes('csv') || ext === 'csv') {
        return 'fas fa-file-csv file-icon-csv';
    } else if (fileType.includes('image') || ['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        return 'fas fa-file-image file-icon-image';
    } else if (['doc', 'docx'].includes(ext)) {
        return 'fas fa-file-word file-icon-word';
    } else if (['xls', 'xlsx'].includes(ext)) {
        return 'fas fa-file-excel file-icon-excel';
    } else {
        return 'fas fa-file file-icon-default';
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function downloadFile(fileData) {
    const a = document.createElement('a');
    a.href = fileData.data;
    a.download = fileData.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function collectHealthFiles() {
    const files = [];
    const items = document.querySelectorAll('.health-file-item');

    items.forEach(item => {
        try {
            const fileData = JSON.parse(item.dataset.fileData);
            files.push(fileData);
        } catch (e) {
            console.error('Failed to parse file data:', e);
        }
    });

    return files;
}

function loadHealthFiles(files) {
    const list = document.getElementById('health-files-list');
    list.innerHTML = '';

    if (files && files.length > 0) {
        files.forEach(fileData => {
            addHealthFileToList(fileData);
        });
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('ヘルパー詳細ページを初期化中...');

    currentHelperId = getHelperIdFromUrl();

    if (currentHelperId) {
        console.log('既存ヘルパーを読み込み中:', currentHelperId);
        loadHelperData(currentHelperId);
    } else {
        console.log('新規ヘルパー登録モード');
        document.getElementById('helper-name-title').textContent = '新規ヘルパー';
        document.getElementById('breadcrumb-name').textContent = '新規ヘルパー登録';
    }

    setupTabs();
    setupSaveButton();
    setupCancelButton();
    setupDeleteButton();
    setupFormChangeDetection();
    setupDatePickers();
    setupAddressButton();
    setupMapButton();
    setupAutoButton();
    updateAgeDisplay();

    setupQualifications();
    setupHealthFileUpload();

    // ポイントデータを取得
    fetchPointsFromSheet().then(() => {
        // ポイントタブの初期化
        if (currentHelperId) {
            loadHelperPoints(currentHelperId);
        }
    });

    console.log('ヘルパー詳細ページ初期化完了');
});

// 資格管理機能
function setupQualifications() {
    const addBtn = document.getElementById('add-qualification-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addQualificationItem());
    }
}

// 資格アイテムを追加
function addQualificationItem(qualification = '', issueDate = '') {
    const list = document.getElementById('qualifications-list');

    const item = document.createElement('div');
    item.className = 'qualification-display-item';

    // 編集中かどうかのフラグ
    item.dataset.editing = 'false';
    item.dataset.qualification = qualification;
    item.dataset.issueDate = issueDate;

    // 表示モードのHTML
    function renderDisplayMode() {
        item.innerHTML = `
            <div class="qualification-info">
                <span class="qualification-name">${qualification || '未選択'}</span>
                <span class="qualification-date-text">${issueDate || ''}</span>
            </div>
            <button type="button" class="edit-qualification-btn">編集</button>
        `;

        // 編集ボタンのイベント
        item.querySelector('.edit-qualification-btn').addEventListener('click', () => {
            renderEditMode();
        });
    }

    // 編集モードのHTML
    function renderEditMode() {
        item.dataset.editing = 'true';

        // 資格セレクトボックスの選択肢を生成
        let options = '<option value="">選択してください</option>';
        qualificationOptions.forEach(opt => {
            const selected = opt === item.dataset.qualification ? 'selected' : '';
            options += `<option value="${opt}" ${selected}>${opt}</option>`;
        });

        item.innerHTML = `
            <div class="qualification-edit-form">
                <select class="qualification-select">
                    ${options}
                </select>
                <div class="input-with-button">
                    <input type="text" class="qualification-date" value="${item.dataset.issueDate}" placeholder="2024/7/1">
                    <button type="button" class="date-picker-btn">📅</button>
                </div>
            </div>
            <div class="qualification-edit-buttons">
                <button type="button" class="save-qualification-btn">保存</button>
                <button type="button" class="cancel-qualification-btn">キャンセル</button>
                <button type="button" class="remove-qualification-btn">削除</button>
            </div>
        `;

        // 日付ピッカーボタンのイベント
        const datePickerBtn = item.querySelector('.date-picker-btn');
        const dateInput = item.querySelector('.qualification-date');
        datePickerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showCalendar(dateInput, datePickerBtn);
        });

        // 保存ボタンのイベント
        item.querySelector('.save-qualification-btn').addEventListener('click', () => {
            const select = item.querySelector('.qualification-select');
            const dateInput = item.querySelector('.qualification-date');

            item.dataset.qualification = select.value;
            item.dataset.issueDate = dateInput.value;

            qualification = select.value;
            issueDate = dateInput.value;

            isFormDirty = true;
            renderDisplayMode();
        });

        // キャンセルボタンのイベント
        item.querySelector('.cancel-qualification-btn').addEventListener('click', () => {
            renderDisplayMode();
        });

        // 削除ボタンのイベント
        item.querySelector('.remove-qualification-btn').addEventListener('click', () => {
            item.remove();
            isFormDirty = true;
        });
    }

    list.appendChild(item);

    // 新規追加の場合は編集モードで表示
    if (!qualification && !issueDate) {
        renderEditMode();
    } else {
        renderDisplayMode();
    }

    isFormDirty = true;
}

// 資格データを収集
function collectQualifications() {
    const qualifications = [];
    const items = document.querySelectorAll('.qualification-display-item');

    items.forEach(item => {
        const qualification = item.dataset.qualification;
        const issueDate = item.dataset.issueDate;

        if (qualification) {
            qualifications.push({
                qualification,
                issueDate
            });
        }
    });

    return qualifications;
}

// 資格データを表示
function loadQualifications(qualifications) {
    const list = document.getElementById('qualifications-list');
    list.innerHTML = '';

    if (qualifications && qualifications.length > 0) {
        qualifications.forEach(q => {
            addQualificationItem(q.qualification, q.issueDate);
        });
    }
}

// スプレッドシートからポイント集計データを取得
async function fetchPointsFromSheet() {
    try {
        const { apiKey, spreadsheetId, sheetName } = POINTS_SHEET_CONFIG;

        console.log('ポイント集計データを取得中...');

        // ヘッダー行も含めて広い範囲を取得 (H2:L28)
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

        // ヘッダー行から「残り」列のインデックスを探す
        const headerRow = data.values[0];
        let remainingColumnIndex = -1;

        for (let i = 0; i < headerRow.length; i++) {
            if (headerRow[i] && headerRow[i].includes('残り')) {
                remainingColumnIndex = i;
                console.log(`「残り」列を発見: インデックス ${i}`);
                break;
            }
        }

        // 「残り」列が見つからない場合は、I列（インデックス1）をデフォルトとして使用
        if (remainingColumnIndex === -1) {
            console.warn('「残り」列が見つかりません。I列を使用します。');
            remainingColumnIndex = 1;
        }

        // ヘルパーのポイントデータを取得・更新
        let helperPoints = JSON.parse(localStorage.getItem('helperPoints') || '[]');
        const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

        // データ行を処理
        for (let i = 1; i < data.values.length; i++) {
            const row = data.values[i];

            if (!row[0]) continue;

            const nameCell = row[0].trim();
            const points = parseInt(row[remainingColumnIndex]) || 0;

            // 名前から「H3」「H4」などの記号を除去
            let lastName = nameCell.replace(/H+\d+$/, '').trim();

            if (!lastName) continue;

            // ヘルパーを苗字で検索
            const helper = helpers.find(h => h.lastName === lastName);

            if (!helper) {
                console.log(`ヘルパーが見つかりません: ${lastName}`);
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

            console.log(`${lastName}さんのポイントを更新: ${points}pt`);
        }

        // localStorageに保存
        localStorage.setItem('helperPoints', JSON.stringify(helperPoints));

        console.log('ポイント集計データの取得完了');

        // 現在表示中のヘルパーのポイントを再読み込み
        if (currentHelperId) {
            loadHelperPoints(currentHelperId);
        }

    } catch (error) {
        console.error('ポイント取得エラー:', error);
    }
}

// ポイントタブ機能
function loadHelperPoints(helperId) {
    // LocalStorageからポイントデータを取得
    const helperPoints = JSON.parse(localStorage.getItem('helperPoints') || '[]');
    const pointsHistory = JSON.parse(localStorage.getItem('pointsHistory') || '[]');

    // 該当ヘルパーのデータを検索
    const helperData = helperPoints.find(h => h.id === helperId);

    if (helperData) {
        // 累計ポイントと完了ケア数を表示
        document.getElementById('helper-total-points').textContent = helperData.totalPoints || 0;
        document.getElementById('helper-completed-cares').textContent = helperData.completedCares || 0;

        // ポイント履歴を表示
        const helperHistory = pointsHistory.filter(h => h.helperId === helperId);
        renderHelperPointsHistory(helperHistory);
    } else {
        // データがない場合は0を表示
        document.getElementById('helper-total-points').textContent = '0';
        document.getElementById('helper-completed-cares').textContent = '0';
        document.getElementById('helper-points-history').innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">まだポイント獲得履歴がありません</p>';
    }
}

// ポイント履歴を表示
function renderHelperPointsHistory(history) {
    const historyList = document.getElementById('helper-points-history');

    if (!history || history.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #999; padding: 2rem;">まだポイント獲得履歴がありません</p>';
        return;
    }

    historyList.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="history-date">${h.date}</div>
            <div class="history-content">
                <div class="history-title">${h.careType || 'ケア完了'}</div>
                <div class="history-helper">利用者: ${h.userName || '不明'}</div>
            </div>
            <span class="history-status" style="background: #f39c12; color: white; padding: 0.3rem 0.8rem; border-radius: 4px;">
                <i class="fas fa-star"></i> +${h.points}pt
            </span>
        </div>
    `).join('');
}
