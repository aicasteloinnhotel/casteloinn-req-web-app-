/**
 * Filtros da lista de requisições, guardados enquanto a pessoa está no menu
 * Requisições: entrar numa requisição e voltar, ou apertar F5, não perde o
 * filtro. Ao ir para outro menu (ou sair do app) eles são esquecidos.
 *
 * sessionStorage, e não localStorage: é por aba e some ao fechar o app, então
 * um filtro esquecido não aparece aplicado dias depois.
 */

export type FiltrosRequisicoes = {
  status: string;
  lancamento: string;
  departamento: string;
  dataInicial: string;
  dataFinal: string;
  painelAberto: boolean;
};

const PREFIXO = "filtros_requisicoes:";

/** Rotas que fazem parte do menu Requisições (lista, detalhe, separação, nova). */
export const ehMenuRequisicoes = (caminho: string) =>
  caminho === "/requisicoes" || caminho.startsWith("/requisicoes/");

// Por usuário: no mesmo aparelho, quem entra depois não herda o filtro de quem saiu.
export const lerFiltros = (usuarioId?: string): Partial<FiltrosRequisicoes> => {
  if (!usuarioId) return {};
  try {
    const bruto = sessionStorage.getItem(PREFIXO + usuarioId);
    const dados = bruto ? JSON.parse(bruto) : null;
    return dados && typeof dados === "object" ? dados : {};
  } catch {
    return {};
  }
};

export const salvarFiltros = (usuarioId: string | undefined, filtros: FiltrosRequisicoes) => {
  if (!usuarioId) return;
  try {
    sessionStorage.setItem(PREFIXO + usuarioId, JSON.stringify(filtros));
  } catch {
    // Navegador sem armazenamento (aba anônima restrita): só não lembra.
  }
};

export const esquecerFiltros = () => {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIXO))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // idem
  }
};
