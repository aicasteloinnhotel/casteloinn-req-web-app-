import { useEffect, useRef } from "react";
import { supabase, hasSupabaseKeys } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { audioService } from "@/lib/audio";
import { playSound } from "@/lib/sounds";
import { avisar } from "@/lib/notificacoes";
import type { Requisicao, Usuario } from "@/types";

/**
 * Avisos que precisam chegar em QUALQUER tela do app:
 *  - almoxarifado: chegou uma requisição nova;
 *  - solicitante: o almoxarifado começou a separar o pedido dele.
 *
 * Antes eles moravam no hook da lista de requisições e só tocavam com a pessoa
 * parada no Início ou na lista. Quem estava dentro de uma requisição, no meio
 * de outra separação ou no catálogo de itens não ficava sabendo de nada.
 * Montado uma vez só, no layout, que fica de pé durante toda a sessão.
 */
export function useAvisosEmTempoReal(user: Usuario | null) {
  // O mesmo evento pode chegar duas vezes quando o canal reconecta.
  const jaAvisados = useRef<Set<string>>(new Set());

  const usuarioId = user?.id;
  const ehSolicitante = user?.perfil === "SOLICITANTE";

  useEffect(() => {
    if (!hasSupabaseKeys || !usuarioId) return;

    const primeiraVez = (chave: string) => {
      if (jaAvisados.current.has(chave)) return false;
      jaAvisados.current.add(chave);
      return true;
    };

    const canal = supabase
      .channel(`avisos-${usuarioId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        ehSolicitante
          ? { event: "UPDATE", schema: "public", table: "requisicoes", filter: `usuario_id=eq.${usuarioId}` }
          : { event: "INSERT", schema: "public", table: "requisicoes" },
        (payload) => {
          const req = payload.new as Partial<Requisicao> | undefined;
          if (!req?.id) return;
          const numero = req.codigo_requisicao ?? "?";

          if (ehSolicitante) {
            if (req.status !== "SEPARANDO" || !primeiraVez(`separacao-${req.id}`)) return;
            playSound("notification");
            toast.info(`Separação iniciada na sua requisição #${numero}.`);
            avisar("Separação iniciada", {
              corpo: `O almoxarifado começou a separar a sua requisição #${numero}.`,
              tag: `separacao-${req.id}`,
            });
            return;
          }

          // A complementar nasce AGUARDANDO, criada pelo próprio sistema: não
          // é pedido novo de ninguém, então não toca o alarme.
          if (req.status !== "PENDENTE" || !primeiraVez(`nova-${req.id}`)) return;
          audioService.playNewRequisitionAlert();
          toast.info(`Nova requisição #${numero} recebida!`);
          avisar("Nova requisição", {
            corpo: `REQ #${numero} — ${req.departamento ?? "setor não informado"}`,
            tag: `nova-${req.id}`,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuarioId, ehSolicitante]);
}
