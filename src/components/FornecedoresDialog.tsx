import React, { useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { CAMPO } from "@/lib/estilos";
import {
  formatarReais,
  lerPreco,
  normalizarWhatsapp,
  precoNoCampo,
  whatsappNaTela,
  type Fornecedor,
} from "@/lib/cotacao";
import { atualizarFornecedor, criarFornecedor, excluirFornecedor, getFornecedores } from "@/services/cotacao";

const ROTULO = "text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

/** Nome, WhatsApp e pedido mínimo de um fornecedor; e excluir. */
export function EditarFornecedor({
  fornecedor, aoFechar, aoSalvar, aoExcluir,
}: {
  fornecedor: Fornecedor | null;
  aoFechar: () => void;
  aoSalvar: (f: Fornecedor) => void;
  aoExcluir?: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [minimo, setMinimo] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!fornecedor) return;
    setNome(fornecedor.nome);
    setWhatsapp(whatsappNaTela(fornecedor.whatsapp) || fornecedor.whatsapp || "");
    setMinimo(precoNoCampo(fornecedor.pedido_minimo));
    setConfirmarExclusao(false);
  }, [fornecedor]);

  const salvar = async () => {
    if (!fornecedor) return;
    const numero = whatsapp.trim() ? normalizarWhatsapp(whatsapp) : null;
    if (whatsapp.trim() && !numero) {
      toast.error("WhatsApp inválido. Use o DDD e o número, por exemplo (31) 99999-8888.");
      return;
    }
    const valorMinimo = lerPreco(minimo);
    if (valorMinimo === undefined) {
      toast.error("Pedido mínimo inválido. Use números, por exemplo 150,00.");
      return;
    }
    setSalvando(true);
    try {
      await atualizarFornecedor(fornecedor.id, { nome, whatsapp: numero, pedido_minimo: valorMinimo });
      aoSalvar({ ...fornecedor, nome: nome.trim().replace(/\s+/g, " ").toUpperCase(), whatsapp: numero, pedido_minimo: valorMinimo });
      aoFechar();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar o fornecedor.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!fornecedor) return;
    setSalvando(true);
    try {
      await excluirFornecedor(fornecedor.id);
      toast.success(`${fornecedor.nome} excluído.`);
      aoExcluir?.(fornecedor.id);
      aoFechar();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível excluir o fornecedor.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!fornecedor} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{fornecedor?.nome}</DialogTitle>
          <DialogDescription className="sr-only">Nome, WhatsApp e pedido mínimo do fornecedor.</DialogDescription>
        </DialogHeader>
        {confirmarExclusao ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Excluir <strong>{fornecedor?.nome}</strong>? Ele some das listas; os preços e pedidos antigos continuam
              com o nome dele.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmarExclusao(false)} disabled={salvando}>Voltar</Button>
              <Button variant="destructive" className="font-bold" onClick={excluir} disabled={salvando}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="forn-nome" className={ROTULO}>Nome</label>
              <input id="forn-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
            </div>
            <div>
              <label htmlFor="forn-whats" className={ROTULO}>WhatsApp</label>
              <input
                id="forn-whats"
                type="tel"
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(31) 99999-8888"
                className={`${CAMPO} w-full px-3 text-base sm:text-sm`}
              />
            </div>
            <div>
              <label htmlFor="forn-minimo" className={ROTULO}>Pedido mínimo (R$)</label>
              <input
                id="forn-minimo"
                inputMode="decimal"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                placeholder="Sem mínimo"
                className={`${CAMPO} w-full px-3 text-base sm:text-sm`}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              {aoExcluir && (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmarExclusao(true)}
                  className="h-10 px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold mr-auto"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              )}
              <Button variant="outline" onClick={aoFechar} className={`h-10 font-bold ${aoExcluir ? "" : "ml-auto"}`}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando || !nome.trim()} className="h-10 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold">
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A lista de fornecedores (Lista de Reposição): cadastrar, editar e excluir. */
export function GerenciarFornecedores({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    getFornecedores()
      .then((f) => { setLista(f); setErro(null); })
      .catch((e) => setErro(e?.message || "Não foi possível carregar os fornecedores."));
  }, [aberto]);

  const ativos = lista.filter((f) => f.ativo !== false);

  const cadastrar = async () => {
    try {
      const f = await criarFornecedor(novo);
      setNovo("");
      setLista((atual) => [...atual.filter((x) => x.id !== f.id), f].sort((a, b) => a.nome.localeCompare(b.nome)));
      setEditando(f); // já abre para pôr o WhatsApp e o mínimo
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível cadastrar.");
    }
  };

  return (
    <>
      <Dialog open={aberto && !editando} onOpenChange={(o) => { if (!o) aoFechar(); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Fornecedores</DialogTitle>
            <DialogDescription className="sr-only">Cadastrar, editar e excluir fornecedores.</DialogDescription>
          </DialogHeader>
          {erro ? (
            <p className="text-sm text-slate-700">{erro}</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {ativos.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEditando(f)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">{f.nome}</span>
                    <span className="block text-[11px] text-slate-500">
                      {f.whatsapp ? (
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {whatsappNaTela(f.whatsapp)}</span>
                      ) : "Sem WhatsApp"}
                      {f.pedido_minimo ? ` · mínimo ${formatarReais(f.pedido_minimo)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && novo.trim()) cadastrar(); }}
              placeholder="Novo fornecedor"
              aria-label="Nome do novo fornecedor"
              className={`${CAMPO} min-w-0 flex-1 px-3 text-base sm:text-sm`}
            />
            <Button onClick={cadastrar} disabled={!novo.trim()} className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-none">
              <Plus className="h-4 w-4" /> Cadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <EditarFornecedor
        fornecedor={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={(f) => setLista((atual) => atual.map((x) => (x.id === f.id ? f : x)))}
        aoExcluir={(id) => setLista((atual) => atual.map((x) => (x.id === id ? { ...x, ativo: false } : x)))}
      />
    </>
  );
}
