import { DafMediaInhaltService } from './daf-media-inhalt.service';

const config = { get: (k: string) => (k === 'R2_PUBLIC_URL' ? 'https://r2.example' : undefined) };

function fakePrisma(rows: any) {
  return {
    dafLexeme: { findMany: jest.fn(async () => rows.woerter ?? []) },
    dafSentence: { findMany: jest.fn(async () => rows.saetze ?? []) },
    dafPhrase: { findMany: jest.fn(async () => rows.phrasen ?? []) },
    dafDialogLine: { findMany: jest.fn(async () => rows.zeilen ?? []) },
  };
}

describe('DafMediaInhaltService', () => {
  it('audio kalitini TO`LIQ manzilga aylantiradi', async () => {
    // Xom kalit `<audio src>` ga tushsa portal manziliga nisbatan
    // yechiladi va 404 beradi — 2026-09-08 dagi Critical aynan shu edi.
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: 'daf/audio/x.mp3', imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBe('https://r2.example/daf/audio/x.mp3');
  });

  it('audiosi yo`q so`zda audioUrl null', async () => {
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: null, imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBeNull();
  });

  it('PASSIV so`z ham ro`yxatda bo`ladi', async () => {
    // Dvigatel `core: false` so'zni so'ramaydi, lekin u kontentning bir
    // qismi. CEO «nega bu so'zdan savol yo'q?» deb so'raganda javob shu
    // yerda ko'rinishi kerak, shuning uchun ro'yxatdan CHIQARILMAYDI —
    // faqat belgilanadi.
    const p = fakePrisma({
      woerter: [{ id: 2, de: 'und', uz: 'va', artikel: null, anzeige: null, core: false, audioKey: null, imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    expect(r.woerter).toHaveLength(1);
    expect(r.woerter[0].core).toBe(false);
  });

  it('R2_PUBLIC_URL sozlanmagan bo`lsa audioUrl null, kalit sizib chiqmaydi', async () => {
    const p = fakePrisma({
      woerter: [{ id: 1, de: 'hallo', uz: 'salom', artikel: null, anzeige: null, core: true, audioKey: 'daf/audio/x.mp3', imageKey: null, picturable: false }],
    });
    const r = await new DafMediaInhaltService(p as any, { get: () => undefined } as any).inhalt(7);
    expect(r.woerter[0].audioUrl).toBeNull();
  });

  it('faqat SO`RALGAN bo`limning materiali olinadi', async () => {
    const p = fakePrisma({});
    await new DafMediaInhaltService(p as any, config as any).inhalt(7);
    for (const t of [p.dafLexeme, p.dafSentence, p.dafPhrase]) {
      expect((t.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ sectionId: 7 });
    }
    // DafDialogLine o'zining sectionId'siga ega emas — DafDialog orqali
    // bog'lanadi. Bu YAGONA bilvosita bog'lanish, brief buni ataylab
    // ajratib ko'rsatgan: shu joydagi noto'g'ri/qiyshiq join boshqa
    // bo'limning dialogini shu ro'yxatga sizdirishi mumkin, lekin yuqoridagi
    // uchta assertion buni sezmaydi — shuning uchun alohida tekshiriladi.
    expect(
      (p.dafDialogLine.findMany as jest.Mock).mock.calls[0][0].where,
    ).toMatchObject({ dialog: { sectionId: 7 } });
  });
});
