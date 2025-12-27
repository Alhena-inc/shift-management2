// 従業員情報フォームの型定義

export interface EmployeeFormData {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  status?: 'pending' | 'approved' | 'rejected';

  // 基本情報
  basic: {
    name: string;
    nameKana: string;
    birthDate: string;
    postalCode: string;
    address: string;
    phone: string;
    email: string;
  };

  // 資格情報
  qualifications: {
    selected: string[];  // 選択された資格
    certificates: string[];  // アップロードされた資格証のURL
  };

  // マイナンバー・雇用情報
  employment: {
    myNumber: string;
    myNumberFrontUrl: string;
    myNumberBackUrl: string;
    employmentInsuranceNumber: string;
    previousCompany: string;
    previousCompanyPeriod: string;
  };

  // 配偶者情報
  spouse: {
    hasSpouse: boolean;
    name?: string;
    nameKana?: string;
    relationship?: string;
    myNumber?: string;
    birthDate?: string;
    postalCode?: string;
    address?: string;
    annualIncome?: number;
    conditions?: string[];  // 障害者、特別障害者等
    includeSocialInsurance?: boolean;
  };

  // 扶養控除等
  taxInfo: {
    isStudent: boolean;
    hasDisabilityCard: boolean;
    widowDeduction: string;
    hasDependents: boolean;
  };

  // 扶養親族（配列）
  dependents: {
    name: string;
    nameKana: string;
    relationship: string;
    myNumber: string;
    birthDate: string;
    postalCode: string;
    address: string;
    annualIncome: number;
    conditions: string[];
    includeSocialInsurance: boolean;
  }[];

  // 勤務情報
  work: {
    isMainJob: boolean;
    transportMethod: string[];
  };

  // 口座情報
  bankAccount: {
    bankName: string;
    branchName: string;
    accountType: 'ordinary' | 'checking';  // 普通/当座
    accountHolder: string;
    accountNumber: string;
  };

  // 確認事項
  confirmations: {
    hourlyRate: boolean;
    paymentDate: boolean;
    workingHours: boolean;
    transportAllowance: boolean;
  };
}

// 資格の選択肢
export const QUALIFICATION_OPTIONS = [
  '介護福祉士',
  '介護職員初任者研修',
  '介護職員実務者研修',
  '同行援護従事者',
  '行動援護従事者',
  '重度訪問介護従事者',
  'その他'
];

// 扶養親族の状況選択肢
export const DEPENDENT_CONDITIONS = [
  '障害者',
  '特別障害者',
  '同居老親等',
  '特定扶養親族（19～22歳）'
];

// 交通手段の選択肢
export const TRANSPORT_METHODS = [
  '公共交通機関',
  '自転車',
  '徒歩',
  '自家用車',
  'バイク'
];

// 寡婦控除の選択肢
export const WIDOW_DEDUCTION_OPTIONS = [
  'なし',
  '寡婦',
  'ひとり親'
];

// 初期値
export const initialEmployeeFormData: EmployeeFormData = {
  basic: {
    name: '',
    nameKana: '',
    birthDate: '',
    postalCode: '',
    address: '',
    phone: '',
    email: ''
  },
  qualifications: {
    selected: [],
    certificates: []
  },
  employment: {
    myNumber: '',
    myNumberFrontUrl: '',
    myNumberBackUrl: '',
    employmentInsuranceNumber: '',
    previousCompany: '',
    previousCompanyPeriod: ''
  },
  spouse: {
    hasSpouse: false,
    includeSocialInsurance: false
  },
  taxInfo: {
    isStudent: false,
    hasDisabilityCard: false,
    widowDeduction: 'なし',
    hasDependents: false
  },
  dependents: [],
  work: {
    isMainJob: true,
    transportMethod: []
  },
  bankAccount: {
    bankName: '',
    branchName: '',
    accountType: 'ordinary',
    accountHolder: '',
    accountNumber: ''
  },
  confirmations: {
    hourlyRate: false,
    paymentDate: false,
    workingHours: false,
    transportAllowance: false
  },
  status: 'pending'
};
