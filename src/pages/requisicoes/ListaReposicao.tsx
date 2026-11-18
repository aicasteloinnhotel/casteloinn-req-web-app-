import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  getListaReposicao,
  adicionarItemReposicao,
  baixarQuantidadeReposicaoEmMassa,
  definirEstadoDosItens,
  definirUrgencia,
  moverParaCotacao,
  tirarDaCotacao,
  restaurarEstado,
  excluirItemReposicaoManual,
  editarQuantidadeManual,
} from "@/services/reposicao";
import {
  fotografarEstado,
  linhasParaCotacao,
  PRAZOS_AGUARDANDO,
  PRAZOS_URGENTE,
  separarEmLotes,
  type FotoDeEstado,
  type ModalidadeReposicao,
} from "@/lib/estadoReposicao";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatarReais,
  montarLinhas,
  textoParaPedirPreco,
  vencedorDaLinha,
  type Fornecedor,
} from "@/lib/cotacao";
import { getDadosDasCotacoes, getFornecedores, getLinhasEditadas, limparPedido, type DadosDaCotacao } from "@/services/cotacao";
import { GerenciarFornecedores } from "@/components/FornecedoresDialog";
import { ItemReposicao, Item } from "@/types";
import { getItens, getUsuarios } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { contemTexto, descreverQuantidades, formatItemName } from "@/lib/utils";
import { imprimirPdf } from "@/lib/imprimir";
import { CampoBusca } from "@/components/CampoBusca";
import { ABA_ATIVA, ABA_FILA, ABA_INATIVA, ABAS_FILA, BOTAO_ICONE, BOTAO_PRIMARIO, TITULO } from "@/lib/estilos";
import {
  ETAPAS,
  ehEtapa,
  ehUrgente,
  etapaDoGrupo,
  ordenarNaEtapa,
  rotuloDaPrevisao,
  rotuloDaUrgencia,
  type EtapaReposicao,
} from "@/lib/etapasReposicao";
import {
  Search,
  History,
  Check,
  AlertTriangle,
  Printer,
  Plus,
  CheckCircle2,
  CheckSquare,
  Truck,
  ChevronDown,
  MoreHorizontal,
  ShoppingCart,
  Store,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Copy,
  Undo2,
  X
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type GroupedItem = {
  item_id: string;
  item?: Item;
  tipo_origem: "MANUAL" | "RUPTURA";
  manual_items: ItemReposicao[];
  rupturas: ItemReposicao[];
  all_ids: string[];
  total_quantidade: number;
  modalidade: ModalidadeReposicao;
  urgente?: boolean;
  prazo_target_date?: number | null;
  prazo_original?: string | null;
  /** Em cotação: qual cópia para a planilha, e quando. */
  lote?: string | null;
  cotacao_em?: string | null;
  /** Pedido feito pela cotação no app: de quem e por quanto (por unidade). */
  fornecedor_id?: string | null;
  preco_unitario?: number | null;
  unidade_compra?: string | null;
  /** Valor do pedido deste material (quantidade × preço de cada linha). */
  valor_pedido?: number;
};

/** "1 item", "3 itens". */
const contarItens = (n: number) => `${n} ${n === 1 ? "item" : "itens"}`;

/** Rótulo de uma seção dentro de um menu. */
function TituloDoMenu({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
      {children}
    </div>
  );
}

const ITEM_DO_MENU = "text-xs font-semibold text-slate-700 focus:bg-slate-50 cursor-pointer rounded-lg py-1.5";
const SEPARADOR_DO_MENU = <div className="h-px bg-slate-100 my-1.5" />;

/** Previsões de chegada: "Pedido feito" e "Mudar previsão". */
function OpcoesDePrevisao({ aoEscolher }: { aoEscolher: (prazo: string) => void }) {
  return (
    <>
      {PRAZOS_AGUARDANDO.map((o) => (
        <DropdownMenuItem key={o.prazo} onClick={() => aoEscolher(o.prazo)} className={`${ITEM_DO_MENU} pl-4`}>
          {o.rotulo}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Prazos da urgência e, se já é urgente, tirar a marca. */
function OpcoesDeUrgencia({ urgente, aoEscolher }: { urgente: boolean; aoEscolher: (prazo?: string) => void }) {
  return (
    <>
      {PRAZOS_URGENTE.map((o) => (
        <DropdownMenuItem
          key={o.prazo}
          onClick={() => aoEscolher(o.prazo)}
          className={`${ITEM_DO_MENU} pl-4 text-red-700 focus:bg-red-50`}
        >
          {o.rotulo}
        </DropdownMenuItem>
      ))}
      {urgente && (
        <DropdownMenuItem onClick={() => aoEscolher()} className={`${ITEM_DO_MENU} pl-4`}>
          Tirar urgência
        </DropdownMenuItem>
      )}
    </>
  );
}

/** Caixa de marcar da lista, com área de toque maior que o desenho. */
function CaixaDeMarcar({
  marcado, parcial, aoMudar, rotulo,
}: {
  marcado: boolean;
  parcial?: boolean;
  aoMudar: () => void;
  rotulo: string;
}) {
  return (
    <label className="-m-2 p-2 shrink-0 cursor-pointer flex">
      <Checkbox
        checked={marcado}
        indeterminate={!!parcial && !marcado}
        onCheckedChange={aoMudar}
        aria-label={rotulo}
        className="h-5 w-5 rounded-md border-2 border-slate-400 bg-white after:hidden data-checked:bg-teal-600 data-checked:border-teal-600 data-indeterminate:bg-teal-100 data-indeterminate:border-teal-500 data-indeterminate:text-teal-700"
      />
    </label>
  );
}

/**
 * Um bloco (etapa da compra): cartão branco com cabeçalho e a lista. No
 * computador os três ficam lado a lado; no celular aparece o da aba escolhida,
 * e o cabeçalho só fica se tiver o "marcar todos" (a aba já diz o nome).
 */
const CARTAO_DO_BLOCO = "bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50";

/**
 * "Marcar todos" em texto, não em bolinha: a bolinha é do item. Com a mesma
 * bolinha no título, o cabeçalho parecia mais um item da lista.
 */
function MarcarTodos({ todos, aoMudar }: { todos: boolean; aoMudar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoMudar}
      className="shrink-0 h-8 px-2 -mr-1 rounded-md text-xs font-bold text-teal-700 hover:bg-teal-50"
    >
      {todos ? "Desmarcar" : "Marcar todos"}
    </button>
  );
}

function Bloco({
  titulo, icone, total, visivelNoCelular, marcarTodos, children,
}: {
  titulo: string;
  icone: React.ReactNode;
  total: number;
  visivelNoCelular: boolean;
  marcarTodos?: { marcado: boolean; parcial: boolean; aoMudar: () => void };
  children: React.ReactNode;
}) {
  const visivel = `${visivelNoCelular ? "block" : "hidden"} lg:block min-w-0`;
  return (
    <section className={`${visivel} ${CARTAO_DO_BLOCO}`}>
      {/* Cabeçalho do bloco: ícone, nome maior e contagem; nada de bolinha. */}
      <div
        className={`${marcarTodos && total > 0 ? "flex" : "hidden lg:flex"} items-center gap-2.5 px-4 py-2 lg:py-3 bg-slate-50 border-b border-slate-200`}
      >
        <span className="hidden lg:flex w-8 h-8 rounded-lg bg-teal-100 text-teal-800 items-center justify-center shrink-0 [&_svg]:w-4 [&_svg]:h-4">
          {icone}
        </span>
        <h2 className="hidden lg:block text-base font-bold text-slate-900 truncate">{titulo}</h2>
        <span className="hidden lg:inline-flex rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 tabular-nums">
          {total}
        </span>
        {marcarTodos && total > 0 && (
          <span className="ml-auto">
            <MarcarTodos todos={marcarTodos.marcado} aoMudar={marcarTodos.aoMudar} />
          </span>
        )}
      </div>
      {total === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Nada aqui.</p>
      ) : (
        <div className="divide-y divide-slate-100">{children}</div>
      )}
    </section>
  );
}

export default function ListaReposicao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [lista, setLista] = useState<ItemReposicao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [estoqueItens, setEstoqueItens] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Mapa id -> nome: a coluna resolvido_por guarda o UUID do usuário, então sem
  // isso o histórico de baixas mostrava o UUID cru na tela.
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({});
  const nomeDoResponsavel = (id?: string | null) =>
    (id && nomesUsuarios[id]) || "Sistema";

  // Histórico Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const historicoItems = useMemo(
    () =>
      lista
        .filter(i => i.resolvido)
        .sort(
          (a, b) =>
            new Date(b.resolvido_em || b.created_at).getTime() -
            new Date(a.resolvido_em || a.created_at).getTime(),
        ),
    [lista],
  );

  // Modal Adicionar
  const [showAddModal, setShowAddModal] = useState(false);
  const [buscaItem, setBuscaItem] = useState("");
  const [itemAtual, setItemAtual] = useState<Item | null>(null);
  const [qtdAdicionar, setQtdAdicionar] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolver States
  const [inlineResolveId, setInlineResolveId] = useState<string | null>(null);
  const [inlineResolveQtd, setInlineResolveQtd] = useState<number | "">("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingGroup, setResolvingGroup] = useState<GroupedItem | null>(null);
  const [manualResolveQtd, setManualResolveQtd] = useState<number | "">("");
  const [grupoParaExcluir, setGrupoParaExcluir] = useState<GroupedItem | null>(null);
  const [grupoParaEditar, setGrupoParaEditar] = useState<GroupedItem | null>(null);
  const [novaQtdManual, setNovaQtdManual] = useState<number | "">("");
  
  // Urgency time refresh
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNowTime(Date.now()), 60000);
    return () => clearInterval(int);
  }, []);

  // Etapa aberta no celular (no computador as três aparecem lado a lado).
  const [etapaAtiva, setEtapaAtiva] = useState<EtapaReposicao>(() => {
    try {
      const salva = sessionStorage.getItem("reposicao_etapa");
      return ehEtapa(salva) ? salva : "COMPRAR";
    } catch {
      return "COMPRAR";
    }
  });
  const trocarEtapa = (etapa: EtapaReposicao) => {
    setEtapaAtiva(etapa);
    try {
      sessionStorage.setItem("reposicao_etapa", etapa);
    } catch {
      // Sem sessionStorage (aba anônima): só não lembra a aba.
    }
  };

  // Itens marcados (pelo material), sempre de UMA etapa: a ação da barra é a
  // da etapa (copiar para cotação, pedido feito). Marcar em outra etapa começa
  // uma marcação nova. Continuam marcados ao mudar a busca.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [etapaMarcada, setEtapaMarcada] = useState<EtapaReposicao | null>(null);
  const [aplicando, setAplicando] = useState(false);

  /** Todos marcados: desmarca. Senão: marca os que faltam. */
  const alternarVarios = (itemIds: string[], etapa: EtapaReposicao) => {
    const mesmaEtapa = etapaMarcada === etapa;
    setSelecionados((atual) => {
      const novo = new Set(mesmaEtapa ? atual : []);
      if (itemIds.every((id) => novo.has(id))) itemIds.forEach((id) => novo.delete(id));
      else itemIds.forEach((id) => novo.add(id));
      return novo;
    });
    setEtapaMarcada(etapa);
  };
  const alternarItem = (itemId: string, etapa: EtapaReposicao) => alternarVarios([itemId], etapa);

  const desfazer = async (foto: FotoDeEstado[]) => {
    try {
      await restaurarEstado(foto);
      toast.info("Desfeito: os itens voltaram a como estavam.");
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível desfazer.");
    }
  };

  /** Toda mudança de estado passa aqui, de um item ou de vários: com "Desfazer". */
  const aplicar = async (itemIds: string[], acao: () => Promise<unknown>, mensagem: string) => {
    if (itemIds.length === 0) return;
    const foto = fotografarEstado(lista, itemIds);
    setAplicando(true);
    try {
      await acao();
      toast.success(mensagem, {
        duration: 10000,
        action: { label: "Desfazer", onClick: () => desfazer(foto) },
      });
      setSelecionados((atual) => {
        const novo = new Set(atual);
        itemIds.forEach((id) => novo.delete(id));
        return novo;
      });
      await recarregarLista(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Não foi possível mudar o estado dos itens.");
    } finally {
      setAplicando(false);
    }
  };

  /** Pedido feito (ou mudar a previsão): vai para Aguardando entrega. */
  const pedidoFeito = (itemIds: string[], prazo: string) =>
    aplicar(
      itemIds,
      () => definirEstadoDosItens(itemIds, "AGUARDANDO", prazo),
      `${contarItens(itemIds.length)} em Aguardando entrega.`,
    );

  /** Urgência é marca, não etapa: o item continua onde está. */
  const mudarUrgencia = (itemIds: string[], prazo?: string) =>
    aplicar(
      itemIds,
      () => definirUrgencia(itemIds, prazo),
      prazo ? `${contarItens(itemIds.length)}: urgente, ${prazo.toLowerCase()}.` : "Urgência tirada.",
    );

  /** Da cotação volta como estava (urgência fica); de Aguardando, volta normal. */
  const voltarParaComprar = (itemIds: string[], etapa: EtapaReposicao) =>
    aplicar(
      itemIds,
      async () => {
        if (etapa === "COTACAO") return tirarDaCotacao(itemIds);
        await definirEstadoDosItens(itemIds, "NORMAL");
        await limparPedido(itemIds); // o pedido foi desfeito: sem fornecedor e preço
      },
      `${contarItens(itemIds.length)} de volta em A comprar.`,
    );

  /** Chegou: baixa na hora (item manual) ou a janela (ruptura / várias linhas). */
  const abrirChegou = (group: GroupedItem) => {
    if (group.rupturas.length > 0 || group.manual_items.length > 1) {
      setResolvingGroup(group);
      setManualResolveQtd(group.manual_items.reduce((acc, l) => acc + l.quantidade, 0));
    } else {
      setInlineResolveId(group.item_id);
      setInlineResolveQtd(group.total_quantidade);
    }
  };

  const recarregarLista = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getListaReposicao();
      setLista(data);
    } catch (e: any) {
      // Sem o try/catch a tela ficava presa no "carregando" para sempre.
      console.error("Erro ao carregar lista de reposição:", e);
      toast.error(`Erro ao carregar a lista de reposição: ${e?.message || "falha de conexão"}`);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    recarregarLista(true);
    const channelName = `lista-reposicao-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reposicao_itens" },
        () => {
          recarregarLista(false);
        }
      )
      .subscribe();

    getItens().then(data => {
      setEstoqueItens(data.filter(i => i.ativo));
    }).catch(e => console.error("Erro ao carregar itens do estoque:", e));

    getUsuarios().then(data => {
      setNomesUsuarios(
        Object.fromEntries(data.map(u => [u.id, u.nome])),
      );
    }).catch(e => console.error("Erro ao carregar usuários:", e));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const itensFiltrados = useMemo(() => {
    if (!buscaItem.trim()) return estoqueItens;
    return estoqueItens.filter((i) => contemTexto(i.nome, buscaItem));
  }, [buscaItem, estoqueItens]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, GroupedItem>();

    for (const item of lista) {
      if (item.resolvido) continue;
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status !== "AGUARDANDO") continue;

      if (!groups.has(item.item_id)) {
        groups.set(item.item_id, {
          item_id: item.item_id,
          item: item.item,
          tipo_origem: item.tipo_origem,
          manual_items: [],
          rupturas: [],
          all_ids: [],
          total_quantidade: 0,
          modalidade: "NORMAL",
          urgente: item.urgente,
          prazo_target_date: item.prazo_target_date,
          prazo_original: item.prazo_original
        });
      } else {
        const group = groups.get(item.item_id)!;
        if (item.urgente) {
          group.urgente = item.urgente;
          group.prazo_target_date = item.prazo_target_date;
          group.prazo_original = item.prazo_original;
        } else if (!group.urgente && item.prazo_original && (
          item.prazo_original === "PEDIDO" || 
          item.prazo_original === "AGUARDANDO" || 
          item.prazo_original.startsWith("PEDIDO") ||
          item.prazo_original.startsWith("AGUARDANDO")
        )) {
          group.prazo_original = item.prazo_original;
          group.prazo_target_date = item.prazo_target_date;
        }
      }
      
      const group = groups.get(item.item_id)!;
      // Linha nova do mesmo material continua no subgrupo em que ele já está.
      if (item.cotacao_lote && (!group.cotacao_em || (item.cotacao_em || "") > group.cotacao_em)) {
        group.lote = item.cotacao_lote;
        group.cotacao_em = item.cotacao_em;
      }
      if (item.fornecedor_id && !item.cotacao_lote) {
        group.fornecedor_id = item.fornecedor_id;
        group.preco_unitario = item.preco_unitario ?? null;
        group.unidade_compra = item.unidade_compra ?? null;
        if (item.preco_unitario != null) {
          // Comprado em outra unidade (2 CX em vez de 24 UN): vale a quantidade da compra.
          const qtd = item.quantidade_compra != null ? Number(item.quantidade_compra) : item.quantidade || 0;
          group.valor_pedido = Math.round(((group.valor_pedido || 0) + item.preco_unitario * qtd) * 100) / 100;
        }
      }
      group.all_ids.push(item.id);
      group.total_quantidade += (item.quantidade || 1);
      
      if (item.tipo_origem === "MANUAL" && !item.resolvido) {
        group.manual_items.push(item);
      }
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status === "AGUARDANDO") {
        group.rupturas.push(item);
        group.tipo_origem = "RUPTURA"; 
      }
    }

    // Set modalidade for each group
    for (const group of groups.values()) {
      if (group.urgente) {
        group.modalidade = "URGENTE";
      } else if (group.prazo_original && (
        group.prazo_original === "PEDIDO" ||
        group.prazo_original === "AGUARDANDO" ||
        group.prazo_original.startsWith("PEDIDO") ||
        group.prazo_original.startsWith("AGUARDANDO")
      )) {
        group.modalidade = "AGUARDANDO";
      } else {
        group.modalidade = "NORMAL";
      }
    }
    
    return Array.from(groups.values()).sort((a, b) => {
      const order = { URGENTE: 0, AGUARDANDO: 1, NORMAL: 2 };
      const diff = order[a.modalidade] - order[b.modalidade];
      if (diff !== 0) return diff;
      return (formatItemName(a.item?.nome) || "").localeCompare(formatItemName(b.item?.nome) || "");
    });
  }, [lista]);

  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return groupedItems;
    return groupedItems.filter(g => contemTexto(formatItemName(g.item?.nome), searchTerm));
  }, [groupedItems, searchTerm]);

  // Cada material numa etapa, já na ordem da etapa (urgentes no topo).
  const porEtapa = useMemo(() => {
    const r: Record<EtapaReposicao, GroupedItem[]> = { COMPRAR: [], COTACAO: [], AGUARDANDO: [] };
    for (const g of displayedItems) r[etapaDoGrupo(g)].push(g);
    for (const { etapa } of ETAPAS) r[etapa] = ordenarNaEtapa(r[etapa], etapa);
    return r;
  }, [displayedItems]);

  const lotesDeCotacao = useMemo(() => separarEmLotes(porEtapa.COTACAO), [porEtapa]);

  // Cotação no app (AJUSTE_08): fornecedores e preços de cada cotação aberta,
  // para mostrar o melhor preço em cada item. Sem o ajuste, só não aparece.
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [gerenciandoFornecedores, setGerenciandoFornecedores] = useState(false);
  const [dadosCotacoes, setDadosCotacoes] = useState<Record<string, DadosDaCotacao>>({});
  const chaveDosLotes = groupedItems.map((g) => g.lote).filter(Boolean).sort().join(",");
  useEffect(() => {
    getFornecedores().then(setFornecedores).catch(() => setFornecedores([]));
  }, []);
  useEffect(() => {
    const lotes = [...new Set(chaveDosLotes.split(",").filter(Boolean))];
    getDadosDasCotacoes(lotes).then(setDadosCotacoes).catch(() => setDadosCotacoes({}));
  }, [chaveDosLotes, lista]);
  const nomeDoFornecedor = (id?: string | null) => fornecedores.find((f) => f.id === id)?.nome || "";

  /** Melhor preço até agora do material na cotação dele ("GARRA · R$ 4,10"). */
  const melhorNaCotacao = (group: GroupedItem): string | null => {
    const dados = group.lote ? dadosCotacoes[group.lote] : undefined;
    if (!dados) return null;
    const unidades = [...new Set(dados.precos.filter((p) => p.item_id === group.item_id).map((p) => p.unidade))];
    for (const unidade of unidades) {
      const v = vencedorDaLinha(dados.precos, { item_id: group.item_id, unidade }, dados.fornecedorIds);
      if (v) return `${nomeDoFornecedor(v.fornecedor_id)} · ${formatarReais(v.preco)}${unidades.length > 1 ? `/${unidade}` : ""}`;
    }
    return null;
  };

  /** Aguardando agrupado por fornecedor: cada pedido feito fica junto. */
  const pedidosAguardando = useMemo(() => {
    const mapa = new Map<string, GroupedItem[]>();
    for (const g of porEtapa.AGUARDANDO) {
      const chave = g.fornecedor_id || "";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(g);
    }
    // Com fornecedor primeiro (por nome); os sem fornecedor no fim.
    return [...mapa.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || nomeDoFornecedor(a).localeCompare(nomeDoFornecedor(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porEtapa, fornecedores]);

  // Vem da lista inteira, não só da busca: o que foi marcado continua valendo.
  const gruposMarcados = useMemo(
    () => groupedItems.filter((g) => selecionados.has(g.item_id) && etapaDoGrupo(g) === etapaMarcada),
    [groupedItems, selecionados, etapaMarcada],
  );
  const idsMarcados = gruposMarcados.map((g) => g.item_id);

  const handleAddItemManual = async () => {
    if (!itemAtual || !user) return;
    setIsSubmitting(true);
    try {
      await adicionarItemReposicao(itemAtual.id, "MANUAL", undefined, qtdAdicionar);
      toast.success("Item adicionado à lista com sucesso!");
      setShowAddModal(false);
      setItemAtual(null);
      setBuscaItem("");
      setQtdAdicionar(1);
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao adicionar item.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Excluir != resolver. Resolver grava uma baixa no histórico (o material
  // chegou); excluir apaga uma linha que entrou por engano.
  const handleExcluirManual = async (group: GroupedItem) => {
    setIsResolving(true);
    try {
      for (const item of group.manual_items) {
        await excluirItemReposicaoManual(item.id);
      }
      toast.success("Item removido da lista de reposição.");
      setGrupoParaExcluir(null);
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível remover o item.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleSalvarQuantidadeManual = async () => {
    if (!grupoParaEditar) return;
    const nova = Number(novaQtdManual);
    if (!nova || nova <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setIsResolving(true);
    try {
      // Concentra o total na primeira linha manual e remove as demais, para o
      // item não ficar espalhado em várias entradas com o mesmo nome.
      const [principal, ...extras] = grupoParaEditar.manual_items;
      await editarQuantidadeManual(principal.id, nova);
      for (const extra of extras) {
        await excluirItemReposicaoManual(extra.id);
      }
      toast.success("Quantidade atualizada.");
      setGrupoParaEditar(null);
      setNovaQtdManual("");
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar a quantidade.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolverManuaisModal = async () => {
    if (!resolvingGroup || !user) return;
    const qtdResolver = Number(manualResolveQtd);
    if (qtdResolver <= 0) return;
    setIsResolving(true);
    try {
      let qtdRestante = qtdResolver;
      const atualizacoes = [];
      for (const item of resolvingGroup.manual_items) {
        if (qtdRestante <= 0) break;
        const subtracao = Math.min(item.quantidade || 1, qtdRestante);
        atualizacoes.push({ id: item.id, subtracao, itemOriginal: item });
        qtdRestante -= subtracao;
      }
      
      if (atualizacoes.length > 0) {
        await baixarQuantidadeReposicaoEmMassa(atualizacoes, user.id);
      }
      
      toast.success("Baixa manual realizada com sucesso!");
      setResolvingGroup(null);
      recarregarLista(false);
    } catch (e: any) {
      console.error(e); 
      toast.error("Falha ao dar baixa nos itens.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolverParcialInline = async (group: GroupedItem) => {
    const qtdResolver = Number(inlineResolveQtd);
    if (!user || qtdResolver <= 0) return;
    setIsResolving(true);
    try {
      let qtdRestante = qtdResolver;
      const allItems = [...group.manual_items, ...group.rupturas];
      const atualizacoes = [];
      
      for (const item of allItems) {
        if (qtdRestante <= 0) break;
        const subtracao = Math.min(item.quantidade || 1, qtdRestante);
        atualizacoes.push({ id: item.id, subtracao, itemOriginal: item });
        qtdRestante -= subtracao;
      }
      
      if (atualizacoes.length > 0) {
        await baixarQuantidadeReposicaoEmMassa(atualizacoes, user.id);
      }
      
      toast.success("Baixa realizada com sucesso!");
      setInlineResolveId(null);
      recarregarLista(false);
    } catch (e: any) {
      console.error(e); 
      toast.error("Falha ao dar baixa nos itens.");
    } finally {
      setIsResolving(false);
    }
  };

  /** Copia para a planilha de cotação. Devolve as linhas, ou null se falhou. */
  const copiarParaPlanilha = async (grupos: GroupedItem[]): Promise<string[] | null> => {
    const linhas = linhasParaCotacao(grupos);
    try {
      await navigator.clipboard.writeText(linhas.join("\r\n"));
      return linhas;
    } catch {
      toast.error("O navegador não liberou a cópia. Tente de novo.");
      return null;
    }
  };

  const avisoDaPlanilha = (linhas: string[]) =>
    `${linhas.length} ${linhas.length === 1 ? "linha copiada" : "linhas copiadas"}: na planilha, clique em B3 e cole (Ctrl+V).` +
    (linhas.length > 32 ? " A aba MODELO tem 32 linhas: insira mais antes de colar." : "");

  /** Os marcados viram uma cotação nova, e ela já abre para pôr os preços. */
  const novaCotacao = async () => {
    if (idsMarcados.length === 0) return;
    setAplicando(true);
    try {
      const lote = await moverParaCotacao(idsMarcados);
      setSelecionados(new Set());
      navigate(`/reposicao/cotacao/${lote}`);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível criar a cotação.");
    } finally {
      setAplicando(false);
    }
  };

  /** Para quem ainda usa a planilha: copia no formato dela. Nada muda de lugar. */
  const copiarLoteDeNovo = async (grupos: GroupedItem[]) => {
    const linhas = await copiarParaPlanilha(grupos);
    if (linhas) toast.success(avisoDaPlanilha(linhas));
  };

  /** A lista da cotação para pedir preço no WhatsApp. */
  const copiarListaDoLote = async (lote: string, grupos: GroupedItem[]) => {
    // Com as edições da cotação (nome, marca, unidade), igual à tela dela.
    const edicoes = await getLinhasEditadas(lote).catch(() => []);
    const linhasDoLote = montarLinhas(grupos.flatMap((g) => [...g.manual_items, ...g.rupturas]), edicoes);
    try {
      await navigator.clipboard.writeText(textoParaPedirPreco(linhasDoLote));
      toast.success("Lista copiada: cole no WhatsApp dos fornecedores.");
    } catch {
      toast.error("O navegador não liberou a cópia. Tente de novo.");
    }
  };

  const handlePrint = () => {
    const doc = new jsPDF({ compress: true });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Castelo Inn", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.text("Lista de Reposição de Estoque", 105, 28, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 105, 36, { align: "center" });

    const head = [["Nome do Item", "Qtd. Nec.", "Origem", "Etapa"]];
    const agora = Date.now();
    // Na ordem da compra: A comprar, Em cotação, Aguardando (urgentes no topo).
    const naOrdem = ETAPAS.flatMap(({ etapa }) =>
      ordenarNaEtapa(groupedItems.filter((g) => etapaDoGrupo(g) === etapa), etapa),
    );
    const body = naOrdem.map((group) => {
      const origens = [];
      if (group.rupturas.length > 0) origens.push(`Reqs: ${group.rupturas.map(r => r.requisicao?.codigo_requisicao || '?').join(', ')}`);
      if (group.manual_items.length > 0) origens.push('Manual');
      const origemStr = origens.join(" | ");
      
      const etapa = etapaDoGrupo(group);
      let statusStr =
        etapa === "COTACAO" ? "Em cotação"
        : etapa === "AGUARDANDO" ? `Aguardando · ${rotuloDaPrevisao(group, agora)}`
        : "A comprar";
      if (ehUrgente(group)) statusStr += ` · ${rotuloDaUrgencia(group, agora)}`;
      
      return [
        formatItemName(group.item?.nome) || "Item Desconhecido",
        descreverQuantidades([...group.manual_items, ...group.rupturas]),
        origemStr,
        statusStr
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: head,
      body: body,
      headStyles: { fillColor: [13, 148, 136] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 45 },
        3: { cellWidth: 45, halign: 'center' },
      },
    });

    imprimirPdf(doc);
  };

  /** Menu "⋯" do item: tudo o que não é o próximo passo da etapa. */
  const menuDoItem = (group: GroupedItem, etapa: EtapaReposicao, nome: string) => {
    const ids = [group.item_id];
    // Corrigir e remover só para linhas MANUAIS: a de ruptura vem de uma
    // requisição real e é tratada nela.
    const soManual = group.manual_items.length > 0 && group.rupturas.length === 0;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Opções de ${nome}`}
              className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            />
          }
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
          {etapa === "AGUARDANDO" ? (
            <>
              <TituloDoMenu>Mudar previsão</TituloDoMenu>
              <OpcoesDePrevisao aoEscolher={(p) => pedidoFeito(ids, p)} />
            </>
          ) : (
            <>
              <TituloDoMenu>{etapa === "COTACAO" ? "Pedido feito" : "Já pedido, sem cotação"}</TituloDoMenu>
              <OpcoesDePrevisao aoEscolher={(p) => pedidoFeito(ids, p)} />
              {SEPARADOR_DO_MENU}
              <TituloDoMenu>Urgente</TituloDoMenu>
              <OpcoesDeUrgencia urgente={ehUrgente(group)} aoEscolher={(p) => mudarUrgencia(ids, p)} />
            </>
          )}
          {SEPARADOR_DO_MENU}
          {etapa !== "COMPRAR" && (
            <DropdownMenuItem onClick={() => voltarParaComprar(ids, etapa)} className={ITEM_DO_MENU}>
              <Undo2 className="h-3.5 w-3.5 mr-2 text-slate-500" /> Voltar para A comprar
            </DropdownMenuItem>
          )}
          {etapa !== "AGUARDANDO" && (
            <DropdownMenuItem onClick={() => abrirChegou(group)} className={ITEM_DO_MENU}>
              <Check className="h-3.5 w-3.5 mr-2 text-slate-500" /> Chegou
            </DropdownMenuItem>
          )}
          {soManual && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setGrupoParaEditar(group);
                  setNovaQtdManual(group.total_quantidade);
                }}
                className={ITEM_DO_MENU}
              >
                <Pencil className="h-3.5 w-3.5 mr-2 text-slate-500" /> Corrigir quantidade
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setGrupoParaExcluir(group)}
                className={`${ITEM_DO_MENU} text-red-700 focus:bg-red-50`}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover da lista
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  /** Um material dentro do bloco: nome, quantidade, de onde veio e a marca. */
  const renderItem = (group: GroupedItem, etapa: EtapaReposicao) => {
    const nome = formatItemName(group.item?.nome) || "Item excluído";
    const urgente = ehUrgente(group);
    const marcavel = etapa !== "AGUARDANDO";
    const marcado = marcavel && etapaMarcada === etapa && selecionados.has(group.item_id);
    const resolvendoAqui = inlineResolveId === group.item_id;

    return (
      // Sem animação de entrada e saída: com vários itens mudando de bloco de
      // uma vez, a linha muda na hora e não fica linha fantasma.
      <div
        key={group.item_id}
        className={`border-l-4 ${urgente ? "border-l-red-400" : "border-l-transparent"} ${
          marcado ? "bg-teal-50/70" : "bg-white"
        }`}
      >
        <div className="flex items-start gap-3 pl-3 pr-2 py-2.5">
          {marcavel && (
            <div className="pt-0.5">
              <CaixaDeMarcar
                marcado={marcado}
                aoMudar={() => alternarItem(group.item_id, etapa)}
                rotulo={`Marcar ${nome}`}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-teal-950 [overflow-wrap:anywhere]">{nome}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600">
              {/* Unidade de cada falta, não a do catálogo. */}
              <span className="font-bold text-slate-800">
                {descreverQuantidades([...group.manual_items, ...group.rupturas])}
              </span>
              <span className="text-slate-300">·</span>
              {group.rupturas.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate(`/requisicoes/${r.requisicao_id}`)}
                  className="font-semibold text-teal-700 hover:underline"
                >
                  REQ #{r.requisicao?.codigo_requisicao ?? "?"}
                </button>
              ))}
              {group.manual_items.length > 0 && <span>{group.rupturas.length > 0 ? "+ manual" : "Manual"}</span>}
              {etapa === "AGUARDANDO" && group.preco_unitario != null && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-slate-700 tabular-nums">
                    {formatarReais(group.preco_unitario)}
                    {group.unidade_compra ? `/${group.unidade_compra}` : ""}
                  </span>
                </>
              )}
            </p>
            {etapa === "COTACAO" && melhorNaCotacao(group) && (
              <p className="mt-0.5 text-xs font-bold text-emerald-700 tabular-nums">Melhor: {melhorNaCotacao(group)}</p>
            )}
            {(urgente || etapa === "AGUARDANDO") && (
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${
                  urgente ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {urgente ? <AlertTriangle className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                {urgente ? rotuloDaUrgencia(group, nowTime) : rotuloDaPrevisao(group, nowTime)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {etapa === "AGUARDANDO" && !resolvendoAqui && (
              <Button
                variant="outline"
                onClick={() => abrirChegou(group)}
                className="h-8 px-2.5 text-xs font-bold text-teal-700 border-teal-200 bg-white hover:bg-teal-50 shadow-none"
              >
                <Check className="h-3.5 w-3.5" /> Chegou
              </Button>
            )}
            {menuDoItem(group, etapa, nome)}
          </div>
        </div>

        {/* Baixa na hora: já vem com a quantidade toda; chegou só parte, muda o número. */}
        {resolvendoAqui && (
          <div className="flex flex-wrap items-center gap-2 pl-4 pr-3 pb-3">
            <span className="text-xs font-bold text-slate-600">Chegou</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0.1}
              max={group.total_quantidade}
              step="any"
              value={inlineResolveQtd}
              onChange={(e) => setInlineResolveQtd(e.target.value === "" ? "" : Number(e.target.value))}
              aria-label={`Quantidade que chegou de ${nome}`}
              className="w-20 h-8 text-sm font-bold bg-white text-center"
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 bg-teal-600 hover:bg-teal-700 px-3 font-bold text-white shadow-none"
              disabled={isResolving || !inlineResolveQtd || Number(inlineResolveQtd) <= 0}
              onClick={() => handleResolverParcialInline(group)}
            >
              Dar baixa
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Cancelar"
              className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100"
              onClick={() => setInlineResolveId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const contagem: Record<EtapaReposicao, number> = {
    COMPRAR: porEtapa.COMPRAR.length,
    COTACAO: porEtapa.COTACAO.length,
    AGUARDANDO: porEtapa.AGUARDANDO.length,
  };
  const idsAComprar = porEtapa.COMPRAR.map((g) => g.item_id);
  const marcadosAComprar =
    etapaMarcada === "COMPRAR" ? idsAComprar.filter((id) => selecionados.has(id)).length : 0;

  return (
    <>
      <div className="space-y-4 max-w-6xl mx-auto pb-10 print:hidden">
        <h1 className={TITULO}>Lista de Reposição</h1>

        {/* BARRA DE AÇÕES: a busca ocupa o espaço livre, a ação principal ao lado. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <CampoBusca
            valor={searchTerm}
            onMudar={setSearchTerm}
            placeholder="Buscar item..."
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAddModal(true)}
              className={`${BOTAO_PRIMARIO} flex-1 sm:flex-none`}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar item
            </Button>
            <Button
              onClick={handlePrint}
              type="button"
              variant="outline"
              title="Imprimir a lista"
              aria-label="Imprimir a lista"
              className={BOTAO_ICONE}
            >
              <Printer className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setGerenciandoFornecedores(true)}
              variant="outline"
              title="Fornecedores"
              aria-label="Fornecedores"
              className={BOTAO_ICONE}
            >
              <Store className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowHistoryModal(true)}
              variant="outline"
              title="Histórico de baixas"
              aria-label="Histórico de baixas"
              className={BOTAO_ICONE}
            >
              <History className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-slate-200 rounded-2xl"></div>
            <div className="h-20 bg-slate-200 rounded-2xl"></div>
          </div>
        ) : groupedItems.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 border-dashed rounded-3xl">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-teal-500" />
            </div>
            <p className="text-slate-700 font-bold">Nenhum item para repor.</p>
          </div>
        ) : (
          <>
            {/* Celular: uma etapa por vez, nas abas (o mesmo padrão de Requisições). */}
            <div role="tablist" aria-label="Etapas da compra" className={`${ABAS_FILA} lg:hidden`}>
              {ETAPAS.map(({ etapa, curto }) => {
                const ativa = etapa === etapaAtiva;
                return (
                  <button
                    key={etapa}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => trocarEtapa(etapa)}
                    className={`${ABA_FILA} ${ativa ? ABA_ATIVA : ABA_INATIVA}`}
                  >
                    <span>{curto}</span>
                    <span className={`tabular-nums text-xs ${ativa ? "text-teal-700" : "text-slate-500"}`}>
                      {contagem[etapa]}
                    </span>
                  </button>
                );
              })}
            </div>

            {searchTerm.trim() && displayedItems.length === 0 && (
              <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">
                Nenhum item com “{searchTerm.trim()}”.
              </p>
            )}

            {/* Computador: os três blocos lado a lado, na ordem da compra. */}
            <div className="lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
              <Bloco
                titulo="A comprar"
                icone={<ShoppingCart />}
                total={contagem.COMPRAR}
                visivelNoCelular={etapaAtiva === "COMPRAR"}
                marcarTodos={{
                  marcado: idsAComprar.length > 0 && marcadosAComprar === idsAComprar.length,
                  parcial: marcadosAComprar > 0,
                  aoMudar: () => alternarVarios(idsAComprar, "COMPRAR"),
                }}
              >
                {porEtapa.COMPRAR.map((g) => renderItem(g, "COMPRAR"))}
              </Bloco>

              <Bloco
                titulo="Em cotação"
                icone={<FileSpreadsheet />}
                total={contagem.COTACAO}
                visivelNoCelular={etapaAtiva === "COTACAO"}
              >
                {/* Uma cotação embaixo da outra, no mesmo cartão, separadas por
                    uma faixa cinza. A mais antiga primeiro (a que espera resposta
                    há mais tempo); o número diferencia cópias do mesmo minuto. */}
                {[...lotesDeCotacao].reverse().map((l, indice) => {
                  const ids = l.grupos.map((g) => g.item_id);
                  const marcados = etapaMarcada === "COTACAO" ? ids.filter((id) => selecionados.has(id)).length : 0;
                  return (
                    <div key={l.lote} className="border-t-8 first:border-t-0 border-slate-100">
                      {/* Cabeçalho da cotação no estilo dos grupos de Requisições
                          (maiúsculas pequenas, fundo cinza), sem bolinha: não
                          pode parecer um item. "Marcar todos" fica no ⋯. */}
                      <div className="flex items-center gap-2 pl-4 pr-2 py-2 bg-slate-50 border-b border-slate-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                            Cotação {indice + 1}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500 tabular-nums truncate">
                            {l.em ? `${format(new Date(l.em), "dd/MM HH:mm")} · ` : ""}
                            {contarItens(ids.length)}
                            {marcados > 0 && ` · ${marcados} marcado${marcados === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        {/* Os preços e os pedidos ficam na tela da cotação. */}
                        <Button
                          onClick={() => navigate(`/reposicao/cotacao/${l.lote}`)}
                          className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700 font-bold text-white shadow-none"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" /> Abrir
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Opções da cotação ${indice + 1}`}
                                className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              />
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                            <DropdownMenuItem onClick={() => alternarVarios(ids, "COTACAO")} className={ITEM_DO_MENU}>
                              <Check className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              {marcados === ids.length ? "Desmarcar todos" : "Marcar todos"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copiarListaDoLote(l.lote, l.grupos)} className={ITEM_DO_MENU}>
                              <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" /> Copiar lista (WhatsApp)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copiarLoteDeNovo(l.grupos)} className={ITEM_DO_MENU}>
                              <FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-slate-500" /> Copiar para a planilha
                            </DropdownMenuItem>
                            {SEPARADOR_DO_MENU}
                            <TituloDoMenu>Pedido feito, sem preços</TituloDoMenu>
                            <OpcoesDePrevisao aoEscolher={(p) => pedidoFeito(ids, p)} />
                            {SEPARADOR_DO_MENU}
                            <DropdownMenuItem onClick={() => voltarParaComprar(ids, "COTACAO")} className={ITEM_DO_MENU}>
                              <Undo2 className="h-3.5 w-3.5 mr-2 text-slate-500" /> Voltar todos para A comprar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {l.grupos.map((g) => renderItem(g, "COTACAO"))}
                      </div>
                    </div>
                  );
                })}
              </Bloco>

              <Bloco
                titulo="Aguardando entrega"
                icone={<Truck />}
                total={contagem.AGUARDANDO}
                visivelNoCelular={etapaAtiva === "AGUARDANDO"}
              >
                {/* Um pedido por fornecedor, no mesmo cartão, como as cotações.
                    Sem nenhum pedido pela cotação do app, é a lista simples. */}
                {pedidosAguardando.length === 1 && !pedidosAguardando[0][0]
                  ? porEtapa.AGUARDANDO.map((g) => renderItem(g, "AGUARDANDO"))
                  : pedidosAguardando.map(([fornecedorId, grupos]) => {
                      const total = grupos.reduce((s, g) => s + (g.valor_pedido || 0), 0);
                      return (
                        <div key={fornecedorId || "sem"} className="border-t-8 first:border-t-0 border-slate-100">
                          <div className="pl-4 pr-3 py-2 bg-slate-50 border-b border-slate-200">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                              {fornecedorId ? `Pedido ${nomeDoFornecedor(fornecedorId) || "fornecedor"}` : "Sem fornecedor"}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500 tabular-nums">
                              {contarItens(grupos.length)}
                              {total > 0 && ` · ${formatarReais(Math.round(total * 100) / 100)}`}
                            </p>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {grupos.map((g) => renderItem(g, "AGUARDANDO"))}
                          </div>
                        </div>
                      );
                    })}
              </Bloco>
            </div>
          </>
        )}

        {/* BARRA DOS MARCADOS: a ação da etapa, presa ao pé da tela. */}
        {gruposMarcados.length > 0 && etapaMarcada && etapaMarcada !== "AGUARDANDO" && (
          <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-md">
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              aria-label="Limpar marcação"
              title="Limpar marcação"
              className="h-8 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mr-1.5 whitespace-nowrap text-sm font-bold text-slate-700">
              {gruposMarcados.length}
              <span className="max-[359px]:hidden"> {gruposMarcados.length === 1 ? "item" : "itens"}</span>
            </p>
            {etapaMarcada === "COMPRAR" ? (
              <>
                <Button
                  onClick={novaCotacao}
                  disabled={aplicando}
                  className="h-8 px-2.5 bg-teal-600 hover:bg-teal-700 font-bold text-white shadow-none"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 max-[359px]:hidden" />
                  Nova cotação
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={aplicando}
                    render={<Button variant="outline" className="h-8 px-2.5 font-bold text-slate-700 shadow-none" />}
                  >
                    Mais <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="end" className="w-60 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                    <TituloDoMenu>Já pedido, sem cotação</TituloDoMenu>
                    <OpcoesDePrevisao aoEscolher={(p) => pedidoFeito(idsMarcados, p)} />
                    {SEPARADOR_DO_MENU}
                    <TituloDoMenu>Urgente</TituloDoMenu>
                    <OpcoesDeUrgencia
                      urgente={gruposMarcados.some(ehUrgente)}
                      aoEscolher={(p) => mudarUrgencia(idsMarcados, p)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={aplicando}
                    render={<Button className="h-8 px-2.5 bg-teal-600 hover:bg-teal-700 font-bold text-white shadow-none" />}
                  >
                    <Truck className="h-3.5 w-3.5 max-[359px]:hidden" /> Pedido feito
                    <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="end" className="w-56 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                    <TituloDoMenu>Previsão de chegada</TituloDoMenu>
                    <OpcoesDePrevisao aoEscolher={(p) => pedidoFeito(idsMarcados, p)} />
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  onClick={() => voltarParaComprar(idsMarcados, "COTACAO")}
                  disabled={aplicando}
                  aria-label="Voltar para A comprar"
                  title="Voltar para A comprar"
                  className="h-8 px-2 sm:px-2.5 font-bold text-slate-700 shadow-none"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Voltar</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <GerenciarFornecedores
        aberto={gerenciandoFornecedores}
        aoFechar={() => {
          setGerenciandoFornecedores(false);
          getFornecedores().then(setFornecedores).catch(() => {});
        }}
      />

      {/* MODAL HISTÓRICO DE BAIXAS */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200 shadow-2xl rounded-2xl p-0 overflow-hidden flex flex-col gap-0">
          <div className="shrink-0 bg-slate-50 p-5 sm:p-6 border-b border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center mb-3">
              <History className="w-6 h-6 text-teal-700" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-800 mb-1">
              Histórico de Baixas
            </DialogTitle>
            <DialogDescription className="sr-only">
              Itens já resolvidos ou repostos.
            </DialogDescription>
          </div>

          {/* A lista fica com o espaço que sobra entre cabeçalho e rodapé. */}
          <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto space-y-3">
            {historicoItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Nenhum item com baixa registrada no histórico recente.
              </div>
            ) : (
              historicoItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex flex-col sm:flex-row justify-between sm:items-center p-4 bg-slate-50/60 border border-slate-200/80 rounded-xl gap-3 text-sm hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-base">
                      {formatItemName(item.item?.nome) || "Item"}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                      <span>Quantidade: <strong className="text-slate-800">{item.quantidade} {item.unidade || item.item?.unidade || 'UN'}</strong></span>
                      <span>•</span>
                      <span>Origem: {item.tipo_origem === 'RUPTURA' ? `Requisição #${item.requisicao?.codigo_requisicao || '?'}` : 'Manual'}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right text-xs text-slate-600 shrink-0">
                    <div>Baixa por: <strong className="text-slate-800">{nomeDoResponsavel(item.resolvido_por)}</strong></div>
                    {item.resolvido_em && (
                      <div className="text-slate-500 mt-0.5">
                        {format(new Date(item.resolvido_em), "dd/MM/yyyy 'às' HH:mm")}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {/* mx-0/mb-0: o rodapé padrão tem margem negativa pensada para
              janela com espaçamento interno; aqui o espaçamento é zero e ele
              vazava 16px para fora (cortado). */}
          <DialogFooter className="shrink-0 mx-0 mb-0 bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
            <Button variant="outline" onClick={() => setShowHistoryModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL RESOLVER REPOSICAO */}
      <Dialog open={!!resolvingGroup} onOpenChange={(o) => { if (!o) setResolvingGroup(null); }}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 shadow-2xl rounded-2xl p-0 overflow-hidden">
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/80 flex items-center justify-center mb-4">
              <CheckSquare className="w-6 h-6 text-slate-700" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-800 mb-1">Chegou</DialogTitle>
            <DialogDescription className="text-slate-700 text-base font-bold">
              {formatItemName(resolvingGroup?.item?.nome)}
            </DialogDescription>
          </div>
          
          <div className="p-6 space-y-8 max-h-[65vh] overflow-y-auto">
            {resolvingGroup?.manual_items && resolvingGroup.manual_items.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  Adicionados Manualmente
                </h4>
                
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 border border-slate-200/80 p-5 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1">Qtd Pendente</span>
                    <span className="text-slate-800 text-2xl font-black tracking-tight">
                      {descreverQuantidades(resolvingGroup.manual_items)}
                    </span>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <Input 
                      type="number" 
                      min={0.1} 
                      step={0.1}
                      className="w-full sm:w-28 h-12 font-bold bg-white border-slate-300 text-center text-lg focus-visible:ring-teal-500 rounded-lg shadow-md" 
                      value={manualResolveQtd} 
                      onChange={(e) => setManualResolveQtd(e.target.value === "" ? "" : Number(e.target.value))} 
                      placeholder="0.0" 
                    />
                    <Button 
                      className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 font-bold h-12 px-8 rounded-lg text-white" 
                      disabled={isResolving || !manualResolveQtd || Number(manualResolveQtd) <= 0} 
                      onClick={handleResolverManuaisModal}
                    >
                      Confirmar Baixa
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {resolvingGroup?.rupturas && resolvingGroup.rupturas.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  Ruptura de Requisições
                </h4>
                <div className="grid gap-3">
                  {resolvingGroup.rupturas.map(rup => (
                    <div key={rup.id} className="flex flex-col sm:flex-row justify-between sm:items-center bg-white p-5 border border-slate-200/80 rounded-xl gap-4 transition-colors hover:border-slate-300">
                      <div className="flex flex-col">
                        <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1">Requisição #{rup.requisicao?.codigo_requisicao}</span>
                        <span className="text-slate-800 text-xl font-black tracking-tight">
                          {rup.quantidade} <span className="text-sm font-medium text-slate-700 ml-1">{rup.unidade || resolvingGroup.item?.unidade || "UN"}</span>
                        </span>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full sm:w-auto h-12 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-teal-900 font-bold rounded-lg px-8 shadow-md" 
                        onClick={() => {
                          setResolvingGroup(null);
                          navigate(`/requisicoes/${rup.requisicao_id}/separacao`);
                        }}
                      >
                        Resolver na Requisição
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL CORRIGIR QUANTIDADE (item manual) */}
      <Dialog open={!!grupoParaEditar} onOpenChange={(o) => { if (!o) { setGrupoParaEditar(null); setNovaQtdManual(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir quantidade</DialogTitle>
            <DialogDescription>
              {formatItemName(grupoParaEditar?.item?.nome)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">
                Quantidade necessária ({grupoParaEditar?.item?.unidade || "UN"})
              </label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={novaQtdManual}
                onChange={(e) => setNovaQtdManual(e.target.value === "" ? "" : Number(e.target.value))}
                className="h-12 text-lg font-bold text-center"
                autoFocus
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setGrupoParaEditar(null)} disabled={isResolving}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 font-bold"
                onClick={handleSalvarQuantidadeManual}
                disabled={isResolving || !novaQtdManual || Number(novaQtdManual) <= 0}
              >
                {isResolving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL REMOVER ITEM MANUAL */}
      <Dialog open={!!grupoParaExcluir} onOpenChange={(o) => { if (!o) setGrupoParaExcluir(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover da lista de reposição?</DialogTitle>
            <DialogDescription>
              <span className="font-bold text-slate-800">
                {formatItemName(grupoParaExcluir?.item?.nome)}
              </span>{" "}
              sai da lista sem baixa no histórico. Se o material chegou, use
              "Chegou".
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setGrupoParaExcluir(null)} disabled={isResolving}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="font-bold"
              disabled={isResolving}
              onClick={() => grupoParaExcluir && handleExcluirManual(grupoParaExcluir)}
            >
              {isResolving ? "Removendo..." : "Remover"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL ADICIONAR ITEM MANUAL */}
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) { setShowAddModal(false); setItemAtual(null); setBuscaItem(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Item Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!itemAtual ? (
              <div className="space-y-2 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-slate-700" />
                  <Input
                    placeholder="Pesquisar item no estoque..."
                    value={buscaItem}
                    onChange={(e) => setBuscaItem(e.target.value)}
                    className="pl-10 h-12 bg-slate-50 border-slate-300 focus-visible:ring-slate-500 rounded-xl"
                  />
                </div>
                {(buscaItem || itensFiltrados.length <= 5) && (
                  <div className="border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-xl max-h-60 overflow-y-auto overscroll-contain bg-white w-full">
                    {itensFiltrados.length > 0 ? (
                      itensFiltrados.map((i) => (
                        <button
                          key={i.id}
                          onClick={() => {
                            setItemAtual(i);
                            setBuscaItem("");
                          }}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <span className="font-medium text-teal-900 block">{i.nome}</span>
                          <span className="text-slate-700 text-xs">Unidade: {i.unidade}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-700">
                        Nenhum item encontrado.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200/80 shadow-md shadow-slate-200/50 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-teal-900">{itemAtual.nome}</h3>
                    <p className="text-sm text-slate-700">Unidade: {itemAtual.unidade}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setItemAtual(null)} className="text-slate-700">
                    Trocar
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Quantidade Necessária</label>
                  <Input 
                    type="number" 
                    min={0.1} 
                    step={0.1}
                    value={qtdAdicionar}
                    onChange={(e) => setQtdAdicionar(Number(e.target.value))}
                    className="h-12 text-lg font-medium"
                  />
                </div>

                <Button 
                  onClick={handleAddItemManual} 
                  disabled={isSubmitting || qtdAdicionar <= 0}
                  className="w-full h-12 text-lg font-bold bg-teal-600 hover:bg-teal-700"
                >
                  {isSubmitting ? "Adicionando..." : "Adicionar à Lista"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
