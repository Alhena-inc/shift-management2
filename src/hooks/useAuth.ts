import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthUser {
  user: User | null;
  role: 'admin' | 'staff' | null;
  helperId: string | null;
  helperName: string | null;
  loading: boolean;
}

/**
 * 認証情報と権限を管理するカスタムフック
 */
export const useAuth = (): AuthUser => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [helperId, setHelperId] = useState<string | null>(null);
  const [helperName, setHelperName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);

        try {
          // まずusersコレクションから権限を取得
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));

          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRole(userData.role || 'staff');
            setHelperId(userData.helperId || null);
            setHelperName(userData.name || null);
          } else {
            // usersになければhelpersから取得
            const helpersRef = collection(db, 'helpers');
            const q = query(helpersRef, where('email', '==', currentUser.email));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              const helperData = querySnapshot.docs[0].data();
              const docId = querySnapshot.docs[0].id;
              setRole(helperData.role || 'staff');
              setHelperId(docId);
              setHelperName(helperData.name || null);
            } else {
              // デフォルト値
              setRole('staff');
              setHelperId(null);
              setHelperName(null);
            }
          }
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

  return { user, role, helperId, helperName, loading };
};

