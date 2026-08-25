import { parseChapterPage } from './dib-chapter.parser';

// Haqiqiy DiB markupi: Focus va Recommended bo'limlari CSS klassi bilan emas,
// SARLAVHA RASMI bilan ajratilgan — `ti_grammar_f.gif` va `ti_grammar_r.gif`.
const TOC = `
<html><body>
<div class="bot_000">
<img src="images/ti_grammar_f.gif" width=207 height=17 border=0 alt="Focus" title="Focus">
</div>
<div class="bot_150 toc_ind_23"><table class="unbor_toc_num">
<tr><td><a href="http://coerll.utexas.edu/gg/gr/no_02.html" target="offsite">Nouns gender</a></td></tr>
<tr><td><a href="http://coerll.utexas.edu/gg/gr/vi_05.html" target="offsite">haben</a></td></tr>
</table></div>
<div class="bot_000">
<img src="images/ti_grammar_r.gif" width=207 height=17 border=0 alt="Recommended" title="Recommended">
</div>
<div class="bot_150 toc_ind_23"><table class="unbor_toc_num">
<tr><td><a href="http://coerll.utexas.edu/gg/gr/cas_02.html" target="offsite">nominative case</a></td></tr>
</table></div>
</body></html>`;

describe('parseChapterPage', () => {
  it('Focus va Recommended grammatikani ajratadi', () => {
    const c = parseChapterPage(TOC, 1);
    expect(c.chapter).toBe(1);
    expect(c.grammarFocus).toEqual(['no_02', 'vi_05']);
    expect(c.grammarRecommended).toEqual(['cas_02']);
  });

  it('bir xil kod ikki marta chiqsa, bir marta qaytaradi', () => {
    const dup = TOC.replace(
      '</table></div>\n<div class="bot_000">\n<img src="images/ti_grammar_r.gif"',
      '<tr><td><a href="http://coerll.utexas.edu/gg/gr/vi_05.html">haben</a></td></tr>'
        + '</table></div>\n<div class="bot_000">\n<img src="images/ti_grammar_r.gif"',
    );
    expect(parseChapterPage(dup, 1).grammarFocus).toEqual(['no_02', 'vi_05']);
  });

  it('grammatika havolasi yo\'q sahifada bo\'sh ro\'yxat', () => {
    const c = parseChapterPage('<html></html>', 7);
    expect(c).toEqual({ chapter: 7, grammarFocus: [], grammarRecommended: [] });
  });
});
