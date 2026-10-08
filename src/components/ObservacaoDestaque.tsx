import React, { useEffect, useState } from "react";
import { MessageSquareWarning, PenLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Observação da requisição, em destaque e no topo. Fica acima de tudo porque
 * é onde vem o aviso que evita erro ("entregar só amanhã", "a carne é para o
 * evento"). Antes ela ficava no fim da página, depois de todos os itens.
 *
 * Com `aoSalvar`, dá para editar ali mesmo — e, sem observação, aparece só
 * um "Adicionar observação" discreto no lugar da caixa.
 */
export function ObservacaoDestaque({
  observacao,
  compacto = false,
  className = "",
  aoSalvar,
}: {
  observacao?: string | null;
  /** Separação: menor e com rolagem própria, para não tomar a lista de itens. */
  compacto?: boolean;
  className?: string;
  /** Quem pode editar recebe o lápis. Rejeitar a promessa mantém o texto aberto. */
  aoSalvar?: (texto: string) => Promise<void>;
}) {
  const texto = (observacao || "").trim();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(texto);
  const [salvando, setSalvando] = useState(false);

  // Mudou no banco (outro aparelho) enquanto não está editando: acompanha.
  useEffect(() => {
    if (!editando) setRascunho(texto);
  }, [texto, editando]);

  const salvar = async () => {
    if (!aoSalvar) return;
    setSalvando(true);
    try {
      await aoSalvar(rascunho.trim());
      setEditando(false);
    } catch {
      // Quem chamou já avisou o erro; o texto continua aberto para tentar de novo.
    } finally {
      setSalvando(false);
    }
  };

  if (editando) {
    return (
      <div className={`rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3 ${className}`}>
        <label htmlFor="editar-observacao" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800">
          <MessageSquareWarning className="h-4 w-4 shrink-0" /> Observação
        </label>
        <textarea
          id="editar-observacao"
          rows={3}
          autoFocus
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          placeholder="Ex.: entregar só amanhã de manhã; a carne é para o evento"
          className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-base text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => { setRascunho(texto); setEditando(false); }}
            disabled={salvando}
            className="h-10 font-bold bg-white"
          >
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={salvando || rascunho.trim() === texto}
            className="h-10 font-bold bg-amber-600 hover:bg-amber-700 text-white"
          >
            {salvando ? "Salvando..." : "Salvar observação"}
          </Button>
        </div>
      </div>
    );
  }

  if (!texto) {
    if (!aoSalvar) return null;
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition-colors print:hidden ${className}`}
      >
        <Plus className="h-4 w-4" /> Adicionar observação
      </button>
    );
  }

  return (
    <div
      role="note"
      aria-label="Observação"
      className={`rounded-xl border-2 border-amber-300 bg-amber-50 ${
        compacto ? "px-3 py-2 max-h-28 overflow-y-auto overscroll-contain" : "p-4"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800">
          <MessageSquareWarning className="h-4 w-4 shrink-0" /> Observação
        </p>
        {aoSalvar && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-amber-300 bg-white text-xs font-bold text-amber-900 hover:bg-amber-100 print:hidden"
          >
            <PenLine className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>
      <p
        className={`mt-1 whitespace-pre-line [overflow-wrap:anywhere] font-semibold text-amber-950 ${
          compacto ? "text-sm leading-snug" : "text-base leading-relaxed"
        }`}
      >
        {texto}
      </p>
    </div>
  );
}
