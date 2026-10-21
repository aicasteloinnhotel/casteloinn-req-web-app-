/**
 * Planilha do catálogo de itens: exportar e importar com a MESMA forma.
 *
 * Colunas (nesta ordem, com cabeçalho): Nome | Medidas | Situação.
 *  - Medidas: "UN/KG/CX" (aceita também "|" ou "+" entre elas).
 *  - Situação: "Ativo" ou "Inativo" (aceita sim/não, 1/0, true/false).
 * Exportou, mexeu no Excel e importou de volta: funciona. Sem cabeçalho, vale
 * a ordem A = Nome, B = Medidas, C = Situação (como a planilha antiga).
 *
 * Importar NUNCA apaga: medida só é acrescentada, item que não está na planilha
 * fica como está. A situação só muda se a pessoa marcar essa opção.
 */

import { Item } from "@/types";
import { UNIDADE_PADRAO } from "@/lib/utils";
import { unidadesDoItem } from "@/lib/unidades";

export type QuaisItens = "todos" | "ativos" | "inativos";

export interface OpcoesExportacao {
  medidas: boolean;
  situacao: boolean;
  quais: QuaisItens;
}

export interface OpcoesImportacao {
  /** Cadastrar o que ainda não existe. */
  novos: boolean;
  /** Acrescentar medidas aos que já existem (nunca remove). */
  medidas: boolean;
  /** Ativar/desativar os que já existem conforme a coluna Situação. */
  situacao: boolean;
}

/** Item arquivado por exclusão: nunca entra na planilha. */
const arquivado = (i: Item) => i.nome.trim().toUpperCase().startsWith("[EXCLUIDO]");

/** Linhas da planilha de exportação, já com o cabeçalho. */
export function linhasDeExportacao(itens: Item[], op: OpcoesExportacao): string[][] {
  const cabecalho = ["Nome", ...(op.medidas ? ["Medidas"] : []), ...(op.situacao ? ["Situação"] : [])];
  const linhas = itens
    .filter((i) => !arquivado(i))
    .filter((i) => (op.quais === "ativos" ? i.ativo : op.quais === "inativos" ? !i.ativo : true))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((i) => [
      i.nome.trim(),
      ...(op.medidas ? [unidadesDoItem(i).join("/")] : []),
      ...(op.situacao ? [i.ativo ? "Ativo" : "Inativo"] : []),
    ]);
  return [cabecalho, ...linhas];
}

/** Medidas de uma célula: "UN", "UN/KG", "un | kg" → ["UN", "KG"]. */
export const medidasDaCelula = (celula?: string): string[] =>
  (celula || "")
    .split(/[\/|+]/)
    .map((u) => u.trim().toUpperCase())
    .filter((u, i, todas) => u && todas.indexOf(u) === i);

/** "Ativo"/"sim"/"1" → true; "Inativo"/"não"/"0" → false; vazio/outro → indefinido. */
export const situacaoDaCelula = (celula?: string): boolean | undefined => {
  const v = (celula || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!v) return undefined;
  if (["ativo", "ativa", "sim", "s", "1", "true", "verdadeiro"].includes(v)) return true;
  if (["inativo", "inativa", "nao", "n", "0", "false", "falso", "desativado", "desativada"].includes(v)) return false;
  return undefined;
};

export interface LinhaLida {
  linha: number; // número da linha na planilha (1 = primeira)
  nome: string;
  medidas: string[];
  ativo: boolean | undefined;
}

const semAcento = (t: string) =>
  t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Lê as linhas da planilha. Com cabeçalho, acha as colunas pelo nome (em
 * qualquer ordem); sem cabeçalho, A = Nome, B = Medidas, C = Situação.
 */
export function lerLinhasDaPlanilha(dados: string[][]): { linhas: LinhaLida[]; temSituacao: boolean; temMedidas: boolean } {
  let col = { nome: 0, medidas: 1, situacao: 2 };
  let inicio = 0;
  let temSituacao = true;
  let temMedidas = true;

  const primeira = (dados[0] || []).map((c) => semAcento(String(c ?? "")));
  const ehCabecalho = primeira.some((c) => c === "nome" || c === "item" || c.startsWith("descri"));
  if (ehCabecalho) {
    inicio = 1;
    const achar = (teste: (c: string) => boolean) => primeira.findIndex(teste);
    const iNome = achar((c) => c === "nome" || c === "item" || c.startsWith("descri"));
    const iMedidas = achar((c) => c.startsWith("medida") || c.startsWith("unidade") || c === "und" || c === "un");
    const iSituacao = achar((c) => c.startsWith("situa") || c === "ativo" || c === "status");
    col = { nome: iNome, medidas: iMedidas, situacao: iSituacao };
    temMedidas = iMedidas >= 0;
    temSituacao = iSituacao >= 0;
  } else {
    temMedidas = dados.some((l) => (l[1] || "").trim() !== "");
    temSituacao = dados.some((l) => (l[2] || "").trim() !== "");
  }

  const linhas: LinhaLida[] = [];
  for (let i = inicio; i < dados.length; i++) {
    const l = dados[i] || [];
    linhas.push({
      linha: i + 1,
      nome: String(l[col.nome] ?? "").trim(),
      medidas: col.medidas >= 0 ? medidasDaCelula(l[col.medidas]) : [],
      ativo: col.situacao >= 0 ? situacaoDaCelula(l[col.situacao]) : undefined,
    });
  }
  return { linhas, temSituacao, temMedidas };
}

export interface PlanoDeImportacao {
  inserir: { nome: string; unidade: string; unidades: string[]; ativo: boolean }[];
  completarMedidas: { id: string; nome: string; unidade: string; unidades: string[]; novas: string[] }[];
  mudarSituacao: { id: string; nome: string; ativo: boolean }[];
  /** Linhas sem efeito: vazias, repetidas, já iguais ou de opção desmarcada. */
  semMudanca: number;
  vazias: number;
  repetidas: string[];
}

/** O que a importação vai fazer (é isto que aparece na prévia). Não grava nada. */
export function planejarImportacao(linhas: LinhaLida[], existentes: Item[], op: OpcoesImportacao): PlanoDeImportacao {
  const porNome = new Map(existentes.filter((i) => !arquivado(i)).map((i) => [semAcento(i.nome), i]));
  const vistos = new Set<string>();
  const plano: PlanoDeImportacao = { inserir: [], completarMedidas: [], mudarSituacao: [], semMudanca: 0, vazias: 0, repetidas: [] };

  for (const l of linhas) {
    if (!l.nome) {
      plano.vazias++;
      continue;
    }
    const chave = semAcento(l.nome);
    if (vistos.has(chave)) {
      plano.repetidas.push(l.nome);
      continue;
    }
    vistos.add(chave);

    const existente = porNome.get(chave);
    if (!existente) {
      if (op.novos) {
        const unidades = l.medidas.length > 0 ? l.medidas : [UNIDADE_PADRAO];
        plano.inserir.push({
          nome: l.nome,
          unidade: unidades[0],
          unidades,
          // Situação só vale se a pessoa marcou a opção; senão, item novo nasce ativo.
          ativo: op.situacao && l.ativo !== undefined ? l.ativo : true,
        });
      } else {
        plano.semMudanca++;
      }
      continue;
    }

    let mudou = false;
    if (op.medidas && l.medidas.length > 0) {
      const atuais = unidadesDoItem(existente);
      const novas = l.medidas.filter((u) => !atuais.includes(u));
      if (novas.length > 0) {
        plano.completarMedidas.push({ id: existente.id, nome: existente.nome, unidade: atuais[0], unidades: [...atuais, ...novas], novas });
        mudou = true;
      }
    }
    if (op.situacao && l.ativo !== undefined && l.ativo !== existente.ativo) {
      plano.mudarSituacao.push({ id: existente.id, nome: existente.nome, ativo: l.ativo });
      mudou = true;
    }
    if (!mudou) plano.semMudanca++;
  }
  return plano;
}
