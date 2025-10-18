// 日付表示を現在の日付に更新
function updateDate() {
    const dateElement = document.getElementById('currentDate');
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[now.getDay()];

    dateElement.textContent = `${year}年${month}月${day}日（${weekday}）`;
}

// ナビゲーション項目のクリックハンドラ
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // hrefが#の場合のみpreventDefault
            if (item.getAttribute('href') === '#') {
                e.preventDefault();
            }

            // すべてのアクティブクラスを削除
            navItems.forEach(nav => nav.classList.remove('active'));

            // クリックされた項目にアクティブクラスを追加
            item.classList.add('active');

            console.log('ナビゲーション:', item.textContent.trim());
        });
    });
}

// ログアウトボタンのハンドラ
function setupLogout() {
    const logoutBtn = document.querySelector('.logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) {
                // セッションをクリア
                sessionStorage.removeItem('currentUser');
                console.log('ログアウトしました');
                // ログイン画面にリダイレクト
                window.location.href = 'login.html';
            }
        });
    }
}

// ログインチェック（login.html以外のページで実行）
function checkLogin() {
    // login.htmlの場合はチェックしない
    if (window.location.pathname.includes('login.html')) {
        return;
    }

    const currentUser = sessionStorage.getItem('currentUser');

    if (!currentUser) {
        console.log('未ログイン: ログイン画面にリダイレクトします');
        window.location.href = 'login.html';
        return;
    }

    try {
        const user = JSON.parse(currentUser);
        console.log('ログイン中:', user.helperName);

        // ヘッダーにログインユーザー名を表示
        updateUserDisplay(user);
    } catch (error) {
        console.error('セッションエラー:', error);
        window.location.href = 'login.html';
    }
}

// ヘッダーのユーザー名を更新
function updateUserDisplay(user) {
    const userNameElement = document.querySelector('.user-info span');
    if (userNameElement) {
        userNameElement.textContent = user.helperName || '不明';
    }
}

// すべて表示ボタンのハンドラ
function setupViewAllButton() {
    const viewAllBtn = document.querySelector('.view-all-btn');

    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            console.log('すべてのシフトを表示');
            // 実際のページ遷移やモーダル表示をここに実装
            alert('すべてのシフトを表示します');
        });
    }
}

// シフトアイテムのクリックハンドラ
function setupShiftItems() {
    const shiftItems = document.querySelectorAll('.shift-item');

    if (shiftItems.length > 0) {
        shiftItems.forEach(item => {
            item.addEventListener('click', () => {
                const helper = item.querySelector('.shift-helper');
                const client = item.querySelector('.shift-client');
                if (helper && client) {
                    console.log('シフト詳細:', helper.textContent.trim(), '->', client.textContent.trim());
                    // 実際の詳細表示をここに実装
                }
            });
        });
    }
}

// 統計カードのアニメーション
function setupStatCards() {
    const statCards = document.querySelectorAll('.stat-card');

    statCards.forEach((card, index) => {
        // 初期状態を設定
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';

        // 順番にアニメーション
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

// データの自動更新（デモ用）
function setupAutoRefresh() {
    // 10秒ごとにデータを更新（実際のAPIコールに置き換え）
    setInterval(() => {
        console.log('データを更新中...');
        // 実際のデータ取得と更新処理をここに実装
    }, 10000);
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
    console.log('介護ケアシステムを初期化中...');

    // ログインチェック（最優先）
    checkLogin();

    // 各機能の初期化
    updateDate();
    setupNavigation();
    setupLogout();
    setupViewAllButton();
    setupShiftItems();
    setupStatCards();
    setupAutoRefresh();

    console.log('初期化完了');
});

// ウィンドウリサイズ時の処理
window.addEventListener('resize', () => {
    // レスポンシブ対応の追加処理をここに実装
    console.log('ウィンドウサイズ:', window.innerWidth, 'x', window.innerHeight);
});
