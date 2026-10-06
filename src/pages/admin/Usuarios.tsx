import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from "@/services/api";
import { Usuario, Perfil } from "@/types";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { hasSupabaseKeys } from "@/lib/supabase";
import { CampoBusca } from "@/components/CampoBusca";
import { contemTexto } from "@/lib/utils";
import { BOTAO_PRIMARIO, SELETOR, SUBTITULO, TITULO } from "@/lib/estilos";

/** Traduz os erros do banco que fazem sentido para quem está cadastrando. */
const mensagemDeErro = (err: any, padrao: string): string => {
  if (err?.code === "23505") return "Já existe um usuário com esse nome.";
  // P0001 é a proteção do banco que impede ficar sem Almoxarifado ativo; a
  // mensagem dela já vem pronta em português.
  return err?.message || padrao;
};

export default function Usuarios() {
  const { user } = useAuth();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);

  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({
    nome: "",
    senha: "",
    departamento: "",
    perfil: "SOLICITANTE" as Perfil,
    ativo: true,
  });

  const [filtroPerfil, setFiltroPerfil] = useState<string>("TODOS");
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");
  const [busca, setBusca] = useState<string>("");

  const usuariosFiltrados = usuarios.filter((u) => {
    if (busca.trim() && !contemTexto(`${u.nome} ${u.departamento}`, busca)) return false;
    if (filtroPerfil !== "TODOS" && u.perfil !== filtroPerfil) return false;
    if (filtroStatus !== "TODOS") {
      const isAtivo = filtroStatus === "ATIVOS";
      if (u.ativo !== isAtivo) return false;
    }
    return true;
  });

  // O sistema nunca pode ficar sem ninguém do Almoxarifado ativo: é ele quem
  // cadastra usuários e itens. O banco também recusa (trigger), mas aqui o
  // botão já nem deixa tentar.
  const almoxarifadosAtivos = usuarios.filter((u) => u.perfil === "ALMOXARIFADO" && u.ativo);
  const ehEuMesmo = (u: Usuario) => u.id === user?.id;
  const ehUltimoAlmoxarifado = (u: Usuario) =>
    u.perfil === "ALMOXARIFADO" && u.ativo && almoxarifadosAtivos.length <= 1;
  const motivoDeBloqueio = (u: Usuario): string | null => {
    if (ehEuMesmo(u)) return "Você não pode desativar nem excluir o seu próprio usuário.";
    if (ehUltimoAlmoxarifado(u)) return "É o único usuário do Almoxarifado ativo — o sistema ficaria sem administrador.";
    return null;
  };

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await getUsuarios();
      setUsuarios(data);
    } catch (e: any) {
      console.error("Erro ao carregar usuários:", e);
      toast.error(`Erro ao carregar usuários: ${e?.message || JSON.stringify(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (u?: Usuario) => {
    if (u) {
      setEditId(u.id);
      setForm({
        nome: u.nome,
        senha: "", // Senha vazia ao editar, preencher apenas se quiser alterar
        departamento: u.departamento,
        perfil: u.perfil,
        ativo: u.ativo,
      });
    } else {
      setEditId("");
      setForm({ nome: "", senha: "", departamento: "", perfil: "SOLICITANTE", ativo: true });
    }
    setOpen(true);
  };

  const editandoASiMesmo = !!editId && editId === user?.id;
  const usuarioEmEdicao = usuarios.find((u) => u.id === editId);
  const perfilTravado =
    editandoASiMesmo || (!!usuarioEmEdicao && ehUltimoAlmoxarifado(usuarioEmEdicao));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseKeys) {
      toast.error("O sistema não está conectado ao banco de dados.");
      return;
    }

    // O login é pelo nome: um espaço sobrando no cadastro fazia a pessoa não
    // conseguir entrar digitando o nome certo.
    const dados: Partial<typeof form> = {
      ...form,
      nome: form.nome.trim(),
      departamento: form.departamento.trim(),
    };
    if (!dados.nome || !dados.departamento) {
      toast.error("Preencha o nome e o departamento.");
      return;
    }
    if (editId && !dados.senha) {
      delete dados.senha;
    } else if ((dados.senha || "").length < 4) {
      toast.error("A senha precisa ter pelo menos 4 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      if (editId) {
        await updateUsuario(editId, dados);
        toast.success(
          editandoASiMesmo
            ? "Seus dados foram atualizados. Use o nome novo no próximo login."
            : "Usuário atualizado!",
        );
      } else {
        await createUsuario(dados as typeof form);
        toast.success("Usuário criado!");
      }
      setOpen(false);
      carregar();
    } catch (err: any) {
      toast.error(mensagemDeErro(err, "Erro ao salvar o usuário."));
    } finally {
      setSalvando(false);
    }
  };

  // Desativar é quase sempre melhor que excluir: o usuário perde o acesso mas
  // o nome dele continua aparecendo no histórico das requisições antigas.
  const toggleAtivo = async (u: Usuario) => {
    const bloqueio = u.ativo ? motivoDeBloqueio(u) : null;
    if (bloqueio) {
      toast.error(bloqueio);
      return;
    }
    try {
      await updateUsuario(u.id, { ativo: !u.ativo });
      toast.success(u.ativo ? "Usuário desativado." : "Usuário reativado.");
      carregar();
    } catch (e: any) {
      toast.error(mensagemDeErro(e, "Erro ao alterar o status do usuário."));
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUsuario(userToDelete.id);
      toast.success("Usuário excluído com sucesso!");
      carregar();
    } catch (e: any) {
      toast.error(mensagemDeErro(e, "Erro ao excluir usuário."));
    } finally {
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div>
        <h1 className={TITULO}>Gerenciar Usuários</h1>
        <p className={SUBTITULO}>Controle de acesso ao sistema de requisições.</p>
      </div>

      {/* Uma linha no computador, duas no celular — o mesmo padrão da tela de
          Requisições. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-1 min-w-0">
          <CampoBusca
            valor={busca}
            onMudar={setBusca}
            placeholder="Buscar por nome ou setor..."
            className="flex-1"
          />
          <Button
            onClick={() => handleOpen()}
            title="Cadastrar novo usuário"
            className={`${BOTAO_PRIMARIO} sm:hidden w-11 px-0 shrink-0`}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex gap-2">
          <select
            className={`${SELETOR} flex-1 sm:flex-none sm:w-40`}
            value={filtroPerfil}
            onChange={(e) => setFiltroPerfil(e.target.value)}
            aria-label="Filtrar por perfil"
          >
            <option value="TODOS">Todos os perfis</option>
            <option value="SOLICITANTE">Solicitante</option>
            <option value="ALMOXARIFADO">Almoxarifado</option>
          </select>
          <select
            className={`${SELETOR} flex-1 sm:flex-none sm:w-36`}
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            aria-label="Filtrar por situação"
          >
            <option value="TODOS">Todos</option>
            <option value="ATIVOS">Ativos</option>
            <option value="INATIVOS">Inativos</option>
          </select>
          <Button
            onClick={() => handleOpen()}
            className={`${BOTAO_PRIMARIO} hidden sm:inline-flex shrink-0`}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editId ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario-nome">Nome Completo (Login)</Label>
              <Input
                id="usuario-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
                autoComplete="off"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-senha">Senha {editId && "(deixe em branco para manter)"}</Label>
              <Input
                id="usuario-senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                required={!editId}
                // Mesmo mínimo do sql/manutencao/REDEFINIR_SENHA.sql. Campo
                // vazio na edição não é conferido (mantém a senha atual).
                minLength={4}
                autoComplete="new-password"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-depto">Departamento</Label>
              <Input
                id="usuario-depto"
                value={form.departamento}
                onChange={(e) => setForm({ ...form, departamento: e.target.value })}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-perfil">Perfil de Acesso</Label>
              <select
                id="usuario-perfil"
                className={`${SELETOR} w-full disabled:bg-slate-100 disabled:text-slate-500`}
                value={form.perfil}
                disabled={perfilTravado}
                onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}
              >
                <option value="SOLICITANTE">Solicitante</option>
                <option value="ALMOXARIFADO">Almoxarifado</option>
              </select>
              {perfilTravado && (
                <p className="text-xs text-slate-500">
                  {editandoASiMesmo
                    ? "Você não pode mudar o seu próprio perfil."
                    : "É o único Almoxarifado ativo: o perfil não pode mudar."}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={salvando}
              className="w-full h-11 bg-teal-600 hover:bg-teal-700 font-bold mt-2"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!userToDelete} onOpenChange={(val) => !val && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600">Tem certeza que deseja excluir o usuário <strong>{userToDelete?.nome}</strong>?</p>
            <p className="text-red-500 text-sm mt-2">Esta ação não pode ser desfeita. As requisições desta pessoa continuam existindo, mas sem o nome dela. Desativar costuma ser melhor que excluir.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setUserToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border-slate-200 overflow-hidden shadow-xl shadow-slate-200/60 p-0">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Departamento</TableHead>
                <TableHead className="hidden sm:table-cell">Perfil</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-700">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : usuariosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-slate-500 font-medium">
                    Nenhum usuário encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                usuariosFiltrados.map((u) => {
                  const bloqueio = motivoDeBloqueio(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-slate-800 whitespace-normal [overflow-wrap:anywhere]!">
                        {u.nome}
                        {ehEuMesmo(u) && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                            você
                          </span>
                        )}
                        {/* No celular setor e perfil vêm embaixo do nome: como
                            colunas, empurravam a tabela para o lado e o botão
                            de excluir saía da tela. */}
                        <div className="sm:hidden text-xs font-normal text-slate-500 mt-0.5">
                          {u.departamento} · {u.perfil === "ALMOXARIFADO" ? "Almoxarifado" : "Solicitante"}
                          {!u.ativo && <span className="text-red-600 font-semibold"> · Inativo</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600 hidden sm:table-cell whitespace-normal [overflow-wrap:anywhere]!">
                        {u.departamento}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-medium">
                          {u.perfil}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.ativo ? (
                          <span className="flex items-center text-emerald-600 font-medium text-sm">
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Ativo
                          </span>
                        ) : (
                          <span className="flex items-center text-red-600 font-medium text-sm">
                            <XCircle className="w-4 h-4 mr-1" />
                            Inativo
                          </span>
                        )}
                      </TableCell>
                      {/* Mesmo ajuste da tela de Itens: ícone no celular, texto
                          quando há largura, para os três caberem numa linha. */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpen(u)}
                            className="text-slate-700 h-9 w-9 shrink-0"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => toggleAtivo(u)}
                            disabled={u.ativo && !!bloqueio}
                            title={u.ativo && bloqueio ? bloqueio : u.ativo ? "Desativar" : "Ativar"}
                            className={`${u.ativo ? "text-slate-700" : "text-emerald-600"} h-9 w-9 sm:w-auto sm:px-3 p-0 sm:p-2 shrink-0 text-sm`}
                          >
                            <span className="hidden sm:inline">{u.ativo ? "Desativar" : "Ativar"}</span>
                            {u.ativo
                              ? <XCircle className="h-4 w-4 sm:hidden" />
                              : <CheckCircle2 className="h-4 w-4 sm:hidden" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setUserToDelete(u)}
                            disabled={!!bloqueio}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 h-9 w-9 shrink-0"
                            title={bloqueio || "Excluir"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
