import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
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
            return (
                <div className="min-h-screen bg-slate-950 text-red-500 p-8 flex flex-col items-center justify-center text-center">
                    <h1 className="text-3xl font-black mb-4">Something went wrong.</h1>
                    <p className="text-slate-400 mb-8 max-w-lg">
                        The application encountered a critical error. Please share the details below with the developer.
                    </p>
                    <div className="bg-slate-900 p-6 rounded-xl border border-red-500/20 text-left overflow-auto max-w-full w-full md:w-2/3 max-h-[60vh] custom-scrollbar">
                        <p className="font-mono font-bold text-red-400 mb-2">
                            {this.state.error?.toString()}
                        </p>
                        <pre className="font-mono text-xs text-slate-500 whitespace-pre-wrap">
                            {this.state.errorInfo?.componentStack}
                        </pre>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
