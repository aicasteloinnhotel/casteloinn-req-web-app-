/**
 * Padrão das barras de filtro e ação, tirado da tela de Requisições.
 *
 * Cada tela tinha o seu jeito: busca dentro de um cartão cinza, seletores com
 * cantos e sombras diferentes, botões de alturas diferentes. Tudo aqui tem
 * 44px de altura (alvo de toque confortável no celular), cantos iguais e a
 * mesma borda — é o que faz as telas parecerem do mesmo app.
 */

/** Base de qualquer campo da barra: busca, seletor, data. */
export const CAMPO =
  "h-11 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

/** Seletor (<select>) da barra. */
export const SELETOR = `${CAMPO} px-3 min-w-0`;

/** Botão só com ícone (atualizar, imprimir, histórico, filtros). */
export const BOTAO_ICONE =
  "h-11 w-11 p-0 shrink-0 bg-white text-slate-600 hover:text-slate-900 border-slate-200";

/** Ação principal da tela (Nova, Novo item, Adicionar). */
export const BOTAO_PRIMARIO = "h-11 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold";

/** Botão secundário com texto (Importar CSV). */
export const BOTAO_SECUNDARIO =
  "h-11 px-3 bg-white text-slate-700 font-bold border-slate-200 hover:bg-slate-50";

/** Abas da tela (Curva ABC | Gerenciar itens): mesma altura dos controles. */
export const ABAS = "flex h-11 p-1 bg-slate-100 rounded-lg border border-slate-200";
export const ABA = "flex-1 flex items-center justify-center gap-2 px-3 rounded-md text-sm font-bold transition-colors";
export const ABA_ATIVA = "bg-white text-slate-800 shadow-sm";
export const ABA_INATIVA = "text-slate-600 hover:text-slate-800";

/** Cabeçalho de toda tela: título + subtítulo. */
export const TITULO = "text-2xl sm:text-3xl font-bold tracking-tight text-teal-900";
export const SUBTITULO = "text-slate-700 text-sm";
