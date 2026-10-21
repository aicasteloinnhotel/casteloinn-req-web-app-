import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { format } from "date-fns";
import { Copy, Download, FileSpreadsheet, Upload } from "lucide-react";
import { createItem, createItens, getItens, updateItem } from "@/services/api";
import {
  linhasDeExportacao,
  lerLinhasDaPlanilha,
  planejarImportacao,
  type OpcoesExportacao,
  type OpcoesImportacao,
  type PlanoDeImportacao,
  type QuaisItens,
} from "@/lib/planilhaItens";
import { toast } from "@/lib/toast";
import { Item } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ABA, ABA_ATIVA, ABA_INATIVA, ABAS, BOTAO_PRIMARIO } from "@/lib/estilos";

/**
 * Importar / Exportar o catálogo de itens, numa janela só.
 *
 * Exportar: escolhe as colunas (Nome sempre; Medidas e Situação opcionais) e
 * quais itens (todos, ativos, inativos); copia (para colar no Excel) ou baixa
 * a planilha (CSV com ";" e acentos, que o Excel abre direto).
 *
 * Importar: a mesma escolha (cadastrar novos, acrescentar medidas, mudar a
 * situação). Lê o arquivo, mostra a PRÉVIA do que vai mudar e só grava ao
 * confirmar. Nunca apaga item nem remove medida.
 */

/**
 * Lê a planilha respeitando a codificação. O Excel no Windows salva "CSV" em
 * ANSI (windows-1252), não em UTF-8: lido como UTF-8, "Água Sanitária" virava
 * "�gua Sanit�ria" no catálogo. Tenta UTF-8 estrito e, se não for, ANSI.
 */
const lerTextoDaPlanilha = async (arquivo: File): Promise<string> => {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

type Aba = "exportar" | "importar";

function Opcao({
  id,
  marcado,
  aoMudar,
  titulo,
  detalhe,
  travado,
}: {
  id: string;
  marcado: boolean;
  aoMudar?: (v: boolean) => void;
  titulo: string;
  detalhe?: string;
  travado?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-lg border p-3 ${travado ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white cursor-pointer hover:bg-slate-50"}`}
    >
      <Checkbox
        id={id}
        checked={marcado}
        disabled={travado}
        onCheckedChange={(v) => aoMudar?.(!!v)}
        className="mt-0.5 h-5 w-5 border-2 border-slate-400 data-checked:bg-teal-600 data-checked:border-teal-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800">{titulo}</span>
        {detalhe && <span className="block text-xs text-slate-500 leading-snug">{detalhe}</span>}
      </span>
    </label>
  );
}

export function ImportarExportarItens({
  itens,
  aberto,
  aoFechar,
  aoConcluir,
}: {
  itens: Item[];
  aberto: boolean;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [aba, setAba] = useState<Aba>("exportar");
  const [exp, setExp] = useState<OpcoesExportacao>({ medidas: true, situacao: true, quais: "todos" });
  const [imp, setImp] = useState<OpcoesImportacao>({ novos: true, medidas: true, situacao: false });
  const [arquivo, setArquivo] = useState<string>("");
  const [plano, setPlano] = useState<PlanoDeImportacao | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [planilhaSemSituacao, setPlanilhaSemSituacao] = useState(false);
  const linhasLidas = useRef<ReturnType<typeof lerLinhasDaPlanilha>["linhas"]>([]);
  const entradaArquivo = useRef<HTMLInputElement>(null);
  // Catálogo lido do banco na hora de abrir a planilha (a prévia compara com ele).
  const catalogoAtual = useRef<Item[]>([]);

  useEffect(() => {
    if (!aberto) return;
    setArquivo("");
    setPlano(null);
    linhasLidas.current = [];
  }, [aberto]);

  // Mudou uma opção depois de ler o arquivo: refaz a prévia.
  useEffect(() => {
    if (linhasLidas.current.length === 0) return;
    setPlano(planejarImportacao(linhasLidas.current, catalogoAtual.current, imp));
  }, [imp]);

  // ---------- Exportar
  const linhas = () => linhasDeExportacao(itens, exp);
  const quantos = Math.max(0, linhas().length - 1);

  const copiar = async () => {
    const texto = linhas().map((l) => l.join("\t")).join("\r\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${quantos} itens copiados. Cole no Excel.`);
    } catch {
      toast.error('O navegador não liberou a cópia. Use "Baixar planilha".');
    }
  };

  const baixar = () => {
    // CSV com ";" e marca UTF-8: o Excel em português abre direto, com acentos
    // e cada coisa na sua coluna. É o mesmo formato que a importação lê.
    const campo = (v: string) => (/[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = linhas().map((l) => l.map(campo).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Itens_Castelo_Inn_${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Planilha com ${quantos} itens baixada.`);
  };

  // ---------- Importar
  const escolherArquivo = () => entradaArquivo.current?.click();

  const lerArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLendo(true);
    setPlano(null);
    try {
      const texto = await lerTextoDaPlanilha(f);
      const dados = Papa.parse<string[]>(texto, { skipEmptyLines: true }).data as string[][];
      if (dados.length === 0) throw new Error("O arquivo está vazio.");
      const lido = lerLinhasDaPlanilha(dados);
      linhasLidas.current = lido.linhas;
      setPlanilhaSemSituacao(!lido.temSituacao);
      setArquivo(f.name);
      // Catálogo fresco: alguém pode ter cadastrado item enquanto a tela estava aberta.
      catalogoAtual.current = await getItens();
      setPlano(planejarImportacao(lido.linhas, catalogoAtual.current, imp));
    } catch (erro: any) {
      linhasLidas.current = [];
      setArquivo("");
      toast.error(`Não deu para ler a planilha: ${erro?.message || "arquivo ilegível"}`);
    } finally {
      setLendo(false);
    }
  };

  const totalMudancas = plano ? plano.inserir.length + plano.completarMedidas.length + plano.mudarSituacao.length : 0;

  const gravar = async () => {
    if (!plano || totalMudancas === 0) return;
    setGravando(true);
    let inseridos = 0, completados = 0, situacoes = 0, falhas = 0;
    try {
      // Novos em lotes de 100; um item problemático não derruba o lote inteiro.
      for (let i = 0; i < plano.inserir.length; i += 100) {
        const lote = plano.inserir.slice(i, i + 100);
        try {
          await createItens(lote);
          inseridos += lote.length;
        } catch {
          for (const item of lote) {
            try {
              await createItem(item);
              inseridos++;
            } catch (erro) {
              console.error("Erro ao importar item:", item.nome, erro);
              falhas++;
            }
          }
        }
      }
      for (const c of plano.completarMedidas) {
        try {
          await updateItem(c.id, { unidade: c.unidade, unidades: c.unidades });
          completados++;
        } catch (erro) {
          console.error("Erro ao acrescentar medidas:", c.nome, erro);
          falhas++;
        }
      }
      for (const s of plano.mudarSituacao) {
        try {
          await updateItem(s.id, { ativo: s.ativo });
          situacoes++;
        } catch (erro) {
          console.error("Erro ao mudar situação:", s.nome, erro);
          falhas++;
        }
      }
      const partes = [
        inseridos && `${inseridos} cadastrado(s)`,
        completados && `${completados} com medidas novas`,
        situacoes && `${situacoes} com situação alterada`,
      ].filter(Boolean);
      if (partes.length) toast.success(`Importação concluída: ${partes.join(", ")}.`);
      if (falhas) toast.warning(`${falhas} linha(s) não puderam ser gravadas. Tente importar de novo.`);
      aoConcluir();
      aoFechar();
    } finally {
      setGravando(false);
    }
  };

  const exemplos = (nomes: string[]) =>
    nomes.length === 0 ? "" : nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : "");

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a && !gravando) aoFechar(); }}>
      <DialogContent className="sm:max-w-lg w-[94vw] max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 border-b bg-slate-50 shrink-0 pr-10">
          <DialogTitle className="flex items-center gap-2 text-teal-900 font-bold">
            <FileSpreadsheet className="h-5 w-5 shrink-0" /> Importar / Exportar itens
          </DialogTitle>
          <DialogDescription>Planilha do catálogo: Nome, Medidas e Situação.</DialogDescription>
        </DialogHeader>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className={ABAS} role="tablist">
            {(["exportar", "importar"] as Aba[]).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={aba === a}
                onClick={() => setAba(a)}
                className={`${ABA} ${aba === a ? ABA_ATIVA : ABA_INATIVA}`}
              >
                {a === "exportar" ? <Download className="w-4 h-4 shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
                {a === "exportar" ? "Exportar" : "Importar"}
              </button>
            ))}
          </div>

          {aba === "exportar" && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Colunas</p>
              <Opcao id="exp-nome" marcado travado titulo="Nome do item" detalhe="Sempre vai." />
              <Opcao
                id="exp-medidas"
                marcado={exp.medidas}
                aoMudar={(v) => setExp({ ...exp, medidas: v })}
                titulo="Medidas"
                detalhe="Ex.: UN/KG/CX"
              />
              <Opcao
                id="exp-situacao"
                marcado={exp.situacao}
                aoMudar={(v) => setExp({ ...exp, situacao: v })}
                titulo="Situação"
                detalhe="Ativo ou Inativo"
              />

              <label htmlFor="exp-quais" className="block text-xs font-bold uppercase tracking-wide text-slate-500 pt-1">
                Quais itens
              </label>
              <select
                id="exp-quais"
                value={exp.quais}
                onChange={(e) => setExp({ ...exp, quais: e.target.value as QuaisItens })}
                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="todos">Todos</option>
                <option value="ativos">Só os ativos</option>
                <option value="inativos">Só os inativos</option>
              </select>
              <p className="text-xs text-slate-500">{quantos} itens na planilha.</p>
            </div>
          )}

          {aba === "importar" && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">O que aplicar</p>
              <Opcao
                id="imp-novos"
                marcado={imp.novos}
                aoMudar={(v) => setImp({ ...imp, novos: v })}
                titulo="Cadastrar itens novos"
                detalhe="O que ainda não existe no catálogo."
              />
              <Opcao
                id="imp-medidas"
                marcado={imp.medidas}
                aoMudar={(v) => setImp({ ...imp, medidas: v })}
                titulo="Acrescentar medidas"
                detalhe="Item que já existe ganha as medidas novas. Nenhuma medida é removida."
              />
              <Opcao
                id="imp-situacao"
                marcado={imp.situacao}
                aoMudar={(v) => setImp({ ...imp, situacao: v })}
                titulo="Ativar / desativar pela coluna Situação"
                detalhe="Desmarcado, a situação dos itens que já existem não muda."
              />

              <input ref={entradaArquivo} type="file" accept=".csv,text/csv" className="hidden" onChange={lerArquivo} />
              <Button variant="outline" onClick={escolherArquivo} disabled={lendo || gravando} className="w-full h-11 font-bold">
                <Upload className="h-4 w-4 mr-2" />
                {lendo ? "Lendo planilha..." : arquivo ? "Escolher outra planilha" : "Escolher planilha (.csv)"}
              </Button>
              <p className="text-xs text-slate-500 leading-snug">
                Colunas: <strong>Nome</strong>, <strong>Medidas</strong> (UN/KG) e <strong>Situação</strong> (Ativo/Inativo), com
                cabeçalho, como a planilha exportada. Sem cabeçalho: A = Nome, B = Medidas, C = Situação. Nada é apagado.
              </p>

              {plano && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
                  <p className="font-bold text-slate-800 [overflow-wrap:anywhere]">Prévia: {arquivo}</p>
                  {totalMudancas === 0 ? (
                    <p className="text-slate-600">Nada a mudar: o catálogo já está igual à planilha (com as opções marcadas).</p>
                  ) : (
                    <ul className="space-y-1 text-slate-700">
                      {plano.inserir.length > 0 && (
                        <li>
                          <strong className="text-teal-800">{plano.inserir.length} itens novos</strong>{" "}
                          <span className="text-xs text-slate-500">({exemplos(plano.inserir.map((i) => i.nome))})</span>
                        </li>
                      )}
                      {plano.completarMedidas.length > 0 && (
                        <li>
                          <strong className="text-sky-800">{plano.completarMedidas.length} ganham medidas</strong>{" "}
                          <span className="text-xs text-slate-500">
                            ({exemplos(plano.completarMedidas.map((c) => `${c.nome} +${c.novas.join("/")}`))})
                          </span>
                        </li>
                      )}
                      {plano.mudarSituacao.length > 0 && (
                        <li>
                          <strong className="text-amber-800">{plano.mudarSituacao.length} mudam de situação</strong>{" "}
                          <span className="text-xs text-slate-500">
                            ({exemplos(plano.mudarSituacao.map((s) => `${s.nome} → ${s.ativo ? "ativo" : "inativo"}`))})
                          </span>
                        </li>
                      )}
                    </ul>
                  )}
                  <p className="text-xs text-slate-500">
                    {plano.semMudanca} sem mudança
                    {plano.vazias > 0 && ` · ${plano.vazias} linha(s) vazia(s)`}
                    {plano.repetidas.length > 0 && ` · ${plano.repetidas.length} repetida(s) na planilha (vale a primeira)`}
                  </p>
                  {imp.situacao && planilhaSemSituacao && (
                    <p className="text-xs font-semibold text-amber-800">A planilha não tem coluna Situação: nenhum item muda de situação.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-white shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={aoFechar} disabled={gravando} className="font-bold h-11">
            Fechar
          </Button>
          {aba === "exportar" ? (
            <>
              <Button variant="outline" onClick={copiar} disabled={quantos === 0} className="font-bold h-11">
                <Copy className="h-4 w-4 mr-2" /> Copiar
              </Button>
              <Button onClick={baixar} disabled={quantos === 0} className={`${BOTAO_PRIMARIO} h-11`}>
                <Download className="h-4 w-4 mr-2" /> Baixar planilha
              </Button>
            </>
          ) : (
            <Button onClick={gravar} disabled={!plano || totalMudancas === 0 || gravando} className={`${BOTAO_PRIMARIO} h-11`}>
              {gravando ? "Importando..." : plano && totalMudancas > 0 ? `Importar ${totalMudancas} mudança(s)` : "Importar"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
