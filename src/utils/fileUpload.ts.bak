import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

/**
 * ファイルをFirebase Storageにアップロード
 * @param file アップロードするファイル
 * @param path 保存先のパス
 * @returns ダウンロードURL
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  try {
    // ファイル名をユニークにする
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const fullPath = `${path}/${fileName}`;

    // Storageリファレンスを作成
    const storageRef = ref(storage, fullPath);

    // ファイルをアップロード
    console.log('📤 ファイルアップロード開始:', fullPath);
    const snapshot = await uploadBytes(storageRef, file);

    // ダウンロードURLを取得
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('✅ ファイルアップロード成功:', downloadURL);

    return downloadURL;
  } catch (error) {
    console.error('❌ ファイルアップロードエラー:', error);
    throw error;
  }
};

/**
 * 複数のファイルを一度にアップロード
 * @param files アップロードするファイルの配列
 * @param basePath 保存先のベースパス
 * @returns ダウンロードURLの配列
 */
export const uploadMultipleFiles = async (
  files: File[],
  basePath: string
): Promise<string[]> => {
  try {
    const uploadPromises = files.map((file) => uploadFile(file, basePath));
    const urls = await Promise.all(uploadPromises);
    console.log(`✅ ${urls.length}件のファイルアップロード完了`);
    return urls;
  } catch (error) {
    console.error('❌ 複数ファイルアップロードエラー:', error);
    throw error;
  }
};

/**
 * 画像ファイルをアップロード（従業員フォーム用）
 * @param file 画像ファイル
 * @param category カテゴリ（my-number, certificates など）
 * @returns ダウンロードURL
 */
export const uploadEmployeeImage = async (
  file: File,
  category: string
): Promise<string> => {
  const path = `employee-forms/${category}`;
  return uploadFile(file, path);
};

/**
 * ファイルサイズをチェック（最大5MB）
 * @param file チェックするファイル
 * @param maxSizeMB 最大サイズ（MB）
 * @returns サイズが許容範囲内かどうか
 */
export const validateFileSize = (file: File, maxSizeMB: number = 5): boolean => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    alert(`ファイルサイズは${maxSizeMB}MB以下にしてください`);
    return false;
  }
  return true;
};

/**
 * ファイルの種類をチェック
 * @param file チェックするファイル
 * @param allowedTypes 許可するMIMEタイプの配列
 * @returns ファイルタイプが許可されているかどうか
 */
export const validateFileType = (
  file: File,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
): boolean => {
  if (!allowedTypes.includes(file.type)) {
    alert('許可されていないファイル形式です');
    return false;
  }
  return true;
};
