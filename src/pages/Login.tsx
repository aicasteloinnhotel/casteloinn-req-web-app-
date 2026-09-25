import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Hotel, MessageCircle } from 'lucide-react';
import { SUPORTE, linkWhatsApp } from '@/lib/sobre';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/lib/toast';
import { ConviteInstalacao } from '@/components/ConviteInstalacao';

export default function Login() {
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(nome, password, remember);
      toast.success('Login realizado com sucesso!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao realizar login. Verifique as credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-4 dark:bg-teal-950">
      {/* É aqui que quem nunca usou o app chega: o convite de instalação
          aparece antes mesmo do login. */}
      <ConviteInstalacao className="w-full max-w-md" />
      <Card className="w-full max-w-md shadow-2xl border-none">
        <CardHeader className="space-y-4 pb-8 text-center bg-teal-900 rounded-t-xl text-white">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white mt-2 p-2 shadow-md">
            {/* Versão de 25 KB do logo. O /logo.png original tem 1 MB e era
                baixado no celular só para ser exibido com 64px. */}
            <img src="/icon-192x192.png" alt="Logo" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && (e.currentTarget.nextElementSibling as HTMLElement).style.setProperty('display', 'block'); }} />
            <Hotel className="h-10 w-10 text-teal-900 hidden" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Castelo Inn Hotel</CardTitle>
            <CardDescription className="text-teal-100 mt-1">
              Sistema de Requisições de Almoxarifado
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-8 px-6 sm:px-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="nome" className="text-slate-600 font-medium tracking-tight">Nome de Usuário</Label>
              <Input
                id="nome"
                type="text"
                placeholder="Ex: João Silva"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                className="h-12 bg-slate-50 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-600 font-medium tracking-tight">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-slate-50 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
                autoComplete="current-password"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked as boolean)}
                className="data-checked:bg-teal-600 data-checked:border-teal-600 data-checked:text-white" 
              />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-600"
              >
                Manter conectado
              </label>
            </div>
            
            <Button type="submit" className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-md font-medium shadow-lg shadow-slate-200/50 transition-all" disabled={loading}>
              {loading ? 'Entrando...' : 'Acessar Sistema'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center gap-1.5 rounded-b-xl pb-6 text-sm text-slate-700 bg-white">
          <p>Acesso exclusivo para colaboradores.</p>
          {/* Quem esqueceu a senha não entra no app para achar o contato. */}
          <a
            href={linkWhatsApp()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Esqueceu a senha? Fale com o {SUPORTE.setor}
          </a>
        </CardFooter>
      </Card>
    </div>
  );
}
