import {
  contractNumberPrefix,
  nextContractNumber,
  nextContractSequence,
} from './contract-number';

describe('contract number', () => {
  it('starts every year at 00001', () => {
    expect(nextContractSequence(null, 'DAF-2026-')).toBe('DAF-2026-00001');
  });

  it('continues after the last number of the year', () => {
    expect(nextContractSequence('DAF-2026-00041', 'DAF-2026-')).toBe(
      'DAF-2026-00042',
    );
  });

  it('ignores a number from another prefix', () => {
    expect(nextContractSequence('DAF-2025-00900', 'DAF-2026-')).toBe(
      'DAF-2026-00001',
    );
  });

  it('reads the company last number of the year', async () => {
    const tx = {
      contractDocument: {
        findFirst: jest.fn().mockResolvedValue({ number: 'DAF-2026-00007' }),
      },
    };
    await expect(nextContractNumber(tx as never, 1, '2026')).resolves.toBe(
      'DAF-2026-00008',
    );
    expect(tx.contractDocument.findFirst).toHaveBeenCalledWith({
      where: { companyId: 1, number: { startsWith: 'DAF-2026-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    expect(contractNumberPrefix('2027')).toBe('DAF-2027-');
  });
});
