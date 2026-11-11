/**
 * Ordem da lista de requisições (só o almoxarifado escolhe).
 *
 * Diferente dos filtros, não esconde nada: só muda a ordem. Por setor, status
 * ou solicitante a lista vira grupos com título ("COZINHA · 5"); dentro de
 * cada grupo, as mais recentes primeiro. Só lógica aqui, para poder testar.
 */

export type OrdemRequisicoes = "RECENTES" | "ANTIGAS" | "SETOR" | "STATUS" | "SOLICITANTE";

export const ORDEM_PADRAO: OrdemRequisicoes = "RECENTES";

export const ORDENS: { valor: OrdemRequisicoes; rotulo: string }[] = [
  { valor: "RECENTES", rotulo: "Mais recentes primeiro" },
  { valor: "ANTIGAS", rotulo: "Mais antigas primeiro" },
  { valor: "SETOR", rotulo: "Por setor" },
  { valor: "STATUS", rotulo: "Por status" },
  { valor: "SOLICITANTE", rotulo: "Por solicitante" },
];

export const ehOrdem = (v: unknown): v is OrdemRequisicoes => ORDENS.some((o) => o.valor === v);

/** A ordem do trabalho: o que falta fazer em cima, o que acabou embaixo. */
const STATUS_EM_ORDEM: { status: string; titulo: string }[] = [
  { status: "PENDENTE", titulo: "Pendentes" },
  { status: "SEPARANDO", titulo: "Separando" },
  { status: "AGUARDANDO", titulo: "Aguardando" },
  { status: "FINALIZADA", titulo: "Finalizadas" },
  { status: "RUPTURA_PARCIAL", titulo: "Ruptura parcial" },
  { status: "RUPTURA_TOTAL", titulo: "Ruptura total" },
  { status: "CANCELADA", titulo: "Canceladas" },
];

interface RequisicaoOrdenavel {
  created_at: string;
  departamento?: string | null;
  status: string;
  usuario?: { nome?: string | null } | null;
}

export interface GrupoDeRequisicoes<R> {
  /** null = lista sem divisões (ordem por data). */
  titulo: string | null;
  reqs: R[];
}

const porData = (r: RequisicaoOrdenavel) => new Date(r.created_at).getTime();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export function ordenarEmGrupos<R extends RequisicaoOrdenavel>(
  reqs: R[],
  ordem: OrdemRequisicoes,
): GrupoDeRequisicoes<R>[] {
  const recentes = [...reqs].sort((a, b) => porData(b) - porData(a));
  if (ordem === "RECENTES") return [{ titulo: null, reqs: recentes }];
  if (ordem === "ANTIGAS") return [{ titulo: null, reqs: recentes.reverse() }];

  if (ordem === "STATUS") {
    const grupos = STATUS_EM_ORDEM.map((s) => ({ titulo: s.titulo, reqs: recentes.filter((r) => r.status === s.status) }));
    const outros = recentes.filter((r) => !STATUS_EM_ORDEM.some((s) => s.status === r.status));
    if (outros.length) grupos.push({ titulo: "Outros", reqs: outros });
    return grupos.filter((g) => g.reqs.length > 0);
  }

  // Setor e solicitante: "Cozinha" e "COZINHA " caem no mesmo grupo.
  const nome = (r: R) =>
    (ordem === "SETOR" ? r.departamento : r.usuario?.nome)?.trim() ||
    (ordem === "SETOR" ? "Sem setor" : "Sem solicitante");
  const grupos = new Map<string, GrupoDeRequisicoes<R>>();
  for (const r of recentes) {
    const chave = semAcento(nome(r));
    if (!grupos.has(chave)) grupos.set(chave, { titulo: nome(r), reqs: [] });
    grupos.get(chave)!.reqs.push(r);
  }
  return Array.from(grupos.values()).sort((a, b) =>
    a.titulo!.localeCompare(b.titulo!, "pt-BR", { sensitivity: "base" }),
  );
}
