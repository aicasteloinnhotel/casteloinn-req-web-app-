import React, { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { estadoDosAvisos, pedirPermissaoDeAvisos } from "@/lib/notificacoes";
import { useAuth } from "@/contexts/AuthContext";

const CHAVE_DISPENSADO = "avisos_dispensado";

/**
 * Faixa que oferece ligar os avisos do sistema.
 *
 * Só aparece quando o navegador ainda não sabe a resposta. A permissão é pedida
 * no toque do botão de propósito: no celular, pedir sozinho no carregamento é
 * ignorado pelo navegador.
 */
export function AtivarAvisos() {
  const { user } = useAuth();
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";
  const [estado, setEstado] = useState(() => estadoDosAvisos());
  const [dispensado, setDispensado] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DISPENSADO) === "1";
    } catch {
      return false;
    }
  });

  if (estado !== "default" || dispensado) return null;

  const dispensar = () => {
    setDispensado(true);
    try {
      localStorage.setItem(CHAVE_DISPENSADO, "1");
    } catch {
      /* navegação privada: tudo bem, aparece de novo na próxima */
    }
  };

  const ligar = async () => {
    const resposta = await pedirPermissaoDeAvisos();
    setEstado(resposta);
    if (resposta === "granted") {
      toast.success(
        ehAlmoxarifado
          ? "Avisos ligados. Você será avisado quando chegar requisição nova."
          : "Avisos ligados. Você será avisado quando a separação começar.",
      );
    } else if (resposta === "denied") {
      toast.info("Avisos bloqueados. Dá para liberar nas configurações do site, no navegador.");
      dispensar();
    }
  };

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:items-center">
      <span className="mt-0.5 shrink-0 rounded-full bg-teal-600 p-1.5 text-white sm:mt-0">
        <Bell className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-teal-900">
          {ehAlmoxarifado
            ? "Quer ser avisado quando chegar requisição nova?"
            : "Quer ser avisado quando a separação começar?"}
        </p>
        <p className="text-xs leading-snug text-teal-800">
          O aviso aparece na tela do aparelho com o app aberto ou minimizado.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          onClick={ligar}
          className="h-9 bg-teal-600 px-3 font-bold text-white hover:bg-teal-700"
        >
          Ligar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={dispensar}
          title="Agora não"
          className="h-9 w-9 text-teal-700 hover:bg-teal-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
