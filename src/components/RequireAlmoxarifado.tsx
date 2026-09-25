import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Barreira de perfil para as rotas do almoxarifado.
 *
 * O menu já escondia esses links para o SOLICITANTE, mas esconder não é
 * proteger: digitando /admin/usuarios na barra de endereço qualquer usuário
 * logado entrava na tela de cadastro. Aqui a rota em si passa a exigir o perfil.
 *
 * Observação: isto é controle de navegação no cliente. A proteção real dos
 * dados depende das permissões e policies no Supabase (veja BANCO_DEFINITIVO.sql).
 */
export default function RequireAlmoxarifado() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.perfil !== "ALMOXARIFADO") return <Navigate to="/" replace />;

  return <Outlet />;
}
