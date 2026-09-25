import { useEffect, useReducer } from "react";
import {
  assinarInstalacao,
  conviteDispensado,
  ehIOS,
  estaInstalado,
  pedirInstalacao,
  podeInstalarDireto,
} from "@/lib/instalacao";

/**
 * Estado da instalação do app, sempre atualizado.
 *
 * - `podeInstalar`: Android/Chrome com o convite do navegador guardado.
 * - `precisaInstrucaoIOS`: iPhone/iPad no Safari — só por Compartilhar.
 * - `conviteVisivel`: o cartão de convite deve aparecer agora.
 */
export function useInstallApp() {
  const [, atualizar] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const cancelar = assinarInstalacao(atualizar);
    // Instalou por fora (menu do navegador) ou abriu como app: reavaliar.
    const midia = window.matchMedia?.("(display-mode: standalone)");
    midia?.addEventListener?.("change", atualizar);
    return () => {
      cancelar();
      midia?.removeEventListener?.("change", atualizar);
    };
  }, []);

  const instalado = estaInstalado();
  const podeInstalar = !instalado && podeInstalarDireto();
  const precisaInstrucaoIOS = !instalado && ehIOS();

  return {
    instalado,
    podeInstalar,
    precisaInstrucaoIOS,
    conviteVisivel: (podeInstalar || precisaInstrucaoIOS) && !conviteDispensado(),
    // Nomes antigos, usados pelo menu lateral.
    isInstallable: podeInstalar,
    promptInstall: pedirInstalacao,
  };
}
