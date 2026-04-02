import { getLineLoginUrl } from '@/lib/line/auth'
import { randomBytes } from 'crypto'

export default function LoginPage() {
  // Generate state for CSRF protection
  const state = randomBytes(16).toString('hex')
  const lineLoginUrl = getLineLoginUrl(state)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-primary to-primary-dark">
      {/* Logo Area */}
      <div className="text-center mb-12">
        <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🏠</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          のあスタッフポータル
        </h1>
        <p className="text-white/70 text-sm">
          訪問介護事業所のあ
        </p>
      </div>

      {/* LINE Login Button */}
      <a
        href={lineLoginUrl}
        className="w-full max-w-[280px] flex items-center justify-center gap-3
                   bg-[#06C755] text-white font-bold py-4 px-6 rounded-xl
                   active:scale-[0.98] transition-transform duration-100
                   shadow-lg shadow-[#06C755]/30"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        LINEでログイン
      </a>

      <p className="text-white/40 text-xs mt-8 text-center">
        ログインにはLINEアカウントが必要です
      </p>
    </div>
  )
}
