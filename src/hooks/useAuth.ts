import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { onAuthStateChanged, getUserPermissions } from '../services/supabaseAuthService';

interface AuthUser {
  user: User | null;
  role: 'admin' | 'staff' | null;
  helperId: string | null;
  helperName: string | null;
  loading: boolean;
}

/**
 * 認証情報と権限を管理するカスタムフック
 * Supabase認証を使用
 */
export const useAuth = (): AuthUser => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          const permissions = await getUserPermissions(currentUser);
          setRole(permissions.role);
          setHelperId(permissions.helperId);
          setHelperName(permissions.helperName);
        } catch (error) {
          console.error('権限情報の取得に失敗:', error);
          setRole('staff');
          setHelperId(null);
          setHelperName(null);
        }
      } else {
        setUser(null);
        setRole(null);
        setHelperId(null);
        setHelperName(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    user,
    role,
    helperId,
    helperName,
    loading,
  };
};