import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import '@fontsource-variable/inter';
import './index.css';
import { iniciarCapturaDeInstalacao } from './lib/instalacao';
import { ErroInesperado } from './components/ErroInesperado';
import { vigiarNovaVersao } from './lib/atualizacao';
import { toast } from './lib/toast';

// Antes de qualquer tela: o convite de instalação do navegador costuma chegar
// logo no carregamento, ainda no login, e se perdia.
iniciarCapturaDeInstalacao();

// Cada publicação no Netlify troca o nome dos arquivos das telas. Quem estava
// com o app aberto desde antes, ao abrir uma tela pela primeira vez, pede um
// arquivo que não existe mais — e a tela ficava em branco. Recarrega uma vez,
// já na versão nova. O intervalo mínimo evita recarregar em círculo.
window.addEventListener('vite:preloadError', (evento) => {
  try {
    const ultima = Number(sessionStorage.getItem('recarga_por_versao_nova') || 0);
    if (Date.now() - ultima < 10_000) return; // deixa o erro seguir para a tela de erro
    sessionStorage.setItem('recarga_por_versao_nova', String(Date.now()));
  } catch {
    // sem sessionStorage: recarrega mesmo assim
  }
  evento.preventDefault();
  window.location.reload();
});

// Versão nova publicada enquanto o app estava aberto: avisa e atualiza num
// toque, sem reinstalar. Não recarrega sozinho para não interromper ninguém
// no meio de uma separação ou de um pedido.
vigiarNovaVersao(() => {
  toast.info('Saiu uma versão nova do app.', {
    duration: Infinity,
    action: { label: 'Atualizar', onClick: () => window.location.reload() },
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroInesperado>
      <App />
    </ErroInesperado>
  </StrictMode>,
);
