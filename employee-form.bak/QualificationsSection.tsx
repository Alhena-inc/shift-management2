import type { EmployeeFormData, QUALIFICATION_OPTIONS } from '../../types/employeeForm';
import { FileUploadField } from './FileUploadField';

interface QualificationsSectionProps {
  data: EmployeeFormData['qualifications'];
  onChange: (data: EmployeeFormData['qualifications']) => void;
}

export const QualificationsSection: React.FC<QualificationsSectionProps> = ({ data, onChange }) => {
  const handleQualificationToggle = (qualification: string) => {
    const newSelected = data.selected.includes(qualification)
      ? data.selected.filter((q) => q !== qualification)
      : [...data.selected, qualification];

    onChange({ ...data, selected: newSelected });
  };

  const handleCertificateUpload = (url: string) => {
    onChange({ ...data, certificates: [...data.certificates, url] });
  };

  const handleCertificateRemove = (index: number) => {
    const newCertificates = data.certificates.filter((_, i) => i !== index);
    onChange({ ...data, certificates: newCertificates });
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">資格情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          お持ちの資格を選択し、資格証をアップロードしてください
        </p>
      </div>

      {/* 資格選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          保有資格 <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {QUALIFICATION_OPTIONS.map((qualification) => (
            <label
              key={qualification}
              className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={data.selected.includes(qualification)}
                onChange={() => handleQualificationToggle(qualification)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">{qualification}</span>
            </label>
          ))}
        </div>
        {data.selected.length === 0 && (
          <p className="text-xs text-red-500 mt-2">少なくとも1つの資格を選択してください</p>
        )}
      </div>

      {/* 選択された資格の表示 */}
      {data.selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">選択された資格:</p>
          <div className="flex flex-wrap gap-2">
            {data.selected.map((qualification) => (
              <span
                key={qualification}
                className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
              >
                {qualification}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 資格証アップロード */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          資格証のアップロード <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-600 mb-3">
          保有資格の証明書を画像またはPDFでアップロードしてください（複数可）
        </p>

        {/* アップロード済み資格証一覧 */}
        {data.certificates.length > 0 && (
          <div className="space-y-2 mb-4">
            {data.certificates.map((cert, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 font-medium">
                    資格証 {index + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCertificateRemove(index)}
                  className="text-red-500 hover:text-red-700 text-sm font-medium"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 新規アップロード */}
        <FileUploadField
          label={`資格証 ${data.certificates.length + 1}`}
          value=""
          onChange={handleCertificateUpload}
          category="certificates"
          accept="image/*,.pdf"
          required={data.certificates.length === 0}
        />

        {data.certificates.length === 0 && (
          <p className="text-xs text-red-500 mt-2">
            少なくとも1つの資格証をアップロードしてください
          </p>
        )}
      </div>

      {/* 注意事項 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">アップロード時の注意</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>資格証は有効期限内のものをアップロードしてください</li>
              <li>文字が鮮明に読み取れる画像をご用意ください</li>
              <li>ファイルサイズは1枚あたり5MB以下にしてください</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
