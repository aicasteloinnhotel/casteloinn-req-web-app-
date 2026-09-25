import React from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useInstallApp } from "@/hooks/useInstallApp";
import { dispensarConvite, reabrirConvite } from "@/lib/instalacao";

/**
 * Cartão que convida a instalar o app quando ele está aberto como site.
 *
 * Aparece toda vez que o site é aberto e o app ainda não está instalado; o
 * "Agora não" esconde só até a próxima abertura. Assim quem não sabe mexer no
 * menu do navegador instala com um toque.
 */
export function ConviteInstalacao({ className = "" }: { className?: string }) {
  const { conviteVisivel, podeInstalar, precisaInstrucaoIOS, promptInstall } = useInstallApp();

  if (!conviteVisivel) return null;

  const instalar = async () => {
    const resultado = await promptInstall();
    if (resultado === "aceito") {
      toast.success("Pronto! O app foi instalado na tela inicial.");
    } else if (resultado === "recusado") {
      dispensarConvite();
    }
  };

  // iPhone: não existe botão que instale; o jeito é explicar o caminho.
  if (!podeInstalar && precisaInstrucaoIOS) {
    return (
      <div className={`flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 ${className}`}>
        <span className="mt-0.5 shrink-0 rounded-full bg-teal-600 p-1.5 text-white">
          <Download className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-teal-900">Instale o app no seu iPhone</p>
          <p className="text-xs leading-relaxed text-teal-800 mt-0.5">
            Toque em <Share className="inline h-3.5 w-3.5 -mt-0.5" aria-label="Compartilhar" />{" "}
            <strong>Compartilhar</strong> na barra do Safari e depois em{" "}
            <SquarePlus className="inline h-3.5 w-3.5 -mt-0.5" aria-hidden />{" "}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={dispensarConvite}
          title="Agora não"
          className="h-9 w-9 shrink-0 text-teal-700 hover:bg-teal-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 ${className}`}>
      <span className="shrink-0 rounded-full bg-teal-600 p-1.5 text-white">
        <Download className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-teal-900">Instale o app neste aparelho</p>
        <p className="text-xs leading-snug text-teal-800">Abre direto da tela inicial, como um aplicativo.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          onClick={instalar}
          className="h-9 bg-teal-600 px-3 font-bold text-white hover:bg-teal-700"
        >
          Instalar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={dispensarConvite}
          title="Agora não"
          className="h-9 w-9 text-teal-700 hover:bg-teal-100"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Botão discreto (só o ícone) para o cabeçalho. Some quando o app já está
 * instalado ou quando o aparelho não permite instalar.
 */
export function BotaoInstalar({ className = "" }: { className?: string }) {
  const { podeInstalar, precisaInstrucaoIOS, promptInstall } = useInstallApp();
  if (!podeInstalar && !precisaInstrucaoIOS) return null;

  const aoTocar = async () => {
    if (podeInstalar) {
      const resultado = await promptInstall();
      if (resultado === "aceito") toast.success("Pronto! O app foi instalado na tela inicial.");
    } else {
      // No iPhone o cartão com o passo a passo volta a aparecer.
      reabrirConvite();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <button
      type="button"
      onClick={aoTocar}
      title="Instalar o app neste aparelho"
      aria-label="Instalar o app neste aparelho"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-teal-100 hover:bg-teal-800 hover:text-white transition-colors ${className}`}
    >
      <Download className="h-5 w-5" />
    </button>
  );
}
