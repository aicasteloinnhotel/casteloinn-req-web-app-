import React, { useState } from "react";
import { format } from "date-fns";
import { PauseCircle, PlayCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBloqueio } from "@/contexts/BloqueioContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * Faixa no topo de todas as telas enquanto a pausa estiver ligada. Para o
 * solicitante explica por que não dá para pedir; para o almoxarifado lembra
 * que está ligada (para não esquecer de liberar) e já traz o botão.
 */
export function FaixaPausa() {
  const { user } = useAuth();
  const { bloqueio, liberar } = useBloqueio();
  const [liberando, setLiberando] = useState(false);

  if (!bloqueio.ativo) return null;
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";

  const aoLiberar = async () => {
    setLiberando(true);
    try {
      await liberar();
      toast.success("Requisições liberadas. Os setores já podem pedir de novo.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível liberar as requisições.");
    } finally {
      setLiberando(false);
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
        <PauseCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-amber-950">
          Novas requisições suspensas: {bloqueio.motivo || "inventário em andamento"}
        </p>
        <p className="text-xs leading-snug text-amber-900">
          {ehAlmoxarifado
            ? `Ligado${bloqueio.alterado_em ? ` em ${format(new Date(bloqueio.alterado_em), "dd/MM 'às' HH:mm")}` : ""}. Os pedidos em andamento continuam normalmente.`
            : "Os pedidos que você já fez continuam valendo. Assim que o almoxarifado liberar, dá para pedir de novo."}
        </p>
      </div>
      {ehAlmoxarifado && (
        <Button
          onClick={aoLiberar}
          disabled={liberando}
          className="h-10 shrink-0 bg-emerald-600 px-4 font-bold text-white hover:bg-emerald-700"
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          {liberando ? "Liberando..." : "Liberar requisições"}
        </Button>
      )}
    </div>
  );
}

/**
 * Botão do almoxarifado para suspender a criação de requisições durante o
 * inventário. Com a pausa ligada ele some: quem libera é a faixa do topo.
 */
export function BotaoSuspenderRequisicoes({ className = "" }: { className?: string }) {
  const { bloqueio, suspender } = useBloqueio();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("Inventário em andamento");
  const [salvando, setSalvando] = useState(false);

  if (bloqueio.ativo) return null;

  const confirmar = async () => {
    setSalvando(true);
    try {
      await suspender(motivo);
      toast.success("Novas requisições suspensas. Lembre de liberar no fim do inventário.");
      setAberto(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível suspender as requisições.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setAberto(true)}
        title="Suspender novas requisições (inventário)"
        className={`h-9 border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-50 ${className}`}
      >
        <PauseCircle className="mr-1.5 h-4 w-4" /> Pausar requisições
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suspender novas requisições?</DialogTitle>
            <DialogDescription>
              Ninguém consegue criar requisição nova até você liberar. Pedidos que já existem
              continuam: dá para separar, entregar e lançar normalmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="motivo-pausa" className="text-sm font-bold text-slate-700">
              Motivo (aparece para todos)
            </label>
            <Textarea
              id="motivo-pausa"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={120}
              className="min-h-[70px] resize-none"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando} className="font-bold">
              Voltar
            </Button>
            <Button
              onClick={confirmar}
              disabled={salvando}
              className="bg-amber-600 font-bold text-white hover:bg-amber-700"
            >
              {salvando ? "Suspendendo..." : "Suspender agora"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
