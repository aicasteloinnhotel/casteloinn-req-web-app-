/**
 * Termo de recebimento aceito pelo solicitante antes de assinar a entrega.
 *
 * A versão é gravada junto com o aceite (requisicoes.termo_versao). Se um dia
 * o texto mudar, suba a versão aqui: as entregas antigas continuam registrando
 * qual texto foi aceito naquele dia, que é o que dá valor ao aceite.
 */
export const TERMO_VERSAO = "1.0";

export const TERMO_TITULO = "Termo de Recebimento de Materiais";

export const TERMO_ITENS: string[] = [
  "Conferi item por item as quantidades entregues e elas conferem com o que está registrado nesta requisição.",
  "Verifiquei as datas de validade dos produtos que possuem validade e elas estão dentro do prazo.",
  "As embalagens foram recebidas íntegras, sem violação, umidade ou avaria aparente.",
  "Os produtos estão em condições de uso e adequados à finalidade solicitada.",
  "Recebo os materiais nesta data e assumo a responsabilidade pela guarda e pelo uso deles no meu setor.",
];

export const TERMO_RODAPE =
  "Divergências devem ser apontadas ao almoxarifado no ato da entrega, antes da assinatura.";

/** Uma linha só, para caber no rodapé do PDF. */
export const TERMO_RESUMO_PDF =
  "Declaro que conferi as quantidades, a validade, a integridade das embalagens e as " +
  "condições de uso dos materiais, e que os recebi nesta data.";
