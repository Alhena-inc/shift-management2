import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('エラーバウンダリがエラーをキャッチしました:', error);
    console.error('エラー詳細:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{ padding: '20px', backgroundColor: '#fef2f2', border: '1px solid #dc2626', borderRadius: '8px', margin: '20px' }}>
            <h2 style={{ color: '#dc2626' }}>⚠️ エラーが発生しました</h2>
            <p style={{ color: '#7f1d1d' }}>画面の表示中にエラーが発生しました。</p>
            <p style={{ color: '#7f1d1d' }}>ページをリロードしてください。</p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              ページをリロード
            </button>
            {this.state.error && (
              <details style={{ marginTop: '10px' }}>
                <summary style={{ cursor: 'pointer', color: '#7f1d1d' }}>エラーの詳細</summary>
                <pre style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fecaca', borderRadius: '4px', fontSize: '12px', overflow: 'auto' }}>
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}