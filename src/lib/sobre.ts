/**
 * Dados institucionais do app: versão, autoria, hotel e contato de suporte.
 *
 * Tudo num lugar só. Mudou o telefone, o endereço ou saiu versão nova: é aqui,
 * e a tela "Ajuda e Sobre" e a tela de login acompanham.
 */

export const APP = {
  nome: "Sistema de Requisições",
  versao: "1.0",
  desenvolvedor: "Nilton Junio Evangelista de Melo",
  descricao:
    "Substitui o pedido de material em papel: os setores fazem a requisição pelo celular, o almoxarifado separa, confere e entrega com assinatura na tela, e o que faltou vira requisição complementar e lista de compras automaticamente.",
};

/**
 * Dia em que esta versão foi gerada. Preenchido sozinho a cada deploy no
 * Netlify (vite.config.ts), para saber que versão cada aparelho está usando.
 */
export const DATA_DA_PUBLICACAO = new Date(__DATA_DA_PUBLICACAO__);

export const HOTEL = {
  nome: "Castelo Inn Hotel",
  cnpj: "33.386.335/0001-49",
  abertura: "04/10/1989",
  enderecoLinha1: "Av. Castelo Branco, nº 1713, Quadra 50, Lote 13-E",
  enderecoLinha2: "Setor Coimbra — Goiânia, GO — Brasil",
  /** Texto usado na busca do Google Maps. */
  enderecoMapa: "Av. Castelo Branco, 1713, Setor Coimbra, Goiânia - GO, Brasil",
};

export const SUPORTE = {
  setor: "Almoxarifado",
  /** Como aparece na tela. */
  telefone: "+55 (62) 9254-7476",
  /** Só dígitos, com país e DDD: é o que o WhatsApp e a ligação usam. */
  digitos: "556292547476",
};

export const linkMapa = () =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(HOTEL.enderecoMapa)}`;

export const linkLigar = () => `tel:+${SUPORTE.digitos}`;

/**
 * Conversa no WhatsApp com o almoxarifado, já com a mensagem começada. Quando
 * há alguém logado, a mensagem diz quem é e de qual setor — quem atende não
 * precisa perguntar.
 */
export const linkWhatsApp = (quem?: { nome?: string; departamento?: string } | null) => {
  const apresentacao = quem?.nome
    ? ` Sou ${quem.nome}${quem.departamento ? `, do setor ${quem.departamento}` : ""}.`
    : "";
  const texto = `Olá! Preciso de ajuda com o ${APP.nome}.${apresentacao}`;
  return `https://wa.me/${SUPORTE.digitos}?text=${encodeURIComponent(texto)}`;
};
