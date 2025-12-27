import type { EmployeeFormData } from '../../types/employeeForm';

interface ConfirmationSectionProps {
  data: EmployeeFormData['confirmations'];
  onChange: (data: EmployeeFormData['confirmations']) => void;
}

export const ConfirmationSection: React.FC<ConfirmationSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['confirmations'], value: boolean) => {
    onChange({ ...data, [field]: value });
  };

  const allConfirmed = data.hourlyRate && data.paymentDate && data.workingHours && data.transportAllowance;

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">確認事項</h2>
        <p className="text-sm text-gray-600 mt-1">
          以下の内容をご確認の上、すべてにチェックを入れてください
        </p>
      </div>

      {/* 確認項目 */}
      <div className="space-y-4">
        {/* 時給 */}
        <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
          <input
            type="checkbox"
            checked={data.hourlyRate}
            onChange={(e) => handleChange('hourlyRate', e.target.checked)}
            className="w-6 h-6 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5"
          />
          <div className="ml-4 flex-1">
            <div className="text-sm font-medium text-gray-900">
              時給は1,400円です
            </div>
            <div className="text-xs text-gray-600 mt-1">
              ※ 処遇改善加算を含む基本時給です
            </div>
          </div>
          {data.hourlyRate && (
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </label>

        {/* 支払日 */}
        <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
          <input
            type="checkbox"
            checked={data.paymentDate}
            onChange={(e) => handleChange('paymentDate', e.target.checked)}
            className="w-6 h-6 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5"
          />
          <div className="ml-4 flex-1">
            <div className="text-sm font-medium text-gray-900">
              給料の支払い日は末日締めの翌月25日払いです
            </div>
            <div className="text-xs text-gray-600 mt-1">
              ※ 支払日が土日祝日の場合は、前営業日に支払われます
            </div>
          </div>
          {data.paymentDate && (
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </label>

        {/* 勤務時間 */}
        <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
          <input
            type="checkbox"
            checked={data.workingHours}
            onChange={(e) => handleChange('workingHours', e.target.checked)}
            className="w-6 h-6 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5"
          />
          <div className="ml-4 flex-1">
            <div className="text-sm font-medium text-gray-900">
              原則、週30時間以内での勤務になります
            </div>
            <div className="text-xs text-gray-600 mt-1">
              ※ 社会保険加入要件に抵触しないための措置です
            </div>
          </div>
          {data.workingHours && (
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </label>

        {/* 交通費 */}
        <label className="flex items-start p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-green-500 has-[:checked]:bg-green-50">
          <input
            type="checkbox"
            checked={data.transportAllowance}
            onChange={(e) => handleChange('transportAllowance', e.target.checked)}
            className="w-6 h-6 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5"
          />
          <div className="ml-4 flex-1">
            <div className="text-sm font-medium text-gray-900">
              公共交通機関での通勤・移動の場合1ヶ月10,000円まで交通費を支給します
            </div>
            <div className="text-xs text-gray-600 mt-1">
              ※ 自家用車・バイク利用の場合は別途ガソリン代を支給
            </div>
          </div>
          {data.transportAllowance && (
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </label>
      </div>

      {/* 確認状況 */}
      {allConfirmed ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-green-800">
              <p className="font-medium">すべての項目を確認しました</p>
              <p className="text-xs mt-1">送信ボタンを押して、登録を完了してください</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-yellow-800">
              <p className="font-medium">
                すべての確認事項にチェックを入れてください
              </p>
              <p className="text-xs mt-1">
                未確認: {4 - [data.hourlyRate, data.paymentDate, data.workingHours, data.transportAllowance].filter(Boolean).length}件
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 最終確認 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">ご確認ください</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>入力内容に誤りがないか、もう一度ご確認ください</li>
              <li>送信後、管理者が内容を確認します</li>
              <li>不備がある場合は、登録されたメールアドレスにご連絡します</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
