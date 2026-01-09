"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Algo salió mal</h2>
            <p className="text-muted-foreground">
              Ha ocurrido un error inesperado. Por favor, intente de nuevo o contacte al soporte si el problema persiste.
            </p>
            {this.state.error && (
              <details className="text-sm text-muted-foreground bg-muted p-3 rounded-md w-full">
                <summary className="cursor-pointer">Detalles del error</summary>
                <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <Button onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Intentar de nuevo
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook-based error boundary wrapper for easier use
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
