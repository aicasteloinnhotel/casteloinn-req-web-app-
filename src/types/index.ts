export type Perfil = 'SOLICITANTE' | 'ALMOXARIFADO';
export type StatusRequisicao = 'PENDENTE' | 'SEPARANDO' | 'FINALIZADA' | 'CANCELADA' | 'RUPTURA_PARCIAL' | 'RUPTURA_TOTAL' | 'AGUARDANDO';

export interface Usuario {
  id: string;
  nome: string;
  departamento: string;
  perfil: Perfil;
  ativo: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  nome: string;
  /** Unidade principal (sempre a primeira de `unidades`). */
  unidade: string;
  /** Unidades em que o material pode ser pedido (ex.: carne = UN e KG). */
  unidades?: string[] | null;
  ativo: boolean;
  created_at: string;
}
// Nota: existia aqui um campo "categoria" que não existe na tabela `itens` nem
// em nenhuma tela do app — era um campo fantasma. Removido para o tipo refletir
// o banco. Categorias de material são uma funcionalidade a construir, não algo
// que exista hoje.

export interface Requisicao {
  id: string;
  codigo_requisicao?: number;
  requisicao_origem_id?: string;
  usuario_id: string | null;
  usuario?: Usuario | null;
  departamento: string;
  status: StatusRequisicao;
  observacao?: string;
  impresso?: boolean;
  exportado?: boolean;
  assinatura_solicitante?: string;
  assinatura_almoxarifado?: string;
  conferente_id?: string | null;
  conferente?: Usuario | null;
  /** Momento em que o solicitante aceitou o termo de recebimento. */
  termo_aceito_em?: string | null;
  termo_versao?: string | null;
  /** Lançada no TOTVS: é aqui que o fluxo termina de verdade. */
  lancado?: boolean;
  lancado_em?: string | null;
  lancado_por?: string | null;
  locked_by?: string | null;
  locked_at?: string | null;
  created_at: string;
  itens?: RequisicaoItemComDetalhes[];
}

export interface RequisicaoItem {
  id: string;
  requisicao_id: string;
  item_id: string;
  quantidade: number;
  quantidade_separada?: number | null;
  /** Unidade escolhida no pedido. Quando vazia, vale a do catálogo do item. */
  unidade?: string | null;
  /** Unidade em que foi entregue. Vazia = a mesma do pedido. */
  unidade_separada?: string | null;
  /**
   * Quanto voltou ao almoxarifado depois da entrega, na unidade entregue
   * (AJUSTE_06). Saiu de verdade: separada − devolvida. Ausente em banco
   * sem o ajuste; vale 0.
   */
  quantidade_devolvida?: number | null;
}

/** Devolução ao almoxarifado: mandou a mais e buscou de volta. */
export interface Devolucao {
  id: string;
  requisicao_id: string;
  requisicao_item_id: string;
  quantidade: number;
  unidade: string;
  motivo: string;
  usuario_id: string | null;
  usuario?: { nome: string } | null;
  created_at: string;
  /** Registrada errado e desfeita: continua guardada, mas não conta. */
  desfeita_em?: string | null;
  desfeita_por?: string | null;
  desfeita?: { nome: string } | null;
}

/** Pausa para inventário: com ela ligada, ninguém cria requisição nova. */
export interface BloqueioRequisicoes {
  ativo: boolean;
  motivo?: string | null;
  alterado_por?: string | null;
  alterado_em?: string | null;
}

export interface RequisicaoItemComDetalhes extends RequisicaoItem {
  item?: Item;
}

export interface Historico {
  id: string;
  requisicao_id: string;
  acao: string;
  usuario_id: string | null;
  usuario?: Usuario | null;
  observacao?: string;
  created_at: string;
}

export interface ItemReposicao {
  id: string;
  item_id: string;
  quantidade: number;
  tipo_origem: 'MANUAL' | 'RUPTURA';
  requisicao_id?: string;
  resolvido: boolean;
  resolvido_por?: string;
  resolvido_em?: string;
  urgente?: boolean;
  prazo_target_date?: number | null;
  prazo_original?: string;
  /** Unidade em que o material faltou. Vazia = unidade do catálogo. */
  unidade?: string | null;
  created_at: string;
  item?: Item;
  requisicao?: {
    codigo_requisicao?: number;
    status?: string;
  };
}
