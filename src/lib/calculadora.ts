/**
 * A conta da mini calculadora do lançamento (sem `eval`): só números e
 * + − × ÷, com × e ÷ antes de + e −. A expressão usa ponto decimal e os
 * sinais do teclado: "6*12.5-3".
 */
export type Op = "+" | "-" | "*" | "/";
export const OPS: Op[] = ["+", "-", "*", "/"];
export const SIMBOLO: Record<Op, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
/**
 * Número como texto simples, com ponto ("0.0000001", nunca "1e-7"): é o que
 * volta para a conta e, trocando o ponto por vírgula, o que vai para o TOTVS.
 */
export function numeroParaTexto(n: number): string {
  const texto = n.toFixed(9).replace(/\.?0+$/, "");
  return texto === "-0" ? "0" : texto;
}

/** Conta a expressão (só números e + − × ÷), com × e ÷ antes de + e −. */
export function calcular(expr: string): number | null {
  const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-*/]/g);
  if (!tokens || tokens.join("") !== expr) return null;
  // Sinal no começo: "-5+3".
  if (tokens[0] === "-" && tokens.length > 1 && !OPS.includes(tokens[1] as Op)) {
    tokens.splice(0, 2, String(-Number(tokens[1])));
  }
  const numeros: number[] = [];
  const operadores: Op[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (i % 2 === 0) {
      if (OPS.includes(t as Op)) return null;
      numeros.push(Number(t));
    } else {
      if (!OPS.includes(t as Op)) return null;
      operadores.push(t as Op);
    }
  }
  if (numeros.length !== operadores.length + 1) return null; // termina em operador
  // × e ÷ primeiro.
  const n = [numeros[0]];
  const o: Op[] = [];
  for (let i = 0; i < operadores.length; i++) {
    const op = operadores[i];
    const prox = numeros[i + 1];
    if (op === "*") n[n.length - 1] *= prox;
    else if (op === "/") {
      if (prox === 0) return null;
      n[n.length - 1] /= prox;
    } else {
      n.push(prox);
      o.push(op);
    }
  }
  let total = n[0];
  for (let i = 0; i < o.length; i++) total = o[i] === "+" ? total + n[i + 1] : total - n[i + 1];
  if (!Number.isFinite(total)) return null;
  return Math.round(total * 1e9) / 1e9; // tira o 0,30000000004
}
