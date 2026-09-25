import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import { Toaster } from "@/components/ui/sonner";
import { audioService } from './lib/audio';
import RequireAlmoxarifado from './components/RequireAlmoxarifado';

// Telas do fluxo do solicitante: carregam junto com o app.
import Dashboard from './pages/Dashboard';
import NovaRequisicao from './pages/requisicoes/NovaRequisicao';
import ListaRequisicoes from './pages/requisicoes/ListaRequisicoes';
import DetalheRequisicao from './pages/requisicoes/DetalheRequisicao';

// Telas só do almoxarifado: carregam sob demanda. Sem isto, uma camareira
// baixava no celular a biblioteca de gráficos, a de PDF e a de planilhas
// para abrir uma tela que ela nunca vai usar.
const Separacao = lazy(() => import('./pages/requisicoes/Separacao'));
const ListaReposicao = lazy(() => import('./pages/requisicoes/ListaReposicao'));
const Usuarios = lazy(() => import('./pages/admin/Usuarios'));
const Itens = lazy(() => import('./pages/admin/Itens'));
const AjudaSobre = lazy(() => import('./pages/AjudaSobre'));

const CarregandoTela = () => (
  <div className="flex items-center justify-center py-20 text-slate-600 font-medium">
    Carregando...
  </div>
);

export default function App() {
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Initialize audio on first click anywhere
      audioService.init();

      const target = e.target as HTMLElement;
      const isClickable = target.closest('button') || target.closest('a') || target.closest('[role="button"]');
      
      if (isClickable) {
        audioService.playClick();
      }
    };

    window.addEventListener('click', handleGlobalClick, true); // Use capture to get it early
    
    return () => {
      window.removeEventListener('click', handleGlobalClick, true);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            
            {/* Requisições */}
            <Route path="/requisicoes" element={<ListaRequisicoes />} />
            <Route path="/requisicoes/nova" element={<NovaRequisicao />} />
            <Route path="/requisicoes/:id/editar" element={<NovaRequisicao />} />
            <Route path="/requisicoes/:id" element={<DetalheRequisicao />} />
            <Route path="/ajuda" element={<Suspense fallback={<CarregandoTela />}><AjudaSobre /></Suspense>} />

            {/* Restrito ao Almoxarifado: separação, compras e cadastros */}
            <Route element={<RequireAlmoxarifado />}>
              <Route path="/requisicoes/:id/separacao" element={<Suspense fallback={<CarregandoTela />}><Separacao /></Suspense>} />
              <Route path="/reposicao" element={<Suspense fallback={<CarregandoTela />}><ListaReposicao /></Suspense>} />
              <Route path="/admin/usuarios" element={<Suspense fallback={<CarregandoTela />}><Usuarios /></Suspense>} />
              <Route path="/admin/itens" element={<Suspense fallback={<CarregandoTela />}><Itens /></Suspense>} />
            </Route>
          </Route>

          {/* Endereço inexistente (link velho, erro de digitação) caía numa
              tela totalmente em branco. Agora volta para o início. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
