import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sem isso, qualquer exceção não tratada durante o render (ex.: um campo
// Decimal chegando como string onde se esperava number) desmonta a árvore
// inteira do React e deixa a tela em branco, sem nenhuma mensagem visível.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro não tratado capturado pelo ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Ocorreu um erro inesperado</h1>
          <p className="max-w-md text-sm text-slate-500">
            Algo deu errado ao carregar esta página. Tente recarregar; se o problema continuar, avise a equipe
            responsável com os detalhes abaixo.
          </p>
          <pre className="max-w-md overflow-x-auto rounded border border-slate-200 bg-white p-3 text-left text-xs text-slate-600">
            {this.state.error.message}
          </pre>
          <Button onClick={() => window.location.reload()}>Recarregar página</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
