import { flaggeSvg } from './flagge-bild';

describe('flaggeSvg — country flags drawn from the official construction', () => {
  it('Uzbekistan has 12 stars, a crescent and the red lines', () => {
    const svg = flaggeSvg('UZ');
    expect((svg.match(/class="stern"/g) ?? []).length).toBe(12);
    expect(svg).toContain('<circle cx="140" cy="80" r="60" fill="#FFFFFF"/>');
    expect(svg).toContain('<circle cx="160" cy="80" r="60" fill="#0099B5"/>');
    expect(svg).toContain('fill="#CE1126"');
  });

  it('Germany is black, red, gold', () => {
    const svg = flaggeSvg('DE');
    for (const farbe of ['#000000', '#DD0000', '#FFCE00']) {
      expect(svg).toContain(farbe);
    }
  });

  it('carries no text', () => {
    expect(flaggeSvg('UZ')).not.toMatch(/<text/);
  });

  it('refuses an unknown country', () => {
    expect(() => flaggeSvg('FR' as never)).toThrow();
  });
});
