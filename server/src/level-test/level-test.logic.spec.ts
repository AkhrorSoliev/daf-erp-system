import {
  askQuestion,
  judge,
  levelPassed,
  nextLevel,
  pickQuestions,
  QUESTIONS_PER_LEVEL,
  shuffle,
} from './level-test.logic';
import { LEVEL_TEST_QUESTIONS } from './level-test-questions';
import { LEVEL_TEST_LEVELS } from './level-test.types';

/** Takrorlanadigan "tasodifiy" qator: testlar barqaror bo'lsin. */
const seeded = (): (() => number) => {
  let x = 7;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
};

describe('judge', () => {
  it('A1 dan 4 tadan kam → BEGINNER', () => {
    expect(judge({ A1: 3 })).toBe('BEGINNER');
    expect(judge({})).toBe('BEGINNER');
  });

  it("A1 o'tdi, A2 o'tmadi → A1", () => {
    expect(judge({ A1: 4, A2: 3 })).toBe('A1');
    expect(judge({ A1: 5, A2: 0 })).toBe('A1');
  });

  it('har darajada chegara 4', () => {
    expect(judge({ A1: 5, A2: 4, B1: 3 })).toBe('A2');
    expect(judge({ A1: 5, A2: 5, B1: 4, B2: 3 })).toBe('B1');
    expect(judge({ A1: 5, A2: 5, B1: 5, B2: 4 })).toBe('B2');
  });

  it("pastdagi daraja o'tmasa, yuqoridagi to'g'rilar hisobga olinmaydi", () => {
    expect(judge({ A1: 2, A2: 5, B1: 5, B2: 5 })).toBe('BEGINNER');
    expect(judge({ A1: 5, A2: 3, B1: 5, B2: 5 })).toBe('A1');
  });
});

describe('levelPassed / nextLevel', () => {
  it("4 va undan ko'p — o'tdi", () => {
    expect(levelPassed(3)).toBe(false);
    expect(levelPassed(4)).toBe(true);
  });

  it("B2 dan keyin daraja yo'q", () => {
    expect(nextLevel('A1')).toBe('A2');
    expect(nextLevel('B1')).toBe('B2');
    expect(nextLevel('B2')).toBeNull();
  });
});

describe('shuffle', () => {
  it("kirishni o'zgartirmaydi va elementlarni saqlaydi", () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffle(src, seeded());
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(src);
  });
});

describe('pickQuestions', () => {
  it('darajadan kerakli sonni, faqat shu darajadan oladi', () => {
    for (const level of LEVEL_TEST_LEVELS) {
      const picked = pickQuestions(LEVEL_TEST_QUESTIONS, level, new Set());
      expect(picked).toHaveLength(QUESTIONS_PER_LEVEL);
      expect(picked.every((q) => q.level === level)).toBe(true);
      expect(new Set(picked.map((q) => q.id)).size).toBe(QUESTIONS_PER_LEVEL);
    }
  });

  it("ko'rilganlarni birinchi navbatda chiqarmaydi", () => {
    const ofA1 = LEVEL_TEST_QUESTIONS.filter((q) => q.level === 'A1');
    const seen = new Set(ofA1.slice(0, ofA1.length - 5).map((q) => q.id));
    const picked = pickQuestions(LEVEL_TEST_QUESTIONS, 'A1', seen);
    expect(picked.every((q) => !seen.has(q.id))).toBe(true);
  });

  it("havza tugaganda ko'rilganlardan to'ldiradi", () => {
    const ofA1 = LEVEL_TEST_QUESTIONS.filter((q) => q.level === 'A1');
    const seen = new Set(ofA1.map((q) => q.id));
    const picked = pickQuestions(LEVEL_TEST_QUESTIONS, 'A1', seen);
    expect(picked).toHaveLength(QUESTIONS_PER_LEVEL);
  });

  it("yangi savollar yetmasa, yangilarini avval oladi, qolganini ko'rilganlardan", () => {
    const ofA1 = LEVEL_TEST_QUESTIONS.filter((q) => q.level === 'A1');
    const fresh = ofA1.slice(0, 2);
    const seen = new Set(ofA1.slice(2).map((q) => q.id));
    const picked = pickQuestions(LEVEL_TEST_QUESTIONS, 'A1', seen);
    expect(picked).toHaveLength(QUESTIONS_PER_LEVEL);
    for (const f of fresh) expect(picked.map((q) => q.id)).toContain(f.id);
  });
});

describe('askQuestion', () => {
  it("to'g'ri javob o'rni aralashtirishdan keyin ham to'g'ri", () => {
    for (const q of LEVEL_TEST_QUESTIONS.slice(0, 40)) {
      const asked = askQuestion(q, seeded());
      expect(asked.options).toHaveLength(4);
      expect(asked.options[asked.correctIndex]).toBe(q.correct);
    }
  });
});

describe('savollar havzasi', () => {
  it('200 ta, har darajada 50 ta', () => {
    expect(LEVEL_TEST_QUESTIONS).toHaveLength(200);
    for (const level of LEVEL_TEST_LEVELS) {
      expect(
        LEVEL_TEST_QUESTIONS.filter((q) => q.level === level),
      ).toHaveLength(50);
    }
  });

  it("id'lar noyob va daraja bilan boshlanadi", () => {
    const ids = LEVEL_TEST_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of LEVEL_TEST_QUESTIONS) {
      expect(q.id.startsWith(q.level.toLowerCase() + '-')).toBe(true);
    }
  });

  it("har savolda 4 ta har xil variant va bo'sh joy bor", () => {
    for (const q of LEVEL_TEST_QUESTIONS) {
      const options = [q.correct, ...q.wrong];
      expect(new Set(options).size).toBe(4);
      expect(options.every((o) => o.trim().length > 0)).toBe(true);
    }
  });
});
