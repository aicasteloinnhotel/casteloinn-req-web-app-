import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { APP } from "@/lib/sobre";
import { versoesPara } from "@/lib/novidades";
import { toast } from "@/lib/toast";

const CHAVE = "novidades_vistas_ate";

/**
 * Uma vez por aparelho, na primeira abertura depois de uma atualização:
 * "Novidades da versão X" com o resumo e o botão "Ver", que leva ao "O que
 * mudou" em Ajuda e Sobre. Se a versão não trouxe nada para o perfil de quem
 * está logado (só coisas do almoxarifado, para um solicitante), não avisa.
 */
export function AvisoDeNovidades() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let vista: string | null = null;
    try {
      vista = localStorage.getItem(CHAVE);
    } catch {
      return; // sem armazenamento (aba anônima bloqueada): não insiste
    }
    if (vista === APP.versao) return;

    const marcarVista = () => {
      try {
        localStorage.setItem(CHAVE, APP.versao);
      } catch {
        /* sem armazenamento: só não lembra */
      }
    };

    const desta = versoesPara(user.perfil === "ALMOXARIFADO").find((v) => v.versao === APP.versao);
    if (!desta) {
      marcarVista();
      return;
    }

    // Um instante depois de abrir, para não brigar com os avisos da tela.
    const t = setTimeout(() => {
      toast(`Novidades da versão ${APP.versao}`, {
        id: "novidades",
        description: desta.titulo,
        duration: 12000,
        action: {
          label: "Ver",
          onClick: () => navigate("/ajuda?aba=sobre#novidades"),
        },
      });
      marcarVista();
    }, 1500);
    return () => clearTimeout(t);
  }, [user?.id, user?.perfil, navigate]);

  return null;
}
