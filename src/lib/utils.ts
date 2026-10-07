import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { RequisicaoItemComDetalhes } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Nome do material para exibição. Um item arquivado é gravado como
 * "[EXCLUIDO] Detergente (25/09/26 09:13)" — o carimbo de data evita conflito
 * com o índice único. Na tela, no PDF e no lançamento do TOTVS aparece só
 * "Detergente"; antes a data vinha grudada no nome.
 */
export const formatItemName = (name?: string) => {
  if (!name) return '';
  const arquivado = name.match(/^\[EXCLUIDO\]\s*(.*?)(?:\s*\(\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}\))?$/i);
  return arquivado ? arquivado[1] : name;
};

const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca de todas as telas. Ignora maiúsculas e acentos, e cada palavra digitada
 * pode estar em qualquer ponto do nome: "agua sanitaria" encontra "Água
 * Sanitária" e "luva latex" encontra "Luva de Látex". No celular quase ninguém
 * digita acento, e a busca antiga não achava nada.
 */
export const contemTexto = (texto: string | null | undefined, busca: string): boolean => {
  const alvo = semAcento(texto || "");
  return semAcento(busca)
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra));
};

/**
 * A requisição tem algo a lançar no TOTVS? Só quando saiu material do
 * almoxarifado. RUPTURA_TOTAL fica de fora: nada foi entregue — tudo foi para
 * a complementar, que é lançada quando for entregue. Antes ela ficava
 * "A LANÇAR" para sempre, sem ter o que lançar.
 */
export const precisaLancar = (status?: string | null): boolean =>
  status === "FINALIZADA" || status === "RUPTURA_PARCIAL";

/** A entrega já aconteceu? Só aí a quantidade separada é a entregue. */
export const foiEntregue = (status?: string | null): boolean =>
  status === "FINALIZADA" || status === "RUPTURA_PARCIAL" || status === "RUPTURA_TOTAL";

/** Unidade padrão quando nada foi informado nem cadastrado. */
export const UNIDADE_PADRAO = "UN";

/**
 * Unidade de uma linha da requisição.
 *
 * A unidade escolhida no pedido manda; se a linha é antiga (anterior ao campo)
 * ou ficou vazia, vale a unidade cadastrada no catálogo do item.
 */
export const unidadeDoItem = (
  linha?: Pick<RequisicaoItemComDetalhes, "unidade" | "item"> | null,
): string => linha?.unidade || linha?.item?.unidade || UNIDADE_PADRAO;

/**
 * Soma quantidades SEM misturar unidades e devolve o texto pronto:
 * "12 UN" ou, quando o mesmo material aparece em unidades diferentes,
 * "10 UN + 2 CX". Somar 10 UN com 2 CX e mostrar "12" era um número falso.
 */
export const descreverQuantidades = (
  linhas: { quantidade: number; unidade?: string | null; item?: { unidade?: string } | null }[],
): string => {
  const porUnidade = new Map<string, number>();
  for (const l of linhas) {
    const un = (l.unidade || l.item?.unidade || UNIDADE_PADRAO).toUpperCase();
    porUnidade.set(un, (porUnidade.get(un) || 0) + (Number(l.quantidade) || 0));
  }
  if (porUnidade.size === 0) return `0 ${UNIDADE_PADRAO}`;
  return Array.from(porUnidade.entries())
    .map(([un, qtd]) => `${Math.round(qtd * 1000) / 1000} ${un}`)
    .join(" + ");
};

/**
 * Quantidade que saiu quando já foi separada (descontada a devolução ao
 * almoxarifado); senão, a pedida. Nulo conta como não separado.
 */
export const quantidadeEfetiva = (
  linha: { quantidade: number; quantidade_separada?: number | null; quantidade_devolvida?: number | null },
  entregue: boolean,
): number =>
  entregue && linha.quantidade_separada != null
    ? Math.max(0, Math.round((Number(linha.quantidade_separada) - (Number(linha.quantidade_devolvida) || 0)) * 1000) / 1000)
    : Number(linha.quantidade) || 0;

/**
 * Converte o valor de um <input type="date"> ("2026-09-22") em data LOCAL.
 *
 * `new Date("2026-09-22")` é lido como meia-noite em UTC. No horário de Brasília
 * (UTC-3) isso vira 21/09 às 21h, e os filtros acabavam pegando o dia anterior:
 * escolher "de 22/09 até 22/09" não trazia nada do dia 22.
 */
export const dataInputParaLocal = (valor?: string | null): Date | null => {
  if (!valor) return null;
  const partes = valor.split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return null;
  const [ano, mes, dia] = partes;
  return new Date(ano, mes - 1, dia);
};
