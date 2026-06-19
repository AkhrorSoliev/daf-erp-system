/* Lumio — chat, leaderboard, profile & battle screens. Uses window.I + Btn from kit.jsx. */
(function () {
const { I, Btn } = window;

const Av = ({ name = '', size = 44, bg = 'var(--grape-100)', fg = 'var(--grape-600)' }) => {
  const ini = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: '50%', background: bg, color: fg, flex: '0 0 auto',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)',
    fontWeight: 800, fontSize: size * 0.38 }}>{ini || '?'}</span>;
};
const HeaderBar = ({ title, onBack, tint = 'var(--ink-900)', right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 18px 12px' }}>
    <button onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: tint, fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
    <h1 style={{ margin: 0, flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: tint }}>{title}</h1>
    {right}
  </div>
);

/* ---------- CHAT LIST ---------- */
const CONVOS = [
  { id: 'asror', name: 'Asrorbek Abrayev', preview: 'Zo‘r, Jang qilamiz!', time: '10:14', unread: 2, online: true, bg: 'var(--coral-100)', fg: 'var(--coral-600)' },
  { id: 'guli', name: 'Guli Mag‘rufovna', preview: 'Rahmat! 👍', time: 'Kecha', unread: 0, bg: 'var(--teal-100)', fg: 'var(--teal-600)' },
  { id: 'grp', name: 'Beginner 1 guruhi', preview: 'Ismoil: Uy vazifasi-chi?', time: 'Du', unread: 5, bg: 'var(--amber-100)', fg: 'var(--amber-700)' },
  { id: 'farid', name: 'Faridun Sobirov', preview: 'Ko‘rishguncha!', time: 'Sesh', unread: 0, bg: 'var(--grape-100)', fg: 'var(--grape-600)' },
];
function ChatListScreen({ back, open }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <HeaderBar title="Suhbatlar" onBack={back} right={<button style={{ border: 'none', background: 'var(--ink-100)', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', color: 'var(--ink-700)', fontSize: 20 }}><I n="magnifying-glass" w="bold" /></button>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CONVOS.map((c) => (
          <button key={c.id} onClick={() => open(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13,
            padding: '12px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 22, boxShadow: 'var(--shadow-xs)',
            cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ position: 'relative' }}>
              <Av name={c.name} size={50} bg={c.bg} fg={c.fg} />
              {c.online ? <span style={{ position: 'absolute', right: 1, bottom: 1, width: 13, height: 13, borderRadius: '50%', background: 'var(--success-500)', border: '2px solid #fff' }} /> : null}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, color: 'var(--ink-400)', flex: '0 0 auto' }}>{c.time}</span>
              </span>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: c.unread ? 700 : 600, fontSize: 14, color: c.unread ? 'var(--ink-700)' : 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.preview}</span>
                {c.unread ? <span style={{ flex: '0 0 auto', minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999, background: 'var(--coral-500)', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span> : null}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- CHAT THREAD ---------- */
const Bubble = ({ side, name, time, children }) => {
  const me = side === 'me';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', maxWidth: '80%', alignSelf: me ? 'flex-end' : 'flex-start' }}>
      {name && !me ? <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12, color: 'var(--grape-600)', margin: '0 0 3px 14px' }}>{name}</span> : null}
      <div style={{ padding: '11px 15px', background: me ? 'var(--coral-500)' : '#fff', color: me ? '#fff' : 'var(--ink-900)',
        fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15.5, lineHeight: 1.4, borderRadius: 20,
        borderBottomRightRadius: me ? 6 : 20, borderBottomLeftRadius: me ? 20 : 6,
        boxShadow: me ? '0 4px 12px rgba(255,107,74,.28)' : 'var(--shadow-sm)', border: me ? 'none' : '1px solid var(--line)' }}>{children}</div>
      {time ? <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11, color: 'var(--ink-400)', margin: me ? '4px 6px 0 0' : '4px 0 0 6px' }}>{time}</span> : null}
    </div>
  );
};
function ChatThreadScreen({ back, peer, openPeer }) {
  const grp = peer.id === 'grp';
  const [msgs, setMsgs] = React.useState([
    { s: 'them', n: grp ? 'Ismoil' : peer.name, t: '10:12', x: 'Salom! Bugun mashq qilamizmi?' },
    { s: 'me', t: '10:13', x: 'Albatta, 5 daqiqada tayyorman 💪' },
    { s: 'them', n: grp ? 'Ismoil' : peer.name, t: '10:14', x: 'Zo‘r — Jang qilamiz!' },
  ]);
  const [text, setText] = React.useState('');
  const endRef = React.useRef(null);
  React.useEffect(() => { if (endRef.current) endRef.current.parentNode.scrollTop = endRef.current.offsetTop + 999; }, [msgs]);
  const send = () => { const t = text.trim(); if (!t) return; try { window.LumioSound.unlock(); window.LumioSound.play('message'); } catch (e) {} setMsgs([...msgs, { s: 'me', t: '10:15', x: t }]); setText(''); };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 16px 12px', background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-900)', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
        <span style={{ position: 'relative' }}><Av name={peer.name} size={42} bg={peer.bg} fg={peer.fg} />
          {peer.online ? <span style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: '50%', background: 'var(--success-500)', border: '2px solid #fff' }} /> : null}</span>
        <span onClick={() => !grp && openPeer && openPeer({ name: peer.name, bg: peer.bg, fg: peer.fg, online: peer.online })} style={{ flex: 1, cursor: grp ? 'default' : 'pointer' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink-900)' }}>{peer.name}</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, color: peer.online ? 'var(--success-600)' : 'var(--ink-400)' }}>{peer.online ? 'Onlayn' : (grp ? '12 a‘zo' : 'Yaqinda ko‘rdi')}</div>
        </span>
        <button style={{ border: 'none', background: 'var(--ink-100)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: 'var(--ink-700)', fontSize: 19 }}><I n="phone" w="fill" /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignSelf: 'center', background: 'var(--ink-100)', color: 'var(--ink-500)', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, padding: '5px 12px', borderRadius: 999 }}>Bugun</div>
        {msgs.map((m, i) => <Bubble key={i} side={m.s} name={m.n} time={m.t}>{m.x}</Bubble>)}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,.95)', borderTop: '1px solid var(--line)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 8px 0 16px', background: 'var(--bg-app)', borderRadius: 26, border: '1px solid var(--line)' }}>
          <input value={text} placeholder="Xabar yozing…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '12px 0', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15.5, color: 'var(--ink-900)', minWidth: 0 }} />
          <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 22, padding: 6 }}><I n="paperclip" w="bold" /></button>
        </div>
        <button onClick={send} style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'var(--coral-500)', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(255,107,74,.4)' }}><I n="paper-plane-right" w="fill" /></button>
      </div>
    </div>
  );
}

/* ---------- LEADERBOARD ---------- */
const LB = [
  { r: 1, n: 'Aliyor Sarmanov', xp: '10722', bg: 'var(--grape-100)', fg: 'var(--grape-600)' },
  { r: 2, n: 'Faridun Sobirov', xp: '10004', bg: 'var(--teal-100)', fg: 'var(--teal-600)' },
  { r: 3, n: 'Guli Mag‘rufovna', xp: '9069', bg: 'var(--coral-100)', fg: 'var(--coral-600)' },
  { r: 4, n: 'Farruxjon Sattarov', xp: '8536', bg: 'var(--amber-100)', fg: 'var(--amber-700)' },
  { r: 5, n: 'Shabbona Axmanova', xp: '8414', bg: 'var(--sky-100)', fg: 'var(--sky-600)' },
  { r: 6, n: 'Doniyor Qosimov', xp: '7980', bg: 'var(--grape-100)', fg: 'var(--grape-600)' },
];
function Star({ v }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', background: 'var(--surface-tint)', border: '1px solid var(--line)', borderRadius: 999 }}>
    <I n="star" w="fill" s={17} c="var(--amber-500)" /><span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink-900)' }}>{v}</span></span>;
}
function LeaderboardScreen({ back, openPeer }) {
  const [lvl, setLvl] = React.useState('Beginner');
  const Row = ({ r, n, xp, bg, fg, hl }) => (
    <button onClick={() => !hl && openPeer && openPeer({ name: n, xp, bg, fg, rank: r })} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fff', borderRadius: 22,
      border: hl ? '2px solid var(--coral-500)' : '1px solid var(--line)', boxShadow: hl ? '0 8px 20px rgba(255,107,74,.18)' : 'var(--shadow-xs)', cursor: hl ? 'default' : 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
      <span style={{ width: 30, textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: r <= 3 ? 'var(--coral-500)' : 'var(--ink-500)' }}>{r}</span>
      <Av name={n} size={42} bg={bg} fg={fg} />
      <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--ink-900)', lineHeight: 1.15 }}>{n}</span>
      <Star v={xp} />
    </button>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--grad-warm)', padding: '6px 18px 16px', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
          <h1 style={{ margin: 0, flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: '#fff' }}>Peshqadamlar jadvali</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Av name="jack" size={48} bg="rgba(255,255,255,.25)" fg="#fff" />
          <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: '#fff' }}>jack</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <span style={{ background: '#fff', color: 'var(--coral-600)', borderRadius: 999, padding: '4px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>Beginner</span>
            <span style={{ background: '#fff', borderRadius: 999, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I n="star" w="fill" s={15} c="var(--amber-500)" /><b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink-900)' }}>202</b></span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 14, paddingBottom: 2 }}>
          {['Starter', 'Beginner', 'Elementary', 'Pre-Intermediate'].map((t) => (
            <button key={t} onClick={() => setLvl(t)} style={{ flex: '0 0 auto', height: 38, padding: '0 16px', border: 'none', borderRadius: 999,
              background: lvl === t ? '#fff' : 'transparent', color: lvl === t ? 'var(--ink-900)' : 'rgba(255,255,255,.85)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: lvl === t ? 'var(--shadow-sm)' : 'none' }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row r={73764} n="jack" xp="202" bg="var(--ink-100)" fg="var(--ink-500)" hl />
        <div style={{ height: 4 }} />
        {LB.map((p) => <Row key={p.r} {...p} />)}
      </div>
    </div>
  );
}

/* ---------- PROFILE (Akkaunt) ---------- */
function ProfileScreen({ back, go }) {
  const Stat = ({ k, v }) => (<div style={{ textAlign: 'left' }}>
    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink-500)' }}>{k}</div>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink-900)' }}>{v}</div></div>);
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', paddingBottom: 24 }}>
      <div style={{ background: 'var(--grad-warm)', padding: '6px 18px 22px', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
          <h1 style={{ margin: 0, flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: '#fff' }}>Akkaunt</h1>
          <span style={{ background: 'rgba(255,255,255,.95)', borderRadius: 999, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><I n="star" w="fill" s={17} c="var(--amber-500)" /><b style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink-900)' }}>9069</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Av name="Guli M" size={64} bg="rgba(255,255,255,.25)" fg="#fff" />
          <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: '#fff' }}>Guli Mag‘rufovna</span>
          <button onClick={() => go('chatlist')} style={{ border: 'none', background: 'rgba(255,255,255,.95)', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', color: 'var(--coral-600)', fontSize: 21 }}><I n="chat-circle-dots" w="fill" /></button>
        </div>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Level banner */}
        <div style={{ background: 'var(--grad-cool)', borderRadius: 26, padding: 22, boxShadow: 'var(--clay-sky)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: '#fff' }}>Beginner 3</div>
          <span style={{ display: 'inline-block', marginTop: 10, background: '#fff', color: 'var(--sky-600)', borderRadius: 999, padding: '7px 16px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>Hozirgi daraja</span>
          <I n="plant" w="fill" s={70} c="rgba(255,255,255,.5)" style={{ position: 'absolute', right: 16, bottom: 8 }} />
        </div>
        {/* Battle stats */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)' }}>
          <span style={{ display: 'inline-block', background: 'var(--bg-tint)', borderRadius: 999, padding: '8px 16px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>Jang statistikasi</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
            <Stat k="Janglar:" v="551" /><Stat k="Yutuqlar:" v="531" /><Stat k="Mag‘lubiyat:" v="20" />
          </div>
        </div>
        {/* Certificates */}
        <button onClick={() => {}} style={{ width: '100%', textAlign: 'left', background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--ink-900)' }}>Sertifikatlar ro‘yxati</span>
          <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-tint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-900)', fontSize: 19 }}><I n="arrow-up-right" w="bold" /></span>
        </button>
        {/* Medals */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--ink-900)', marginBottom: 14 }}>Medallar</div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[['var(--amber-500)', 'trophy'], ['var(--grape-500)', 'medal'], ['var(--teal-500)', 'crown-simple'], ['var(--coral-500)', 'lightning']].map(([c, ic], i) => (
              <span key={i} style={{ width: 58, height: 58, borderRadius: 18, background: c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: `0 6px 0 rgba(0,0,0,.12)` }}><I n={ic} w="fill" /></span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- BATTLE RESULT (Jang natijasi) ---------- */
const Confetti = () => {
  const cs = ['#FF6B4A', '#FFB02E', '#14B8AC', '#8B5CF6', '#2E97FF'];
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    {Array.from({ length: 26 }).map((_, i) => {
      const left = (i * 37 % 100);
      return <span key={i} style={{ position: 'absolute', left: left + '%', top: -12, width: 8, height: 12, background: cs[i % cs.length], borderRadius: 2,
        animation: `lumio-confetti ${1000 + (i * 53 % 700)}ms var(--ease-out) ${(i * 40 % 500)}ms both` }} />;
    })}</div>;
};
function RPill({ kind, icon, value, filled }) {
  const c = { correct: 'var(--success-500)', wrong: 'var(--danger-500)', star: 'var(--amber-500)', time: 'var(--sky-500)' }[kind];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 6px', borderRadius: 999, background: filled ? 'rgba(255,255,255,.24)' : '#fff', boxShadow: filled ? 'none' : 'var(--shadow-xs)' }}>
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: c, color: '#fff', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I n={icon} w="bold" /></span>
    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, paddingRight: 8, color: filled ? '#fff' : 'var(--ink-900)' }}>{value}</span></span>;
}
function BattleResultScreen({ back }) {
  React.useEffect(() => { try { window.LumioSound.unlock(); window.LumioSound.play('win'); } catch (e) {} }, []);
  const ans = [
    ['They want to see me but', 'I', "don’t want to see", 'them'],
    ['', 'Is it going', 'to rain?'],
    ['My grandparents had a/an', 'difficult', 'childhood'],
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      <h1 style={{ margin: 0, padding: '8px 20px 12px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)' }}>Jang natijasi</h1>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Winner */}
        <div className="lumio-bounce-in" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#FFCB5C 0%,#FFB02E 100%)', borderRadius: 24, padding: 18, boxShadow: 'var(--clay-amber)' }}>
          <Confetti />
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-800)' }}>G‘olib!</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--ink-900)', margin: '2px 0 12px' }}>jack</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <RPill kind="correct" icon="check" value="10" filled /><RPill kind="wrong" icon="x" value="0" filled />
              <RPill kind="star" icon="star" value="1" filled /><RPill kind="time" icon="clock" value="1m 43s" filled />
            </div>
          </div>
        </div>
        {/* Runner up */}
        <div style={{ background: 'var(--coral-50)', borderRadius: 24, padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-500)' }}>2-o‘rin</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)', margin: '2px 0 12px' }}>Ismoil Khakimjonov</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <RPill kind="correct" icon="check" value="7" /><RPill kind="wrong" icon="x" value="3" />
            <RPill kind="star" icon="star" value="0" /><RPill kind="time" icon="clock" value="3m 20s" />
          </div>
        </div>
        {/* Answers */}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, color: 'var(--ink-900)', marginTop: 2 }}>Sizning javoblaringiz:</div>
        {ans.map((parts, i) => (
          <div key={i} style={{ background: 'var(--success-50)', borderRadius: 18, padding: '16px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink-900)', lineHeight: 1.5 }}>
            {parts.map((p, j) => p === '' ? null : (j % 2 === 1
              ? <span key={j} style={{ background: 'var(--success-500)', color: '#fff', borderRadius: 10, padding: '4px 12px' }}>{p}</span>
              : <span key={j}>{p}</span>))}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 18px 22px' }}><Btn block variant="teal" onClick={back}>Ortga qaytish</Btn></div>
    </div>
  );
}

/* ---------- NOTIFICATIONS (Bildirishnomalar) ---------- */
function NotifItem({ type = 'system', icon, title, body, time, read = false, isNew = false, priority = false, onClick }) {
  const tones = { achievement: ['var(--amber-50)', 'var(--amber-600)'], battle: ['var(--coral-50)', 'var(--coral-600)'],
    social: ['var(--grape-100)', 'var(--grape-600)'], lesson: ['var(--teal-50)', 'var(--teal-600)'], system: ['var(--ink-100)', 'var(--ink-600)'] };
  const [tile, fg] = tones[type] || tones.system;
  const surface = priority ? 'var(--amber-50)' : read ? 'transparent' : 'var(--coral-50)';
  const borderCol = priority ? 'var(--amber-300)' : read ? 'var(--line)' : 'var(--coral-100)';
  return (
    <button onClick={onClick} style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 16px',
      textAlign: 'left', background: surface, border: `1px solid ${borderCol}`, borderRadius: 22, boxShadow: read ? 'none' : 'var(--shadow-xs)',
      cursor: 'pointer', overflow: 'hidden', WebkitTapHighlightColor: 'transparent' }}>
      {priority ? <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: 'var(--amber-500)' }} /> : null}
      <span style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: 14, background: tile, color: fg, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 23, marginLeft: priority ? 4 : 0 }}><I n={icon} w="fill" /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: read ? 600 : 800, fontSize: 16, color: read ? 'var(--ink-600)' : 'var(--ink-900)', lineHeight: 1.2 }}>{title}</span>
          {priority ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 20, padding: '0 8px', borderRadius: 999, background: 'var(--amber-500)', color: 'var(--ink-900)', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 10.5, letterSpacing: '.03em' }}><I n="warning" w="fill" s={12} />MUHIM</span>
            : isNew ? <span style={{ height: 20, padding: '0 8px', borderRadius: 999, background: 'var(--coral-500)', color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 10.5, letterSpacing: '.03em', display: 'inline-flex', alignItems: 'center' }}>YANGI</span> : null}
        </span>
        {body ? <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13.5, color: read ? 'var(--ink-400)' : 'var(--ink-600)', lineHeight: 1.4 }}>{body}</span> : null}
        {time ? <span style={{ display: 'block', marginTop: 6, fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11.5, color: 'var(--ink-400)' }}>{time}</span> : null}
      </span>
      {!read ? <span style={{ flex: '0 0 auto', width: 10, height: 10, borderRadius: '50%', marginTop: 6, background: priority ? 'var(--amber-500)' : 'var(--coral-500)' }} /> : null}
    </button>
  );
}
function NotificationsScreen({ back }) {
  const init = [
    { g: 'Bugun', id: 1, type: 'battle', icon: 'sword', title: 'Asror sizni Jangga chaqirdi', body: 'Beginner 1 · 10 savol · qabul qilasizmi?', time: 'Hozir', isNew: true, read: false },
    { g: 'Bugun', id: 2, type: 'achievement', icon: 'trophy', title: '5 kunlik seriya!', body: 'Ajoyib — +50 XP qo‘shildi', time: '2 soat oldin', read: false },
    { g: 'Bugun', id: 3, type: 'system', icon: 'warning', title: 'Obuna tugaydi', body: 'Premium obunangiz 2 kundan keyin tugaydi', time: '3 soat oldin', priority: true, read: false },
    { g: 'Kecha', id: 4, type: 'social', icon: 'chat-circle-dots', title: 'Guli yangi xabar yubordi', body: 'Rahmat! Ko‘rishguncha 👋', time: 'Kecha 18:20', read: true },
    { g: 'Kecha', id: 5, type: 'lesson', icon: 'book-open', title: 'Bugungi dars tayyor', body: 'Unit 1.2 — 10 daqiqa', time: 'Kecha 09:00', read: true },
    { g: 'Avvalroq', id: 6, type: 'achievement', icon: 'medal', title: '“Birinchi g‘alaba” medali', body: 'Jangda birinchi g‘alabangiz!', time: '12-iyun', read: true },
  ];
  const [items, setItems] = React.useState(init);
  const read = (id) => setItems((xs) => xs.map((x) => x.id === id ? { ...x, read: true, isNew: false } : x));
  const allRead = () => setItems((xs) => xs.map((x) => ({ ...x, read: true, isNew: false })));
  const groups = ['Bugun', 'Kecha', 'Avvalroq'];
  const unreadIn = (g) => items.filter((x) => x.g === g && !x.read).length;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <HeaderBar title="Bildirishnomalar" onBack={back} right={
        <button onClick={allRead} style={{ border: 'none', background: 'var(--ink-100)', height: 36, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--ink-700)' }}>Hammasini o‘qildi</button>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g) => {
          const rows = items.filter((x) => x.g === g);
          if (!rows.length) return null;
          const c = unreadIn(g);
          return (
            <React.Fragment key={g}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 4px 2px' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--ink-500)', letterSpacing: '.04em', textTransform: 'uppercase' }}>{g}</span>
                {c ? <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, color: '#fff', background: 'var(--coral-500)', borderRadius: 999, minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 7px' }}>{c}</span> : null}
              </div>
              {rows.map((x, ri) => <div key={x.id} className="lumio-fade-up" style={{ animationDelay: `${ri * 50}ms` }}><NotifItem {...x} onClick={() => read(x.id)} /></div>)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- PUBLIC / PEER PROFILE (boshqa o‘quvchi) ---------- */
function PublicProfileScreen({ back, peer = {}, onMessage, onChallenge }) {
  const p = { name: 'Asrorbek Abrayev', level: 'Beginner 2', xp: '4218', rank: 312, online: true,
    battles: 128, wins: 96, losses: 32, friends: 24, vsWins: 3, vsLosses: 1, mutual: 5,
    bg: 'var(--coral-100)', fg: 'var(--coral-600)', ...peer };
  const [friend, setFriend] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const Stat = ({ k, v, c }) => (<div style={{ textAlign: 'center', flex: 1 }}>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: c || 'var(--ink-900)' }}>{v}</div>
    <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, color: 'var(--ink-500)' }}>{k}</div></div>);
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', paddingBottom: 24 }}>
      {/* Coral header */}
      <div style={{ background: 'var(--grad-warm)', padding: '6px 18px 24px', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff', fontSize: 25, display: 'flex' }}><I n="arrow-left" w="bold" /></button>
          <span style={{ flex: 1 }} />
          <button onClick={() => setMenu(!menu)} style={{ border: 'none', background: 'rgba(255,255,255,.22)', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', color: '#fff', fontSize: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><I n="dots-three" w="bold" /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
          <span style={{ position: 'relative' }}>
            <Av name={p.name} size={88} bg="rgba(255,255,255,.92)" fg="var(--coral-600)" />
            {p.online ? <span style={{ position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: '50%', background: 'var(--success-500)', border: '3px solid #fff' }} /> : null}
          </span>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: '#fff', marginTop: 10 }}>{p.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <span style={{ background: '#fff', color: 'var(--coral-600)', borderRadius: 999, padding: '5px 14px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>{p.level}</span>
            <span style={{ background: 'rgba(255,255,255,.95)', borderRadius: 999, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I n="star" w="fill" s={15} c="var(--amber-500)" /><b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink-900)' }}>{p.xp}</b></span>
            <span style={{ background: 'rgba(255,255,255,.95)', borderRadius: 999, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}><I n="ranking" w="fill" s={15} c="var(--grape-500)" /><b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink-900)' }}>#{p.rank}</b></span>
          </div>
        </div>
        {menu ? (
          <React.Fragment>
            <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <div style={{ position: 'absolute', right: 18, top: 52, zIndex: 10, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-pop)', overflow: 'hidden', minWidth: 180 }}>
              {[['flag', 'Shikoyat qilish', 'var(--ink-800)'], ['prohibit', 'Bloklash', 'var(--danger-500)']].map(([ic, t, c]) => (
                <button key={t} onClick={() => setMenu(false)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', border: 'none', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: c }}><I n={ic} w="fill" s={19} />{t}</button>
              ))}
            </div>
          </React.Fragment>
        ) : null}
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Action row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="primary" iconBefore="chat-circle" onClick={onMessage} style={{ flex: 1 }}>Xabar</Btn>
          <Btn variant="teal" iconBefore="sword" onClick={onChallenge} style={{ flex: 1 }}>Jangga chaqirish</Btn>
          <button onClick={() => setFriend(!friend)} aria-label="Do‘st qo‘shish" style={{ flex: '0 0 auto', width: 54, height: 54, borderRadius: 22, border: 'none', cursor: 'pointer',
            background: friend ? 'var(--success-50)' : '#fff', color: friend ? 'var(--success-600)' : 'var(--coral-500)', boxShadow: 'var(--clay-white)', fontSize: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <I n={friend ? 'user-check' : 'user-plus'} w="fill" /></button>
        </div>

        {/* Battle stats */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)' }}>
          <span style={{ display: 'inline-block', background: 'var(--bg-tint)', borderRadius: 999, padding: '8px 16px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--ink-900)' }}>Jang statistikasi</span>
          <div style={{ display: 'flex', marginTop: 18 }}>
            <Stat k="Janglar" v={p.battles} /><Stat k="Yutuqlar" v={p.wins} c="var(--success-600)" /><Stat k="Mag‘lubiyat" v={p.losses} c="var(--danger-500)" />
          </div>
        </div>

        {/* Head-to-head vs you */}
        <div style={{ background: 'var(--grad-grape)', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-grape)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, opacity: .95 }}>Sizga qarshi</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 12 }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34 }}>{p.vsWins}</div><div style={{ fontWeight: 700, fontSize: 12, opacity: .9 }}>Siz yutdingiz</div></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, opacity: .7 }}>:</div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34 }}>{p.vsLosses}</div><div style={{ fontWeight: 700, fontSize: 12, opacity: .9 }}>U yutdi</div></div>
          </div>
          <I n="sword" w="fill" s={64} c="rgba(255,255,255,.18)" style={{ position: 'absolute', right: 12, bottom: -6 }} />
        </div>

        {/* Friends + medals */}
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink-900)' }}>{p.friends}</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink-500)' }}>Do‘stlar</div>
            <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 11, color: 'var(--coral-500)', marginTop: 4 }}>{p.mutual} umumiy</div>
          </div>
          <div style={{ flex: 2, background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--ink-900)', marginBottom: 12 }}>Medallar</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[['var(--amber-500)', 'trophy'], ['var(--teal-500)', 'crown-simple'], ['var(--coral-500)', 'fire']].map(([c, ic], i) => (
                <span key={i} style={{ width: 48, height: 48, borderRadius: 14, background: c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, boxShadow: '0 5px 0 rgba(0,0,0,.12)' }}><I n={ic} w="fill" /></span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatListScreen, ChatThreadScreen, LeaderboardScreen, ProfileScreen, BattleResultScreen, NotificationsScreen, PublicProfileScreen });
})();
