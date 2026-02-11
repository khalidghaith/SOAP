import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-4 bg-red-50 text-red-900 rounded-lg border border-red-200 m-4">
                    <h2 className="text-lg font-bold mb-2">Something went wrong.</h2>
                    <details className="whitespace-pre-wrap text-sm font-mono bg-white p-2 rounded border border-red-100 overflow-auto max-h-96">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
