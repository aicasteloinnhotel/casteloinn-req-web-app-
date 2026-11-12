/**
 * Texto da observação como aparece na tela.
 *
 * A complementar gerada por ruptura nasce no banco com a observação
 * "Complementar gerada automaticamente por ruptura da REQ #368" — comprida
 * demais para a lista e repetida em todas as complementares. Na tela ela vira
 * só "Complementar da #368". O banco não muda: vale para as que já existem e
 * para as próximas, sem SQL. O que alguém escreveu depois (em outra linha)
 * continua aparecendo.
 */
const AUTOMATICA = /^Complementar gerada automaticamente por ruptura da REQ #(\d+|\?)/i;

export const textoDaObservacao = (observacao?: string | null): string => {
  const texto = (observacao || "").trim();
  return texto.replace(AUTOMATICA, (_, numero: string) => `Complementar da #${numero}`).trim();
};
