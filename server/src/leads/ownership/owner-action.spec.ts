import { touchLeadOwnerAction } from './owner-action';

describe('touchLeadOwnerAction', () => {
  it("stamps the action only on the owner's live, unconverted lead", async () => {
    const db = {
      lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const at = new Date('2026-10-19T05:00:00Z');
    await expect(touchLeadOwnerAction(db as never, 'L1', 11, at)).resolves.toBe(
      true,
    );
    expect(db.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'L1',
        ownerId: 11,
        deletedAt: null,
        statusEnum: { not: 'CONVERTED' },
      },
      data: { ownerActedAt: at },
    });
  });

  it('reports false when the writer is not the owner', async () => {
    const db = {
      lead: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    await expect(touchLeadOwnerAction(db as never, 'L1', 99)).resolves.toBe(
      false,
    );
  });
});
