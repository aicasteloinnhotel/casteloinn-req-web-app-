import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, hasSupabaseKeys } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { Usuario } from '@/types';

interface AuthContextType {
  user: Usuario | null;
  loading: boolean;
  signIn: (nome: string, senha_plana: string, remember?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

/**
 * Uma conferência de sessão por carregamento do app. Fica fora do componente
 * de propósito: em desenvolvimento o StrictMode monta o provider duas vezes, e
 * sem isto o aviso aparecia duplicado na tela.
 */
let sessaoJaConferida = false;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<Usuario | null>(() => {
    const stored = localStorage.getItem('hotel_user') || sessionStorage.getItem('hotel_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u && u.perfil) {
          u.perfil = u.perfil.toUpperCase();
        }
        return u;
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  const signIn = async (nome: string, senha_plana: string, remember: boolean = false) => {
    if (!hasSupabaseKeys) {
      throw new Error('As variáveis de ambiente do Supabase não estão configuradas.');
    }

    try {
      // A conferência da senha acontece dentro do banco (função login_usuario).
      // Antes o app baixava a linha inteira do usuário — inclusive a senha em
      // texto puro — e comparava aqui no navegador; qualquer pessoa com a chave
      // anon, que fica visível no JavaScript, conseguia ler todas as senhas.
      const { data, error } = await supabase.rpc('login_usuario', {
        p_nome: nome,
        p_senha: senha_plana,
      });

      if (error) {
        // A função devolve mensagens já prontas para o usuário final
        // ("Usuário ou senha inválidos.", "Acesso bloqueado: usuário inativo.").
        throw new Error(error.message || 'Não foi possível entrar. Tente novamente.');
      }

      if (!data) {
        throw new Error('Usuário ou senha inválidos.');
      }

      const sbUser = data as {
        id: string;
        nome: string;
        departamento: string | null;
        perfil: string | null;
        ativo: boolean;
        created_at: string;
      };

      const loggedUser: Usuario = {
          id: sbUser.id,
          nome: sbUser.nome,
          departamento: sbUser.departamento || "Geral",
          perfil: (sbUser.perfil || '').toUpperCase() as Usuario['perfil'],
          ativo: sbUser.ativo,
          created_at: sbUser.created_at
      };

      if (remember) {
        localStorage.setItem('hotel_user', JSON.stringify(loggedUser));
        sessionStorage.removeItem('hotel_user');
      } else {
        sessionStorage.setItem('hotel_user', JSON.stringify(loggedUser));
        localStorage.removeItem('hotel_user');
      }

      setUser(loggedUser);
    } catch (err: any) {
      throw err;
    }
  };

  const signOut = async () => {
    localStorage.removeItem('hotel_user');
    sessionStorage.removeItem('hotel_user');
    setUser(null);
  };

  /**
   * Confere, na abertura do app, se o usuário guardado no aparelho ainda existe
   * e continua ativo.
   *
   * Sem isto, um celular que ficou logado com um usuário depois apagado ou
   * desativado continuava navegando normalmente e só quebrava lá na frente, com
   * um erro cru de chave estrangeira no meio da entrega. Agora cai no login com
   * o motivo escrito.
   *
   * Falha de rede NÃO desloga ninguém: só a resposta do banco dizendo que o
   * usuário sumiu ou foi desativado.
   */
  useEffect(() => {
    if (!hasSupabaseKeys || sessaoJaConferida) return;
    const guardado = user;
    if (!guardado?.id) return;
    sessaoJaConferida = true;

    (async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, departamento, perfil, ativo, created_at')
        .eq('id', guardado.id)
        .maybeSingle();

      // Falha de rede não desloga ninguém: só a resposta do banco.
      if (error) {
        sessaoJaConferida = false; // tenta de novo na próxima abertura
        return;
      }

      if (!data) {
        await signOut();
        toast.error('Seu usuário não existe mais no sistema. Fale com o almoxarifado.');
        return;
      }

      if (!data.ativo) {
        await signOut();
        toast.error('Seu acesso foi desativado. Fale com o almoxarifado.');
        return;
      }

      // Nome, setor ou perfil podem ter mudado no cadastro desde o último login.
      const atualizado: Usuario = {
        id: data.id,
        nome: data.nome,
        departamento: data.departamento || 'Geral',
        perfil: (data.perfil || '').toUpperCase() as Usuario['perfil'],
        ativo: data.ativo,
        created_at: data.created_at,
      };

      if (JSON.stringify(atualizado) !== JSON.stringify(guardado)) {
        setUser(atualizado);
        const onde = localStorage.getItem('hotel_user') ? localStorage : sessionStorage;
        onde.setItem('hotel_user', JSON.stringify(atualizado));
      }
    })();
    // Só na abertura do app: uma checagem por sessão basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
