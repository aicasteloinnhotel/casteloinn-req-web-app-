/** "Bom dia" até 11h59, "Boa tarde" até 17h59, depois "Boa noite". */
export const saudacao = (quando: Date): string => {
  const h = quando.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * Só o primeiro nome, com a primeira letra maiúscula ("MARIA JOSÉ" → "Maria").
 * Login que é cargo abreviado ("Enc. Almoxarifado") fica inteiro: "Enc."
 * sozinho não diz nada.
 */
export const primeiroNome = (nome?: string | null): string => {
  const limpo = (nome || "").trim().replace(/\s+/g, " ");
  const primeiro = limpo.split(" ")[0] || "";
  if (!primeiro) return "";
  if (primeiro.endsWith(".")) return limpo;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
};
