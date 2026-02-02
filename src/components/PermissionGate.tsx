import React, { ReactNode, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface PermissionGateProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'staff';
  fallback?: ReactNode;
  requireOwn?: string; // 自分のデータのみアクセス可能にする場合のhelperId
}

/**
 * 権限に基づいて表示を制御するコンポーネント
 *
 * 使用例：
 * - 管理者のみ: <PermissionGate requiredRole="admin">...</PermissionGate>
 * - 自分のデータのみ: <PermissionGate requireOwn={helperId}>...</PermissionGate>
 * - 管理者または自分: <PermissionGate requiredRole="admin" requireOwn={helperId}>...</PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  requiredRole,
  fallback = null,
  requireOwn
}) => {
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRole(userData.role || 'staff');
            setHelperId(userData.helperId || null);
          } else {
            setRole('staff');
            setHelperId(null);
          }
        } catch (error) {
          console.error('権限情報の取得に失敗:', error);
          setRole('staff');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ローディング中は何も表示しない
  if (loading) {
    return <div className="animate-pulse">読み込み中...</div>;
  }

  // 権限チェック
  let hasPermission = false;

  // 管理者チェック
  if (requiredRole === 'admin' && role === 'admin') {
    hasPermission = true;
  }
  // スタッフチェック
  else if (requiredRole === 'staff' && (role === 'staff' || role === 'admin')) {
    hasPermission = true;
  }
  // 所有者チェック
  else if (requireOwn && helperId === requireOwn) {
    hasPermission = true;
  }
  // 管理者または所有者
  else if (!requiredRole && !requireOwn) {
    // 権限指定がない場合は誰でもアクセス可能
    hasPermission = true;
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>;
};

/**
 * 管理者のみに表示するコンポーネント
 */
export const AdminOnly: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => {
  return <PermissionGate requiredRole="admin" fallback={fallback}>{children}</PermissionGate>;
};

/**
 * スタッフ以上（スタッフと管理者）に表示するコンポーネント
 */
export const StaffOrAdmin: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({
  children,
  fallback = null
}) => {
  return <PermissionGate requiredRole="staff" fallback={fallback}>{children}</PermissionGate>;
};

/**
 * 自分のデータのみ編集可能にするコンポーネント
 */
export const OwnDataOnly: React.FC<{
  children: ReactNode;
  targetHelperId: string;
  fallback?: ReactNode;
}> = ({ children, targetHelperId, fallback = null }) => {
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRole(userData.role || 'staff');
            setHelperId(userData.helperId || null);
          } else {
            setRole('staff');
            setHelperId(null);
          }
        } catch (error) {
          console.error('権限情報の取得に失敗:', error);
          setRole('staff');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return null;

  // 管理者または自分のデータの場合は表示
  const hasPermission = role === 'admin' || helperId === targetHelperId;

  return hasPermission ? <>{children}</> : <>{fallback}</>;
};

/**
 * 権限不足メッセージコンポーネント
 */
export const NoPermissionMessage: React.FC<{ message?: string }> = ({
  message = 'この機能へのアクセス権限がありません'
}) => {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center">
        <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-red-700 text-sm">{message}</span>
      </div>
    </div>
  );
};

/**
 * 権限バッジコンポーネント
 */
export const RoleBadge: React.FC<{ role: 'admin' | 'staff' | null }> = ({ role }) => {
  if (!role) return null;

  const config = {
    admin: {
      label: '管理者',
      className: 'bg-red-100 text-red-800 border-red-200'
    },
    staff: {
      label: 'スタッフ',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    }
  };

  const { label, className } = config[role];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
};