import type { EmployeeFormData } from '../../types/employeeForm';

interface SpouseSectionProps {
  data: EmployeeFormData['spouse'];
  basicAddress: string;
  onChange: (data: EmployeeFormData['spouse']) => void;
}

export const SpouseSection: React.FC<SpouseSectionProps> = ({ data, basicAddress, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['spouse'], value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleConditionToggle = (condition: string) => {
    const current = data.conditions || [];
    const newConditions = current.includes(condition)
      ? current.filter((c) => c !== condition)
      : [...current, condition];
    onChange({ ...data, conditions: newConditions });
  };

  const handleSameAddress = (checked: boolean) => {
    if (checked) {
      onChange({ ...data, address: basicAddress, postalCode: '' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">配偶者情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          配偶者の情報を入力してください
        </p>
      </div>

      {/* 配偶者の有無 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          配偶者はいますか？ <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasSpouse"
              checked={data.hasSpouse === true}
              onChange={() => handleChange('hasSpouse', true)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="hasSpouse"
              checked={data.hasSpouse === false}
              onChange={() => handleChange('hasSpouse', false)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
          </label>
        </div>
      </div>

      {/* 配偶者情報（配偶者がいる場合のみ表示） */}
      {data.hasSpouse && (
        <div className="space-y-6 border-l-4 border-blue-400 pl-6 py-4 bg-blue-50 rounded-r-lg">
          {/* 氏名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              配偶者 氏名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="山田 花子"
              required={data.hasSpouse}
            />
          </div>

          {/* 氏名フリガナ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              配偶者 氏名フリガナ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.nameKana || ''}
              onChange={(e) => handleChange('nameKana', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ヤマダ ハナコ"
              required={data.hasSpouse}
            />
          </div>

          {/* 続柄 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              あなたとの続柄 <span className="text-red-500">*</span>
            </label>
            <select
              value={data.relationship || ''}
              onChange={(e) => handleChange('relationship', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={data.hasSpouse}
            >
              <option value="">選択してください</option>
              <option value="夫">夫</option>
              <option value="妻">妻</option>
            </select>
          </div>

          {/* マイナンバー */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              配偶者 マイナンバー <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={data.myNumber || ''}
              onChange={(e) => handleChange('myNumber', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123456789012"
              maxLength={12}
              pattern="[0-9]*"
              required={data.hasSpouse}
            />
          </div>

          {/* 生年月日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              配偶者 生年月日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={data.birthDate || ''}
              onChange={(e) => handleChange('birthDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={data.hasSpouse}
            />
          </div>

          {/* 同居チェックボックス */}
          <div>
            <label className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                onChange={(e) => handleSameAddress(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">
                配偶者は同居している（住所が同じ）
              </span>
            </label>
          </div>

          {/* 郵便番号 */}
          {!data.address && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                配偶者 郵便番号
              </label>
              <input
                type="text"
                value={data.postalCode || ''}
                onChange={(e) => handleChange('postalCode', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="123-4567"
                maxLength={8}
              />
            </div>
          )}

          {/* 住所 */}
          {!data.address && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                配偶者 住所
              </label>
              <input
                type="text"
                value={data.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="住所を入力"
              />
            </div>
          )}

          {/* 本年中の収入見込み */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              配偶者の本年中の収入見込み <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={data.annualIncome || ''}
                onChange={(e) => handleChange('annualIncome', parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-12 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="1000000"
                required={data.hasSpouse}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">円</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">半角数字で入力してください</p>
          </div>

          {/* 配偶者の状況 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              配偶者の状況（該当する場合はチェック）
            </label>
            <div className="space-y-2">
              {['障害者', '特別障害者', '同居特別障害者', '非居住者'].map((condition) => (
                <label
                  key={condition}
                  className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(data.conditions || []).includes(condition)}
                    onChange={() => handleConditionToggle(condition)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">{condition}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 社会保険も扶養 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              社会保険も扶養にしますか？
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="includeSocialInsurance"
                  checked={data.includeSocialInsurance === true}
                  onChange={() => handleChange('includeSocialInsurance', true)}
                  className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
              </label>

              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name="includeSocialInsurance"
                  checked={data.includeSocialInsurance === false}
                  onChange={() => handleChange('includeSocialInsurance', false)}
                  className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
