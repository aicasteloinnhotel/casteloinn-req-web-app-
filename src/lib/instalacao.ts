/**
 * Instalação do app (PWA) na tela inicial do aparelho.
 *
 * Como funciona em cada aparelho:
 *
 *  - Android / Chrome / Edge: o navegador dispara o evento
 *    `beforeinstallprompt` quando o app pode ser instalado. Guardamos o evento
 *    e, quando a pessoa toca em "Instalar", abrimos a janela oficial do
 *    navegador. Não dá para abrir essa janela sozinho: o navegador exige que
 *    seja em resposta a um toque — por isso o convite tem um botão.
 *
 *  - iPhone / iPad: o Safari não tem esse evento. O único caminho é o menu
 *    Compartilhar → "Adicionar à Tela de Início", então o convite explica isso.
 *
 * Por que isto fica fora do React: o navegador costuma disparar o evento
 * logo no carregamento, ainda na tela de login. Antes o app só começava a
 * escutar depois do login, dentro do layout — o evento já tinha passado e o
 * botão de instalar quase nunca aparecia.
 */

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const CHAVE_DISPENSADO = "convite_instalacao_dispensado";

let eventoGuardado: EventoInstalacao | null = null;
let iniciado = false;
const ouvintes = new Set<() => void>();
const notificar = () => ouvintes.forEach((f) => f());

/** Chamar uma vez, antes de renderizar o app (main.tsx). */
export function iniciarCapturaDeInstalacao() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    // Guardamos o evento para abrir a janela no toque do nosso botão, em vez
    // da faixinha genérica do Chrome que muita gente fecha sem ler.
    e.preventDefault();
    eventoGuardado = e as EventoInstalacao;
    notificar();
  });

  window.addEventListener("appinstalled", () => {
    eventoGuardado = null;
    notificar();
  });
}

/** O app já está aberto como aplicativo instalado (e não como site)? */
export const estaInstalado = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
};

/** iPhone ou iPad — inclusive iPad que se apresenta como Mac. */
export const ehIOS = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
};

export const podeInstalarDireto = (): boolean => !!eventoGuardado;

/** Abre a janela oficial de instalação. Só funciona dentro de um toque. */
export async function pedirInstalacao(): Promise<"aceito" | "recusado" | "indisponivel"> {
  const evento = eventoGuardado;
  if (!evento) return "indisponivel";
  // O navegador só deixa usar o mesmo evento uma vez.
  eventoGuardado = null;
  notificar();
  try {
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    return outcome === "accepted" ? "aceito" : "recusado";
  } catch {
    return "indisponivel";
  }
}

/** "Agora não": some até a próxima vez que o site for aberto. */
export const conviteDispensado = (): boolean => {
  try {
    return sessionStorage.getItem(CHAVE_DISPENSADO) === "1";
  } catch {
    return false;
  }
};

export function dispensarConvite() {
  try {
    sessionStorage.setItem(CHAVE_DISPENSADO, "1");
  } catch {
    /* navegação privada: tudo bem */
  }
  notificar();
}

/** O botão discreto do cabeçalho traz o convite de volta. */
export function reabrirConvite() {
  try {
    sessionStorage.removeItem(CHAVE_DISPENSADO);
  } catch {
    /* navegação privada: tudo bem */
  }
  notificar();
}

export function assinarInstalacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
