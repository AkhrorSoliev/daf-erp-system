/**
 * How each HTTP route is confined to a branch — a manifest, not documentation.
 *
 * WHAT THIS CATCHES THAT TYPES CANNOT. `ReportBranchIds` is a required
 * parameter, so a service call that forgets the scope does not compile. That
 * closes "the call forgot it". It cannot close "the route never made the call":
 * a new controller that queries Prisma directly, or stops at a company-scoped
 * helper, builds clean and serves every branch. `branch-route-policy.spec.ts`
 * compares this manifest against the routes discovered in the source, so a new
 * endpoint fails the build until somebody says which of these it is.
 *
 * WHAT IT DOES NOT CATCH. A route can be listed here, take `@BranchScope()`, and
 * still ignore it inside the query. Only a negative integration test proves
 * otherwise — see `payments.branch-isolation.spec.ts`,
 * `leads.branch-isolation.spec.ts`, `branch-isolation.scenario.spec.ts`. This
 * manifest is the second of three layers, and it is deliberately the weakest:
 * its job is that nothing is FORGOTTEN, not that everything is correct.
 *
 * HONESTY RULE. `UNREVIEWED` is a real category with a real count. Classifying
 * 243 routes in one pass to make a number go to zero would produce confident
 * labels nobody had thought about, which is worse than an admitted backlog —
 * a wrong `COMPANY_WIDE` is indistinguishable from a considered one, and it
 * silences the very check that would have caught it. The budget below may only
 * ever shrink.
 */

export type BranchPolicy =
  /**
   * The caller picks a branch in the header and the route filters by it.
   * Detected from the handler taking `@BranchScope()` — evidence, not a claim,
   * so these are NOT listed below.
   */
  | 'BRANCH_SCOPED_BY_HEADER'
  /**
   * The route resolves its own scope by calling
   * `resolveCallerReportBranchIds(userId, query.branchId)` instead of taking
   * `@BranchScope()`. Same ceiling ∩ requested rule, different plumbing — and
   * the reason it needs its own name is that a reader grepping for the
   * decorator would otherwise conclude these are unscoped.
   */
  | 'BRANCH_SCOPED_BY_SERVICE'
  /**
   * Id-addressed: the branch comes from the RECORD, and the caller is checked
   * against it (`assertCallerMayWriteForStudent`, `assertCallerInBranch`,
   * `CashAccountsService.findOne(id, companyId, userId)`). Stronger than the
   * header for a write — the header is what the user asked to look at, the
   * record is where the money actually belongs.
   */
  | 'BRANCH_SCOPED_BY_ENTITY'
  /**
   * Confined by `resolvePayrollBranchScope(performedById)`: the payee's own
   * branch, not the viewer's selection. A separate mechanism because it answers
   * "whose payroll is this?" rather than "which branch am I viewing?".
   */
  | 'BRANCH_SCOPED_BY_PAYROLL'
  /** `@CurrentUser('id')` — the caller's own data, no branch question. */
  | 'SELF'
  /** Genuinely not branch data: roles, reference lists, company settings. */
  | 'COMPANY_WIDE'
  /**
   * `@Public()` with no human caller — a provider webhook. `companyId` comes
   * from the request URL and merchant config SERVER-side, the branch from the
   * student. A client-supplied `branchId` is always ignored on this path.
   */
  | 'TRUSTED_GATEWAY'
  /** `@Public()` and genuinely open: sign-in, public form, receipt check. */
  | 'PUBLIC'
  /** Not yet reasoned about. May only shrink — see the honesty rule above. */
  | 'UNREVIEWED';

export interface PolicyBlock {
  policy: BranchPolicy;
  /** Why every route in this block shares this policy. Reviewed by a human. */
  reason: string;
  routes: string[];
}

/**
 * Routes WITHOUT `@BranchScope()`. A route that has it is
 * `BRANCH_SCOPED_BY_HEADER` by evidence and must not be repeated here — listing
 * it would be a second, weaker claim about a fact the source already states.
 */
export const ROUTE_POLICIES: PolicyBlock[] = [
  {
    policy: 'TRUSTED_GATEWAY',
    reason:
      'No human caller exists, so there is no scope to intersect. `companyId` is ' +
      'resolved from the request URL plus merchant config on the server, and the ' +
      'branch from the paying student. Anything the client puts in the body is ' +
      'ignored — a webhook that trusted a submitted branchId would let anyone ' +
      'attribute a payment to any branch.',
    routes: [
      'POST /gateways/click/webhook',
      'POST /gateways/payme/webhook',
      'POST /gateways/uzum/webhook',
      'POST /telegram/webhook',
    ],
  },
  {
    policy: 'PUBLIC',
    reason:
      'Reachable without a session by design. Sign-in and password reset must be ' +
      'usable by someone who has no branch yet; the public form and its schema ' +
      'are handed to strangers on purpose (the resulting lead takes its branch ' +
      'from the section it routes into); the receipt endpoints exist so a payer ' +
      'can verify a document they were given.',
    routes: [
      'GET /auth/otp/poll',
      'GET /auth/telegram/callback',
      'GET /auth/telegram/start',
      'GET /auth/telegram/status',
      'GET /notifications/vapid-public-key',
      'GET /public/forms/:slug',
      'GET /receipts/:id/verify',
      'GET /receipts/payment/:id.pdf',
      'GET /receipts/payment/:id/verify',
      'GET /receipts/refund/:id.pdf',
      'GET /receipts/refund/:id/verify',
      'POST /auth/forgot-password/request',
      'POST /auth/forgot-password/reset',
      'POST /auth/forgot-password/verify',
      'POST /auth/login',
      'POST /auth/refresh',
      'POST /auth/telegram/complete',
      'POST /public/forms/:slug/submit',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('id')`. There is no branch question: the caller is " +
      'the subject. `resolveMonthlyScope` additionally skips branch confinement ' +
      'for a self lookup, so an id-exact request for your own row cannot come ' +
      'back empty because your `UserBranch` rows disagree with `mainBranch`.',
    routes: [
      'GET /salary/me/accruals',
      'GET /salary/me/current-cycle/breakdown',
      'GET /salary/me/monthly',
      'GET /salary/me/payments/:id/breakdown',
      'GET /salary/me/summary',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Id-addressed money paths. The branch is resolved from the record and the ' +
      'caller is verified against it — before the transaction for a cheap refusal ' +
      'and again INSIDE it with the transaction client, because a student can ' +
      'change branch between the two. Taking the header instead would let the ' +
      'branch a user happens to be viewing decide where money is booked.',
    routes: [
      'POST /payments',
      'POST /payments/:id/correct',
      'POST /payments/:id/reverse',
      'POST /payments/attach-external',
      'POST /refunds/:id/reverse',
      'POST /refunds/quick',
      'PATCH /refunds/:id/process',
      'GET /refunds/preview/:studentId',
      'POST /transactions/adjustment',
      'POST /withdrawals',
      'GET /withdrawals/preview/:studentId',
      'POST /billing/debt-write-offs/:id/reverse',
      'POST /billing/lesson-deduction/:id/reverse',
      'POST /billing/retroactive/:studentId',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Telegram group administration. The group row carries the branch whose ' +
      'operational events it receives, so `assertCallerInBranch` is checked ' +
      'against that record — in BOTH directions on a change, because pointing a ' +
      "group away from a branch redirects that branch's payment and attendance " +
      'traffic just as much as pointing one at it. The `receivesAllBranches` ' +
      'flag is CEO-only for the same reason: granting it hands a chat every ' +
      "branch's money traffic.",
    routes: ['POST /telegram-groups/:id/approve', 'PATCH /telegram-groups/:id'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Cash accounts and expenses, audited route by route. Every id-addressed ' +
      'cash operation resolves through `findOne(id, companyId, userId)` and its ' +
      '`assertCallerInBranch`; `transfer` checks BOTH sides. Expenses call ' +
      '`assertBranchWritable` on create and on update — for the old branch and ' +
      'the new one, because moving an expense between branches changes whose ' +
      'P&L carries it. `POST /cash-accounts` was the one gap: it verified the ' +
      'branch belonged to the company but never that the CALLER could act on ' +
      "it, so a director could open an account inside another branch's books.",
    routes: [
      'GET /cash-accounts/:id/movements',
      'POST /cash-accounts',
      'POST /cash-accounts/:id/reconcile',
      'POST /cash-accounts/transfer',
      'PATCH /cash-accounts/:id',
      'DELETE /cash-accounts/:id',
      'POST /expenses',
      'PATCH /expenses/:id',
      'DELETE /expenses/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'Scoped, but by their OWN call to `resolveCallerReportBranchIds(userId, ' +
      'query.branchId)` rather than by `@BranchScope()` — so the ceiling ∩ ' +
      'requested rule holds and a `?branchId=` cannot widen anything. Listed ' +
      'here because the source does not evidence them the way the decorator ' +
      'does, and a reader checking for the decorator would wrongly conclude ' +
      'they are unscoped. Expenses additionally refuse an empty scope with 403 ' +
      'rather than serving zeros.',
    routes: [
      'GET /cash-accounts',
      'GET /expenses',
      'GET /expenses/pdf',
      'GET /payments/debtors',
      'GET /payments/debtors/summary',
      'GET /transactions/debt-write-offs',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Lessons — attendance and the three modules that manipulate the same ' +
      'lessons. All four resolve through `assertCallerMayTouchGroup`: a PURE ' +
      'teacher by group assignment (the stronger test — being in the branch ' +
      "does not entitle you to another teacher's register), everyone else by " +
      "the group's branch. Attendance alone had this rule, privately, so " +
      'cancellations, reschedules and planned absences each shipped checking ' +
      '`companyId` and stopping. Cancelling was the worst of them: it flips ' +
      'attendance to EXCUSED, reverses the LESSON_CONSUMPTION, restores prepaid ' +
      "lessons and reverses the teacher's SalaryAccrual — real money in a " +
      'branch the caller cannot even view.',
    routes: [
      'GET /attendance/:groupId/calendar',
      'GET /attendance/:groupId/date/:date',
      'GET /attendance/:groupId/dates',
      'GET /attendance/:groupId/lesson-sequence',
      'GET /attendance/:groupId/stats',
      'POST /attendance/:groupId/date/:date',
      'POST /attendance/:groupId/qr-session/rotate',
      'POST /attendance/:groupId/qr-session/start',
      'POST /attendance/:groupId/qr-session/stop',
      'GET /lesson-cancellations',
      'POST /lesson-cancellations',
      'DELETE /lesson-cancellations/:id',
      'GET /lesson-reschedules',
      'POST /lesson-reschedules',
      'PATCH /lesson-reschedules/:id',
      'DELETE /lesson-reschedules/:id',
      'POST /planned-absences/:groupId/date/:date',
      'DELETE /planned-absences/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Id-addressed student and group writes. Each resolves the record's own " +
      'branch and checks the caller against it — `assertCallerMayTouchStudent` ' +
      'and `assertCallerMayTouchGroup`. They were `companyId`-only, and two of ' +
      'them carry a branch in the BODY: `PATCH /students/:id` accepts ' +
      "`branchIds`, so a director could edit another branch's student and move " +
      'them into their own, and `POST /groups` names the branch a group is ' +
      'fixed to for life. The status changes cascade — a student going EXPELLED ' +
      'closes their enrolments, a group going CANCELLED closes every enrolment ' +
      "in it — so they reach another branch's roster and payroll.",
    routes: [
      'POST /students',
      'PATCH /students/:id',
      'PATCH /students/:id/status',
      'DELETE /students/:id',
      'POST /groups',
      'PATCH /groups/:id',
      'PATCH /groups/:id/status',
      'DELETE /groups/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'The rest of the student and group surface: the profile READS, the ' +
      'enrollment operations, and the roster. The list endpoints were scoped ' +
      'and everything they linked to was not, so a director who typed another ' +
      "branch's student id into the URL read the balance, the ledger summary, " +
      'the lesson history and the SMS log in full. Three of the enrollment ' +
      'routes are addressed by an ENROLLMENT id and have always ignored the ' +
      "`:id` in the path, so each guards the enrollment's OWN student — " +
      'guarding the path parameter would let a caller pair one of their own ' +
      "student ids with another branch's enrollment and pass. " +
      '`write-off-cycle-debt` writes a DEBT_WRITE_OFF ledger row: money the ' +
      'earlier `/payments`-`/refunds`-`/transactions` sweep never reached, ' +
      'because it lives under `/students`. `GET /groups/:id/students` returns ' +
      'phone and balance for the whole roster and its @Roles includes Teacher, ' +
      'so it goes through `assertCallerMayTouchGroup` — assignment for a pure ' +
      'teacher, branch for everyone else.',
    routes: [
      'GET /students/:id/status-history',
      'GET /students/:id/balance-summary',
      'GET /students/:id/debt-origin',
      'GET /students/:id/active-enrollments-prepaid',
      'GET /students/:id/closed-enrollments',
      'GET /students/:id/lessons-overview',
      'GET /students/:id/sms',
      'POST /students/:id/sms',
      'POST /students/:id/initial-balance',
      'POST /students/:id/enroll',
      'DELETE /students/:id/enroll/:enrollmentId',
      'GET /students/:id/enrollments/:enrollmentId/debt-write-off-eligibility',
      'POST /students/:id/enrollments/:enrollmentId/write-off-cycle-debt',
      'GET /groups/:id/students',
      'GET /groups/:id/status-history',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Comments, gated by the record they hang off. `entityType` was a free ' +
      'string and NOTHING checked the entity — not that it existed, not the ' +
      'company, not the branch — so `?entityType=Student&entityId=<any id>` ' +
      'returned every note staff had written about that student. Production ' +
      'carries 748: Student 487, Lead 232, Group 29. ' +
      "`assertCallerMayTouchCommentEntity` delegates to each record's own " +
      'guard rather than inventing a fifth branch rule, and the DTO now ' +
      'validates against a closed four-type list so an unknown type fails ' +
      'instead of creating a thread nobody can scope. Lead is the one ' +
      'exception and it is deliberate: `branchId` null means the shared ' +
      'unassigned pool, matching `leadBranchWhere`, because a new enquiry ' +
      'must be commentable before anyone knows which branch will teach them.',
    routes: ['POST /comments', 'GET /comments', 'GET /comments/latest'],
  },
  {
    policy: 'SELF',
    reason:
      'Own tasks, own authorship. `my-tasks` and `assignee-status` are keyed ' +
      "on the caller's own `CommentAssignee` row; `created-tasks` on " +
      '`authorId`. `PATCH` and `DELETE /comments/:id` are author-or-CEO, ' +
      "which is STRICTER than branch — a director cannot edit a colleague's " +
      'note even inside their own branch — so a branch check would add ' +
      'nothing.',
    routes: [
      'GET /comments/my-tasks',
      'GET /comments/created-tasks',
      'PATCH /comments/:id',
      'PATCH /comments/:id/assignee-status',
      'DELETE /comments/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Teachers, and one call-log write. A teacher IS a `User`, and ' +
      '`PATCH /users/:id` has been branch-confined since the object-level ' +
      'sweep — but `/teachers/:id` edits the SAME rows and was never touched. ' +
      'It accepts `password` and `login`, so a Branch Director of one branch ' +
      "could set the password of the other branch's teacher and sign in as " +
      'them. Production has 15 teachers, 10 in Fargona and 5 in Namangan: two ' +
      'doors to one record, one of them locked. They share ' +
      '`assertCallerMayTouchUser` rather than a second copy of the rule, and ' +
      "each guard sits AFTER its method's own existence check so a stale id " +
      'still answers 404. `POST /call-logs` attributed the row to the ' +
      "student's branch but never asked whether the caller could act on that " +
      'student — and a WILL_PAY outcome opens a `PaymentPromise` that lands ' +
      "in another branch's debtors workflow.",
    routes: [
      'POST /teachers',
      'PATCH /teachers/:id',
      'PATCH /teachers/:id/status',
      'DELETE /teachers/:id',
      'GET /teachers/:id/groups',
      'GET /teachers/:id/salary-summary',
      'GET /teachers/:id/status-history',
      'POST /call-logs',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'The audit log, employee writes, and the branch record itself. ' +
      '`GET /entity-history/:entityType/:entityId` took both parameters off ' +
      'the URL and checked only `companyId` — 17 727 rows across 23 types in ' +
      'production, each carrying the before-and-after of every changed field, ' +
      'and `Student` alone is 9 031 of them. It is a VIEW of records, so it ' +
      "delegates to each record's own guard; the five types with no branch " +
      'dimension are NAMED, because "I cannot scope this" and "this has no ' +
      'branch" must not answer alike. `POST /users` already validated that ' +
      'the branches were real, which is the `assertSingleValidBranch` trap ' +
      'again — creating a user IS granting access, so a Fargona director ' +
      'could mint a Branch Director OF NAMANGAN with a password of their ' +
      'choosing. `DELETE /users/:id` archived across branches while ' +
      '`PATCH /users/:id` beside it was locked. Branches were already ' +
      'confined by `assertCallerMayTouchBranch`; they are listed so the next ' +
      'reader does not have to re-derive that.',
    routes: [
      'GET /entity-history/:entityType/:entityId',
      'POST /users',
      'DELETE /users/:id',
      'PATCH /users/:id',
      'GET /branches/:id/readiness',
      'GET /branches/:id/status-history',
      'PATCH /branches/:id',
      'PATCH /branches/:id/status',
    ],
  },
  {
    policy: 'SELF',
    reason:
      'The caller acting on their own account. Both take the id from ' +
      "`@CurrentUser('id')` and never from the request, so there is no " +
      'other account they could reach and a branch check would gate nothing.',
    routes: ['PATCH /users/password', 'PATCH /users/profile'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_PAYROLL',
    reason:
      "Confined by `resolvePayrollBranchScope(performedById)` — the payee's " +
      "branch, not the viewer's selection. Fails CLOSED: a caller who is branch- " +
      'confined but has no branch attached sees and pays NOTHING. Two production ' +
      'Administrators were in exactly that state, and the old code collapsed it ' +
      'to "no filter", which let them `batchPay` every branch.',
    routes: [
      'GET /salary/accruals/:userId',
      'GET /salary/advance-calendar',
      'GET /salary/advances/:userId',
      'GET /salary/matrix',
      'GET /salary/monthly/user/:userId',
      'GET /salary/payments',
      'GET /salary/payments/:id/breakdown',
      'GET /salary/payments/settle-month/preview',
      'GET /salary/timeline/:userId',
      'PATCH /salary/payments/:id/approve',
      'POST /salary/payments/:id/pay',
      'POST /salary/payments/batch-pay',
      'POST /salary/payments/settle-month',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Company-level configuration, not branch data. A salary RATE and the ' +
      'payroll cycle apply to the whole company by design (a rate is per employee, ' +
      'and the employee already carries a branch); `POST /salary/calculate` is ' +
      'cron-internal and settles every branch in one run, which is why it is ' +
      'CEO-only and has no UI trigger.',
    routes: [
      'GET /salary/config-history/:userId',
      'GET /salary/config/:userId',
      'GET /salary/configs/by-users',
      'GET /salary/period-preview',
      'GET /salary/period-settings',
      'PATCH /salary/config/:id',
      'POST /salary/calculate',
      'POST /salary/config',
      'POST /salary/config/global',
      'POST /salary/period-settings',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'The DaF learning catalogue is reference content, not branch data. It is ' +
      "COERLL's CC BY 4.0 material: the same units, vocabulary and exercises for " +
      'every branch, which is why the `Daf*` content tables carry no `companyId` ' +
      'at all. Scoping these reads by branch would answer a question nobody asks ' +
      'and imply the catalogue differs per branch, which it does not.',
    routes: [
      'GET /student-portal/lernen/levels',
      'GET /student-portal/lernen/units/:id',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` — the caller is the subject, and the " +
      'DTO deliberately has no `studentId` field, so one student cannot write an ' +
      "attempt in another's name. The row DOES carry a branch, but it is STAMPED " +
      "from the student's own record at write time rather than taken from a " +
      'header: a later transfer must not move past results into the new branch.',
    routes: ['POST /student-portal/lernen/attempts'],
  },
];

/**
 * Routes not yet reasoned about, listed in full so the number is a fact rather
 * than an estimate. The spec asserts the count never grows: a new endpoint
 * cannot join this list, so it must be classified when it is written.
 *
 * Shrinking it is ordinary work — move a route into a block above and give the
 * block a reason that is true of every route in it.
 */
export const UNREVIEWED_ROUTES: string[] = [
  'DELETE /archive/:entityType/:id',
  'DELETE /courses/:id',
  'DELETE /enrollment-transfer-reasons/:id',
  'DELETE /group-teacher-change-reasons/:id',
  'DELETE /holidays/:id',
  'DELETE /lead-sources/:id',
  'DELETE /lesson-teacher-overrides/:id',
  'DELETE /mock-exam-sections/:id',
  'DELETE /mock-exam-subjects/:id',
  'DELETE /notifications/devices',
  'DELETE /notifications/push/unsubscribe',
  'DELETE /rooms/:id',
  'DELETE /student-exit-reasons/:id',
  'DELETE /student-portal/photo',
  'DELETE /telegram-groups/:id',
  'GET /archive/:entityType',
  'GET /archive/:entityType/:id',
  'GET /archive/counts',
  'GET /branches',
  'GET /branches/:id',
  'GET /company',
  'GET /company/:id',
  'GET /courses/:id/status-history',
  'GET /enrollment-transfer-reasons',
  'GET /gateways/events',
  'GET /group-teacher-change-reasons',
  'GET /groups/available-rooms',
  'GET /groups/available-slots',
  'GET /groups/available-teachers',
  'GET /groups/next-name',
  'GET /groups/schedule-conflicts',
  'GET /holidays',
  'GET /holidays/:id',
  'GET /holidays/:id/status-history',
  'GET /lead-sources',
  'GET /lead-sources/filter',
  'GET /leads/:id/hover-summary',
  'GET /leads/by-student/:studentId',
  'GET /lesson-reschedules/available-rooms',
  'GET /lesson-teacher-overrides',
  'GET /mock-exam-sections',
  'GET /mock-exams/:examId/results-matrix',
  'GET /mock-exams/:examId/subjects',
  'GET /notifications',
  'GET /notifications/stream',
  'GET /notifications/unread-count',
  'GET /reports/debt-write-offs-summary',
  'GET /reports/expectation-history',
  'GET /reports/financial-excel',
  'GET /reports/financial-overview',
  'GET /reports/financial-trend',
  'GET /reports/income-month-attribution',
  'GET /reports/lead-analytics',
  'GET /rooms/:id/status-history',
  'GET /rooms/count-by-branch',
  'GET /student-exit-reasons',
  'GET /student-portal/attendance/history',
  'GET /student-portal/attendance/stats',
  'GET /student-portal/payments',
  'GET /student-portal/profile',
  'GET /student-portal/schedule',
  'GET /telegram-groups',
  'GET /telegram-groups/pending',
  'GET /telegram/channel-report/list',
  'GET /telegram/channel-report/summary',
  'PATCH /company/:id',
  'PATCH /courses/:id',
  'PATCH /courses/:id/status',
  'PATCH /enrollment-transfer-reasons/:id',
  'PATCH /group-teacher-change-reasons/:id',
  'PATCH /holidays/:id',
  'PATCH /holidays/:id/status',
  'PATCH /lead-sources/:id',
  'PATCH /leads/reorder',
  'PATCH /mock-exam-sections/:id',
  'PATCH /mock-exam-sections/reorder',
  'PATCH /mock-exam-subjects/:id',
  'PATCH /mock-exams/:examId/subjects/reorder',
  'PATCH /notifications/:id/read',
  'PATCH /notifications/read-all',
  'PATCH /rooms/:id',
  'PATCH /rooms/:id/status',
  'PATCH /student-exit-reasons/:id',
  'PATCH /student-portal/name',
  'PATCH /student-portal/password',
  'POST /archive/:entityType/:id/restore',
  'POST /branches',
  'POST /courses',
  'POST /enrollment-transfer-reasons',
  'POST /group-teacher-change-reasons',
  'POST /holidays',
  'POST /lead-sources',
  'POST /leads',
  'POST /mock-exam-sections',
  'POST /mock-exams/:examId/recalculate-ranks',
  'POST /mock-exams/:examId/scores/bulk',
  'POST /mock-exams/:examId/subjects',
  'POST /notifications/devices',
  'POST /notifications/push/subscribe',
  'POST /rooms',
  'POST /student-exit-reasons',
  'POST /student-portal/attendance/scan',
  'POST /student-portal/payments/init',
  'POST /student-portal/photo',
  'POST /telegram-groups/:id/reject',
  'POST /telegram-groups/announce',
  'POST /telegram/employee-link',
  'POST /upload',
  'PUT /lesson-teacher-overrides/:groupId/:date',
];

/**
 * The `UNREVIEWED` ceiling — a LITERAL, deliberately.
 *
 * Deriving it from `UNREVIEWED_ROUTES.length` would make the check
 * self-referential: the list could grow without limit and the assertion would
 * pass every time, which is exactly the shape of a guard that reports success
 * while enforcing nothing.
 *
 * Lower it whenever routes are classified. Raising it requires editing this
 * line, which is visible in review — and that visibility IS the mechanism.
 */
export const UNREVIEWED_BUDGET = 114;
