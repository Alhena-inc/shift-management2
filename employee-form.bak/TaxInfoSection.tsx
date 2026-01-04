import type { EmployeeFormData, WIDOW_DEDUCTION_OPTIONS } from '../../types/employeeForm';

interface TaxInfoSectionProps {
  data: EmployeeFormData['taxInfo'];
  onChange: (data: EmployeeFormData['taxInfo']) => void;
}

export const TaxInfoSection: React.FC<TaxInfoSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['taxInfo'], value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">扶養控除情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          扶養控除に関する情報を入力してください
        </p>
      </div>

      {/* 学校に通っているか */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          学校には通っていますか？ <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="isStudent"
              checked={data.isStudent === true}
              onChange={() => handleChange('isStudent', true)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="isStudent"
              checked={data.isStudent === false}
              onChange={() => handleChange('isStudent', false)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
          </label>
        </div>
      </div>

      {/* 障害者手帳 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          障害者手帳をお持ちですか？ <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasDisabilityCard"
              checked={data.hasDisabilityCard === true}
              onChange={() => handleChange('hasDisabilityCard', true)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasDisabilityCard"
              checked={data.hasDisabilityCard === false}
              onChange={() => handleChange('hasDisabilityCard', false)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
          </label>
        </div>
      </div>

      {/* 寡婦(夫)控除 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          寡婦(夫)控除の有無 <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {WIDOW_DEDUCTION_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
            >
              <input
                type="radio"
                name="widowDeduction"
                value={option}
                checked={data.widowDeduction === option}
                onChange={(e) => handleChange('widowDeduction', e.target.value)}
                className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm font-medium text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 扶養親族の有無 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          扶養親族はいますか？ <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasDependents"
              checked={data.hasDependents === true}
              onChange={() => handleChange('hasDependents', true)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasDependents"
              checked={data.hasDependents === false}
              onChange={() => handleChange('hasDependents', false)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
          </label>
        </div>
      </div>

      {/* 注意事項 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">扶養控除について</p>
            <p className="text-xs">
              扶養親族がいる場合は、次のステップで詳細情報を入力していただきます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
