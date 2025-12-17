// アイコン生成スクリプト
// 使用方法: node generate-icons.js

const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size, filename) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 背景（青色のグラデーション）
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(1, '#2563eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // 白い円形の背景
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // カレンダーアイコンの描画
    const iconSize = size * 0.5;
    const x = (size - iconSize) / 2;
    const y = (size - iconSize) / 2;

    // カレンダーの本体
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x, y + iconSize * 0.15, iconSize, iconSize * 0.85);

    // カレンダーのヘッダー
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(x, y + iconSize * 0.15, iconSize, iconSize * 0.25);

    // カレンダーのリング
    ctx.fillStyle = '#1e40af';
    const ringWidth = iconSize * 0.08;
    const ringY = y + iconSize * 0.05;
    ctx.fillRect(x + iconSize * 0.2, ringY, ringWidth, iconSize * 0.15);
    ctx.fillRect(x + iconSize * 0.7, ringY, ringWidth, iconSize * 0.15);

    // 日付の数字
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${iconSize * 0.35}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('31', size / 2, y + iconSize * 0.65);

    // 画像を保存
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`public/${filename}`, buffer);
    console.log(`✓ ${filename} を生成しました (${size}x${size})`);
}

// 192x192と512x512のアイコンを生成
try {
    generateIcon(192, 'icon-192.png');
    generateIcon(512, 'icon-512.png');
    console.log('\n✅ すべてのアイコンを生成しました！');
} catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    console.log('\ncanvasパッケージをインストールしてください:');
    console.log('npm install canvas');
}
