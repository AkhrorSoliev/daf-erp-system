import { parseExerciseSets } from './dib-exercise-set.parser';

describe('parseExerciseSets', () => {
  const form = (code: string, type: string, count: string, body = '<td>x</td>') =>
    `<form name="${code}" onsubmit="proc_post('/gg/ex_set_proc.php?ec=${code}','1','es_01','${code}','${type}','${count}'); return false;">${body}</form>`;

  it('to`plam kodini, turini va savollar sonini o`qiydi', () => {
    const sets = parseExerciseSets(form('no_02_01_fib', 'fib', '25'));

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      code: 'no_02_01_fib',
      type: 'fib',
      count: 25,
    });
  });

  it('bir sahifadagi bir necha to`plamni alohida qaytaradi', () => {
    const html =
      form('vcp_01_01_fib', 'fib', '8') + form('vcp_01_02_fib', 'fib', '6');
    const sets = parseExerciseSets(html);

    expect(sets.map((s) => s.code)).toEqual([
      'vcp_01_01_fib',
      'vcp_01_02_fib',
    ]);
    expect(sets.map((s) => s.count)).toEqual([8, 6]);
  });

  it('har to`plamning HTMLi faqat o`z formasi ichidan olinadi', () => {
    const html =
      form('a_01_fib', 'fib', '1', '<td>BIRINCHI</td>') +
      form('a_02_fib', 'fib', '1', '<td>IKKINCHI</td>');
    const sets = parseExerciseSets(html);

    expect(sets[0].html).toContain('BIRINCHI');
    expect(sets[0].html).not.toContain('IKKINCHI');
    expect(sets[1].html).toContain('IKKINCHI');
  });

  // Sahifada mashqqa aloqasi yo'q formalar bor (qidiruv, obuna). Ular
  // `proc_post` chaqirmaydi — va aynan shu ularni ajratadigan belgi.
  it('proc_post chaqirmaydigan formani to`plam deb hisoblamaydi', () => {
    const html =
      '<form name="search" action="/find"><input name="q"></form>' +
      form('no_01_01_fib', 'fib', '3');

    expect(parseExerciseSets(html).map((s) => s.code)).toEqual([
      'no_01_01_fib',
    ]);
  });

  it('yopilmagan formada sahifaning qolganini oladi, yiqilmaydi', () => {
    const html = `<form onsubmit="proc_post('/gg/ex_set_proc.php?ec=x_01_fib','1','es','x','fib','2')"><td>OXIRIGACHA</td>`;
    const sets = parseExerciseSets(html);

    expect(sets).toHaveLength(1);
    expect(sets[0].html).toContain('OXIRIGACHA');
  });
});
