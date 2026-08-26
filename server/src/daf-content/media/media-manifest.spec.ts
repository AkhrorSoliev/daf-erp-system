import { collectAssets } from './media-manifest';
import type { AssetRef, DafDataset } from '../dataset.types';

function asset(key: string, kind: AssetRef['kind'] = 'AUDIO'): AssetRef {
  return {
    sourceUrl: `https://x/${key}`,
    key,
    kind,
    license: 'CC BY 4.0',
    attribution: 'COERLL',
  };
}

function dataset(): DafDataset {
  return {
    source: 'DIB',
    harvestedAt: '2026-08-25T00:00:00.000Z',
    license: 'CC BY 4.0',
    attribution: 'COERLL',
    chapters: [],
    sections: [
      { id: 's1', chapter: 1, titleDe: 'a', titleEn: 'a', audio: asset('a.mp3'), entries: [] },
      { id: 's2', chapter: 1, titleDe: 'b', titleEn: 'b', audio: asset('a.mp3'), entries: [] },
      { id: 's3', chapter: 2, titleDe: 'c', titleEn: 'c', audio: null, entries: [] },
    ],
    transcripts: [
      { id: 't1', chapter: 1, titleDe: 'v', linesDe: ['x'], linesEn: [], video: asset('v.mp4') },
    ],
    videos: [],
    grammar: [],
    phonetics: [],
    documents: [],
  };
}

describe('collectAssets', () => {
  it('lug\'at va video aktivlarini bir ro\'yxatga yig\'adi', () => {
    expect(collectAssets(dataset()).map((a) => a.key).sort()).toEqual([
      'a.mp3',
      'v.mp4',
    ]);
  });

  it('bir xil kalitni ikki marta qaytarmaydi', () => {
    expect(collectAssets(dataset()).filter((a) => a.key === 'a.mp3')).toHaveLength(1);
  });

  it('aktivi yo\'q bo\'limni o\'tkazib yuboradi', () => {
    expect(collectAssets(dataset()).map((a) => a.key)).not.toContain(null);
  });

  it('`videos` ro\'yxatidagi transkriptsiz videoni ham qo\'shadi', () => {
    const d = dataset();
    d.videos.push(asset('intro.mp4', 'VIDEO'));
    expect(collectAssets(d).map((a) => a.key).sort()).toEqual([
      'a.mp3',
      'intro.mp4',
      'v.mp4',
    ]);
  });

  it('transkriptdagi video `videos` ro\'yxatida ham bo\'lsa, bir marta sanaydi', () => {
    const d = dataset();
    d.videos.push(asset('v.mp4', 'VIDEO'));
    expect(collectAssets(d).filter((a) => a.key === 'v.mp4')).toHaveLength(1);
  });
});
