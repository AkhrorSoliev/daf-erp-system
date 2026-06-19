/* Lumio student-app screens. Uses window primitives from kit.jsx. */
(function () {
const { I, StatChip, FeatureCard, LessonNode, ListRow, Btn, ScreenTitle } = window;

const Scroll = ({ children, pad = true }) => (
  <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', paddingBottom: 104 }}>
    <div style={{ padding: pad ? '0' : 0 }}>{children}</div>
  </div>
);

/* ---------------- HOME (Asosiy) ---------------- */
function HomeScreen({ go }) {
  return (
    <Scroll>
      {/* Coral header */}
      <div style={{ background: 'var(--grad-warm)', padding: '8px 20px 26px', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => go('profile')} style={{ border: 'none', cursor: 'pointer', padding: 0, width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19,
            border: '2px solid rgba(255,255,255,.7)' }}>J</button>
          <div style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: '#fff' }}>Salom, Jasur!</div>
          <button onClick={() => go('chatlist')} style={{ position: 'relative', border: 'none', background: 'transparent', color: '#fff', fontSize: 23, cursor: 'pointer', padding: 0, display: 'flex' }}><I n="chat-circle" w="fill" /></button>
          <span style={{ position: 'relative', color: '#fff', fontSize: 23 }}>
            <button onClick={() => go('notifications')} style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 23, cursor: 'pointer', padding: 0, display: 'flex' }}><I n="bell" w="fill" /></button>
            <span style={{ position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: '50%', background: 'var(--coral-700)',
              border: '2px solid #fff', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
          </span>
        </div>
        {/* battle stats */}
        <div onClick={() => go('battle')} style={{ marginTop: 18, background: 'rgba(255,255,255,.18)', borderRadius: 22, padding: '14px 18px', display: 'flex',
          justifyContent: 'space-around', backdropFilter: 'blur(4px)', cursor: 'pointer' }}>
          {[['Janglar', '1'], ['Yutuqlar', '1'], ['Mag‘lubiyat', '0']].map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center', color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12, opacity: .9 }}>{k}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FeatureCard gradient="var(--grad-cool)" lip="var(--clay-sky)" title="Mening lug‘atim" subtitle="Hali so‘zlar yo‘q"
          art="cards-three" onClick={() => go('vocab')} />
        <FeatureCard gradient="var(--grad-grape)" lip="var(--clay-grape)" title="Zoom tadbirlar" art="video-camera" onClick={() => {}} />

        {/* Leaderboard */}
        <div onClick={() => go('leaderboard')} style={{ background: 'var(--grad-sun)', borderRadius: 28, padding: 16, boxShadow: 'var(--clay-amber)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ background: '#fff', borderRadius: 999, padding: '8px 14px', fontFamily: 'var(--font-display)',
              fontWeight: 800, fontSize: 15, color: 'var(--ink-900)', lineHeight: 1.1 }}>Peshqadamlar<br />jadvali</span>
            <span style={{ marginLeft: 'auto', width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--ink-900)', fontSize: 19 }}><I n="trophy" w="fill" /></span>
          </div>
          <div style={{ background: '#fff', borderRadius: 18, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--grape-100)', color: 'var(--grape-600)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800 }}>J</span>
            <span style={{ flex: 1, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--ink-900)' }}>Jasur</span>
            <StatChip icon="lightning" value="201" />
          </div>
        </div>
      </div>
    </Scroll>
  );
}

/* ---------------- LESSONS (Darslar) ---------------- */
const Cloud = ({ s, top, left, right, bottom }) => (<div style={{ position: 'absolute', top, left, right, bottom }}><I n="cloud" w="fill" s={s} c="rgba(91,177,255,.45)" /></div>);
const Spark = ({ s = 22, top, left, right, bottom }) => (<div style={{ position: 'absolute', top, left, right, bottom }}><I n="sparkle" w="fill" s={s} c="var(--amber-400)" /></div>);
const Dash = ({ style }) => (<div style={{ height: 5, borderRadius: 99, backgroundImage: 'repeating-linear-gradient(90deg,var(--sky-400) 0 14px,transparent 14px 26px)', ...style }} />);

function LessonsScreen({ go }) {
  return (
    <Scroll>
      <ScreenTitle>Darslar</ScreenTitle>
      <div style={{ padding: '0 20px' }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: 'var(--clay-white)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)' }}>Starter</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink-500)', margin: '6px 0 16px' }}>
            Siz Starter darslariga qaytmoqchimisiz?</div>
          <Btn block onClick={() => go('quiz')}>Ha, qaytish</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 20px 6px' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)' }}>Beginner 1</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)' }}>0%</span>
      </div>

      {/* Path */}
      <div style={{ position: 'relative', height: 470, margin: '6px 6px 0' }}>
        <Cloud s={56} top={6} right={40} /><Cloud s={38} top={30} right={96} />
        <Spark top={120} left={120} /><Spark s={16} top={70} left={40} /><Spark top={200} left={70} s={18} />
        <Spark top={250} right={120} /><Spark s={16} top={330} left={150} />
        <Dash style={{ position: 'absolute', top: 150, left: 150, width: 90, transform: 'rotate(8deg)' }} />
        <Dash style={{ position: 'absolute', top: 250, left: 70, width: 120 }} />
        <Dash style={{ position: 'absolute', top: 350, left: 150, width: 110, transform: 'rotate(-6deg)' }} />

        <LessonNode label="Unit 1.1" percent={0} state="active" onClick={() => go('unit')} style={{ position: 'absolute', top: 30, left: 24 }} />
        <div style={{ position: 'absolute', top: 64, left: 168, background: '#fff', borderRadius: 16, padding: '10px 14px',
          boxShadow: 'var(--shadow-card)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--ink-900)', maxWidth: 150 }}>
          Sizning darsingiz shu yerda</div>
        <LessonNode label="Unit 1.2" percent={0} state="locked" style={{ position: 'absolute', top: 178, right: 20 }} />
        <LessonNode label="Unit 1.3" percent={0} state="locked" style={{ position: 'absolute', top: 322, left: 20 }} />
      </div>
    </Scroll>
  );
}

/* ---------------- RESOURCES (Resurslar) ---------------- */
function ResourcesScreen() {
  return (
    <Scroll>
      <ScreenTitle>Resurslar</ScreenTitle>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FeatureCard gradient="var(--grad-grape)" lip="var(--clay-grape)" title="Level" art="headphones" h={120} />
        <FeatureCard gradient="var(--grad-warm)" lip="var(--clay-coral)" title="Kitoblar" art="books" h={120} />
        <FeatureCard gradient="var(--grad-cool)" lip="var(--clay-sky)" title="Podkastlar" art="microphone" h={120} />
      </div>
    </Scroll>
  );
}

/* ---------------- MORE (Ko‘proq) ---------------- */
function MoreScreen({ go }) {
  return (
    <Scroll>
      <ScreenTitle>Ko‘proq</ScreenTitle>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ListRow icon="shopping-bag-open" tone="grape" label="Xaridlar" />
        <ListRow icon="translate" tone="teal" label="Tarjimon" />
        <ListRow icon="chat-teardrop-dots" tone="coral" label="FAQ" />
        <ListRow icon="info" tone="amber" label="Biz haqimizda" />
        <ListRow icon="gear" tone="grape" label="Sozlamalar" onClick={() => go('settings')} />
        <ListRow icon="sign-out" tone="ink" label="Chiqish" />
      </div>
    </Scroll>
  );
}

/* ---------------- SETTINGS (Sozlamalar) + language sheet ---------------- */
function SettingsScreen({ back }) {
  const [sound, setSound] = React.useState(true);
  const [sheet, setSheet] = React.useState(false);
  const [lang, setLang] = React.useState('uz');
  const Toggle = () => (
    <button onClick={() => { var on = !sound; try { window.LumioSound.unlock(); window.LumioSound.setEnabled(on); if (on) window.LumioSound.play('toggle'); } catch (e) {} setSound(on); }} style={{ position: 'relative', width: 54, height: 32, border: 'none', borderRadius: 999,
      background: sound ? 'var(--success-500)' : 'var(--ink-300)', boxShadow: 'var(--inset-soft)', cursor: 'pointer' }}>
      <span style={{ position: 'absolute', top: 3, left: sound ? 25 : 3, width: 26, height: 26, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 5px rgba(14,42,61,.25)', transition: 'left .2s var(--ease-bounce)' }} /></button>
  );
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 20px 14px' }}>
        <button onClick={back} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-900)', fontSize: 24 }}>
          <I n="arrow-left" w="bold" /></button>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)' }}>Sozlamalar</h1>
      </div>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ListRow icon="speaker-high" tone="coral" label="Ovoz effektlari" chevron={false} trailing={<Toggle />} />
        <ListRow icon="sun" tone="amber" label="Mavzu" />
        <ListRow icon="translate" tone="teal" label="Til" onClick={() => setSheet(true)} />
        <ListRow icon="user-circle" tone="grape" label="Hisobni boshqarish" />
      </div>

      {sheet ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          <div onClick={() => setSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(14,42,61,.45)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30,
            padding: '14px 20px 32px' }}>
            <div style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--ink-200)', margin: '0 auto 14px' }} />
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)', marginBottom: 16 }}>Til</div>
            {[['en', 'English (UK)', '🇬🇧'], ['uz', 'O‘zbekcha', '🇺🇿']].map(([v, l, f]) => (
              <button key={v} onClick={() => { setLang(v); setSheet(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', marginBottom: 10, background: '#fff', border: `2px solid ${lang === v ? 'var(--coral-500)' : 'var(--line)'}`,
                borderRadius: 18, cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink-900)' }}>
                <span style={{ fontSize: 24 }}>{f}</span>{l}
                {lang === v ? <I n="check-circle" w="fill" s={22} c="var(--coral-500)" style={{ marginLeft: 'auto' }} /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- LESSON QUIZ ---------------- */
function QuizScreen({ exit }) {
  const opts = ['O‘qituvchi', 'Shifokor', 'Muhandis', 'Talaba'];
  const [pick, setPick] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  const correct = 0;
  const checked = pick !== null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
      {leaving ? <window.LeaveDialog onStay={() => setLeaving(false)} onLeave={exit} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 18px 10px' }}>
        <button onClick={() => setLeaving(true)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-500)', fontSize: 26 }}><I n="x" w="bold" /></button>
        <div style={{ flex: 1, height: 12, background: 'var(--bg-sunk)', borderRadius: 99, boxShadow: 'var(--inset-soft)', overflow: 'hidden' }}>
          <div style={{ width: '35%', height: '100%', background: 'var(--coral-500)', borderRadius: 99 }} /></div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--coral-500)', fontSize: 17 }}>
          <I n="heart" w="fill" s={20} c="var(--coral-500)" />3</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)', marginBottom: 18 }}>Tarjimani tanlang</div>
        {/* flashcard */}
        <div style={{ background: '#fff', borderRadius: 26, padding: 24, boxShadow: 'var(--clay-white)', textAlign: 'center', marginBottom: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 22 }}>🇬🇧</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--ink-900)' }}>Teacher</span>
          </div>
          <button style={{ display: 'block', margin: '0 auto', border: 'none', background: 'var(--bg-tint)', borderRadius: 999, width: 56, height: 56,
            cursor: 'pointer', color: 'var(--coral-500)', fontSize: 26 }}><I n="speaker-high" w="fill" /></button>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink-500)', marginTop: 14, fontStyle: 'italic' }}>
            “A teacher inspires students.”</div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {opts.map((o, i) => {
            const isPick = pick === i;
            const state = checked && i === correct ? 'right' : checked && isPick && i !== correct ? 'wrong' : isPick ? 'sel' : 'idle';
            const styles = {
              idle: { bg: '#fff', bd: 'var(--line)', fg: 'var(--ink-900)' },
              sel: { bg: 'var(--coral-50)', bd: 'var(--coral-500)', fg: 'var(--ink-900)' },
              right: { bg: 'var(--success-50)', bd: 'var(--success-500)', fg: 'var(--success-600)' },
              wrong: { bg: 'var(--danger-50)', bd: 'var(--danger-500)', fg: 'var(--danger-600)' },
            }[state];
            return (
              <button key={i} onClick={() => { try { window.LumioSound.unlock(); window.LumioSound.play(i === correct ? 'correct' : 'wrong'); } catch (e) {} setPick(i); }} className={state === 'wrong' ? 'lumio-shake' : ''} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
                background: styles.bg, border: `2px solid ${styles.bd}`, borderRadius: 18, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: styles.fg, WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${styles.bd}`, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 13, color: styles.fg }}>{i + 1}</span>
                {o}
                {state === 'right' ? <I n="check-circle" w="fill" s={22} c="var(--success-500)" style={{ marginLeft: 'auto' }} /> : null}
                {state === 'wrong' ? <I n="x-circle" w="fill" s={22} c="var(--danger-500)" style={{ marginLeft: 'auto' }} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '14px 22px 24px' }}>
        <Btn block variant={checked ? (pick === correct ? 'teal' : 'primary') : 'secondary'} onClick={() => checked && exit()}>
          {checked ? (pick === correct ? 'Ajoyib! Davom etish' : 'Qayta urinish') : 'Tekshirish'}</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, LessonsScreen, ResourcesScreen, MoreScreen, SettingsScreen, QuizScreen });
})();
