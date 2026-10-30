import { DafMediaFragenService } from './daf-media-fragen.service';

describe('DafMediaFragenService.lessonFragen', () => {
  it("dvigatel nomzodlarini to'g'ri javobi va afzal formatlari bilan beradi", async () => {
    const uebung = {
      vorschauKandidaten: jest.fn().mockResolvedValue({
        kind: 'SECTION_A',
        laenge: 12,
        fragen: [
          {
            format: 'WORT_UZ',
            itemType: 'WORT',
            itemId: 1,
            prompt: 'hallo',
            hilfe: null,
            options: ['salom', 'rahmat'],
            richtig: 'salom',
            titel: null,
            audioUrl: null,
            belegteItems: ['WORT:1'],
          },
        ],
      }),
    };
    const r = await new DafMediaFragenService(uebung as any).lessonFragen(100);
    expect(uebung.vorschauKandidaten).toHaveBeenCalledWith(100);
    expect(r.kind).toBe('SECTION_A');
    expect(r.laenge).toBe(12);
    expect(r.bevorzugt).toContain('WORT_UZ');
    expect(r.fragen[0]).toMatchObject({
      richtig: 'salom',
      bildUrl: null,
      uhrzeit: null,
    });
    expect(r.fragen[0]).not.toHaveProperty('belegteItems');
  });
});
