import React, { useState, useRef, useEffect } from "react";
import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { useInstallApp } from "@/hooks/useInstallApp";
import { useAvisosEmTempoReal } from "@/hooks/useAvisosEmTempoReal";
import { AtivarAvisos } from "@/components/AtivarAvisos";
import { FaixaPausa } from "@/components/PausaInventario";
import { BotaoInstalar, ConviteInstalacao } from "@/components/ConviteInstalacao";
import { Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  LogOut,
  PackageSearch,
  PlusCircle,
  Users,
  Package,
  Menu,
  Hotel,
  FileText,
  UserCircle,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { isInstallable, promptInstall, conviteVisivel } = useInstallApp();
  const location = useLocation();
  const navigate = useNavigate();

  // Faixas do topo: uma por vez, e nunca na separação — lá a tela tem altura
  // calculada e uma faixa a mais empurraria o botão de finalizar para baixo.
  const telaDeTrabalho = location.pathname.endsWith("/separacao");
  const faixaDoTopo = telaDeTrabalho
    ? null
    : (
      <>
        {/* A pausa para inventário vem antes de tudo: muda o que a pessoa pode fazer. */}
        <FaixaPausa />
        {conviteVisivel ? <ConviteInstalacao className="mb-4" /> : <AtivarAvisos />}
      </>
    );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Start collapsed by default for better space
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsCollapsed(false);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsCollapsed(true);
    }, 2000);
  };

  const handleMenuClick = () => {
    // Optionally close menu instantly or let mouseLeave handle it
    // For now we don't force it closed instantly on desktop since the mouse is still over it,
    // but if it's on mobile it closes.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsCollapsed(true);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Alarme de requisição nova (almoxarifado) e de separação iniciada
  // (solicitante), valendo em qualquer tela enquanto a pessoa estiver logada.
  useAvisosEmTempoReal(user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAlmoxarifado = user.perfil === "ALMOXARIFADO";
  const isSolicitante = user.perfil === "SOLICITANTE";

  // Este menu lateral só é renderizado para o almoxarifado — o solicitante tem
  // um cabeçalho próprio, mais simples, logo abaixo.
  const menuItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Requisições", href: "/requisicoes", icon: FileText },
    ...(isAlmoxarifado
      ? [
          { name: "Nova Requisição", href: "/requisicoes/nova", icon: PlusCircle },
          { name: "Lista de Reposição", href: "/reposicao", icon: ClipboardList },
          { name: "Controle de Itens", href: "/admin/itens", icon: Package },
          { name: "Usuários", href: "/admin/usuarios", icon: Users },
        ]
      : []),
    { name: "Ajuda e Sobre", href: "/ajuda", icon: HelpCircle },
  ];

  // Caminho de menu que corresponde à tela atual: o mais longo que casar.
  const hrefAtivo = [...menuItems]
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length)
    .find(
      (h) =>
        location.pathname === h ||
        (h !== "/" && location.pathname.startsWith(h + "/")),
    );

  const renderUserProfile = (collapsed: boolean) => (
    <div className="border-t border-teal-800 bg-teal-900 p-3 flex flex-col justify-center shrink-0">
      <div className={cn("flex w-full", collapsed ? "flex-col items-center gap-3" : "items-center justify-between")}>
         <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3 overflow-hidden")}>
           <div className="w-10 h-10 rounded-full bg-teal-800 flex items-center justify-center text-white font-bold text-lg border border-teal-600 flex-shrink-0 shadow-sm">
             {user?.nome?.charAt(0) || 'U'}
           </div>
           {!collapsed && (
             <div className="flex flex-col overflow-hidden min-w-0">
               <span className="text-sm font-bold text-white truncate">{user?.nome}</span>
               <span className="text-[10px] uppercase font-bold tracking-wider text-teal-300 truncate">{user?.departamento}</span>
             </div>
           )}
         </div>
         <Button variant="ghost" size="icon" onClick={signOut} className={cn("text-teal-400 hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0", collapsed && "mt-1")} title="Sair do sistema">
           <LogOut className="h-5 w-5" />
         </Button>
      </div>
    </div>
  );

  if (isSolicitante) {
    return (
      <div className="flex min-h-screen flex-col w-full bg-slate-50 dark:bg-teal-950">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-teal-900 px-4 sm:px-6 shadow-lg shadow-slate-200/50 print:hidden">
          <div className="flex items-center gap-2">
            <img src="/icon-192x192.png" alt="Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLElement).style.setProperty('display', 'block'); }} />
            <Hotel className="h-6 w-6 text-white hidden" />
            <span className="text-xl font-bold tracking-tight text-white">
              Castelo Inn
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BotaoInstalar />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="w-10 h-10 rounded-full bg-teal-800 hover:bg-teal-700 text-white shadow-md border-2 border-teal-600/50 hover:border-teal-500 transition-all focus-visible:ring-0 p-0"
                  />
                }
              >
                <span className="font-bold text-lg">{user?.nome?.charAt(0) || 'U'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 p-2 shadow-2xl rounded-2xl border border-slate-100">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="p-4 mb-2 flex flex-col items-center justify-center text-center bg-slate-50 rounded-xl border border-slate-100">
                     <div className="w-16 h-16 rounded-full bg-teal-800 flex items-center justify-center text-white font-bold text-2xl border-4 border-white shadow-sm mb-3">
                       {user?.nome?.charAt(0) || 'U'}
                     </div>
                     <p className="text-base font-bold text-slate-900 mb-1">
                       {user?.nome}
                     </p>
                     <div className="flex flex-col items-center gap-1">
                       <span className="text-xs text-slate-700 font-medium">
                         {user?.departamento}
                       </span>
                     </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => navigate("/ajuda")}
                  className="text-slate-700 cursor-pointer p-3 rounded-xl flex items-center justify-center gap-2"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span className="font-bold">Ajuda e Sobre</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-red-600 cursor-pointer focus:bg-red-50 focus:text-red-700 p-3 rounded-xl mt-1 flex items-center justify-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-bold">Sair do sistema</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 w-full max-w-4xl mx-auto pb-24 md:pb-6">
          {faixaDoTopo}
          <Outlet />
        </main>
      </div>
    );
  }

  const RenderNav = ({ onClick, collapsed = false }: { onClick?: () => void, collapsed?: boolean }) => (
    <nav className="space-y-1">
      {menuItems.map((item) => {
        const Icon = item.icon;
        // Marca só o item mais específico. Com a regra antiga, "Requisições" e
        // "Nova Requisição" acendiam juntas, porque /requisicoes/nova começa
        // com /requisicoes.
        const isActive = item.href === hrefAtivo;
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onClick}
            title={collapsed ? item.name : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-teal-700 text-white shadow-md"
                : "text-slate-300 hover:bg-teal-800 hover:text-white",
              collapsed ? "justify-center" : ""
            )}
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </Link>
        );
      })}
      {isInstallable && (
        <button onClick={() => { promptInstall(); onClick?.(); }}
          title={collapsed ? "Instalar App" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 mt-4 bg-teal-600 text-white shadow-md hover:bg-teal-500",
            collapsed ? "justify-center" : ""
          )}
        >
          <Download className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Instalar App</span>}
        </button>
      )}
    </nav>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-teal-950 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside 
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative hidden flex-col border-r bg-white dark:bg-slate-900 lg:flex inset-y-0 z-20 print:hidden transition-all duration-300",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        <div className={cn(
          "flex h-16 items-center border-b border-teal-800 bg-teal-900 text-white transition-all",
          isCollapsed ? "justify-center px-0" : "px-6"
        )}>
          <img src="/icon-192x192.png" alt="Logo" className={cn("flex-shrink-0 object-contain", isCollapsed ? "h-8 w-8" : "h-10 w-10")} onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLElement).style.setProperty('display', 'block'); }} />
          <Hotel className="h-6 w-6 flex-shrink-0 hidden" />
          {!isCollapsed && <span className="text-lg font-bold ml-2 truncate">Castelo Inn</span>}
        </div>
        
        <div className="flex flex-1 flex-col py-6 px-3 gap-4 overflow-y-auto overflow-x-hidden bg-teal-900 text-white">
          <RenderNav onClick={handleMenuClick} collapsed={isCollapsed} />
        </div>
        {renderUserProfile(isCollapsed)}
      </aside>
      
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-teal-900 px-4 lg:hidden print:hidden flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-teal-600"
                  />
                }
              >
                <Menu className="h-6 w-6" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col bg-teal-900 border-teal-800">
                <div className="flex h-16 items-center border-b border-teal-800 px-6 bg-teal-900 text-white">
                  <img src="/icon-192x192.png" alt="Logo" className="h-8 w-8 flex-shrink-0 mr-2 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLElement).style.setProperty('display', 'block'); }} />
                  <Hotel className="h-6 w-6 mr-2 hidden" />
                  <span className="text-lg font-bold">Castelo Inn</span>
                </div>
                <div className="flex-1 py-6 px-4 overflow-y-auto bg-teal-900 text-white">
                  <RenderNav onClick={() => setMobileMenuOpen(false)} />
                </div>
                {renderUserProfile(false)}
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2 font-bold text-white text-lg">
              <img src="/icon-192x192.png" alt="Logo" className="h-8 w-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              Castelo Inn
            </div>
          </div>
          <BotaoInstalar />
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          {faixaDoTopo}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
