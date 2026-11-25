import React, { useEffect, useRef, useState } from "react";
import { Check, Minus, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Item } from "@/types";
import { formatarQtd, rotuloUnidade, unidadesDoItem } from "@/lib/unidades";
import { formatItemName } from "@/lib/utils";

/** "2 caixas", "1 quilo", "3 galões": a unidade por extenso, no plural quando precisa. */
export function nomeDaUnidade(unidade: string, quantidade: number): string {
  const nome = rotuloUnidade(unidade);
  if (nome === unidade) return unidade; // unidade fora da lista: fica a sigla
  const n = nome.toLowerCase();
  if (quantidade <= 1) return n;
  if (n.endsWith("ão")) return n.slice(0, -2) + "ões";
  if (/[rz]$/.test(n)) return n + "es";
  return n.endsWith("s") ? n : n + "s";
}

/** − [ 3 ] +  O contador dos itens do pedido (o mesmo nas duas telas). */
export function Contador({
  valor,
  aoMudar,
  rotulo,
  inputRef,
  aoConfirmar,
  minimo = 0,
  grande = false,
}: {
  valor: number | "";
  aoMudar: (v: number | "") => void;
  rotulo: string;
  inputRef?: React.Ref<HTMLInputElement>;
  aoConfirmar?: () => void;
  minimo?: number;
  /** Na janela de adicionar: alvos de 48px e número maior (é o foco dela). */
  grande?: boolean;
}) {
  const atual = typeof valor === "number" ? valor : 0;
  const mudar = (v: number) => aoMudar(Math.max(minimo, Math.round(v * 1000) / 1000));
  const botao = grande ? "w-14" : "w-10";
  const icone = grande ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className={`flex items-center ${grande ? "h-12 w-full" : "h-11"} shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden`}>
      <button
        type="button"
        onClick={() => mudar(atual - 1)}
        disabled={atual <= minimo}
        aria-label="Diminuir quantidade"
        className={`h-full ${botao} shrink-0 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation`}
      >
        <Minus className={icone} />
      </button>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        enterKeyHint="done"
        step="any"
        min={0}
        value={valor}
        onChange={(e) => aoMudar(e.target.value === "" ? "" : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && aoConfirmar) {
            e.preventDefault();
            aoConfirmar();
          }
        }}
        aria-label={rotulo}
        className={`h-full ${grande ? "min-w-0 flex-1 text-xl font-black" : "w-14 text-base font-bold"} text-center text-slate-800 border-x border-slate-200 focus:outline-none focus:bg-teal-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      <button
        type="button"
        onClick={() => mudar(atual + 1)}
        aria-label="Aumentar quantidade"
        className={`h-full ${botao} shrink-0 flex items-center justify-center text-slate-600 hover:bg-slate-100 touch-manipulation`}
      >
        <Plus className={icone} />
      </button>
    </div>
  );
}

/** Computador (mouse): o cursor já vai para a quantidade. No celular não, senão o teclado cobre tudo. */
const temMouse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * Escolher unidade e quantidade de UM material, numa janela do app (a mesma
 * de "Adicionar item entregue"). Antes isso abria dentro da lista de
 * resultados, colado nos outros itens, e a pessoa não sabia onde tocar.
 */
export function AdicionarAoPedido({
  item: itemAberto, jaNoPedido, aoFechar, aoAdicionar,
}: {
  item: Item | null;
  /** "2 UN · 1 CX": o que já está no pedido deste material. */
  jaNoPedido?: string;
  aoFechar: () => void;
  aoAdicionar: (quantidade: number, unidade: string) => void;
}) {
  // Enquanto a janela fecha, ela continua mostrando o último material: sem
  // isto o conteúdo ficava vazio por um instante.
  const [item, setItem] = useState<Item | null>(itemAberto);
  useEffect(() => {
    if (itemAberto) setItem(itemAberto);
  }, [itemAberto]);
  const unidades = item ? unidadesDoItem(item) : [];
  const [unidade, setUnidade] = useState("");
  const [qtd, setQtd] = useState<number | "">(1);
  const [faltaUnidade, setFaltaUnidade] = useState(false);
  const qtdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!itemAberto) return;
    const us = unidadesDoItem(itemAberto);
    // Uma unidade só: não há o que escolher.
    setUnidade(us.length === 1 ? us[0] : "");
    setQtd(1);
    setFaltaUnidade(false);
    if (temMouse()) setTimeout(() => qtdRef.current?.select(), 50);
  }, [itemAberto]);

  const numero = typeof qtd === "number" ? qtd : 0;

  const adicionar = () => {
    if (!unidade) {
      // Sem botão apagado (que não explica nada): toca e a tela mostra o que falta.
      setFaltaUnidade(true);
      return;
    }
    if (numero <= 0) return;
    aoAdicionar(numero, unidade);
  };

  const rotulo = "text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

  return (
    <Dialog open={!!itemAberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className="sm:max-w-md w-[94vw] max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 border-b bg-slate-50 shrink-0 pr-10">
          <DialogTitle className="flex items-start gap-2 text-teal-900 font-bold text-left [overflow-wrap:anywhere]">
            <PackagePlus className="h-5 w-5 shrink-0 mt-0.5" /> {formatItemName(item?.nome)}
          </DialogTitle>
          <DialogDescription className="text-left">
            {jaNoPedido ? <>Já no pedido: <strong className="text-teal-700">{jaNoPedido}</strong></> : "Escolha a unidade e a quantidade."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <span className={rotulo}>Unidade</span>
            {/* Cada unidade é um botão do app (branco, borda clara). A escolhida
                vira o botão verde do app com o ✓: não dá para ficar em dúvida
                sobre o que está marcado — branco sobre cinza não bastava. */}
            <div
              role="radiogroup"
              aria-label="Unidade"
              className={`grid grid-cols-3 gap-2 rounded-lg ${faltaUnidade ? "ring-2 ring-amber-300 ring-offset-2" : ""}`}
            >
              {unidades.map((u) => {
                const marcada = unidade === u;
                return (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    onClick={() => { setUnidade(u); setFaltaUnidade(false); }}
                    title={u}
                    className={`h-12 min-w-0 px-2 rounded-lg border text-sm font-bold inline-flex items-center justify-center gap-1 transition-colors touch-manipulation ${
                      marcada
                        ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50"
                    }`}
                  >
                    {marcada && <Check className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{rotuloUnidade(u)}</span>
                  </button>
                );
              })}
            </div>
            {faltaUnidade && <p className="mt-1.5 text-xs font-semibold text-amber-800">Escolha a unidade.</p>}
          </div>

          <div>
            <span className={rotulo}>Quantidade</span>
            <Contador
              valor={qtd}
              aoMudar={setQtd}
              rotulo={`Quantidade de ${formatItemName(item?.nome)}`}
              inputRef={qtdRef}
              aoConfirmar={adicionar}
              minimo={1}
              grande
            />
          </div>
        </div>

        <div className="p-4 border-t bg-white shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={aoFechar} className="font-bold h-12 sm:h-11">
            Cancelar
          </Button>
          <Button
            onClick={adicionar}
            disabled={numero <= 0}
            className="font-bold h-12 sm:h-11 bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="h-4 w-4" />
            {unidade ? `Adicionar ${formatarQtd(numero)} ${nomeDaUnidade(unidade, numero)}` : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
