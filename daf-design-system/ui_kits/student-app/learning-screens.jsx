/* Lumio — learning-content screens: Vocabulary hub, Unit detail, Video lessons,
   Word flashcard, Homework exercise list. Self-contained; uses window.I + Btn. */
(function () {
const { I, Btn } = window;

const Hdr = ({ title, onBack, info }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 18px 12px' }}>
    <button onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-900)', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
    <h1 style={{ margin: 0, flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)' }}>{title}</h1>
    {info ? <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-900)', fontSize: 24, display: 'flex' }}><I n="info" w="regular" /></button> : null}
  </div>
);
const Scroll = ({ children, pb = 28 }) => (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', paddingBottom: pb }}>{children}</div>);

const CatCard = ({ title, value, bg, onClick }) => (
  <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '20px 18px', textAlign: 'left',
    background: bg, border: 'none', borderRadius: 28, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', WebkitTapHighlightColor: 'transparent' }}>
    <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 23, color: 'var(--ink-900)', lineHeight: 1.15 }}>{title}</span>
    <span style={{ flex: '0 0 auto', minWidth: 60, height: 56, padding: '0 14px', borderRadius: 16, background: 'rgba(255,255,255,.72)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)' }}>{value}</span>
  </button>
);
const Frac = ({ kind, e, t }) => {
  const c = kind === 'coin' ? 'var(--amber-400)' : 'var(--success-500)';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px 0 7px', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, boxShadow: 'var(--shadow-xs)' }}>
    <I n={kind === 'coin' ? 'coin' : 'star'} w="fill" s={17} c={c} />
    <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-900)' }}>{e}<span style={{ color: 'var(--ink-400)' }}>/{t}</span></b></span>;
};

/* ---------- VOCABULARY HUB (Mening lug'atim) ---------- */
function VocabScreen({ back, go }) {
  const [range, setRange] = React.useState('7 kun');
  const W = 300, H = 150, pad = 24;
  const labels = ['Shan', 'Yak', 'Du', 'Se', 'Chor', 'Pay', 'Ju'];
  const s1 = [0, 0, 0, 0, 0, 0, 0];
  return (
    <Scroll>
      <Hdr title="Mening lug‘atim" onBack={back} />
      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <CatCard title="O‘rganilayotgan so‘zlar" value="0" bg="var(--sky-100)" onClick={() => go('newwords')} />
        <CatCard title="Yangi so‘zlar" value="0" bg="#FCE0EE" onClick={() => go('newwords')} />
        <CatCard title="Barcha so‘zlar" value="0" bg="#F4E7CB" onClick={() => go('newwords')} />

        {/* Chart card */}
        <div style={{ background: 'var(--bg-tint)', border: '1px solid var(--line)', borderRadius: 28, padding: 16, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 4, padding: 5, background: '#fff', borderRadius: 999, boxShadow: 'var(--inset-soft)', marginBottom: 16 }}>
            {['7 kun', '1 oy', '6 oy', '1 yil'].map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{ flex: 1, height: 34, border: 'none', borderRadius: 999,
                background: range === r ? 'var(--coral-50)' : 'transparent', color: range === r ? 'var(--coral-600)' : 'var(--ink-500)',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: range === r ? 'var(--shadow-xs)' : 'none' }}>{r}</button>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((g, i) => <line key={i} x1={pad} x2={W - 6} y1={10 + g * (H - 36)} y2={10 + g * (H - 36)} stroke="var(--line)" strokeWidth="1" strokeDasharray="4 5" />)}
            <line x1={pad} x2={pad} y1={10} y2={H - 26} stroke="var(--ink-800)" strokeWidth="2" />
            {labels.map((l, i) => <text key={i} x={pad + i * (W - pad - 6) / 6} y={H - 8} textAnchor="middle" fontFamily="Nunito" fontWeight="700" fontSize="10" fill="var(--ink-400)">{l}</text>)}
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            {[['0', 'Yangi so‘zlar', 'var(--sky-500)'], ['0', 'O‘rganilayotgan so‘zlar', 'var(--amber-500)']].map(([v, l, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink-700)', minWidth: 18 }}>{v}</b>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: c }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink-600)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Scroll>
  );
}

/* ---------- NEW WORDS EMPTY STATE (numbered steps) ---------- */
function NewWordsScreen({ back, go }) {
  const steps = [
    'Darslikdan yangi so‘zlar qo‘shing — ular shu yerda saqlanadi.',
    'So‘zlarni o‘rganishni boshlasangiz, ular “O‘rganilayotgan so‘zlar” bo‘limida saqlanadi.',
    'To‘liq o‘zlashtirilgan so‘zlar “Hamma so‘zlar” bo‘limiga o‘tadi.',
  ];
  return (
    <Scroll>
      <Hdr title="Yangi so‘zlar" onBack={back} info />
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 27, color: 'var(--ink-900)', margin: '18px 24px 26px' }}>Sizda hali so‘zlar yo‘q</div>
      <div style={{ padding: '0 18px' }}>
        {steps.map((s, i) => {
          const left = i % 2 === 0;
          const last = i === steps.length - 1;
          const TILE = 78, OFF = 2, CENTER = OFF + TILE / 2, BLOCK = 132, LAST = 84;
          return (
            <div key={i} style={{ position: 'relative', height: last ? LAST : BLOCK }}>
              {!last ? (
                <span aria-hidden="true" style={{ position: 'absolute', top: OFF + TILE, height: BLOCK - TILE, left: CENTER, right: CENTER,
                  borderBottom: '3px dashed var(--grape-400)', borderLeft: left ? '3px dashed var(--grape-400)' : 'none', borderRight: left ? 'none' : '3px dashed var(--grape-400)',
                  borderBottomLeftRadius: left ? 18 : 0, borderBottomRightRadius: left ? 0 : 18, opacity: .7 }} />
              ) : null}
              <span style={{ position: 'absolute', top: OFF, left: left ? OFF : 'auto', right: left ? 'auto' : OFF, width: TILE, height: TILE, borderRadius: 24, background: 'var(--grape-400)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, boxShadow: '0 6px 0 var(--grape-600), 0 12px 20px rgba(14,42,61,.14)', zIndex: 1 }}>{i + 1}</span>
              <span style={{ position: 'absolute', top: OFF + TILE / 2, transform: 'translateY(-50%)', left: left ? OFF + TILE + 16 : OFF, right: left ? OFF : OFF + TILE + 16, background: 'var(--bg-tint)', border: '1px solid var(--line)', borderRadius: 22, padding: '14px 16px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--ink-700)', lineHeight: 1.4 }}>{s}</span>
            </div>
          );
        })}
      </div>
    </Scroll>
  );
}

/* ---------- UNIT DETAIL (Unit 1.1 → Video / Vocabulary / Homework) ---------- */
function UnitScreen({ back, go }) {
  return (
    <Scroll>
      <Hdr title="Unit 1.1" onBack={back} />
      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CatCard title="Video" value="0%" bg="var(--grape-100)" onClick={() => go('video')} />
        <CatCard title="Vocabulary" value="0%" bg="#CFF3D8" onClick={() => go('word')} />
        <CatCard title="Homework Compulsory" value="0%" bg="#FFE3C2" onClick={() => go('homework')} />
      </div>
    </Scroll>
  );
}

/* ---------- VIDEO LESSONS (1-video / 2-video) ---------- */
function VideoListScreen({ back, go }) {
  const Block = ({ title, vt, mt }) => (
    <div style={{ background: '#fff', borderRadius: 28, padding: 18, boxShadow: 'var(--clay-white)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)', marginBottom: 14 }}>{title}</div>
      {[['Video', vt], ['Mashq', mt]].map(([lbl, t]) => (
        <div key={lbl} style={{ background: 'var(--bg-tint)', borderRadius: 16, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>{lbl}:</b>
            <span style={{ display: 'inline-flex', gap: 8 }}><Frac kind="star" e={0} t={t} /><Frac kind="coin" e={0} t={t} /></span>
          </div>
          <div style={{ height: 12, background: '#fff', borderRadius: 999, boxShadow: 'var(--inset-soft)' }} />
        </div>
      ))}
      <Btn block size="lg" onClick={() => go('word')} iconBefore="play">Videoni ko‘rish</Btn>
    </div>
  );
  return (
    <Scroll>
      <Hdr title="Video" onBack={back} />
      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Block title="1-video" vt={1} mt={10} />
        <Block title="2-video" vt={1} mt={4} />
      </div>
    </Scroll>
  );
}

/* ---------- WORD FLASHCARD (Mavzuga qaytish) ---------- */
function WordScreen({ back, go }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      <Hdr title="Mavzuga qaytish" onBack={back} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px' }}>
        {/* EN card */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 22, padding: 20, boxShadow: 'var(--shadow-card)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 30 }}>🇬🇧</span><b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--ink-900)' }}>Olmosh</b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--ink-900)' }}>you</b>
            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sky-500)', fontSize: 26, display: 'flex' }}><I n="speaker-high" w="fill" /></button>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 18, color: 'var(--ink-500)', marginBottom: 16 }}>/juː/</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontStyle: 'italic', fontSize: 18, color: 'var(--ink-800)', lineHeight: 1.35 }}>“Hello. Are you Angela?”</span>
            <button style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--grape-100)', color: 'var(--grape-600)', cursor: 'pointer', fontSize: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I n="translate" w="bold" /></button>
          </div>
        </div>
        {/* UZ card */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 22, padding: 20, boxShadow: 'var(--shadow-card)' }}>
          <span style={{ fontSize: 30, display: 'block', marginBottom: 16 }}>🇺🇿</span>
          <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--ink-900)' }}>siz, sen</b>
        </div>
      </div>
      <div style={{ padding: '12px 18px 22px' }}><Btn block size="lg" variant="primary" onClick={() => go('homework')} iconAfter="arrow-right">Keyingi</Btn></div>
    </div>
  );
}

/* ---------- HOMEWORK EXERCISE LIST ---------- */
function HomeworkScreen({ back, go }) {
  const Ex = ({ type, skill, instruction, st, pct }) => (
    <button onClick={() => go('fillblank')} style={{ width: '100%', textAlign: 'left', display: 'block', padding: 18, background: '#fff', border: '1px solid var(--line)', borderRadius: 22, boxShadow: 'var(--shadow-card)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ height: 30, padding: '0 14px', borderRadius: 999, background: 'var(--success-500)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>{type}</span>
          <span style={{ height: 28, padding: '0 14px', borderRadius: 999, background: 'var(--amber-500)', color: 'var(--ink-900)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.04em', display: 'inline-flex', alignItems: 'center' }}>{skill}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-end' }}><Frac kind="star" e={0} t={st} /><Frac kind="coin" e={0} t={st} /></div>
      </div>
      <div style={{ margin: '14px 0', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink-900)', lineHeight: 1.3 }}>{instruction}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 10, background: 'var(--amber-50)', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: 'var(--amber-500)', borderRadius: 999 }} /></div>
        <b style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--amber-600)', minWidth: 38, textAlign: 'right' }}>{pct}%</b>
      </div>
    </button>
  );
  return (
    <Scroll>
      <Hdr title="Homework Compulsory" onBack={back} />
      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Ex type="Choose Answer" skill="LISTENING" instruction="Complete the conversations with the correct word" st={10} pct={0} />
        <Ex type="Choose Answer" skill="GRAMMAR" instruction="Choose the correct answer and complete the given sentences" st={4} pct={0} />
        <Ex type="Construct" skill="GRAMMAR" instruction="Rearrange the words to make sentences or question" st={6} pct={0} />
      </div>
    </Scroll>
  );
}

/* ---------- FILL-IN-THE-BLANK + audio + answer sheet ---------- */
function FillBlankScreen({ back }) {
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const [picks, setPicks] = React.useState({});
  const [active, setActive] = React.useState(null);
  const rows = [[1, 'Alisa'], [2, 'Adam.'], [3, 'Bob.']];
  const opts = ['Good', 'No', 'Hello'];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 18px 10px' }}>
        <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-900)', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
        <div style={{ flex: 1, height: 12, background: 'var(--bg-sunk)', borderRadius: 999, boxShadow: 'var(--inset-soft)', overflow: 'hidden' }}><div style={{ width: '20%', height: '100%', background: 'var(--coral-500)', borderRadius: 999 }} /></div>
      </div>
      {/* Audio */}
      <div style={{ margin: '4px 18px 0', background: 'var(--bg-sunk)', borderRadius: 22, padding: '16px 18px' }}>
        <div style={{ position: 'relative', height: 8, background: 'var(--ink-200)', borderRadius: 999, marginBottom: 8 }}>
          <div style={{ width: '50%', height: '100%', background: 'var(--ink-800)', borderRadius: 999 }} />
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: '50%', background: 'var(--ink-900)', boxShadow: '0 2px 5px rgba(14,42,61,.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--ink-700)', marginBottom: 10 }}><span>00:15</span><span>00:30</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
          <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)', fontSize: 24, display: 'flex' }}><I n="speaker-high" w="fill" /></button>
          <button onClick={() => setPlaying(!playing)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)', fontSize: 28, display: 'flex' }}><I n={playing ? 'pause' : 'play'} w="fill" /></button>
          <button onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 0.75 : 1)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-800)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>{speed.toFixed(speed % 1 ? 2 : 1)}x</button>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--ink-900)', margin: '16px 24px 14px', lineHeight: 1.25 }}>Suhbatni to‘g‘ri so‘zlar bilan to‘ldiring</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(([n, name]) => (
          <div key={n} style={{ position: 'relative', background: 'var(--bg-sunk)', borderRadius: 18, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ position: 'absolute', top: 8, left: 10, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--ink-400)' }}>{n}</span>
            <button onClick={() => setActive(n)} style={{ width: 84, height: 44, borderRadius: 12, border: `2px solid ${active === n ? 'var(--coral-500)' : 'var(--ink-300)'}`, background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>{picks[n] || ''}</button>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink-900)' }}>, I'm {name}</span>
          </div>
        ))}
      </div>
      {/* Answer options sheet */}
      <div style={{ background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0 -8px 30px rgba(14,42,61,.14)', padding: '16px 18px calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opts.map((o) => (
            <button key={o} onClick={() => { if (active) setPicks({ ...picks, [active]: o }); }} style={{ height: 52, border: '1px solid var(--line)', borderRadius: 16, background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink-900)', boxShadow: 'var(--shadow-xs)' }}>{o}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VocabScreen, NewWordsScreen, UnitScreen, VideoListScreen, WordScreen, HomeworkScreen, FillBlankScreen });
})();
