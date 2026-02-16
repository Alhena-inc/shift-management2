/**
 * Gemini API サービス
 * Google Gemini を使った文章生成機能を提供
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface GeminiResponse {
  text: string;
  error?: string;
}

/**
 * Gemini APIにテキスト生成リクエストを送信
 */
export async function generateText(prompt: string, systemInstruction?: string): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY) {
    return { text: '', error: 'Gemini APIキーが設定されていません（VITE_GEMINI_API_KEY）' };
  }

  try {
    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { text: '', error: `Gemini API エラー (${res.status}): ${errBody}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '', error: `Gemini API 通信エラー: ${msg}` };
  }
}

/**
 * Gemini APIキーが設定されているか確認
 */
export function isGeminiAvailable(): boolean {
  return !!GEMINI_API_KEY;
}
