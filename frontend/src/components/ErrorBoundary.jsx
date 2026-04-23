import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container flex-center">
          <div className="glass-panel error-box">
            <AlertTriangle size={64} className="error-icon" />
            <h1 className="text-gradient">Something went wrong</h1>
            <p className="subtitle">An unexpected error occurred in the application.</p>
            <div className="error-details">
              <details style={{ whiteSpace: 'pre-wrap' }}>
                <summary>Click for error details</summary>
                {this.state.error && this.state.error.toString()}
                <br />
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </details>
            </div>
            <button 
              className="btn-primary" 
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={20} /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
