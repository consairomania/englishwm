// Pattern de note: [frecventa_hz, durata_nota_s, offset_start_s]
type NotePattern = [number, number, number];

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

export function playWrongSound() {
  try {
    const ctx = getCtx();
    // Buzzer descendent: două note joase cu waveform dur
    const notes: NotePattern[] = [
      [380, 0.14, 0.00],
      [260, 0.22, 0.14],
    ];
    ctx.resume().then(() => {
      notes.forEach(([freq, dur, offset]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
        gain.gain.setValueAtTime(0.18, t + dur - 0.04);
        gain.gain.linearRampToValueAtTime(0, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    });
  } catch {
    // Audio blocat de browser — se ignoră silențios
  }
}

export function playSuccessSound(_amount?: number) {
  try {
    const ctx = getCtx();

    const patterns: NotePattern[] = [
      [392, 0.12, 0.00],   // G4 — bum
      [523, 0.12, 0.12],   // C5 — bum
      [659, 0.12, 0.24],   // E5 — bum
      [784, 0.50, 0.36],   // G5 — BUUUM (ținut)
    ];

    ctx.resume().then(() => {
      patterns.forEach(([freq, dur, offset]) => {
        const osc    = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain   = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 1800;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.01);  // atac rapid
        gain.gain.setValueAtTime(0.22, t + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0, t + dur);       // release

        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    });
  } catch {
    // Audio blocat de browser — se ignoră silențios
  }
}
