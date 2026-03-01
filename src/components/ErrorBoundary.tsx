'use client';

import { Component, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  moduleName?: string;
};

type State = {
  hasError: boolean;
  errorMessage: string;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const name = this.props.moduleName ?? 'Modulul';
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-10 bg-white rounded-[30px] shadow text-center">
          <div className="text-4xl">⚠️</div>
          <p className="text-slate-800 font-bold text-lg">
            {name} a întâmpinat o eroare
          </p>
          <p className="text-slate-500 text-sm">
            Te rugăm să reîncărcați pagina.{' '}
            <span className="italic">({this.state.errorMessage})</span>
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="mt-2 px-6 py-2 bg-pink-500 text-white rounded-full font-bold text-sm hover:bg-pink-600 transition"
          >
            Reîncearcă
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
