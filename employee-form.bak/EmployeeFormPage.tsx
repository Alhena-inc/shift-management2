import { useState } from 'react';
import { initialEmployeeFormData, EmployeeFormData } from '../../types/employeeForm';
import { saveEmployeeForm } from '../../services/employeeFormService';
import { BasicInfoSection } from './BasicInfoSection';
import { QualificationsSection } from './QualificationsSection';
import { EmploymentSection } from './EmploymentSection';
import { SpouseSection } from './SpouseSection';
import { TaxInfoSection } from './TaxInfoSection';
import { DependentsSection } from './DependentsSection';
import { WorkInfoSection } from './WorkInfoSection';
import { BankAccountSection } from './BankAccountSection';
import { ConfirmationSection } from './ConfirmationSection';

export const EmployeeFormPage: React.FC = () => {
  const [formData, setFormData] = useState<EmployeeFormData>(initialEmployeeFormData);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalSteps = 9;

  // バリデーション
  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1: // 基本情報
        const { name, nameKana, birthDate, postalCode, address, phone, email } = formData.basic;
        if (!name || !nameKana || !birthDate || !postalCode || !address || !phone || !email) {
          alert('すべての必須項目を入力してください');
          return false;
        }
        return true;

      case 2: // 資格情報
        if (formData.qualifications.selected.length === 0) {
          alert('少なくとも1つの資格を選択してください');
          return false;
        }
        if (formData.qualifications.certificates.length === 0) {
          alert('少なくとも1つの資格証をアップロードしてください');
          return false;
        }
        return true;

      case 3: // マイナンバー・雇用情報
        if (!formData.employment.myNumber || !formData.employment.myNumberFrontUrl || !formData.employment.myNumberBackUrl) {
          alert('マイナンバーとマイナンバーカードの画像をアップロードしてください');
          return false;
        }
        return true;

      case 4: // 配偶者情報
        if (formData.spouse.hasSpouse) {
          if (!formData.spouse.name || !formData.spouse.nameKana || !formData.spouse.myNumber) {
            alert('配偶者の必須項目を入力してください');
            return false;
          }
        }
        return true;

      case 5: // 扶養控除情報
        // 必須項目のチェック
        return true;

      case 6: // 扶養親族情報
        if (formData.taxInfo.hasDependents && formData.dependents.length === 0) {
          alert('扶養親族の情報を追加してください');
          return false;
        }
        return true;

      case 7: // 勤務情報
        if (formData.work.transportMethod.length === 0) {
          alert('通勤・移動手段を選択してください');
          return false;
        }
        return true;

      case 8: // 口座情報
        const { bankName, branchName, accountNumber, accountHolder } = formData.bankAccount;
        if (!bankName || !branchName || !accountNumber || !accountHolder) {
          alert('すべての必須項目を入力してください');
          return false;
        }
        return true;

      case 9: // 確認事項
        const { hourlyRate, paymentDate, workingHours, transportAllowance } = formData.confirmations;
        if (!hourlyRate || !paymentDate || !workingHours || !transportAllowance) {
          alert('すべての確認事項にチェックを入れてください');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    if (!window.confirm('入力内容を送信してもよろしいですか？\n送信後は管理者が確認します。')) {
      return;
    }

    try {
      setIsSubmitting(true);
      const formId = await saveEmployeeForm(formData);
      console.log('フォーム送信成功:', formId);

      // 完了ページへ遷移
      sessionStorage.setItem('employeeFormId', formId);
      window.location.href = '/employee-form/complete';
    } catch (error) {
      console.error('フォーム送信エラー:', error);
      alert('送信に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b border-gray-200">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">従業員情報登録フォーム</h1>
            <p className="text-gray-600">Alhena合同会社 訪問介護事業所のあ</p>
          </div>
        </div>

        {/* 進捗バー */}
        <div className="bg-white shadow-lg px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between mb-2 text-sm">
            <span className="font-medium text-gray-700">
              ステップ {currentStep} / {totalSteps}
            </span>
            <span className="font-medium text-blue-600">
              {Math.round((currentStep / totalSteps) * 100)}% 完了
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>

          {/* ステップ表示 */}
          <div className="flex justify-between mt-4">
            <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                {currentStep > 1 ? '✓' : '1'}
              </div>
              <span className="ml-2 text-xs font-medium hidden sm:inline">基本情報</span>
            </div>
            <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                {currentStep > 2 ? '✓' : '2'}
              </div>
              <span className="ml-2 text-xs font-medium hidden sm:inline">資格情報</span>
            </div>
            <div className={`flex items-center ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                3
              </div>
              <span className="ml-2 text-xs font-medium hidden sm:inline">口座情報</span>
            </div>
          </div>
        </div>

        {/* フォームコンテンツ */}
        <div className="bg-white shadow-lg p-6 sm:p-8">
          {currentStep === 1 && (
            <BasicInfoSection
              data={formData.basic}
              onChange={(basic) => setFormData({ ...formData, basic })}
            />
          )}

          {currentStep === 2 && (
            <QualificationsSection
              data={formData.qualifications}
              onChange={(qualifications) => setFormData({ ...formData, qualifications })}
            />
          )}

          {currentStep === 3 && (
            <BankAccountSection
              data={formData.bankAccount}
              onChange={(bankAccount) => setFormData({ ...formData, bankAccount })}
            />
          )}
        </div>

        {/* ナビゲーションボタン */}
        <div className="bg-white rounded-b-2xl shadow-lg p-6">
          <div className="flex justify-between gap-4">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← 戻る
            </button>

            {currentStep < totalSteps ? (
              <button
                onClick={handleNext}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all"
              >
                次へ →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    送信中...
                  </span>
                ) : (
                  '送信 ✓'
                )}
              </button>
            )}
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-600 text-center">
            入力された情報は厳重に管理されます。不明な点がございましたら、管理者までお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
};
