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
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      else setUpdating(true);

      try {
        const data = await getRequisicoes(userId);
        setReqs(data || []);
        setLastUpdated(new Date());
      } catch (error: any) {
        console.error("Erro ao carregar requisições DADOS:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        setReqs([]);
        if (!isSilent) {
          const detail = error?.message || error?.details || JSON.stringify(error);
          toast.error(`Erro ao carregar requisições: ${detail}`);
        }
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

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchReqs, agendarRefetch, userId]);

  const atualizarManualmente = () => {
    fetchReqs(true);
  };

  return {
    reqs,
    loading,
    updating,
    lastUpdated,
    atualizarManualmente,
  };
}
