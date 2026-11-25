import React, { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { Item } from "@/types";
import { formatarQtd, rotuloUnidade, unidadesDoItem } from "@/lib/unidades";

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

/** Computador (mouse): o cursor já vai para a quantidade. No celular não, senão o teclado cobre tudo. */
const temMouse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/**
 * Escolher unidade e quantidade de UM material, numa folha que sobe de baixo.
 *
 * Antes isso aparecia dentro da lista de resultados, com botões pequenos e o
 * teclado aberto: a pessoa não sabia se tocava na unidade, no item ou no
 * "adicionar". Aqui é um passo de cada vez, de cima para baixo, com alvos
 * grandes: 1) unidade (por extenso), 2) quantidade, 3) um botão largo que diz
 * exatamente o que vai entrar no pedido ("Adicionar 2 Caixas").
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
  // Enquanto a folha desce, ela continua mostrando o último material: sem
  // isto o conteúdo ficava vazio por um instante ao fechar.
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
  const mudar = (v: number) => setQtd(Math.max(0, Math.round(v * 1000) / 1000));

  const adicionar = () => {
    if (!unidade) {
      // Sem botão apagado (que não explica nada): toca e a tela mostra o que falta.
      setFaltaUnidade(true);
      return;
    }
    if (numero <= 0) return;
    aoAdicionar(numero, unidade);
  };

  const rotuloDoBotao = !unidade ? "Adicionar ao pedido" : `Adicionar ${formatarQtd(numero)} ${nomeDaUnidade(unidade, numero)}`;

  return (
    <Sheet open={!!itemAberto} onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 gap-0 max-h-[92vh] overflow-y-auto sm:max-w-lg sm:mx-auto sm:bottom-6 sm:rounded-3xl sm:border"
      >
        {/* Alça: diz que dá para arrastar/fechar, como as folhas do celular. */}
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden />
        <div className="px-5 pt-3 pb-5 space-y-5">
          <div className="pr-8">
            <SheetTitle className="text-xl font-black leading-tight text-slate-900 [overflow-wrap:anywhere]">
              {item?.nome}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm font-medium text-slate-500">
              {jaNoPedido ? <>Já no pedido: <strong className="text-teal-700">{jaNoPedido}</strong></> : "Escolha a unidade e a quantidade."}
            </SheetDescription>
          </div>

          {/* 1. Unidade */}
          <div className="space-y-2">
            <p className={`text-sm font-black ${faltaUnidade ? "text-red-700" : "text-slate-800"}`}>
              <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">1</span>
              {unidades.length > 1 ? "Em que unidade?" : "Unidade"}
            </p>
            {unidades.length > 1 ? (
              <div
                role="radiogroup"
                aria-label="Unidade"
                className={`grid grid-cols-2 gap-2 rounded-2xl ${faltaUnidade ? "ring-2 ring-red-300 ring-offset-2" : ""}`}
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
                      className={`relative flex h-14 flex-col items-center justify-center rounded-xl border-2 px-2 transition-colors touch-manipulation ${
                        marcada
                          ? "border-teal-600 bg-teal-50 text-teal-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {marcada && <Check className="absolute right-2 top-2 h-4 w-4 text-teal-600" strokeWidth={3} />}
                      <span className="text-base font-black leading-none">{rotuloUnidade(u)}</span>
                      <span className="mt-1 text-[11px] font-bold opacity-60">{u}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="flex h-12 items-center rounded-xl border-2 border-teal-600 bg-teal-50 px-4 text-base font-black text-teal-900">
                {unidades[0] && rotuloUnidade(unidades[0])}
                <span className="ml-1.5 text-xs font-bold opacity-60">{unidades[0]}</span>
                <Check className="ml-auto h-4 w-4 text-teal-600" strokeWidth={3} />
              </p>
            )}
            {faltaUnidade && <p className="text-sm font-bold text-red-700">Toque na unidade antes de adicionar.</p>}
          </div>

          {/* 2. Quantidade */}
          <div className="space-y-2">
            <p className="text-sm font-black text-slate-800">
              <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">2</span>
              Quantos?
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => mudar(numero - 1)}
                disabled={numero <= 1}
                aria-label="Diminuir"
                className="h-14 w-14 shrink-0 rounded-2xl border-2 border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 disabled:opacity-35 touch-manipulation"
              >
                <Minus className="h-6 w-6" strokeWidth={2.5} />
              </button>
              <input
                ref={qtdRef}
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                step="any"
                min={0}
                value={qtd}
                onChange={(e) => setQtd(e.target.value === "" ? "" : Number(e.target.value))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
                aria-label="Quantidade"
                className="h-14 w-28 rounded-2xl border-2 border-slate-200 bg-white text-center text-3xl font-black text-slate-900 tabular-nums focus:outline-none focus:border-teal-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => mudar(numero + 1)}
                aria-label="Aumentar"
                className="h-14 w-14 shrink-0 rounded-2xl border-2 border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 touch-manipulation"
              >
                <Plus className="h-6 w-6" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* 3. Confirmar: um botão só, que diz o que vai entrar no pedido. */}
          <button
            type="button"
            onClick={adicionar}
            disabled={numero <= 0}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 text-lg font-black text-white shadow-lg shadow-teal-900/15 hover:bg-teal-700 active:scale-[0.99] disabled:opacity-40 transition touch-manipulation"
          >
            <Plus className="h-5 w-5" strokeWidth={3} /> {rotuloDoBotao}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
