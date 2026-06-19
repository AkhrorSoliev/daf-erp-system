/* @ds-bundle: {"format":3,"namespace":"LumioDesignSystem_f2f824","components":[{"name":"ChatComposer","sourcePath":"components/chat/ChatComposer.jsx"},{"name":"ConversationRow","sourcePath":"components/chat/ConversationRow.jsx"},{"name":"MessageBubble","sourcePath":"components/chat/MessageBubble.jsx"},{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"NotificationItem","sourcePath":"components/feedback/NotificationItem.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"ProgressRing","sourcePath":"components/feedback/ProgressRing.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"CategoryCard","sourcePath":"components/gamification/CategoryCard.jsx"},{"name":"FeatureCard","sourcePath":"components/gamification/FeatureCard.jsx"},{"name":"FractionChip","sourcePath":"components/gamification/FractionChip.jsx"},{"name":"LeaderboardRow","sourcePath":"components/gamification/LeaderboardRow.jsx"},{"name":"LessonNode","sourcePath":"components/gamification/LessonNode.jsx"},{"name":"ResultStatPill","sourcePath":"components/gamification/ResultStatPill.jsx"},{"name":"StatChip","sourcePath":"components/gamification/StatChip.jsx"},{"name":"AudioPlayer","sourcePath":"components/learning/AudioPlayer.jsx"},{"name":"ExerciseCard","sourcePath":"components/learning/ExerciseCard.jsx"},{"name":"NumberedSteps","sourcePath":"components/learning/NumberedSteps.jsx"},{"name":"ProgressChart","sourcePath":"components/learning/ProgressChart.jsx"},{"name":"VideoLessonCard","sourcePath":"components/learning/VideoLessonCard.jsx"},{"name":"WordCard","sourcePath":"components/learning/WordCard.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"ListRow","sourcePath":"components/navigation/ListRow.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"BottomSheet","sourcePath":"components/overlay/BottomSheet.jsx"},{"name":"SheetAction","sourcePath":"components/overlay/BottomSheet.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"}],"sourceHashes":{"assets/sound.js":"87301738ba57","components/chat/ChatComposer.jsx":"770c29e39d80","components/chat/ConversationRow.jsx":"d18667cbda8a","components/chat/MessageBubble.jsx":"33b2de089858","components/core/Avatar.jsx":"9b203431f335","components/core/Badge.jsx":"fe8a0ec06bc8","components/core/Button.jsx":"3cbdfd3d5daf","components/core/Card.jsx":"3518ac49fddc","components/core/Chip.jsx":"22a3c99f83a6","components/core/IconButton.jsx":"646635a5dc84","components/feedback/NotificationItem.jsx":"1d5805f05342","components/feedback/ProgressBar.jsx":"e0cdc1c50164","components/feedback/ProgressRing.jsx":"2a5c512eb205","components/forms/Input.jsx":"b6dd1cf888c1","components/forms/SegmentedControl.jsx":"0bea6a097ba5","components/forms/Switch.jsx":"8b5e50ec5f71","components/gamification/CategoryCard.jsx":"650218dc6727","components/gamification/FeatureCard.jsx":"f46cdee1848b","components/gamification/FractionChip.jsx":"4170700a1000","components/gamification/LeaderboardRow.jsx":"930e4d8bd510","components/gamification/LessonNode.jsx":"02dc63abdd30","components/gamification/ResultStatPill.jsx":"c8ed70db90b9","components/gamification/StatChip.jsx":"34994b23370c","components/learning/AudioPlayer.jsx":"bacd1e635d11","components/learning/ExerciseCard.jsx":"5df07eeb9bf4","components/learning/NumberedSteps.jsx":"0f4c3c893ac7","components/learning/ProgressChart.jsx":"db3360e22287","components/learning/VideoLessonCard.jsx":"ac4988ebaafa","components/learning/WordCard.jsx":"f412762929b6","components/navigation/BottomNav.jsx":"ee1e2916269d","components/navigation/ListRow.jsx":"6c0da4e69df7","components/navigation/Tabs.jsx":"26ba838043d4","components/overlay/BottomSheet.jsx":"a92a5432ef96","components/overlay/Dialog.jsx":"77dd8b7cdd5e","ui_kits/student-app/kit.jsx":"959126c94b4f","ui_kits/student-app/learning-screens.jsx":"7cc298f6f4bd","ui_kits/student-app/more-screens.jsx":"5a01c1542d96","ui_kits/student-app/screens.jsx":"bd2a74123922"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LumioDesignSystem_f2f824 = window.LumioDesignSystem_f2f824 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// assets/sound.js
try { (() => {
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
  function enabled() {
    var v = localStorage.getItem(KEY);
    return v === null ? true : v === '1';
  }
  function setEnabled(on) {
    localStorage.setItem(KEY, on ? '1' : '0');
  }
  function audio() {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function unlock() {
    audio();
  }

  // One enveloped oscillator note. opt: {freq, type, t (start offset s), dur, vol, slideTo, attack}
  function note(o) {
    var c = audio();
    if (!c) return;
    var t0 = c.currentTime + (o.t || 0);
    var osc = c.createOscillator(),
      g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + (o.dur || 0.12));
    var peak = o.vol == null ? 0.18 : o.vol;
    var atk = o.attack == null ? 0.006 : o.attack;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.12));
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + (o.dur || 0.12) + 0.02);
  }
  // Short filtered-noise burst for woosh/thud. opt: {t, dur, vol, cutoff, type}
  function noise(o) {
    var c = audio();
    if (!c) return;
    var t0 = c.currentTime + (o.t || 0),
      dur = o.dur || 0.18;
    var buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.value = o.cutoff || 900;
    var g = c.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.12 : o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }

  // Note frequencies
  var N = {
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    F5: 698.46,
    G5: 783.99,
    A5: 880.0,
    B5: 987.77,
    C6: 1046.5,
    E6: 1318.5,
    G6: 1568.0,
    A4: 440,
    E4: 329.63,
    G4: 392
  };

  // ---- The cue palette ----
  var cues = {
    tap: function () {
      note({
        freq: 200,
        type: 'sine',
        dur: 0.05,
        vol: 0.10
      });
    },
    select: function () {
      note({
        freq: 420,
        slideTo: 620,
        type: 'triangle',
        dur: 0.08,
        vol: 0.12
      });
    },
    toggle: function () {
      note({
        freq: 520,
        slideTo: 700,
        type: 'square',
        dur: 0.06,
        vol: 0.07
      });
    },
    correct: function () {
      note({
        freq: N.E5,
        type: 'triangle',
        dur: 0.1,
        vol: 0.16
      });
      note({
        t: 0.08,
        freq: N.G5,
        type: 'triangle',
        dur: 0.12,
        vol: 0.16
      });
      note({
        t: 0.16,
        freq: N.C6,
        type: 'triangle',
        dur: 0.18,
        vol: 0.16
      });
    },
    wrong: function () {
      note({
        freq: 220,
        slideTo: 120,
        type: 'sawtooth',
        dur: 0.22,
        vol: 0.12
      });
    },
    coin: function () {
      note({
        freq: N.B5,
        type: 'square',
        dur: 0.05,
        vol: 0.09
      });
      note({
        t: 0.06,
        freq: N.E6,
        type: 'square',
        dur: 0.1,
        vol: 0.09
      });
    },
    xp: function () {
      note({
        freq: N.G5,
        slideTo: N.C6,
        type: 'sine',
        dur: 0.18,
        vol: 0.12
      });
    },
    streak: function () {
      [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) {
        note({
          t: i * 0.05,
          freq: f,
          type: 'triangle',
          dur: 0.1,
          vol: 0.13
        });
      });
    },
    levelup: function () {
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach(function (f, i) {
        note({
          t: i * 0.07,
          freq: f,
          type: 'triangle',
          dur: 0.2,
          vol: 0.16
        });
      });
    },
    win: function () {
      [N.G5, N.C6, N.E6, N.G6].forEach(function (f, i) {
        note({
          t: i * 0.08,
          freq: f,
          type: 'square',
          dur: 0.22,
          vol: 0.14
        });
      });
    },
    notify: function () {
      note({
        freq: N.A5,
        type: 'sine',
        dur: 0.1,
        vol: 0.12
      });
      note({
        t: 0.12,
        freq: N.E5,
        type: 'sine',
        dur: 0.14,
        vol: 0.12
      });
    },
    message: function () {
      note({
        freq: N.E5,
        slideTo: N.A5,
        type: 'sine',
        dur: 0.1,
        vol: 0.10
      });
    },
    sheet: function () {
      noise({
        dur: 0.18,
        vol: 0.06,
        cutoff: 1400
      });
    },
    locked: function () {
      note({
        freq: 140,
        type: 'sine',
        dur: 0.12,
        vol: 0.12
      });
    }
  };
  function play(name) {
    if (!enabled()) return;
    var c = cues[name];
    if (c) try {
      c();
    } catch (e) {}
  }
  global.LumioSound = {
    play: play,
    enabled: enabled,
    setEnabled: setEnabled,
    unlock: unlock,
    cues: Object.keys(cues)
  };
})(window);
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/sound.js", error: String((e && e.message) || e) }); }

// components/chat/ChatComposer.jsx
try { (() => {
const {
  useState
} = React;
/** Chat input bar — rounded field + coral send button. Pins to the bottom of a thread. */
function ChatComposer({
  placeholder = 'Xabar yozing…',
  onSend,
  attach = true,
  style = {}
}) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend && onSend(t);
    setText('');
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10,
      padding: '10px 14px',
      background: 'rgba(255,255,255,.9)',
      backdropFilter: 'var(--blur-glass)',
      WebkitBackdropFilter: 'var(--blur-glass)',
      borderTop: '1px solid var(--line)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 48,
      padding: '0 8px 0 16px',
      background: 'var(--bg-app)',
      borderRadius: 26,
      border: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: text,
    placeholder: placeholder,
    onChange: e => setText(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') send();
    },
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '12px 0',
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15.5,
      color: 'var(--ink-900)',
      minWidth: 0
    }
  }), attach ? /*#__PURE__*/React.createElement("button", {
    "aria-label": "Biriktirish",
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-400)',
      fontSize: 22,
      display: 'inline-flex',
      padding: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-bold ph-paperclip"
  })) : null), /*#__PURE__*/React.createElement("button", {
    "aria-label": "Yuborish",
    onClick: send,
    style: {
      flex: '0 0 auto',
      width: 48,
      height: 48,
      borderRadius: '50%',
      border: 'none',
      background: 'var(--coral-500)',
      color: '#fff',
      fontSize: 22,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 6px 14px rgba(255,107,74,.4)',
      WebkitTapHighlightColor: 'transparent'
    },
    onMouseDown: e => e.currentTarget.style.transform = 'scale(.92)',
    onMouseUp: e => e.currentTarget.style.transform = 'scale(1)',
    onMouseLeave: e => e.currentTarget.style.transform = 'scale(1)'
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-paper-plane-right"
  })));
}
Object.assign(__ds_scope, { ChatComposer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ChatComposer.jsx", error: String((e && e.message) || e) }); }

// components/chat/MessageBubble.jsx
try { (() => {
/**
 * Chat message bubble. `me` = coral, right-aligned; `them` = white, left-aligned.
 * Optional sender name (group chats) and timestamp.
 */
function MessageBubble({
  children,
  side = 'them',
  name,
  time,
  tail = true,
  style = {}
}) {
  const me = side === 'me';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: me ? 'flex-end' : 'flex-start',
      maxWidth: '78%',
      alignSelf: me ? 'flex-end' : 'flex-start',
      ...style
    }
  }, name && !me ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 800,
      fontSize: 12,
      color: 'var(--grape-600)',
      margin: '0 0 3px 14px'
    }
  }, name) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '11px 15px',
      background: me ? 'var(--coral-500)' : '#fff',
      color: me ? '#fff' : 'var(--ink-900)',
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15.5,
      lineHeight: 1.4,
      borderRadius: 20,
      borderBottomRightRadius: me && tail ? 6 : 20,
      borderBottomLeftRadius: !me && tail ? 6 : 20,
      boxShadow: me ? '0 4px 12px rgba(255,107,74,.28)' : 'var(--shadow-sm)',
      border: me ? 'none' : '1px solid var(--line)',
      wordBreak: 'break-word'
    }
  }, children), time ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 700,
      fontSize: 11,
      color: 'var(--ink-400)',
      margin: me ? '4px 6px 0 0' : '4px 0 0 6px'
    }
  }, time) : null);
}
Object.assign(__ds_scope, { MessageBubble });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/MessageBubble.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Avatar — circular user image with initials fallback + optional ring/badge. */
function Avatar({
  src,
  name = '',
  size = 48,
  ring = false,
  ringColor = 'var(--coral-500)',
  badge = null,
  style = {},
  ...rest
}) {
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      flex: '0 0 auto',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: src ? 'var(--ink-200)' : 'var(--grape-100)',
      color: 'var(--grape-600)',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: size * 0.38,
      border: ring ? `3px solid ${ringColor}` : 'none',
      boxShadow: ring ? 'none' : 'inset 0 0 0 1px rgba(14,42,61,.06)'
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials || '?'), badge ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      minWidth: size * 0.34,
      height: size * 0.34,
      padding: '0 4px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--coral-500)',
      color: '#fff',
      border: '2px solid #fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: size * 0.2
    }
  }, badge) : null);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/chat/ConversationRow.jsx
try { (() => {
/** Conversation list row — avatar, name, last-message preview, time, unread badge. */
function ConversationRow({
  name,
  preview,
  time,
  unread = 0,
  src,
  online = false,
  onClick,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      padding: '12px 14px',
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 22,
      boxShadow: 'var(--shadow-xs)',
      cursor: 'pointer',
      textAlign: 'left',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: name,
    src: src,
    size: 50
  }), online ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 1,
      bottom: 1,
      width: 13,
      height: 13,
      borderRadius: '50%',
      background: 'var(--success-500)',
      border: '2px solid #fff'
    }
  }) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 17,
      color: 'var(--ink-900)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 700,
      fontSize: 12,
      color: 'var(--ink-400)',
      flex: '0 0 auto'
    }
  }, time)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: unread ? 700 : 600,
      fontSize: 14,
      color: unread ? 'var(--ink-700)' : 'var(--ink-500)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, preview), unread ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      minWidth: 22,
      height: 22,
      padding: '0 7px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--coral-500)',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 12,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, unread) : null)));
}
Object.assign(__ds_scope, { ConversationRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/chat/ConversationRow.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small status/label pill. Solid or soft fill across the brand palette. */
function Badge({
  children,
  color = 'coral',
  soft = true,
  size = 'md',
  style = {},
  ...rest
}) {
  const map = {
    coral: ['var(--coral-500)', 'var(--coral-50)', 'var(--coral-700)'],
    amber: ['var(--amber-500)', 'var(--amber-50)', 'var(--amber-700)'],
    teal: ['var(--teal-500)', 'var(--teal-50)', 'var(--teal-700)'],
    grape: ['var(--grape-500)', 'var(--grape-100)', 'var(--grape-600)'],
    sky: ['var(--sky-500)', 'var(--sky-100)', 'var(--sky-600)'],
    success: ['var(--success-500)', 'var(--success-50)', 'var(--success-600)'],
    danger: ['var(--danger-500)', 'var(--danger-50)', 'var(--danger-600)'],
    neutral: ['var(--ink-500)', 'var(--ink-100)', 'var(--ink-700)']
  };
  const [solid, tint, deep] = map[color] || map.coral;
  const sizes = {
    sm: {
      fs: 11,
      py: 3,
      px: 8
    },
    md: {
      fs: 12,
      py: 4,
      px: 10
    },
    lg: {
      fs: 14,
      py: 6,
      px: 14
    }
  };
  const s = sizes[size] || sizes.md;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-extra)',
      fontSize: s.fs,
      lineHeight: 1,
      letterSpacing: 'var(--ls-wide)',
      padding: `${s.py}px ${s.px}px`,
      borderRadius: 'var(--r-pill)',
      color: soft ? deep : '#fff',
      background: soft ? tint : solid,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lumio Button — chunky, rounded, clay-extruded primary action.
 * Variants: primary (coral), secondary (soft), ghost, amber, teal.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  disabled = false,
  iconBefore = null,
  iconAfter = null,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      h: 40,
      px: 16,
      fs: 14,
      radius: 'var(--r-md)',
      gap: 8
    },
    md: {
      h: 52,
      px: 22,
      fs: 16,
      radius: 'var(--r-lg)',
      gap: 10
    },
    lg: {
      h: 60,
      px: 28,
      fs: 18,
      radius: 'var(--r-xl)',
      gap: 12
    }
  };
  const s = sizes[size] || sizes.md;
  const palettes = {
    primary: {
      bg: 'var(--coral-500)',
      fg: '#fff',
      clay: 'var(--clay-coral)',
      press: 'var(--clay-coral-press)'
    },
    amber: {
      bg: 'var(--amber-500)',
      fg: 'var(--ink-900)',
      clay: 'var(--clay-amber)',
      press: '0 2px 0 var(--amber-700), 0 6px 12px rgba(245,149,18,.28)'
    },
    teal: {
      bg: 'var(--teal-500)',
      fg: '#fff',
      clay: 'var(--clay-teal)',
      press: '0 2px 0 var(--teal-700), 0 6px 12px rgba(14,154,144,.28)'
    },
    secondary: {
      bg: '#fff',
      fg: 'var(--ink-900)',
      clay: 'var(--clay-white)',
      press: 'var(--clay-neutral-press)',
      border: '1px solid var(--line)'
    },
    ghost: {
      bg: 'transparent',
      fg: 'var(--ink-700)',
      clay: 'none',
      press: 'none'
    }
  };
  const p = palettes[variant] || palettes.primary;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.h,
    padding: `0 ${s.px}px`,
    width: block ? '100%' : 'auto',
    fontFamily: 'var(--font-display)',
    fontWeight: 'var(--fw-bold)',
    fontSize: s.fs,
    letterSpacing: 'var(--ls-tight)',
    lineHeight: 1,
    color: p.fg,
    background: p.bg,
    border: p.border || 'none',
    borderRadius: s.radius,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: variant === 'ghost' ? 'none' : p.clay,
    transform: 'translateY(0)',
    transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background var(--dur-base)',
    opacity: disabled ? 0.5 : 1,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    ...style
  };
  const down = e => {
    if (disabled || variant === 'ghost') return;
    e.currentTarget.style.transform = 'translateY(4px)';
    e.currentTarget.style.boxShadow = p.press;
  };
  const up = e => {
    if (disabled || variant === 'ghost') return;
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.boxShadow = p.clay;
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: base,
    onMouseDown: down,
    onMouseUp: up,
    onMouseLeave: up,
    onTouchStart: down,
    onTouchEnd: up,
    onMouseEnter: e => {
      if (!disabled && variant === 'ghost') e.currentTarget.style.background = 'var(--ink-100)';
    }
  }, rest), iconBefore ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.2em'
    }
  }, iconBefore) : null, children, iconAfter ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.2em'
    }
  }, iconAfter) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lumio Card — soft white rounded container. The base surface for everything.
 * `clay` adds the extruded bottom lip; `tone` tints the lip color.
 */
function Card({
  children,
  clay = false,
  tone = 'neutral',
  pad = 'md',
  radius = 'lg',
  onClick,
  style = {},
  ...rest
}) {
  const pads = {
    none: 0,
    sm: 14,
    md: 20,
    lg: 24
  };
  const radii = {
    md: 'var(--r-md)',
    lg: 'var(--r-lg)',
    xl: 'var(--r-xl)',
    '2xl': 'var(--r-2xl)'
  };
  const clays = {
    neutral: 'var(--clay-white)',
    coral: 'var(--clay-coral)',
    amber: 'var(--clay-amber)',
    teal: 'var(--clay-teal)',
    grape: 'var(--clay-grape)',
    sky: 'var(--clay-sky)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      background: 'var(--surface-card)',
      borderRadius: radii[radius] || radii.lg,
      padding: pads[pad] ?? pads.md,
      boxShadow: clay ? clays[tone] || clays.neutral : 'var(--shadow-card)',
      border: clay ? 'none' : '1px solid var(--line)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Selectable/filter chip. Toggles between soft idle and solid selected. */
function Chip({
  children,
  selected = false,
  color = 'coral',
  iconBefore = null,
  onClick,
  style = {},
  ...rest
}) {
  const map = {
    coral: 'var(--coral-500)',
    amber: 'var(--amber-500)',
    teal: 'var(--teal-500)',
    grape: 'var(--grape-500)',
    sky: 'var(--sky-500)',
    ink: 'var(--ink-800)'
  };
  const accent = map[color] || map.coral;
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 40,
      padding: '0 16px',
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 14,
      lineHeight: 1,
      color: selected ? '#fff' : 'var(--ink-700)',
      background: selected ? accent : '#fff',
      border: selected ? '1px solid transparent' : '1px solid var(--line)',
      borderRadius: 'var(--r-pill)',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      boxShadow: selected ? 'var(--shadow-sm)' : 'none',
      transition: 'all var(--dur-base) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, rest), iconBefore ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.15em'
    }
  }, iconBefore) : null, children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Circular/squircle icon button — used for nav actions, card "open" arrows, chips. */
function IconButton({
  children,
  variant = 'soft',
  size = 'md',
  shape = 'circle',
  disabled = false,
  ariaLabel,
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: 36,
    md: 44,
    lg: 56
  };
  const dim = sizes[size] || sizes.md;
  const palettes = {
    primary: {
      bg: 'var(--coral-500)',
      fg: '#fff',
      shadow: 'var(--shadow-sm)'
    },
    soft: {
      bg: 'var(--ink-100)',
      fg: 'var(--ink-800)',
      shadow: 'none'
    },
    white: {
      bg: '#fff',
      fg: 'var(--ink-900)',
      shadow: 'var(--shadow-card)'
    },
    teal: {
      bg: 'var(--teal-500)',
      fg: '#fff',
      shadow: 'var(--shadow-sm)'
    },
    ghost: {
      bg: 'transparent',
      fg: 'var(--ink-700)',
      shadow: 'none'
    }
  };
  const p = palettes[variant] || palettes.soft;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": ariaLabel,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      fontSize: dim * 0.46,
      color: p.fg,
      background: p.bg,
      border: 'none',
      borderRadius: shape === 'circle' ? '50%' : 'var(--r-md)',
      boxShadow: p.shadow,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base)',
      WebkitTapHighlightColor: 'transparent',
      flex: '0 0 auto',
      ...style
    },
    onMouseDown: e => !disabled && (e.currentTarget.style.transform = 'scale(0.92)'),
    onMouseUp: e => e.currentTarget.style.transform = 'scale(1)',
    onMouseLeave: e => e.currentTarget.style.transform = 'scale(1)'
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/NotificationItem.jsx
try { (() => {
/**
 * Notification row covering the full state matrix:
 *  - unread  → faint coral-tinted surface, coral dot, bolder title
 *  - read    → flat/transparent, muted title, no dot
 *  - isNew   → coral "Yangi" pill (just-received, on top of unread)
 *  - priority→ amber accent bar + tinted surface + warning emphasis ("Muhim")
 * Type sets the icon-tile color (achievement/battle/social/lesson/system).
 */
function NotificationItem({
  type = 'system',
  icon,
  title,
  body,
  time,
  read = false,
  isNew = false,
  priority = false,
  onClick,
  style = {}
}) {
  const tones = {
    achievement: ['var(--amber-50)', 'var(--amber-600)'],
    battle: ['var(--coral-50)', 'var(--coral-600)'],
    social: ['var(--grape-100)', 'var(--grape-600)'],
    lesson: ['var(--teal-50)', 'var(--teal-600)'],
    system: ['var(--ink-100)', 'var(--ink-600)']
  };
  const [tile, fg] = tones[type] || tones.system;

  // Surface: priority > unread > read
  const surface = priority ? 'var(--amber-50)' : read ? 'transparent' : 'var(--coral-50)';
  const borderCol = priority ? 'var(--amber-300)' : read ? 'var(--line)' : 'var(--coral-100)';
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      position: 'relative',
      width: '100%',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 13,
      padding: '14px 16px 14px',
      paddingLeft: priority ? 16 : 16,
      textAlign: 'left',
      background: surface,
      border: `1px solid ${borderCol}`,
      borderRadius: 'var(--r-lg)',
      boxShadow: read ? 'none' : 'var(--shadow-xs)',
      cursor: 'pointer',
      overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, priority ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 5,
      background: 'var(--amber-500)'
    }
  }) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 44,
      height: 44,
      borderRadius: 'var(--r-md)',
      background: tile,
      color: fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 23,
      marginLeft: priority ? 4 : 0
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: read ? 600 : 800,
      fontSize: 16,
      color: read ? 'var(--ink-600)' : 'var(--ink-900)',
      lineHeight: 1.2
    }
  }, title), priority ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      height: 20,
      padding: '0 8px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--amber-500)',
      color: 'var(--ink-900)',
      fontFamily: 'var(--font-ui)',
      fontWeight: 800,
      fontSize: 10.5,
      letterSpacing: '.03em'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-warning",
    style: {
      fontSize: 12
    }
  }), "MUHIM") : isNew ? /*#__PURE__*/React.createElement("span", {
    style: {
      height: 20,
      padding: '0 8px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--coral-500)',
      color: '#fff',
      fontFamily: 'var(--font-ui)',
      fontWeight: 800,
      fontSize: 10.5,
      letterSpacing: '.03em',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, "YANGI") : null), body ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 3,
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 13.5,
      color: read ? 'var(--ink-400)' : 'var(--ink-600)',
      lineHeight: 1.4
    }
  }, body) : null, time ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 6,
      fontFamily: 'var(--font-ui)',
      fontWeight: 700,
      fontSize: 11.5,
      color: 'var(--ink-400)'
    }
  }, time) : null), !read ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 10,
      height: 10,
      borderRadius: '50%',
      marginTop: 6,
      background: priority ? 'var(--amber-500)' : 'var(--coral-500)'
    }
  }) : null);
}
Object.assign(__ds_scope, { NotificationItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/NotificationItem.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Horizontal progress bar — rounded, inset track, rounded fill. */
function ProgressBar({
  value = 0,
  color = 'var(--coral-500)',
  height = 12,
  showLabel = false,
  style = {},
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height,
      background: 'var(--bg-sunk)',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--inset-soft)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: '100%',
      background: color,
      borderRadius: 'var(--r-pill)',
      transition: 'width var(--dur-slow) var(--ease-out)'
    }
  })), showLabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 13,
      color: 'var(--ink-700)',
      minWidth: 38,
      textAlign: 'right'
    }
  }, Math.round(pct), "%") : null);
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressRing.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Circular progress ring with centered label — for lesson/unit completion. */
function ProgressRing({
  value = 0,
  size = 72,
  stroke = 8,
  color = 'var(--coral-500)',
  track = 'var(--bg-sunk)',
  label,
  style = {},
  ...rest
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c * (1 - pct / 100);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: size,
      height: size,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: 'rotate(-90deg)'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: track,
    strokeWidth: stroke
  }), /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: offset,
    style: {
      transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-extra)',
      fontSize: size * 0.26,
      color: 'var(--ink-900)'
    }
  }, label ?? `${Math.round(pct)}%`));
}
Object.assign(__ds_scope, { ProgressRing });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressRing.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/** Text input — rounded, roomy, with optional leading icon and label. */
function Input({
  label,
  placeholder,
  value,
  defaultValue,
  type = 'text',
  iconBefore = null,
  error = '',
  disabled = false,
  onChange,
  style = {},
  ...rest
}) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? 'var(--danger-500)' : focus ? 'var(--coral-500)' : 'var(--line-strong)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginBottom: 8,
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 14,
      color: 'var(--ink-700)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 56,
      padding: '0 16px',
      background: disabled ? 'var(--bg-sunk)' : '#fff',
      border: `2px solid ${borderColor}`,
      borderRadius: 'var(--r-md)',
      boxShadow: focus ? 'var(--ring)' : 'none',
      transition: 'border-color var(--dur-base), box-shadow var(--dur-base)'
    }
  }, iconBefore ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: 20,
      color: 'var(--ink-400)'
    }
  }, iconBefore) : null, /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    disabled: disabled,
    onChange: onChange,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 16,
      color: 'var(--ink-900)',
      minWidth: 0
    }
  }, rest))), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      marginTop: 6,
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 13,
      color: 'var(--danger-500)'
    }
  }, error) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Segmented control — pill track with a sliding selected segment. */
function SegmentedControl({
  options = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  const idx = Math.max(0, options.findIndex(o => (o.value ?? o) === value));
  const n = options.length || 1;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: `repeat(${n}, 1fr)`,
      padding: 5,
      background: 'var(--bg-sunk)',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--inset-soft)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 5,
      bottom: 5,
      left: `calc(${idx * 100 / n}% + 5px)`,
      width: `calc(${100 / n}% - 10px)`,
      background: '#fff',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--dur-base) var(--ease-out)'
    }
  }), options.map(o => {
    const val = o.value ?? o;
    const label = o.label ?? o;
    const active = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: String(val),
      onClick: () => onChange && onChange(val),
      style: {
        position: 'relative',
        zIndex: 1,
        height: 38,
        border: 'none',
        background: 'transparent',
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--fw-bold)',
        fontSize: 14,
        color: active ? 'var(--coral-600)' : 'var(--ink-500)',
        cursor: 'pointer',
        transition: 'color var(--dur-base)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Toggle switch — green when on (matches the settings "Ovoz effektlari" toggle). */
function Switch({
  checked = false,
  disabled = false,
  onChange,
  size = 'md',
  style = {},
  ...rest
}) {
  const dims = {
    sm: {
      w: 44,
      h: 26,
      k: 20
    },
    md: {
      w: 54,
      h: 32,
      k: 26
    }
  };
  const d = dims[size] || dims.md;
  const pad = (d.h - d.k) / 2;
  return /*#__PURE__*/React.createElement("button", _extends({
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      position: 'relative',
      width: d.w,
      height: d.h,
      flex: '0 0 auto',
      padding: 0,
      border: 'none',
      borderRadius: 'var(--r-pill)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: checked ? 'var(--success-500)' : 'var(--ink-300)',
      opacity: disabled ? 0.5 : 1,
      boxShadow: 'var(--inset-soft)',
      transition: 'background var(--dur-base) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: pad,
      left: checked ? d.w - d.k - pad : pad,
      width: d.k,
      height: d.k,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 2px 5px rgba(14,42,61,.25)',
      transition: 'left var(--dur-base) var(--ease-bounce)'
    }
  }));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/gamification/CategoryCard.jsx
try { (() => {
/**
 * Category count card — the soft pastel rows from "Mening lug‘atim" (Learning /
 * New / All words) and the "Unit 1.1" sections (Video / Vocabulary / Homework).
 * Big rounded title on a tinted surface with a trailing value box (count or %).
 */
function CategoryCard({
  title,
  value,
  tone = 'sky',
  onClick,
  style = {}
}) {
  const tones = {
    sky: ['var(--sky-100)', 'var(--ink-900)'],
    pink: ['#FCE0EE', 'var(--ink-900)'],
    sand: ['#F4E7CB', 'var(--ink-900)'],
    grape: ['var(--grape-100)', 'var(--ink-900)'],
    mint: ['#CFF3D8', 'var(--ink-900)'],
    peach: ['#FFE3C2', 'var(--ink-900)'],
    coral: ['var(--coral-50)', 'var(--ink-900)'],
    teal: ['var(--teal-50)', 'var(--ink-900)']
  };
  const [bg, fg] = tones[tone] || tones.sky;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '20px 18px',
      textAlign: 'left',
      background: bg,
      border: 'none',
      borderRadius: 'var(--r-xl)',
      cursor: onClick ? 'pointer' : 'default',
      boxShadow: 'var(--shadow-sm)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 23,
      color: fg,
      lineHeight: 1.15
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      minWidth: 60,
      height: 56,
      padding: '0 14px',
      borderRadius: 'var(--r-md)',
      background: 'rgba(255,255,255,.72)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 24,
      color: 'var(--ink-900)'
    }
  }, value));
}
Object.assign(__ds_scope, { CategoryCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/CategoryCard.jsx", error: String((e && e.message) || e) }); }

// components/gamification/FeatureCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Large gradient feature tile — the bold home/resource cards. Big rounded title,
 * an "open" arrow chip, an optional art slot on the right, and a clay lip.
 */
function FeatureCard({
  title,
  subtitle,
  gradient = 'warm',
  art = null,
  onClick,
  height = 150,
  style = {},
  ...rest
}) {
  const grads = {
    warm: 'var(--grad-warm)',
    sun: 'var(--grad-sun)',
    teal: 'var(--grad-teal)',
    cool: 'var(--grad-cool)',
    grape: 'var(--grad-grape)'
  };
  const lips = {
    warm: 'var(--clay-coral)',
    sun: 'var(--clay-amber)',
    teal: 'var(--clay-teal)',
    cool: 'var(--clay-sky)',
    grape: 'var(--clay-grape)'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      position: 'relative',
      overflow: 'hidden',
      minHeight: height,
      padding: 22,
      background: grads[gradient] || grads.warm,
      borderRadius: 'var(--r-xl)',
      boxShadow: lips[gradient] || lips.warm,
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      transition: 'transform var(--dur-base) var(--ease-out)',
      ...style
    },
    onMouseDown: e => onClick && (e.currentTarget.style.transform = 'translateY(3px)'),
    onMouseUp: e => e.currentTarget.style.transform = 'translateY(0)',
    onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)'
  }, rest), art ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      top: 0,
      width: '46%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      opacity: 0.95,
      fontSize: 96,
      color: 'rgba(255,255,255,0.55)',
      pointerEvents: 'none'
    }
  }, art) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      maxWidth: art ? '62%' : '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-extra)',
      fontSize: 30,
      lineHeight: 1.05,
      color: '#fff',
      letterSpacing: 'var(--ls-tight)',
      textShadow: '0 2px 8px rgba(14,42,61,.18)'
    }
  }, title), subtitle ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      display: 'inline-flex',
      alignItems: 'center',
      height: 44,
      padding: '0 18px',
      borderRadius: 'var(--r-pill)',
      background: 'rgba(255,255,255,0.22)',
      color: '#fff',
      fontFamily: 'var(--font-ui)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 15,
      backdropFilter: 'blur(4px)'
    }
  }, subtitle) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 46,
      height: 46,
      borderRadius: '50%',
      background: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink-900)',
      fontSize: 22,
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-bold ph-arrow-up-right"
  })));
}
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/gamification/FractionChip.jsx
try { (() => {
/**
 * Fraction reward chip — the "star 0/10" / "coin 0/10" pills used all over the
 * lesson screens to show earned-vs-total stars and coins. Outlined capsule with
 * a colored icon coin.
 */
function FractionChip({
  kind = 'star',
  earned = 0,
  total = 0,
  size = 'md',
  style = {}
}) {
  const kinds = {
    star: ['var(--success-500)', /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-star"
    })],
    coin: ['var(--amber-400)', /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-coin"
    })],
    xp: ['var(--amber-500)', /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-lightning"
    })],
    gem: ['var(--teal-500)', /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-diamond"
    })]
  };
  const [c, icon] = kinds[kind] || kinds.star;
  const sz = size === 'sm' ? {
    h: 28,
    fs: 13,
    ic: 16,
    px: 6
  } : {
    h: 34,
    fs: 15,
    ic: 19,
    px: 7
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: sz.h,
      padding: `0 ${sz.px + 4}px 0 ${sz.px}px`,
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--shadow-xs)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: sz.ic,
      color: c
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: sz.fs,
      color: 'var(--ink-900)',
      lineHeight: 1
    }
  }, earned, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-400)'
    }
  }, "/", total)));
}
Object.assign(__ds_scope, { FractionChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/FractionChip.jsx", error: String((e && e.message) || e) }); }

// components/gamification/LeaderboardRow.jsx
try { (() => {
/**
 * Leaderboard row — rank, avatar, name, and a star-XP pill. `highlight` outlines
 * the current user's own row (the "Peshqadamlar jadvali" self-row).
 */
function LeaderboardRow({
  rank,
  name,
  xp,
  src,
  highlight = false,
  onClick,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      background: '#fff',
      borderRadius: 'var(--r-lg)',
      cursor: onClick ? 'pointer' : 'default',
      textAlign: 'left',
      border: highlight ? '2px solid var(--coral-500)' : '1px solid var(--line)',
      boxShadow: highlight ? '0 8px 20px rgba(255,107,74,.18)' : 'var(--shadow-xs)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26,
      textAlign: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 17,
      color: rank <= 3 ? 'var(--coral-500)' : 'var(--ink-500)',
      flex: '0 0 auto'
    }
  }, rank), /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: name,
    src: src,
    size: 42
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 16.5,
      color: 'var(--ink-900)',
      lineHeight: 1.15
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 34,
      padding: '0 12px',
      flex: '0 0 auto',
      background: 'var(--surface-tint)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-pill)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-star",
    style: {
      color: 'var(--amber-500)',
      fontSize: 17
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 15,
      color: 'var(--ink-900)'
    }
  }, xp)));
}
Object.assign(__ds_scope, { LeaderboardRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/LeaderboardRow.jsx", error: String((e && e.message) || e) }); }

// components/gamification/LessonNode.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lesson path node — the chunky rounded unit tile from the lesson map.
 * States: locked (greyed, sunk), active (coral glow ring), done (teal).
 */
function LessonNode({
  label = 'Unit 1.1',
  percent = 0,
  state = 'locked',
  size = 132,
  onClick,
  style = {},
  ...rest
}) {
  const states = {
    locked: {
      face: 'var(--bg-sunk)',
      ring: 'transparent',
      text: 'var(--ink-400)',
      lip: '#D2DAE3'
    },
    active: {
      face: '#fff',
      ring: 'var(--coral-500)',
      text: 'var(--ink-900)',
      lip: '#E2E8EF'
    },
    done: {
      face: 'var(--teal-50)',
      ring: 'var(--teal-500)',
      text: 'var(--teal-700)',
      lip: 'var(--teal-300)'
    }
  };
  const s = states[state] || states.locked;
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      position: 'relative',
      width: size,
      height: size,
      padding: 16,
      border: 'none',
      background: s.face,
      borderRadius: 'var(--r-2xl)',
      textAlign: 'left',
      cursor: 'pointer',
      boxShadow: state === 'active' ? `0 0 0 5px ${s.ring}, 0 6px 0 ${s.lip}, 0 16px 26px rgba(255,107,74,.28)` : `0 6px 0 ${s.lip}, 0 12px 22px rgba(14,42,61,.10)`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'transform var(--dur-fast) var(--ease-out)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseDown: e => e.currentTarget.style.transform = 'translateY(3px)',
    onMouseUp: e => e.currentTarget.style.transform = 'translateY(0)',
    onMouseLeave: e => e.currentTarget.style.transform = 'translateY(0)'
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-extra)',
      fontSize: 26,
      color: s.text,
      lineHeight: 1
    }
  }, percent, "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 19,
      color: s.text,
      lineHeight: 1
    }
  }, label), state === 'locked' ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 12,
      right: 12,
      fontSize: 18,
      color: 'var(--ink-400)'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-lock-simple"
  })) : null);
}
Object.assign(__ds_scope, { LessonNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/LessonNode.jsx", error: String((e && e.message) || e) }); }

// components/gamification/ResultStatPill.jsx
try { (() => {
/**
 * Battle-result stat capsule (icon + value). Used in the "Jang natijasi" cards:
 * correct (teal), wrong (danger), star (amber), time (neutral). `filled` for the winner.
 */
function ResultStatPill({
  icon,
  value,
  kind = 'correct',
  filled = false,
  style = {}
}) {
  const map = {
    correct: ['var(--success-500)', 'var(--success-50)', 'var(--success-600)'],
    wrong: ['var(--danger-500)', 'var(--danger-50)', 'var(--danger-600)'],
    star: ['var(--amber-500)', 'var(--amber-50)', 'var(--amber-700)'],
    time: ['var(--sky-500)', 'var(--sky-100)', 'var(--sky-600)']
  };
  const [solid, tint, deep] = map[kind] || map.correct;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 36,
      padding: '0 6px 0 6px',
      borderRadius: 'var(--r-pill)',
      background: filled ? 'rgba(255,255,255,.22)' : '#fff',
      boxShadow: filled ? 'none' : 'var(--shadow-xs)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: solid,
      color: '#fff',
      fontSize: 14,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16,
      lineHeight: 1,
      paddingRight: 8,
      color: filled ? '#fff' : 'var(--ink-900)'
    }
  }, value));
}
Object.assign(__ds_scope, { ResultStatPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/ResultStatPill.jsx", error: String((e && e.message) || e) }); }

// components/gamification/StatChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Gamification stat pill — icon + value in a white rounded capsule (XP, coins, streak). */
function StatChip({
  icon,
  value,
  kind = 'xp',
  size = 'md',
  style = {},
  ...rest
}) {
  const tones = {
    xp: 'var(--amber-500)',
    coin: 'var(--amber-400)',
    streak: 'var(--coral-500)',
    gem: 'var(--teal-500)',
    neutral: 'var(--ink-500)'
  };
  const iconColor = tones[kind] || tones.xp;
  const sizes = {
    sm: {
      h: 32,
      fs: 14,
      ic: 16,
      px: 10
    },
    md: {
      h: 40,
      fs: 17,
      ic: 20,
      px: 12
    }
  };
  const s = sizes[size] || sizes.md;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: s.h,
      padding: `0 ${s.px}px`,
      background: '#fff',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--line)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: s.ic,
      color: iconColor
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-extra)',
      fontSize: s.fs,
      color: 'var(--ink-900)',
      lineHeight: 1
    }
  }, value));
}
Object.assign(__ds_scope, { StatChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/gamification/StatChip.jsx", error: String((e && e.message) || e) }); }

// components/learning/AudioPlayer.jsx
try { (() => {
const {
  useState
} = React;
/**
 * Audio player bar — the listening-exercise scrubber. A draggable-looking track
 * with a thumb, elapsed / total times, a volume icon, play/pause, and a speed
 * toggle (1.0x → 1.25x → 1.5x → 0.75x). Visual; wire `onPlay`/`onSeek` for real audio.
 */
function AudioPlayer({
  elapsed = '00:15',
  total = '00:00',
  progress = 18,
  playing = false,
  onToggle,
  style = {}
}) {
  const [speed, setSpeed] = useState(1);
  const speeds = [1, 1.25, 1.5, 0.75];
  const cycleSpeed = () => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-sunk)',
      borderRadius: 'var(--r-lg)',
      padding: '16px 18px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 8,
      background: 'var(--ink-200)',
      borderRadius: 'var(--r-pill)',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${progress}%`,
      height: '100%',
      background: 'var(--ink-800)',
      borderRadius: 'var(--r-pill)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: '50%',
      left: `${progress}%`,
      transform: 'translate(-50%,-50%)',
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: 'var(--ink-900)',
      boxShadow: '0 2px 5px rgba(14,42,61,.3)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 13,
      color: 'var(--ink-700)',
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", null, elapsed), /*#__PURE__*/React.createElement("span", null, total)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": "Ovoz",
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-800)',
      fontSize: 24,
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-speaker-high"
  })), /*#__PURE__*/React.createElement("button", {
    "aria-label": playing ? 'Pauza' : 'Ijro',
    onClick: onToggle,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-800)',
      fontSize: 28,
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `ph-fill ph-${playing ? 'pause' : 'play'}`
  })), /*#__PURE__*/React.createElement("button", {
    onClick: cycleSpeed,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-800)',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2
    }
  }, speed.toFixed(speed % 1 === 0 ? 1 : 2), "x")));
}
Object.assign(__ds_scope, { AudioPlayer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/AudioPlayer.jsx", error: String((e && e.message) || e) }); }

// components/learning/ExerciseCard.jsx
try { (() => {
/**
 * Exercise card — the "Homework Compulsory" rows. A green TYPE pill + an amber
 * SKILL pill, the instruction text, star/coin fraction chips, and a thin
 * progress bar with a trailing percent.
 */
function ExerciseCard({
  type = 'Choose Answer',
  skill = 'GRAMMAR',
  instruction,
  stars = [0, 10],
  coins = [0, 10],
  percent = 0,
  onClick,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      textAlign: 'left',
      display: 'block',
      padding: 18,
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-card)',
      cursor: onClick ? 'pointer' : 'default',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      height: 30,
      padding: '0 14px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--success-500)',
      color: '#fff',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 14,
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, type), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 28,
      padding: '0 14px',
      borderRadius: 'var(--r-pill)',
      background: 'var(--amber-500)',
      color: 'var(--ink-900)',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 12.5,
      letterSpacing: '.04em',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, skill)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      alignItems: 'flex-end',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.FractionChip, {
    kind: "star",
    earned: stars[0],
    total: stars[1],
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.FractionChip, {
    kind: "coin",
    earned: coins[0],
    total: coins[1],
    size: "sm"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '14px 0 14px',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 18,
      color: 'var(--ink-900)',
      lineHeight: 1.3
    }
  }, instruction), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 10,
      background: 'var(--amber-50)',
      borderRadius: 'var(--r-pill)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${Math.max(0, Math.min(100, percent))}%`,
      height: '100%',
      background: 'var(--amber-500)',
      borderRadius: 'var(--r-pill)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 14,
      color: 'var(--amber-600)',
      minWidth: 38,
      textAlign: 'right'
    }
  }, percent, "%")));
}
Object.assign(__ds_scope, { ExerciseCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/ExerciseCard.jsx", error: String((e && e.message) || e) }); }

// components/learning/NumberedSteps.jsx
try { (() => {
/**
 * Numbered steps path — the "Sizda hali so‘zlar yo‘q" empty-state onboarding.
 * Chunky clay numbered tiles alternate left/right and are joined by a CONTINUOUS
 * dashed connector: it drops straight down from each tile, turns, and runs across
 * into the next tile, so the sequence reads as one flowing path. Each tile is
 * paired with an explanatory bubble.
 */
function NumberedSteps({
  steps = [],
  tone = 'grape',
  style = {}
}) {
  const tones = {
    grape: ['var(--grape-400)', 'var(--grape-600)'],
    coral: ['var(--coral-400)', 'var(--coral-700)'],
    teal: ['var(--teal-400)', 'var(--teal-700)'],
    sky: ['var(--sky-400)', 'var(--sky-600)']
  };
  const [face, lip] = tones[tone] || tones.grape;
  const TILE = 78,
    OFF = 2,
    CENTER = OFF + TILE / 2; // 41px from the near edge
  const BLOCK = 132,
    LAST = 84;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, steps.map((s, i) => {
    const left = i % 2 === 0; // tile side this row
    const last = i === steps.length - 1;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        position: 'relative',
        height: last ? LAST : BLOCK
      }
    }, !last ? /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        position: 'absolute',
        top: OFF + TILE,
        height: BLOCK - TILE,
        left: CENTER,
        right: CENTER,
        borderBottom: `3px dashed ${face}`,
        borderLeft: left ? `3px dashed ${face}` : 'none',
        borderRight: left ? 'none' : `3px dashed ${face}`,
        borderBottomLeftRadius: left ? 18 : 0,
        borderBottomRightRadius: left ? 0 : 18,
        opacity: 0.7
      }
    }) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: OFF,
        left: left ? OFF : 'auto',
        right: left ? 'auto' : OFF,
        width: TILE,
        height: TILE,
        borderRadius: 'var(--r-xl)',
        background: face,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 32,
        boxShadow: `0 6px 0 ${lip}, 0 12px 20px rgba(14,42,61,.14)`,
        zIndex: 1
      }
    }, i + 1), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: OFF + TILE / 2,
        transform: 'translateY(-50%)',
        left: left ? OFF + TILE + 16 : OFF,
        right: left ? OFF : OFF + TILE + 16,
        background: 'var(--bg-tint)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 16,
        color: 'var(--ink-700)',
        lineHeight: 1.4
      }
    }, s));
  }));
}
Object.assign(__ds_scope, { NumberedSteps });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/NumberedSteps.jsx", error: String((e && e.message) || e) }); }

// components/learning/ProgressChart.jsx
try { (() => {
const {
  useState
} = React;
/**
 * Progress line chart — the "Mening lug‘atim" stats. Range tabs (7 kun / 1 oy /
 * 6 oy / 1 yil), a lightweight SVG line/area chart with a dashed grid + x labels,
 * and an optional legend. Pure SVG, no chart lib. Pass one or two series.
 */
function ProgressChart({
  ranges = ['7 kun', '1 oy', '6 oy', '1 yil'],
  range,
  onRange,
  labels = ['Shan', 'Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju'],
  series = [],
  legend = [],
  height = 200,
  style = {}
}) {
  const [r, setR] = useState(range || ranges[0]);
  const setRange = v => {
    setR(v);
    onRange && onRange(v);
  };
  const cur = range || r;
  const W = 320,
    H = height,
    padL = 26,
    padB = 26,
    padT = 10,
    padR = 8;
  const max = Math.max(1, ...series.flatMap(s => s.data));
  const n = labels.length;
  const x = i => padL + i * (W - padL - padR) / Math.max(1, n - 1);
  const y = v => padT + (1 - v / max) * (H - padT - padB);
  const path = data => data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-tint)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-xl)',
      padding: 16,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      padding: 5,
      background: '#fff',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--inset-soft)',
      marginBottom: 16
    }
  }, ranges.map(rg => {
    const active = rg === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: rg,
      onClick: () => setRange(rg),
      style: {
        flex: 1,
        height: 34,
        border: 'none',
        borderRadius: 'var(--r-pill)',
        background: active ? 'var(--coral-50)' : 'transparent',
        color: active ? 'var(--coral-600)' : 'var(--ink-500)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 13.5,
        cursor: 'pointer',
        boxShadow: active ? 'var(--shadow-xs)' : 'none'
      }
    }, rg);
  })), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    width: "100%",
    style: {
      display: 'block',
      overflow: 'visible'
    }
  }, [0, 0.25, 0.5, 0.75, 1].map((g, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: padL,
    x2: W - padR,
    y1: padT + g * (H - padT - padB),
    y2: padT + g * (H - padT - padB),
    stroke: "var(--line)",
    strokeWidth: "1",
    strokeDasharray: "4 5"
  })), /*#__PURE__*/React.createElement("line", {
    x1: padL,
    x2: padL,
    y1: padT,
    y2: H - padB,
    stroke: "var(--ink-800)",
    strokeWidth: "2"
  }), series.map((s, si) => /*#__PURE__*/React.createElement("g", {
    key: si
  }, /*#__PURE__*/React.createElement("path", {
    d: path(s.data),
    fill: "none",
    stroke: s.color,
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      filter: 'drop-shadow(0 4px 6px rgba(14,42,61,.12))'
    }
  }), s.data.map((v, i) => /*#__PURE__*/React.createElement("circle", {
    key: i,
    cx: x(i),
    cy: y(v),
    r: "3.5",
    fill: "#fff",
    stroke: s.color,
    strokeWidth: "2.5"
  })))), labels.map((l, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: x(i),
    y: H - 8,
    textAnchor: "middle",
    fontFamily: "var(--font-ui)",
    fontWeight: "700",
    fontSize: "11",
    fill: "var(--ink-400)"
  }, l))), legend.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTop: '1px solid var(--line)'
    }
  }, legend.map((lg, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 15,
      color: 'var(--ink-700)',
      minWidth: 24
    }
  }, lg.value), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: lg.color,
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink-600)'
    }
  }, lg.label)))) : null);
}
Object.assign(__ds_scope, { ProgressChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/ProgressChart.jsx", error: String((e && e.message) || e) }); }

// components/learning/VideoLessonCard.jsx
try { (() => {
/**
 * Video lesson card — the "1-video / 2-video" blocks. Title, a "Video" and a
 * "Mashq" (practice) row each with star/coin fractions + a track bar, and a
 * watch CTA. Clay-extruded white card.
 */
function VideoLessonCard({
  title = '1-video',
  video = {
    stars: [0, 1],
    coins: [0, 1],
    pct: 0
  },
  practice = {
    stars: [0, 10],
    coins: [0, 10],
    pct: 0
  },
  onWatch,
  style = {}
}) {
  const Row = ({
    label,
    data
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-tint)',
      borderRadius: 'var(--r-md)',
      padding: '12px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 16,
      color: 'var(--ink-900)'
    }
  }, label, ":"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.FractionChip, {
    kind: "star",
    earned: data.stars[0],
    total: data.stars[1],
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.FractionChip, {
    kind: "coin",
    earned: data.coins[0],
    total: data.coins[1],
    size: "sm"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12,
      background: '#fff',
      borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--inset-soft)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${data.pct}%`,
      height: '100%',
      background: 'var(--teal-500)',
      borderRadius: 'var(--r-pill)'
    }
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      borderRadius: 'var(--r-xl)',
      padding: 18,
      boxShadow: 'var(--clay-white)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 24,
      color: 'var(--ink-900)',
      marginBottom: 14
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Row, {
    label: "Video",
    data: video
  }), /*#__PURE__*/React.createElement(Row, {
    label: "Mashq",
    data: practice
  })), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    block: true,
    size: "lg",
    onClick: onWatch,
    iconAfter: /*#__PURE__*/React.createElement("i", {
      className: "ph-fill ph-play"
    })
  }, "Videoni ko\u2018rish"));
}
Object.assign(__ds_scope, { VideoLessonCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/VideoLessonCard.jsx", error: String((e && e.message) || e) }); }

// components/learning/WordCard.jsx
try { (() => {
/**
 * Word flashcard — the "Mavzuga qaytish" vocab card. A language flag + label,
 * the term with an audio button, IPA pronunciation, and an italic example with
 * a translate toggle. Pair two (EN term + UZ translation) for the full pattern.
 */
function WordCard({
  flag = '🇬🇧',
  lang = 'Olmosh',
  term,
  ipa,
  example,
  audioOnly = false,
  onAudio,
  onTranslate,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)',
      padding: 20,
      boxShadow: 'var(--shadow-card)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: term ? 16 : 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 30,
      lineHeight: 1,
      borderRadius: 6,
      overflow: 'hidden'
    }
  }, flag), lang ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 21,
      color: 'var(--ink-900)'
    }
  }, lang) : null), term ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: ipa ? 10 : 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 30,
      color: 'var(--ink-900)'
    }
  }, term), onAudio ? /*#__PURE__*/React.createElement("button", {
    "aria-label": "Tinglash",
    onClick: onAudio,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--sky-500)',
      fontSize: 26,
      display: 'inline-flex',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-fill ph-speaker-high"
  })) : null) : null, ipa ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 18,
      color: 'var(--ink-500)',
      marginBottom: example ? 16 : 0
    }
  }, ipa) : null, example ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontStyle: 'italic',
      fontSize: 19,
      color: 'var(--ink-800)',
      lineHeight: 1.35
    }
  }, "\u201C", example, "\u201D"), onTranslate ? /*#__PURE__*/React.createElement("button", {
    "aria-label": "Tarjima",
    onClick: onTranslate,
    style: {
      flex: '0 0 auto',
      width: 44,
      height: 44,
      borderRadius: '50%',
      border: 'none',
      background: 'var(--grape-100)',
      color: 'var(--grape-600)',
      cursor: 'pointer',
      fontSize: 22,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "ph-bold ph-translate"
  })) : null) : null);
}
Object.assign(__ds_scope, { WordCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/learning/WordCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Bottom tab bar — floating pill. The active tab becomes a solid coral circle;
 * inactive tabs show icon + label in muted ink.
 */
function BottomNav({
  items = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 4,
      height: 'var(--nav-h)',
      padding: '0 14px',
      background: 'rgba(255,255,255,0.82)',
      backdropFilter: 'var(--blur-glass)',
      WebkitBackdropFilter: 'var(--blur-glass)',
      borderRadius: 'var(--r-2xl)',
      boxShadow: '0 -2px 30px rgba(14,42,61,.12), 0 8px 24px rgba(14,42,61,.10)',
      border: '1px solid rgba(255,255,255,0.6)',
      ...style
    }
  }, rest), items.map(it => {
    const active = it.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onChange && onChange(it.value),
      "aria-label": it.label,
      style: {
        flex: active ? '0 0 auto' : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: active ? 56 : '100%',
        width: active ? 56 : 'auto',
        padding: 0,
        border: 'none',
        borderRadius: active ? '50%' : 'var(--r-md)',
        background: active ? 'var(--coral-500)' : 'transparent',
        boxShadow: active ? '0 8px 18px rgba(255,107,74,.40)' : 'none',
        color: active ? '#fff' : 'var(--ink-400)',
        cursor: 'pointer',
        transition: 'all var(--dur-base) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: active ? 24 : 22,
        display: 'inline-flex'
      }
    }, active ? it.iconActive || it.icon : it.icon), !active ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--fw-bold)',
        fontSize: 12,
        color: 'var(--ink-400)'
      }
    }, it.label) : null);
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/ListRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * List row — the white rounded "menu" rows from the More screen. Leading icon in
 * a soft tile, label, optional trailing content, chevron by default.
 */
function ListRow({
  icon,
  iconTone = 'grape',
  label,
  trailing = null,
  chevron = true,
  onClick,
  style = {},
  ...rest
}) {
  const tones = {
    grape: ['var(--grape-100)', 'var(--grape-600)'],
    coral: ['var(--coral-50)', 'var(--coral-600)'],
    amber: ['var(--amber-50)', 'var(--amber-600)'],
    teal: ['var(--teal-50)', 'var(--teal-600)'],
    ink: ['var(--ink-100)', 'var(--ink-700)']
  };
  const [tile, fg] = tones[iconTone] || tones.grape;
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 16px',
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-lg)',
      boxShadow: 'var(--shadow-xs)',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'background var(--dur-base)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-tint)',
    onMouseLeave: e => e.currentTarget.style.background = '#fff'
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      width: 40,
      height: 40,
      borderRadius: 'var(--r-sm)',
      background: tile,
      color: fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22
    }
  }, icon) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 18,
      color: 'var(--ink-900)'
    }
  }, label), trailing, chevron ? /*#__PURE__*/React.createElement("i", {
    className: "ph-bold ph-caret-right",
    style: {
      fontSize: 20,
      color: 'var(--ink-900)'
    }
  }) : null);
}
Object.assign(__ds_scope, { ListRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/ListRow.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Scrollable category tabs (e.g. Starter / Beginner / Elementary). Selected tab is
 * a solid pill; works on both light surfaces and colored headers (`onColor`).
 */
function Tabs({
  items = [],
  value,
  onChange,
  onColor = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      overflowX: 'auto',
      padding: '2px 2px 6px',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      ...style
    }
  }, items.map(it => {
    const val = it.value ?? it;
    const label = it.label ?? it;
    const active = val === value;
    const activeBg = onColor ? '#fff' : 'var(--coral-500)';
    const activeFg = onColor ? 'var(--ink-900)' : '#fff';
    const idleFg = onColor ? 'rgba(255,255,255,.85)' : 'var(--ink-500)';
    return /*#__PURE__*/React.createElement("button", {
      key: String(val),
      onClick: () => onChange && onChange(val),
      style: {
        flex: '0 0 auto',
        height: 40,
        padding: '0 18px',
        border: 'none',
        borderRadius: 'var(--r-pill)',
        background: active ? activeBg : onColor ? 'transparent' : '#fff',
        boxShadow: active ? 'var(--shadow-sm)' : onColor ? 'none' : 'inset 0 0 0 1px var(--line)',
        color: active ? activeFg : idleFg,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 15,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all var(--dur-base) var(--ease-out)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlay/BottomSheet.jsx
try { (() => {
/**
 * Lumio BottomSheet — slides up from the bottom over a scrim. Has the grab
 * handle, an optional title, and arbitrary content (action lists, pickers).
 */
function BottomSheet({
  open = true,
  onClose,
  title,
  children,
  style = {}
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => {
      if (e.target === e.currentTarget) onClose && onClose();
    },
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      display: 'flex',
      alignItems: 'flex-end',
      background: 'rgba(14,42,61,.48)',
      animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      background: '#fff',
      borderTopLeftRadius: 'var(--r-3xl)',
      borderTopRightRadius: 'var(--r-3xl)',
      padding: '12px 20px calc(24px + env(safe-area-inset-bottom))',
      boxShadow: '0 -10px 40px rgba(14,42,61,.22)',
      animation: 'lumio-sheet-up var(--dur-slow) var(--ease-out) both',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 'var(--r-pill)',
      background: 'var(--ink-200)',
      margin: '0 auto 14px'
    }
  }), title ? /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 14px',
      textAlign: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 21,
      color: 'var(--ink-900)'
    }
  }, title) : null, children), /*#__PURE__*/React.createElement("style", null, `@keyframes lumio-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`));
}

/** Convenience row for a BottomSheet action list. */
function SheetAction({
  icon,
  label,
  tone = 'ink',
  onClick
}) {
  const tones = {
    ink: 'var(--ink-800)',
    coral: 'var(--coral-600)',
    teal: 'var(--teal-600)',
    grape: 'var(--grape-600)',
    danger: 'var(--danger-500)'
  };
  const c = tones[tone] || tones.ink;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 14px',
      border: 'none',
      background: 'transparent',
      borderRadius: 'var(--r-md)',
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 17,
      color: c,
      WebkitTapHighlightColor: 'transparent'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'var(--bg-tint)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent'
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: 22,
      color: c
    }
  }, icon) : null, label);
}
Object.assign(__ds_scope, { BottomSheet, SheetAction });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/BottomSheet.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
/**
 * Lumio Dialog — centered modal over a scrim. Pops in with the bounce easing.
 * Variants set the icon medallion + accent: confirm (coral), alert (danger),
 * celebrate (amber). Pass your own buttons via `actions`, or use confirm props.
 */
function Dialog({
  open = true,
  onClose,
  variant = 'confirm',
  icon,
  title,
  children,
  actions,
  dismissOnScrim = true,
  style = {}
}) {
  if (!open) return null;
  const accents = {
    confirm: ['var(--coral-50)', 'var(--coral-500)'],
    alert: ['var(--danger-50)', 'var(--danger-500)'],
    celebrate: ['var(--amber-50)', 'var(--amber-500)'],
    neutral: ['var(--ink-100)', 'var(--ink-600)']
  };
  const [tile, fg] = accents[variant] || accents.confirm;
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    onClick: e => {
      if (dismissOnScrim && e.target === e.currentTarget) onClose && onClose();
    },
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'rgba(14,42,61,.48)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "lumio-pop-in",
    style: {
      width: '100%',
      maxWidth: 360,
      background: '#fff',
      borderRadius: 'var(--r-2xl)',
      padding: '28px 24px 22px',
      boxShadow: 'var(--shadow-pop)',
      textAlign: 'center',
      ...style
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 64,
      height: 64,
      borderRadius: '50%',
      background: tile,
      color: fg,
      fontSize: 32,
      marginBottom: 16
    }
  }, icon) : null, title ? /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 8px',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 22,
      color: 'var(--ink-900)'
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15,
      lineHeight: 1.5,
      color: 'var(--ink-600)'
    }
  }, children) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 22
    }
  }, actions) : null));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student-app/kit.jsx
try { (() => {
/* Lumio UI-kit primitives — self-contained recreations of the DS components,
   inline-styled so the kit renders without the compiled bundle. Window-exported. */
(function () {
  const I = ({
    n,
    w = 'bold',
    s,
    c,
    style
  }) => /*#__PURE__*/React.createElement("i", {
    className: `ph-${w} ph-${n}`,
    style: {
      fontSize: s,
      color: c,
      ...style
    }
  });

  /* Phone frame */
  function Phone({
    children,
    dark = false
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        width: 390,
        height: 844,
        borderRadius: 54,
        padding: 12,
        background: '#0E2A3D',
        boxShadow: '0 40px 80px rgba(14,42,61,.34), inset 0 0 0 2px rgba(255,255,255,.06)',
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 22,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 120,
        height: 30,
        background: '#0E2A3D',
        borderRadius: 18,
        zIndex: 50
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        height: '100%',
        borderRadius: 42,
        overflow: 'hidden',
        position: 'relative',
        background: dark ? '#0E2A3D' : 'var(--bg-app)'
      }
    }, children));
  }
  function StatusBar({
    tint = 'var(--ink-900)'
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 26px 6px',
        color: tint,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        flex: '0 0 auto'
      }
    }, /*#__PURE__*/React.createElement("span", null, "10:17"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 6,
        fontSize: 15
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "wifi-high",
      w: "bold"
    }), /*#__PURE__*/React.createElement(I, {
      n: "cell-signal-full",
      w: "bold"
    }), /*#__PURE__*/React.createElement(I, {
      n: "battery-high",
      w: "bold"
    })));
  }
  function Btn({
    children,
    variant = 'primary',
    size = 'md',
    block,
    onClick,
    iconBefore,
    style = {}
  }) {
    const sizes = {
      sm: {
        h: 42,
        px: 18,
        fs: 15,
        r: 16
      },
      md: {
        h: 54,
        px: 24,
        fs: 17,
        r: 22
      },
      lg: {
        h: 60,
        px: 28,
        fs: 18,
        r: 26
      }
    }[size];
    const pal = {
      primary: {
        bg: 'var(--coral-500)',
        fg: '#fff',
        clay: 'var(--clay-coral)',
        press: 'var(--clay-coral-press)'
      },
      secondary: {
        bg: '#fff',
        fg: 'var(--ink-900)',
        clay: 'var(--clay-white)',
        press: 'var(--clay-neutral-press)'
      },
      teal: {
        bg: 'var(--teal-500)',
        fg: '#fff',
        clay: 'var(--clay-teal)',
        press: '0 2px 0 var(--teal-700),0 6px 12px rgba(14,154,144,.28)'
      }
    }[variant];
    const [d, setD] = React.useState(false);
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      onPointerDown: () => setD(true),
      onPointerUp: () => setD(false),
      onPointerLeave: () => setD(false),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        height: sizes.h,
        padding: `0 ${sizes.px}px`,
        width: block ? '100%' : 'auto',
        border: 'none',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: sizes.fs,
        color: pal.fg,
        background: pal.bg,
        borderRadius: sizes.r,
        cursor: 'pointer',
        boxShadow: d ? pal.press : pal.clay,
        whiteSpace: 'nowrap',
        transform: d ? 'translateY(4px)' : 'translateY(0)',
        transition: 'all .12s var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
        ...style
      }
    }, iconBefore ? /*#__PURE__*/React.createElement(I, {
      n: iconBefore,
      w: "fill"
    }) : null, children);
  }
  function StatChip({
    icon,
    value,
    color = 'var(--amber-500)',
    style
  }) {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 40,
        padding: '0 14px',
        background: '#fff',
        borderRadius: 999,
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--line)',
        ...style
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: icon,
      w: "fill",
      s: 20,
      c: color
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 17,
        color: 'var(--ink-900)',
        lineHeight: 1
      }
    }, value));
  }
  function FeatureCard({
    title,
    subtitle,
    gradient,
    art,
    lip,
    onClick,
    h = 150
  }) {
    const [d, setD] = React.useState(false);
    return /*#__PURE__*/React.createElement("div", {
      onClick: onClick,
      onPointerDown: () => setD(true),
      onPointerUp: () => setD(false),
      onPointerLeave: () => setD(false),
      style: {
        position: 'relative',
        overflow: 'hidden',
        minHeight: h,
        padding: 22,
        background: gradient,
        borderRadius: 28,
        boxShadow: lip,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transform: d ? 'translateY(3px)' : 'translateY(0)',
        transition: 'transform .15s var(--ease-out)'
      }
    }, art ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: -4,
        top: 0,
        bottom: 0,
        width: '46%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        fontSize: 92,
        color: 'rgba(255,255,255,.5)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: art,
      w: "fill"
    })) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        zIndex: 1,
        maxWidth: art ? '64%' : '100%'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 29,
        lineHeight: 1.05,
        color: '#fff',
        letterSpacing: '-.01em',
        textShadow: '0 2px 8px rgba(14,42,61,.18)'
      }
    }, title), subtitle ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        display: 'inline-flex',
        alignItems: 'center',
        height: 42,
        padding: '0 18px',
        borderRadius: 999,
        background: 'rgba(255,255,255,.22)',
        color: '#fff',
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 14
      }
    }, subtitle) : null), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-900)',
        fontSize: 21,
        boxShadow: 'var(--shadow-card)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-up-right",
      w: "bold"
    })));
  }
  function LessonNode({
    label,
    percent = 0,
    state = 'locked',
    onClick,
    style
  }) {
    const st = {
      locked: {
        face: 'var(--bg-sunk)',
        text: 'var(--ink-400)',
        lip: '#D2DAE3',
        shadow: '0 6px 0 #D2DAE3,0 12px 22px rgba(14,42,61,.10)'
      },
      active: {
        face: '#fff',
        text: 'var(--ink-900)',
        shadow: '0 0 0 5px var(--coral-500),0 6px 0 #E2E8EF,0 16px 26px rgba(255,107,74,.28)'
      },
      done: {
        face: 'var(--teal-50)',
        text: 'var(--teal-700)',
        shadow: '0 6px 0 var(--teal-300),0 12px 22px rgba(14,154,144,.16)'
      }
    }[state];
    const [d, setD] = React.useState(false);
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      onPointerDown: () => setD(true),
      onPointerUp: () => setD(false),
      onPointerLeave: () => setD(false),
      style: {
        position: 'relative',
        width: 128,
        height: 128,
        padding: 16,
        border: 'none',
        background: st.face,
        borderRadius: 34,
        textAlign: 'left',
        cursor: 'pointer',
        boxShadow: st.shadow,
        transform: d ? 'translateY(3px)' : 'translateY(0)',
        transition: 'transform .12s var(--ease-out)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        WebkitTapHighlightColor: 'transparent',
        ...style
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 25,
        color: st.text,
        lineHeight: 1
      }
    }, percent, "%"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 18,
        color: st.text,
        lineHeight: 1
      }
    }, label), state === 'locked' ? /*#__PURE__*/React.createElement(I, {
      n: "lock-simple",
      w: "fill",
      s: 17,
      c: "var(--ink-400)",
      style: {
        position: 'absolute',
        top: 13,
        right: 13
      }
    }) : null, state === 'done' ? /*#__PURE__*/React.createElement(I, {
      n: "check-circle",
      w: "fill",
      s: 19,
      c: "var(--teal-500)",
      style: {
        position: 'absolute',
        top: 12,
        right: 12
      }
    }) : null);
  }
  function ListRow({
    icon,
    tone = 'grape',
    label,
    trailing,
    chevron = true,
    onClick
  }) {
    const tones = {
      grape: ['var(--grape-100)', 'var(--grape-600)'],
      coral: ['var(--coral-50)', 'var(--coral-600)'],
      amber: ['var(--amber-50)', 'var(--amber-600)'],
      teal: ['var(--teal-50)', 'var(--teal-600)'],
      ink: ['var(--ink-100)', 'var(--ink-700)']
    }[tone];
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 16px',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 22,
        boxShadow: 'var(--shadow-xs)',
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        width: 40,
        height: 40,
        borderRadius: 12,
        background: tones[0],
        color: tones[1],
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: icon,
      w: "fill"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 18,
        color: 'var(--ink-900)'
      }
    }, label), trailing, chevron ? /*#__PURE__*/React.createElement(I, {
      n: "caret-right",
      w: "bold",
      s: 20,
      c: "var(--ink-900)"
    }) : null);
  }
  function BottomNav({
    value,
    onChange
  }) {
    const items = [{
      v: 'home',
      label: 'Asosiy',
      icon: 'house'
    }, {
      v: 'lessons',
      label: 'Darslar',
      icon: 'path'
    }, {
      v: 'res',
      label: 'Resurslar',
      icon: 'books'
    }, {
      v: 'more',
      label: 'Ko‘proq',
      icon: 'squares-four'
    }];
    return /*#__PURE__*/React.createElement("nav", {
      style: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 14,
        height: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
        padding: '0 14px',
        background: 'rgba(255,255,255,.82)',
        backdropFilter: 'var(--blur-glass)',
        WebkitBackdropFilter: 'var(--blur-glass)',
        borderRadius: 34,
        boxShadow: '0 8px 24px rgba(14,42,61,.14)',
        border: '1px solid rgba(255,255,255,.6)',
        zIndex: 40
      }
    }, items.map(it => {
      const a = it.v === value;
      return /*#__PURE__*/React.createElement("button", {
        key: it.v,
        onClick: () => onChange(it.v),
        style: {
          flex: a ? '0 0 auto' : 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: a ? 56 : '100%',
          width: a ? 56 : 'auto',
          border: 'none',
          borderRadius: a ? '50%' : 16,
          background: a ? 'var(--coral-500)' : 'transparent',
          boxShadow: a ? '0 8px 18px rgba(255,107,74,.4)' : 'none',
          color: a ? '#fff' : 'var(--ink-400)',
          cursor: 'pointer',
          transition: 'all .2s var(--ease-out)',
          WebkitTapHighlightColor: 'transparent'
        }
      }, /*#__PURE__*/React.createElement(I, {
        n: it.icon,
        w: a ? 'fill' : 'regular',
        s: a ? 24 : 22
      }), !a ? /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-ui)',
          fontWeight: 700,
          fontSize: 12
        }
      }, it.label) : null);
    }));
  }
  function ScreenTitle({
    children,
    right
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 20px 14px'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 27,
        color: 'var(--ink-900)'
      }
    }, children), right);
  }
  function LeaveDialog({
    onStay,
    onLeave
  }) {
    return /*#__PURE__*/React.createElement("div", {
      onClick: e => e.target === e.currentTarget && onStay(),
      style: {
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(14,42,61,.48)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "lumio-pop-in",
      style: {
        width: '100%',
        maxWidth: 340,
        background: '#fff',
        borderRadius: 34,
        padding: '28px 24px 22px',
        boxShadow: 'var(--shadow-pop)',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'var(--danger-50)',
        color: 'var(--danger-500)',
        fontSize: 32,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "heart-break",
      w: "fill"
    })), /*#__PURE__*/React.createElement("h2", {
      style: {
        margin: '0 0 8px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: 'var(--ink-900)'
      }
    }, "Darsni tark etasizmi?"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--ink-600)'
      }
    }, "Joriy darsdagi yutuqlaringiz saqlanmaydi."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginTop: 22
      }
    }, /*#__PURE__*/React.createElement(Btn, {
      block: true,
      variant: "primary",
      onClick: onLeave
    }, "Ha, chiqish"), /*#__PURE__*/React.createElement(Btn, {
      block: true,
      variant: "secondary",
      onClick: onStay
    }, "Davom etish"))));
  }
  Object.assign(window, {
    I,
    Phone,
    StatusBar,
    Btn,
    StatChip,
    FeatureCard,
    LessonNode,
    ListRow,
    BottomNav,
    ScreenTitle,
    LeaveDialog
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student-app/kit.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student-app/learning-screens.jsx
try { (() => {
/* Lumio — learning-content screens: Vocabulary hub, Unit detail, Video lessons,
   Word flashcard, Homework exercise list. Self-contained; uses window.I + Btn. */
(function () {
  const {
    I,
    Btn
  } = window;
  const Hdr = ({
    title,
    onBack,
    info
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 18px 12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-900)',
      fontSize: 25,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(I, {
    n: "arrow-left",
    w: "bold"
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 22,
      color: 'var(--ink-900)'
    }
  }, title), info ? /*#__PURE__*/React.createElement("button", {
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-900)',
      fontSize: 24,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(I, {
    n: "info",
    w: "regular"
  })) : null);
  const Scroll = ({
    children,
    pb = 28
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflowY: 'auto',
      paddingBottom: pb
    }
  }, children);
  const CatCard = ({
    title,
    value,
    bg,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '20px 18px',
      textAlign: 'left',
      background: bg,
      border: 'none',
      borderRadius: 28,
      cursor: 'pointer',
      boxShadow: 'var(--shadow-sm)',
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 23,
      color: 'var(--ink-900)',
      lineHeight: 1.15
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: '0 0 auto',
      minWidth: 60,
      height: 56,
      padding: '0 14px',
      borderRadius: 16,
      background: 'rgba(255,255,255,.72)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 24,
      color: 'var(--ink-900)'
    }
  }, value));
  const Frac = ({
    kind,
    e,
    t
  }) => {
    const c = kind === 'coin' ? 'var(--amber-400)' : 'var(--success-500)';
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 30,
        padding: '0 11px 0 7px',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 999,
        boxShadow: 'var(--shadow-xs)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: kind === 'coin' ? 'coin' : 'star',
      w: "fill",
      s: 17,
      c: c
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 14,
        color: 'var(--ink-900)'
      }
    }, e, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-400)'
      }
    }, "/", t)));
  };

  /* ---------- VOCABULARY HUB (Mening lug'atim) ---------- */
  function VocabScreen({
    back,
    go
  }) {
    const [range, setRange] = React.useState('7 kun');
    const W = 300,
      H = 150,
      pad = 24;
    const labels = ['Shan', 'Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju'];
    const s1 = [0, 0, 0, 0, 0, 0, 0];
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Hdr, {
      title: "Mening lug\u2018atim",
      onBack: back
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(CatCard, {
      title: "O\u2018rganilayotgan so\u2018zlar",
      value: "0",
      bg: "var(--sky-100)",
      onClick: () => go('newwords')
    }), /*#__PURE__*/React.createElement(CatCard, {
      title: "Yangi so\u2018zlar",
      value: "0",
      bg: "#FCE0EE",
      onClick: () => go('newwords')
    }), /*#__PURE__*/React.createElement(CatCard, {
      title: "Barcha so\u2018zlar",
      value: "0",
      bg: "#F4E7CB",
      onClick: () => go('newwords')
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--bg-tint)',
        border: '1px solid var(--line)',
        borderRadius: 28,
        padding: 16,
        marginTop: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4,
        padding: 5,
        background: '#fff',
        borderRadius: 999,
        boxShadow: 'var(--inset-soft)',
        marginBottom: 16
      }
    }, ['7 kun', '1 oy', '6 oy', '1 yil'].map(r => /*#__PURE__*/React.createElement("button", {
      key: r,
      onClick: () => setRange(r),
      style: {
        flex: 1,
        height: 34,
        border: 'none',
        borderRadius: 999,
        background: range === r ? 'var(--coral-50)' : 'transparent',
        color: range === r ? 'var(--coral-600)' : 'var(--ink-500)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 13.5,
        cursor: 'pointer',
        boxShadow: range === r ? 'var(--shadow-xs)' : 'none'
      }
    }, r))), /*#__PURE__*/React.createElement("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      style: {
        display: 'block',
        overflow: 'visible'
      }
    }, [0, 0.25, 0.5, 0.75, 1].map((g, i) => /*#__PURE__*/React.createElement("line", {
      key: i,
      x1: pad,
      x2: W - 6,
      y1: 10 + g * (H - 36),
      y2: 10 + g * (H - 36),
      stroke: "var(--line)",
      strokeWidth: "1",
      strokeDasharray: "4 5"
    })), /*#__PURE__*/React.createElement("line", {
      x1: pad,
      x2: pad,
      y1: 10,
      y2: H - 26,
      stroke: "var(--ink-800)",
      strokeWidth: "2"
    }), labels.map((l, i) => /*#__PURE__*/React.createElement("text", {
      key: i,
      x: pad + i * (W - pad - 6) / 6,
      y: H - 8,
      textAnchor: "middle",
      fontFamily: "Nunito",
      fontWeight: "700",
      fontSize: "10",
      fill: "var(--ink-400)"
    }, l))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--line)'
      }
    }, [['0', 'Yangi so‘zlar', 'var(--sky-500)'], ['0', 'O‘rganilayotgan so‘zlar', 'var(--amber-500)']].map(([v, l, c]) => /*#__PURE__*/React.createElement("div", {
      key: l,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        color: 'var(--ink-700)',
        minWidth: 18
      }
    }, v), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 18,
        height: 18,
        borderRadius: 5,
        background: c
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--ink-600)'
      }
    }, l)))))));
  }

  /* ---------- NEW WORDS EMPTY STATE (numbered steps) ---------- */
  function NewWordsScreen({
    back,
    go
  }) {
    const steps = ['Darslikdan yangi so‘zlar qo‘shing — ular shu yerda saqlanadi.', 'So‘zlarni o‘rganishni boshlasangiz, ular “O‘rganilayotgan so‘zlar” bo‘limida saqlanadi.', 'To‘liq o‘zlashtirilgan so‘zlar “Hamma so‘zlar” bo‘limiga o‘tadi.'];
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Hdr, {
      title: "Yangi so\u2018zlar",
      onBack: back,
      info: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 27,
        color: 'var(--ink-900)',
        margin: '18px 24px 26px'
      }
    }, "Sizda hali so\u2018zlar yo\u2018q"), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 18px'
      }
    }, steps.map((s, i) => {
      const left = i % 2 === 0;
      const last = i === steps.length - 1;
      const TILE = 78,
        OFF = 2,
        CENTER = OFF + TILE / 2,
        BLOCK = 132,
        LAST = 84;
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          position: 'relative',
          height: last ? LAST : BLOCK
        }
      }, !last ? /*#__PURE__*/React.createElement("span", {
        "aria-hidden": "true",
        style: {
          position: 'absolute',
          top: OFF + TILE,
          height: BLOCK - TILE,
          left: CENTER,
          right: CENTER,
          borderBottom: '3px dashed var(--grape-400)',
          borderLeft: left ? '3px dashed var(--grape-400)' : 'none',
          borderRight: left ? 'none' : '3px dashed var(--grape-400)',
          borderBottomLeftRadius: left ? 18 : 0,
          borderBottomRightRadius: left ? 0 : 18,
          opacity: .7
        }
      }) : null, /*#__PURE__*/React.createElement("span", {
        style: {
          position: 'absolute',
          top: OFF,
          left: left ? OFF : 'auto',
          right: left ? 'auto' : OFF,
          width: TILE,
          height: TILE,
          borderRadius: 24,
          background: 'var(--grape-400)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 32,
          boxShadow: '0 6px 0 var(--grape-600), 0 12px 20px rgba(14,42,61,.14)',
          zIndex: 1
        }
      }, i + 1), /*#__PURE__*/React.createElement("span", {
        style: {
          position: 'absolute',
          top: OFF + TILE / 2,
          transform: 'translateY(-50%)',
          left: left ? OFF + TILE + 16 : OFF,
          right: left ? OFF : OFF + TILE + 16,
          background: 'var(--bg-tint)',
          border: '1px solid var(--line)',
          borderRadius: 22,
          padding: '14px 16px',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 15.5,
          color: 'var(--ink-700)',
          lineHeight: 1.4
        }
      }, s));
    })));
  }

  /* ---------- UNIT DETAIL (Unit 1.1 → Video / Vocabulary / Homework) ---------- */
  function UnitScreen({
    back,
    go
  }) {
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Hdr, {
      title: "Unit 1.1",
      onBack: back
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(CatCard, {
      title: "Video",
      value: "0%",
      bg: "var(--grape-100)",
      onClick: () => go('video')
    }), /*#__PURE__*/React.createElement(CatCard, {
      title: "Vocabulary",
      value: "0%",
      bg: "#CFF3D8",
      onClick: () => go('word')
    }), /*#__PURE__*/React.createElement(CatCard, {
      title: "Homework Compulsory",
      value: "0%",
      bg: "#FFE3C2",
      onClick: () => go('homework')
    })));
  }

  /* ---------- VIDEO LESSONS (1-video / 2-video) ---------- */
  function VideoListScreen({
    back,
    go
  }) {
    const Block = ({
      title,
      vt,
      mt
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 28,
        padding: 18,
        boxShadow: 'var(--clay-white)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--ink-900)',
        marginBottom: 14
      }
    }, title), [['Video', vt], ['Mashq', mt]].map(([lbl, t]) => /*#__PURE__*/React.createElement("div", {
      key: lbl,
      style: {
        background: 'var(--bg-tint)',
        borderRadius: 16,
        padding: '12px 14px',
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        color: 'var(--ink-900)'
      }
    }, lbl, ":"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement(Frac, {
      kind: "star",
      e: 0,
      t: t
    }), /*#__PURE__*/React.createElement(Frac, {
      kind: "coin",
      e: 0,
      t: t
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 12,
        background: '#fff',
        borderRadius: 999,
        boxShadow: 'var(--inset-soft)'
      }
    }))), /*#__PURE__*/React.createElement(Btn, {
      block: true,
      size: "lg",
      onClick: () => go('word'),
      iconBefore: "play"
    }, "Videoni ko\u2018rish"));
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Hdr, {
      title: "Video",
      onBack: back
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(Block, {
      title: "1-video",
      vt: 1,
      mt: 10
    }), /*#__PURE__*/React.createElement(Block, {
      title: "2-video",
      vt: 1,
      mt: 4
    })));
  }

  /* ---------- WORD FLASHCARD (Mavzuga qaytish) ---------- */
  function WordScreen({
    back,
    go
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)'
      }
    }, /*#__PURE__*/React.createElement(Hdr, {
      title: "Mavzuga qaytish",
      onBack: back
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '8px 18px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 22,
        padding: 20,
        boxShadow: 'var(--shadow-card)',
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 30
      }
    }, "\uD83C\uDDEC\uD83C\uDDE7"), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 21,
        color: 'var(--ink-900)'
      }
    }, "Olmosh")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 30,
        color: 'var(--ink-900)'
      }
    }, "you"), /*#__PURE__*/React.createElement("button", {
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--sky-500)',
        fontSize: 26,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "speaker-high",
      w: "fill"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 18,
        color: 'var(--ink-500)',
        marginBottom: 16
      }
    }, "/ju\u02D0/"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontStyle: 'italic',
        fontSize: 18,
        color: 'var(--ink-800)',
        lineHeight: 1.35
      }
    }, "\u201CHello. Are you Angela?\u201D"), /*#__PURE__*/React.createElement("button", {
      style: {
        flex: '0 0 auto',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 'none',
        background: 'var(--grape-100)',
        color: 'var(--grape-600)',
        cursor: 'pointer',
        fontSize: 22,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "translate",
      w: "bold"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 22,
        padding: 20,
        boxShadow: 'var(--shadow-card)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 30,
        display: 'block',
        marginBottom: 16
      }
    }, "\uD83C\uDDFA\uD83C\uDDFF"), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 30,
        color: 'var(--ink-900)'
      }
    }, "siz, sen"))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '12px 18px 22px'
      }
    }, /*#__PURE__*/React.createElement(Btn, {
      block: true,
      size: "lg",
      variant: "primary",
      onClick: () => go('homework'),
      iconAfter: "arrow-right"
    }, "Keyingi")));
  }

  /* ---------- HOMEWORK EXERCISE LIST ---------- */
  function HomeworkScreen({
    back,
    go
  }) {
    const Ex = ({
      type,
      skill,
      instruction,
      st,
      pct
    }) => /*#__PURE__*/React.createElement("button", {
      onClick: () => go('fillblank'),
      style: {
        width: '100%',
        textAlign: 'left',
        display: 'block',
        padding: 18,
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 22,
        boxShadow: 'var(--shadow-card)',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-start'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        height: 30,
        padding: '0 14px',
        borderRadius: 999,
        background: 'var(--success-500)',
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 14,
        display: 'inline-flex',
        alignItems: 'center'
      }
    }, type), /*#__PURE__*/React.createElement("span", {
      style: {
        height: 28,
        padding: '0 14px',
        borderRadius: 999,
        background: 'var(--amber-500)',
        color: 'var(--ink-900)',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 12.5,
        letterSpacing: '.04em',
        display: 'inline-flex',
        alignItems: 'center'
      }
    }, skill)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        alignItems: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(Frac, {
      kind: "star",
      e: 0,
      t: st
    }), /*#__PURE__*/React.createElement(Frac, {
      kind: "coin",
      e: 0,
      t: st
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        margin: '14px 0',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 18,
        color: 'var(--ink-900)',
        lineHeight: 1.3
      }
    }, instruction), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 10,
        background: 'var(--amber-50)',
        borderRadius: 999,
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: pct + '%',
        height: '100%',
        background: 'var(--amber-500)',
        borderRadius: 999
      }
    })), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 14,
        color: 'var(--amber-600)',
        minWidth: 38,
        textAlign: 'right'
      }
    }, pct, "%")));
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(Hdr, {
      title: "Homework Compulsory",
      onBack: back
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement(Ex, {
      type: "Choose Answer",
      skill: "LISTENING",
      instruction: "Complete the conversations with the correct word",
      st: 10,
      pct: 0
    }), /*#__PURE__*/React.createElement(Ex, {
      type: "Choose Answer",
      skill: "GRAMMAR",
      instruction: "Choose the correct answer and complete the given sentences",
      st: 4,
      pct: 0
    }), /*#__PURE__*/React.createElement(Ex, {
      type: "Construct",
      skill: "GRAMMAR",
      instruction: "Rearrange the words to make sentences or question",
      st: 6,
      pct: 0
    })));
  }

  /* ---------- FILL-IN-THE-BLANK + audio + answer sheet ---------- */
  function FillBlankScreen({
    back
  }) {
    const [playing, setPlaying] = React.useState(false);
    const [speed, setSpeed] = React.useState(1);
    const [picks, setPicks] = React.useState({});
    const [active, setActive] = React.useState(null);
    const rows = [[1, 'Alisa'], [2, 'Adam.'], [3, 'Bob.']];
    const opts = ['Good', 'No', 'Hello'];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 18px 10px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-900)',
        fontSize: 25,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 12,
        background: 'var(--bg-sunk)',
        borderRadius: 999,
        boxShadow: 'var(--inset-soft)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '20%',
        height: '100%',
        background: 'var(--coral-500)',
        borderRadius: 999
      }
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        margin: '4px 18px 0',
        background: 'var(--bg-sunk)',
        borderRadius: 22,
        padding: '16px 18px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        height: 8,
        background: 'var(--ink-200)',
        borderRadius: 999,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '50%',
        height: '100%',
        background: 'var(--ink-800)',
        borderRadius: 999
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--ink-900)',
        boxShadow: '0 2px 5px rgba(14,42,61,.3)'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 13,
        color: 'var(--ink-700)',
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("span", null, "00:15"), /*#__PURE__*/React.createElement("span", null, "00:30")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-800)',
        fontSize: 24,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "speaker-high",
      w: "fill"
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => setPlaying(!playing),
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-800)',
        fontSize: 28,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: playing ? 'pause' : 'play',
      w: "fill"
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 0.75 : 1),
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-800)',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16
      }
    }, speed.toFixed(speed % 1 ? 2 : 1), "x"))), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 21,
        color: 'var(--ink-900)',
        margin: '16px 24px 14px',
        lineHeight: 1.25
      }
    }, "Suhbatni to\u2018g\u2018ri so\u2018zlar bilan to\u2018ldiring"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, rows.map(([n, name]) => /*#__PURE__*/React.createElement("div", {
      key: n,
      style: {
        position: 'relative',
        background: 'var(--bg-sunk)',
        borderRadius: 18,
        padding: '18px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: 8,
        left: 10,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 13,
        color: 'var(--ink-400)'
      }
    }, n), /*#__PURE__*/React.createElement("button", {
      onClick: () => setActive(n),
      style: {
        width: 84,
        height: 44,
        borderRadius: 12,
        border: `2px solid ${active === n ? 'var(--coral-500)' : 'var(--ink-300)'}`,
        background: '#fff',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        color: 'var(--ink-900)'
      }
    }, picks[n] || ''), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 18,
        color: 'var(--ink-900)'
      }
    }, ", I'm ", name)))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        boxShadow: '0 -8px 30px rgba(14,42,61,.14)',
        padding: '16px 18px calc(20px + env(safe-area-inset-bottom))'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, opts.map(o => /*#__PURE__*/React.createElement("button", {
      key: o,
      onClick: () => {
        if (active) setPicks({
          ...picks,
          [active]: o
        });
      },
      style: {
        height: 52,
        border: '1px solid var(--line)',
        borderRadius: 16,
        background: '#fff',
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 17,
        color: 'var(--ink-900)',
        boxShadow: 'var(--shadow-xs)'
      }
    }, o)))));
  }
  Object.assign(window, {
    VocabScreen,
    NewWordsScreen,
    UnitScreen,
    VideoListScreen,
    WordScreen,
    HomeworkScreen,
    FillBlankScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student-app/learning-screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student-app/more-screens.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Lumio — chat, leaderboard, profile & battle screens. Uses window.I + Btn from kit.jsx. */
(function () {
  const {
    I,
    Btn
  } = window;
  const Av = ({
    name = '',
    size = 44,
    bg = 'var(--grape-100)',
    fg = 'var(--grape-600)'
  }) => {
    const ini = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return /*#__PURE__*/React.createElement("span", {
      style: {
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        flex: '0 0 auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: size * 0.38
      }
    }, ini || '?');
  };
  const HeaderBar = ({
    title,
    onBack,
    tint = 'var(--ink-900)',
    right
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '6px 18px 12px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: tint,
      fontSize: 25,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(I, {
    n: "arrow-left",
    w: "bold"
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      flex: 1,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 22,
      color: tint
    }
  }, title), right);

  /* ---------- CHAT LIST ---------- */
  const CONVOS = [{
    id: 'asror',
    name: 'Asrorbek Abrayev',
    preview: 'Zo‘r, Jang qilamiz!',
    time: '10:14',
    unread: 2,
    online: true,
    bg: 'var(--coral-100)',
    fg: 'var(--coral-600)'
  }, {
    id: 'guli',
    name: 'Guli Mag‘rufovna',
    preview: 'Rahmat! 👍',
    time: 'Kecha',
    unread: 0,
    bg: 'var(--teal-100)',
    fg: 'var(--teal-600)'
  }, {
    id: 'grp',
    name: 'Beginner 1 guruhi',
    preview: 'Ismoil: Uy vazifasi-chi?',
    time: 'Du',
    unread: 5,
    bg: 'var(--amber-100)',
    fg: 'var(--amber-700)'
  }, {
    id: 'farid',
    name: 'Faridun Sobirov',
    preview: 'Ko‘rishguncha!',
    time: 'Sesh',
    unread: 0,
    bg: 'var(--grape-100)',
    fg: 'var(--grape-600)'
  }];
  function ChatListScreen({
    back,
    open
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement(HeaderBar, {
      title: "Suhbatlar",
      onBack: back,
      right: /*#__PURE__*/React.createElement("button", {
        style: {
          border: 'none',
          background: 'var(--ink-100)',
          width: 40,
          height: 40,
          borderRadius: '50%',
          cursor: 'pointer',
          color: 'var(--ink-700)',
          fontSize: 20
        }
      }, /*#__PURE__*/React.createElement(I, {
        n: "magnifying-glass",
        w: "bold"
      }))
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, CONVOS.map(c => /*#__PURE__*/React.createElement("button", {
      key: c.id,
      onClick: () => open(c),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '12px 14px',
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 22,
        boxShadow: 'var(--shadow-xs)',
        cursor: 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(Av, {
      name: c.name,
      size: 50,
      bg: c.bg,
      fg: c.fg
    }), c.online ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: 1,
        bottom: 1,
        width: 13,
        height: 13,
        borderRadius: '50%',
        background: 'var(--success-500)',
        border: '2px solid #fff'
      }
    }) : null), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'baseline'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 17,
        color: 'var(--ink-900)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, c.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 12,
        color: 'var(--ink-400)',
        flex: '0 0 auto'
      }
    }, c.time)), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        alignItems: 'center',
        marginTop: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: c.unread ? 700 : 600,
        fontSize: 14,
        color: c.unread ? 'var(--ink-700)' : 'var(--ink-500)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, c.preview), c.unread ? /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        minWidth: 22,
        height: 22,
        padding: '0 7px',
        borderRadius: 999,
        background: 'var(--coral-500)',
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, c.unread) : null))))));
  }

  /* ---------- CHAT THREAD ---------- */
  const Bubble = ({
    side,
    name,
    time,
    children
  }) => {
    const me = side === 'me';
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: me ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        alignSelf: me ? 'flex-end' : 'flex-start'
      }
    }, name && !me ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 800,
        fontSize: 12,
        color: 'var(--grape-600)',
        margin: '0 0 3px 14px'
      }
    }, name) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '11px 15px',
        background: me ? 'var(--coral-500)' : '#fff',
        color: me ? '#fff' : 'var(--ink-900)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 15.5,
        lineHeight: 1.4,
        borderRadius: 20,
        borderBottomRightRadius: me ? 6 : 20,
        borderBottomLeftRadius: me ? 20 : 6,
        boxShadow: me ? '0 4px 12px rgba(255,107,74,.28)' : 'var(--shadow-sm)',
        border: me ? 'none' : '1px solid var(--line)'
      }
    }, children), time ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 11,
        color: 'var(--ink-400)',
        margin: me ? '4px 6px 0 0' : '4px 0 0 6px'
      }
    }, time) : null);
  };
  function ChatThreadScreen({
    back,
    peer,
    openPeer
  }) {
    const grp = peer.id === 'grp';
    const [msgs, setMsgs] = React.useState([{
      s: 'them',
      n: grp ? 'Ismoil' : peer.name,
      t: '10:12',
      x: 'Salom! Bugun mashq qilamizmi?'
    }, {
      s: 'me',
      t: '10:13',
      x: 'Albatta, 5 daqiqada tayyorman 💪'
    }, {
      s: 'them',
      n: grp ? 'Ismoil' : peer.name,
      t: '10:14',
      x: 'Zo‘r — Jang qilamiz!'
    }]);
    const [text, setText] = React.useState('');
    const endRef = React.useRef(null);
    React.useEffect(() => {
      if (endRef.current) endRef.current.parentNode.scrollTop = endRef.current.offsetTop + 999;
    }, [msgs]);
    const send = () => {
      const t = text.trim();
      if (!t) return;
      try {
        window.LumioSound.unlock();
        window.LumioSound.play('message');
      } catch (e) {}
      setMsgs([...msgs, {
        s: 'me',
        t: '10:15',
        x: t
      }]);
      setText('');
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '6px 16px 12px',
        background: '#fff',
        borderBottom: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-900)',
        fontSize: 25,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(Av, {
      name: peer.name,
      size: 42,
      bg: peer.bg,
      fg: peer.fg
    }), peer.online ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 11,
        height: 11,
        borderRadius: '50%',
        background: 'var(--success-500)',
        border: '2px solid #fff'
      }
    }) : null), /*#__PURE__*/React.createElement("span", {
      onClick: () => !grp && openPeer && openPeer({
        name: peer.name,
        bg: peer.bg,
        fg: peer.fg,
        online: peer.online
      }),
      style: {
        flex: 1,
        cursor: grp ? 'default' : 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 17,
        color: 'var(--ink-900)'
      }
    }, peer.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 12,
        color: peer.online ? 'var(--success-600)' : 'var(--ink-400)'
      }
    }, peer.online ? 'Onlayn' : grp ? '12 a‘zo' : 'Yaqinda ko‘rdi')), /*#__PURE__*/React.createElement("button", {
      style: {
        border: 'none',
        background: 'var(--ink-100)',
        width: 38,
        height: 38,
        borderRadius: '50%',
        cursor: 'pointer',
        color: 'var(--ink-700)',
        fontSize: 19
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "phone",
      w: "fill"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        alignSelf: 'center',
        background: 'var(--ink-100)',
        color: 'var(--ink-500)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 12,
        padding: '5px 12px',
        borderRadius: 999
      }
    }, "Bugun"), msgs.map((m, i) => /*#__PURE__*/React.createElement(Bubble, {
      key: i,
      side: m.s,
      name: m.n,
      time: m.t
    }, m.x)), /*#__PURE__*/React.createElement("div", {
      ref: endRef
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        padding: '10px 14px',
        background: 'rgba(255,255,255,.95)',
        borderTop: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding: '0 8px 0 16px',
        background: 'var(--bg-app)',
        borderRadius: 26,
        border: '1px solid var(--line)'
      }
    }, /*#__PURE__*/React.createElement("input", {
      value: text,
      placeholder: "Xabar yozing\u2026",
      onChange: e => setText(e.target.value),
      onKeyDown: e => e.key === 'Enter' && send(),
      style: {
        flex: 1,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        padding: '12px 0',
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 15.5,
        color: 'var(--ink-900)',
        minWidth: 0
      }
    }), /*#__PURE__*/React.createElement("button", {
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-400)',
        fontSize: 22,
        padding: 6
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "paperclip",
      w: "bold"
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: send,
      style: {
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: 'none',
        background: 'var(--coral-500)',
        color: '#fff',
        fontSize: 22,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 14px rgba(255,107,74,.4)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "paper-plane-right",
      w: "fill"
    }))));
  }

  /* ---------- LEADERBOARD ---------- */
  const LB = [{
    r: 1,
    n: 'Aliyor Sarmanov',
    xp: '10722',
    bg: 'var(--grape-100)',
    fg: 'var(--grape-600)'
  }, {
    r: 2,
    n: 'Faridun Sobirov',
    xp: '10004',
    bg: 'var(--teal-100)',
    fg: 'var(--teal-600)'
  }, {
    r: 3,
    n: 'Guli Mag‘rufovna',
    xp: '9069',
    bg: 'var(--coral-100)',
    fg: 'var(--coral-600)'
  }, {
    r: 4,
    n: 'Farruxjon Sattarov',
    xp: '8536',
    bg: 'var(--amber-100)',
    fg: 'var(--amber-700)'
  }, {
    r: 5,
    n: 'Shabbona Axmanova',
    xp: '8414',
    bg: 'var(--sky-100)',
    fg: 'var(--sky-600)'
  }, {
    r: 6,
    n: 'Doniyor Qosimov',
    xp: '7980',
    bg: 'var(--grape-100)',
    fg: 'var(--grape-600)'
  }];
  function Star({
    v
  }) {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 12px',
        background: 'var(--surface-tint)',
        border: '1px solid var(--line)',
        borderRadius: 999
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "star",
      w: "fill",
      s: 17,
      c: "var(--amber-500)"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        color: 'var(--ink-900)'
      }
    }, v));
  }
  function LeaderboardScreen({
    back,
    openPeer
  }) {
    const [lvl, setLvl] = React.useState('Beginner');
    const Row = ({
      r,
      n,
      xp,
      bg,
      fg,
      hl
    }) => /*#__PURE__*/React.createElement("button", {
      onClick: () => !hl && openPeer && openPeer({
        name: n,
        xp,
        bg,
        fg,
        rank: r
      }),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: '#fff',
        borderRadius: 22,
        border: hl ? '2px solid var(--coral-500)' : '1px solid var(--line)',
        boxShadow: hl ? '0 8px 20px rgba(255,107,74,.18)' : 'var(--shadow-xs)',
        cursor: hl ? 'default' : 'pointer',
        textAlign: 'left',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 30,
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        color: r <= 3 ? 'var(--coral-500)' : 'var(--ink-500)'
      }
    }, r), /*#__PURE__*/React.createElement(Av, {
      name: n,
      size: 42,
      bg: bg,
      fg: fg
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 16.5,
        color: 'var(--ink-900)',
        lineHeight: 1.15
      }
    }, n), /*#__PURE__*/React.createElement(Star, {
      v: xp
    }));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-warm)',
        padding: '6px 18px 16px',
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: '#fff',
        fontSize: 25,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 21,
        color: '#fff'
      }
    }, "Peshqadamlar jadvali")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement(Av, {
      name: "jack",
      size: 48,
      bg: "rgba(255,255,255,.25)",
      fg: "#fff"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 19,
        color: '#fff'
      }
    }, "jack"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#fff',
        color: 'var(--coral-600)',
        borderRadius: 999,
        padding: '4px 14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 13
      }
    }, "Beginner"), /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#fff',
        borderRadius: 999,
        padding: '4px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "star",
      w: "fill",
      s: 15,
      c: "var(--amber-500)"
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        color: 'var(--ink-900)'
      }
    }, "202")))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        marginTop: 14,
        paddingBottom: 2
      }
    }, ['Starter', 'Beginner', 'Elementary', 'Pre-Intermediate'].map(t => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: () => setLvl(t),
      style: {
        flex: '0 0 auto',
        height: 38,
        padding: '0 16px',
        border: 'none',
        borderRadius: 999,
        background: lvl === t ? '#fff' : 'transparent',
        color: lvl === t ? 'var(--ink-900)' : 'rgba(255,255,255,.85)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 14,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: lvl === t ? 'var(--shadow-sm)' : 'none'
      }
    }, t)))), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Row, {
      r: 73764,
      n: "jack",
      xp: "202",
      bg: "var(--ink-100)",
      fg: "var(--ink-500)",
      hl: true
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4
      }
    }), LB.map(p => /*#__PURE__*/React.createElement(Row, _extends({
      key: p.r
    }, p)))));
  }

  /* ---------- PROFILE (Akkaunt) ---------- */
  function ProfileScreen({
    back,
    go
  }) {
    const Stat = ({
      k,
      v
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 13,
        color: 'var(--ink-500)'
      }
    }, k), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 26,
        color: 'var(--ink-900)'
      }
    }, v));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        paddingBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-warm)',
        padding: '6px 18px 22px',
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: '#fff',
        fontSize: 25,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 21,
        color: '#fff'
      }
    }, "Akkaunt"), /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'rgba(255,255,255,.95)',
        borderRadius: 999,
        padding: '6px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "star",
      w: "fill",
      s: 17,
      c: "var(--amber-500)"
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 15,
        color: 'var(--ink-900)'
      }
    }, "9069"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement(Av, {
      name: "Guli M",
      size: 64,
      bg: "rgba(255,255,255,.25)",
      fg: "#fff"
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: '#fff'
      }
    }, "Guli Mag\u2018rufovna"), /*#__PURE__*/React.createElement("button", {
      onClick: () => go('chatlist'),
      style: {
        border: 'none',
        background: 'rgba(255,255,255,.95)',
        width: 44,
        height: 44,
        borderRadius: '50%',
        cursor: 'pointer',
        color: 'var(--coral-600)',
        fontSize: 21
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "chat-circle-dots",
      w: "fill"
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-cool)',
        borderRadius: 26,
        padding: 22,
        boxShadow: 'var(--clay-sky)',
        position: 'relative',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 28,
        color: '#fff'
      }
    }, "Beginner 3"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        marginTop: 10,
        background: '#fff',
        color: 'var(--sky-600)',
        borderRadius: 999,
        padding: '7px 16px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 14
      }
    }, "Hozirgi daraja"), /*#__PURE__*/React.createElement(I, {
      n: "plant",
      w: "fill",
      s: 70,
      c: "rgba(255,255,255,.5)",
      style: {
        position: 'absolute',
        right: 16,
        bottom: 8
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        background: 'var(--bg-tint)',
        borderRadius: 999,
        padding: '8px 16px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        color: 'var(--ink-900)'
      }
    }, "Jang statistikasi"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      k: "Janglar:",
      v: "551"
    }), /*#__PURE__*/React.createElement(Stat, {
      k: "Yutuqlar:",
      v: "531"
    }), /*#__PURE__*/React.createElement(Stat, {
      k: "Mag\u2018lubiyat:",
      v: "20"
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: () => {},
      style: {
        width: '100%',
        textAlign: 'left',
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 17,
        color: 'var(--ink-900)'
      }
    }, "Sertifikatlar ro\u2018yxati"), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'var(--bg-tint)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-900)',
        fontSize: 19
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-up-right",
      w: "bold"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 17,
        color: 'var(--ink-900)',
        marginBottom: 14
      }
    }, "Medallar"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 14
      }
    }, [['var(--amber-500)', 'trophy'], ['var(--grape-500)', 'medal'], ['var(--teal-500)', 'crown-simple'], ['var(--coral-500)', 'lightning']].map(([c, ic], i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        width: 58,
        height: 58,
        borderRadius: 18,
        background: c,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        boxShadow: `0 6px 0 rgba(0,0,0,.12)`
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: ic,
      w: "fill"
    })))))));
  }

  /* ---------- BATTLE RESULT (Jang natijasi) ---------- */
  const Confetti = () => {
    const cs = ['#FF6B4A', '#FFB02E', '#14B8AC', '#8B5CF6', '#2E97FF'];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none'
      }
    }, Array.from({
      length: 26
    }).map((_, i) => {
      const left = i * 37 % 100;
      return /*#__PURE__*/React.createElement("span", {
        key: i,
        style: {
          position: 'absolute',
          left: left + '%',
          top: -12,
          width: 8,
          height: 12,
          background: cs[i % cs.length],
          borderRadius: 2,
          animation: `lumio-confetti ${1000 + i * 53 % 700}ms var(--ease-out) ${i * 40 % 500}ms both`
        }
      });
    }));
  };
  function RPill({
    kind,
    icon,
    value,
    filled
  }) {
    const c = {
      correct: 'var(--success-500)',
      wrong: 'var(--danger-500)',
      star: 'var(--amber-500)',
      time: 'var(--sky-500)'
    }[kind];
    return /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 36,
        padding: '0 6px',
        borderRadius: 999,
        background: filled ? 'rgba(255,255,255,.24)' : '#fff',
        boxShadow: filled ? 'none' : 'var(--shadow-xs)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: c,
        color: '#fff',
        fontSize: 13,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: icon,
      w: "bold"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        paddingRight: 8,
        color: filled ? '#fff' : 'var(--ink-900)'
      }
    }, value));
  }
  function BattleResultScreen({
    back
  }) {
    React.useEffect(() => {
      try {
        window.LumioSound.unlock();
        window.LumioSound.play('win');
      } catch (e) {}
    }, []);
    const ans = [['They want to see me but', 'I', "don’t want to see", 'them'], ['', 'Is it going', 'to rain?'], ['My grandparents had a/an', 'difficult', 'childhood']];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        padding: '8px 20px 12px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--ink-900)'
      }
    }, "Jang natijasi"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "lumio-bounce-in",
      style: {
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg,#FFCB5C 0%,#FFB02E 100%)',
        borderRadius: 24,
        padding: 18,
        boxShadow: 'var(--clay-amber)'
      }
    }, /*#__PURE__*/React.createElement(Confetti, null), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 14,
        color: 'var(--ink-800)'
      }
    }, "G\u2018olib!"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 28,
        color: 'var(--ink-900)',
        margin: '2px 0 12px'
      }
    }, "jack"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(RPill, {
      kind: "correct",
      icon: "check",
      value: "10",
      filled: true
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "wrong",
      icon: "x",
      value: "0",
      filled: true
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "star",
      icon: "star",
      value: "1",
      filled: true
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "time",
      icon: "clock",
      value: "1m 43s",
      filled: true
    })))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--coral-50)',
        borderRadius: 24,
        padding: 18
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 14,
        color: 'var(--ink-500)'
      }
    }, "2-o\u2018rin"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: 'var(--ink-900)',
        margin: '2px 0 12px'
      }
    }, "Ismoil Khakimjonov"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement(RPill, {
      kind: "correct",
      icon: "check",
      value: "7"
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "wrong",
      icon: "x",
      value: "3"
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "star",
      icon: "star",
      value: "0"
    }), /*#__PURE__*/React.createElement(RPill, {
      kind: "time",
      icon: "clock",
      value: "3m 20s"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 19,
        color: 'var(--ink-900)',
        marginTop: 2
      }
    }, "Sizning javoblaringiz:"), ans.map((parts, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        background: 'var(--success-50)',
        borderRadius: 18,
        padding: '16px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 17,
        color: 'var(--ink-900)',
        lineHeight: 1.5
      }
    }, parts.map((p, j) => p === '' ? null : j % 2 === 1 ? /*#__PURE__*/React.createElement("span", {
      key: j,
      style: {
        background: 'var(--success-500)',
        color: '#fff',
        borderRadius: 10,
        padding: '4px 12px'
      }
    }, p) : /*#__PURE__*/React.createElement("span", {
      key: j
    }, p))))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '12px 18px 22px'
      }
    }, /*#__PURE__*/React.createElement(Btn, {
      block: true,
      variant: "teal",
      onClick: back
    }, "Ortga qaytish")));
  }

  /* ---------- NOTIFICATIONS (Bildirishnomalar) ---------- */
  function NotifItem({
    type = 'system',
    icon,
    title,
    body,
    time,
    read = false,
    isNew = false,
    priority = false,
    onClick
  }) {
    const tones = {
      achievement: ['var(--amber-50)', 'var(--amber-600)'],
      battle: ['var(--coral-50)', 'var(--coral-600)'],
      social: ['var(--grape-100)', 'var(--grape-600)'],
      lesson: ['var(--teal-50)', 'var(--teal-600)'],
      system: ['var(--ink-100)', 'var(--ink-600)']
    };
    const [tile, fg] = tones[type] || tones.system;
    const surface = priority ? 'var(--amber-50)' : read ? 'transparent' : 'var(--coral-50)';
    const borderCol = priority ? 'var(--amber-300)' : read ? 'var(--line)' : 'var(--coral-100)';
    return /*#__PURE__*/React.createElement("button", {
      onClick: onClick,
      style: {
        position: 'relative',
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 13,
        padding: '14px 16px',
        textAlign: 'left',
        background: surface,
        border: `1px solid ${borderCol}`,
        borderRadius: 22,
        boxShadow: read ? 'none' : 'var(--shadow-xs)',
        cursor: 'pointer',
        overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent'
      }
    }, priority ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 5,
        background: 'var(--amber-500)'
      }
    }) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        width: 44,
        height: 44,
        borderRadius: 14,
        background: tile,
        color: fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 23,
        marginLeft: priority ? 4 : 0
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: icon,
      w: "fill"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: read ? 600 : 800,
        fontSize: 16,
        color: read ? 'var(--ink-600)' : 'var(--ink-900)',
        lineHeight: 1.2
      }
    }, title), priority ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        height: 20,
        padding: '0 8px',
        borderRadius: 999,
        background: 'var(--amber-500)',
        color: 'var(--ink-900)',
        fontFamily: 'var(--font-ui)',
        fontWeight: 800,
        fontSize: 10.5,
        letterSpacing: '.03em'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "warning",
      w: "fill",
      s: 12
    }), "MUHIM") : isNew ? /*#__PURE__*/React.createElement("span", {
      style: {
        height: 20,
        padding: '0 8px',
        borderRadius: 999,
        background: 'var(--coral-500)',
        color: '#fff',
        fontFamily: 'var(--font-ui)',
        fontWeight: 800,
        fontSize: 10.5,
        letterSpacing: '.03em',
        display: 'inline-flex',
        alignItems: 'center'
      }
    }, "YANGI") : null), body ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        marginTop: 3,
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 13.5,
        color: read ? 'var(--ink-400)' : 'var(--ink-600)',
        lineHeight: 1.4
      }
    }, body) : null, time ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        marginTop: 6,
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 11.5,
        color: 'var(--ink-400)'
      }
    }, time) : null), !read ? /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        width: 10,
        height: 10,
        borderRadius: '50%',
        marginTop: 6,
        background: priority ? 'var(--amber-500)' : 'var(--coral-500)'
      }
    }) : null);
  }
  function NotificationsScreen({
    back
  }) {
    const init = [{
      g: 'Bugun',
      id: 1,
      type: 'battle',
      icon: 'sword',
      title: 'Asror sizni Jangga chaqirdi',
      body: 'Beginner 1 · 10 savol · qabul qilasizmi?',
      time: 'Hozir',
      isNew: true,
      read: false
    }, {
      g: 'Bugun',
      id: 2,
      type: 'achievement',
      icon: 'trophy',
      title: '5 kunlik seriya!',
      body: 'Ajoyib — +50 XP qo‘shildi',
      time: '2 soat oldin',
      read: false
    }, {
      g: 'Bugun',
      id: 3,
      type: 'system',
      icon: 'warning',
      title: 'Obuna tugaydi',
      body: 'Premium obunangiz 2 kundan keyin tugaydi',
      time: '3 soat oldin',
      priority: true,
      read: false
    }, {
      g: 'Kecha',
      id: 4,
      type: 'social',
      icon: 'chat-circle-dots',
      title: 'Guli yangi xabar yubordi',
      body: 'Rahmat! Ko‘rishguncha 👋',
      time: 'Kecha 18:20',
      read: true
    }, {
      g: 'Kecha',
      id: 5,
      type: 'lesson',
      icon: 'book-open',
      title: 'Bugungi dars tayyor',
      body: 'Unit 1.2 — 10 daqiqa',
      time: 'Kecha 09:00',
      read: true
    }, {
      g: 'Avvalroq',
      id: 6,
      type: 'achievement',
      icon: 'medal',
      title: '“Birinchi g‘alaba” medali',
      body: 'Jangda birinchi g‘alabangiz!',
      time: '12-iyun',
      read: true
    }];
    const [items, setItems] = React.useState(init);
    const read = id => setItems(xs => xs.map(x => x.id === id ? {
      ...x,
      read: true,
      isNew: false
    } : x));
    const allRead = () => setItems(xs => xs.map(x => ({
      ...x,
      read: true,
      isNew: false
    })));
    const groups = ['Bugun', 'Kecha', 'Avvalroq'];
    const unreadIn = g => items.filter(x => x.g === g && !x.read).length;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement(HeaderBar, {
      title: "Bildirishnomalar",
      onBack: back,
      right: /*#__PURE__*/React.createElement("button", {
        onClick: allRead,
        style: {
          border: 'none',
          background: 'var(--ink-100)',
          height: 36,
          padding: '0 14px',
          borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          color: 'var(--ink-700)'
        }
      }, "Hammasini o\u2018qildi")
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '0 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, groups.map(g => {
      const rows = items.filter(x => x.g === g);
      if (!rows.length) return null;
      const c = unreadIn(g);
      return /*#__PURE__*/React.createElement(React.Fragment, {
        key: g
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '12px 4px 2px'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 14,
          color: 'var(--ink-500)',
          letterSpacing: '.04em',
          textTransform: 'uppercase'
        }
      }, g), c ? /*#__PURE__*/React.createElement("span", {
        style: {
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 12,
          color: '#fff',
          background: 'var(--coral-500)',
          borderRadius: 999,
          minWidth: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 7px'
        }
      }, c) : null), rows.map((x, ri) => /*#__PURE__*/React.createElement("div", {
        key: x.id,
        className: "lumio-fade-up",
        style: {
          animationDelay: `${ri * 50}ms`
        }
      }, /*#__PURE__*/React.createElement(NotifItem, _extends({}, x, {
        onClick: () => read(x.id)
      })))));
    })));
  }

  /* ---------- PUBLIC / PEER PROFILE (boshqa o‘quvchi) ---------- */
  function PublicProfileScreen({
    back,
    peer = {},
    onMessage,
    onChallenge
  }) {
    const p = {
      name: 'Asrorbek Abrayev',
      level: 'Beginner 2',
      xp: '4218',
      rank: 312,
      online: true,
      battles: 128,
      wins: 96,
      losses: 32,
      friends: 24,
      vsWins: 3,
      vsLosses: 1,
      mutual: 5,
      bg: 'var(--coral-100)',
      fg: 'var(--coral-600)',
      ...peer
    };
    const [friend, setFriend] = React.useState(false);
    const [menu, setMenu] = React.useState(false);
    const Stat = ({
      k,
      v,
      c
    }) => /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: c || 'var(--ink-900)'
      }
    }, v), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 12,
        color: 'var(--ink-500)'
      }
    }, k));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        paddingBottom: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-warm)',
        padding: '6px 18px 24px',
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: '#fff',
        fontSize: 25,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => setMenu(!menu),
      style: {
        border: 'none',
        background: 'rgba(255,255,255,.22)',
        width: 40,
        height: 40,
        borderRadius: '50%',
        cursor: 'pointer',
        color: '#fff',
        fontSize: 22,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "dots-three",
      w: "bold"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(Av, {
      name: p.name,
      size: 88,
      bg: "rgba(255,255,255,.92)",
      fg: "var(--coral-600)"
    }), p.online ? /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        right: 4,
        bottom: 4,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--success-500)',
        border: '3px solid #fff'
      }
    }) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: '#fff',
        marginTop: 10
      }
    }, p.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        marginTop: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#fff',
        color: 'var(--coral-600)',
        borderRadius: 999,
        padding: '5px 14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 13
      }
    }, p.level), /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'rgba(255,255,255,.95)',
        borderRadius: 999,
        padding: '5px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "star",
      w: "fill",
      s: 15,
      c: "var(--amber-500)"
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        color: 'var(--ink-900)'
      }
    }, p.xp)), /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'rgba(255,255,255,.95)',
        borderRadius: 999,
        padding: '5px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "ranking",
      w: "fill",
      s: 15,
      c: "var(--grape-500)"
    }), /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        color: 'var(--ink-900)'
      }
    }, "#", p.rank)))), menu ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      onClick: () => setMenu(false),
      style: {
        position: 'fixed',
        inset: 0,
        zIndex: 9
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: 18,
        top: 52,
        zIndex: 10,
        background: '#fff',
        borderRadius: 16,
        boxShadow: 'var(--shadow-pop)',
        overflow: 'hidden',
        minWidth: 180
      }
    }, [['flag', 'Shikoyat qilish', 'var(--ink-800)'], ['prohibit', 'Bloklash', 'var(--danger-500)']].map(([ic, t, c]) => /*#__PURE__*/React.createElement("button", {
      key: t,
      onClick: () => setMenu(false),
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '13px 16px',
        border: 'none',
        background: '#fff',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 15,
        color: c
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: ic,
      w: "fill",
      s: 19
    }), t)))) : null), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(Btn, {
      variant: "primary",
      iconBefore: "chat-circle",
      onClick: onMessage,
      style: {
        flex: 1
      }
    }, "Xabar"), /*#__PURE__*/React.createElement(Btn, {
      variant: "teal",
      iconBefore: "sword",
      onClick: onChallenge,
      style: {
        flex: 1
      }
    }, "Jangga chaqirish"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setFriend(!friend),
      "aria-label": "Do\u2018st qo\u2018shish",
      style: {
        flex: '0 0 auto',
        width: 54,
        height: 54,
        borderRadius: 22,
        border: 'none',
        cursor: 'pointer',
        background: friend ? 'var(--success-50)' : '#fff',
        color: friend ? 'var(--success-600)' : 'var(--coral-500)',
        boxShadow: 'var(--clay-white)',
        fontSize: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: friend ? 'user-check' : 'user-plus',
      w: "fill"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-block',
        background: 'var(--bg-tint)',
        borderRadius: 999,
        padding: '8px 16px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        color: 'var(--ink-900)'
      }
    }, "Jang statistikasi"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        marginTop: 18
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      k: "Janglar",
      v: p.battles
    }), /*#__PURE__*/React.createElement(Stat, {
      k: "Yutuqlar",
      v: p.wins,
      c: "var(--success-600)"
    }), /*#__PURE__*/React.createElement(Stat, {
      k: "Mag\u2018lubiyat",
      v: p.losses,
      c: "var(--danger-500)"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-grape)',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-grape)',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        opacity: .95
      }
    }, "Sizga qarshi"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 34
      }
    }, p.vsWins), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        opacity: .9
      }
    }, "Siz yutdingiz")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        opacity: .7
      }
    }, ":"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 34
      }
    }, p.vsLosses), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 12,
        opacity: .9
      }
    }, "U yutdi"))), /*#__PURE__*/React.createElement(I, {
      n: "sword",
      w: "fill",
      s: 64,
      c: "rgba(255,255,255,.18)",
      style: {
        position: 'absolute',
        right: 12,
        bottom: -6
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 26,
        color: 'var(--ink-900)'
      }
    }, p.friends), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 13,
        color: 'var(--ink-500)'
      }
    }, "Do\u2018stlar"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 11,
        color: 'var(--coral-500)',
        marginTop: 4
      }
    }, p.mutual, " umumiy")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 2,
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        color: 'var(--ink-900)',
        marginBottom: 12
      }
    }, "Medallar"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10
      }
    }, [['var(--amber-500)', 'trophy'], ['var(--teal-500)', 'crown-simple'], ['var(--coral-500)', 'fire']].map(([c, ic], i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        width: 48,
        height: 48,
        borderRadius: 14,
        background: c,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 23,
        boxShadow: '0 5px 0 rgba(0,0,0,.12)'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: ic,
      w: "fill"
    }))))))));
  }
  Object.assign(window, {
    ChatListScreen,
    ChatThreadScreen,
    LeaderboardScreen,
    ProfileScreen,
    BattleResultScreen,
    NotificationsScreen,
    PublicProfileScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student-app/more-screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/student-app/screens.jsx
try { (() => {
/* Lumio student-app screens. Uses window primitives from kit.jsx. */
(function () {
  const {
    I,
    StatChip,
    FeatureCard,
    LessonNode,
    ListRow,
    Btn,
    ScreenTitle
  } = window;
  const Scroll = ({
    children,
    pad = true
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      overflowY: 'auto',
      paddingBottom: 104
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad ? '0' : 0
    }
  }, children));

  /* ---------------- HOME (Asosiy) ---------------- */
  function HomeScreen({
    go
  }) {
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--grad-warm)',
        padding: '8px 20px 26px',
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => go('profile'),
      style: {
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        width: 46,
        height: 46,
        borderRadius: '50%',
        background: 'rgba(255,255,255,.25)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 19,
        border: '2px solid rgba(255,255,255,.7)'
      }
    }, "J"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 21,
        color: '#fff'
      }
    }, "Salom, Jasur!"), /*#__PURE__*/React.createElement("button", {
      onClick: () => go('chatlist'),
      style: {
        position: 'relative',
        border: 'none',
        background: 'transparent',
        color: '#fff',
        fontSize: 23,
        cursor: 'pointer',
        padding: 0,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "chat-circle",
      w: "fill"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        color: '#fff',
        fontSize: 23
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => go('notifications'),
      style: {
        border: 'none',
        background: 'transparent',
        color: '#fff',
        fontSize: 23,
        cursor: 'pointer',
        padding: 0,
        display: 'flex'
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "bell",
      w: "fill"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: -3,
        right: -3,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--coral-700)',
        border: '2px solid #fff',
        color: '#fff',
        fontSize: 9,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, "3"))), /*#__PURE__*/React.createElement("div", {
      onClick: () => go('battle'),
      style: {
        marginTop: 18,
        background: 'rgba(255,255,255,.18)',
        borderRadius: 22,
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-around',
        backdropFilter: 'blur(4px)',
        cursor: 'pointer'
      }
    }, [['Janglar', '1'], ['Yutuqlar', '1'], ['Mag‘lubiyat', '0']].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
      key: k,
      style: {
        textAlign: 'center',
        color: '#fff'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 700,
        fontSize: 12,
        opacity: .9
      }
    }, k), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24
      }
    }, v))))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(FeatureCard, {
      gradient: "var(--grad-cool)",
      lip: "var(--clay-sky)",
      title: "Mening lug\u2018atim",
      subtitle: "Hali so\u2018zlar yo\u2018q",
      art: "cards-three",
      onClick: () => go('vocab')
    }), /*#__PURE__*/React.createElement(FeatureCard, {
      gradient: "var(--grad-grape)",
      lip: "var(--clay-grape)",
      title: "Zoom tadbirlar",
      art: "video-camera",
      onClick: () => {}
    }), /*#__PURE__*/React.createElement("div", {
      onClick: () => go('leaderboard'),
      style: {
        background: 'var(--grad-sun)',
        borderRadius: 28,
        padding: 16,
        boxShadow: 'var(--clay-amber)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#fff',
        borderRadius: 999,
        padding: '8px 14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 15,
        color: 'var(--ink-900)',
        lineHeight: 1.1
      }
    }, "Peshqadamlar", /*#__PURE__*/React.createElement("br", null), "jadvali"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 'auto',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-900)',
        fontSize: 19
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "trophy",
      w: "fill"
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 18,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'var(--grape-100)',
        color: 'var(--grape-600)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800
      }
    }, "J"), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 17,
        color: 'var(--ink-900)'
      }
    }, "Jasur"), /*#__PURE__*/React.createElement(StatChip, {
      icon: "lightning",
      value: "201"
    })))));
  }

  /* ---------------- LESSONS (Darslar) ---------------- */
  const Cloud = ({
    s,
    top,
    left,
    right,
    bottom
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom
    }
  }, /*#__PURE__*/React.createElement(I, {
    n: "cloud",
    w: "fill",
    s: s,
    c: "rgba(91,177,255,.45)"
  }));
  const Spark = ({
    s = 22,
    top,
    left,
    right,
    bottom
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom
    }
  }, /*#__PURE__*/React.createElement(I, {
    n: "sparkle",
    w: "fill",
    s: s,
    c: "var(--amber-400)"
  }));
  const Dash = ({
    style
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      height: 5,
      borderRadius: 99,
      backgroundImage: 'repeating-linear-gradient(90deg,var(--sky-400) 0 14px,transparent 14px 26px)',
      ...style
    }
  });
  function LessonsScreen({
    go
  }) {
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(ScreenTitle, null, "Darslar"), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 20px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 24,
        padding: 20,
        boxShadow: 'var(--clay-white)',
        textAlign: 'center'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--ink-900)'
      }
    }, "Starter"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--ink-500)',
        margin: '6px 0 16px'
      }
    }, "Siz Starter darslariga qaytmoqchimisiz?"), /*#__PURE__*/React.createElement(Btn, {
      block: true,
      onClick: () => go('quiz')
    }, "Ha, qaytish"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 20px 6px'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: 'var(--ink-900)'
      }
    }, "Beginner 1"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: 'var(--ink-900)'
      }
    }, "0%")), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        height: 470,
        margin: '6px 6px 0'
      }
    }, /*#__PURE__*/React.createElement(Cloud, {
      s: 56,
      top: 6,
      right: 40
    }), /*#__PURE__*/React.createElement(Cloud, {
      s: 38,
      top: 30,
      right: 96
    }), /*#__PURE__*/React.createElement(Spark, {
      top: 120,
      left: 120
    }), /*#__PURE__*/React.createElement(Spark, {
      s: 16,
      top: 70,
      left: 40
    }), /*#__PURE__*/React.createElement(Spark, {
      top: 200,
      left: 70,
      s: 18
    }), /*#__PURE__*/React.createElement(Spark, {
      top: 250,
      right: 120
    }), /*#__PURE__*/React.createElement(Spark, {
      s: 16,
      top: 330,
      left: 150
    }), /*#__PURE__*/React.createElement(Dash, {
      style: {
        position: 'absolute',
        top: 150,
        left: 150,
        width: 90,
        transform: 'rotate(8deg)'
      }
    }), /*#__PURE__*/React.createElement(Dash, {
      style: {
        position: 'absolute',
        top: 250,
        left: 70,
        width: 120
      }
    }), /*#__PURE__*/React.createElement(Dash, {
      style: {
        position: 'absolute',
        top: 350,
        left: 150,
        width: 110,
        transform: 'rotate(-6deg)'
      }
    }), /*#__PURE__*/React.createElement(LessonNode, {
      label: "Unit 1.1",
      percent: 0,
      state: "active",
      onClick: () => go('unit'),
      style: {
        position: 'absolute',
        top: 30,
        left: 24
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        top: 64,
        left: 168,
        background: '#fff',
        borderRadius: 16,
        padding: '10px 14px',
        boxShadow: 'var(--shadow-card)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 13,
        color: 'var(--ink-900)',
        maxWidth: 150
      }
    }, "Sizning darsingiz shu yerda"), /*#__PURE__*/React.createElement(LessonNode, {
      label: "Unit 1.2",
      percent: 0,
      state: "locked",
      style: {
        position: 'absolute',
        top: 178,
        right: 20
      }
    }), /*#__PURE__*/React.createElement(LessonNode, {
      label: "Unit 1.3",
      percent: 0,
      state: "locked",
      style: {
        position: 'absolute',
        top: 322,
        left: 20
      }
    })));
  }

  /* ---------------- RESOURCES (Resurslar) ---------------- */
  function ResourcesScreen() {
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(ScreenTitle, null, "Resurslar"), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement(FeatureCard, {
      gradient: "var(--grad-grape)",
      lip: "var(--clay-grape)",
      title: "Level",
      art: "headphones",
      h: 120
    }), /*#__PURE__*/React.createElement(FeatureCard, {
      gradient: "var(--grad-warm)",
      lip: "var(--clay-coral)",
      title: "Kitoblar",
      art: "books",
      h: 120
    }), /*#__PURE__*/React.createElement(FeatureCard, {
      gradient: "var(--grad-cool)",
      lip: "var(--clay-sky)",
      title: "Podkastlar",
      art: "microphone",
      h: 120
    })));
  }

  /* ---------------- MORE (Ko‘proq) ---------------- */
  function MoreScreen({
    go
  }) {
    return /*#__PURE__*/React.createElement(Scroll, null, /*#__PURE__*/React.createElement(ScreenTitle, null, "Ko\u2018proq"), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement(ListRow, {
      icon: "shopping-bag-open",
      tone: "grape",
      label: "Xaridlar"
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "translate",
      tone: "teal",
      label: "Tarjimon"
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "chat-teardrop-dots",
      tone: "coral",
      label: "FAQ"
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "info",
      tone: "amber",
      label: "Biz haqimizda"
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "gear",
      tone: "grape",
      label: "Sozlamalar",
      onClick: () => go('settings')
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "sign-out",
      tone: "ink",
      label: "Chiqish"
    })));
  }

  /* ---------------- SETTINGS (Sozlamalar) + language sheet ---------------- */
  function SettingsScreen({
    back
  }) {
    const [sound, setSound] = React.useState(true);
    const [sheet, setSheet] = React.useState(false);
    const [lang, setLang] = React.useState('uz');
    const Toggle = () => /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        var on = !sound;
        try {
          window.LumioSound.unlock();
          window.LumioSound.setEnabled(on);
          if (on) window.LumioSound.play('toggle');
        } catch (e) {}
        setSound(on);
      },
      style: {
        position: 'relative',
        width: 54,
        height: 32,
        border: 'none',
        borderRadius: 999,
        background: sound ? 'var(--success-500)' : 'var(--ink-300)',
        boxShadow: 'var(--inset-soft)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: 3,
        left: sound ? 25 : 3,
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 2px 5px rgba(14,42,61,.25)',
        transition: 'left .2s var(--ease-bounce)'
      }
    }));
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '6px 20px 14px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: back,
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-900)',
        fontSize: 24
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "arrow-left",
      w: "bold"
    })), /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--ink-900)'
      }
    }, "Sozlamalar")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement(ListRow, {
      icon: "speaker-high",
      tone: "coral",
      label: "Ovoz effektlari",
      chevron: false,
      trailing: /*#__PURE__*/React.createElement(Toggle, null)
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "sun",
      tone: "amber",
      label: "Mavzu"
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "translate",
      tone: "teal",
      label: "Til",
      onClick: () => setSheet(true)
    }), /*#__PURE__*/React.createElement(ListRow, {
      icon: "user-circle",
      tone: "grape",
      label: "Hisobni boshqarish"
    })), sheet ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        zIndex: 30
      }
    }, /*#__PURE__*/React.createElement("div", {
      onClick: () => setSheet(false),
      style: {
        position: 'absolute',
        inset: 0,
        background: 'rgba(14,42,61,.45)'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: '14px 20px 32px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 44,
        height: 5,
        borderRadius: 99,
        background: 'var(--ink-200)',
        margin: '0 auto 14px'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 24,
        color: 'var(--ink-900)',
        marginBottom: 16
      }
    }, "Til"), [['en', 'English (UK)', '🇬🇧'], ['uz', 'O‘zbekcha', '🇺🇿']].map(([v, l, f]) => /*#__PURE__*/React.createElement("button", {
      key: v,
      onClick: () => {
        setLang(v);
        setSheet(false);
      },
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        marginBottom: 10,
        background: '#fff',
        border: `2px solid ${lang === v ? 'var(--coral-500)' : 'var(--line)'}`,
        borderRadius: 18,
        cursor: 'pointer',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 18,
        color: 'var(--ink-900)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 24
      }
    }, f), l, lang === v ? /*#__PURE__*/React.createElement(I, {
      n: "check-circle",
      w: "fill",
      s: 22,
      c: "var(--coral-500)",
      style: {
        marginLeft: 'auto'
      }
    }) : null)))) : null);
  }

  /* ---------------- LESSON QUIZ ---------------- */
  function QuizScreen({
    exit
  }) {
    const opts = ['O‘qituvchi', 'Shifokor', 'Muhandis', 'Talaba'];
    const [pick, setPick] = React.useState(null);
    const [leaving, setLeaving] = React.useState(false);
    const correct = 0;
    const checked = pick !== null;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)'
      }
    }, leaving ? /*#__PURE__*/React.createElement(window.LeaveDialog, {
      onStay: () => setLeaving(false),
      onLeave: exit
    }) : null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '4px 18px 10px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setLeaving(true),
      style: {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--ink-500)',
        fontSize: 26
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "x",
      w: "bold"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 12,
        background: 'var(--bg-sunk)',
        borderRadius: 99,
        boxShadow: 'var(--inset-soft)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: '35%',
        height: '100%',
        background: 'var(--coral-500)',
        borderRadius: 99
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        color: 'var(--coral-500)',
        fontSize: 17
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "heart",
      w: "fill",
      s: 20,
      c: "var(--coral-500)"
    }), "3")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        overflowY: 'auto',
        padding: '14px 22px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 22,
        color: 'var(--ink-900)',
        marginBottom: 18
      }
    }, "Tarjimani tanlang"), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        borderRadius: 26,
        padding: 24,
        boxShadow: 'var(--clay-white)',
        textAlign: 'center',
        marginBottom: 22
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 22
      }
    }, "\uD83C\uDDEC\uD83C\uDDE7"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 30,
        color: 'var(--ink-900)'
      }
    }, "Teacher")), /*#__PURE__*/React.createElement("button", {
      style: {
        display: 'block',
        margin: '0 auto',
        border: 'none',
        background: 'var(--bg-tint)',
        borderRadius: 999,
        width: 56,
        height: 56,
        cursor: 'pointer',
        color: 'var(--coral-500)',
        fontSize: 26
      }
    }, /*#__PURE__*/React.createElement(I, {
      n: "speaker-high",
      w: "fill"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--ink-500)',
        marginTop: 14,
        fontStyle: 'italic'
      }
    }, "\u201CA teacher inspires students.\u201D")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gap: 12
      }
    }, opts.map((o, i) => {
      const isPick = pick === i;
      const state = checked && i === correct ? 'right' : checked && isPick && i !== correct ? 'wrong' : isPick ? 'sel' : 'idle';
      const styles = {
        idle: {
          bg: '#fff',
          bd: 'var(--line)',
          fg: 'var(--ink-900)'
        },
        sel: {
          bg: 'var(--coral-50)',
          bd: 'var(--coral-500)',
          fg: 'var(--ink-900)'
        },
        right: {
          bg: 'var(--success-50)',
          bd: 'var(--success-500)',
          fg: 'var(--success-600)'
        },
        wrong: {
          bg: 'var(--danger-50)',
          bd: 'var(--danger-500)',
          fg: 'var(--danger-600)'
        }
      }[state];
      return /*#__PURE__*/React.createElement("button", {
        key: i,
        onClick: () => {
          try {
            window.LumioSound.unlock();
            window.LumioSound.play(i === correct ? 'correct' : 'wrong');
          } catch (e) {}
          setPick(i);
        },
        className: state === 'wrong' ? 'lumio-shake' : '',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 18px',
          background: styles.bg,
          border: `2px solid ${styles.bd}`,
          borderRadius: 18,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 18,
          color: styles.fg,
          WebkitTapHighlightColor: 'transparent'
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 28,
          height: 28,
          borderRadius: 8,
          border: `2px solid ${styles.bd}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          color: styles.fg
        }
      }, i + 1), o, state === 'right' ? /*#__PURE__*/React.createElement(I, {
        n: "check-circle",
        w: "fill",
        s: 22,
        c: "var(--success-500)",
        style: {
          marginLeft: 'auto'
        }
      }) : null, state === 'wrong' ? /*#__PURE__*/React.createElement(I, {
        n: "x-circle",
        w: "fill",
        s: 22,
        c: "var(--danger-500)",
        style: {
          marginLeft: 'auto'
        }
      }) : null);
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '14px 22px 24px'
      }
    }, /*#__PURE__*/React.createElement(Btn, {
      block: true,
      variant: checked ? pick === correct ? 'teal' : 'primary' : 'secondary',
      onClick: () => checked && exit()
    }, checked ? pick === correct ? 'Ajoyib! Davom etish' : 'Qayta urinish' : 'Tekshirish')));
  }
  Object.assign(window, {
    HomeScreen,
    LessonsScreen,
    ResourcesScreen,
    MoreScreen,
    SettingsScreen,
    QuizScreen
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/student-app/screens.jsx", error: String((e && e.message) || e) }); }

__ds_ns.ChatComposer = __ds_scope.ChatComposer;

__ds_ns.ConversationRow = __ds_scope.ConversationRow;

__ds_ns.MessageBubble = __ds_scope.MessageBubble;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.NotificationItem = __ds_scope.NotificationItem;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.ProgressRing = __ds_scope.ProgressRing;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.CategoryCard = __ds_scope.CategoryCard;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.FractionChip = __ds_scope.FractionChip;

__ds_ns.LeaderboardRow = __ds_scope.LeaderboardRow;

__ds_ns.LessonNode = __ds_scope.LessonNode;

__ds_ns.ResultStatPill = __ds_scope.ResultStatPill;

__ds_ns.StatChip = __ds_scope.StatChip;

__ds_ns.AudioPlayer = __ds_scope.AudioPlayer;

__ds_ns.ExerciseCard = __ds_scope.ExerciseCard;

__ds_ns.NumberedSteps = __ds_scope.NumberedSteps;

__ds_ns.ProgressChart = __ds_scope.ProgressChart;

__ds_ns.VideoLessonCard = __ds_scope.VideoLessonCard;

__ds_ns.WordCard = __ds_scope.WordCard;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.ListRow = __ds_scope.ListRow;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.BottomSheet = __ds_scope.BottomSheet;

__ds_ns.SheetAction = __ds_scope.SheetAction;

__ds_ns.Dialog = __ds_scope.Dialog;

})();
