/**
 * Avisos do sistema operacional (a notificação que aparece na barra do celular).
 *
 * Limite importante, para não prometer o que não existe: um app web não fica
 * rodando em segundo plano como app nativo. Estes avisos chegam enquanto o app
 * está aberto ou recém-minimizado, que é quando a conexão com o Supabase ainda
 * está viva. Com o app fechado há muito tempo, o Android suspende a aba e nada
 * chega — isso só se resolve com Web Push e servidor, que é outro trabalho.
 */

export type EstadoAviso = "indisponivel" | "default" | "granted" | "denied";

export const suportaAvisos = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export const estadoDosAvisos = (): EstadoAviso => {
  if (!suportaAvisos()) return "indisponivel";
  return Notification.permission as EstadoAviso;
};

/**
 * Pede a permissão. Precisa ser chamado a partir de um toque do usuário: no
 * celular os navegadores ignoram o pedido feito sozinho no carregamento.
 */
export const pedirPermissaoDeAvisos = async (): Promise<EstadoAviso> => {
  if (!suportaAvisos()) return "indisponivel";
  try {
    return (await Notification.requestPermission()) as EstadoAviso;
  } catch {
    return estadoDosAvisos();
  }
};

/**
 * Mostra o aviso. Devolve true se conseguiu.
 *
 * Em PWA instalado no Android, `new Notification()` lança
 * "Illegal constructor"; o caminho que funciona é o service worker. Tentamos o
 * service worker primeiro e caímos no construtor no desktop.
 */
export const avisar = async (
  titulo: string,
  { corpo, tag }: { corpo: string; tag?: string },
): Promise<boolean> => {
  if (estadoDosAvisos() !== "granted") return false;

  // Repetir a mesma tag substitui o aviso anterior em vez de empilhar vários.
  const opcoes: Record<string, unknown> = {
    body: corpo,
    icon: "/icon-192x192.png",
    badge: "/icon-96x96.png",
    ...(tag ? { tag, renotify: true } : {}),
  };

  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro?.showNotification) {
      // `vibrate` só é aceito por este caminho; o construtor direto ignora.
      await registro.showNotification(titulo, { ...opcoes, vibrate: [200, 100, 200] } as NotificationOptions);
      return true;
    }
  } catch {
    /* cai no construtor direto abaixo */
  }

  try {
    new Notification(titulo, opcoes as NotificationOptions);
    return true;
  } catch {
    return false;
  }
};
