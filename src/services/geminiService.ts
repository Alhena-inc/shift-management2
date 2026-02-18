/**
 * AI API サービス
 * Supabase Edge Function経由でClaude APIを使った文章生成機能を提供
 */

import { supabase } from '../lib/supabase';

export interface GeminiResponse {
  text: string;
  error?: string;
}

/**
 * Edge Function経由でClaude APIにテキスト生成リクエストを送信
 */
export async function generateText(prompt: string, systemInstruction?: string): Promise<GeminiResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      return { text: '', error: 'ログインが必要です' };
    }

    const projectUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${projectUrl}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt, systemInstruction }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      try {
        const errJson = JSON.parse(errBody);
        return { text: '', error: errJson.error || `API エラー (${res.status})` };
      } catch {
        return { text: '', error: `API エラー (${res.status}): ${errBody}` };
      }
    }

    const data = await res.json();
    if (data.error) {
      return { text: '', error: data.error };
    }
    return { text: data.text || '' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '', error: `AI API 通信エラー: ${msg}` };
  }
}

/**
 * ファイル（画像・PDF等）付きでClaude APIにリクエストを送信
 * URLからfetchしてbase64に変換して送る
 */
export async function generateWithFiles(
  prompt: string,
  fileUrls: string[],
  systemInstruction?: string
): Promise<GeminiResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      return { text: '', error: 'ログインが必要です' };
    }

    const files: Array<{ type: string; mimeType: string; data: string }> = [];

    for (const url of fileUrls) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.readAsDataURL(blob);
        });

        const mimeType = blob.type || 'application/pdf';
        const isImage = mimeType.startsWith('image/');
        files.push({
          type: isImage ? 'image' : 'document',
          mimeType,
          data: base64,
        });
      } catch {
        // ファイル取得失敗はスキップ
      }
    }

    const projectUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${projectUrl}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt, systemInstruction, files }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      try {
        const errJson = JSON.parse(errBody);
        return { text: '', error: errJson.error || `API エラー (${res.status})` };
      } catch {
        return { text: '', error: `API エラー (${res.status}): ${errBody}` };
      }
    }

    const data = await res.json();
    if (data.error) {
      return { text: '', error: data.error };
    }
    return { text: data.text || '' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '', error: `AI API 通信エラー: ${msg}` };
  }
}

/**
 * AI機能が利用可能か確認（常にtrue — Edge Function経由のため）
 */
export function isGeminiAvailable(): boolean {
  return true;
}
