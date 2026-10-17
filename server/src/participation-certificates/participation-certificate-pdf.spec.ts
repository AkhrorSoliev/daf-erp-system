import {
  buildCertificateDoc,
  overviewRows,
  renderCertificatePdf,
} from './participation-certificate-pdf';
import type { CertificateSnapshot } from './participation-types';

const full: CertificateSnapshot = {
  version: 1,
  student: {
    firstName: 'Madina',
    lastName: 'Karimova',
    dateOfBirth: '2004-03-14',
  },
  level: 'A1',
  courseName: 'Deutsch A1 · Standardkurs',
  groupNames: ['A1-17'],
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: '2026-10-07' },
  thresholds: { attendance: 80, app: 100, minLessons: 20, maxLatePercent: 20 },
  exempt: false,
};

const minimal: CertificateSnapshot = {
  ...full,
  student: { ...full.student, dateOfBirth: null },
  lessonMinutes: null,
  courseName: null,
  app: { applies: false, done: 0, open: 0, percent: null },
  unitTests: null,
  mock: null,
  // The shape of a document sealed before 17.10.2026: no minLessons, no maxLatePercent.
  thresholds: { attendance: 80, app: null },
};

const build = (snapshot: CertificateSnapshot) =>
  buildCertificateDoc({
    snapshot,
    number: 'TB-2026-0001',
    issuedAt: new Date('2026-10-17T07:00:00.000Z'),
    qrDataUrl: 'data:image/png;base64,AAAA',
    logoDataUrl: null,
  });

describe('overviewRows', () => {
  it('prints every row of the sample', () => {
    expect(overviewRows(full)).toEqual([
      {
        area: 'Anwesenheit',
        result: '91 %',
        note: '21 von 23 Unterrichtseinheiten',
      },
      { area: 'Verspätungen', result: '2', note: '' },
      {
        area: 'Lernplattform',
        result: '100 %',
        note: '80 von 80 Lektionen abgeschlossen',
      },
      { area: 'Abschlusstests', result: '5 von 5', note: 'bestanden' },
      {
        area: 'Mock-Prüfung',
        result: '72 Punkte',
        note: 'von 100 · 07.10.2026',
      },
    ]);
  });

  it('drops the rows that have no data', () => {
    expect(overviewRows(minimal).map((r) => r.area)).toEqual([
      'Anwesenheit',
      'Verspätungen',
    ]);
  });

  it('leaves the Abschlusstests row out when none was passed', () => {
    const areas = overviewRows({
      ...full,
      unitTests: { passed: 0, total: 5 },
    }).map((r) => r.area);
    expect(areas).not.toContain('Abschlusstests');
    expect(areas).toEqual([
      'Anwesenheit',
      'Verspätungen',
      'Lernplattform',
      'Mock-Prüfung',
    ]);
  });

  it('shows the Abschlusstests row from the first passed test on', () => {
    const row = overviewRows({
      ...full,
      unitTests: { passed: 1, total: 5 },
    }).find((r) => r.area === 'Abschlusstests');
    expect(row).toEqual({
      area: 'Abschlusstests',
      result: '1 von 5',
      note: 'bestanden',
    });
  });

  it('writes a decimal score with a German comma', () => {
    const rows = overviewRows({
      ...full,
      mock: { score: 72.5, maxScore: 100, date: null },
    });
    expect(rows[rows.length - 1]).toEqual({
      area: 'Mock-Prüfung',
      result: '72,5 Punkte',
      note: 'von 100',
    });
  });
});

describe('buildCertificateDoc', () => {
  const text = (snapshot: CertificateSnapshot) =>
    JSON.stringify(build(snapshot));

  it('prints the person, the period, the number and the issue day', () => {
    const json = text(full);
    expect(json).toContain('Karimova, Madina');
    expect(json).toContain('14.03.2004');
    expect(json).toContain('07.07.2026 – 15.10.2026');
    expect(json).toContain('TB-2026-0001');
    expect(json).toContain('Ausgestellt am');
    expect(json).toContain('17.10.2026');
    expect(json).toContain('23 (à 90 Minuten)');
  });

  it('never prints a branch, a course head, a stamp or a place', () => {
    expect(text(full)).not.toMatch(
      /filial|Kursleitung|Zentrumsleitung|Stempel|Fargʻona|Unterschrift/i,
    );
  });

  it('leaves a missing birth date and lesson length out instead of printing a hole', () => {
    const json = text(minimal);
    expect(json).not.toContain('Geburtsdatum');
    expect(json).toContain('"23"');
    expect(json).toContain('Deutsch A1');
  });

  it('is one A4 page', () => {
    expect(build(full).pageSize).toBe('A4');
  });

  describe('the confirmation sentence', () => {
    const exempt: CertificateSnapshot = { ...full, exempt: true };

    /** The sentence as printed: its pieces joined, bold or not. */
    const sentenceNode = (snapshot: CertificateSnapshot) =>
      (build(snapshot).content as { text?: unknown }[]).find(
        (n) =>
          Array.isArray(n.text) &&
          typeof n.text[0] === 'string' &&
          n.text[0].startsWith('hat im genannten Zeitraum'),
      );
    const sentence = (snapshot: CertificateSnapshot) =>
      (sentenceNode(snapshot)?.text as (string | { text: string })[])
        .map((p) => (typeof p === 'string' ? p : p.text))
        .join('');

    it('says «regelmäßig» on a normal document, as before', () => {
      expect(sentence(full)).toBe(
        'hat im genannten Zeitraum regelmäßig am Deutschunterricht auf dem Niveau A1 des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER) teilgenommen.',
      );
    });

    it('drops «regelmäßig» on an exemption, without a double space', () => {
      const printed = sentence(exempt);
      expect(printed).not.toContain('regelmäßig');
      expect(printed).not.toMatch(/ {2}/);
      expect(printed).toBe(
        'hat im genannten Zeitraum am Deutschunterricht auf dem Niveau A1 des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER) teilgenommen.',
      );
      expect(text(exempt)).not.toContain('regelmäßig');
    });

    it('marks an exemption nowhere else: only that sentence differs', () => {
      const rest = (snapshot: CertificateSnapshot) =>
        JSON.stringify(build(snapshot).content).replace(
          JSON.stringify(sentenceNode(snapshot)),
          '',
        );
      expect(rest(exempt)).toBe(rest(full));
      expect(text(exempt)).not.toMatch(/Ausnahme|Befreiung|Sonderfall|exempt/i);
    });

    it('keeps the forbidden strings out of an exempt document too', () => {
      expect(text(exempt)).not.toMatch(
        /filial|Kursleitung|Zentrumsleitung|Stempel|Fargʻona|Unterschrift/i,
      );
    });
  });
});

describe('renderCertificatePdf', () => {
  const pages = (buf: Buffer) =>
    (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

  it('renders one page with every optional row', async () => {
    const buf = await renderCertificatePdf({
      snapshot: full,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/3f9c2a7e-5b1d-4c8a-9e60-2d7f81a4c0b3',
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(buf)).toBe(1);
  });

  it('renders one page with none of them', async () => {
    const buf = await renderCertificatePdf({
      snapshot: minimal,
      number: 'TB-2026-0002',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/x',
    });
    expect(pages(buf)).toBe(1);
  });

  it('draws a document sealed before the new conditions exactly like a new one (the thresholds are not printed)', async () => {
    // What the database hands back for a row issued before 17.10.2026.
    const stored = JSON.parse(
      JSON.stringify({
        ...full,
        thresholds: { attendance: 80, app: 100 },
      }),
    ) as CertificateSnapshot;
    expect(stored.thresholds.minLessons).toBeUndefined();
    expect(JSON.stringify(build(stored))).toBe(JSON.stringify(build(full)));
    const buf = await renderCertificatePdf({
      snapshot: stored,
      number: 'TB-2026-0005',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/x',
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(buf)).toBe(1);
  });

  it('renders one page for an exemption', async () => {
    const buf = await renderCertificatePdf({
      snapshot: { ...full, exempt: true },
      number: 'TB-2026-0003',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/x',
    });
    expect(pages(buf)).toBe(1);
  });

  it('renders one page when no unit test was passed', async () => {
    const buf = await renderCertificatePdf({
      snapshot: { ...full, unitTests: { passed: 0, total: 5 } },
      number: 'TB-2026-0004',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/x',
    });
    expect(pages(buf)).toBe(1);
  });
});
