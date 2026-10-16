import { computeChangedFields } from '../../common/entity-history/diff.util';
import { ownerHistoryValues } from './ownership-history';

describe('ownerHistoryValues', () => {
  it('names the change and the new owner', () => {
    const v = ownerHistoryValues('CLAIM', null, 'Nodira R', null);
    expect(v.newValues).toEqual({
      action: 'LID_BAND_QILINDI',
      masul: 'Nodira R',
      sabab: null,
    });
  });

  it('keeps the action, the owner and the reason through the history diff', () => {
    const v = ownerHistoryValues(
      'EXPIRE',
      'Nodira R',
      null,
      "Muddatida harakat bo'lmadi",
    );
    expect(computeChangedFields(v.oldValues, v.newValues, 'Lead')).toEqual({
      oldValues: { action: null, masul: 'Nodira R', sabab: null },
      newValues: {
        action: 'LID_QAYTDI',
        masul: null,
        sabab: "Muddatida harakat bo'lmadi",
      },
    });
  });
});
