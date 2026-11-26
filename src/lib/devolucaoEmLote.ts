/**
 * Devolução de vários itens de uma vez (ex.: volta das bebidas do churrasco).
 *
 * Para cada linha: saiu X, voltou Y (digitado) → lança X − Y. Linha em branco
 * ou com zero não entra. A conta é a mesma do banco (AJUSTE_06): a volta é na
 * unidade da entrega e não pode passar do que saiu.
 */

/** "1,2" ou "1.2" → 1.2; vazio → NaN. No celular a vírgula é o que se digita. */
export const lerQuantidade = (texto: string): number => {
  const t = (texto ?? "").trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

const arredondar = (n: number) => Math.round(n * 1000) / 1000;

export type LinhaDaVolta = {
  id: string;
  /** O que ainda conta como saída (entregue menos o que já voltou). */
  saiu: number;
};

export type ResultadoDaLinha = {
  id: string;
  saiu: number;
  voltou: number;
  /** O que vai para o TOTVS depois desta volta. */
  lanca: number;
  /** Texto do problema, quando há. */
  erro?: string;
};

export function calcularVolta(linhas: LinhaDaVolta[], digitado: Record<string, string>) {
  const resultado: ResultadoDaLinha[] = linhas.map((l) => {
    const texto = (digitado[l.id] ?? "").trim();
    const voltou = texto ? lerQuantidade(texto) : 0;
    if (texto && (!Number.isFinite(voltou) || voltou < 0)) {
      return { id: l.id, saiu: l.saiu, voltou: 0, lanca: l.saiu, erro: "Número inválido" };
    }
    if (voltou > l.saiu + 1e-9) {
      return { id: l.id, saiu: l.saiu, voltou, lanca: l.saiu, erro: `Máximo ${l.saiu}` };
    }
    return { id: l.id, saiu: l.saiu, voltou, lanca: arredondar(l.saiu - voltou) };
  });
  const aRegistrar = resultado.filter((r) => !r.erro && r.voltou > 0);
  const comErro = resultado.filter((r) => !!r.erro);
  return {
    linhas: resultado,
    /** Só as que voltaram algo e estão certas: uma devolução para cada. */
    aRegistrar: aRegistrar.map((r) => ({ id: r.id, quantidade: arredondar(r.voltou) })),
    comErro: comErro.length,
    valido: aRegistrar.length > 0 && comErro.length === 0,
  };
}
