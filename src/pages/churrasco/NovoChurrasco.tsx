import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, Search, Send, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { criarChurrasco, getItens, getUsuarios } from "@/services/api";
import type { Item, Usuario } from "@/types";
import { toast } from "@/lib/toast";
import { formatItemName } from "@/lib/utils";
import { formatarQtd, opcoesDeUnidade } from "@/lib/unidades";
import { buscarItens } from "@/lib/pedido";
import { lerQuantidade } from "@/lib/devolucaoEmLote";
import {
  GRUPOS, KG_POR_PAX, resolverModelo, sugestaoCarneKg, tarefasIniciais,
  type GrupoChurrasco, type ItemDoModelo, type TipoChurrasco,
} from "@/lib/churrasco";
import { ABA, ABA_ATIVA, ABA_INATIVA, BOTAO_PRIMARIO, CAMPO, SELETOR, TITULO } from "@/lib/estilos";

/** Caixa branca com linhas divididas: a mesma da Nova Requisição. */
const LISTA = "bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden divide-y divide-slate-100";
const ROTULO = "text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";
const RASCUNHO = "churrasco_rascunho_v1";
/** Texto da busca de cada grupo, para incluir um item que não está na ficha. */
const ADICIONAR: Record<GrupoChurrasco, string> = {
  CARNE: "Adicionar carne...",
  BEBIDA: "Adicionar bebida...",
  HORTIFRUTI: "Adicionar hortifruti...",
  OUTROS: "Adicionar outro item...",
};

type Linha = { item: Item; grupo: GrupoChurrasco; unidade: string; qtd: string };
type Rascunho = {
  empresa: string; data: string; horario: string; pax: string; tipo: TipoChurrasco; donoId: string;
  linhas: { item_id: string; grupo: GrupoChurrasco; unidade: string; qtd: string }[];
  /** Itens do modelo tirados desta ficha. */
  removidos?: string[];
};

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const lerRascunho = (): Rascunho | null => {
  try {
    const t = localStorage.getItem(RASCUNHO);
    return t ? (JSON.parse(t) as Rascunho) : null;
  } catch {
    return null;
  }
};

export default function NovoChurrasco() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [catalogo, setCatalogo] = useState<Item[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [empresa, setEmpresa] = useState("");
  const [data, setData] = useState(hoje());
  const [horario, setHorario] = useState("");
  const [pax, setPax] = useState("");
  const [tipo, setTipo] = useState<TipoChurrasco>("PEQUENO");
  const [donoId, setDonoId] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [faltando, setFaltando] = useState<ItemDoModelo[]>([]);
  const [busca, setBusca] = useState<Partial<Record<GrupoChurrasco, string>>>({});
  // Itens do modelo que a pessoa tirou desta ficha (para o rascunho lembrar).
  const [removidos, setRemovidos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    Promise.all([getItens(), getUsuarios()])
      .then(([itens, us]) => {
        if (!vivo) return;
        const ativos = itens.filter((i) => i.ativo);
        setCatalogo(ativos);
        const ativosUs = us.filter((u) => u.ativo);
        setUsuarios(ativosUs);
        const { encontrados, faltando } = resolverModelo(ativos);
        setFaltando(faltando);
        let base: Linha[] = encontrados.map((e) => ({ item: e.item, grupo: e.grupo, unidade: e.unidade, qtd: "" }));
        // Quem recebe: o usuário EVENTOS, se existir; senão o primeiro do setor Eventos.
        const eventos = ativosUs.filter((u) => /evento/i.test(u.departamento));
        let dono = (eventos.find((u) => /^eventos$/i.test(u.nome.trim())) || eventos[0])?.id || "";
        const r = lerRascunho();
        if (r) {
          setEmpresa(r.empresa || ""); setData(r.data || hoje()); setHorario(r.horario || "");
          setPax(r.pax || ""); setTipo(r.tipo === "GRANDE" ? "GRANDE" : "PEQUENO");
          if (r.donoId && ativosUs.some((u) => u.id === r.donoId)) dono = r.donoId;
          const porId = new Map(ativos.map((i) => [i.id, i]));
          const fora = new Set(r.removidos || []);
          base = base.filter((b) => !fora.has(b.item.id));
          for (const l of r.linhas || []) {
            const ja = base.find((b) => b.item.id === l.item_id);
            if (ja) { ja.qtd = l.qtd; ja.unidade = l.unidade || ja.unidade; ja.grupo = l.grupo || ja.grupo; continue; }
            const item = porId.get(l.item_id);
            if (item) base = [...base, { item, grupo: l.grupo, unidade: l.unidade, qtd: l.qtd }];
          }
        }
        setDonoId(dono);
        setRemovidos(r?.removidos || []);
        setLinhas(base);
      })
      .catch(() => toast.error("Não foi possível carregar os materiais."))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, []);

  // Rascunho: sair no meio não perde a ficha.
  useEffect(() => {
    if (carregando) return;
    try {
      const r: Rascunho = {
        empresa, data, horario, pax, tipo, donoId,
        linhas: linhas.map((l) => ({ item_id: l.item.id, grupo: l.grupo, unidade: l.unidade, qtd: l.qtd })),
        removidos,
      };
      localStorage.setItem(RASCUNHO, JSON.stringify(r));
    } catch { /* sem armazenamento: segue sem rascunho */ }
  }, [carregando, empresa, data, horario, pax, tipo, donoId, linhas, removidos]);

  const paxNum = Math.max(0, Math.floor(Number(pax) || 0));
  const sugestao = sugestaoCarneKg(paxNum, tipo);
  const qtdDe = (l: Linha) => { const n = lerQuantidade(l.qtd); return Number.isFinite(n) && n > 0 ? n : 0; };
  const preenchidas = linhas.filter((l) => qtdDe(l) > 0);
  const invalidas = linhas.filter((l) => l.qtd.trim() && !(lerQuantidade(l.qtd) >= 0));
  const kgCarne = Math.round(
    linhas.filter((l) => l.grupo === "CARNE" && l.unidade === "KG").reduce((s, l) => s + qtdDe(l), 0) * 1000,
  ) / 1000;
  const dono = usuarios.find((u) => u.id === donoId);
  const podeCriar = !!empresa.trim() && !!dono && preenchidas.length > 0 && invalidas.length === 0 && !enviando;

  const mudar = (itemId: string, campo: "qtd" | "unidade", valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.item.id === itemId ? { ...l, [campo]: valor } : l)));

  const remover = (itemId: string) => {
    setLinhas((ls) => ls.filter((l) => l.item.id !== itemId));
    setRemovidos((rs) => (rs.includes(itemId) ? rs : [...rs, itemId]));
  };

  const adicionar = (grupo: GrupoChurrasco, item: Item) => {
    setRemovidos((rs) => rs.filter((id) => id !== item.id));
    setLinhas((ls) => (ls.some((l) => l.item.id === item.id) ? ls : [...ls, { item, grupo, unidade: opcoesDeUnidade(item, "")[0] || item.unidade || "UN", qtd: "" }]));
    setBusca((b) => ({ ...b, [grupo]: "" }));
    setTimeout(() => (document.getElementById(`qtd-${item.id}`) as HTMLInputElement | null)?.focus(), 50);
  };

  const resultados = (grupo: GrupoChurrasco) => {
    const t = (busca[grupo] || "").trim();
    if (t.length < 2) return [];
    const ja = new Set(linhas.map((l) => l.item.id));
    return buscarItens(catalogo, t).filter((i) => !ja.has(i.id)).slice(0, 6);
  };

  const criar = async () => {
    if (!user || !dono || !podeCriar) return;
    setEnviando(true);
    try {
      const grupos: Record<string, string> = {};
      for (const l of preenchidas) grupos[l.item.id] = l.grupo;
      const criada = await criarChurrasco(
        { empresa, data_evento: data || null, horario, pax: paxNum || null, tipo, grupos, tarefas: tarefasIniciais() },
        { id: dono.id, departamento: dono.departamento },
        preenchidas.map((l) => ({ item_id: l.item.id, quantidade: qtdDe(l), unidade: l.unidade, nome: formatItemName(l.item.nome) })),
        user.id,
      );
      try { localStorage.removeItem(RASCUNHO); } catch { /* ok */ }
      toast.success(`Churrasco criado: REQ #${criada.codigo_requisicao ?? ""}.`);
      navigate(`/requisicoes/${criada.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível criar o churrasco.");
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return <div className="py-20 text-center text-slate-600 font-medium">Carregando materiais...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/churrascos")}
          aria-label="Voltar"
          className="rounded-full bg-slate-100 hover:bg-slate-200 text-teal-900 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className={`${TITULO} min-w-0`}>Novo churrasco</h1>
      </div>

      {/* EVENTO */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/50 space-y-3">
        <div>
          <label htmlFor="ch-empresa" className={ROTULO}>Empresa</label>
          <input id="ch-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Ex.: Ponta Agronegócio" className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ch-data" className={ROTULO}>Data</label>
            <input id="ch-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={`${CAMPO} w-full px-3`} />
          </div>
          <div>
            <label htmlFor="ch-horario" className={ROTULO}>Horário</label>
            <input id="ch-horario" value={horario} onChange={(e) => setHorario(e.target.value)}
              placeholder="18h às 23h" className={`${CAMPO} w-full px-3 text-base sm:text-sm`} />
          </div>
        </div>
        {/* PAX estreito, Tipo largo: "Pequeno | Grande" cabe no celular. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
          <div>
            <label htmlFor="ch-pax" className={ROTULO}>PAX</label>
            <input id="ch-pax" type="text" inputMode="numeric" value={pax}
              onChange={(e) => setPax(e.target.value.replace(/\D/g, ""))}
              placeholder="0" className={`${CAMPO} w-full px-3 text-base font-black`} />
          </div>
          <div>
            <span className={ROTULO}>Tipo</span>
            <div role="radiogroup" aria-label="Tipo de churrasco" className="flex h-11 p-1 bg-slate-100 rounded-lg border border-slate-200">
              {(["PEQUENO", "GRANDE"] as TipoChurrasco[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => setTipo(t)}
                  className={`${ABA} px-2 ${tipo === t ? ABA_ATIVA : ABA_INATIVA}`}>
                  {t === "PEQUENO" ? "Pequeno" : "Grande"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="ch-dono" className={ROTULO}>Quem recebe</label>
          <select id="ch-dono" value={donoId} onChange={(e) => setDonoId(e.target.value)} className={`${SELETOR} w-full`}>
            <option value="" disabled>Escolha...</option>
            {usuarios
              .slice()
              .sort((a, b) => Number(/evento/i.test(b.departamento)) - Number(/evento/i.test(a.departamento)) || a.nome.localeCompare(b.nome, "pt-BR"))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.nome} · {u.departamento}</option>
              ))}
          </select>
        </div>
        {paxNum > 0 && (
          <p className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
            <Flame className="h-4 w-4 shrink-0 text-teal-700" />
            <span>
              Carne sugerida: <strong>{formatarQtd(sugestao)} kg</strong>
              <span className="text-teal-700"> ({paxNum} PAX × {formatarQtd(KG_POR_PAX[tipo])} kg)</span>
              {kgCarne > 0 && <> · na ficha: <strong>{formatarQtd(kgCarne)} kg</strong></>}
            </span>
          </p>
        )}
      </section>

      {faltando.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <span>
            Ainda não cadastrados: <strong>{faltando.map((f) => f.nome).join(", ")}</strong>. Para usar, cadastre
            em Controle de Itens.
          </span>
        </p>
      )}

      {/* GRUPOS: a ficha da planilha. Em branco = não vai. */}
      {GRUPOS.map(({ grupo, rotulo }) => {
        const doGrupo = linhas.filter((l) => l.grupo === grupo);
        const n = doGrupo.filter((l) => qtdDe(l) > 0).length;
        const achados = resultados(grupo);
        return (
          <section key={grupo} className="space-y-2">
            <h2 className="flex items-baseline gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-600">
              {rotulo}
              <span className="font-semibold text-slate-400">
                · {grupo === "CARNE" && kgCarne > 0 ? `${formatarQtd(kgCarne)} kg` : `${n} ${n === 1 ? "item" : "itens"}`}
              </span>
              {grupo === "BEBIDA" && <span className="ml-auto text-[10px] font-bold normal-case tracking-normal text-violet-700">só as bebidas voltam</span>}
            </h2>
            <div className={LISTA}>
              {doGrupo.map((l) => (
                <div key={l.item.id} className={`grid grid-cols-[minmax(0,1fr)_4.5rem_4.25rem_2.25rem] items-center gap-1.5 pl-3 pr-1.5 py-2 ${qtdDe(l) > 0 ? "bg-teal-50/50" : ""}`}>
                  <label htmlFor={`qtd-${l.item.id}`} className="min-w-0 text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">
                    {formatItemName(l.item.nome)}
                  </label>
                  <input
                    id={`qtd-${l.item.id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.qtd}
                    onChange={(e) => mudar(l.item.id, "qtd", e.target.value.replace(/[^\d.,]/g, ""))}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    aria-label={`Quantidade de ${formatItemName(l.item.nome)}`}
                    className={`${CAMPO} w-full px-2 text-center text-base font-black tabular-nums`}
                  />
                  <select
                    value={l.unidade}
                    onChange={(e) => mudar(l.item.id, "unidade", e.target.value)}
                    aria-label={`Unidade de ${formatItemName(l.item.nome)}`}
                    className={`${SELETOR} w-full px-2`}
                  >
                    {opcoesDeUnidade(l.item, l.unidade).map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  {/* Lixeira vermelha, como em Itens e Usuários: cada churrasco usa produtos diferentes. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remover(l.item.id)}
                    aria-label={`Tirar ${formatItemName(l.item.nome)} da ficha`}
                    title="Tirar da ficha"
                    className="h-9 w-9 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {/* Item fora do modelo (ex.: costela, bananinha): busca no cadastro. */}
              <div className="relative px-3 py-2 bg-slate-50/60">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={busca[grupo] || ""}
                  onChange={(e) => setBusca((b) => ({ ...b, [grupo]: e.target.value }))}
                  placeholder={ADICIONAR[grupo]}
                  aria-label={`Adicionar item a ${rotulo}`}
                  className={`${CAMPO} w-full pl-9 pr-3 text-base sm:text-sm font-medium placeholder:font-normal placeholder:text-slate-400`}
                />
              </div>
              {achados.map((i) => (
                <button key={i.id} type="button" onClick={() => adicionar(grupo, i)}
                  className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-teal-50">
                  {formatItemName(i.nome)}
                  <span className="ml-2 text-xs font-normal text-slate-500">{(i.unidades?.length ? i.unidades : [i.unidade]).join(" · ")}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {/* Criar: preso no pé da tela, como o Enviar da Nova Requisição. */}
      <div className="sticky bottom-3 z-20 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-1.5 pl-4 shadow-md">
        <p className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">
          {preenchidas.length} {preenchidas.length === 1 ? "item" : "itens"}
          {kgCarne > 0 && <span className="font-medium text-slate-500"> · {formatarQtd(kgCarne)} kg de carne</span>}
        </p>
        <Button onClick={criar} disabled={!podeCriar} className={`${BOTAO_PRIMARIO} shadow-none`}
          title={!empresa.trim() ? "Informe a empresa" : !dono ? "Escolha quem recebe" : preenchidas.length === 0 ? "Preencha a quantidade de algum item" : undefined}>
          <Send className="h-4 w-4" /> {enviando ? "Criando..." : "Criar churrasco"}
        </Button>
      </div>
    </div>
  );
}
