import React from "react";
import { Search, X } from "lucide-react";
import { CAMPO } from "@/lib/estilos";

/**
 * Campo de busca padrão das telas. Mesma altura e borda dos seletores ao lado,
 * lupa à esquerda e um X para limpar quando há texto.
 */
export function CampoBusca({
  valor,
  onMudar,
  placeholder = "Buscar...",
  className = "",
}: {
  valor: string;
  onMudar: (valor: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        type="search"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${CAMPO} w-full pl-9 ${valor ? "pr-9" : "pr-3"} font-medium placeholder:font-normal placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden`}
      />
      {valor && (
        <button
          type="button"
          onClick={() => onMudar("")}
          title="Limpar busca"
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
