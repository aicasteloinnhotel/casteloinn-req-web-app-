/**
 * Percebe que saiu uma versão nova do app no Netlify.
 *
 * Abrir o app já carrega a versão mais recente (o service worker não guarda
 * cópia das telas). O caso que sobra é o celular que deixa o app aberto em
 * segundo plano por dias: ele continua com a versão antiga na memória. Ao voltar
 * para o app, confere se o index.html publicado aponta para outro arquivo de
 * código; se sim, avisa e oferece atualizar — sem reinstalar nada.
 */

const scriptCarregado = (): string | null =>
  document
    .querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
    ?.getAttribute("src") ?? null;

export function vigiarNovaVersao(aoEncontrar: () => void): () => void {
  const atual = scriptCarregado();
  // Em desenvolvimento não existe /assets/index-*.js: nada a vigiar.
  if (!atual) return () => {};

  let avisado = false;
  let ultimaConferencia = 0;

  const conferir = async () => {
    if (avisado || document.visibilityState !== "visible") return;
    if (Date.now() - ultimaConferencia < 60_000) return;
    ultimaConferencia = Date.now();
    try {
      const resposta = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
      if (!resposta.ok) return;
      const publicado = (await resposta.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0];
      if (publicado && publicado !== atual) {
        avisado = true;
        aoEncontrar();
      }
    } catch {
      // Sem internet agora: tenta na próxima vez que o app voltar à tela.
    }
  };

  document.addEventListener("visibilitychange", conferir);
  const intervalo = window.setInterval(conferir, 15 * 60_000);
  return () => {
    document.removeEventListener("visibilitychange", conferir);
    window.clearInterval(intervalo);
  };
}
