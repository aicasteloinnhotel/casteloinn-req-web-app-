import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, hasSupabaseKeys } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { definirBloqueioRequisicoes, getBloqueioRequisicoes } from "@/services/api";
import type { BloqueioRequisicoes } from "@/types";

interface BloqueioContextType {
  bloqueio: BloqueioRequisicoes;
  /** O almoxarifado suspende a criação de requisições (inventário). */
  suspender: (motivo?: string) => Promise<void>;
  liberar: () => Promise<void>;
}

const BloqueioContext = createContext<BloqueioContextType>({
  bloqueio: { ativo: false },
  suspender: async () => {},
  liberar: async () => {},
});

/**
 * Pausa para inventário, uma só para o app inteiro. Fica num contexto para que
 * a faixa do topo, a tela inicial e a tela de pedido leiam a mesma informação,
 * com um único canal de tempo real: ligou num aparelho, todos veem na hora.
 */
export function BloqueioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bloqueio, setBloqueio] = useState<BloqueioRequisicoes>({ ativo: false });

  const recarregar = useCallback(async () => {
    setBloqueio(await getBloqueioRequisicoes());
  }, []);

  useEffect(() => {
    if (!hasSupabaseKeys || !user) return;
    recarregar();

    const canal = supabase
      .channel(`bloqueio-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bloqueio_requisicoes" },
        () => recarregar(),
      )
      .subscribe();

    // Aparelho que dormiu pode ter perdido o aviso do tempo real.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      supabase.removeChannel(canal);
    };
  }, [user?.id, recarregar]);

  // Só o Almoxarifado pausa e libera. O banco confere de novo (função
  // definir_bloqueio_requisicoes), então nem pela API dá para contornar.
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";

  const suspender = async (motivo?: string) => {
    if (!user || !ehAlmoxarifado) throw new Error("Só o Almoxarifado pode pausar as requisições.");
    await definirBloqueioRequisicoes(true, user.id, motivo);
    await recarregar();
  };

  const liberar = async () => {
    if (!user || !ehAlmoxarifado) throw new Error("Só o Almoxarifado pode liberar as requisições.");
    await definirBloqueioRequisicoes(false, user.id);
    await recarregar();
  };

  return (
    <BloqueioContext.Provider value={{ bloqueio, suspender, liberar }}>
      {children}
    </BloqueioContext.Provider>
  );
}

export const useBloqueio = () => useContext(BloqueioContext);
