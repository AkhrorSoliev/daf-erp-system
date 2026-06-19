/* Lumio UI-kit primitives — self-contained recreations of the DS components,
   inline-styled so the kit renders without the compiled bundle. Window-exported. */
(function () {
const I = ({ n, w = 'bold', s, c, style }) =>
  <i className={`ph-${w} ph-${n}`} style={{ fontSize: s, color: c, ...style }} />;

/* Phone frame */
function Phone({ children, dark = false }) {
  return (
    <div style={{ width: 390, height: 844, borderRadius: 54, padding: 12, background: '#0E2A3D',
      boxShadow: '0 40px 80px rgba(14,42,61,.34), inset 0 0 0 2px rgba(255,255,255,.06)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: 120, height: 30,
        background: '#0E2A3D', borderRadius: 18, zIndex: 50 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden', position: 'relative',
        background: dark ? '#0E2A3D' : 'var(--bg-app)' }}>
        {children}
      </div>
    </div>
  );
}

function StatusBar({ tint = 'var(--ink-900)' }) {
  return (
    <div style={{ height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '0 26px 6px', color: tint, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, flex: '0 0 auto' }}>
      <span>10:17</span>
      <span style={{ display: 'inline-flex', gap: 6, fontSize: 15 }}>
        <I n="wifi-high" w="bold" /><I n="cell-signal-full" w="bold" /><I n="battery-high" w="bold" />
      </span>
    </div>
  );
}

function Btn({ children, variant = 'primary', size = 'md', block, onClick, iconBefore, style = {} }) {
  const sizes = { sm: { h: 42, px: 18, fs: 15, r: 16 }, md: { h: 54, px: 24, fs: 17, r: 22 }, lg: { h: 60, px: 28, fs: 18, r: 26 } }[size];
  const pal = {
    primary: { bg: 'var(--coral-500)', fg: '#fff', clay: 'var(--clay-coral)', press: 'var(--clay-coral-press)' },
    secondary: { bg: '#fff', fg: 'var(--ink-900)', clay: 'var(--clay-white)', press: 'var(--clay-neutral-press)' },
    teal: { bg: 'var(--teal-500)', fg: '#fff', clay: 'var(--clay-teal)', press: '0 2px 0 var(--teal-700),0 6px 12px rgba(14,154,144,.28)' },
  }[variant];
  const [d, setD] = React.useState(false);
  return (
    <button onClick={onClick}
      onPointerDown={() => setD(true)} onPointerUp={() => setD(false)} onPointerLeave={() => setD(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        height: sizes.h, padding: `0 ${sizes.px}px`, width: block ? '100%' : 'auto', border: 'none',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: sizes.fs, color: pal.fg, background: pal.bg,
        borderRadius: sizes.r, cursor: 'pointer', boxShadow: d ? pal.press : pal.clay, whiteSpace: 'nowrap',
        transform: d ? 'translateY(4px)' : 'translateY(0)', transition: 'all .12s var(--ease-out)',
        WebkitTapHighlightColor: 'transparent', ...style }}>
      {iconBefore ? <I n={iconBefore} w="fill" /> : null}{children}
    </button>
  );
}

function StatChip({ icon, value, color = 'var(--amber-500)', style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px',
      background: '#fff', borderRadius: 999, boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)', ...style }}>
      <I n={icon} w="fill" s={20} c={color} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--ink-900)', lineHeight: 1 }}>{value}</span>
    </span>
  );
}

function FeatureCard({ title, subtitle, gradient, art, lip, onClick, h = 150 }) {
  const [d, setD] = React.useState(false);
  return (
    <div onClick={onClick} onPointerDown={() => setD(true)} onPointerUp={() => setD(false)} onPointerLeave={() => setD(false)}
      style={{ position: 'relative', overflow: 'hidden', minHeight: h, padding: 22, background: gradient,
        borderRadius: 28, boxShadow: lip, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        transform: d ? 'translateY(3px)' : 'translateY(0)', transition: 'transform .15s var(--ease-out)' }}>
      {art ? <div style={{ position: 'absolute', right: -4, top: 0, bottom: 0, width: '46%', display: 'flex',
        alignItems: 'center', justifyContent: 'flex-end', fontSize: 92, color: 'rgba(255,255,255,.5)' }}><I n={art} w="fill" /></div> : null}
      <div style={{ position: 'relative', zIndex: 1, maxWidth: art ? '64%' : '100%' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 29, lineHeight: 1.05, color: '#fff',
          letterSpacing: '-.01em', textShadow: '0 2px 8px rgba(14,42,61,.18)' }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 18px',
          borderRadius: 999, background: 'rgba(255,255,255,.22)', color: '#fff', fontFamily: 'var(--font-ui)',
          fontWeight: 700, fontSize: 14 }}>{subtitle}</div> : null}
      </div>
      <span style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, borderRadius: '50%', background: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-900)', fontSize: 21,
        boxShadow: 'var(--shadow-card)' }}><I n="arrow-up-right" w="bold" /></span>
    </div>
  );
}

function LessonNode({ label, percent = 0, state = 'locked', onClick, style }) {
  const st = {
    locked: { face: 'var(--bg-sunk)', text: 'var(--ink-400)', lip: '#D2DAE3', shadow: '0 6px 0 #D2DAE3,0 12px 22px rgba(14,42,61,.10)' },
    active: { face: '#fff', text: 'var(--ink-900)', shadow: '0 0 0 5px var(--coral-500),0 6px 0 #E2E8EF,0 16px 26px rgba(255,107,74,.28)' },
    done: { face: 'var(--teal-50)', text: 'var(--teal-700)', shadow: '0 6px 0 var(--teal-300),0 12px 22px rgba(14,154,144,.16)' },
  }[state];
  const [d, setD] = React.useState(false);
  return (
    <button onClick={onClick} onPointerDown={() => setD(true)} onPointerUp={() => setD(false)} onPointerLeave={() => setD(false)}
      style={{ position: 'relative', width: 128, height: 128, padding: 16, border: 'none', background: st.face,
        borderRadius: 34, textAlign: 'left', cursor: 'pointer', boxShadow: st.shadow,
        transform: d ? 'translateY(3px)' : 'translateY(0)', transition: 'transform .12s var(--ease-out)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', WebkitTapHighlightColor: 'transparent', ...style }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 25, color: st.text, lineHeight: 1 }}>{percent}%</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: st.text, lineHeight: 1 }}>{label}</span>
      {state === 'locked' ? <I n="lock-simple" w="fill" s={17} c="var(--ink-400)" style={{ position: 'absolute', top: 13, right: 13 }} /> : null}
      {state === 'done' ? <I n="check-circle" w="fill" s={19} c="var(--teal-500)" style={{ position: 'absolute', top: 12, right: 12 }} /> : null}
    </button>
  );
}

function ListRow({ icon, tone = 'grape', label, trailing, chevron = true, onClick }) {
  const tones = { grape: ['var(--grape-100)', 'var(--grape-600)'], coral: ['var(--coral-50)', 'var(--coral-600)'],
    amber: ['var(--amber-50)', 'var(--amber-600)'], teal: ['var(--teal-50)', 'var(--teal-600)'], ink: ['var(--ink-100)', 'var(--ink-700)'] }[tone];
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
      background: '#fff', border: '1px solid var(--line)', borderRadius: 22, boxShadow: 'var(--shadow-xs)', cursor: 'pointer',
      textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
      <span style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: 12, background: tones[0], color: tones[1],
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}><I n={icon} w="fill" /></span>
      <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink-900)' }}>{label}</span>
      {trailing}
      {chevron ? <I n="caret-right" w="bold" s={20} c="var(--ink-900)" /> : null}
    </button>
  );
}

function BottomNav({ value, onChange }) {
  const items = [
    { v: 'home', label: 'Asosiy', icon: 'house' },
    { v: 'lessons', label: 'Darslar', icon: 'path' },
    { v: 'res', label: 'Resurslar', icon: 'books' },
    { v: 'more', label: 'Ko‘proq', icon: 'squares-four' },
  ];
  return (
    <nav style={{ position: 'absolute', left: 16, right: 16, bottom: 14, height: 70, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 4, padding: '0 14px', background: 'rgba(255,255,255,.82)',
      backdropFilter: 'var(--blur-glass)', WebkitBackdropFilter: 'var(--blur-glass)', borderRadius: 34,
      boxShadow: '0 8px 24px rgba(14,42,61,.14)', border: '1px solid rgba(255,255,255,.6)', zIndex: 40 }}>
      {items.map((it) => {
        const a = it.v === value;
        return (
          <button key={it.v} onClick={() => onChange(it.v)} style={{ flex: a ? '0 0 auto' : 1, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, height: a ? 56 : '100%',
            width: a ? 56 : 'auto', border: 'none', borderRadius: a ? '50%' : 16, background: a ? 'var(--coral-500)' : 'transparent',
            boxShadow: a ? '0 8px 18px rgba(255,107,74,.4)' : 'none', color: a ? '#fff' : 'var(--ink-400)', cursor: 'pointer',
            transition: 'all .2s var(--ease-out)', WebkitTapHighlightColor: 'transparent' }}>
            <I n={it.icon} w={a ? 'fill' : 'regular'} s={a ? 24 : 22} />
            {!a ? <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12 }}>{it.label}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

function ScreenTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 14px' }}>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 27, color: 'var(--ink-900)' }}>{children}</h1>
      {right}
    </div>
  );
}

function LeaveDialog({ onStay, onLeave }) {
  return (
    <div onClick={(e) => e.target === e.currentTarget && onStay()} style={{ position: 'absolute', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(14,42,61,.48)',
      backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', animation: 'lumio-fade-in var(--dur-base) var(--ease-out) both' }}>
      <div className="lumio-pop-in" style={{ width: '100%', maxWidth: 340, background: '#fff', borderRadius: 34, padding: '28px 24px 22px',
        boxShadow: 'var(--shadow-pop)', textAlign: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%',
          background: 'var(--danger-50)', color: 'var(--danger-500)', fontSize: 32, marginBottom: 16 }}><I n="heart-break" w="fill" /></span>
        <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)' }}>Darsni tark etasizmi?</h2>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-600)' }}>Joriy darsdagi yutuqlaringiz saqlanmaydi.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <Btn block variant="primary" onClick={onLeave}>Ha, chiqish</Btn>
          <Btn block variant="secondary" onClick={onStay}>Davom etish</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { I, Phone, StatusBar, Btn, StatChip, FeatureCard, LessonNode, ListRow, BottomNav, ScreenTitle, LeaveDialog });
})();
