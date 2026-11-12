import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getItens, createRequisicao, getUsuarios, getRequisicao, updateRequisicaoCompleta } from "@/services/api";
import { Item } from "@/types";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ArrowLeft, Search, List, PauseCircle, MessageSquareWarning, Send, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { playSound } from "@/lib/sounds";
import { formatItemName, UNIDADE_PADRAO } from "@/lib/utils";
import { opcoesDeUnidade, rotuloUnidade, unidadesDoItem } from "@/lib/unidades";
import { adicionarAoPedido, buscarItens, jaNoPedido, type LinhaPedido } from "@/lib/pedido";
import {
  ABA,
  ABA_ATIVA,
  ABA_INATIVA,
  BOTAO_ICONE,
  BOTAO_ICONE_LIGADO,
  BOTAO_PRIMARIO,
  CAMPO,
  SELETOR,
  TITULO,
} from "@/lib/estilos";
import { useBloqueio } from "@/contexts/BloqueioContext";

type Rascunho = {
  selecionados: LinhaPedido[];
  observacao: string;
  selectedUserId: string;
};

/** Caixa branca com linhas divididas: a mesma da tabela de Requisições. */
const LISTA = "bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden divide-y divide-slate-100";
const ROTULO_DO_CAMPO = "text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

/** Computador (mouse): depois de adicionar, o cursor volta para a busca. No
 *  celular não, senão o teclado abria sozinho a cada item. */
const temMouse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/** − quantidade +, na altura dos outros campos (44px). */
function Contador({
  valor,
  aoMudar,
  rotulo,
  inputRef,
  aoConfirmar,
}: {
  valor: number | "";
  aoMudar: (v: number | "") => void;
  rotulo: string;
  inputRef?: React.Ref<HTMLInputElement>;
  aoConfirmar?: () => void;
}) {
  const atual = typeof valor === "number" ? valor : 0;
  const mudar = (v: number) => aoMudar(Math.max(0, Math.round(v * 1000) / 1000));
  return (
    <div className="flex items-center h-11 shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => mudar(atual - 1)}
        disabled={atual <= 0}
        aria-label="Diminuir quantidade"
        className="h-full w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        enterKeyHint="done"
        step="any"
        min={0}
        value={valor}
        onChange={(e) => aoMudar(e.target.value === "" ? "" : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && aoConfirmar) {
            e.preventDefault();
            aoConfirmar();
          }
        }}
        aria-label={rotulo}
        className="h-full w-14 text-center text-base font-bold text-slate-800 border-x border-slate-200 focus:outline-none focus:bg-teal-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => mudar(atual + 1)}
        aria-label="Aumentar quantidade"
        className="h-full w-10 flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-manipulation"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function NovaRequisicao() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const [isInitializing, setIsInitializing] = useState(isEditMode);
  // Na edição, de quem é o pedido: aparece só para leitura e nunca é regravado
  // (o almoxarifado corrige itens e medidas, mas o pedido continua do setor).
  const [donoDoPedido, setDonoDoPedido] = useState<{ nome: string; departamento: string } | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const ehSolicitante = user?.perfil === "SOLICITANTE";

  const [estoqueItens, setEstoqueItens] = useState<Item[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selecionados, setSelecionados] = useState<LinhaPedido[]>([]);
  const [observacao, setObservacao] = useState("");
  const [obsAberta, setObsAberta] = useState(false);
  const [loading, setLoading] = useState(false);
  const { bloqueio } = useBloqueio();

  // Busca: o que foi digitado, a lista inteira aberta pelo botão, o material
  // aberto para escolher quantidade e unidade.
  const [busca, setBusca] = useState("");
  const [navegando, setNavegando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [qtdAberta, setQtdAberta] = useState<number | "">(1);
  // Começa vazia de propósito quando há mais de uma: a pessoa escolhe a
  // unidade. Com UN já marcado, "5 de carne" virava 5 UN quando era 5 KG.
  const [unidadeAberta, setUnidadeAberta] = useState("");
  const [destaque, setDestaque] = useState<number | null>(null);
  const [alturaPainel, setAlturaPainel] = useState(360);

  const ancoraRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const qtdRef = useRef<HTMLInputElement>(null);
  const linhasRef = useRef<(HTMLDivElement | null)[]>([]);

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
            setDonoDoPedido({ nome: req.usuario?.nome || "Solicitante", departamento: req.departamento });
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

  const painelAberto = navegando || busca.trim().length > 0;
  const resultados = useMemo(
    () => (painelAberto ? buscarItens(estoqueItens, busca) : []),
    [painelAberto, busca, estoqueItens],
  );

  // A lista de resultados cabe sempre ACIMA do teclado do celular: a altura
  // acompanha o pedaço da tela que está visível (visualViewport) e a lista
  // rola por dentro. Antes ela descia por baixo do teclado.
  useEffect(() => {
    if (!painelAberto) return;
    const vv = window.visualViewport;
    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const el = painelRef.current;
        if (!el) return;
        const fundo = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const livre = Math.floor(fundo - el.getBoundingClientRect().top - 12);
        setAlturaPainel(Math.min(520, Math.max(180, livre)));
      });
    };
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      cancelAnimationFrame(quadro);
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [painelAberto]);

  // Abriu a lista (primeira letra ou o botão): a busca sobe para o alto. Só ao
  // tocar no campo não bastava — com o pedido vazio a página era curta demais
  // para rolar, e o espaço de baixo só aparece quando a lista abre.
  useEffect(() => {
    if (painelAberto) subirBusca();
  }, [painelAberto]);

  // Item recém-adicionado: fica verde-claro por um instante e aparece na tela.
  useEffect(() => {
    if (destaque === null) return;
    linhasRef.current[destaque]?.scrollIntoView({ block: "nearest" });
    const t = setTimeout(() => setDestaque(null), 1600);
    return () => clearTimeout(t);
  }, [destaque]);

  /** Leva a busca para o alto da tela: o que aparece embaixo dela fica à vista. */
  const subirBusca = () => {
    // Sem animação: a rolagem suave era interrompida pelo teclado abrindo.
    setTimeout(() => ancoraRef.current?.scrollIntoView({ block: "start" }), 250);
  };

  const fecharPainel = () => {
    setBusca("");
    setNavegando(false);
    setAberto(null);
  };

  /** Abre o material na própria lista para escolher quantidade e unidade. */
  const abrirItem = (item: Item) => {
    if (aberto === item.id) {
      setAberto(null);
      return;
    }
    const unidades = unidadesDoItem(item);
    setAberto(item.id);
    setQtdAberta(1);
    setUnidadeAberta(unidades.length === 1 ? unidades[0] : "");
    if (temMouse()) {
      setTimeout(() => qtdRef.current?.focus(), 0);
    } else {
      // Fecha o teclado: a escolha de quantidade e unidade fica toda à vista.
      buscaRef.current?.blur();
    }
  };

  const adicionarAberto = () => {
    const item = estoqueItens.find((i) => i.id === aberto);
    if (!item) return;
    const quantidade = Number(qtdAberta);
    if (!quantidade || quantidade <= 0) {
      toast.error("Informe a quantidade.");
      return;
    }
    if (!unidadeAberta) {
      toast.error("Escolha a unidade.");
      return;
    }
    const { linhas, posicao } = adicionarAoPedido(selecionados, {
      item_id: item.id,
      quantidade,
      unidade: unidadeAberta,
      item,
    });
    setSelecionados(linhas);
    setAberto(null);
    setBusca("");
    // Na lista inteira, ela continua aberta para escolher o próximo; na busca,
    // fecha e o item aparece destacado no pedido.
    if (!navegando) setDestaque(posicao);
    if (temMouse()) buscaRef.current?.focus();
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

  const voltar = () => navigate(ehSolicitante ? "/" : "/requisicoes");

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
        // Só a observação e os itens: quem pediu e o setor não mudam na edição.
        // Antes ia também usuario_id, e um pedido sem dono gravado (ou com o
        // seletor mexido) passava a ser de quem editou, com o setor antigo.
        await updateRequisicaoCompleta(id, { observacao }, linhas, user.id);
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
          {bloqueio.motivo || "Inventário em andamento"}. Seu pedido fica guardado.
        </p>
        <Button variant="outline" onClick={voltar} className="font-bold">
          Voltar
        </Button>
      </div>
    );
  }

  const total = selecionados.length;

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={voltar}
          aria-label="Voltar"
          className="rounded-full bg-slate-100 hover:bg-slate-200 text-teal-900 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className={`${TITULO} min-w-0`}>{isEditMode ? "Editar requisição" : "Nova requisição"}</h1>
      </div>

      {/* Edição feita pelo almoxarifado: diz de quem é o pedido, sem deixar trocar. */}
      {isEditMode && !ehSolicitante && donoDoPedido && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
          Pedido de <strong>{donoDoPedido.nome}</strong> ({donoDoPedido.departamento})
        </div>
      )}

      {/* Almoxarifado criando em nome de outra pessoa: um seletor só, sem cartão. */}
      {!isEditMode && !ehSolicitante && (
        <div>
          <label htmlFor="pedido-para" className={ROTULO_DO_CAMPO}>Pedido para</label>
          <select
            id="pedido-para"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className={`${SELETOR} w-full`}
          >
            <option value="">Você mesmo ({user?.departamento})</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nome} ({u.departamento})</option>
            ))}
          </select>
        </div>
      )}

      {/* Observação: à vista desde o começo, mas só como um botão discreto até
          ser usada (o mesmo "Adicionar observação" da tela da requisição). */}
      {obsAberta || observacao.trim() ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-1.5">
          <label htmlFor="observacao-pedido" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800">
            <MessageSquareWarning className="h-4 w-4 shrink-0" /> Observação
          </label>
          <textarea
            id="observacao-pedido"
            rows={2}
            autoFocus={obsAberta && !observacao}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            onBlur={() => { if (!observacao.trim()) setObsAberta(false); }}
            placeholder="Ex.: entregar só amanhã; é para o evento de hoje à noite"
            className="w-full rounded-lg border border-amber-300 bg-white p-2.5 text-base text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setObsAberta(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 transition-colors"
        >
          <Plus className="h-4 w-4" /> Adicionar observação
        </button>
      )}

      {/* Busca: presa no alto ao rolar. Os resultados ficam logo abaixo dela e
          nunca passam por baixo do teclado. */}
      <div ref={ancoraRef} className={`h-0 mb-0 ${ehSolicitante ? "scroll-mt-16" : ""}`} aria-hidden />
      <div className={`sticky ${ehSolicitante ? "top-16" : "top-0"} z-20 -mx-1 px-1 py-1.5 bg-slate-50`}>
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              ref={buscaRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAberto(null); }}
              onFocus={subirBusca}
              onKeyDown={(e) => {
                if (e.key === "Enter" && resultados[0]) {
                  e.preventDefault();
                  abrirItem(resultados[0]);
                }
                if (e.key === "Escape") fecharPainel();
              }}
              placeholder="Buscar material"
              aria-label="Buscar material"
              className={`${CAMPO} w-full pl-9 pr-3 text-base sm:text-sm font-medium placeholder:font-normal placeholder:text-slate-400`}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (navegando) {
                fecharPainel();
              } else {
                setNavegando(true);
                setAberto(null);
              }
            }}
            title={navegando ? "Fechar a lista" : "Ver todos os materiais"}
            aria-label={navegando ? "Fechar a lista" : "Ver todos os materiais"}
            className={navegando ? BOTAO_ICONE_LIGADO : BOTAO_ICONE}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>

        {painelAberto && (
          <div
            ref={painelRef}
            style={{ maxHeight: alturaPainel }}
            className={`mt-2 ${LISTA} overflow-y-auto overscroll-contain`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <span>
                {resultados.length} {resultados.length === 1 ? "material" : "materiais"}
              </span>
              <button
                type="button"
                onClick={fecharPainel}
                className="inline-flex items-center gap-1 h-7 px-2 -mr-2 rounded-md hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" /> Fechar
              </button>
            </div>

            {resultados.length === 0 && (
              <p className="px-3 py-6 text-center text-sm font-medium text-slate-600">
                Nenhum material com “{busca.trim()}”.
              </p>
            )}

            {resultados.map((item) => {
              const unidades = unidadesDoItem(item);
              const ja = jaNoPedido(selecionados, item.id);
              const estaAberto = aberto === item.id;
              return (
                <div key={item.id} className={estaAberto ? "bg-teal-50/60" : ""}>
                  <button
                    type="button"
                    onClick={() => abrirItem(item)}
                    aria-expanded={estaAberto}
                    className="w-full min-h-12 flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">{item.nome}</span>
                      <span className="block text-[11px] font-semibold text-slate-500">{unidades.join(" · ")}</span>
                    </span>
                    {ja && (
                      <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 whitespace-nowrap">
                        {ja}
                      </span>
                    )}
                    {!estaAberto && <Plus className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>

                  {estaAberto && (
                    <div className="px-3 pb-3 space-y-2">
                      {unidades.length > 1 && (
                        <div role="radiogroup" aria-label="Unidade" className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                          {unidades.map((u) => (
                            <button
                              key={u}
                              type="button"
                              role="radio"
                              aria-checked={unidadeAberta === u}
                              onClick={() => setUnidadeAberta(u)}
                              title={u}
                              className={`${ABA} h-9 ${unidadeAberta === u ? ABA_ATIVA : ABA_INATIVA}`}
                            >
                              {rotuloUnidade(u)}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Contador
                          valor={qtdAberta}
                          aoMudar={setQtdAberta}
                          rotulo={`Quantidade de ${item.nome}`}
                          inputRef={qtdRef}
                          aoConfirmar={adicionarAberto}
                        />
                        <Button
                          onClick={adicionarAberto}
                          disabled={!qtdAberta || !unidadeAberta}
                          className={`${BOTAO_PRIMARIO} flex-1 min-w-0`}
                        >
                          <Plus className="h-4 w-4" />
                          {unidadeAberta ? `Adicionar ${unidadeAberta}` : "Adicionar"}
                        </Button>
                      </div>
                      {!unidadeAberta && (
                        <p className="text-xs font-semibold text-amber-800">Escolha a unidade.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Enquanto busca, só os resultados: o pedido volta ao fechar. O espaço
          embaixo deixa a busca subir até o alto mesmo com o pedido vazio. */}
      {painelAberto ? (
        <div className="h-[70vh]" aria-hidden />
      ) : total === 0 ? (
        <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200/80 shadow-md shadow-slate-200/50">
          <p className="text-slate-700 font-medium">Nenhum item no pedido.</p>
        </div>
      ) : (
        <section className="space-y-2">
          <h2 className="flex items-baseline gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-600">
            Itens do pedido <span className="font-semibold text-slate-400">· {total}</span>
          </h2>
          <div className={LISTA}>
            {selecionados.map((s, idx) => {
              const nome = formatItemName(s.item?.nome);
              return (
                <div
                  key={`${s.item_id}-${s.unidade}-${idx}`}
                  ref={(el) => { linhasRef.current[idx] = el; }}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors duration-700 ${
                    destaque === idx ? "bg-teal-50" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">{nome}</p>
                    {s.quantidade <= 0 && (
                      <p className="text-xs font-bold text-red-600">Quantidade zerada</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <Contador
                      valor={s.quantidade}
                      aoMudar={(v) => alterarQuantidade(idx, v === "" ? 0 : v)}
                      rotulo={`Quantidade de ${nome}`}
                    />
                    <select
                      value={s.unidade}
                      onChange={(e) => alterarUnidade(idx, e.target.value)}
                      aria-label={`Unidade de ${nome}`}
                      className={`${SELETOR} w-[4.5rem] px-2`}
                    >
                      {/* Cadastro atual, não a cópia guardada no rascunho: um
                          rascunho antigo não conhece as unidades novas do item. */}
                      {opcoesDeUnidade(estoqueItens.find((e) => e.id === s.item_id) ?? s.item, s.unidade).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoverItem(idx)}
                      aria-label={`Remover ${nome}`}
                      title="Remover do pedido"
                      className="h-11 w-11 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Enviar: sempre à mão, preso no pé da tela. Some enquanto busca, para
          não ficar flutuando em cima do teclado. */}
      {total > 0 && !painelAberto && (
        <div className="sticky bottom-3 z-20 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 pl-4 shadow-md">
          <p className="flex-1 min-w-0 text-sm font-bold text-slate-700 whitespace-nowrap">
            {total} {total === 1 ? "item" : "itens"}
            <span className="font-medium text-slate-500 max-[359px]:hidden"> no pedido</span>
          </p>
          <Button onClick={handleSubmit} disabled={loading} className={`${BOTAO_PRIMARIO} shadow-none`}>
            <Send className="h-4 w-4" />
            {loading
              ? (isEditMode ? "Salvando..." : "Enviando...")
              : (isEditMode ? "Salvar alterações" : "Enviar requisição")}
          </Button>
        </div>
      )}
    </div>
  );
}
