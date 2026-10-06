import { QuantitySelector } from "@/components/QuantitySelector";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getItens, createRequisicao, getUsuarios, getRequisicao, updateRequisicaoCompleta } from "@/services/api";
import { Item } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Plus, Minus, ArrowLeft, Search, List, PauseCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { playSound } from "@/lib/sounds";
import { contemTexto, formatItemName, UNIDADE_PADRAO } from "@/lib/utils";
import { opcoesDeUnidade, rotuloUnidade, unidadesDoItem } from "@/lib/unidades";
import { useBloqueio } from "@/contexts/BloqueioContext";

/** Uma linha do pedido em construção. */
type LinhaPedido = {
  item_id: string;
  quantidade: number;
  unidade: string;
  item?: Item;
};

type Rascunho = {
  selecionados: LinhaPedido[];
  observacao: string;
  selectedUserId: string;
};

export default function NovaRequisicao() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [isInitializing, setIsInitializing] = useState(isEditMode);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [estoqueItens, setEstoqueItens] = useState<Item[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selecionados, setSelecionados] = useState<LinhaPedido[]>([]);
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);

  // Campos do selecionador
  const [buscaItem, setBuscaItem] = useState("");
  const [itemAtual, setItemAtual] = useState("");
  const [qntAtual, setQntAtual] = useState<number | "">(1);
  // Começa vazia de propósito: a pessoa escolhe a unidade. Com UN já marcado,
  // "5 de carne" virava 5 UN quando a intenção era 5 KG.
  const [unidadeAtual, setUnidadeAtual] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { bloqueio } = useBloqueio();

  // Rascunho por usuário: em um tablet compartilhado, a chave única fazia o
  // pedido em andamento de uma camareira aparecer para a próxima que logasse.
  const draftKey = user ? `nova_req_draft_${user.id}` : null;

  // Só começa a gravar o rascunho depois de ter tentado lê-lo. Sem esta trava,
  // o efeito de salvar rodava primeiro com a lista ainda vazia e APAGAVA o
  // rascunho — era o que fazia os itens sumirem quando a pessoa puxava a tela
  // para baixo e o navegador recarregava a página no meio do pedido.
  const rascunhoLido = useRef(false);

  // Carregar rascunho
  useEffect(() => {
    if (isEditMode || !draftKey) return;
    try {
      const bruto = localStorage.getItem(draftKey);
      if (bruto) {
        const dados = JSON.parse(bruto);
        // Formato antigo: só o array de itens. Formato atual: objeto completo.
        const rascunho: Partial<Rascunho> = Array.isArray(dados)
          ? { selecionados: dados }
          : dados;

        if (Array.isArray(rascunho.selecionados) && rascunho.selecionados.length > 0) {
          setSelecionados(
            rascunho.selecionados.map((linha) => ({
              ...linha,
              unidade: linha.unidade || linha.item?.unidade || UNIDADE_PADRAO,
            })),
          );
        }
        if (typeof rascunho.observacao === "string") setObservacao(rascunho.observacao);
        if (typeof rascunho.selectedUserId === "string") setSelectedUserId(rascunho.selectedUserId);
      }
    } catch (e) {
      console.error("Rascunho ilegível, começando do zero.", e);
    } finally {
      rascunhoLido.current = true;
    }
    // Limpa o rascunho antigo, de quando a chave era global.
    localStorage.removeItem("nova_req_draft");
  }, [isEditMode, draftKey]);

  // Salvar rascunho a cada mudança
  useEffect(() => {
    if (isEditMode || !draftKey || !rascunhoLido.current) return;
    if (selecionados.length > 0) {
      const rascunho: Rascunho = { selecionados, observacao, selectedUserId };
      try {
        localStorage.setItem(draftKey, JSON.stringify(rascunho));
      } catch (e) {
        console.error("Não foi possível guardar o rascunho.", e);
      }
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [selecionados, observacao, selectedUserId, isEditMode, draftKey]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getItens();
        const availableItems = data.filter(i => i.ativo);
        setEstoqueItens(availableItems);
        if (user?.perfil !== "SOLICITANTE") {
           const u = await getUsuarios();
           setUsuarios(u.filter(x => x.ativo));
        }

        if (isEditMode && id) {
          const req = await getRequisicao(id);
          if (req) {
            if (req.status !== "PENDENTE") {
              toast.error("Somente requisições pendentes podem ser editadas.");
              navigate("/");
              return;
            }
            // Mesma trava do detalhe: um solicitante não edita o pedido de
            // outro entrando pela URL /requisicoes/<id>/editar.
            if (user?.perfil === "SOLICITANTE" && req.usuario_id !== user.id) {
              toast.error("Você só pode editar as suas próprias requisições.");
              navigate("/requisicoes");
              return;
            }
            if (req.usuario_id && user?.perfil !== "SOLICITANTE") {
              setSelectedUserId(req.usuario_id);
            }
            setObservacao(req.observacao || "");

            if (req.itens) {
              setSelecionados(req.itens.map(i => {
                const doCatalogo = availableItems.find(a => a.id === i.item_id);
                return {
                  item_id: i.item_id,
                  quantidade: i.quantidade,
                  unidade: i.unidade || i.item?.unidade || doCatalogo?.unidade || UNIDADE_PADRAO,
                  item: doCatalogo || i.item,
                };
              }));
            }
          }
          setIsInitializing(false);
        }
      } catch (err) {
        toast.error("Erro ao carregar dados");
      }
    };
    load();
  }, [user, id, isEditMode, navigate]);

  const itensFiltrados = useMemo(() => {
    if (!buscaItem.trim()) return estoqueItens;
    return estoqueItens.filter((i) => contemTexto(i.nome, buscaItem));
  }, [buscaItem, estoqueItens]);

  const itemSelecionado = estoqueItens.find((i) => i.id === itemAtual);
  // Só as unidades cadastradas para ESTE material (ex.: carne = UN e KG).
  const unidadesDoSelecionado = itemSelecionado ? unidadesDoItem(itemSelecionado) : [];

  /** Escolhe o material. Se ele só tem uma unidade, não há o que escolher. */
  const escolherItem = (item: Item) => {
    setItemAtual(item.id);
    setBuscaItem("");
    const unidades = unidadesDoItem(item);
    setUnidadeAtual(unidades.length === 1 ? unidades[0] : "");
  };

  const handleAddItem = () => {
    if (!itemAtual || !qntAtual || Number(qntAtual) <= 0) {
      toast.error("Selecione um item e informe uma quantidade válida.");
      return;
    }
    if (!unidadeAtual) {
      toast.error("Escolha a unidade: UN, KG, CX...");
      return;
    }

    const itemObj = estoqueItens.find((i) => i.id === itemAtual);
    if (!itemObj) return;

    // Mesmo item em unidades diferentes são linhas diferentes (2 CX + 3 UN).
    const existe = selecionados.findIndex(
      (s) => s.item_id === itemAtual && s.unidade === unidadeAtual,
    );
    if (existe >= 0) {
      const novos = [...selecionados];
      novos[existe] = {
        ...novos[existe],
        quantidade: novos[existe].quantidade + Number(qntAtual),
      };
      setSelecionados(novos);
    } else {
      setSelecionados([
        ...selecionados,
        { item_id: itemAtual, quantidade: Number(qntAtual), unidade: unidadeAtual, item: itemObj },
      ]);
    }

    setItemAtual("");
    setQntAtual(1);
    setUnidadeAtual("");
    setBuscaItem("");
    toast.success("Item adicionado ao pedido.");
  };

  const handleRemoverItem = (index: number) => {
    setSelecionados((atuais) => atuais.filter((_, i) => i !== index));
  };

  /** Ajusta a quantidade de uma linha já adicionada, sem precisar remover e refazer. */
  const alterarQuantidade = (index: number, novaQuantidade: number) => {
    const valor = Number.isFinite(novaQuantidade) ? novaQuantidade : 0;
    setSelecionados((atuais) =>
      atuais.map((linha, i) =>
        i === index ? { ...linha, quantidade: Math.max(0, Math.round(valor * 1000) / 1000) } : linha,
      ),
    );
  };

  const alterarUnidade = (index: number, novaUnidade: string) => {
    setSelecionados((atuais) =>
      atuais.map((linha, i) => (i === index ? { ...linha, unidade: novaUnidade } : linha)),
    );
  };

  const handleSubmit = async () => {
    if (selecionados.length === 0) {
      toast.error("Adicione pelo menos um item na requisição.");
      return;
    }
    const semQuantidade = selecionados.find((s) => !s.quantidade || s.quantidade <= 0);
    if (semQuantidade) {
      toast.error(
        `"${formatItemName(semQuantidade.item?.nome)}" está com quantidade zerada. Ajuste ou remova o item.`,
      );
      return;
    }
    const semUnidade = selecionados.find((s) => !s.unidade);
    if (semUnidade) {
      toast.error(`Escolha a unidade de "${formatItemName(semUnidade.item?.nome)}".`);
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const linhas = selecionados.map((s) => ({
        item_id: s.item_id,
        quantidade: s.quantidade,
        unidade: s.unidade,
        nome: formatItemName(s.item?.nome),
      }));

      if (isEditMode && id) {
        await updateRequisicaoCompleta(
          id,
          { observacao, usuario_id: selectedUserId || user.id },
          linhas,
          user.id
        );
        playSound('notification');
        toast.success("Requisição atualizada com sucesso!");
        navigate(`/requisicoes/${id}`);
      } else {
        await createRequisicao(
          {
            usuario_id: selectedUserId || user.id,
            departamento: usuarios.find(u => u.id === selectedUserId)?.departamento || user.departamento,
            status: "PENDENTE",
            observacao,
          },
          linhas,
        );
        playSound('notification');
        toast.success("Requisição enviada com sucesso!");
        setSelecionados([]);
        setObservacao("");
        if (draftKey) localStorage.removeItem(draftKey);
        if (user?.perfil === "SOLICITANTE") {
          navigate("/");
        } else {
          navigate("/requisicoes");
        }
      }
    } catch (err: any) {
      // P0001 = recusa do próprio banco com mensagem pronta (ex.: requisições
      // suspensas para inventário). O rascunho continua guardado.
      toast.error(
        err?.code === "P0001" && err?.message
          ? err.message
          : isEditMode ? "Erro ao atualizar requisição." : "Erro ao enviar requisição.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (isInitializing) {
    return <div className="text-center py-10">Carregando dados...</div>;
  }

  // Pausa para inventário: pedido novo não sai. Editar um que já existe, sim.
  // O que estiver no rascunho fica guardado para quando liberar.
  if (!isEditMode && bloqueio.ativo) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
          <PauseCircle className="w-7 h-7 text-amber-600" />
        </div>
        <p className="font-bold text-slate-800">Novas requisições estão suspensas</p>
        <p className="text-sm text-slate-600">
          {bloqueio.motivo || "Inventário em andamento"}. Assim que o almoxarifado liberar, dá
          para pedir de novo — se você já tinha começado um pedido, ele continua guardado.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate(user?.perfil === "SOLICITANTE" ? "/" : "/requisicoes")}
          className="font-bold"
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        {/* Antes só o solicitante tinha o botão de voltar; no celular o
            almoxarifado ficava sem saída nesta tela. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(user?.perfil === "SOLICITANTE" ? "/" : "/requisicoes")}
          className="rounded-full shrink-0 hover:bg-slate-200 text-teal-900"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-teal-900 dark:text-teal-100">
            {isEditMode ? "Editar Requisição" : "Nova Requisição"}
          </h1>
          <p className="text-slate-700 text-sm">
            {isEditMode ? "Edite os itens e quantidades." : "Adicione os itens ao pedido."}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {user?.perfil !== "SOLICITANTE" && (
          <Card className="shadow-xl shadow-slate-200/60 border-slate-200/60 border-slate-200">
            <CardContent className="p-4 sm:p-6">
              <Label className="text-base font-bold text-slate-700 mb-2 block">
                Solicitante (Você está criando em nome de outra pessoa)
              </Label>
              <select
                className="w-full h-12 bg-white border border-slate-300 rounded-md px-3 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">-- Selecione o Solicitante (opcional) --</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome} ({u.departamento})</option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}
        <Card className="shadow-xl shadow-slate-200/60 border-slate-200/60 border-slate-200">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="space-y-3">
              <Label className="text-base font-bold text-slate-700">
                Adicionar Item
              </Label>
              {!itemAtual ? (
                <div className="space-y-2 relative">
                  <div className="flex items-center gap-2 relative">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-5 w-5 text-slate-700" />
                      <Input
                        placeholder="Qual material você precisa?"
                        value={buscaItem}
                        onChange={(e) => setBuscaItem(e.target.value)}
                        className="pl-10 h-12 bg-white border-slate-300 focus-visible:ring-teal-500"
                      />
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger
                        render={
                          <Button variant="outline" size="icon" className="h-12 w-12 border-slate-300 bg-white hover:bg-slate-50 flex-shrink-0 text-slate-700 hover:text-slate-700" title="Ver todos os materiais" />
                        }
                      >
                        <List className="h-5 w-5" />
                      </DialogTrigger>
                      <DialogContent className="max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden bg-slate-50 p-0">
                        <DialogHeader className="p-4 bg-white border-b border-slate-200">
                          <DialogTitle className="text-slate-800">Todos os Materiais</DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                           {[...estoqueItens].sort((a, b) => a.nome.localeCompare(b.nome)).map(item => (
                             <div
                               key={item.id}
                               onClick={() => {
                                 escolherItem(item);
                                 setDialogOpen(false);
                               }}
                               className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-teal-400 hover:shadow-md hover:shadow-teal-100 transition-all"
                             >
                               <p className="font-bold text-slate-800">{item.nome}</p>
                               <p className="text-xs font-medium text-slate-700 mt-0.5">{unidadesDoItem(item).join(" · ")}</p>
                             </div>
                           ))}
                           {estoqueItens.length === 0 && (
                              <div className="p-4 text-center text-slate-700 text-sm">Nenhum material cadastrado.</div>
                           )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {(buscaItem.length > 0) && (
                    <div className="absolute z-10 w-full border border-teal-200 shadow-xl shadow-teal-900/10 rounded-lg max-h-56 overflow-y-auto bg-white mt-1 divide-y divide-slate-100 overflow-hidden ring-1 ring-slate-900/5 top-12 left-0 right-0">
                      {itensFiltrados.map((i) => (
                        <div
                          key={i.id}
                          onClick={() => escolherItem(i)}
                          className="p-3 cursor-pointer hover:bg-teal-50/80 transition-colors"
                        >
                          <p className="font-bold text-slate-800">
                            {i.nome}
                          </p>
                          <p className="text-[11px] font-semibold tracking-wider text-slate-700 uppercase mt-0.5">
                            {unidadesDoItem(i).join(" · ")}
                          </p>
                        </div>
                      ))}
                      {itensFiltrados.length === 0 && (
                        <div className="p-4 text-center text-slate-700 text-sm font-medium bg-slate-50">
                          Nenhum material encontrado.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center p-3 bg-teal-50 border border-teal-200 rounded-md">
                  <div className="break-words whitespace-normal">
                    <p className="font-bold text-teal-900 break-words whitespace-normal">
                      {itemSelecionado?.nome}
                    </p>
                    <p className="text-xs text-teal-700">
                      Pode ser pedido em: {unidadesDoSelecionado.join(", ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setItemAtual("")}
                    className="text-teal-700 hover:text-teal-900 hover:bg-teal-100 h-8 font-medium shrink-0"
                  >
                    Trocar
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 sm:items-end">
              <div className="w-full sm:w-auto shrink-0">
                <Label className="text-sm font-bold text-slate-700 mb-1 block">
                  Quantidade
                </Label>
                <QuantitySelector
                  value={qntAtual}
                  onChange={(val) => setQntAtual(val)}
                  min={0}
                  step="any"
                />
              </div>

              {/* Unidade obrigatória e só as cadastradas para o material.
                  Material com uma unidade só já vem escolhido. */}
              <div className="w-full sm:w-36 shrink-0">
                <Label className="text-sm font-bold text-slate-700 mb-1 block">
                  Unidade <span className="text-red-600">*</span>
                </Label>
                <select
                  value={unidadeAtual}
                  onChange={(e) => setUnidadeAtual(e.target.value)}
                  disabled={!itemAtual}
                  aria-label="Unidade de medida do pedido"
                  className={`w-full h-14 bg-white border rounded-xl px-3 text-base font-bold shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400 ${
                    itemAtual && !unidadeAtual ? "border-amber-400 text-slate-500" : "border-slate-300 text-slate-700"
                  }`}
                >
                  <option value="" disabled>
                    {itemAtual ? "Escolha..." : "—"}
                  </option>
                  {unidadesDoSelecionado.map((u) => (
                    <option key={u} value={u}>{u} — {rotuloUnidade(u)}</option>
                  ))}
                </select>
              </div>

              <div className="flex-1 w-full">
                <Button
                  type="button"
                  onClick={handleAddItem}
                  disabled={!itemAtual || !qntAtual || !unidadeAtual}
                  className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-50"
                >
                  <Plus className="h-5 w-5 mr-1" /> Adicionar ao Pedido
                </Button>
              </div>
            </div>

            {itemAtual && !unidadeAtual && (
              <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Escolha a unidade antes de adicionar: {unidadesDoSelecionado.join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        {selecionados.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="font-bold text-teal-900 text-lg border-b pb-2">
              Itens no Pedido ({selecionados.length})
            </h3>
            <div className="space-y-3">
              {selecionados.map((s, idx) => (
                <div
                  key={`${s.item_id}-${s.unidade}-${idx}`}
                  className="p-4 bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-xl"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-800 break-words min-w-0 flex-1">
                      {formatItemName(s.item?.nome)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:bg-red-50 hover:text-red-700 rounded-full shrink-0 h-9 w-9"
                      onClick={() => handleRemoverItem(idx)}
                      title="Remover item do pedido"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Quantidade editável na própria linha: antes era preciso
                      remover o item e adicionar de novo só para trocar o número. */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex items-center h-11 border border-slate-300 rounded-lg overflow-hidden bg-white shrink-0">
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(idx, s.quantidade - 1)}
                        disabled={s.quantidade <= 0}
                        aria-label="Diminuir quantidade"
                        className="h-full w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={s.quantidade}
                        onChange={(e) =>
                          alterarQuantidade(idx, e.target.value === "" ? 0 : Number(e.target.value))
                        }
                        aria-label={`Quantidade de ${formatItemName(s.item?.nome)}`}
                        className="h-full w-16 text-center text-base font-bold text-slate-800 border-x border-slate-200 focus:outline-none focus:bg-teal-50"
                      />
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(idx, s.quantidade + 1)}
                        aria-label="Aumentar quantidade"
                        className="h-full w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <select
                      value={s.unidade}
                      onChange={(e) => alterarUnidade(idx, e.target.value)}
                      aria-label={`Unidade de ${formatItemName(s.item?.nome)}`}
                      className="h-11 w-20 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {/* Cadastro atual, não a cópia guardada no rascunho: um
                          rascunho antigo não conhece as unidades novas do item. */}
                      {opcoesDeUnidade(estoqueItens.find((e) => e.id === s.item_id) ?? s.item, s.unidade).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    {s.quantidade <= 0 && (
                      <span className="text-xs font-bold text-red-600 min-w-0">
                        Quantidade zerada
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 space-y-2">
              <Label className="font-semibold text-slate-700">
                Observações (opcional)
              </Label>
              <Textarea
                placeholder="Exemplo: Necessidade urgente para o evento de hoje à noite..."
                className="min-h-[100px] border-slate-300 resize-none bg-white p-3"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>

            <Button
              className="w-full h-14 bg-teal-900 hover:bg-teal-950 active:scale-[0.98] transition-all text-white font-bold text-lg rounded-xl shadow-lg mt-6"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (isEditMode ? "Salvando..." : "Processando envio...") : (isEditMode ? "Salvar Alterações" : "Enviar Requisição")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
