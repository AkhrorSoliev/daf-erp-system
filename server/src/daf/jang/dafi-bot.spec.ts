import { botJavoblari } from './dafi-bot';

describe('botJavoblari', () => {
  it('6 javob, vaqt 3000–9000 ms', () => {
    const xs = botJavoblari(6, 0.6);
    expect(xs).toHaveLength(6);
    for (const x of xs) {
      expect(x.ms).toBeGreaterThanOrEqual(3000);
      expect(x.ms).toBeLessThanOrEqual(9000);
    }
  });
  it("ehtimol 0.6–0.75 oralig'iga qisiladi", () => {
    // rng 0.7: kuch 0.9 → 0.75 → to'g'ri; kuch 0.1 → 0.6 → xato.
    expect(botJavoblari(1, 0.9, () => 0.7)[0].togri).toBe(true);
    expect(botJavoblari(1, 0.1, () => 0.7)[0].togri).toBe(false);
  });
});
