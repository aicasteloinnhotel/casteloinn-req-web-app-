import { useState, useEffect, useCallback, useRef } from "react";
import { getRequisicoes } from "@/services/api";
import { Requisicao } from "@/types";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";

export function useRequisicoesSync(userId?: string) {
  const [reqs, setReqs] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Evita recarregar a lista inteira uma vez por evento quando o Realtime
  // dispara em rajada (finalizar uma requisição gera vários eventos seguidos).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReqs = useCallback(
    async (isSilent = false): Promise<boolean> => {
      if (!isSilent) setLoading(true);
      else setUpdating(true);

      try {
        const data = await getRequisicoes(userId);
        setReqs(data || []);
        setLastUpdated(new Date());
        return true;
      } catch (error: any) {
        console.error("Erro ao carregar requisições DADOS:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        if (!isSilent) {
          // Primeira carga: não há lista para manter.
          setReqs([]);
          const detail = error?.message || error?.details || JSON.stringify(error);
          toast.error(`Erro ao carregar requisições: ${detail}`);
        }
        // Atualização que falhou (internet caiu na hora) mantém a lista que já
        // estava na tela. Antes ela era trocada por uma vazia, sem aviso, e
        // aparecia "Nenhuma requisição encontrada".
        return false;
      } finally {
        if (!isSilent) setLoading(false);
        else setUpdating(false);
      }
    },
    [userId],
  );

  const agendarRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchReqs(true), 400);
  }, [fetchReqs]);

  useEffect(() => {
    fetchReqs();

    // Nome único por instância: dois componentes montados ao mesmo tempo com o
    // mesmo nome de canal brigam pela mesma inscrição no Supabase.
    const channelName = `requisicoes-sync-${userId || "todos"}-${Math.random().toString(36).slice(2)}`;
    // Solicitante só escuta as próprias requisições. Antes o celular de cada
    // camareira recarregava a lista inteira a cada mudança de QUALQUER
    // requisição do hotel — bateria e dados móveis gastos à toa.
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        userId
          ? { event: "*", schema: "public", table: "requisicoes", filter: `usuario_id=eq.${userId}` }
          : { event: "*", schema: "public", table: "requisicoes" },
        // Só recarrega a lista. Os alarmes (requisição nova, separação
        // iniciada) ficam em useAvisosEmTempoReal, montado no layout, para
        // tocarem em qualquer tela — e não só aqui.
        () => agendarRefetch(),
      )
      .subscribe();

    // Celular: com o app em segundo plano a conexão em tempo real cai, e ao
    // voltar a lista podia estar velha. Voltou para a tela, busca de novo.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") agendarRefetch();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(channel);
    };
  }, [fetchReqs, agendarRefetch, userId]);

  /** Botão de atualizar: busca de novo e SEMPRE diz o resultado. */
  const atualizarManualmente = async () => {
    const ok = await fetchReqs(true);
    // id fixo: tocar várias vezes não empilha avisos.
    if (ok) {
      toast.success(`Lista atualizada às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`, { id: "lista-atualizada" });
    } else {
      toast.error("Não foi possível atualizar agora. Confira a internet e tente de novo.", { id: "lista-atualizada" });
    }
  };

  return {
    reqs,
    loading,
    updating,
    lastUpdated,
    atualizarManualmente,
  };
}
