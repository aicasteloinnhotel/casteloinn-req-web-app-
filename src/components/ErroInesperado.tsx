import React from "react";

/**
 * Última rede de segurança do app.
 *
 * Sem ela, qualquer erro inesperado numa tela deixava o sistema inteiro em
 * branco, sem saída para quem não sabe recarregar a página — e no app
 * instalado nem existe botão de recarregar.
 */
export class ErroInesperado extends React.Component<
  { children: React.ReactNode },
  { erro: Error | null }
> {
  state: { erro: Error | null } = { erro: null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error("Erro inesperado na tela:", erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-teal-900">Algo deu errado nesta tela</h1>
          <p className="text-sm text-slate-600">
            O que já estava salvo continua salvo. Toque abaixo para recarregar o sistema.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
