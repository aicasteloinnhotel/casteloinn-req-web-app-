/**
 * Churrasco: uma requisição normal do setor Eventos com os dados do evento ao
 * lado (tabela churrascos, AJUSTE_11). Substitui a FICHA CHURRASCO.xlsx.
 *
 * Caminho: 1) monta a ficha (ida) → 2) separação e conferência do gerente
 * (assinaturas, como qualquer requisição) → 3) evento → 4) conta a volta das
 * bebidas → 5) lança no TOTVS só o que foi consumido. Carne, hortifruti e
 * outros não voltam: são consumidos no evento. Só bebida volta.
 */

export type GrupoChurrasco = "CARNE" | "BEBIDA" | "HORTIFRUTI" | "OUTROS";
export type TipoChurrasco = "PEQUENO" | "GRANDE";

export const GRUPOS: { grupo: GrupoChurrasco; rotulo: string }[] = [
  { grupo: "CARNE", rotulo: "Carnes" },
  { grupo: "BEBIDA", rotulo: "Bebidas" },
  { grupo: "HORTIFRUTI", rotulo: "Hortifruti" },
  { grupo: "OUTROS", rotulo: "Outros" },
];

/** Carne por pessoa (aba "QTD Carnes" da planilha). */
export const KG_POR_PAX: Record<TipoChurrasco, number> = { PEQUENO: 0.5, GRANDE: 0.47 };

export const sugestaoCarneKg = (pax: number, tipo: TipoChurrasco): number =>
  pax > 0 ? Math.round(pax * KG_POR_PAX[tipo] * 100) / 100 : 0;

/** Itens da aba MODELO, com o nome do cadastro do app. `unidade` é a preferida. */
export type ItemDoModelo = { grupo: GrupoChurrasco; nome: string; unidade?: string };

export const MODELO: ItemDoModelo[] = [
  // Carnes (em KG)
  { grupo: "CARNE", nome: "FRALDINHA MATURATTA", unidade: "KG" },
  { grupo: "CARNE", nome: "CUPIM MATURATTA", unidade: "KG" },
  { grupo: "CARNE", nome: "PICANHA MATTURATA", unidade: "KG" },
  { grupo: "CARNE", nome: "BIFE ANCHO", unidade: "KG" },
  { grupo: "CARNE", nome: "LINGUICA SUINA", unidade: "KG" },
  { grupo: "CARNE", nome: "LINGUICA DE FRANGO", unidade: "KG" },
  { grupo: "CARNE", nome: "MEIO DA ASA", unidade: "KG" },
  { grupo: "CARNE", nome: "CORAÇAO DE FRANGO", unidade: "KG" },
  { grupo: "CARNE", nome: "TULIPA", unidade: "KG" },
  { grupo: "CARNE", nome: "RIBEYE", unidade: "KG" },
  { grupo: "CARNE", nome: "DENVER", unidade: "KG" },
  // Bebidas (em UN) — as únicas que voltam
  { grupo: "BEBIDA", nome: "HEINEKEN 600ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "AGUA SEM GÁS", unidade: "UN" },
  { grupo: "BEBIDA", nome: "AGUA COM GÁS", unidade: "UN" },
  { grupo: "BEBIDA", nome: "GUARANA ANTARTICA LATA 350ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "GUARANA ANTARTICA ZERO LATA 350ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "COCA COLA ZERO LATA 350ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "COCA COLA LATA 350ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "HEINEKEN ZERO LONG NECK 330ML", unidade: "UN" },
  { grupo: "BEBIDA", nome: "SUCO LATA", unidade: "UN" },
  // Hortifruti
  { grupo: "HORTIFRUTI", nome: "ABACAXI", unidade: "UN" },
  { grupo: "HORTIFRUTI", nome: "PIMENTAO AMARELO", unidade: "UN" },
  { grupo: "HORTIFRUTI", nome: "PIMENTAO VERMELHO", unidade: "UN" },
  { grupo: "HORTIFRUTI", nome: "BERINJELA", unidade: "UN" },
  { grupo: "HORTIFRUTI", nome: "MILHO VERDE ESPIGA", unidade: "UN" },
  { grupo: "HORTIFRUTI", nome: "PIMENTA DEDO DE MOCA", unidade: "KG" },
  { grupo: "HORTIFRUTI", nome: "REPOLHO ROXO", unidade: "UN" },
  // Outros
  { grupo: "OUTROS", nome: "TOUCINHO", unidade: "KG" },
  { grupo: "OUTROS", nome: "MANDIOCA", unidade: "KG" },
  { grupo: "OUTROS", nome: "PAO DE ALHO", unidade: "PCT" },
  { grupo: "OUTROS", nome: "QUEIJO COALHO", unidade: "KG" },
  { grupo: "OUTROS", nome: "SAL GROSSO", unidade: "KG" },
  { grupo: "OUTROS", nome: "MEL", unidade: "UN" },
  { grupo: "OUTROS", nome: "GELO", unidade: "PCT" },
  { grupo: "OUTROS", nome: "CARVAO", unidade: "PCT" },
  { grupo: "OUTROS", nome: "PAPEL TOALHA DEPARTAMENTOS ROLO 24RS 6 X 200MT", unidade: "RL" },
  { grupo: "OUTROS", nome: "ESPONJA DUPLA FACE", unidade: "UN" },
  { grupo: "OUTROS", nome: "DETERGENTE NEUTRO 5L", unidade: "UN" },
];

/** Tarefas da ficha. "Contar cerveja" virou o passo da volta, com trava. */
export type FaseTarefa = "ANTES" | "DEPOIS";
export const TAREFAS_MODELO: { fase: FaseTarefa; nome: string }[] = [
  { fase: "ANTES", nome: "Abastecer refrigerantes" },
  { fase: "ANTES", nome: "Levar o gelo" },
  { fase: "ANTES", nome: "Levar carvão" },
  { fase: "ANTES", nome: "Levar as taças" },
  { fase: "ANTES", nome: "Levar panela, gancho e espeto" },
  { fase: "ANTES", nome: "Levar papel, detergente e bucha" },
  { fase: "DEPOIS", nome: "Buscar carnes" },
  { fase: "DEPOIS", nome: "Pesar carne" },
  { fase: "DEPOIS", nome: "Temp. cervejeira" },
  { fase: "DEPOIS", nome: "Buscar itens do quiosque" },
];

export type TarefaChurrasco = {
  fase: FaseTarefa;
  nome: string;
  feito_em?: string | null;
  feito_por?: string | null;
};

export const tarefasIniciais = (): TarefaChurrasco[] =>
  TAREFAS_MODELO.map((t) => ({ fase: t.fase, nome: t.nome, feito_em: null, feito_por: null }));

/** Marca ou desmarca uma tarefa (pela posição), guardando quem e quando. */
export const marcarTarefa = (
  tarefas: TarefaChurrasco[],
  indice: number,
  feito: boolean,
  quem: string,
  agora: Date = new Date(),
): TarefaChurrasco[] =>
  tarefas.map((t, i) =>
    i !== indice ? t : feito ? { ...t, feito_em: agora.toISOString(), feito_por: quem } : { ...t, feito_em: null, feito_por: null },
  );

/** "Coração de frango" e "CORAÇAO  DE FRANGO" são o mesmo nome. */
export const normalizarNome = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

type ItemDoCadastro = { id: string; nome: string; unidade?: string | null; unidades?: string[] | null; ativo?: boolean };

/**
 * Casa o modelo com o cadastro pelo nome. O que não existe no cadastro volta
 * em `faltando` (precisa ser cadastrado em Itens para ir ao TOTVS).
 */
export function resolverModelo<T extends ItemDoCadastro>(catalogo: T[], modelo: ItemDoModelo[] = MODELO) {
  const porNome = new Map<string, T>();
  for (const i of catalogo) if (i.ativo !== false) porNome.set(normalizarNome(i.nome), i);
  const encontrados: { grupo: GrupoChurrasco; item: T; unidade: string }[] = [];
  const faltando: ItemDoModelo[] = [];
  const vistos = new Set<string>();
  for (const m of modelo) {
    const item = porNome.get(normalizarNome(m.nome));
    if (!item) { faltando.push(m); continue; }
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    const unidades = (item.unidades && item.unidades.length ? item.unidades : [item.unidade || "UN"]).map((u) => (u || "").toUpperCase());
    const preferida = (m.unidade || "").toUpperCase();
    const unidade = preferida && unidades.includes(preferida) ? preferida : unidades[0] || "UN";
    encontrados.push({ grupo: m.grupo, item, unidade });
  }
  return { encontrados, faltando };
}

/** Nome com cara de bebida (lata, garrafa, cerveja...). */
const PARECE_BEBIDA =
  /\b(LATA|LONG NECK|\d+ ?ML|\d+ ?L|AGUA|SUCO|REFRIGERANTE|REFRI|CERVEJA|CHOPP?|HEINEKEN|BRAHMA|SKOL|BUDWEISER|STELLA|COCA|GUARANA|FANTA|SPRITE|SCHWEPPES|TONICA|ENERGETICO|RED BULL|VINHO|ESPUMANTE|WHISKY|VODKA|GIN|CACHACA|AGUARDENTE)\b/;

/**
 * Grupo de um item do churrasco. Vale o que foi marcado ao criar a ficha; um
 * item que entrou depois (pelo "Editar Requisição") é reconhecido pelo nome:
 * primeiro pelo modelo, depois pela cara de bebida; o resto conta como OUTROS.
 */
export const grupoDoItem = (
  grupos: Record<string, string> | null | undefined,
  itemId: string,
  nome?: string | null,
): GrupoChurrasco => {
  const g = grupos?.[itemId];
  if (g === "CARNE" || g === "BEBIDA" || g === "HORTIFRUTI" || g === "OUTROS") return g;
  if (nome) {
    const n = normalizarNome(nome);
    const doModelo = MODELO.find((m) => normalizarNome(m.nome) === n);
    if (doModelo) return doModelo.grupo;
    if (PARECE_BEBIDA.test(n)) return "BEBIDA";
  }
  return "OUTROS";
};

export type EtapaChurrasco = "SEPARAR" | "VOLTA" | "LANCAR" | "PRONTO" | "CANCELADO";

const ENTREGUE = new Set(["FINALIZADA", "RUPTURA_PARCIAL"]);

/**
 * Onde o churrasco está. Enquanto não chega a PRONTO (lançado), a requisição
 * mostra a ficha do churrasco; depois, é uma requisição igual às outras.
 */
export function etapaDoChurrasco(
  status: string,
  lancado: boolean | null | undefined,
  voltaConferidaEm: string | null | undefined,
): EtapaChurrasco {
  if (status === "CANCELADA" || status === "RUPTURA_TOTAL") return "CANCELADO";
  // Lançada é o fim, aconteça o que acontecer antes (o banco já impede lançar
  // sem a volta; isto só cobre dado antigo).
  if (lancado) return "PRONTO";
  if (!ENTREGUE.has(status)) return "SEPARAR";
  return voltaConferidaEm ? "LANCAR" : "VOLTA";
}

export const ROTULO_ETAPA: Record<EtapaChurrasco, string> = {
  SEPARAR: "Separar e conferir",
  VOLTA: "Contar a volta",
  LANCAR: "Lançar no TOTVS",
  PRONTO: "Lançado",
  CANCELADO: "Cancelado",
};

/** Kg de carne de uma lista de linhas (só as linhas do grupo CARNE em KG). */
export function kgDeCarne(
  linhas: { item_id: string; quantidade: number; unidade?: string | null; nome?: string | null }[],
  grupos: Record<string, string> | null | undefined,
): number {
  let total = 0;
  for (const l of linhas) {
    if (grupoDoItem(grupos, l.item_id, l.nome) !== "CARNE") continue;
    if ((l.unidade || "").toUpperCase() !== "KG") continue;
    total += Number(l.quantidade) || 0;
  }
  return Math.round(total * 1000) / 1000;
}
