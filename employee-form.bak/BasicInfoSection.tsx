import type { EmployeeFormData } from '../../types/employeeForm';

interface BasicInfoSectionProps {
  data: EmployeeFormData['basic'];
  onChange: (data: EmployeeFormData['basic']) => void;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['basic'], value: string) => {
    onChange({ ...data, [field]: value });
  };

  // 郵便番号から住所を検索（簡易版）
  const searchAddress = async (postalCode: string) => {
    // 実装: 郵便番号APIを使用して住所検索
    // ここでは簡易的な処理のみ
    console.log('住所検索:', postalCode);
    alert('郵便番号検索機能は今後実装予定です');
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">基本情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          あなたの基本的な情報を入力してください
        </p>
      </div>

      {/* 氏名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          氏名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="山田 太郎"
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
          value={data.nameKana}
          onChange={(e) => handleChange('nameKana', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="ヤマダ タロウ"
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
          value={data.birthDate}
          onChange={(e) => handleChange('birthDate', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
        />
      </div>

      {/* 郵便番号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          郵便番号 <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={data.postalCode}
            onChange={(e) => handleChange('postalCode', e.target.value)}
            className="w-40 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123-4567"
            maxLength={8}
            required
          />
          <button
            type="button"
            onClick={() => searchAddress(data.postalCode)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300"
          >
            住所検索
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">ハイフンを含めて入力してください（例: 123-4567）</p>
      </div>

      {/* 住所 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          住所 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.address}
          onChange={(e) => handleChange('address', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="大阪府大阪市大正区三軒家東4-15-4"
          required
        />
      </div>

      {/* 電話番号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          電話番号 <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          value={data.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="090-1234-5678"
          required
        />
        <p className="text-xs text-gray-500 mt-1">ハイフンを含めて入力してください</p>
      </div>

      {/* メールアドレス */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          メールアドレス <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => handleChange('email', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="example@email.com"
          required
        />
      </div>
    </div>
  );
};
