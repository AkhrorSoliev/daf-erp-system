import {
  parseCategoryMembers,
  parseWikitext,
  parseWikitextResponse,
  parseH5pPage,
} from './zum.parser';

const CATEGORY = JSON.stringify({
  query: {
    categorymembers: [
      { ns: 0, title: 'Adjektive - Antonyme - 1 (Interaktive Übungen)' },
      { ns: 14, title: 'Kategorie:Adjektive' },
      { ns: 6, title: 'Datei:CC-by.png' },
    ],
  },
});

const WIKITEXT = `
===== Adjektive - Antonyme| Flash-Karten =====
{{h5p-zum|id=39679|height=850}}
===== Adjektive - Gegensatzpaare | Bild-Paare =====
{{h5p-zum|id=30963|height=700}}
<noinclude>
[[Kategorie:A1]]
[[Kategorie:Adjektive]]
[[Kategorie:Interaktive Übungen]]
</noinclude>`;

const H5P_PAGE = `<html><script type="application/json"
 data-drupal-selector="drupal-settings-json">{"h5p":{"H5PIntegration":{"contents":{
 "cid-39679":{"library":"H5P.Flashcards 1.7","jsonContent":"{\\"cards\\":[{\\"text\\":\\"dick\\"}]}",
 "metadata":{"license":"CC BY 4.0","title":"Antonyme","authors":[{"name":"C Pannen"}]}}}}}}</script></html>`;

// MediaWiki `action=parse&prop=wikitext` javobining haqiqiy shakli — vikimatn
// `wikitext['*']` ichida JSON satr sifatida qochirilgan holda yotadi
// (masalan `Interaktive Übungen` shu tarzda ko'rinadi).
const WIKITEXT_ENVELOPE = JSON.stringify({
  parse: { title: 'Adjektive - Antonyme - 1', wikitext: { '*': WIKITEXT } },
});

// Haqiqiy H5P sahifasida yuqori darajadagi `metadata.license` sahifaning
// o'zinikidir; `jsonContent` ichidagi har bir slayd/element o'zining
// litsenziyasini olib yurishi mumkin (masalan CC0 yoki "U" — noma'lum), va u
// UMUMAN mustaqil. Parser faqat yuqori darajadagi litsenziyani o'qishi kerak.
const NESTED_JSON_CONTENT = JSON.stringify({
  interactiveVideo: {
    assets: {
      interactions: [{ action: { metadata: { license: 'CC0 1.0' } } }],
    },
  },
});
const H5P_PAGE_NESTED_LICENSE = `<html><script type="application/json"
 data-drupal-selector="drupal-settings-json">${JSON.stringify({
   h5p: {
     H5PIntegration: {
       contents: {
         'cid-1': {
           library: 'H5P.InteractiveVideo 1.0',
           jsonContent: NESTED_JSON_CONTENT,
           metadata: {
             license: 'CC BY-NC-SA 4.0',
             title: 'Video mashq',
             authors: [{ name: 'X' }],
           },
         },
       },
     },
   },
 })}</script></html>`;

describe('parseCategoryMembers', () => {
  it('faqat maqolalarni oladi, toifa va faylni tashlab ketadi', () => {
    expect(parseCategoryMembers(CATEGORY)).toEqual([
      'Adjektive - Antonyme - 1 (Interaktive Übungen)',
    ]);
  });

  it('bo\'sh javobda bo\'sh ro\'yxat', () => {
    expect(parseCategoryMembers('{"query":{"categorymembers":[]}}')).toEqual([]);
  });
});

describe('parseWikitext', () => {
  it('H5P id\'larini va darajani oladi', () => {
    const p = parseWikitext(WIKITEXT, 'Adjektive - Antonyme - 1');
    expect(p.h5pIds).toEqual([39679, 30963]);
    expect(p.level).toBe('A1.1');
  });

  it('mavzu toifalarini oladi, daraja va xizmat toifalarisiz', () => {
    const p = parseWikitext(WIKITEXT, 'Adjektive - Antonyme - 1');
    expect(p.topics).toEqual(['Adjektive']);
  });

  it('darajasi ko\'rsatilmagan sahifa uchun null', () => {
    const p = parseWikitext('{{h5p-zum|id=1}}', 'X');
    expect(p.level).toBeNull();
  });

  it('A2 toifasini A2.1 ga o\'giradi', () => {
    expect(parseWikitext('[[Kategorie:A2]]', 'X').level).toBe('A2.1');
  });
});

describe('parseWikitextResponse', () => {
  it('MediaWiki konvertini yechib, xuddi shu natijani beradi — qochirilgan yoki xizmat toifasi mavzuga sizmaydi', () => {
    const fromResponse = parseWikitextResponse(
      WIKITEXT_ENVELOPE,
      'Adjektive - Antonyme - 1',
    );
    const fromPlainText = parseWikitext(WIKITEXT, 'Adjektive - Antonyme - 1');

    expect(fromResponse).toEqual(fromPlainText);
    // Faqat haqiqiy mavzu qoladi — na qochirilgan, na xizmat toifasi sizib kirmaydi.
    expect(fromResponse.topics).toEqual(['Adjektive']);
  });

  it('konvert buzilgan yoki vikimatn yo\'q bo\'lsa, xato tashlamay bo\'sh sahifa qaytaradi', () => {
    expect(parseWikitextResponse('{bu json emas', 'X')).toEqual({
      title: 'X',
      h5pIds: [],
      level: null,
      topics: [],
    });
    expect(parseWikitextResponse('{"parse":{}}', 'X')).toEqual({
      title: 'X',
      h5pIds: [],
      level: null,
      topics: [],
    });
    expect(parseWikitextResponse('{"error":{"code":"missingtitle"}}', 'X')).toEqual({
      title: 'X',
      h5pIds: [],
      level: null,
      topics: [],
    });
  });
});

describe('parseH5pPage', () => {
  it('mashq turini, mazmunini va litsenziyasini oladi', () => {
    const e = parseH5pPage(H5P_PAGE)!;
    expect(e.h5pId).toBe(39679);
    expect(e.library).toBe('H5P.Flashcards 1.7');
    expect(e.content).toEqual({ cards: [{ text: 'dick' }] });
    expect(e.license).toBe('CC BY 4.0');
    expect(e.attribution).toContain('C Pannen');
  });

  it('H5P ma\'lumoti yo\'q sahifada null', () => {
    expect(parseH5pPage('<html></html>')).toBeNull();
  });

  it('litsenziyasi yo\'q mashqni o\'tkazmaydi', () => {
    const noLic = H5P_PAGE.replace('"license":"CC BY 4.0",', '');
    expect(parseH5pPage(noLic)).toBeNull();
  });

  it('ichki elementning boshqa litsenziyasiga qaramay, yuqori darajadagi litsenziyani oladi', () => {
    const e = parseH5pPage(H5P_PAGE_NESTED_LICENSE)!;
    expect(e.license).toBe('CC BY-NC-SA 4.0');
  });
});
