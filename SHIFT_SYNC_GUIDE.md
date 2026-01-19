# シフト同期の仕組み - 完全ガイド

## 概要

大元シフト（管理者用）と個人シフト（ヘルパー用）は、**Firestoreを介してリアルタイムで同期**されています。

## 同期フロー

```
┌─────────────────┐
│  大元シフト表   │  管理者が編集
│ (ShiftTable.tsx)│
└────────┬────────┘
         │ ① saveShiftToFirestore()
         ↓
┌─────────────────┐
│   Firestore DB  │  クラウドDB
│   (shifts)      │
└────────┬────────┘
         │ ② onSnapshot() が検知
         ↓
┌─────────────────┐
│   個人シフト表  │  自動更新！
│(PersonalShift)  │
└─────────────────┘
```

## 使用方法

### 1. 大元シフトでシフトを保存

```typescript
import { saveShiftToFirestore } from '../services/shiftSyncService';

// シフトを1件保存
await saveShiftToFirestore(shift);

// 複数のシフトを一括保存
import { saveBulkShiftsToFirestore } from '../services/shiftSyncService';
await saveBulkShiftsToFirestore(shifts);
```

### 2. 個人シフトでリアルタイム監視

```typescript
import { subscribeToPersonalShifts } from '../services/shiftSyncService';

// リアルタイム監視開始
const unsubscribe = subscribeToPersonalShifts(helperId, {
  onStatusChange: (status) => {
    console.log('同期状態:', status); // 'idle' | 'syncing' | 'success' | 'error'
  },
  onShiftsUpdate: (shifts) => {
    console.log('シフト更新:', shifts);
    setShifts(shifts); // ステートを更新
  },
  onError: (error) => {
    console.error('同期エラー:', error);
  }
});

// コンポーネントのクリーンアップ時に監視解除
return () => {
  unsubscribe();
};
```

### 3. 大元シフトでもリアルタイム監視（オプション）

```typescript
import { subscribeToMonthShifts } from '../services/shiftSyncService';

// 特定月のシフトを監視
const unsubscribe = subscribeToMonthShifts(year, month, {
  onShiftsUpdate: (shifts) => {
    setShifts(shifts);
  }
});
```

## 同期状態の表示

```typescript
import { SyncStatusIndicator } from '../components/SyncStatusIndicator';

function MyComponent() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  return (
    <SyncStatusIndicator
      status={syncStatus}
      lastUpdate={lastUpdate}
      shiftsCount={shifts.length}
    />
  );
}
```

## 実装例

### 大元シフト（ShiftTable.tsx）

```typescript
import { saveShiftToFirestore, subscribeToMonthShifts } from '../services/shiftSyncService';
import { SyncStatusIndicator } from './SyncStatusIndicator';

export function ShiftTable({ year, month }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  // リアルタイム監視
  useEffect(() => {
    const unsubscribe = subscribeToMonthShifts(year, month, {
      onStatusChange: setSyncStatus,
      onShiftsUpdate: setShifts,
      onError: (error) => console.error(error)
    });

    return unsubscribe;
  }, [year, month]);

  // シフト保存
  const handleSaveShift = async (shift: Shift) => {
    try {
      await saveShiftToFirestore(shift);
      console.log('✅ シフトを保存しました → 個人シフトに自動反映されます');
    } catch (error) {
      console.error('❌ 保存エラー:', error);
    }
  };

  return (
    <div>
      <SyncStatusIndicator status={syncStatus} shiftsCount={shifts.length} />
      {/* シフト表 */}
    </div>
  );
}
```

### 個人シフト（PersonalShift.tsx）

```typescript
import { subscribeToPersonalShifts } from '../services/shiftSyncService';
import { SyncStatusIndicator } from './SyncStatusIndicator';

export function PersonalShift({ helperId }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // リアルタイム監視
  useEffect(() => {
    const unsubscribe = subscribeToPersonalShifts(helperId, {
      onStatusChange: setSyncStatus,
      onShiftsUpdate: (newShifts) => {
        setShifts(newShifts);
        setLastUpdate(new Date());
      },
      onError: (error) => console.error(error)
    });

    return unsubscribe;
  }, [helperId]);

  return (
    <div>
      <SyncStatusIndicator
        status={syncStatus}
        lastUpdate={lastUpdate}
        shiftsCount={shifts.length}
      />
      {/* 個人シフト表 */}
    </div>
  );
}
```

## 同期の特徴

### ✅ リアルタイム
- 管理者がシフトを編集すると、**即座に**個人シフトに反映されます
- インターネット接続があれば、**数秒以内**に同期完了

### ✅ 自動
- 手動での「更新」ボタンは不要
- Firestoreが変更を自動検知

### ✅ 信頼性
- Firestoreのトランザクションで整合性を保証
- オフライン時のデータはキャッシュされ、オンライン復帰時に自動同期

### ✅ パフォーマンス
- 必要なデータのみをクエリ（ヘルパーID、日付範囲でフィルタ）
- 変更されたドキュメントのみが通知される

## トラブルシューティング

### Q: 個人シフトが更新されない

**A: 以下を確認してください**

1. **Firebaseの接続状態**
   ```typescript
   import { logSyncStatus } from '../services/shiftSyncService';
   logSyncStatus(); // コンソールに詳細を出力
   ```

2. **ヘルパーIDが正しいか**
   ```typescript
   console.log('ヘルパーID:', helper.id);
   console.log('シフトのヘルパーID:', shift.helperId);
   // 型が一致しているか確認（stringとnumberなど）
   ```

3. **deletedフラグがfalseか**
   ```typescript
   // 論理削除されたシフトは表示されません
   console.log('削除済み?:', shift.deleted);
   ```

### Q: 同期が遅い

**A: 通常は数秒で同期されます**

- インターネット接続を確認
- Firestoreのクォータ制限を確認（無料枠: 1日50,000回読み取り）
- ブラウザのコンソールでエラーをチェック

### Q: 同期状態を確認したい

**A: SyncStatusIndicatorコンポーネントを使用**

```typescript
<SyncStatusIndicator
  status={syncStatus}
  lastUpdate={lastUpdate}
  shiftsCount={shifts.length}
/>
```

## ベストプラクティス

1. **コンポーネントのクリーンアップ**
   ```typescript
   useEffect(() => {
     const unsubscribe = subscribeToPersonalShifts(...);
     return unsubscribe; // 必ず監視を解除
   }, [helperId]);
   ```

2. **エラーハンドリング**
   ```typescript
   onError: (error) => {
     console.error('同期エラー:', error);
     // ユーザーに通知
     alert('シフトの同期に失敗しました。ページをリロードしてください。');
   }
   ```

3. **ローディング状態**
   ```typescript
   const [isLoading, setIsLoading] = useState(true);

   useEffect(() => {
     const unsubscribe = subscribeToPersonalShifts(helperId, {
       onShiftsUpdate: (shifts) => {
         setShifts(shifts);
         setIsLoading(false); // 初回読み込み完了
       }
     });
     return unsubscribe;
   }, [helperId]);
   ```

## まとめ

- ✅ **大元シフト → Firestore → 個人シフト** の一方向同期
- ✅ **リアルタイム**で自動更新
- ✅ `shiftSyncService.ts` を使用して簡単に実装
- ✅ `SyncStatusIndicator` で状態を可視化

**シフトを保存すれば、自動的に個人シフトに反映されます！**
