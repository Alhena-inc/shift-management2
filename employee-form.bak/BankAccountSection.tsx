import type { EmployeeFormData } from '../../types/employeeForm';

interface BankAccountSectionProps {
  data: EmployeeFormData['bankAccount'];
  onChange: (data: EmployeeFormData['bankAccount']) => void;
}

export const BankAccountSection: React.FC<BankAccountSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['bankAccount'], value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">口座情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          給与振込先の口座情報を入力してください
        </p>
      </div>

      {/* 銀行名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          銀行名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.bankName}
          onChange={(e) => handleChange('bankName', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="〇〇銀行"
          required
        />
      </div>

      {/* 支店名 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          支店名 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.branchName}
          onChange={(e) => handleChange('branchName', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="△△支店"
          required
        />
      </div>

      {/* 口座種別 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          口座種別 <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="accountType"
              value="ordinary"
              checked={data.accountType === 'ordinary'}
              onChange={(e) => handleChange('accountType', e.target.value as 'ordinary' | 'checking')}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">普通預金</span>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="accountType"
              value="checking"
              checked={data.accountType === 'checking'}
              onChange={(e) => handleChange('accountType', e.target.value as 'ordinary' | 'checking')}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-sm font-medium text-gray-700">当座預金</span>
          </label>
        </div>
      </div>

      {/* 口座番号 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          口座番号 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.accountNumber}
          onChange={(e) => handleChange('accountNumber', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="1234567"
          maxLength={7}
          pattern="[0-9]*"
          required
        />
        <p className="text-xs text-gray-500 mt-1">半角数字で入力してください（通常7桁）</p>
      </div>

      {/* 口座名義 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          口座名義（カナ） <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.accountHolder}
          onChange={(e) => handleChange('accountHolder', e.target.value.toUpperCase())}
          className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="ヤマダ タロウ"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          全角カタカナで入力してください（姓と名の間にスペース）
        </p>
      </div>

      {/* 確認表示 */}
      {data.bankName && data.branchName && data.accountNumber && data.accountHolder && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-3">入力内容の確認</p>
          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="text-gray-600 w-24">銀行:</span>
              <span className="text-gray-800 font-medium">{data.bankName}</span>
            </div>
            <div className="flex">
              <span className="text-gray-600 w-24">支店:</span>
              <span className="text-gray-800 font-medium">{data.branchName}</span>
            </div>
            <div className="flex">
              <span className="text-gray-600 w-24">種別:</span>
              <span className="text-gray-800 font-medium">
                {data.accountType === 'ordinary' ? '普通預金' : '当座預金'}
              </span>
            </div>
            <div className="flex">
              <span className="text-gray-600 w-24">口座番号:</span>
              <span className="text-gray-800 font-medium">{data.accountNumber}</span>
            </div>
            <div className="flex">
              <span className="text-gray-600 w-24">名義:</span>
              <span className="text-gray-800 font-medium">{data.accountHolder}</span>
            </div>
          </div>
        </div>
      )}

      {/* 注意事項 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">入力時の注意</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>給与振込は毎月25日に行われます</li>
              <li>口座名義は通帳やキャッシュカードに記載の通りに入力してください</li>
              <li>口座番号は7桁の数字です（不足する場合は先頭に0を付けてください）</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
