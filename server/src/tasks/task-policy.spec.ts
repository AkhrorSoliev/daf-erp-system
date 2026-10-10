import {
  assignableRoleIds,
  canAssignTo,
  canWatch,
  highestRoleId,
  resolveAccess,
  type PolicyPerson,
} from './task-policy';

const person = (
  id: number,
  roleIds: number[],
  branchIds: number[] | 'all' = [1],
): PolicyPerson => ({ id, roleIds, branchIds });

describe('task-policy', () => {
  it('highestRoleId is the smallest id; empty is null', () => {
    expect(highestRoleId([3, 2])).toBe(2);
    expect(highestRoleId([])).toBeNull();
  });

  it('assign ladder per spec §5.1', () => {
    expect(assignableRoleIds([1])).toEqual([1, 2, 3, 4, 5]);
    expect(assignableRoleIds([2])).toEqual([2, 3, 4, 5]);
    expect(assignableRoleIds([3])).toEqual([3, 4, 5]);
    expect(assignableRoleIds([4])).toEqual([]);
    expect(assignableRoleIds([5])).toEqual([]);
    expect(assignableRoleIds([3, 2])).toEqual([2, 3, 4, 5]);
  });

  describe('canAssignTo', () => {
    const ceo = person(1, [1], 'all');
    const bd = person(2, [2], [1]);
    const admin = person(3, [3], [1]);
    const teacher = person(4, [4], [1]);

    it('everyone may assign to themselves', () => {
      expect(canAssignTo(teacher, teacher)).toBe(true);
      expect(canAssignTo(admin, admin)).toBe(true);
    });
    it('CEO assigns to anyone in any branch', () => {
      expect(canAssignTo(ceo, person(9, [2], [7]))).toBe(true);
      expect(canAssignTo(ceo, person(9, [1], []))).toBe(true);
    });
    it('BD assigns 2–5 in own branch only', () => {
      expect(canAssignTo(bd, admin)).toBe(true);
      expect(canAssignTo(bd, person(9, [2], [1]))).toBe(true);
      expect(canAssignTo(bd, person(9, [3], [2]))).toBe(false);
      expect(canAssignTo(bd, ceo)).toBe(false);
    });
    it('admin assigns 3–5 in own branch; the highest role of the target decides', () => {
      expect(canAssignTo(admin, teacher)).toBe(true);
      expect(canAssignTo(admin, person(9, [3, 2], [1]))).toBe(false);
      expect(canAssignTo(admin, bd)).toBe(false);
    });
    it('teacher and cashier assign to nobody else', () => {
      expect(canAssignTo(teacher, admin)).toBe(false);
      expect(canAssignTo(person(5, [5]), teacher)).toBe(false);
    });
    it('a multi-branch admin reaches every branch they hold', () => {
      expect(canAssignTo(person(3, [3], [1, 2]), person(9, [4], [2]))).toBe(
        true,
      );
    });
  });

  describe('canWatch', () => {
    it('anyone assignable, or self, or someone more senior', () => {
      const admin = person(3, [3], [1]);
      expect(canWatch(admin, person(1, [1], 'all'))).toBe(true);
      expect(canWatch(admin, person(2, [2], [1]))).toBe(true);
      expect(canWatch(admin, person(9, [4], [1]))).toBe(true);
      expect(canWatch(admin, person(9, [4], [2]))).toBe(false);
    });
  });

  describe('resolveAccess', () => {
    const task = {
      authorId: 2,
      branchId: 1,
      participants: [
        { userId: 3, role: 'ASSIGNEE' as const },
        { userId: 4, role: 'WATCHER' as const },
      ],
    };
    it('assignee works but does not manage', () => {
      const a = resolveAccess(person(3, [3]), task);
      expect(a).toMatchObject({
        isAssignee: true,
        canView: true,
        canWork: true,
        canManage: false,
      });
    });
    it('watcher only views', () => {
      const a = resolveAccess(person(4, [4]), task);
      expect(a).toMatchObject({
        isWatcher: true,
        canView: true,
        canWork: false,
        canManage: false,
      });
    });
    it('author manages', () => {
      expect(resolveAccess(person(2, [2]), task).canManage).toBe(true);
    });
    it('BD of the branch manages; BD of another branch sees nothing', () => {
      expect(resolveAccess(person(7, [2], [1]), task)).toMatchObject({
        isManager: true,
        canManage: true,
      });
      expect(resolveAccess(person(7, [2], [2]), task).canView).toBe(false);
    });
    it('CEO manages everything, including a branch-less task', () => {
      expect(
        resolveAccess(person(1, [1], 'all'), { ...task, branchId: null })
          .canManage,
      ).toBe(true);
    });
    it('a branch-less task is hidden from a BD', () => {
      expect(
        resolveAccess(person(7, [2], [1]), { ...task, branchId: null }).canView,
      ).toBe(false);
    });
    it('an outsider sees nothing', () => {
      expect(resolveAccess(person(8, [3], [1]), task).canView).toBe(false);
    });
  });
});
