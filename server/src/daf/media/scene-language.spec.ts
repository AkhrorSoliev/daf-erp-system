import { isEnglishScene, uzbekSceneReason } from './scene-language';

describe('uzbekSceneReason', () => {
  // Haqiqiy sahnalar — 12-bo'limdagi qayta chizish jurnalidan olingan.
  const englishScenes = [
    'A woman stands in front of a mirror, brushing her long hair with a pink hairbrush, focused on her reflection.',
    'A golden jar of honey with a smooth, glossy surface, reflecting light.',
    'A steaming cup of black coffee on a simple white background.',
    'A close-up of a freshly baked bread roll, golden brown and crusty, resting on a plain white background.',
  ];

  const uzbekScenes = [
    "Bir odam tish pastasini siqib, tish cho'tkasini ushlab, tishlarini tozalamoqda.",
    "Bir odam, kitoblar bilan to'ldirilgan ruksakni yelkasiga osib, sinfga kirish uchun eshikdan o'tmoqda.",
    "Bir odam universitetga borish uchun sumkasini olib, eshikdan chiqayotganini ko'rsatadi.",
  ];

  it.each(englishScenes)('inglizcha sahnani o`tkazadi: %s', (scene) => {
    expect(uzbekSceneReason(scene)).toBeNull();
    expect(isEnglishScene(scene)).toBe(true);
  });

  it.each(uzbekScenes)('o`zbekcha sahnani ushlaydi: %s', (scene) => {
    expect(uzbekSceneReason(scene)).not.toBeNull();
    expect(isEnglishScene(scene)).toBe(false);
  });

  // Xabar dalilni aytadi — kimdir tekshiruvni noto'g'ri deb o'ylasa,
  // qaysi so'z ushlaganini ko'rishi kerak.
  it('sababda aynan qaysi so`z ushlaganini aytadi', () => {
    expect(uzbekSceneReason('Bir odam kitob o`qiydi.')).toContain('bir');
  });

  // Nemis harflari inglizcha tavsifda uchrashi mumkin va rad etilmasligi
  // kerak.
  it('nemis harflarini rad etmaydi', () => {
    expect(isEnglishScene('A wheel of Käse on a wooden board.')).toBe(true);
  });

  // Yolg'on ushlashga qarshi. Bular haqiqatan sodir bo'lgan: `-ning`
  // qo'shimchasi ro'yxatda turganda `glistening` rad etilib, `das
  // Getränk` va `der Joghurt` rasmi umuman chizilmay qolgan.
  it.each([
    'A glass of juice with glistening droplets on a plain background.',
    'A cup of coffee steaming in the morning light.',
    'A warm evening lamp glowing softly.',
    'A book lying open on a plain surface.',
    'A folded cardigan resting on a plain background.',
    'A running shoe on a plain neutral background.',
  ])('inglizcha so`zni yolg`ondan rad etmaydi: %s', (scene) => {
    expect(uzbekSceneReason(scene)).toBeNull();
  });
});
