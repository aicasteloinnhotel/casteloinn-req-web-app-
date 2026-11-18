import React, { useEffect, useMemo, useState } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { CAMPO, SELETOR } from "@/lib/estilos";
import { UNIDADES_CADASTRO, formatarQtd } from "@/lib/unidades";
import {
  casarOrcamento,
  formatarReais,
  lerOrcamento,
  lerPreco,
  type Correspondencia,
  type Fornecedor,
  type LinhaCotacao,
} from "@/lib/cotacao";

const ROTULO = "text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

type CamposDaLinha = { nome: string | null; marca: string | null; unidade_compra: string | null; quantidade: number | null };

/**
 * Como o item vai na cotação: nome, marca, unidade e quantidade da compra.
 * Vale para todos os fornecedores desta cotação. O cadastro não muda.
 */
export function EditarLinhaCotacao({
  linha, aoFechar, aoSalvar,
}: {
  linha: LinhaCotacao | null;
  aoFechar: () => void;
  aoSalvar: (linha: LinhaCotacao, campos: CamposDaLinha | null) => void;
}) {
  const [nome, setNome] = useState("");
  const [marca, setMarca] = useState("");
  const [unidade, setUnidade] = useState("");
  const [quantidade, setQuantidade] = useState("");

  useEffect(() => {
    if (!linha) return;
    setNome(linha.nome);
    setMarca(linha.marca);
    setUnidade(linha.unidadeCompra);
    setQuantidade(formatarQtd(linha.quantidade));
  }, [linha]);

  const salvar = () => {
    if (!linha) return;
    const qtd = lerPreco(quantidade); // mesmo leitor: aceita 1,5 e 1.5
    if (typeof qtd !== "number" || qtd <= 0) {
      toast.error("Quantidade inválida.");
      return;
    }
    const n = nome.trim().toUpperCase();
    const u = unidade.trim().toUpperCase();
    if (!n || !u) {
      toast.error("Nome e unidade não podem ficar vazios.");
      return;
    }
    // Só guarda o que mudou; tudo igual ao original = sem edição.
    const campos: CamposDaLinha = {
      nome: n !== linha.nomeCadastro ? n : null,
      marca: marca.trim() || null,
      unidade_compra: u !== linha.unidade ? u : null,
      quantidade: qtd !== linha.quantidadeReposicao ? qtd : null,
    };
    const nada = !campos.nome && !campos.marca && !campos.unidade_compra && campos.quantidade == null;
    aoSalvar(linha, nada ? null : campos);
  };

  return (
    <Dialog open={!!linha} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Item da cotação</DialogTitle>
          <DialogDescription>
            Vale para todos os fornecedores desta cotação. O cadastro do item não muda.
          </DialogDescription>
        </DialogHeader>
        {linha && (
          <div className="space-y-4">
            <div>
              <label htmlFor="linha-nome" className={ROTULO}>Produto</label>
              <input id="linha-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
              {nome.trim().toUpperCase() !== linha.nomeCadastro.toUpperCase() && (
                <p className="mt-1 text-[11px] text-slate-500">No cadastro: {linha.nomeCadastro}</p>
              )}
            </div>
            <div>
              <label htmlFor="linha-marca" className={ROTULO}>Marca</label>
              <input id="linha-marca" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Qualquer" className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="linha-qtd" className={ROTULO}>Quantidade</label>
                <input id="linha-qtd" inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
              </div>
              <div>
                <label htmlFor="linha-un" className={ROTULO}>Unidade</label>
                <input
                  id="linha-un"
                  list="unidades-da-cotacao"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  className={`${CAMPO} w-full px-3 uppercase text-base sm:text-sm`}
                />
                <datalist id="unidades-da-cotacao">
                  {UNIDADES_CADASTRO.map((u) => (
                    <option key={u.valor} value={u.valor}>{u.rotulo}</option>
                  ))}
                </datalist>
              </div>
            </div>
            {(unidade.trim().toUpperCase() !== linha.unidade || lerPreco(quantidade) !== linha.quantidadeReposicao) && (
              <p className="text-[11px] text-slate-500">
                Precisa: {formatarQtd(linha.quantidadeReposicao)} {linha.unidade}. O preço é por {unidade.trim().toUpperCase() || "unidade"}.
              </p>
            )}
            <div className="flex items-center gap-2 pt-1">
              {linha.editada && (
                <Button
                  variant="ghost"
                  onClick={() => aoSalvar(linha, null)}
                  className="h-10 px-2.5 mr-auto font-bold text-slate-600 hover:bg-slate-100"
                >
                  <RotateCcw className="h-4 w-4" /> Original
                </Button>
              )}
              <Button variant="outline" onClick={aoFechar} className={`h-10 font-bold ${linha.editada ? "" : "ml-auto"}`}>Cancelar</Button>
              <Button onClick={salvar} className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold">Salvar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Importar o orçamento de um fornecedor: arquivo .csv (ou texto colado). Mostra
 * o que foi achado antes de preencher; o que não foi achado dá para escolher.
 */
export function ImportarOrcamento({
  fornecedor, linhas, aoFechar, aoPreencher,
}: {
  fornecedor: Fornecedor | null;
  linhas: LinhaCotacao[];
  aoFechar: () => void;
  aoPreencher: (fornecedor: Fornecedor, itens: { chave: string; preco: number }[]) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [preenchendo, setPreenchendo] = useState(false);

  useEffect(() => {
    if (fornecedor) { setTexto(""); setEscolhas({}); }
  }, [fornecedor]);

  const { linhas: orcamento, ignoradas } = useMemo(() => lerOrcamento(texto), [texto]);
  const casadas: Correspondencia[] = useMemo(() => casarOrcamento(orcamento, linhas), [orcamento, linhas]);
  const final = casadas.map((c, i) => ({ ...c, chave: i in escolhas ? escolhas[i] || null : c.chave }));
  const prontas = final.filter((c) => c.chave);

  const lerArquivo = (arquivo: File | undefined) => {
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      let t = String(leitor.result || "");
      // Excel antigo salva em Windows-1252: os acentos viram "�". Relê assim.
      if (t.includes("�")) {
        const outro = new FileReader();
        outro.onload = () => { setTexto(String(outro.result || "")); setEscolhas({}); };
        outro.readAsText(arquivo, "windows-1252");
        return;
      }
      setTexto(t);
      setEscolhas({});
    };
    leitor.readAsText(arquivo, "utf-8");
  };

  const preencher = async () => {
    if (!fornecedor) return;
    setPreenchendo(true);
    try {
      await aoPreencher(fornecedor, prontas.map((c) => ({ chave: c.chave!, preco: c.orcamento.preco })));
    } finally {
      setPreenchendo(false);
    }
  };

  return (
    <Dialog open={!!fornecedor} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Orçamento da {fornecedor?.nome}</DialogTitle>
          <DialogDescription>
            Arquivo .csv com o produto e o preço (o modelo da cotação serve), ou cole o texto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0">
            <FileUp className="h-4 w-4" /> Escolher arquivo
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0])} />
          </label>
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setEscolhas({}); }}
            rows={2}
            placeholder={"ou cole aqui, por exemplo:\nAçúcar refinado;4,10"}
            aria-label="Texto do orçamento"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
          />
        </div>

        {orcamento.length > 0 && (
          <>
            <p className="text-xs font-semibold text-slate-600">
              {prontas.length} de {orcamento.length} {orcamento.length === 1 ? "linha achada" : "linhas achadas"}
              {ignoradas > 0 && ` · ${ignoradas} sem preço ${ignoradas === 1 ? "ignorada" : "ignoradas"}`}
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {final.map((c, i) => (
                <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${c.chave ? "" : "bg-amber-50/60"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">{c.orcamento.produto}</p>
                    <p className="text-xs font-bold text-slate-600 tabular-nums">{formatarReais(c.orcamento.preco)}</p>
                  </div>
                  <select
                    value={c.chave || ""}
                    onChange={(e) => setEscolhas((atual) => ({ ...atual, [i]: e.target.value }))}
                    aria-label={`Item da cotação para ${c.orcamento.produto}`}
                    className={`${SELETOR} sm:w-64 ${c.chave ? "" : "border-amber-300"}`}
                  >
                    <option value="">— Não importar —</option>
                    {linhas.map((l) => (
                      <option key={l.chave} value={l.chave}>
                        {l.nome} ({formatarQtd(l.quantidade)} {l.unidadeCompra})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={aoFechar} className="h-10 font-bold">Cancelar</Button>
          <Button
            onClick={preencher}
            disabled={preenchendo || prontas.length === 0}
            className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold"
          >
            {preenchendo ? "Preenchendo..." : `Preencher ${prontas.length} ${prontas.length === 1 ? "preço" : "preços"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
