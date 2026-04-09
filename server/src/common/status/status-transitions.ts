export const STATUS_TRANSITIONS: Record<string, Record<string, string[]>> = {
  User: {
    ACTIVE: ['INACTIVE', 'SUSPENDED', 'TERMINATED'],
    INACTIVE: ['ACTIVE', 'TERMINATED'],
    SUSPENDED: ['ACTIVE', 'TERMINATED'],
    TERMINATED: [],
    ARCHIVED: ['ACTIVE'],
  },

  Student: {
    ACTIVE: ['FROZEN', 'GRADUATED', 'EXPELLED', 'ARCHIVED'],
    INACTIVE: ['ACTIVE', 'FROZEN', 'ARCHIVED'], // legacy — faqat chiqish, kirish yo'q
    FROZEN: ['ACTIVE', 'ARCHIVED'],
    GRADUATED: ['ACTIVE', 'ARCHIVED'],
    EXPELLED: ['ACTIVE', 'ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  },

  Group: {
    FORMING: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
    PAUSED: ['ACTIVE', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
    ARCHIVED: ['FORMING'],
  },

  Course: {
    ACTIVE: ['INACTIVE', 'DEPRECATED'],
    INACTIVE: ['ACTIVE', 'DEPRECATED'],
    DEPRECATED: ['ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  },

  Branch: {
    ACTIVE: ['INACTIVE', 'CLOSED'],
    INACTIVE: ['ACTIVE', 'CLOSED'],
    CLOSED: ['ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  },

  Room: {
    ACTIVE: ['INACTIVE', 'UNDER_MAINTENANCE', 'ARCHIVED'],
    INACTIVE: ['ACTIVE', 'UNDER_MAINTENANCE', 'ARCHIVED'],
    UNDER_MAINTENANCE: ['ACTIVE', 'ARCHIVED'],
    ARCHIVED: ['ACTIVE'],
  },

  Lead: {
    NEW: ['CONTACTED', 'TRIAL', 'LOST'],
    CONTACTED: ['TRIAL', 'LOST'],
    TRIAL: ['CONVERTED', 'LOST'],
    CONVERTED: ['ARCHIVED'],
    LOST: ['NEW', 'ARCHIVED'],
    ARCHIVED: ['NEW'],
  },

  Enrollment: {
    ACTIVE: ['FROZEN', 'COMPLETED', 'DROPPED', 'TRANSFERRED'],
    FROZEN: ['ACTIVE', 'DROPPED'],
    COMPLETED: ['ARCHIVED'],
    DROPPED: ['ARCHIVED'],
    TRANSFERRED: ['ARCHIVED'],
    ARCHIVED: [],
  },

  Holiday: {
    ACTIVE: ['CANCELLED'],
    CANCELLED: ['ACTIVE'],
  },
};

export function isValidTransition(
  entityType: string,
  fromStatus: string,
  toStatus: string,
): boolean {
  const transitions = STATUS_TRANSITIONS[entityType];
  if (!transitions) return false;

  const allowed = transitions[fromStatus];
  if (!allowed) return false;

  return allowed.includes(toStatus);
}

export function getAllowedTransitions(
  entityType: string,
  currentStatus: string,
): string[] {
  const transitions = STATUS_TRANSITIONS[entityType];
  if (!transitions) return [];

  return transitions[currentStatus] || [];
}
