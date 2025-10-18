// ログイン処理用JavaScript

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    console.log('ログインページ初期化中...');
    loadHelpers();
    setupLoginForm();
});

// ヘルパーリストを読み込んでセレクトボックスに表示
function loadHelpers() {
    const helperSelect = document.getElementById('helperSelect');
    const helperCount = document.getElementById('helperCount');

    // localStorageからヘルパーデータを取得
    const helpers = JSON.parse(localStorage.getItem('helpers') || '[]');

    console.log('登録ヘルパー数:', helpers.length);

    // セレクトボックスをクリア
    helperSelect.innerHTML = '<option value="">選択してください</option>';

    // ヘルパーを追加（姓名を組み合わせて表示）
    helpers.forEach(helper => {
        const option = document.createElement('option');
        option.value = helper.id;
        const displayName = `${helper.lastName || ''} ${helper.firstName || ''}`.trim();
        option.textContent = displayName || 'ヘルパー名なし';
        option.dataset.helperData = JSON.stringify(helper);
        helperSelect.appendChild(option);
    });

    // ヘルパー数を表示
    if (helperCount) {
        helperCount.innerHTML = `<i class="fas fa-info-circle"></i> 登録ヘルパー: ${helpers.length}名`;
    }

    // ヘルパーが0人の場合は警告を表示
    if (helpers.length === 0) {
        showError('ヘルパーが登録されていません。先にヘルパーを登録してください。');
        document.getElementById('loginButton').disabled = true;
    }
}

// ログインフォームの設定
function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const loginButton = document.getElementById('loginButton');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const helperSelect = document.getElementById('helperSelect');
        const selectedValue = helperSelect.value;

        if (!selectedValue) {
            showError('ヘルパーを選択してください');
            return;
        }

        // 選択されたヘルパーの情報を取得
        const selectedOption = helperSelect.options[helperSelect.selectedIndex];
        const helperData = JSON.parse(selectedOption.dataset.helperData);

        console.log('ログイン:', helperData);

        // ログイン処理
        login(helperData);
    });
}

// ログイン処理
function login(helperData) {
    try {
        // セッションストレージにログイン情報を保存
        const loginSession = {
            helperId: helperData.id,
            helperName: `${helperData.lastName || ''} ${helperData.firstName || ''}`.trim(),
            lastName: helperData.lastName,
            firstName: helperData.firstName,
            gender: helperData.gender,
            loginTime: new Date().toISOString()
        };

        sessionStorage.setItem('currentUser', JSON.stringify(loginSession));

        console.log('ログイン成功:', loginSession);

        // ダッシュボードにリダイレクト
        window.location.href = 'index.html';
    } catch (error) {
        console.error('ログインエラー:', error);
        showError('ログインに失敗しました。もう一度お試しください。');
    }
}

// エラーメッセージを表示
function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');

    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.classList.add('show');

        // 5秒後に自動的に非表示
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }
}

// エラーメッセージを非表示
function hideError() {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.classList.remove('show');
    }
}
