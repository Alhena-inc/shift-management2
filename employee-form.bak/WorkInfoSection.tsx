import type { EmployeeFormData, TRANSPORT_METHODS } from '../../types/employeeForm';

interface WorkInfoSectionProps {
  data: EmployeeFormData['work'];
  onChange: (data: EmployeeFormData['work']) => void;
}

export const WorkInfoSection: React.FC<WorkInfoSectionProps> = ({ data, onChange }) => {
  const handleChange = (field: keyof EmployeeFormData['work'], value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleTransportMethodToggle = (method: string) => {
    const current = data.transportMethod || [];
    const newMethods = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];

    handleChange('transportMethod', newMethods);
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-800">勤務情報</h2>
        <p className="text-sm text-gray-600 mt-1">
          勤務に関する情報を入力してください
        </p>
      </div>

      {/* 本業かどうか */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          弊社の業務は本業ですか？ <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="isMainJob"
              checked={data.isMainJob === true}
              onChange={() => handleChange('isMainJob', true)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="ml-3">
              <div className="text-sm font-medium text-gray-700">はい</div>
              <div className="text-xs text-gray-500">本業として勤務</div>
            </div>
          </label>

          <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
            <input
              type="radio"
              name="isMainJob"
              checked={data.isMainJob === false}
              onChange={() => handleChange('isMainJob', false)}
              className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="ml-3">
              <div className="text-sm font-medium text-gray-700">いいえ</div>
              <div className="text-xs text-gray-500">副業として勤務</div>
            </div>
          </label>
        </div>
      </div>

      {/* 交通手段 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          通勤・移動の際の交通手段について教えてください <span className="text-red-500">*</span>
          <span className="block text-xs text-gray-500 mt-1">複数選択可能</span>
        </label>
        <div className="space-y-2">
          {TRANSPORT_METHODS.map((method) => (
            <label
              key={method}
              className="flex items-center p-4 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={(data.transportMethod || []).includes(method)}
                onChange={() => handleTransportMethodToggle(method)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-3 text-sm text-gray-700">{method}</span>
            </label>
          ))}
        </div>

        {(data.transportMethod || []).length === 0 && (
          <p className="text-xs text-red-500 mt-2">少なくとも1つ選択してください</p>
        )}
      </div>

      {/* 選択された交通手段の表示 */}
      {(data.transportMethod || []).length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-2">選択された交通手段:</p>
          <div className="flex flex-wrap gap-2">
            {data.transportMethod.map((method) => (
              <span
                key={method}
                className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 注意事項 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">交通費について</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>公共交通機関での通勤・移動の場合、1ヶ月10,000円まで交通費を支給します</li>
              <li>自家用車・バイクでの通勤の場合は、ガソリン代として別途支給します</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
