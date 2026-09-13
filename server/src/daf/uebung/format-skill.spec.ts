import 'reflect-metadata';
import { FRAGE_FORMATLAR } from '../dto/uebung.dto';
import {
  FORMAT_SKILL,
  NAFAQADAGI_FORMAT_SKILL,
  skillFuer,
} from './format-skill';

describe('format-skill reyestri', () => {
  it("har bir jonli format ko`nikmaga ega", () => {
    for (const format of FRAGE_FORMATLAR) {
      expect(skillFuer(format)).not.toBeNull();
    }
  });

  it("CEO tasdiqlagan xarita (13.09.2026): amalda nima qilyapti", () => {
    expect(FORMAT_SKILL.ARTIKEL).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.REAKTION).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.ZUORDNEN).toBe('WORTSCHATZ');
    expect(FORMAT_SKILL.LUECKE).toBe('GRAMMATIK');
    expect(FORMAT_SKILL.SATZ_BAUEN).toBe('GRAMMATIK');
    expect(FORMAT_SKILL.SATZ_UEBERSETZEN).toBe('LESEN');
    expect(FORMAT_SKILL.DIALOG_LUECKE).toBe('LESEN');
    expect(FORMAT_SKILL.AUDIO_WORT).toBe('HOEREN');
    expect(FORMAT_SKILL.WORT_TIPPEN).toBe('SCHREIBEN');
    expect(FORMAT_SKILL.HOEREN_WAHL).toBe('HOEREN');
  });

  it('nafaqadagi format ham ko`nikma beradi, noma`lum format null', () => {
    for (const [format, skill] of Object.entries(NAFAQADAGI_FORMAT_SKILL)) {
      expect(skillFuer(format)).toBe(skill);
    }
    expect(skillFuer('BUNDAY_FORMAT_YOQ')).toBeNull();
    expect(skillFuer(null)).toBeNull();
    expect(skillFuer(undefined)).toBeNull();
  });

  it('jonli va nafaqadagi ro`yxatlar kesishmaydi', () => {
    for (const format of Object.keys(NAFAQADAGI_FORMAT_SKILL)) {
      expect(FORMAT_SKILL).not.toHaveProperty(format);
    }
  });
});
