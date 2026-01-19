import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { EmployeeFormData } from '../types/employeeForm';

const COLLECTION_NAME = 'employee-forms';

/**
 * 従業員フォームデータを保存
 */
export const saveEmployeeForm = async (formData: EmployeeFormData): Promise<string> => {
  try {
    const dataToSave = {
      ...formData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      status: formData.status || 'pending'
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), dataToSave);
    console.log('✅ 従業員フォーム保存成功:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ 従業員フォーム保存エラー:', error);
    throw error;
  }
};

/**
 * 従業員フォームデータを更新
 */
export const updateEmployeeForm = async (
  id: string,
  formData: Partial<EmployeeFormData>
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...formData,
      updatedAt: Timestamp.now()
    });
    console.log('✅ 従業員フォーム更新成功:', id);
  } catch (error) {
    console.error('❌ 従業員フォーム更新エラー:', error);
    throw error;
  }
};

/**
 * すべての従業員フォームデータを取得
 */
export const getAllEmployeeForms = async (): Promise<EmployeeFormData[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const forms: EmployeeFormData[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      forms.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      } as EmployeeFormData);
    });

    console.log(`✅ 従業員フォーム取得成功: ${forms.length}件`);
    return forms;
  } catch (error) {
    console.error('❌ 従業員フォーム取得エラー:', error);
    throw error;
  }
};

/**
 * 特定の従業員フォームデータを取得
 */
export const getEmployeeForm = async (id: string): Promise<EmployeeFormData | null> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      } as EmployeeFormData;
    } else {
      console.log('❌ 従業員フォームが見つかりません:', id);
      return null;
    }
  } catch (error) {
    console.error('❌ 従業員フォーム取得エラー:', error);
    throw error;
  }
};

/**
 * フォームのステータスを更新
 */
export const updateFormStatus = async (
  id: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      status,
      updatedAt: Timestamp.now()
    });
    console.log('✅ フォームステータス更新成功:', id, status);
  } catch (error) {
    console.error('❌ フォームステータス更新エラー:', error);
    throw error;
  }
};

/**
 * 従業員フォームデータをヘルパー管理に取り込む
 */
export const importFormToHelper = async (formId: string): Promise<void> => {
  try {
    const formData = await getEmployeeForm(formId);

    if (!formData) {
      throw new Error('フォームデータが見つかりません');
    }

    // ヘルパーデータに変換して保存する処理は
    // HelperManagerコンポーネント側で実装

    // ステータスを承認済みに更新
    await updateFormStatus(formId, 'approved');

    console.log('✅ ヘルパー管理への取り込み成功:', formId);
  } catch (error) {
    console.error('❌ ヘルパー管理への取り込みエラー:', error);
    throw error;
  }
};
