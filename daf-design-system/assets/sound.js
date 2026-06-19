/* ===========================================================================
   Lumio · Sound — a tiny Web Audio cue engine.
   Plays short, playful, PROCEDURAL sound effects (no asset files needed) tied to
   named events. Gated by the "Ovoz effektlari" setting (localStorage) so the
   Settings toggle controls it globally. Framework-agnostic; load with a plain
   <script src="…/sound.js"> and call LumioSound.play('correct').

   API
     LumioSound.play(name)        play a named cue (no-op if disabled)
     LumioSound.enabled()         -> boolean (reads the setting, default ON)
     LumioSound.setEnabled(bool)  persist on/off (wire to the Settings switch)
     LumioSound.cues              array of available cue names
     LumioSound.unlock()          resume the AudioContext (call on first tap)
   =========================================================================== */
(function (global) {
  var KEY = 'lumio.sound.enabled';
  var ctx = null;

  function enabled() { var v = localStorage.getItem(KEY); return v === null ? true : v === '1'; }
  function setEnabled(on) { localStorage.setItem(KEY, on ? '1' : '0'); }

  function audio() {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function unlock() { audio(); }

  // One enveloped oscillator note. opt: {freq, type, t (start offset s), dur, vol, slideTo, attack}
  function note(o) {
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + (o.t || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + (o.dur || 0.12));
    var peak = o.vol == null ? 0.18 : o.vol;
    var atk = o.attack == null ? 0.006 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.12));
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + (o.dur || 0.12) + 0.02);
  }
  // Short filtered-noise burst for woosh/thud. opt: {t, dur, vol, cutoff, type}
  function noise(o) {
    var c = audio(); if (!c) return;
    var t0 = c.currentTime + (o.t || 0), dur = o.dur || 0.18;
    var buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.value = o.cutoff || 900;
    var g = c.createGain(); g.gain.setValueAtTime(o.vol == null ? 0.12 : o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  // Note frequencies
  var N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568.0, A4: 440, E4: 329.63, G4: 392 };

  // ---- The cue palette ----
  var cues = {
    tap:    function () { note({ freq: 200, type: 'sine', dur: 0.05, vol: 0.10 }); },
    select: function () { note({ freq: 420, slideTo: 620, type: 'triangle', dur: 0.08, vol: 0.12 }); },
    toggle: function () { note({ freq: 520, slideTo: 700, type: 'square', dur: 0.06, vol: 0.07 }); },
    correct:function () { note({ freq: N.E5, type: 'triangle', dur: 0.1, vol: 0.16 }); note({ t: 0.08, freq: N.G5, type: 'triangle', dur: 0.12, vol: 0.16 }); note({ t: 0.16, freq: N.C6, type: 'triangle', dur: 0.18, vol: 0.16 }); },
    wrong:  function () { note({ freq: 220, slideTo: 120, type: 'sawtooth', dur: 0.22, vol: 0.12 }); },
    coin:   function () { note({ freq: N.B5, type: 'square', dur: 0.05, vol: 0.09 }); note({ t: 0.06, freq: N.E6, type: 'square', dur: 0.1, vol: 0.09 }); },
    xp:     function () { note({ freq: N.G5, slideTo: N.C6, type: 'sine', dur: 0.18, vol: 0.12 }); },
    streak: function () { [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) { note({ t: i * 0.05, freq: f, type: 'triangle', dur: 0.1, vol: 0.13 }); }); },
    levelup:function () { [N.C5, N.E5, N.G5, N.C6, N.E6].forEach(function (f, i) { note({ t: i * 0.07, freq: f, type: 'triangle', dur: 0.2, vol: 0.16 }); }); },
    win:    function () { [N.G5, N.C6, N.E6, N.G6].forEach(function (f, i) { note({ t: i * 0.08, freq: f, type: 'square', dur: 0.22, vol: 0.14 }); }); },
    notify: function () { note({ freq: N.A5, type: 'sine', dur: 0.1, vol: 0.12 }); note({ t: 0.12, freq: N.E5, type: 'sine', dur: 0.14, vol: 0.12 }); },
    message:function () { note({ freq: N.E5, slideTo: N.A5, type: 'sine', dur: 0.1, vol: 0.10 }); },
    sheet:  function () { noise({ dur: 0.18, vol: 0.06, cutoff: 1400 }); },
    locked: function () { note({ freq: 140, type: 'sine', dur: 0.12, vol: 0.12 }); },
  };

  function play(name) {
    if (!enabled()) return;
    var c = cues[name]; if (c) try { c(); } catch (e) {}
  }

  global.LumioSound = { play: play, enabled: enabled, setEnabled: setEnabled, unlock: unlock, cues: Object.keys(cues) };
})(window);
