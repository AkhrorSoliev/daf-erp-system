import { imagePrompt, sceneFor } from './image-prompt';
import { imageKeyFor } from './media-keys';

describe('imagePrompt', () => {
  const p = imagePrompt('a person walking on a path');

  // Uslub namunada tasdiqlangan va o'zgarmaydi — aks holda bo'limlar
  // bir-biridan farq qilib ketadi.
  it('tasdiqlangan uslub qolipini saqlaydi', () => {
    expect(p).toContain('Soft rounded 3D illustration, claymation style');
    expect(p).toContain('subject fills most of the frame');
  });

  // Rasmdagi yozuv javobni oshkor qiladi va Flux harflarni buzadi.
  it('yozuvni uch marta taqiqlaydi', () => {
    expect(p).toContain('No text, no letters, no words, no writing anywhere');
  });

  it('sahnani qolip ichiga qo`yadi', () => {
    expect(p).toContain('a person walking on a path');
  });
});

describe('imageKeyFor', () => {
  it('R2 kalitini barqaror yasaydi', () => {
    expect(imageKeyFor('voc_01_01_begr_3')).toBe(
      'daf/img/voc_01_01_begr_3.jpg',
    );
  });
});

describe('sceneFor', () => {
  const prompt = sceneFor('frühstücken', 'to eat breakfast');

  // Modelga chaqiruv bu funksiyada YO'Q — faqat so'rov matni. Modelni
  // chaqirish `daf-gen-images.ts` ichida, alohida qadam.
  it('sinxron ravishda satr qaytaradi (modelga o`zi murojaat qilmaydi)', () => {
    expect(typeof prompt).toBe('string');
  });

  it('nemischa va inglizcha ma`noni so`rov ichiga qo`yadi', () => {
    expect(prompt).toContain('frühstücken');
    expect(prompt).toContain('to eat breakfast');
  });

  it('boshqa so`z uchun boshqa so`rov beradi', () => {
    const other = sceneFor('das Brot', 'bread');
    expect(other).not.toBe(prompt);
  });
});
