import { useState } from 'react';
import { uploadEmployeeImage, validateFileSize, validateFileType } from '../../utils/fileUpload';

interface FileUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  category: string;
  required?: boolean;
}

export const FileUploadField: React.FC<FileUploadFieldProps> = ({
  label,
  value,
  onChange,
  accept = 'image/*,.pdf',
  category,
  required = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // バリデーション
    if (!validateFileSize(file, 5)) return;
    if (!validateFileType(file)) return;

    try {
      setUploading(true);

      // プレビュー表示（画像の場合）
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }

      // Firebase Storageにアップロード
      const url = await uploadEmployeeImage(file, category);
      onChange(url);
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onChange('');
    setPreview(null);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
        {uploading ? (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-600">アップロード中...</p>
          </div>
        ) : value || preview ? (
          <div className="space-y-3">
            {/* プレビュー表示 */}
            {preview && preview.startsWith('data:image') && (
              <div className="flex justify-center">
                <img
                  src={preview}
                  alt="プレビュー"
                  className="max-h-40 rounded border"
                />
              </div>
            )}

            {/* アップロード済み表示 */}
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-green-700 font-medium">アップロード済み</span>
              </div>
              <button
                type="button"
                onClick={handleRemove}
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                削除
              </button>
            </div>

            {/* 再アップロード */}
            <div className="text-center">
              <label htmlFor={`file-${category}`} className="text-blue-600 hover:underline cursor-pointer text-sm">
                別のファイルを選択
              </label>
              <input
                id={`file-${category}`}
                type="file"
                onChange={handleFileChange}
                accept={accept}
                className="hidden"
              />
            </div>
          </div>
        ) : (
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <label
                htmlFor={`file-${category}-initial`}
                className="cursor-pointer inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                ファイルを選択
              </label>
              <input
                id={`file-${category}-initial`}
                type="file"
                onChange={handleFileChange}
                accept={accept}
                className="hidden"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {accept.includes('image') ? '画像ファイル' : 'PDF'}（最大5MB）
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
