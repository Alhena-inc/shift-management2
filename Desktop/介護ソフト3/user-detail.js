// URLパラメータから利用者IDを取得
function getUserIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// URLパラメータからタブ情報を取得
function getTabFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        tab: urlParams.get('tab'),
        subtab: urlParams.get('subtab'),
        certIndex: urlParams.get('certIndex')
    };
}

// 保存ボタン
function setupSaveButton() {
    const saveBtn = document.getElementById('save-btn');

    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // 基本タブのフォームデータを収集
        const formData = {
            // 基本情報
            lastName: document.getElementById('last-name')?.value || '',
            firstName: document.getElementById('first-name')?.value || '',
            childLastName: document.getElementById('child-last-name')?.value || '',
            childFirstName: document.getElementById('child-first-name')?.value || '',
            furiganaLast: document.getElementById('furigana-last')?.value || '',
            furiganaFirst: document.getElementById('furigana-first')?.value || '',
            childFuriganaLast: document.getElementById('child-furigana-last')?.value || '',
            childFuriganaFirst: document.getElementById('child-furigana-first')?.value || '',
            gender: document.querySelector('input[name="gender"]:checked')?.value || '',
            childGender: document.querySelector('input[name="child-gender"]:checked')?.value || '',
            birthDate: document.getElementById('birth-date')?.value || '',
            childBirthDate: document.getElementById('child-birth-date')?.value || '',
            age: document.querySelector('.age-display')?.textContent?.replace(/[()歳]/g, '').trim() || '0',
            customerNumber: document.getElementById('customer-number')?.value || '',
            nickname: document.getElementById('nickname')?.value || '',
            postalCode: document.getElementById('postal-code')?.value || '',
            address: document.getElementById('address')?.value || '',
            latLng: document.getElementById('address2')?.value || '',
            phone: document.getElementById('phone')?.value || '',
            mobile: document.getElementById('mobile')?.value || '',
            group: document.getElementById('group')?.value || '',
            contractStart: document.getElementById('contract-start')?.value || '',
            contractEnd: document.getElementById('contract-end')?.value || '',
            terminationReason: document.getElementById('termination-reason')?.value || '',
            notes: document.getElementById('notes')?.value || '',
            carePoints: document.getElementById('care-points')?.value || '',

            // 事業所管理タブ
            officeUserName: document.getElementById('office-user-name')?.value || '',
            officeUserTel: document.getElementById('office-user-tel')?.value || '',
            officeContractDate: document.getElementById('office-contract-date')?.value || '',
            officeEntryDate: document.getElementById('office-entry-date')?.value || '',
            officeServiceType: document.getElementById('service-type')?.value || '',
            officeStatus: document.getElementById('office-status')?.value || '',
            officeNotes: document.getElementById('office-notes')?.value || '',
            helperName: document.getElementById('helper-name')?.value || '',
            area: document.getElementById('area')?.value || '',
            officeDays: document.getElementById('office-days')?.value || '',
            desiredGender: document.querySelector('.gender-btn.active')?.dataset.gender || '',
            soudanShienOffice: document.getElementById('office-soudan-jigyosho')?.value || '',
            soudanShienName: document.getElementById('office-tantou-name')?.value || '',
            soudanShienTel: document.getElementById('office-soudan-tel')?.value || '',

            // 記録タブ - 受給者証（個別フィールドは後方互換性のため保持）
            certMunicipality: document.getElementById('cert-municipality')?.value || '',
            certNumber: document.getElementById('cert-number')?.value || '',
            certValidFrom: document.getElementById('cert-valid-from')?.value || '',
            certValidTo: document.getElementById('cert-valid-to')?.value || '',
            certNotes: document.getElementById('cert-notes')?.value || '',

            // その他の記録
            supportPlan: document.getElementById('support-plan')?.value || '',
            assessment: document.getElementById('assessment')?.value || '',
            monitoring: document.getElementById('monitoring')?.value || '',
            manual: document.getElementById('manual')?.value || '',
            incident: document.getElementById('incident')?.value || '',

            // 緊急連絡先
            emergency1Name: document.getElementById('emergency1-name')?.value || '',
            emergency1Birthdate: document.getElementById('emergency1-birthdate')?.value || '',
            emergency1Postal: document.getElementById('emergency1-postal')?.value || '',
            emergency1Address: document.getElementById('emergency1-address')?.value || '',
            emergency1Phone: document.getElementById('emergency1-phone')?.value || '',
            emergency1Mobile: document.getElementById('emergency1-mobile')?.value || '',
            emergency1Relationship: document.getElementById('emergency1-relationship')?.value || '',

            emergency2Name: document.getElementById('emergency2-name')?.value || '',
            emergency2Birthdate: document.getElementById('emergency2-birthdate')?.value || '',
            emergency2Postal: document.getElementById('emergency2-postal')?.value || '',
            emergency2Address: document.getElementById('emergency2-address')?.value || '',
            emergency2Phone: document.getElementById('emergency2-phone')?.value || '',
            emergency2Mobile: document.getElementById('emergency2-mobile')?.value || '',
            emergency2Relationship: document.getElementById('emergency2-relationship')?.value || '',

            consultantName: document.getElementById('consultant-name')?.value || '',
            consultantBirthdate: document.getElementById('consultant-birthdate')?.value || '',
            consultantPostal: document.getElementById('consultant-postal')?.value || '',
            consultantAddress: document.getElementById('consultant-address')?.value || '',
            consultantPhone: document.getElementById('consultant-phone')?.value || '',
            consultantMobile: document.getElementById('consultant-mobile')?.value || '',
            consultantRelationship: document.getElementById('consultant-relationship')?.value || '',
        };

        // URLから利用者IDを取得（新規の場合は新しいIDを生成）
        let userId = getUserIdFromUrl();
        if (!userId) {
            // 新規利用者の場合、新しいIDを生成（3桁ゼロパディング）
            const existingUsers = JSON.parse(localStorage.getItem('users') || '[]');
            userId = String(existingUsers.length + 1).padStart(3, '0');
        }

        formData.id = userId;
        formData.customerNumber = userId; // IDと顧客番号を同じにする
        formData.status = document.getElementById('user-status')?.textContent || '利用中';

        // 受給者証の配列を保存
        formData.certificateHistory = saveCertificates();

        try {
            // localStorageから既存の利用者リストを取得
            const users = JSON.parse(localStorage.getItem('users') || '[]');

            // 既存の利用者を更新、または新規追加
            const existingIndex = users.findIndex(u => u.id === userId);
            if (existingIndex >= 0) {
                users[existingIndex] = formData;
            } else {
                users.push(formData);
            }

            // localStorageに保存
            localStorage.setItem('users', JSON.stringify(users));

            // 個別の利用者データも保存
            localStorage.setItem(`user_${userId}`, JSON.stringify(formData));

            console.log('保存データ:', formData);
            alert('利用者情報を保存しました');

            // フォームの変更フラグをリセット
            isFormDirty = false;

            // 一覧ページに戻る
            if (confirm('利用者一覧に戻りますか？')) {
                window.location.href = 'users.html';
            }

        } catch (error) {
            console.error('保存エラー:', error);
            alert('保存に失敗しました');
        }
    });
}

// キャンセルボタン
function setupCancelButton() {
    const cancelBtn = document.getElementById('cancel-btn');

    cancelBtn.addEventListener('click', () => {
        if (confirm('編集内容を破棄して一覧に戻りますか？')) {
            window.location.href = 'users.html';
        }
    });
}

// 削除ボタン
function setupDeleteButton() {
    const deleteBtn = document.getElementById('delete-btn');

    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const userId = getUserIdFromUrl();

        // 新規登録の場合は削除できない
        if (!userId) {
            alert('新規登録中の利用者は削除できません');
            return;
        }

        // 利用者名を取得
        const userName = document.getElementById('user-name-title')?.textContent || '利用者';

        // 確認ダイアログを表示
        if (!confirm(`本当に「${userName}」を削除しますか？\n\nこの操作は取り消せません。`)) {
            return;
        }

        // 二重確認
        if (!confirm(`最終確認: 「${userName}」を完全に削除します。よろしいですか？`)) {
            return;
        }

        try {
            // localStorageから利用者リストを取得
            const users = JSON.parse(localStorage.getItem('users') || '[]');

            // 該当の利用者を除外
            const filteredUsers = users.filter(u => u.id !== userId);

            // localStorageを更新
            localStorage.setItem('users', JSON.stringify(filteredUsers));

            // 個別の利用者データも削除
            localStorage.removeItem(`user_${userId}`);

            console.log(`利用者ID: ${userId} を削除しました`);
            alert('利用者を削除しました');

            // フォームの変更フラグをリセット
            isFormDirty = false;

            // 一覧ページに戻る
            window.location.href = 'users.html';

        } catch (error) {
            console.error('削除エラー:', error);
            alert('削除に失敗しました');
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
        const seirekiYear = reiwaYear + 2018; // 令和元年 = 2019年
        return new Date(seirekiYear, month - 1, day);
    }

    const heiseiMatch = warekiDate.match(/平成(\d+)年(\d+)月(\d+)日/);
    if (heiseiMatch) {
        const heiseiYear = parseInt(heiseiMatch[1]);
        const month = parseInt(heiseiMatch[2]);
        const day = parseInt(heiseiMatch[3]);
        const seirekiYear = heiseiYear + 1988; // 平成元年 = 1989年
        return new Date(seirekiYear, month - 1, day);
    }

    const showaMatch = warekiDate.match(/昭和(\d+)年(\d+)月(\d+)日/);
    if (showaMatch) {
        const showaYear = parseInt(showaMatch[1]);
        const month = parseInt(showaMatch[2]);
        const day = parseInt(showaMatch[3]);
        const seirekiYear = showaYear + 1925; // 昭和元年 = 1926年
        return new Date(seirekiYear, month - 1, day);
    }

    return null;
}

// 西暦を和暦に変換
function convertToWareki(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (year >= 2019) {
        const reiwaYear = year - 2018;
        return `令和${reiwaYear}年${month}月${day}日`;
    } else if (year >= 1989) {
        const heiseiYear = year - 1988;
        return `平成${heiseiYear}年${month}月${day}日`;
    } else {
        const showaYear = year - 1925;
        return `昭和${showaYear}年${month}月${day}日`;
    }
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

// 日付ピッカーの設定（和暦カレンダー）
let currentCalendar = null;

function setupDatePickers() {
    const datePickerButtons = document.querySelectorAll('.date-picker-btn');

    datePickerButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const inputWithButton = button.parentElement;
            const dateInput = inputWithButton.querySelector('input[type="text"]');

            showWarekiCalendar(dateInput, button);
        });
    });
}

// 和暦カレンダーを表示
function showWarekiCalendar(inputElement, buttonElement) {
    // 既存のカレンダーを閉じる
    if (currentCalendar) {
        currentCalendar.remove();
        currentCalendar = null;
    }

    // 現在の日付または入力値から初期値を設定
    let currentDate = new Date();
    if (inputElement.value) {
        const parsed = convertToSeireki(inputElement.value);
        if (parsed) {
            currentDate = parsed;
        }
    }

    let displayYear = currentDate.getFullYear();
    let displayMonth = currentDate.getMonth();

    // カレンダーコンテナを作成
    const calendar = document.createElement('div');
    calendar.className = 'calendar-popup show';
    calendar.style.position = 'fixed';
    calendar.style.zIndex = '10000';

    // カレンダーを描画
    function renderCalendar() {
        const firstDay = new Date(displayYear, displayMonth, 1);
        const lastDay = new Date(displayYear, displayMonth + 1, 0);
        const prevLastDay = new Date(displayYear, displayMonth, 0);
        const firstDayOfWeek = firstDay.getDay();
        const lastDate = lastDay.getDate();
        const prevLastDate = prevLastDay.getDate();

        // 和暦情報を取得
        const wareki = getWarekiInfo(displayYear, displayMonth + 1);

        let html = `
            <div class="calendar-header">
                <button type="button" class="calendar-nav-btn" data-action="prev">◀前</button>
                <div class="calendar-title">
                    <select class="calendar-wareki-select">
                        <option value="showa" ${wareki.era === '昭和' ? 'selected' : ''}>昭和</option>
                        <option value="heisei" ${wareki.era === '平成' ? 'selected' : ''}>平成</option>
                        <option value="reiwa" ${wareki.era === '令和' ? 'selected' : ''}>令和</option>
                    </select>
                    <select class="calendar-year-select">
                        ${generateYearOptions(wareki.era, wareki.year)}
                    </select>
                    <span>年</span>
                    <select class="calendar-month-select">
                        ${generateMonthOptions(displayMonth)}
                    </select>
                    <span>月</span>
                </div>
                <button type="button" class="calendar-nav-btn" data-action="next">次▶</button>
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

        // 前月の日付
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            html += `<div class="calendar-day other-month">${prevLastDate - i}</div>`;
        }

        // 今月の日付
        const today = new Date();
        for (let day = 1; day <= lastDate; day++) {
            const date = new Date(displayYear, displayMonth, day);
            const dayOfWeek = date.getDay();
            let classes = 'calendar-day';

            if (dayOfWeek === 0) classes += ' sunday';
            if (dayOfWeek === 6) classes += ' saturday';
            if (displayYear === today.getFullYear() && displayMonth === today.getMonth() && day === today.getDate()) {
                classes += ' today';
            }

            html += `<div class="${classes}" data-year="${displayYear}" data-month="${displayMonth}" data-day="${day}">${day}</div>`;
        }

        // 次月の日付
        const totalCells = firstDayOfWeek + lastDate;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remainingCells; i++) {
            html += `<div class="calendar-day other-month">${i}</div>`;
        }

        html += '</div>';
        calendar.innerHTML = html;

        // イベントリスナーを設定
        setupCalendarEvents();
    }

    // イベントリスナーを設定
    function setupCalendarEvents() {
        // 前/次ボタン
        calendar.querySelector('[data-action="prev"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            displayMonth--;
            if (displayMonth < 0) {
                displayMonth = 11;
                displayYear--;
            }
            renderCalendar();
        });

        calendar.querySelector('[data-action="next"]').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            displayMonth++;
            if (displayMonth > 11) {
                displayMonth = 0;
                displayYear++;
            }
            renderCalendar();
        });

        // 和暦セレクト
        const warekiSelect = calendar.querySelector('.calendar-wareki-select');
        const yearSelect = calendar.querySelector('.calendar-year-select');
        const monthSelect = calendar.querySelector('.calendar-month-select');

        warekiSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const era = e.target.value;
            const year = parseInt(yearSelect.value);
            displayYear = warekiToSeireki(era, year);
            renderCalendar();
        });

        yearSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const era = warekiSelect.value;
            const year = parseInt(e.target.value);
            displayYear = warekiToSeireki(era, year);
            renderCalendar();
        });

        monthSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            displayMonth = parseInt(e.target.value);
            renderCalendar();
        });

        // 日付選択
        calendar.querySelectorAll('.calendar-day:not(.other-month)').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const year = parseInt(dayEl.dataset.year);
                const month = parseInt(dayEl.dataset.month) + 1;
                const day = parseInt(dayEl.dataset.day);

                const selectedDate = new Date(year, month - 1, day);
                const warekiDate = convertToWareki(selectedDate);
                inputElement.value = warekiDate;

                // 生年月日フィールドの場合は年齢を更新
                if (inputElement.id === 'birth-date' || inputElement.id === 'child-birth-date') {
                    const age = calculateAge(selectedDate);
                    const ageDisplay = inputElement.parentElement.parentElement.querySelector('.age-display');
                    if (ageDisplay) {
                        ageDisplay.textContent = `(${age}歳)`;
                    }
                }

                isFormDirty = true;
                calendar.remove();
                currentCalendar = null;
            });
        });
    }

    // 初回描画
    renderCalendar();

    // ボタンの位置にカレンダーを配置
    const rect = buttonElement.getBoundingClientRect();
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

// 和暦情報を取得
function getWarekiInfo(year, month) {
    if (year > 2019 || (year === 2019 && month >= 5)) {
        return { era: '令和', year: year - 2018 };
    } else if (year >= 1989) {
        return { era: '平成', year: year - 1988 };
    } else {
        return { era: '昭和', year: year - 1925 };
    }
}

// 年の選択肢を生成
function generateYearOptions(era, selectedYear) {
    let options = '';
    let startYear, endYear;

    if (era === '昭和') {
        startYear = 1;
        endYear = 64;
    } else if (era === '平成') {
        startYear = 1;
        endYear = 31;
    } else { // 令和
        startYear = 1;
        endYear = new Date().getFullYear() - 2018 + 1;
    }

    for (let y = endYear; y >= startYear; y--) {
        const selected = y === selectedYear ? 'selected' : '';
        options += `<option value="${y}" ${selected}>${y}</option>`;
    }

    return options;
}

// 月の選択肢を生成
function generateMonthOptions(selectedMonth) {
    let options = '';
    for (let m = 1; m <= 12; m++) {
        const selected = m - 1 === selectedMonth ? 'selected' : '';
        options += `<option value="${m - 1}" ${selected}>${m}</option>`;
    }
    return options;
}

// 和暦を西暦に変換
function warekiToSeireki(era, year) {
    if (era === 'showa' || era === '昭和') {
        return 1925 + year;
    } else if (era === 'heisei' || era === '平成') {
        return 1988 + year;
    } else { // reiwa or 令和
        return 2018 + year;
    }
}

// 生年月日から年齢を自動計算
function setupAgeCalculation() {
    const birthDateInput = document.getElementById('birth-date');
    const ageDisplay = document.querySelector('.age-display');

    if (birthDateInput && ageDisplay) {
        birthDateInput.addEventListener('change', () => {
            const birthDate = convertToSeireki(birthDateInput.value);
            if (birthDate) {
                const age = calculateAge(birthDate);
                ageDisplay.textContent = `(${age}歳)`;
            }
        });
    }
}

// サービス状況の変更でステータスバッジを更新
function setupStatusSync() {
    const serviceStatusSelect = document.getElementById('service-status');
    const statusBadge = document.getElementById('user-status');

    // 要素が存在しない場合は何もしない
    if (!serviceStatusSelect || !statusBadge) {
        return;
    }

    serviceStatusSelect.addEventListener('change', () => {
        const value = serviceStatusSelect.value;

        // ステータスバッジのクラスを更新
        statusBadge.className = 'status-badge';

        if (value === 'active') {
            statusBadge.classList.add('active');
            statusBadge.textContent = '利用中';
        } else if (value === 'inactive') {
            statusBadge.classList.add('inactive');
            statusBadge.textContent = '休止中';
        } else if (value === 'terminated') {
            statusBadge.classList.add('inactive');
            statusBadge.textContent = '終了';
        }
    });
}

// 氏名の変更でタイトルと事業所管理の利用者名を更新
function setupNameSync() {
    const lastNameInput = document.getElementById('last-name');
    const nameTitle = document.getElementById('user-name-title');
    const breadcrumbName = document.getElementById('breadcrumb-name');
    const officeUserName = document.getElementById('office-user-name');

    // 要素が存在しない場合は何もしない
    if (!lastNameInput || !nameTitle || !breadcrumbName) {
        return;
    }

    function updateName() {
        const lastName = lastNameInput.value;
        const firstNameInput = document.getElementById('first-name');
        const firstName = firstNameInput ? firstNameInput.value : '';
        const fullName = lastName + (firstName ? ' ' + firstName : '');

        // タイトルとパンくずにはフルネーム表示
        nameTitle.textContent = fullName.trim();
        breadcrumbName.textContent = fullName.trim();

        // 事業所管理の利用者名にもフルネームを反映
        if (officeUserName) {
            officeUserName.value = fullName.trim();
        }
    }

    lastNameInput.addEventListener('input', updateName);

    // 名前フィールドにもイベントリスナーを追加
    const firstNameInput = document.getElementById('first-name');
    if (firstNameInput) {
        firstNameInput.addEventListener('input', updateName);
    }

    // 初回実行（ページ読み込み時に反映）
    updateName();
}

// 生年月日から年齢を自動表示
function updateAgeFromBirthDate() {
    const birthDateInput = document.getElementById('birth-date');
    const ageDisplay = document.querySelector('.age-display');

    if (birthDateInput && ageDisplay) {
        if (birthDateInput.value) {
            const birthDate = convertToSeireki(birthDateInput.value);
            if (birthDate) {
                const age = calculateAge(birthDate);
                ageDisplay.textContent = `(${age}歳)`;
                console.log('年齢計算:', birthDateInput.value, '→', age, '歳');
            } else {
                console.log('和暦変換失敗:', birthDateInput.value);
            }
        } else {
            ageDisplay.textContent = '(0歳)';
        }
    }
}

// 生年月日フィールドの変更を監視してリアルタイムに年齢を更新
function setupBirthDateMonitor() {
    const birthDateInput = document.getElementById('birth-date');

    if (birthDateInput) {
        // inputイベントとchangeイベントの両方を監視
        birthDateInput.addEventListener('input', updateAgeFromBirthDate);
        birthDateInput.addEventListener('change', updateAgeFromBirthDate);
    }
}

// 電話番号・携帯番号を事業所管理に反映
function setupPhoneSync() {
    const phoneInput = document.getElementById('phone');
    const mobileInput = document.getElementById('mobile');
    const officeUserTel = document.getElementById('office-user-tel');

    if (!phoneInput || !mobileInput || !officeUserTel) {
        return;
    }

    function updateOfficeTel() {
        const phone = phoneInput.value.trim();
        const mobile = mobileInput.value.trim();

        // 電話番号と携帯番号の優先順位
        if (phone) {
            // 電話番号が入っている場合は電話番号を優先
            officeUserTel.value = phone;
        } else if (mobile) {
            // 電話番号がなく携帯番号のみの場合は携帯番号
            officeUserTel.value = mobile;
        } else {
            // どちらも入っていない場合は空
            officeUserTel.value = '';
        }
    }

    phoneInput.addEventListener('input', updateOfficeTel);
    mobileInput.addEventListener('input', updateOfficeTel);

    // 初回実行（ページ読み込み時に反映）
    updateOfficeTel();
}

// タブ切り替え
function setupDetailTabs() {
    const tabs = document.querySelectorAll('.detail-tab');
    const contents = document.querySelectorAll('.tab-content');

    console.log('タブ数:', tabs.length);
    console.log('コンテンツ数:', contents.length);

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            console.log('タブがクリックされました:', targetTab);

            // すべてのタブとコンテンツの active を削除
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // クリックされたタブと対応するコンテンツを active に
            tab.classList.add('active');
            const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
            console.log('対象コンテンツ:', targetContent);
            if (targetContent) {
                targetContent.classList.add('active');
                console.log('activeクラスを追加しました');
            } else {
                console.error('対象コンテンツが見つかりません:', targetTab);
            }
        });
    });
}

// 記録サブタブの切り替え
function setupRecordSubTabs() {
    const recordSubTabs = document.querySelectorAll('.record-sub-tab');
    const recordSubContents = document.querySelectorAll('.record-sub-content');

    recordSubTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.recordTab;

            // すべてのサブタブとコンテンツの active を削除
            recordSubTabs.forEach(t => t.classList.remove('active'));
            recordSubContents.forEach(c => c.classList.remove('active'));

            // クリックされたサブタブと対応するコンテンツを active に
            tab.classList.add('active');
            const targetContent = document.querySelector(`[data-record-content="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// 顧客番号の自動生成（IDと同じ値を設定、3桁ゼロパディング）
function setupAutoCustomerNumber() {
    const autoBtn = document.querySelector('.auto-btn');
    const customerNumberInput = document.getElementById('customer-number');

    console.log('顧客番号自動生成ボタン設定:', { autoBtn, customerNumberInput });

    if (autoBtn && customerNumberInput) {
        autoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('自動ボタンがクリックされました');

            // URLからIDを取得
            const userId = getUserIdFromUrl();
            console.log('現在のユーザーID:', userId);

            if (userId) {
                // 既存利用者の場合はIDと同じ値を設定
                console.log('既存利用者: IDを設定 ->', userId);
                customerNumberInput.value = userId;
            } else {
                // 新規利用者の場合は次のIDを計算（3桁ゼロパディング）
                const existingUsers = JSON.parse(localStorage.getItem('users') || '[]');
                const nextId = String(existingUsers.length + 1).padStart(3, '0');
                console.log('新規利用者: 次のIDを計算 ->', { 既存利用者数: existingUsers.length, 次のID: nextId });
                customerNumberInput.value = nextId;
            }

            console.log('顧客番号が設定されました:', customerNumberInput.value);

            // フォームが変更されたことをマーク
            isFormDirty = true;
        });
        console.log('自動ボタンのイベントリスナーを設定しました');
    } else {
        console.error('自動ボタンまたは顧客番号入力フィールドが見つかりません');
    }
}

// 郵便番号から住所を取得
function setupPostalCodeLookup() {
    const addressBtn = document.querySelector('.address-btn');
    const postalCodeInput = document.getElementById('postal-code');
    const addressInput = document.getElementById('address');

    if (addressBtn && postalCodeInput && addressInput) {
        addressBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const postalCode = postalCodeInput.value.replace(/[^0-9]/g, '');

            if (postalCode.length !== 7) {
                alert('郵便番号は7桁で入力してください');
                return;
            }

            // 郵便番号APIを使用して住所を取得
            try {
                const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode}`);
                const data = await response.json();

                if (data.status === 200 && data.results) {
                    const result = data.results[0];
                    const fullAddress = `${result.address1}${result.address2}${result.address3}`;
                    addressInput.value = fullAddress;
                    isFormDirty = true;
                } else {
                    alert('住所が見つかりませんでした');
                }
            } catch (error) {
                console.error('住所取得エラー:', error);
                alert('住所の取得に失敗しました');
            }
        });
    }
}

// 地図ボタンの設定
function setupMapButtons() {
    const mapButtons = document.querySelectorAll('.map-btn');

    mapButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();

            const inputWithButton = button.parentElement;
            const input = inputWithButton.querySelector('input[type="text"]');
            const inputId = input.id;

            if (inputId === 'address') {
                // 住所からGoogleマップを開く
                const address = input.value;
                if (address) {
                    const encodedAddress = encodeURIComponent(address);
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
                } else {
                    alert('住所を入力してください');
                }
            } else if (inputId === 'address2') {
                // 緯度経度からGoogleマップを開く
                const latLng = input.value;
                if (latLng) {
                    // 緯度,経度の形式をチェック
                    const match = latLng.match(/^([\d.]+)\s*,\s*([\d.]+)$/);
                    if (match) {
                        const lat = match[1];
                        const lng = match[2];
                        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
                    } else {
                        alert('緯度,経度の形式で入力してください（例: 35.6812,139.7671）');
                    }
                } else {
                    alert('緯度,経度を入力してください');
                }
            }
        });
    });
}

// フォームの変更を監視して未保存警告
let isFormDirty = false;

function setupFormChangeDetection() {
    const form = document.getElementById('user-detail-form');
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
        // readonly属性がない要素のみ監視
        if (!input.hasAttribute('readonly')) {
            input.addEventListener('change', () => {
                isFormDirty = true;
            });
        }
    });

    // ページ離脱時の警告
    window.addEventListener('beforeunload', (e) => {
        if (isFormDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// データ読み込み
function loadUserData() {
    const userId = getUserIdFromUrl();

    // 新規登録データがあるかチェック
    const newUserData = localStorage.getItem('newUserData');
    if (newUserData && !userId) {
        try {
            const data = JSON.parse(newUserData);

            // 基本情報を設定
            if (data.lastName) document.getElementById('last-name').value = data.lastName;
            if (data.furigana) document.getElementById('furigana').value = data.furigana;

            // 性別
            if (data.gender) {
                const genderRadio = document.querySelector(`input[name="gender"][value="${data.gender}"]`);
                if (genderRadio) genderRadio.checked = true;
            }

            // 新規利用者のIDを生成して顧客番号に設定（3桁ゼロパディング）
            const existingUsers = JSON.parse(localStorage.getItem('users') || '[]');
            const newUserId = String(existingUsers.length + 1).padStart(3, '0');
            const customerNumberInput = document.getElementById('customer-number');
            if (customerNumberInput) {
                customerNumberInput.value = newUserId;
            }

            // タイトルと名前を更新（フルネーム表示）
            const userNameTitle = document.getElementById('user-name-title');
            const breadcrumbName = document.getElementById('breadcrumb-name');
            if (userNameTitle && data.lastName) {
                const fullName = data.lastName + (data.firstName ? ' ' + data.firstName : '');
                userNameTitle.textContent = fullName.trim();
            }
            if (breadcrumbName && data.lastName) {
                const fullName = data.lastName + (data.firstName ? ' ' + data.firstName : '');
                breadcrumbName.textContent = fullName.trim();
            }

            // 新規登録データを削除
            localStorage.removeItem('newUserData');

            console.log('新規登録データを読み込みました:', data);
        } catch (error) {
            console.error('新規登録データ読み込みエラー:', error);
        }
        return;
    }

    if (userId) {
        console.log('利用者ID:', userId, 'のデータを読み込み中...');

        // localStorageからデータを取得
        const userData = localStorage.getItem(`user_${userId}`);

        if (userData) {
            try {
                const data = JSON.parse(userData);

                // 基本情報タブ
                if (data.lastName) document.getElementById('last-name').value = data.lastName;
                if (data.firstName) document.getElementById('first-name').value = data.firstName;
                if (data.childLastName) document.getElementById('child-last-name').value = data.childLastName;
                if (data.childFirstName) document.getElementById('child-first-name').value = data.childFirstName;
                if (data.furiganaLast) document.getElementById('furigana-last').value = data.furiganaLast;
                if (data.furiganaFirst) document.getElementById('furigana-first').value = data.furiganaFirst;
                if (data.childFuriganaLast) document.getElementById('child-furigana-last').value = data.childFuriganaLast;
                if (data.childFuriganaFirst) document.getElementById('child-furigana-first').value = data.childFuriganaFirst;

                // 性別
                if (data.gender) {
                    const genderRadio = document.querySelector(`input[name="gender"][value="${data.gender}"]`);
                    if (genderRadio) genderRadio.checked = true;
                }
                if (data.childGender) {
                    const childGenderRadio = document.querySelector(`input[name="child-gender"][value="${data.childGender}"]`);
                    if (childGenderRadio) childGenderRadio.checked = true;
                }

                // 生年月日
                if (data.birthDate) {
                    document.getElementById('birth-date').value = data.birthDate;
                    // 年齢を計算
                    const birthDate = convertToSeireki(data.birthDate);
                    if (birthDate) {
                        const age = calculateAge(birthDate);
                        const ageDisplay = document.querySelector('.age-display');
                        if (ageDisplay) ageDisplay.textContent = `(${age}歳)`;
                    }
                }
                if (data.childBirthDate) document.getElementById('child-birth-date').value = data.childBirthDate;

                // その他の基本情報
                // 顧客番号はIDと同じ値を表示（データにcustomerNumberがない場合はIDを使用）
                const customerNumber = data.customerNumber || data.id;
                if (customerNumber) document.getElementById('customer-number').value = customerNumber;
                if (data.nickname) document.getElementById('nickname').value = data.nickname;
                if (data.postalCode) document.getElementById('postal-code').value = data.postalCode;
                if (data.address) document.getElementById('address').value = data.address;
                if (data.latLng) document.getElementById('address2').value = data.latLng;
                if (data.phone) document.getElementById('phone').value = data.phone;
                if (data.mobile) document.getElementById('mobile').value = data.mobile;
                if (data.group) document.getElementById('group').value = data.group;
                if (data.contractStart) document.getElementById('contract-start').value = data.contractStart;
                if (data.contractEnd) document.getElementById('contract-end').value = data.contractEnd;
                if (data.terminationReason) document.getElementById('termination-reason').value = data.terminationReason;
                if (data.notes) document.getElementById('notes').value = data.notes;
                if (data.carePoints) document.getElementById('care-points').value = data.carePoints;

                // 事業所管理タブ
                if (data.officeName) document.getElementById('office-name').value = data.officeName;
                if (data.officeCode) document.getElementById('office-code').value = data.officeCode;
                if (data.officeAddress) document.getElementById('office-address').value = data.officeAddress;
                if (data.officePhone) document.getElementById('office-phone').value = data.officePhone;
                if (data.officeFax) document.getElementById('office-fax').value = data.officeFax;
                if (data.contractDate) document.getElementById('contract-date').value = data.contractDate;
                if (data.contractEndDate) document.getElementById('contract-end-date').value = data.contractEndDate;
                if (data.serviceType) document.getElementById('service-type').value = data.serviceType;
                if (data.billingMethod) document.getElementById('billing-method').value = data.billingMethod;
                if (data.careManager) document.getElementById('care-manager').value = data.careManager;
                if (data.managerPhone) document.getElementById('manager-phone').value = data.managerPhone;
                if (data.managerOffice) document.getElementById('manager-office').value = data.managerOffice;
                if (data.soudanShienOffice) document.getElementById('office-soudan-jigyosho').value = data.soudanShienOffice;
                if (data.soudanShienName) document.getElementById('office-tantou-name').value = data.soudanShienName;
                if (data.soudanShienTel) document.getElementById('office-soudan-tel').value = data.soudanShienTel;

                // 記録タブ - 受給者証
                if (data.certMunicipality) document.getElementById('cert-municipality').value = data.certMunicipality;
                if (data.certNumber) document.getElementById('cert-number').value = data.certNumber;
                if (data.certValidFrom) document.getElementById('cert-valid-from').value = data.certValidFrom;
                if (data.certValidTo) document.getElementById('cert-valid-to').value = data.certValidTo;
                if (data.certNotes) document.getElementById('cert-notes').value = data.certNotes;

                // その他の記録
                if (data.supportPlan) document.getElementById('support-plan').value = data.supportPlan;
                if (data.assessment) document.getElementById('assessment').value = data.assessment;
                if (data.monitoring) document.getElementById('monitoring').value = data.monitoring;
                if (data.manual) document.getElementById('manual').value = data.manual;
                if (data.incident) document.getElementById('incident').value = data.incident;

                // 緊急連絡先
                if (data.emergency1Name) document.getElementById('emergency1-name').value = data.emergency1Name;
                if (data.emergency1Birthdate) document.getElementById('emergency1-birthdate').value = data.emergency1Birthdate;
                if (data.emergency1Postal) document.getElementById('emergency1-postal').value = data.emergency1Postal;
                if (data.emergency1Address) document.getElementById('emergency1-address').value = data.emergency1Address;
                if (data.emergency1Phone) document.getElementById('emergency1-phone').value = data.emergency1Phone;
                if (data.emergency1Mobile) document.getElementById('emergency1-mobile').value = data.emergency1Mobile;
                if (data.emergency1Relationship) document.getElementById('emergency1-relationship').value = data.emergency1Relationship;

                if (data.emergency2Name) document.getElementById('emergency2-name').value = data.emergency2Name;
                if (data.emergency2Birthdate) document.getElementById('emergency2-birthdate').value = data.emergency2Birthdate;
                if (data.emergency2Postal) document.getElementById('emergency2-postal').value = data.emergency2Postal;
                if (data.emergency2Address) document.getElementById('emergency2-address').value = data.emergency2Address;
                if (data.emergency2Phone) document.getElementById('emergency2-phone').value = data.emergency2Phone;
                if (data.emergency2Mobile) document.getElementById('emergency2-mobile').value = data.emergency2Mobile;
                if (data.emergency2Relationship) document.getElementById('emergency2-relationship').value = data.emergency2Relationship;

                if (data.consultantName) document.getElementById('consultant-name').value = data.consultantName;
                if (data.consultantBirthdate) document.getElementById('consultant-birthdate').value = data.consultantBirthdate;
                if (data.consultantPostal) document.getElementById('consultant-postal').value = data.consultantPostal;
                if (data.consultantAddress) document.getElementById('consultant-address').value = data.consultantAddress;
                if (data.consultantPhone) document.getElementById('consultant-phone').value = data.consultantPhone;
                if (data.consultantMobile) document.getElementById('consultant-mobile').value = data.consultantMobile;
                if (data.consultantRelationship) document.getElementById('consultant-relationship').value = data.consultantRelationship;

                // タイトルと名前を更新（フルネーム表示）
                const userNameTitle = document.getElementById('user-name-title');
                const breadcrumbName = document.getElementById('breadcrumb-name');
                if (userNameTitle && data.lastName) {
                    const fullName = data.lastName + (data.firstName ? ' ' + data.firstName : '');
                    userNameTitle.textContent = fullName.trim();
                }
                if (breadcrumbName && data.lastName) {
                    const fullName = data.lastName + (data.firstName ? ' ' + data.firstName : '');
                    breadcrumbName.textContent = fullName.trim();
                }

                // ステータスバッジを更新
                const statusBadge = document.getElementById('user-status');
                if (statusBadge && data.status) {
                    statusBadge.textContent = data.status;
                }

                console.log('データ読み込み完了:', data);
            } catch (error) {
                console.error('データ読み込みエラー:', error);
            }
        } else {
            console.log('新規利用者として扱います');
        }
    } else {
        console.log('新規利用者登録モード');
    }
}

// 希望性別ボタンの設定
function setupGenderButtons() {
    const genderButtons = document.querySelectorAll('.gender-btn');

    genderButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();

            // 他のボタンのactiveクラスを削除
            genderButtons.forEach(btn => btn.classList.remove('active'));

            // クリックされたボタンにactiveクラスを追加
            button.classList.add('active');

            // フォームが変更されたことをマーク
            isFormDirty = true;
        });
    });
}

// ケア時間の自動計算
function setupCareTimeCalculation() {
    const timeInputs = document.querySelectorAll('.time-input');
    const weeklyInput = document.getElementById('care-time-week');
    const monthlyInput = document.getElementById('care-time-month');

    // 時間文字列（例: "12:00-16:00"）から時間数を計算
    function parseTimeRange(timeStr) {
        if (!timeStr || timeStr.trim() === '') return 0;

        const match = timeStr.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
        if (!match) return 0;

        const startHour = parseInt(match[1]);
        const startMin = parseInt(match[2]);
        const endHour = parseInt(match[3]);
        const endMin = parseInt(match[4]);

        const startTotal = startHour + (startMin / 60);
        const endTotal = endHour + (endMin / 60);

        return endTotal - startTotal;
    }

    // 全時間入力の合計を計算
    function calculateTotalHours() {
        let totalHours = 0;

        timeInputs.forEach(input => {
            const hours = parseTimeRange(input.value);
            totalHours += hours;
        });

        return totalHours;
    }

    // 週と月のケア時間を更新
    function updateCareTime() {
        const weeklyHours = calculateTotalHours();
        const monthlyHours = weeklyHours * 4.3;

        weeklyInput.value = weeklyHours.toFixed(1) + ' 時間';
        monthlyInput.value = monthlyHours.toFixed(1) + ' 時間';
    }

    // 各時間入力にイベントリスナーを追加
    timeInputs.forEach(input => {
        input.addEventListener('input', updateCareTime);
        input.addEventListener('change', updateCareTime);
    });

    // 初期計算
    updateCareTime();
}

// URLパラメータからタブを開く
function openTabFromUrl() {
    const tabInfo = getTabFromUrl();

    if (tabInfo.tab) {
        // メインタブを開く
        const mainTab = document.querySelector(`.detail-tab[data-tab="${tabInfo.tab}"]`);
        if (mainTab) {
            mainTab.click();

            // サブタブがある場合（記録タブの中）
            if (tabInfo.subtab) {
                setTimeout(() => {
                    const subTab = document.querySelector(`.record-sub-tab[data-record-tab="${tabInfo.subtab}"]`);
                    if (subTab) {
                        subTab.click();
                    }
                }, 100);
            }
        }
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('利用者詳細ページを初期化中...');

    loadUserData();
    setupSaveButton();
    setupCancelButton();
    setupDeleteButton();
    setupDatePickers();
    setupAgeCalculation();
    setupAutoCustomerNumber();
    setupPostalCodeLookup();
    setupMapButtons();
    setupStatusSync();
    setupNameSync();
    setupPhoneSync();
    setupDetailTabs();
    setupRecordSubTabs();
    setupFormChangeDetection();
    setupCareTimeCalculation();
    setupBirthDateMonitor();
    setupGenderButtons();
    setupCertificateManagement();

    // 初回年齢表示の更新
    setTimeout(() => {
        updateAgeFromBirthDate();
    }, 100);

    // URLパラメータからタブを開く
    setTimeout(() => {
        openTabFromUrl();
    }, 200);

    console.log('利用者詳細ページ初期化完了');
});

// 受給者証を動的に追加・削除する機能
let certificateCount = 0;

function createCertificateForm(index, data = {}) {
    const certDiv = document.createElement('div');
    certDiv.className = 'certificate-form';
    certDiv.dataset.certIndex = index;
    certDiv.style.marginBottom = '2rem';
    certDiv.style.padding = '1.5rem';
    certDiv.style.border = '1px solid #e0e0e0';
    certDiv.style.borderRadius = '8px';
    certDiv.style.position = 'relative';

    certDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h4 style="margin: 0;">受給者証 ${index + 1}</h4>
            <button type="button" class="btn-danger remove-cert-btn" data-index="${index}" style="padding: 0.3rem 0.8rem;">
                <i class="fas fa-times"></i> 削除
            </button>
        </div>

        <div class="form-section">
            <div class="form-row">
                <label for="cert-municipality-${index}">市町村</label>
                <select id="cert-municipality-${index}" class="cert-municipality" style="width: 300px;">
                    <option value="">選択してください</option>
                    <option value="大阪市城東区">大阪市城東区</option>
                    <option value="大阪市北区">大阪市北区</option>
                    <option value="大阪市中央区">大阪市中央区</option>
                    <option value="大阪市福島区">大阪市福島区</option>
                    <option value="大阪市此花区">大阪市此花区</option>
                    <option value="大阪市西区">大阪市西区</option>
                    <option value="大阪市港区">大阪市港区</option>
                    <option value="大阪市大正区">大阪市大正区</option>
                    <option value="大阪市天王寺区">大阪市天王寺区</option>
                    <option value="大阪市浪速区">大阪市浪速区</option>
                    <option value="大阪市西淀川区">大阪市西淀川区</option>
                    <option value="大阪市東淀川区">大阪市東淀川区</option>
                    <option value="大阪市東成区">大阪市東成区</option>
                    <option value="大阪市生野区">大阪市生野区</option>
                    <option value="大阪市旭区">大阪市旭区</option>
                    <option value="大阪市鶴見区">大阪市鶴見区</option>
                    <option value="大阪市阿倍野区">大阪市阿倍野区</option>
                    <option value="大阪市住之江区">大阪市住之江区</option>
                    <option value="大阪市住吉区">大阪市住吉区</option>
                    <option value="大阪市東住吉区">大阪市東住吉区</option>
                    <option value="大阪市西成区">大阪市西成区</option>
                    <option value="大阪市淀川区">大阪市淀川区</option>
                    <option value="大阪市平野区">大阪市平野区</option>
                </select>
            </div>

            <div class="form-row">
                <label for="cert-number-${index}">受給者証番号</label>
                <input type="text" id="cert-number-${index}" class="cert-number" placeholder="例: 920063898" style="width: 300px;">
            </div>

            <div class="form-row">
                <label>認定有効期間</label>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <div class="input-with-button">
                        <input type="text" id="cert-valid-from-${index}" class="cert-valid-from" placeholder="令和6年12月1日" readonly style="width: 200px;">
                        <button type="button" class="date-picker-btn cert-from-picker" data-target="cert-valid-from-${index}">
                            <i class="far fa-calendar-alt"></i>
                        </button>
                    </div>
                    <span>〜</span>
                    <div class="input-with-button">
                        <input type="text" id="cert-valid-to-${index}" class="cert-valid-to" placeholder="令和9年11月30日" readonly style="width: 200px;">
                        <button type="button" class="date-picker-btn cert-to-picker" data-target="cert-valid-to-${index}">
                            <i class="far fa-calendar-alt"></i>
                        </button>
                    </div>
                    <button type="button" class="btn-secondary cert-period-btn" data-index="${index}" data-months="12">1年間</button>
                    <button type="button" class="btn-secondary cert-period-btn" data-index="${index}" data-months="24">2年間</button>
                    <button type="button" class="btn-secondary cert-period-btn" data-index="${index}" data-months="36">3年間</button>
                    <button type="button" class="btn-secondary cert-period-btn" data-index="${index}" data-months="6">6ヶ月</button>
                </div>
            </div>

            <div class="form-row">
                <label for="cert-notes-${index}">備考</label>
                <textarea id="cert-notes-${index}" class="cert-notes" rows="5" placeholder="その他の情報を入力してください" style="width: 100%;"></textarea>
            </div>
        </div>
    `;

    // データがある場合は値を設定
    if (data.municipality) certDiv.querySelector(`#cert-municipality-${index}`).value = data.municipality;
    if (data.number) certDiv.querySelector(`#cert-number-${index}`).value = data.number;
    if (data.validFrom) certDiv.querySelector(`#cert-valid-from-${index}`).value = data.validFrom;
    if (data.validTo) certDiv.querySelector(`#cert-valid-to-${index}`).value = data.validTo;
    if (data.notes) certDiv.querySelector(`#cert-notes-${index}`).value = data.notes;

    return certDiv;
}

function addCertificateForm(data = {}) {
    const container = document.getElementById('certificates-container');
    const certForm = createCertificateForm(certificateCount, data);
    container.appendChild(certForm);

    // 削除ボタンのイベント
    const removeBtn = certForm.querySelector('.remove-cert-btn');
    removeBtn.addEventListener('click', () => {
        if (confirm('この受給者証を削除しますか？')) {
            certForm.remove();
            isFormDirty = true;
        }
    });

    // 期間ボタンのイベント
    const periodBtns = certForm.querySelectorAll('.cert-period-btn');
    periodBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const index = btn.dataset.index;
            const months = parseInt(btn.dataset.months);
            const fromInput = document.getElementById(`cert-valid-from-${index}`);
            const toInput = document.getElementById(`cert-valid-to-${index}`);

            if (!fromInput.value) {
                alert('開始日を先に選択してください');
                return;
            }

            const fromDate = convertToSeireki(fromInput.value);
            if (!fromDate) {
                alert('有効な開始日を入力してください');
                return;
            }

            const toDate = new Date(fromDate);
            toDate.setMonth(toDate.getMonth() + months);
            toDate.setDate(toDate.getDate() - 1);

            toInput.value = convertToWareki(toDate);
            isFormDirty = true;
        });
    });

    // 日付ピッカーのイベント
    const datePickerBtns = certForm.querySelectorAll('.date-picker-btn');
    datePickerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.dataset.target;
            const dateInput = document.getElementById(targetId);
            showWarekiCalendar(dateInput, btn);
        });
    });

    certificateCount++;
    isFormDirty = true;
}

function setupCertificateManagement() {
    const addBtn = document.getElementById('add-certificate-btn');
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addCertificateForm();
        });
    }

    // 初回読み込み時に少なくとも1つのフォームを表示
    const userId = getUserIdFromUrl();
    if (userId) {
        // 既存データから読み込み
        loadCertificatesFromStorage(userId);
    } else {
        // 新規の場合は空のフォームを1つ表示
        addCertificateForm();
    }
}

function loadCertificatesFromStorage(userId) {
    const userData = localStorage.getItem(`user_${userId}`);
    if (userData) {
        try {
            const data = JSON.parse(userData);

            // certificateHistory配列があればそれを読み込み
            if (data.certificateHistory && Array.isArray(data.certificateHistory)) {
                data.certificateHistory.forEach(cert => {
                    addCertificateForm(cert);
                });
            }
            // 旧形式の個別フィールドがあればそれを1つ目として追加
            else if (data.certMunicipality || data.certNumber || data.certValidFrom) {
                addCertificateForm({
                    municipality: data.certMunicipality,
                    number: data.certNumber,
                    validFrom: data.certValidFrom,
                    validTo: data.certValidTo,
                    notes: data.certNotes
                });
            } else {
                // データがなければ空のフォームを1つ表示
                addCertificateForm();
            }
        } catch (error) {
            console.error('受給者証データ読み込みエラー:', error);
            addCertificateForm();
        }
    } else {
        addCertificateForm();
    }
}

function saveCertificates() {
    const certificates = [];
    const certForms = document.querySelectorAll('.certificate-form');

    certForms.forEach((form, index) => {
        const municipality = form.querySelector(`.cert-municipality`)?.value || '';
        const number = form.querySelector(`.cert-number`)?.value || '';
        const validFrom = form.querySelector(`.cert-valid-from`)?.value || '';
        const validTo = form.querySelector(`.cert-valid-to`)?.value || '';
        const notes = form.querySelector(`.cert-notes`)?.value || '';

        // 少なくとも1つのフィールドに値があれば保存
        if (municipality || number || validFrom || validTo || notes) {
            certificates.push({
                municipality,
                number,
                validFrom,
                validTo,
                notes,
                createdAt: new Date().toISOString()
            });
        }
    });

    return certificates;
}
