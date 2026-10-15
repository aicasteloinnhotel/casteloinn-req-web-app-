import React, { useEffect, useRef, useState } from "react";
import { Calculator, Copy, Delete } from "lucide-react";
import { toast } from "@/lib/toast";
import { calcular, numeroParaTexto, OPS, SIMBOLO, type Op } from "@/lib/calculadora";

/**
 * Mini calculadora do lançamento no TOTVS.
 *
 * Existe para não sair do ALT+TAB entre o TOTVS e o app só para abrir a
 * calculadora do Windows. Pensada para o teclado: números, + − × ÷, vírgula
 * ou ponto, Enter dá o resultado, Backspace apaga, Esc ou Delete zera. O
 * resultado copia com vírgula e sem ponto de milhar, pronto para colar no
 * TOTVS. A fita guarda as últimas contas (também entre uma requisição e
 * outra) e um clique numa delas reaproveita o resultado.
 */

const CHAVE_FITA = "calculadora_fita";
const TAMANHO_FITA = 6;

interface Conta {
  expressao: string;
  resultado: number;
}

/** Para mostrar: 1.234,5 */
const mostrar = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
/** Para colar no TOTVS: 1234,5 (sem ponto de milhar). */
const paraCopiar = (n: number) => numeroParaTexto(n).replace(".", ",");
/** A expressão como a pessoa lê: 6 × 12,5 */
const legivel = (expr: string) =>
  expr
    .replace(/[+\-*/]/g, (c) => ` ${SIMBOLO[c as Op]} `)
    .replace(/\./g, ",")
    .trim();

function lerFita(): Conta[] {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FITA) || "[]");
    return Array.isArray(salvo) ? salvo.slice(0, TAMANHO_FITA) : [];
  } catch {
    return [];
  }
}

/**
 * Um botão do teclado da calculadora. Fora do componente de propósito: dentro
 * dele, o botão era recriado a cada toque (outro tipo de componente a cada
 * render) e um clique rápido podia cair no botão que acabou de sumir.
 */
function Tecla({
  children,
  onClick,
  focar,
  className = "",
  rotulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  /** Devolve o foco ao painel, para o teclado continuar funcionando. */
  focar: () => void;
  className?: string;
  rotulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        focar();
      }}
      aria-label={rotulo}
      tabIndex={-1}
      className={`h-11 rounded-lg text-lg font-bold transition-colors active:scale-95 ${className || "bg-white border border-slate-200 text-slate-800 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

export function MiniCalculadora() {
  const [expr, setExpr] = useState("");
  const [acabouDeCalcular, setAcabouDeCalcular] = useState(false);
  const [fita, setFita] = useState<Conta[]>(lerFita);
  const painel = useRef<HTMLDivElement>(null);

  // Abre já recebendo o teclado.
  useEffect(() => {
    painel.current?.focus();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FITA, JSON.stringify(fita));
    } catch {
      /* sem armazenamento: a fita só não sobrevive */
    }
  }, [fita]);

  const ultimoNumero = expr.split(/[+\-*/]/).pop() || "";
  // Resultado ao vivo. Com a conta terminando num sinal ("6 ×"), mostra o
  // que já dá para calcular antes dele.
  const previa = expr === "" ? 0 : calcular(expr) ?? calcular(expr.replace(/[+\-*/]$/, ""));

  const digito = (d: string) => {
    if (acabouDeCalcular) {
      setExpr(d);
      setAcabouDeCalcular(false);
      return;
    }
    // "0" sozinho vira o dígito novo (07 → 7).
    if (ultimoNumero === "0") setExpr(expr.slice(0, -1) + d);
    else setExpr(expr + d);
  };

  const virgula = () => {
    if (acabouDeCalcular) {
      setExpr("0.");
      setAcabouDeCalcular(false);
      return;
    }
    if (ultimoNumero.includes(".")) return;
    setExpr(expr + (ultimoNumero === "" ? "0." : "."));
  };

  const operador = (op: Op) => {
    setAcabouDeCalcular(false);
    if (expr === "") {
      if (op === "-") setExpr("-");
      return;
    }
    const ultimo = expr.slice(-1);
    if (OPS.includes(ultimo as Op)) {
      if (expr.length === 1) return; // só o "-" do começo
      setExpr(expr.slice(0, -1) + op); // troca o operador
    } else {
      setExpr(expr.replace(/\.$/, "") + op);
    }
  };

  const apagar = () => {
    setAcabouDeCalcular(false);
    setExpr(expr.slice(0, -1));
  };

  const zerar = () => {
    setAcabouDeCalcular(false);
    setExpr("");
  };

  const igual = () => {
    // Enter com a conta terminando num sinal ("6 × 3 ×"): ignora o sinal solto.
    const conta = expr.length > 1 ? expr.replace(/[+\-*/]$/, "") : expr;
    const r = calcular(conta);
    if (r === null) {
      if (/\/0(\.0*)?([+\-*/]|$)/.test(conta)) toast.error("Não dá para dividir por zero.");
      return;
    }
    if (OPS.some((op) => conta.slice(1).includes(op))) {
      setFita((f) => [{ expressao: conta, resultado: r }, ...f].slice(0, TAMANHO_FITA));
    }
    setExpr(numeroParaTexto(r));
    setAcabouDeCalcular(true);
  };

  const copiar = async (n: number | null) => {
    if (n === null) return;
    try {
      await navigator.clipboard.writeText(paraCopiar(n));
      toast.success(`${paraCopiar(n)} copiado. É só colar no TOTVS.`, { id: "calc-copia" });
    } catch {
      toast.error("O navegador não liberou a cópia.");
    }
  };

  const reaproveitar = (n: number) => {
    setExpr(numeroParaTexto(n));
    setAcabouDeCalcular(true);
    focar();
  };

  const teclado = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) digito(k);
    else if (k === "," || k === ".") virgula();
    else if (k === "+" || k === "-") operador(k);
    else if (k === "*" || k === "x" || k === "X") operador("*");
    else if (k === "/") operador("/");
    else if (k === "Enter" || k === "=") igual();
    else if (k === "Backspace") apagar();
    else if (k === "Delete" || k === "Escape") {
      // Esc zera a conta em vez de fechar a janela do lançamento.
      if (k === "Escape" && expr === "") return; // vazia: deixa o Esc fechar a janela
      zerar();
    } else if ((e.ctrlKey || e.metaKey) && (k === "c" || k === "C")) {
      if (window.getSelection()?.toString()) return; // texto selecionado: cópia normal
      copiar(previa);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const focar = () => painel.current?.focus();

  return (
    <div
      ref={painel}
      tabIndex={0}
      onKeyDown={teclado}
      aria-label="Calculadora. Use o teclado: números, + − × ÷, Enter para o resultado."
      className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
    >
      {/* Sem X próprio: ela fecha pelo botão "Calculadora" do rodapé. Fica à
          esquerda da janela, longe do X que fecha o lançamento inteiro. */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white p-4 shrink-0">
        <Calculator className="h-5 w-5 text-teal-700" />
        <p className="flex-1 font-bold text-teal-900">Calculadora</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Visor: a conta em cima, o resultado (ao vivo) grande embaixo. */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-right">
          <p className="min-h-5 text-sm text-slate-500 break-all tabular-nums">
            {legivel(expr) || " "}
          </p>
          <p className="mt-1 text-3xl font-black text-slate-900 break-all tabular-nums leading-tight">
            {previa === null ? "…" : mostrar(previa)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => copiar(previa)}
          disabled={previa === null}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 py-2 text-sm font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
        >
          <Copy className="h-4 w-4" /> Copiar resultado
        </button>

        <div className="grid grid-cols-4 gap-1.5">
          <Tecla focar={focar} onClick={zerar} rotulo="Zerar" className="bg-slate-200 text-slate-700 hover:bg-slate-300">C</Tecla>
          <Tecla focar={focar} onClick={apagar} rotulo="Apagar" className="bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center">
            <Delete className="h-5 w-5" />
          </Tecla>
          <Tecla focar={focar} onClick={() => operador("/")} rotulo="Dividir" className="bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100">÷</Tecla>
          <Tecla focar={focar} onClick={() => operador("*")} rotulo="Multiplicar" className="bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100">×</Tecla>
          {["7", "8", "9"].map((d) => <Tecla focar={focar} key={d} onClick={() => digito(d)}>{d}</Tecla>)}
          <Tecla focar={focar} onClick={() => operador("-")} rotulo="Menos" className="bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100">−</Tecla>
          {["4", "5", "6"].map((d) => <Tecla focar={focar} key={d} onClick={() => digito(d)}>{d}</Tecla>)}
          <Tecla focar={focar} onClick={() => operador("+")} rotulo="Mais" className="bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100">+</Tecla>
          {["1", "2", "3"].map((d) => <Tecla focar={focar} key={d} onClick={() => digito(d)}>{d}</Tecla>)}
          <Tecla focar={focar} onClick={igual} rotulo="Igual" className="row-span-2 h-auto bg-teal-600 text-white hover:bg-teal-700">=</Tecla>
          <Tecla focar={focar} onClick={() => digito("0")} className="col-span-2 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50">0</Tecla>
          <Tecla focar={focar} onClick={virgula} rotulo="Vírgula">,</Tecla>
        </div>

        {fita.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Últimas contas</p>
              <button
                type="button"
                onClick={() => setFita([])}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                limpar
              </button>
            </div>
            <ul className="space-y-1">
              {fita.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => reaproveitar(c.resultado)}
                    title="Usar este resultado"
                    className="w-full rounded-md px-2 py-1 text-right text-xs tabular-nums text-slate-600 hover:bg-white"
                  >
                    {legivel(c.expressao)} = <span className="font-bold text-slate-900">{mostrar(c.resultado)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] leading-snug text-slate-500">
          Dá para usar o teclado: números, + − × ÷, Enter = resultado, Esc zera. Ctrl+C copia o resultado.
        </p>
      </div>
    </div>
  );
}
