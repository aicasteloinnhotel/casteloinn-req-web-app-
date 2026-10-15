import { ChevronDown, Sparkles } from "lucide-react";
import { APP } from "@/lib/sobre";
import { ROTULO_TIPO, TipoMudanca, versoesPara } from "@/lib/novidades";

const COR_TIPO: Record<TipoMudanca, string> = {
  novo: "bg-teal-50 text-teal-800 border-teal-200",
  melhoria: "bg-sky-50 text-sky-800 border-sky-200",
  correcao: "bg-amber-50 text-amber-800 border-amber-200",
};

/** Singular e plural do resumo ("1 novidade", "14 novidades"). */
const CONTAGEM: Record<TipoMudanca, [string, string]> = {
  novo: ["novidade", "novidades"],
  melhoria: ["melhoria", "melhorias"],
  correcao: ["correção", "correções"],
};

/**
 * "O que mudou": linha do tempo das versões, da mais nova para a mais antiga.
 * A versão instalada vem aberta e marcada; as outras abrem com um toque
 * (<details>, sem estado: funciona com teclado e leitor de tela).
 */
export function HistoricoDeVersoes({ ehAlmoxarifado }: { ehAlmoxarifado: boolean }) {
  const versoes = versoesPara(ehAlmoxarifado);
  if (versoes.length === 0) return null;

  const total = { novo: 0, melhoria: 0, correcao: 0 } as Record<TipoMudanca, number>;
  for (const v of versoes) for (const m of v.mudancas) total[m.tipo] += 1;
  const primeira = versoes[versoes.length - 1];
  const indiceAtual = Math.max(0, versoes.findIndex((v) => v.versao === APP.versao));

  return (
    <section id="novidades" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">O que mudou</h2>
          <p className="text-sm text-slate-600">
            {versoes.length} versões desde {primeira.data}, quando o pedido em papel acabou.
          </p>
        </div>
      </div>

      {/* Resumo: o tamanho da evolução numa linha. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(total) as TipoMudanca[])
          .filter((t) => total[t] > 0)
          .map((t) => (
            <span key={t} className={`rounded-md border px-2 py-0.5 text-xs font-bold ${COR_TIPO[t]}`}>
              {total[t]} {total[t] === 1 ? CONTAGEM[t][0] : CONTAGEM[t][1]}
            </span>
          ))}
      </div>

      <ol className="mt-4 ml-1.5 border-l-2 border-slate-100">
        {versoes.map((v, i) => {
          const atual = i === indiceAtual;
          return (
            <li key={v.versao} className="relative pb-3 pl-5 last:pb-0">
              <span
                aria-hidden="true"
                className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ${
                  atual ? "bg-teal-600 ring-4 ring-teal-100" : "bg-slate-300"
                }`}
              />
              <details open={atual} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg py-0.5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-black text-slate-900 tabular-nums">{v.versao}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{v.data}</span>
                      {atual && (
                        <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          versão atual
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm font-semibold leading-snug text-slate-700">{v.titulo}</span>
                  </span>
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="mt-2 space-y-2">
                  {v.mudancas.map((m, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm leading-snug text-slate-700">
                      <span
                        className={`mt-px w-[4.5rem] shrink-0 rounded-md border py-0.5 text-center text-[11px] font-bold ${COR_TIPO[m.tipo]}`}
                      >
                        {ROTULO_TIPO[m.tipo]}
                      </span>
                      <span className="min-w-0">{m.texto}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
