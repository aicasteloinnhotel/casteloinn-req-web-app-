import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Flame, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { churrascoDisponivel, getChurrascos } from "@/services/api";
import type { Churrasco } from "@/types";
import { formatarQtd, quantidadeDevolvida } from "@/lib/unidades";
import { foiEntregue } from "@/lib/utils";
import { etapaDoChurrasco, grupoDoItem, ROTULO_ETAPA, sugestaoCarneKg, type EtapaChurrasco } from "@/lib/churrasco";
import { BOTAO_PRIMARIO, TITULO } from "@/lib/estilos";

/** Cor da etapa: borda do cartão e pílula (as mesmas cores dos status do app). */
const COR: Record<EtapaChurrasco, { borda: string; pilula: string }> = {
  SEPARAR: { borda: "border-l-yellow-400", pilula: "bg-yellow-100 text-yellow-800" },
  VOLTA: { borda: "border-l-violet-500", pilula: "bg-violet-100 text-violet-800" },
  LANCAR: { borda: "border-l-amber-500", pilula: "bg-amber-100 text-amber-800 border border-amber-200" },
  PRONTO: { borda: "border-l-emerald-400", pilula: "bg-emerald-600 text-white" },
  CANCELADO: { borda: "border-l-red-400", pilula: "bg-red-100 text-red-700" },
};

/** Números de um churrasco: carne (kg) e bebidas (saiu, voltou, vendeu). */
export function resumoDoChurrasco(c: Churrasco) {
  const req = c.requisicao;
  const entregue = !!req && foiEntregue(req.status);
  let carneKg = 0, bebSaiu = 0, bebVoltou = 0;
  for (const l of req?.itens || []) {
    const g = grupoDoItem(c.grupos, l.item_id, l.item?.nome);
    const saiu = entregue ? Number(l.quantidade_separada ?? 0) : Number(l.quantidade ?? 0);
    const und = ((entregue ? l.unidade_separada || l.unidade : l.unidade) || l.item?.unidade || "").toUpperCase();
    if (g === "CARNE" && und === "KG") carneKg += saiu;
    if (g === "BEBIDA") { bebSaiu += saiu; bebVoltou += quantidadeDevolvida(l); }
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { entregue, carneKg: r(carneKg), bebSaiu: r(bebSaiu), bebVoltou: r(bebVoltou), bebVendeu: r(bebSaiu - bebVoltou) };
}

export default function ListaChurrascos() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<Churrasco[]>([]);
  const [semAjuste, setSemAjuste] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [ok, cs] = await Promise.all([churrascoDisponivel(), getChurrascos()]);
      if (!vivo) return;
      setSemAjuste(!ok);
      setLista(cs);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  // Média real de carne por pessoa, só com churrascos já entregues (como a
  // "MÉDIA GERAL" da aba QTD Carnes, mas com o peso que de fato saiu).
  const media = useMemo(() => {
    const feitos = lista.filter((c) => (c.pax || 0) > 0 && resumoDoChurrasco(c).entregue);
    const kg = feitos.reduce((s, c) => s + resumoDoChurrasco(c).carneKg, 0);
    const pax = feitos.reduce((s, c) => s + (c.pax || 0), 0);
    return { n: feitos.length, kgPorPax: pax > 0 ? Math.round((kg / pax) * 1000) / 1000 : 0, kg: Math.round(kg * 100) / 100 };
  }, [lista]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className={TITULO}>Churrascos</h1>
        <Link to="/churrascos/novo">
          <Button className={BOTAO_PRIMARIO} disabled={semAjuste}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo
          </Button>
        </Link>
      </div>

      {semAjuste && !carregando && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          O churrasco ainda não existe no banco. Rode o script AJUSTE_11 no Supabase.
        </p>
      )}

      {media.n > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/50">
          <span className="h-10 w-10 shrink-0 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
            <Flame className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Média real de carne</p>
            <p className="text-sm text-slate-700">
              <strong className="text-lg text-slate-900">{formatarQtd(media.kgPorPax)} kg</strong> por PAX
              <span className="text-slate-500"> · {media.n} {media.n === 1 ? "churrasco" : "churrascos"}, {formatarQtd(media.kg)} kg</span>
            </p>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
      ) : lista.length === 0 ? (
        !semAjuste && (
          <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200/80">
            <p className="text-slate-700 font-medium">Nenhum churrasco ainda.</p>
          </div>
        )
      ) : (
        <div className="grid gap-2">
          {lista.map((c) => {
            const req = c.requisicao;
            const etapa = etapaDoChurrasco(req?.status || "PENDENTE", req?.lancado, c.volta_conferida_em);
            const r = resumoDoChurrasco(c);
            const sug = sugestaoCarneKg(c.pax || 0, c.tipo);
            return (
              <button
                key={c.requisicao_id}
                type="button"
                onClick={() => navigate(`/requisicoes/${c.requisicao_id}`)}
                className={`w-full text-left rounded-xl bg-white border-l-4 ${COR[etapa].borda} px-3.5 py-3 shadow-lg shadow-slate-200/50 hover:ring-2 hover:ring-teal-500/50 transition-all space-y-1`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm leading-snug text-slate-800 break-words">
                    <span className="font-black tabular-nums">{c.data_evento ? format(parseISO(c.data_evento), "dd/MM") : "--/--"}</span>
                    <span className="text-slate-300"> · </span>
                    <span className="font-bold">{c.empresa}</span>
                  </p>
                  <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${COR[etapa].pilula}`}>
                    {ROTULO_ETAPA[etapa]}
                  </span>
                </div>
                <p className="text-xs text-slate-600 tabular-nums">
                  #{req?.codigo_requisicao ?? "---"}
                  {c.pax ? ` · ${c.pax} PAX` : ""}
                  {r.carneKg > 0 && ` · ${formatarQtd(r.carneKg)} kg de carne`}
                  {sug > 0 && <span className="text-slate-400"> (sugerido {formatarQtd(sug)})</span>}
                  {r.entregue && r.bebSaiu > 0 && ` · bebidas: ${formatarQtd(r.bebSaiu)} saíram`}
                  {c.volta_conferida_em && r.bebSaiu > 0 && `, ${formatarQtd(r.bebVendeu)} vendidas`}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
