// Service worker do app.
//
// Faz só duas coisas, de propósito:
//  1. Existir, que é o que permite instalar o app na tela inicial.
//  2. Mostrar uma página "sem conexão" legível quando o app é aberto sem
//     internet, em vez da tela de erro do navegador.
//
// Antes ele interceptava TODAS as requisições — inclusive as do Supabase — e,
// quando a rede falhava, respondia um "503 Offline" falso. O app via um erro
// de servidor que nunca aconteceu. Agora as chamadas à API passam direto.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const PAGINA_SEM_CONEXAO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f766e">
<title>Sem conexão</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;padding:24px;box-sizing:border-box}
  .caixa{max-width:360px;background:#fff;border-radius:16px;padding:28px 24px;text-align:center;
         box-shadow:0 10px 30px rgba(15,23,42,.08)}
  h1{font-size:20px;margin:0 0 8px;color:#134e4a}
  p{font-size:15px;line-height:1.5;margin:0 0 20px;color:#334155}
  button{height:48px;width:100%;border:0;border-radius:12px;background:#0d9488;color:#fff;
         font-size:16px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
  <div class="caixa">
    <h1>Sem conexão com a internet</h1>
    <p>O sistema de requisições precisa de internet para funcionar. Confira o Wi-Fi ou os dados móveis e tente de novo.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só a abertura de páginas do próprio app. Todo o resto (Supabase,
  // imagens, scripts) segue direto para a rede, sem passar por aqui.
  if (req.mode !== 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(PAGINA_SEM_CONEXAO, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    ),
  );
});

// Tocar no aviso traz o app para a frente em vez de abrir outra aba.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      for (const aba of abas) {
        if ('focus' in aba) return aba.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
