export const audioService = {
  audioCtx: null as AudioContext | null,
  
  init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  },

  playTone(frequency: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    if (!this.audioCtx) this.init();
    if (!this.audioCtx) return;

    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    oscillator.start();
    oscillator.stop(this.audioCtx.currentTime + duration);
  },

  playClick() {
    this.playTone(600, 'sine', 0.05, 0.05);
  },

  playSuccess() {
    if (!this.audioCtx) this.init();
    if (!this.audioCtx) return;
    
    // Play a nice two-tone chime
    this.playTone(523.25, 'sine', 0.2, 0.1); // C5
    setTimeout(() => {
      this.playTone(659.25, 'sine', 0.4, 0.1); // E5
    }, 100);
  },

  playError() {
    if (!this.audioCtx) this.init();
    if (!this.audioCtx) return;

    this.playTone(300, 'sawtooth', 0.2, 0.1);
    setTimeout(() => {
      this.playTone(250, 'sawtooth', 0.4, 0.1);
    }, 150);
  },

  playNewRequisitionAlert() {
    if (!this.audioCtx) this.init();
    if (!this.audioCtx) return;

    // A bell sound that loops for 5 seconds
    let count = 0;
    const maxBeeps = 5; // 1 beep per second for 5 seconds
    
    const playBell = () => {
      // Bell synthesis
      const t = this.audioCtx!.currentTime;
      const osc1 = this.audioCtx!.createOscillator();
      const osc2 = this.audioCtx!.createOscillator();
      const gain = this.audioCtx!.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, t); // A5
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, t); // A6
      
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioCtx!.destination);
      
      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.8);
      osc2.stop(t + 0.8);

      count++;
      if (count < maxBeeps) {
        setTimeout(playBell, 1000);
      }
    };
    
    playBell();
  }
};
