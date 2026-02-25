import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          gap: '1rem',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '2rem' }}>⚠️</p>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Etwas ist schiefgelaufen</h2>
          <p style={{ fontSize: '0.875rem', color: '#666', maxWidth: '320px' }}>
            Die App ist auf einen unerwarteten Fehler gestoßen. Deine Daten sind sicher.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: '#1a1a2e',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            App neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
