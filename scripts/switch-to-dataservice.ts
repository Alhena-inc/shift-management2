/**
 * FirestoreサービスからdataServiceへの切り替えスクリプト
 * すべてのインポート文を自動的に更新
 */

import * as fs from 'fs';
import * as path from 'path';
import { globSync } from 'glob';

function switchToDataService() {
  console.log('🔄 dataServiceへの切り替えを開始...');

  // 対象ファイルを検索
  const files = globSync('src/**/*.{ts,tsx}', {
    ignore: [
      'src/services/**',
      'src/lib/**',
      'node_modules/**'
    ]
  });

  let updatedCount = 0;

  for (const file of files) {
    const filePath = path.resolve(file);
    let content = fs.readFileSync(filePath, 'utf-8');
    let hasChanges = false;

    // firestoreServiceのインポートをdataServiceに変更
    if (content.includes("from '../services/firestoreService'") ||
        content.includes('from "../services/firestoreService"') ||
        content.includes("from '../../services/firestoreService'") ||
        content.includes('from "../../services/firestoreService"')) {

      content = content
        .replace(/from ['"]\.\.\/services\/firestoreService['"]/g, "from '../services/dataService'")
        .replace(/from ['"]\.\.\/\.\.\/services\/firestoreService['"]/g, "from '../../services/dataService'");

      hasChanges = true;
    }

    if (hasChanges) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ 更新: ${file}`);
      updatedCount++;
    }
  }

  console.log(`\n🎉 完了: ${updatedCount}個のファイルを更新しました`);
  console.log('\n📝 次のステップ:');
  console.log('1. .env.localでVITE_USE_SUPABASE=trueを設定');
  console.log('2. npm run devでアプリケーションを起動');
  console.log('3. 動作確認');
}

// 実行
try {
  switchToDataService();
} catch (error) {
  console.error(error);
}