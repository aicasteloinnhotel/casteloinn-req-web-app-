import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addHistorico, addRequisicaoItem, getItens } from "@/services/api";
import { contemTexto, formatItemName } from "@/lib/utils";
import { formatarQtd, unidadesDoItem } from "@/lib/unidades";
import { toast } from "@/lib/toast";
import { Item, Requisicao } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Adicionar um item numa requisição JÁ ENTREGUE e ainda não lançada no TOTVS
 * (mandou um item que não estava no pedido). Entra uma linha nova com pedido 0
 * e entregue X, igual ao item incluído durante a separação, e o histórico
 * guarda quem incluiu, o quê e por quê.
 *
 * Trocar um item = devolver o errado (botão ao lado) + adicionar o certo aqui.
 * Depois de lançada no TOTVS, nada disto aparece (como a devolução).
 */

/** "1,2" ou "1.2" → 1.2. */
const lerQuantidade = (texto: string): number => {
  const t = texto.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

const MOTIVOS = ["Faltou no pedido", "Setor pediu a mais", "Troca de item errado"];

export function AdicionarItemEntregue({
  req,
  usuarioId,
  aberto,
  aoFechar,
  aoConcluir,
}: {
  req: Requisicao;
  usuarioId: string;
  aberto: boolean;
  aoFechar: () => void;
  aoConcluir: () => Promise<void> | void;
}) {
  const [catalogo, setCatalogo] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<Item | null>(null);
  const [unidade, setUnidade] = useState("");
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setBusca("");
    setNovo(null);
    setUnidade("");
    setQtd("");
    setMotivo("");
    if (catalogo.length === 0) {
      getItens()
        .then((itens) => setCatalogo(itens.filter((i) => i.ativo)))
        .catch(() => toast.error("Não foi possível carregar a lista de materiais."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const encontrados = useMemo(
    () => (busca.trim() ? catalogo.filter((i) => contemTexto(i.nome, busca)).slice(0, 40) : []),
    [busca, catalogo],
  );

  const escolher = (item: Item) => {
    setNovo(item);
    const unidades = unidadesDoItem(item);
    setUnidade(unidades.length === 1 ? unidades[0] : "");
    setBusca("");
  };

  const quantidade = lerQuantidade(qtd);
  const valido = !!novo && !!unidade && quantidade > 0 && motivo.trim().length >= 3;

  const confirmar = async () => {
    if (!valido || !novo) return;
    setSalvando(true);
    try {
      // Pode ter sido lançada por outra pessoa enquanto a janela estava aberta.
      const { data: atual, error: erroLeitura } = await supabase
        .from("requisicoes")
        .select("status, lancado")
        .eq("id", req.id)
        .single();
      if (erroLeitura) throw erroLeitura;
      if (atual?.lancado) {
        throw new Error("Esta requisição acabou de ser lançada no TOTVS: não dá mais para adicionar itens.");
      }
      if (atual?.status !== "FINALIZADA" && atual?.status !== "RUPTURA_PARCIAL") {
        throw new Error("Esta requisição mudou de situação. Recarregue a tela.");
      }

      const nome = formatItemName(novo.nome) || "Item";
      await addRequisicaoItem({
        requisicao_id: req.id,
        item_id: novo.id,
        quantidade: 0,
        quantidade_separada: quantidade,
        unidade,
        unidade_separada: unidade,
      });
      await addHistorico(
        req.id,
        "ITEM_INCLUIDO_APOS_ENTREGA",
        usuarioId,
        `Item: ${nome} | Entregue: ${formatarQtd(quantidade)} ${unidade} | Motivo: ${motivo.trim()}`,
      );
      toast.success(`${nome} adicionado à requisição.`);
      aoFechar();
      await aoConcluir();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível adicionar o item.");
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = "text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a && !salvando) aoFechar(); }}>
      <DialogContent className="sm:max-w-md w-[94vw] max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 border-b bg-slate-50 shrink-0 pr-10">
          <DialogTitle className="flex items-center gap-2 text-teal-900 font-bold">
            <PackagePlus className="h-5 w-5 shrink-0" /> Adicionar item entregue
          </DialogTitle>
          <DialogDescription>
            REQ #{req.codigo_requisicao}, já entregue. Fica registrado no histórico.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label htmlFor="adicionar-busca" className={rotulo}>Item</label>
            {novo ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
                <span className="text-sm font-bold text-teal-900 uppercase [overflow-wrap:anywhere]">{formatItemName(novo.nome)}</span>
                <button
                  type="button"
                  onClick={() => { setNovo(null); setUnidade(""); }}
                  className="shrink-0 text-xs font-bold text-teal-700 underline underline-offset-2"
                >
                  trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    id="adicionar-busca"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar material..."
                    autoComplete="off"
                    className="w-full h-11 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                {encontrados.length > 0 && (
                  <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                    {encontrados.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => escolher(i)}
                          className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-teal-50"
                        >
                          {formatItemName(i.nome)}
                          <span className="ml-2 text-xs font-normal text-slate-500">{unidadesDoItem(i).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {busca.trim() && encontrados.length === 0 && catalogo.length > 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">Nenhum material encontrado.</p>
                )}
              </>
            )}
          </div>

          {novo && (
            <div>
              <label htmlFor="adicionar-qtd" className={rotulo}>Quantidade entregue</label>
              <div className="flex items-center gap-2">
                <input
                  id="adicionar-qtd"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0"
                  className="h-11 w-28 rounded-lg border border-slate-300 bg-white px-3 text-lg font-black text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <select
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  aria-label="Unidade"
                  className="h-11 w-28 rounded-lg border border-slate-300 bg-white px-2 text-base font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="" disabled>Unid.</option>
                  {unidadesDoItem(novo).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="adicionar-motivo" className={rotulo}>Motivo</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                    motivo === m
                      ? "border-teal-400 bg-teal-100 text-teal-900"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <textarea
              id="adicionar-motivo"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: setor pediu mais 2 pacotes no balcão"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {valido && novo && (
            <p className="text-xs text-teal-900 bg-teal-50 border border-teal-200 rounded-lg p-2.5">
              Entra <strong>{formatItemName(novo.nome)} {formatarQtd(quantidade)} {unidade}</strong> como entregue.
              É o que vai para o TOTVS.
            </p>
          )}
        </div>

        <div className="p-4 border-t bg-white shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={aoFechar} disabled={salvando} className="font-bold h-11">
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!valido || salvando}
            className="font-bold h-11 bg-teal-600 hover:bg-teal-700 text-white"
          >
            {salvando ? "Adicionando..." : "Adicionar item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
