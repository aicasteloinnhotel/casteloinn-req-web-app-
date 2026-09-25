export type SoundType = 'start' | 'check' | 'finish' | 'cancel' | 'notification';

/**
 * Um único AudioContext para todo o app.
 *
 * Antes cada bipe criava (e fechava) um AudioContext novo. Os navegadores
 * limitam o número de contextos por aba (~6 no Chrome), então bipar rápido
 * item a item na separação acabava travando o som — justamente onde o
 * conferente depende do retorno sonoro.
 */
let sharedCtx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  // No celular o contexto suspende quando a tela apaga; retomar é barato.
  if (sharedCtx.state === 'suspended') sharedCtx.resume();
  return sharedCtx;
};

export const playSound = (type: SoundType) => {
  try {
    const ctx = getCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Libera o nó ao terminar para não acumular ganhos ligados ao destino.
    osc.onended = () => {
      try { gainNode.disconnect(); } catch { /* já desconectado */ }
    };

    const now = ctx.currentTime;

    if (type === 'check') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.1, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } 
    else if (type === 'start') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.2);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    else if (type === 'finish') {
      osc.type = 'sine';
      
      // Chime chord
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      osc2.connect(gainNode);
      osc3.connect(gainNode);

      osc.frequency.setValueAtTime(523.25, now); // C5
      osc2.frequency.setValueAtTime(659.25, now); // E5
      osc3.frequency.setValueAtTime(783.99, now); // G5
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now); osc2.start(now); osc3.start(now);
      osc.stop(now + 0.6); osc2.stop(now + 0.6); osc3.stop(now + 0.6);
    }
    else if (type === 'cancel') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    else if (type === 'notification') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1108.73, now + 0.15); // C#6
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.1, now + 0.05);
      gainNode.gain.setValueAtTime(0, now + 0.1);
      gainNode.gain.linearRampToValueAtTime(0.1, now + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.4);
    }

    // Os osciladores se desconectam sozinhos ao parar; o contexto é reutilizado.
  } catch (e) {
    console.error('Audio playback failed', e);
  }
};
