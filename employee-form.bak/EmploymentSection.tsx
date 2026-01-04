import type { EmployeeFormData } from '../../types/employeeForm';
import { FileUploadField } from './FileUploadField';

interface EmploymentSectionProps {
  data: EmployeeFormData['employment'];
  onChange: (data: EmployeeFormData['employment']) => void;
}

export const EmploymentSection: React.FC<EmploymentSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['employment'], value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">マイナンバー・雇用情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          マイナンバーカードと雇用保険の情報を入力してください
        </p>
      </div>

      {/* マイナンバー */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          マイナンバー（個人番号） <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.myNumber}
          onChange={(e) => handleChange('myNumber', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="123456789012"
          maxLength={12}
          pattern="[0-9]*"
          required
        />
        <p className="text-xs text-gray-500 mt-1">12桁の数字を入力してください</p>
      </div>

      {/* マイナンバーカード【表】 */}
      <FileUploadField
        label="マイナンバーカード【表面】"
        value={data.myNumberFrontUrl}
        onChange={(url) => handleChange('myNumberFrontUrl', url)}
        category="my-number"
        accept="image/*"
        required
      />

      {/* マイナンバーカード【裏】 */}
      <FileUploadField
        label="マイナンバーカード【裏面】"
        value={data.myNumberBackUrl}
        onChange={(url) => handleChange('myNumberBackUrl', url)}
        category="my-number"
        accept="image/*"
        required
      />

      {/* 雇用保険番号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          雇用保険番号
        </label>
        <input
          type="text"
          value={data.employmentInsuranceNumber}
          onChange={(e) => handleChange('employmentInsuranceNumber', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="1234-567890-1"
        />
        <p className="text-xs text-gray-500 mt-1">お持ちの方のみ入力してください</p>
      </div>

      {/* 前職の会社名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          前職の会社名
        </label>
        <input
          type="text"
          value={data.previousCompany}
          onChange={(e) => handleChange('previousCompany', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="株式会社〇〇"
        />
        <p className="text-xs text-gray-500 mt-1">前職がある方のみ入力してください</p>
      </div>

      {/* 前職の在籍期間 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          前職の在籍期間
        </label>
        <input
          type="text"
          value={data.previousCompanyPeriod}
          onChange={(e) => handleChange('previousCompanyPeriod', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="2020年4月 〜 2024年3月"
        />
        <p className="text-xs text-gray-500 mt-1">例: 2020年4月 〜 2024年3月</p>
      </div>

      {/* 注意事項 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">個人情報の取り扱いについて</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>マイナンバーは厳重に管理され、法律で定められた用途にのみ使用されます</li>
              <li>マイナンバーカードの画像は鮮明に撮影してください</li>
              <li>通知カードは使用できません。必ずマイナンバーカードをご用意ください</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
