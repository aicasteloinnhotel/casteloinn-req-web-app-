import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ArrowRightLeft, Check, ChevronDown, Copy, FileUp, MessageCircle, Pencil, Plus, Truck, X } from "lucide-react";
import { EditarFornecedor } from "@/components/FornecedoresDialog";
import { EditarLinhaCotacao, ImportarOrcamento } from "@/components/CotacaoDialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { getListaReposicao, restaurarEstado } from "@/services/reposicao";
import {
  adicionarFornecedorNaCotacao,
  criarFornecedor,
  escolherFornecedor,
  fazerPedido,
  getDadosDasCotacoes,
  getFornecedores,
  getLinhasEditadas,
  getUltimosPrecos,
  salvarLinha,
  salvarPreco,
  tirarFornecedorDaCotacao,
  type UltimoPreco,
} from "@/services/cotacao";
import {
  partesDaCompra,
  type EdicaoDeLinha,
  alternativasDaLinha,
  faltaParaMinimo,
  linkWhatsapp,
  formatarReais,
  lerPreco,
  montarLinhas,
  pedidosPorFornecedor,
  precoNoCampo,
  textoDoPedido,
  textoParaPedirPreco,
  vencedorDaLinha,
  type Fornecedor,
  type LinhaCotacao,
  type PedidoDoFornecedor,
  type PrecoCotado,
} from "@/lib/cotacao";
import { PRAZOS_AGUARDANDO, type FotoDeEstado } from "@/lib/estadoReposicao";
import { formatarQtd } from "@/lib/unidades";
import { ABA_ATIVA, ABA_FILA, ABA_INATIVA, ABAS_FILA, CAMPO, TITULO } from "@/lib/estilos";
import type { ItemReposicao } from "@/types";

const CARTAO = "bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50";
const TITULO_DE_GRUPO = "px-1 text-xs font-black uppercase tracking-wider text-slate-600";
const ITEM_DO_MENU = "text-xs font-semibold text-slate-700 focus:bg-slate-50 cursor-pointer rounded-lg py-1.5";

/** Linha válida da lista: manual, ou ruptura cuja complementar ainda aguarda. */
const linhaAberta = (l: ItemReposicao) =>
  !l.resolvido && (l.tipo_origem === "MANUAL" || l.requisicao?.status === "AGUARDANDO");

const copiar = async (texto: string, aviso: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("O navegador não liberou a cópia. Tente de novo.");
  }
};

/**
 * Campo de preço: digita como quiser ("4,10", "4.10", "R$ 4,10") e grava ao
 * sair do campo (ou Enter). Vazio apaga o preço.
 */
function CampoPreco({
  valor, melhor, rotulo, aoSalvar,
}: {
  valor: number | null;
  melhor: boolean;
  rotulo: string;
  aoSalvar: (preco: number | null) => void;
}) {
  const [texto, setTexto] = useState(precoNoCampo(valor));
  useEffect(() => setTexto(precoNoCampo(valor)), [valor]);
  const confirmar = () => {
    const lido = lerPreco(texto);
    if (lido === undefined) {
      toast.error("Preço inválido. Use números, por exemplo 4,10.");
      setTexto(precoNoCampo(valor));
      return;
    }
    setTexto(precoNoCampo(lido));
    if (lido !== valor) aoSalvar(lido);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="next"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="—"
      aria-label={rotulo}
      className={`h-10 w-full rounded-lg border px-2 text-right text-base sm:text-sm tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 ${
        melhor ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-black" : "bg-white border-slate-200 text-slate-800"
      }`}
    />
  );
}

export default function CotacaoReposicao() {
  const { lote = "" } = useParams<{ lote: string }>();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [linhasReposicao, setLinhasReposicao] = useState<ItemReposicao[]>([]);
  const [numero, setNumero] = useState(1);
  const [criadaEm, setCriadaEm] = useState<string | null>(null);
  const [todos, setTodos] = useState<Fornecedor[]>([]);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [precos, setPrecos] = useState<PrecoCotado[]>([]);
  const [ultimos, setUltimos] = useState<Record<string, UltimoPreco>>({});
  const [fornecedorAtivo, setFornecedorAtivo] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [paraTirar, setParaTirar] = useState<Fornecedor | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const [editandoFornecedor, setEditandoFornecedor] = useState<Fornecedor | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [edicoes, setEdicoes] = useState<EdicaoDeLinha[]>([]);
  const [editandoLinha, setEditandoLinha] = useState<LinhaCotacao | null>(null);
  const [importando, setImportando] = useState(false);

  const carregar = useCallback(async (mostrar = true) => {
    if (mostrar) setCarregando(true);
    try {
      const [lista, fornecedores, dados, editadas] = await Promise.all([
        getListaReposicao(),
        getFornecedores(),
        getDadosDasCotacoes([lote]),
        getLinhasEditadas(lote),
      ]);
      setEdicoes(editadas);
      const abertas = lista.filter(linhaAberta);
      const daCotacao = abertas.filter((l) => l.cotacao_lote === lote);
      // Mesmo número da Lista de Reposição: a mais antiga é a Cotação 1.
      const inicioDeCada = new Map<string, string>();
      for (const l of abertas) {
        if (!l.cotacao_lote) continue;
        const em = l.cotacao_em || "";
        const atual = inicioDeCada.get(l.cotacao_lote);
        if (atual === undefined || em < atual) inicioDeCada.set(l.cotacao_lote, em);
      }
      const ordem = [...inicioDeCada.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([l]) => l);
      setNumero(Math.max(1, ordem.indexOf(lote) + 1));
      setCriadaEm(inicioDeCada.get(lote) || null);
      setLinhasReposicao(daCotacao);
      setTodos(fornecedores);
      setParticipantes(dados[lote]?.fornecedorIds || []);
      setPrecos(dados[lote]?.precos || []);
      setErro(null);
      const ids = [...new Set(daCotacao.map((l) => l.item_id))];
      getUltimosPrecos(ids).then(setUltimos).catch(() => setUltimos({}));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível abrir a cotação.");
    } finally {
      if (mostrar) setCarregando(false);
    }
  }, [lote]);

  useEffect(() => {
    carregar(true);
  }, [carregar]);

  const linhas = useMemo(() => montarLinhas(linhasReposicao, edicoes), [linhasReposicao, edicoes]);
  const fornecedoresDaCotacao = useMemo(
    () => participantes.map((id) => todos.find((f) => f.id === id)).filter((f): f is Fornecedor => !!f),
    [participantes, todos],
  );
  const ordem = fornecedoresDaCotacao.map((f) => f.id);
  const foraDaCotacao = todos.filter((f) => f.ativo !== false && !participantes.includes(f.id));
  const { pedidos, semPreco } = useMemo(
    () => pedidosPorFornecedor(linhas, precos, fornecedoresDaCotacao),
    [linhas, precos, fornecedoresDaCotacao],
  );
  const ativo = fornecedoresDaCotacao.find((f) => f.id === fornecedorAtivo) ?? fornecedoresDaCotacao[0] ?? null;
  const totalGeral = Math.round(pedidos.reduce((s, p) => s + p.total, 0) * 100) / 100;

  const precoDe = (linha: LinhaCotacao, fornecedorId: string) =>
    precos.find((p) => p.item_id === linha.item_id && p.unidade === linha.unidade && p.fornecedor_id === fornecedorId)?.preco ?? null;

  const nomeDe = (id: string | null | undefined) => todos.find((f) => f.id === id)?.nome || "";

  // ---------- ações ----------

  const gravarPreco = async (linha: LinhaCotacao, fornecedorId: string, preco: number | null) => {
    const antes = precos;
    setPrecos((atual) => {
      const resto = atual.filter(
        (p) => !(p.item_id === linha.item_id && p.unidade === linha.unidade && p.fornecedor_id === fornecedorId),
      );
      const anterior = atual.find(
        (p) => p.item_id === linha.item_id && p.unidade === linha.unidade && p.fornecedor_id === fornecedorId,
      );
      return [...resto, { item_id: linha.item_id, unidade: linha.unidade, fornecedor_id: fornecedorId, preco, escolhido: !!anterior?.escolhido && preco != null }];
    });
    try {
      await salvarPreco(lote, linha.item_id, linha.unidade, fornecedorId, preco);
    } catch (e: any) {
      setPrecos(antes);
      toast.error(e?.message || "Não foi possível gravar o preço.");
    }
  };

  const escolher = async (linha: LinhaCotacao, fornecedorId: string | null) => {
    const antes = precos;
    setPrecos((atual) =>
      atual.map((p) =>
        p.item_id === linha.item_id && p.unidade === linha.unidade ? { ...p, escolhido: p.fornecedor_id === fornecedorId } : p,
      ),
    );
    try {
      await escolherFornecedor(lote, linha.item_id, linha.unidade, fornecedorId);
    } catch (e: any) {
      setPrecos(antes);
      toast.error(e?.message || "Não foi possível escolher o fornecedor.");
    }
  };

  const incluirFornecedor = async (f: Fornecedor) => {
    try {
      await adicionarFornecedorNaCotacao(lote, f.id);
      setParticipantes((atual) => (atual.includes(f.id) ? atual : [...atual, f.id]));
      setFornecedorAtivo(f.id);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível incluir o fornecedor.");
    }
  };

  const cadastrarEIncluir = async () => {
    try {
      const f = await criarFornecedor(novoNome);
      setTodos((atual) => (atual.some((x) => x.id === f.id) ? atual : [...atual, f].sort((a, b) => a.nome.localeCompare(b.nome))));
      setNovoNome("");
      await incluirFornecedor(f);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível cadastrar o fornecedor.");
    }
  };

  const tirarFornecedor = async (f: Fornecedor) => {
    try {
      await tirarFornecedorDaCotacao(lote, f.id);
      setParticipantes((atual) => atual.filter((id) => id !== f.id));
      setPrecos((atual) => atual.filter((p) => p.fornecedor_id !== f.id));
      setParaTirar(null);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível tirar o fornecedor.");
    }
  };

  /** Grava como a linha vai na cotação (igual para todos os fornecedores). */
  const gravarLinha = async (linha: LinhaCotacao, campos: Parameters<typeof salvarLinha>[3]) => {
    try {
      await salvarLinha(lote, linha.item_id, linha.unidade, campos);
      setEdicoes((atual) => {
        const resto = atual.filter((e) => !(e.item_id === linha.item_id && e.unidade === linha.unidade));
        return campos ? [...resto, { item_id: linha.item_id, unidade: linha.unidade, ...campos }] : resto;
      });
      setEditandoLinha(null);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar o item.");
    }
  };

  /** Preenche os preços do orçamento importado na coluna do fornecedor. */
  const preencherOrcamento = async (fornecedor: Fornecedor, itens: { chave: string; preco: number }[]) => {
    let feitos = 0;
    for (const { chave, preco } of itens) {
      const linha = linhas.find((l) => l.chave === chave);
      if (!linha) continue;
      await gravarPreco(linha, fornecedor.id, preco);
      feitos++;
    }
    setImportando(false);
    setFornecedorAtivo(fornecedor.id);
    toast.success(`${feitos} ${feitos === 1 ? "preço preenchido" : "preços preenchidos"} na ${fornecedor.nome}.`);
  };

  /** Abre a conversa do fornecedor com o texto escrito; sem número, copia. */
  const abrirWhatsapp = (f: Fornecedor, texto: string) => {
    const link = linkWhatsapp(f.whatsapp, texto);
    if (link) {
      window.open(link, "_blank", "noopener");
      return;
    }
    copiar(texto, `${f.nome} não tem WhatsApp cadastrado: o texto foi copiado.`);
  };

  /** Pedido abaixo do mínimo: cada item vai para o próximo mais barato. */
  const passarParaOutros = async (pedido: PedidoDoFornecedor) => {
    let movidos = 0;
    for (const i of pedido.itens) {
      const outro = alternativasDaLinha(precos, i.linha, ordem, pedido.fornecedor.id)[0];
      if (!outro) continue;
      await escolher(i.linha, outro.fornecedor_id);
      movidos++;
    }
    const ficaram = pedido.itens.length - movidos;
    toast.success(
      `${movidos} ${movidos === 1 ? "item passou" : "itens passaram"} para outros fornecedores` +
        (ficaram > 0 ? `; ${ficaram} só ${ficaram === 1 ? "tem" : "têm"} preço na ${pedido.fornecedor.nome}.` : "."),
    );
  };

  const pedidoFeito = async (pedido: PedidoDoFornecedor, prazo: string) => {
    const ids = new Set(pedido.itens.flatMap((i) => i.linha.ids));
    // Para o "Desfazer": o estado de agora dessas linhas.
    const foto: FotoDeEstado[] = linhasReposicao
      .filter((l) => ids.has(l.id))
      .map((l) => ({
        id: l.id,
        urgente: !!l.urgente,
        prazo_original: l.prazo_original ?? null,
        prazo_target_date: l.prazo_target_date ?? null,
        cotacao_lote: l.cotacao_lote ?? null,
        cotacao_em: l.cotacao_em ?? null,
      }));
    setAplicando(true);
    try {
      await fazerPedido(
        pedido.itens.map((i) => {
          const outraCompra = i.linha.unidadeCompra !== i.linha.unidade || i.linha.quantidade !== i.linha.quantidadeReposicao;
          return {
            ids: i.linha.ids,
            preco: i.preco,
            ...(outraCompra ? { compra: { unidade: i.linha.unidadeCompra, partes: partesDaCompra(i.linha) } } : {}),
          };
        }),
        pedido.fornecedor.id,
        prazo,
      );
      const sobra = linhasReposicao.filter((l) => !ids.has(l.id)).length;
      toast.success(`Pedido ${pedido.fornecedor.nome}: ${pedido.itens.length} ${pedido.itens.length === 1 ? "item" : "itens"} em Aguardando entrega.`, {
        duration: 10000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await restaurarEstado(foto);
              toast.info("Desfeito: os itens voltaram para a cotação.");
              if (sobra === 0) navigate(`/reposicao/cotacao/${lote}`);
              carregar(false);
            } catch (e: any) {
              toast.error(e?.message || "Não foi possível desfazer.");
            }
          },
        },
      });
      if (sobra === 0) navigate("/reposicao");
      else await carregar(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível registrar o pedido.");
    } finally {
      setAplicando(false);
    }
  };

  // ---------- telas ----------

  if (carregando) {
    return <div className="text-center py-10 text-slate-600 font-medium">Carregando a cotação...</div>;
  }

  const voltar = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/reposicao")}
      aria-label="Voltar para a Lista de Reposição"
      className="rounded-full bg-slate-100 hover:bg-slate-200 text-teal-900 shrink-0"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );

  if (erro || linhas.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="font-bold text-slate-800">{erro || "Esta cotação não tem mais itens."}</p>
        <Button variant="outline" onClick={() => navigate("/reposicao")} className="font-bold">
          Voltar para a Lista de Reposição
        </Button>
      </div>
    );
  }

  /** Os que ainda não estão na cotação, um toque para incluir. */
  const botoesParaIncluir = foraDaCotacao.map((f) => (
    <button
      key={f.id}
      type="button"
      onClick={() => incluirFornecedor(f)}
      className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
    >
      <Plus className="h-3.5 w-3.5" /> {f.nome}
    </button>
  ));

  const campoNovoFornecedor = (
    <div className="flex gap-2">
      <input
        value={novoNome}
        onChange={(e) => setNovoNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && novoNome.trim()) cadastrarEIncluir();
        }}
        placeholder="Outro fornecedor"
        aria-label="Nome do novo fornecedor"
        className={`${CAMPO} min-w-0 flex-1 px-3 text-base sm:text-sm`}
      />
      <Button
        onClick={cadastrarEIncluir}
        disabled={!novoNome.trim()}
        className="h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-none"
      >
        Incluir
      </Button>
    </div>
  );

  const ultimoDe = (linha: LinhaCotacao) => {
    const u = ultimos[linha.item_id];
    if (!u) return null;
    return (
      <span className="block text-[11px] font-medium text-slate-500">
        Última: {formatarReais(u.preco)}
        {u.unidade && u.unidade.toUpperCase() !== linha.unidadeCompra ? `/${u.unidade}` : ""}
        {u.fornecedor_id && nomeDe(u.fornecedor_id) ? ` · ${nomeDe(u.fornecedor_id)}` : ""}
        {` · ${format(new Date(u.em), "dd/MM")}`}
      </span>
    );
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        {voltar}
        <div className="min-w-0 flex-1 basis-48">
          <h1 className={TITULO}>Cotação {numero}</h1>
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            {criadaEm ? `${format(new Date(criadaEm), "dd/MM HH:mm")} · ` : ""}
            {linhas.length} {linhas.length === 1 ? "item" : "itens"}
            {semPreco.length > 0 && semPreco.length < linhas.length && ` · ${semPreco.length} sem preço`}
          </p>
        </div>
      </div>

      {/* Fornecedores da cotação */}
      <section className="space-y-2">
        <h2 className={TITULO_DE_GRUPO}>Fornecedores</h2>
        <div className="flex flex-wrap items-center gap-2">
          {fornecedoresDaCotacao.map((f) => (
            <DropdownMenu key={f.id}>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  />
                }
              >
                {f.whatsapp && <MessageCircle className="h-3.5 w-3.5 text-teal-600" aria-label="Tem WhatsApp" />}
                {f.nome}
                {f.pedido_minimo ? (
                  <span className="text-[11px] font-semibold text-slate-400 tabular-nums">mín {formatarReais(f.pedido_minimo)}</span>
                ) : null}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                <DropdownMenuItem onClick={() => abrirWhatsapp(f, textoParaPedirPreco(linhas))} className={ITEM_DO_MENU}>
                  <MessageCircle className="h-3.5 w-3.5 mr-2 text-slate-500" />
                  {f.whatsapp ? "Pedir preço no WhatsApp" : "Copiar lista (sem WhatsApp)"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditandoFornecedor(f)} className={ITEM_DO_MENU}>
                  <Pencil className="h-3.5 w-3.5 mr-2 text-slate-500" /> WhatsApp e pedido mínimo
                </DropdownMenuItem>
                <div className="h-px bg-slate-100 my-1.5" />
                <DropdownMenuItem
                  onClick={() => (precos.some((p) => p.fornecedor_id === f.id && p.preco != null) ? setParaTirar(f) : tirarFornecedor(f))}
                  className={`${ITEM_DO_MENU} text-red-700 focus:bg-red-50`}
                >
                  <X className="h-3.5 w-3.5 mr-2" /> Tirar desta cotação
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          {fornecedoresDaCotacao.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setIncluindo(true)}
              className="h-9 px-3 rounded-full font-bold text-teal-700 border-dashed border-teal-300 bg-white hover:bg-teal-50 shadow-none"
            >
              <Plus className="h-4 w-4" /> Fornecedor
            </Button>
          )}
        </div>
      </section>

      {fornecedoresDaCotacao.length === 0 ? (
        // Cotação nova: os fornecedores cadastrados à mão, um toque para incluir.
        <div className={`${CARTAO} px-4 py-8 text-center space-y-3`}>
          <p className="text-sm font-semibold text-slate-700">Quem vai cotar?</p>
          <div className="flex flex-wrap justify-center gap-2">{botoesParaIncluir}</div>
          <div className="max-w-sm mx-auto pt-1">{campoNovoFornecedor}</div>
        </div>
      ) : (
        <>
          {/* PREÇOS — computador: a tabela inteira, como a planilha. */}
          <section className="space-y-2">
            {/* O orçamento que chega em foto ou PDF: vira .csv e entra aqui, num lugar só. */}
            <div className="flex items-end justify-between gap-2">
              <h2 className={TITULO_DE_GRUPO}>Preços</h2>
              <Button
                variant="outline"
                onClick={() => setImportando(true)}
                className="h-9 px-3 font-bold text-teal-700 border-teal-200 bg-white hover:bg-teal-50 shadow-none"
              >
                <FileUp className="h-4 w-4" /> Importar orçamento
              </Button>
            </div>

            <div className={`${CARTAO} hidden lg:block`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-600">
                      <th className="text-left px-4 py-2.5 sticky left-0 bg-slate-50 min-w-[14rem]">Item</th>
                      <th className="text-right px-2 py-2.5 w-20 whitespace-nowrap">Qtd</th>
                      {fornecedoresDaCotacao.map((f) => (
                        <th key={f.id} className="text-right px-2 py-2.5 w-28 min-w-[7rem] whitespace-nowrap">
                          {f.nome}
                          {f.pedido_minimo ? (
                            <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400 tabular-nums">
                              mín {formatarReais(f.pedido_minimo)}
                            </span>
                          ) : null}
                        </th>
                      ))}
                      <th className="text-left px-3 py-2.5 w-52 min-w-[13rem]">Leva</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linhas.map((linha) => {
                      const v = vencedorDaLinha(precos, linha, ordem);
                      const comPreco = fornecedoresDaCotacao.filter((f) => precoDe(linha, f.id) != null);
                      return (
                        <tr key={linha.chave} className="align-middle">
                          <td className="px-4 py-2 sticky left-0 bg-white">
                            {/* Tocar no nome edita como ele vai na cotação (para todos). */}
                            <button
                              type="button"
                              onClick={() => setEditandoLinha(linha)}
                              title="Editar produto, marca, unidade e quantidade"
                              className="group text-left"
                            >
                              <span className="flex items-center gap-1.5 font-bold text-teal-950">
                                {linha.nome}
                                <Pencil className="h-3 w-3 text-slate-300 group-hover:text-teal-600 shrink-0" />
                              </span>
                              {linha.marca && <span className="block text-[11px] font-semibold text-slate-600">{linha.marca}</span>}
                            </button>
                            {ultimoDe(linha)}
                          </td>
                          <td className="px-2 py-2 text-right whitespace-nowrap font-bold text-slate-700 tabular-nums">
                            {formatarQtd(linha.quantidade)} <span className="text-xs font-medium text-slate-500">{linha.unidadeCompra}</span>
                          </td>
                          {fornecedoresDaCotacao.map((f) => (
                            <td key={f.id} className="px-2 py-2">
                              <CampoPreco
                                valor={precoDe(linha, f.id)}
                                melhor={v?.fornecedor_id === f.id}
                                rotulo={`Preço de ${linha.nome} na ${f.nome}`}
                                aoSalvar={(p) => gravarPreco(linha, f.id, p)}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {comPreco.length === 0 ? (
                              <span className="text-xs text-slate-400">Sem preço</span>
                            ) : (
                              <select
                                value={v?.manual ? v.fornecedor_id : ""}
                                onChange={(e) => escolher(linha, e.target.value || null)}
                                aria-label={`Quem leva ${linha.nome}`}
                                className={`${CAMPO} h-10 w-full px-2`}
                              >
                                <option value="">
                                  {v && !v.manual ? `${nomeDe(v.fornecedor_id)} (menor)` : "Menor preço"}
                                </option>
                                {comPreco.map((f) => (
                                  <option key={f.id} value={f.id}>{f.nome}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Celular: um fornecedor por vez — é como os preços chegam no WhatsApp. */}
            <div className="lg:hidden space-y-2">
              <div role="tablist" aria-label="Fornecedor" className={ABAS_FILA}>
                {fornecedoresDaCotacao.map((f) => {
                  const ehAtivo = f.id === ativo?.id;
                  const preenchidos = linhas.filter((l) => precoDe(l, f.id) != null).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={ehAtivo}
                      onClick={() => setFornecedorAtivo(f.id)}
                      className={`${ABA_FILA} ${ehAtivo ? ABA_ATIVA : ABA_INATIVA}`}
                    >
                      <span>{f.nome}</span>
                      <span className={`tabular-nums text-xs ${ehAtivo ? "text-teal-700" : "text-slate-500"}`}>
                        {preenchidos}/{linhas.length}
                      </span>
                    </button>
                  );
                })}
              </div>
              {ativo && (
                <div className={`${CARTAO} divide-y divide-slate-100`}>
                  {linhas.map((linha) => {
                    const v = vencedorDaLinha(precos, linha, ordem);
                    return (
                      <div key={linha.chave} className="flex items-center gap-3 px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setEditandoLinha(linha)}
                          aria-label={`Editar ${linha.nome}`}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-sm font-bold text-teal-950 [overflow-wrap:anywhere]">
                            {linha.nome} <Pencil className="inline h-3 w-3 -mt-0.5 text-slate-300" />
                          </p>
                          <p className="text-xs text-slate-600">
                            <span className="font-bold text-slate-800">{formatarQtd(linha.quantidade)} {linha.unidadeCompra}</span>
                            {linha.marca && <> · {linha.marca}</>}
                            {v && v.fornecedor_id !== ativo.id && (
                              <> · melhor: {nomeDe(v.fornecedor_id)} {formatarReais(v.preco)}</>
                            )}
                          </p>
                          {ultimoDe(linha)}
                        </button>
                        <div className="w-28 shrink-0">
                          <CampoPreco
                            valor={precoDe(linha, ativo.id)}
                            melhor={v?.fornecedor_id === ativo.id}
                            rotulo={`Preço de ${linha.nome} na ${ativo.nome}`}
                            aoSalvar={(p) => gravarPreco(linha, ativo.id, p)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* PEDIDOS — o que sai da cotação, um por fornecedor. */}
          <section className="space-y-2">
            <h2 className={TITULO_DE_GRUPO}>
              Pedidos{totalGeral > 0 && <span className="font-semibold text-slate-400"> · {formatarReais(totalGeral)}</span>}
            </h2>
            {pedidos.length === 0 ? (
              <div className={`${CARTAO} px-4 py-8 text-center text-sm text-slate-600`}>
                Os pedidos aparecem aqui conforme os preços entram.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 lg:items-start">
                {pedidos.map((pedido) => {
                  const falta = faltaParaMinimo(pedido);
                  const podeTrocar = pedido.itens.some((i) => alternativasDaLinha(precos, i.linha, ordem, pedido.fornecedor.id).length > 0);
                  return (
                  // Abaixo do pedido mínimo: o cartão fica amarelo, diz quanto
                  // falta e oferece passar os itens para os outros fornecedores.
                  <div
                    key={pedido.fornecedor.id}
                    className={`${CARTAO} ${falta > 0 ? "border-amber-300 shadow-amber-100/60" : ""}`}
                  >
                    <div
                      className={`flex items-center gap-2 pl-4 pr-2 py-2.5 border-b ${
                        falta > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-900 truncate">{pedido.fornecedor.nome}</p>
                        <p className="text-[11px] font-medium text-slate-500 tabular-nums">
                          {pedido.itens.length} {pedido.itens.length === 1 ? "item" : "itens"} ·{" "}
                          <span className="font-bold text-slate-700">{formatarReais(pedido.total)}</span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => abrirWhatsapp(pedido.fornecedor, textoDoPedido(pedido))}
                        aria-label={
                          pedido.fornecedor.whatsapp
                            ? `Mandar pedido para ${pedido.fornecedor.nome} no WhatsApp`
                            : `Copiar pedido de ${pedido.fornecedor.nome}`
                        }
                        title={pedido.fornecedor.whatsapp ? "Abrir a conversa com o pedido escrito" : "Copiar o pedido (sem WhatsApp cadastrado)"}
                        className="h-8 w-8 shrink-0 text-teal-700 border-teal-200 bg-white hover:bg-teal-50 shadow-none"
                      >
                        {pedido.fornecedor.whatsapp ? <MessageCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={aplicando}
                          render={<Button className="h-8 px-2.5 text-xs bg-teal-600 hover:bg-teal-700 font-bold text-white shadow-none" />}
                        >
                          <Truck className="h-3.5 w-3.5" /> Pedido feito
                          <ChevronDown className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                          <div className="px-2 pt-1.5 pb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                            Previsão de chegada
                          </div>
                          {PRAZOS_AGUARDANDO.map((o) => (
                            <DropdownMenuItem key={o.prazo} onClick={() => pedidoFeito(pedido, o.prazo)} className={`${ITEM_DO_MENU} pl-4`}>
                              {o.rotulo}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {falta > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 bg-amber-50/60 border-b border-amber-200">
                        <p className="flex-1 min-w-[8rem] text-xs font-semibold text-amber-900 tabular-nums">
                          Faltam <span className="font-black">{formatarReais(falta)}</span>
                          <span className="font-medium text-amber-800"> (mín. {formatarReais(pedido.fornecedor.pedido_minimo)})</span>
                        </p>
                        {podeTrocar && (
                          <Button
                            variant="outline"
                            onClick={() => passarParaOutros(pedido)}
                            className="h-7 px-2 text-[11px] font-bold text-amber-900 border-amber-300 bg-white hover:bg-amber-100 shadow-none"
                          >
                            <ArrowRightLeft className="h-3 w-3" /> Passar para outros
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="divide-y divide-slate-100">
                      {pedido.itens.map((i) => {
                        const outros = alternativasDaLinha(precos, i.linha, ordem, pedido.fornecedor.id);
                        return (
                          <div key={i.linha.chave} className="flex items-center gap-2 pl-4 pr-2 py-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-teal-950 [overflow-wrap:anywhere]">{i.linha.nome}</p>
                              <p className="text-xs text-slate-600 tabular-nums">
                                {formatarQtd(i.linha.quantidade)} {i.linha.unidadeCompra} × {formatarReais(i.preco)}{i.linha.marca ? ` · ${i.linha.marca}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 font-bold text-slate-800 tabular-nums">{formatarReais(i.subtotal)}</span>
                            {/* Trocar de fornecedor: os outros com preço, do mais barato. */}
                            {outros.length > 0 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Trocar fornecedor de ${i.linha.nome}`}
                                      title="Trocar de fornecedor"
                                      className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                                    />
                                  }
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-60 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
                                  <div className="px-2 pt-1.5 pb-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                    Levar de
                                  </div>
                                  {outros.map((o) => {
                                    const dif = Math.round((o.preco - i.preco) * 100) / 100;
                                    return (
                                      <DropdownMenuItem
                                        key={o.fornecedor_id}
                                        onClick={() => escolher(i.linha, o.fornecedor_id)}
                                        className={`${ITEM_DO_MENU} flex justify-between gap-3`}
                                      >
                                        <span>{nomeDe(o.fornecedor_id)}</span>
                                        <span className="tabular-nums text-slate-500">
                                          {formatarReais(o.preco)}
                                          {dif !== 0 && <span className={dif > 0 ? "text-red-600" : "text-emerald-700"}> ({dif > 0 ? "+" : "−"}{formatarReais(Math.abs(dif))})</span>}
                                        </span>
                                      </DropdownMenuItem>
                                    );
                                  })}
                                  {vencedorDaLinha(precos, i.linha, ordem)?.manual && (
                                    <>
                                      <div className="h-px bg-slate-100 my-1.5" />
                                      <DropdownMenuItem onClick={() => escolher(i.linha, null)} className={ITEM_DO_MENU}>
                                        Voltar para o menor preço
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="w-8 shrink-0" aria-hidden />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
            {semPreco.length > 0 && (
              <p className="px-1 text-xs text-slate-600 [overflow-wrap:anywhere]">
                <span className="font-bold">Sem preço ({semPreco.length}):</span> {semPreco.map((l) => l.nome).join(", ")}
              </p>
            )}
          </section>
        </>
      )}

      <EditarLinhaCotacao linha={editandoLinha} aoFechar={() => setEditandoLinha(null)} aoSalvar={gravarLinha} />
      <ImportarOrcamento
        aberto={importando}
        fornecedores={fornecedoresDaCotacao}
        inicial={ativo?.id ?? null}
        linhas={linhas}
        aoFechar={() => setImportando(false)}
        aoPreencher={preencherOrcamento}
      />

      <EditarFornecedor
        fornecedor={editandoFornecedor}
        aoFechar={() => setEditandoFornecedor(null)}
        aoSalvar={(f) => setTodos((atual) => atual.map((x) => (x.id === f.id ? f : x)))}
      />

      {/* Incluir fornecedor: os cadastrados num toque, ou um novo. */}
      <Dialog open={incluindo} onOpenChange={(o) => { setIncluindo(o); if (!o) setNovoNome(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Incluir fornecedor</DialogTitle>
            <DialogDescription className="sr-only">Escolha um fornecedor cadastrado ou cadastre outro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {foraDaCotacao.length > 0 && <div className="flex flex-wrap gap-2">{botoesParaIncluir}</div>}
            {campoNovoFornecedor}
          </div>
        </DialogContent>
      </Dialog>

      {/* Tirar fornecedor que já tem preço: confirma, porque os preços dele somem. */}
      <Dialog open={!!paraTirar} onOpenChange={(o) => { if (!o) setParaTirar(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tirar {paraTirar?.nome} da cotação?</DialogTitle>
            <DialogDescription>Os preços dele nesta cotação são apagados.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setParaTirar(null)}>Voltar</Button>
            <Button variant="destructive" className="font-bold" onClick={() => paraTirar && tirarFornecedor(paraTirar)}>
              <Check className="h-4 w-4" /> Tirar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
