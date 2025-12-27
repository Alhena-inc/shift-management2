import type { EmployeeFormData, DEPENDENT_CONDITIONS } from '../../types/employeeForm';

interface DependentsSectionProps {
  data: EmployeeFormData['dependents'];
  onChange: (data: EmployeeFormData['dependents']) => void;
}

export const DependentsSection: React.FC<DependentsSectionProps> = ({ data, onChange }) => {
  const addDependent = () => {
    if (data.length >= 5) {
      alert('扶養親族は最大5人まで登録できます');
      return;
    }

    const newDependent = {
      name: '',
      nameKana: '',
      relationship: '',
      myNumber: '',
      birthDate: '',
      postalCode: '',
      address: '',
      annualIncome: 0,
      conditions: [],
      includeSocialInsurance: false
    };

    onChange([...data, newDependent]);
  };

  const removeDependent = (index: number) => {
    onChange(data.filter((_, i) => i !== index));
  };

  const updateDependent = (index: number, field: string, value: any) => {
    const updated = data.map((dep, i) => {
      if (i === index) {
        return { ...dep, [field]: value };
      }
      return dep;
    });
    onChange(updated);
  };

  const toggleCondition = (index: number, condition: string) => {
    const dependent = data[index];
    const current = dependent.conditions || [];
    const newConditions = current.includes(condition)
      ? current.filter((c) => c !== condition)
      : [...current, condition];

    updateDependent(index, 'conditions', newConditions);
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">扶養親族情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          扶養親族の詳細情報を入力してください（最大5人まで）
        </p>
      </div>

      {data.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600 mb-4">扶養親族の情報を追加してください</p>
          <button
            type="button"
            onClick={addDependent}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
          >
            + 扶養親族を追加
          </button>
        </div>
      )}

      {data.map((dependent, index) => (
        <div
          key={index}
          className="border-2 border-gray-300 rounded-lg p-6 space-y-4 relative bg-white"
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between pb-3 border-b">
            <h3 className="text-lg font-bold text-gray-800">
              扶養親族 {index + 1}人目
            </h3>
            <button
              type="button"
              onClick={() => removeDependent(index)}
              className="text-red-500 hover:text-red-700 font-medium text-sm"
            >
              削除
            </button>
          </div>

          {/* 氏名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              氏名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.name}
              onChange={(e) => updateDependent(index, 'name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="山田 一郎"
              required
            />
          </div>

          {/* 氏名フリガナ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              氏名フリガナ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.nameKana}
              onChange={(e) => updateDependent(index, 'nameKana', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ヤマダ イチロウ"
              required
            />
          </div>

          {/* 続柄 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              あなたとの続柄 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.relationship}
              onChange={(e) => updateDependent(index, 'relationship', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例: 長男、父、母"
              required
            />
          </div>

          {/* マイナンバー */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              マイナンバー <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.myNumber}
              onChange={(e) => updateDependent(index, 'myNumber', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123456789012"
              maxLength={12}
              pattern="[0-9]*"
              required
            />
          </div>

          {/* 生年月日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              生年月日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dependent.birthDate}
              onChange={(e) => updateDependent(index, 'birthDate', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* 郵便番号 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              郵便番号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.postalCode}
              onChange={(e) => updateDependent(index, 'postalCode', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123-4567"
              maxLength={8}
              required
            />
          </div>

          {/* 住所 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              住所 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={dependent.address}
              onChange={(e) => updateDependent(index, 'address', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="住所を入力"
              required
            />
          </div>

          {/* 本年中の収入見込み */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              本年中の収入見込み <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                value={dependent.annualIncome}
                onChange={(e) => updateDependent(index, 'annualIncome', parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-12 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">円</span>
            </div>
          </div>

          {/* 扶養親族の状況 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              扶養親族の状況（該当する場合はチェック）
            </label>
            <div className="space-y-2">
              {DEPENDENT_CONDITIONS.map((condition) => (
                <label
                  key={condition}
                  className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(dependent.conditions || []).includes(condition)}
                    onChange={() => toggleCondition(index, condition)}
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
                  name={`includeSocialInsurance-${index}`}
                  checked={dependent.includeSocialInsurance === true}
                  onChange={() => updateDependent(index, 'includeSocialInsurance', true)}
                  className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">はい</span>
              </label>

              <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                <input
                  type="radio"
                  name={`includeSocialInsurance-${index}`}
                  checked={dependent.includeSocialInsurance === false}
                  onChange={() => updateDependent(index, 'includeSocialInsurance', false)}
                  className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">いいえ</span>
              </label>
            </div>
          </div>
        </div>
      ))}

      {/* 追加ボタン */}
      {data.length > 0 && data.length < 5 && (
        <button
          type="button"
          onClick={addDependent}
          className="w-full px-6 py-3 border-2 border-dashed border-blue-400 text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
        >
          + 扶養親族を追加（{data.length}/5人）
        </button>
      )}
    </div>
  );
};
