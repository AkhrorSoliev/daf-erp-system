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
      'POST /auth/telegram/webapp',
      'POST /auth/telegram/webapp/staff',
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
      'GET /teachers/me/stats',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "The caller's own capability list, read through " +
      "`PermissionsService.forUser(@CurrentUser('id'))`. No branch question.",
    routes: ['GET /permissions/me'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      "The «Ruxsatlar» page (ADR-0087): a role's capability settings belong to " +
      'the whole company — `RolePermission` has no branch, and one row turns a ' +
      'key on or off for every holder of that role in every branch — and so ' +
      'does their change history. CEO-only through `@CeoOnly()`, a database ' +
      'role check that is never a capability (spec §4.2).',
    routes: [
      'GET /permissions',
      'GET /permissions/history',
      'POST /permissions/roles/:roleId/reset',
      'PUT /permissions/roles/:roleId',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      '«Dars baholari» switch (spec 2026-10-13 §6.1): `lessonRating.enabled` is a ' +
      'company-level setting (`companyLevelOnly`) — one value for every branch. ' +
      'CEO-only through `@CeoOnly()`. The three reads take `@BranchScope()`.',
    routes: ['PATCH /lesson-ratings/settings'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Lead ownership limits (ADR-0093): `leads.maxUntouched`, ' +
      '`leads.firstActionHours` and `leads.followUpDays` are company-level ' +
      'settings (`companyLevelOnly`) — one value for every branch. The read ' +
      'carries numbers only; the write is CEO-only through `@CeoOnly()`. The ' +
      'other ownership routes take `@BranchScope()`.',
    routes: [
      'GET /leads/ownership/settings',
      'PATCH /leads/ownership/settings',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'KPI prices and switch (ADR-0096): `kpi.enabled`, `kpi.leadPaid.*` and ' +
      '`kpi.promiseKept.*` are company-level settings (`companyLevelOnly`) — one ' +
      'value for every branch. The read carries the rules only; the write is ' +
      'CEO-only through `@CeoOnly()`. `GET /kpi/overview` and ' +
      '`GET /kpi/users/:id` take `@BranchScope()`.',
    routes: ['GET /kpi/settings', 'PATCH /kpi/settings'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Id-addressed money paths. The branch is resolved from the record (or ' +
      'from the student the path names) and the caller is verified against ' +
      'it before anything is written or shown. `POST /payments` checks again ' +
      'INSIDE its transaction with the transaction client, because a student ' +
      'can change branch between the two; `POST /transactions/adjustment` and ' +
      'the three `/billing/*` routes check once, inside their own ' +
      'transaction, with its client; the other writes here (the refund routes ' +
      "and `POST /students/:id/balance-notices` among them) check the student's " +
      'branch once, before the write; the two previews refuse a student of ' +
      'another branch before answering with anything. The adjustment takes no ' +
      "branch from the body: its ledger row carries the student's branch. " +
      'Taking the header instead would let the branch a user happens to be ' +
      'viewing decide where money is booked.',
    routes: [
      'POST /payments',
      'POST /payments/:id/correct',
      'POST /payments/:id/reverse',
      'POST /payments/attach-external',
      'POST /refunds/:id/reverse',
      'POST /refunds/:id/hand-over',
      'POST /refunds/:id/cancel',
      'POST /refunds/quick',
      'GET /refunds/preview/:studentId',
      'POST /transactions/adjustment',
      'POST /withdrawals',
      'GET /withdrawals/preview/:studentId',
      'POST /students/:id/balance-notices',
      'POST /billing/debt-write-offs/:id/reverse',
      'POST /billing/lesson-deduction/:id/reverse',
      'POST /billing/retroactive/:studentId',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Student contracts (ADR-0075). Every route resolves the student — from ' +
      'the query for the list and the prefill, from the contract row for the ' +
      'id-addressed ones — and checks the caller against that student branch ' +
      'with `assertCallerMayTouchStudent`. The header branch is never read: a ' +
      'contract belongs to the branch of the student it was made for.',
    routes: [
      'GET /contract-documents',
      'GET /contract-documents/prefill',
      'POST /contract-documents',
      'PATCH /contract-documents/:id',
      'POST /contract-documents/:id/sign',
      'POST /contract-documents/:id/cancel',
      'GET /contract-documents/:id/pdf',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Join requests (ADR-0080). Every route loads the request — by its task ' +
      'for the read, by id for the decisions — and checks the caller against ' +
      "the request's branch with `assertCallerInBranch`. The header branch is " +
      'never read: a request belongs to the branch whose link the person used.',
    routes: [
      'GET /student-join-requests/by-task/:taskId',
      'POST /student-join-requests/:id/approve',
      'POST /student-join-requests/:id/reject',
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
      'GET /expenses/month-summary',
      'GET /expenses/pdf',
      'GET /payments/debtors',
      'GET /payments/debtors/summary',
      'GET /transactions/debt-write-offs',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Lessons — attendance and the four modules that manipulate the same ' +
      'lessons (cancellations, reschedules, planned absences, substitute ' +
      'teachers). All five resolve through `assertCallerMayTouchGroup`: a PURE ' +
      'teacher by group assignment (the stronger test — being in the branch ' +
      "does not entitle you to another teacher's register), everyone else by " +
      "the group's branch. Attendance alone had this rule, privately, so " +
      'cancellations, reschedules and planned absences each shipped checking ' +
      '`companyId` and stopping. Cancelling was the worst of them: it flips ' +
      'attendance to EXCUSED, reverses the LESSON_CONSUMPTION, restores prepaid ' +
      "lessons and reverses the teacher's SalaryAccrual — real money in a " +
      'branch the caller cannot even view. ' +
      '`GET /lesson-reschedules/available-rooms` runs the same check on its ' +
      "`groupId` before it lists the free rooms of that group's branch.",
    routes: [
      'GET /attendance/:groupId/calendar',
      'GET /attendance/:groupId/date/:date',
      'GET /attendance/:groupId/dates',
      'GET /attendance/:groupId/lesson-sequence',
      'GET /attendance/:groupId/stats',
      'POST /attendance/:groupId/date/:date',
      'POST /attendance/:groupId/date/:date/late',
      'POST /attendance/:groupId/date/:date/not-held',
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
      'GET /lesson-reschedules/available-rooms',
      'POST /planned-absences/:groupId/date/:date',
      'DELETE /planned-absences/:id',
      'GET /lesson-teacher-overrides',
      'PUT /lesson-teacher-overrides/:groupId/:date',
      'DELETE /lesson-teacher-overrides/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Student and group writes. The id-addressed ones resolve the record's " +
      'own branch and check the caller against it — ' +
      '`assertCallerMayTouchStudent` and `assertCallerMayTouchGroup`. Three ' +
      'carry a branch in the BODY, and that branch goes through ' +
      '`assertCallerInBranch` as well: `POST /groups` names the branch a group ' +
      'is fixed to for life, `POST /students` the branch a student is created ' +
      'in, and `PATCH /students/:id` accepts `branchIds`, so it checks BOTH ' +
      'the branch the student is in and the one they are moved to — the ' +
      "first stops a director pulling another branch's student into their " +
      'own, the second stops them pushing one of theirs into another branch, ' +
      'which ends where creating it there would. `POST /students` used to ask ' +
      'only whether the branch existed in the company, so a director could ' +
      'create a student in another branch outright. The status changes ' +
      'cascade — a student going EXPELLED closes their enrolments, a group ' +
      'going CANCELLED closes every enrolment in it — so they reach another ' +
      "branch's roster and payroll. " +
      '`POST /groups` and `PATCH /groups/:id` also name a course and a room, ' +
      "and both must belong to the group's own branch, even for a CEO " +
      '(`GroupsWriteService.assertCourseInGroupBranch` / ' +
      "`assertRoomInGroupBranch`): the course's branch sets the price the " +
      "group's students pay and can archive the course, which cancels the " +
      'group.',
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
      'Id-addressed room and course operations. Each looks the record up by ' +
      "`companyId` and then checks the caller against the record's OWN branch " +
      'with `assertCallerInBranch` — after the existence check, so a stale id ' +
      'still answers 404. They were `companyId`-only, so a director or admin ' +
      "of one branch could rewrite another branch's course: `price` drives " +
      'every per-lesson charge of its students, `paymentModel` their billing ' +
      'rules, and archiving it cancels its groups and drops their enrolments. ' +
      'Neither update DTO accepts `branchId` (the global ValidationPipe rejects ' +
      "unknown fields), so the record's current branch is the only one to " +
      'check. `Course.branchId` is nullable; a course in no branch is in no ' +
      "branch's catalogue, so only a CEO may touch it. The status-history " +
      'reads share the guard: they name who changed the status and why. ' +
      'Production had 10 courses and 13 rooms, none branchless, and every ' +
      "past edit was a CEO's, so no workflow crossed branches. `POST /rooms` " +
      'and `POST /courses` name their branch in the body — a different check — ' +
      'and are not listed here.',
    routes: [
      'PATCH /rooms/:id',
      'PATCH /rooms/:id/status',
      'DELETE /rooms/:id',
      'GET /rooms/:id/status-history',
      'PATCH /courses/:id',
      'PATCH /courses/:id/status',
      'DELETE /courses/:id',
      'GET /courses/:id/status-history',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Room and course CREATES only. There is no record to look up yet, so ' +
      'the branch is the one named in the body: the service checks that it ' +
      'exists in the company and then asks `assertCallerInBranch` whether the ' +
      'caller holds it — the check `POST /groups` and `POST /cash-accounts` ' +
      'already made. Both creates stopped at the first question, so an ' +
      "Administrator of one branch could add a room to another branch's " +
      'occupancy report, and a Branch Director a course, at a price of their ' +
      "choosing, to another branch's catalogue. Their `PATCH`, `/status` and " +
      "`DELETE` siblings check the record's own branch instead and are listed " +
      'in the block above.',
    routes: ['POST /courses', 'POST /rooms'],
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
      'teacher, branch for everyone else. `GET /groups/:id/delete-preview` ' +
      'counts the students deleting a group would take out of it, behind ' +
      'the same check as `DELETE /groups/:id`. The payment statement (JSON ' +
      'and PDF) is one more profile read and runs the same check, and so ' +
      'does the departure preview, which reads the month an enrollment of ' +
      'that student would give back. The enroll preview, which reads what ' +
      "adding the student to a group would charge, checks the student's " +
      "branch, then the group's (the enroll call checks only the group's " +
      'branch: a student of another branch is refused, a student with none ' +
      "takes the group's).",
    routes: [
      'GET /students/:id/status-history',
      'GET /students/:id/balance-summary',
      'GET /students/:id/statement',
      'GET /students/:id/statement.pdf',
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
      'GET /students/:id/departure-preview',
      'GET /students/:id/enroll-preview',
      'GET /groups/:id/students',
      'GET /groups/:id/status-history',
      'GET /groups/:id/delete-preview',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Lead routes that check the record rather than the header. ' +
      '`POST /leads` and `PATCH /leads/reorder` name a board section in the ' +
      'body: the section is looked up by id and `companyId` (404 when it is ' +
      "not the company's), its column's `branchId` (NOT NULL) is the branch, " +
      'and `assertCallerInBranch` refuses a caller who does not hold it before ' +
      "anything is written. The board's `@BranchScope()` only ever OFFERED the " +
      "caller's own sections; a section id or lead id list sent by hand " +
      "reached another branch's board. The public form reaches the same " +
      '`LeadsService.create` (it is in the PUBLIC block) with the stated actor ' +
      "`{ kind: 'public-form' }`, the one actor that skips the caller check: a " +
      "stranger holds no branch, and the form's own section, set by staff, " +
      "fixes the lead's. `GET /leads/by-student/:studentId` is a tab of the " +
      'student profile and runs its guard, `assertCallerMayTouchStudent`, on ' +
      "the path's student (404 unknown, 403 another branch's) before reading " +
      'the leads with `companyId`.',
    routes: [
      'POST /leads',
      'PATCH /leads/reorder',
      'GET /leads/by-student/:studentId',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Ilova faolligi statistikasi (dizayn 6.1, ADR-0020). Guruh route'lari " +
      "`assertCallerMayTouchGroup` — sof o'qituvchi uchun biriktirilganlik, " +
      "qolganlar uchun filial; yon oyna qo'shimcha ravishda o'quvchi shu " +
      "guruhning faol a'zosi ekanini tekshiradi. Profil route'i " +
      '`assertCallerMayTouchStudent`.',
    routes: [
      'GET /groups/:id/app-activity',
      'GET /groups/:id/app-activity/students/:studentId',
      'GET /students/:id/app-activity',
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
      'Own authorship. `PATCH` and `DELETE /comments/:id` are author-or-CEO, ' +
      "which is STRICTER than branch — a director cannot edit a colleague's " +
      'note even inside their own branch — so a branch check would add ' +
      'nothing. (Tasks left comments for `/tasks`; the `my-tasks`, ' +
      '`created-tasks` and `assignee-status` routes are gone.)',
    routes: ['PATCH /comments/:id', 'DELETE /comments/:id'],
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
      'doors to one record, one of them locked. Writes share ' +
      '`assertCallerMayManageUser` (branch AND rank, ADR-0027), reads ' +
      '`assertCallerMayTouchUser`, rather than a second copy of the rule, and ' +
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
      'GET /teachers/:id/stats',
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
      '`PATCH /users/:id` beside it was locked; both now need rank too ' +
      '(ADR-0027). Branches were already ' +
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
      'The caller acting on their own account. Each takes the id from ' +
      "`@CurrentUser('id')` and never from the request, so there is no " +
      'other account it could reach and a branch check would gate nothing.',
    routes: [
      'PATCH /users/password',
      'PATCH /users/phone',
      'PATCH /users/profile',
      'POST /users/logout-others',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_PAYROLL',
    reason:
      "Confined by `resolvePayrollBranchScope(performedById)` — the payee's " +
      "branch, not the viewer's selection. A list keeps only the employees " +
      "attached to the caller's branches; a read addressed by one employee or " +
      "one payment never returns another branch's payroll (403, or an empty " +
      'row from `/salary/monthly/user/:userId`), and yourself always; a ' +
      "payout stays on the caller's `mainBranch`. Fails CLOSED: a caller who " +
      'is branch-confined but has no branch attached sees and pays NOTHING. ' +
      'Two production Administrators were in exactly that state, and the old ' +
      'code collapsed it to "no filter", which let them pay salaries in ' +
      'every branch. Until 10.10.2026 the rate, accrual, advance, payment-list and ' +
      'payslip reads took no caller at all, and the matrix let an ' +
      'Administrator see every branch.',
    routes: [
      'GET /salary/accruals/:userId',
      'GET /salary/config-history/:userId',
      'GET /salary/config/:userId',
      'GET /salary/configs/by-users',
      'GET /salary/matrix',
      'GET /salary/monthly/user/:userId',
      'GET /salary/payments',
      'GET /salary/payments/:id/breakdown',
      'GET /salary/payments/settle-month/preview',
      'POST /salary/payments/:id/pay',
      'POST /salary/payments/settle-month',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "The profile's «Taymlayn» tab. It takes `teachers.view`, which the " +
      'Administrator holds, so it is confined by the RECORD rather than by ' +
      'payroll: the employee must share a branch with the caller ' +
      '(`assertCallerMayTouchUser`, the rule every other employee read uses, ' +
      'CEO everywhere), and the salary-rate events are left out (not even ' +
      'read) for a caller without `salary.view`, because an Administrator ' +
      'sees no salary (30.09.2026). Until 10.10.2026 it took no caller and ' +
      "returned any employee's rate history in the company.",
    routes: ['GET /salary/timeline/:userId'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'The automatic-pause rule is one row per company, by deliberate design: ' +
      'both branches follow the same threshold and a per-branch setting was ' +
      'explicitly left out (YAGNI). That is also why the WRITE is CEO-only — a ' +
      'Branch Director changing it would move the other branch without seeing ' +
      'it. The cron it configures runs company-wide and resolves each ' +
      "student's branch from the student, never from the caller.",
    routes: ['GET /absence-pause/settings', 'PATCH /absence-pause/settings'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'A teacher RATE write (ADR-0034, "Ustoz roli bor hammaga"). The CEO ' +
      'sets any rate; a Branch Director only for an own-branch, ACTIVE ' +
      'employee who holds the Teacher role and does not also hold CEO or ' +
      'Branch Director — never their own rate, never FIXED_MONTHLY, never a ' +
      'date before the open payroll period. The branch comes from the ' +
      'TARGET employee (and from the group for a per-group rate), not from ' +
      'the header: `assertCallerMaySetTeacherRate`. `PATCH ' +
      '/salary/config/:id` (edit an existing rate, including deactivation) ' +
      'stays CEO-only — see the COMPANY_WIDE salary block below — because ' +
      'the director UI never sends it and an open-ended PATCH could ' +
      'silently reactivate a closed config with no open version. ' +
      '`POST /salary/config/preview` runs the same write and rolls it back ' +
      '(ADR-0050), so it passes the same gate.',
    routes: ['POST /salary/config', 'POST /salary/config/preview'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Company-level configuration and the CEO-only payroll run, not branch ' +
      'data. Editing an existing rate (`PATCH`, CEO-only — see the ' +
      'BRANCH_SCOPED_BY_ENTITY block above for the narrower `POST`), the ' +
      'company-wide bulk rate and the payroll cycle apply to the whole ' +
      'company by design. `POST /salary/calculate` is cron-internal and ' +
      'settles every branch in one run, and `PATCH /salary/payments/:id/' +
      'approve` approves one row of that run; both take `salary.close`, ' +
      'which no role but the CEO holds by default. Rate READS left this ' +
      'block on 10.10.2026: they are payroll-confined now ' +
      '(BRANCH_SCOPED_BY_PAYROLL).',
    routes: [
      'GET /salary/period-preview',
      'GET /salary/period-settings',
      'PATCH /salary/config/:id',
      'PATCH /salary/payments/:id/approve',
      'POST /salary/calculate',
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
      'at all. The media inventory endpoints return generated content (audio, ' +
      'images, character profiles) produced alongside the catalogue, read either ' +
      'from on-disk JSON manifests or, for the unit/section coverage view, the ' +
      'per-section material list, and the per-section exercise-question preview ' +
      'behind them, directly by aggregating the `Daf*` content tables — the ' +
      'question preview takes no `studentId` (it re-derives every question the ' +
      'engine could build from the material, not the subset one student would ' +
      'see, so there is nothing student- or branch-specific to scope) — either ' +
      'way this content is identical per branch and carries no `companyId`. ' +
      'Scoping these reads by branch would answer a ' +
      'question nobody asks and imply the catalogue differs per branch, which it ' +
      'does not.',
    routes: [
      'GET /daf/media/coverage',
      'GET /daf/media/overview',
      'GET /daf/media/sections/:id/fragen',
      'GET /daf/media/sections/:id/inhalt',
      'GET /student-portal/lernen/grammar',
      'GET /student-portal/lernen/lessons/:id',
      'GET /student-portal/lernen/lessons/:id/drill',
    ],
  },
  {
    policy: 'SELF',
    reason:
      'The catalogue itself is COMPANY_WIDE (see above), but these three build a ' +
      'SESSION from it, not the catalogue verbatim. `seans()` and `ersatz()` ' +
      "both read the caller's own Leitner state (`DafLexemeState` — which " +
      'words are due, which format each was last asked in) to decide which ' +
      'questions to build, so the response is a payload that differs per ' +
      'student even though the underlying material is shared — exactly what ' +
      'COMPANY_WIDE promises it does not. `wiederholung()` goes further: it ' +
      'belongs to no lesson at all — the whole session (both which words are ' +
      "asked and which words supply distractors) is built from the caller's " +
      'own due `DafLexemeState` rows, so there is no catalogue-verbatim part ' +
      'to it in the first place.',
    routes: [
      'GET /student-portal/lernen/lessons/:id/uebung',
      'GET /student-portal/lernen/lessons/:id/uebung/ersatz',
      'GET /student-portal/lernen/wiederholung/uebung',
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
    routes: [
      'POST /student-portal/lernen/attempts',
      'POST /student-portal/lernen/drill/check',
      'POST /student-portal/lernen/lessons/:id/abschluss',
      // Takrorlash seansi yakuni — `DafSession` shu o'quvchining nomiga,
      // `sessionId` egaligi servisda tekshiriladi (403).
      'POST /student-portal/lernen/wiederholung/abschluss',
      'POST /student-portal/lernen/uebung/check',
      // `uebung/juft` — matching mashqidagi BITTA juftni jonli tekshirish.
      // Xuddi `uebung/check` bilan bir xil sabab: `@CurrentUser('studentId')`
      // dan kelinadi, DTOda `studentId` yo'q, va yozuv har bosishda
      // haqiqiy `dafAttempt` sifatida SHU o'quvchining nomiga muhrlanadi.
      'POST /student-portal/lernen/uebung/juft',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` — the caller is the subject and the " +
      'DTO has no `studentId`. A session id owned by another student is refused ' +
      "(403). The row's branch is STAMPED from the student's own record on the " +
      'first write, never taken from a header, so a later transfer does not move ' +
      'past activity into the new branch.',
    routes: ['POST /student-portal/activity'],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      'caller downloads their own payment statement, or has the bot send it to ' +
      'the Telegram chat linked to their own card, and no id comes from the ' +
      'request.',
    routes: [
      'GET /student-portal/statement.pdf',
      'POST /student-portal/statement/telegram',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      "student's own first-run data (ADR-0039): the onboarding status, gender " +
      'and birth date on their own card, and the SMS code that proves the ' +
      "card's number — or, behind the caller's current password, a number " +
      'they type, which then replaces the number on their OWN card and ' +
      'sign-in account. No student id comes from the request, and the row ' +
      'written is always the caller card, whatever its branch.',
    routes: [
      'GET /student-portal/onboarding',
      'PATCH /student-portal/onboarding/profile',
      'POST /student-portal/onboarding/phone/change-code',
      'POST /student-portal/onboarding/phone/send-code',
      'POST /student-portal/onboarding/phone/verify',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      "student's own backup number (ADR-0070): read, added or changed behind " +
      'their current password and an SMS code to the new number, or removed ' +
      'behind the password. No student id comes from the request, and the ' +
      'row written is always the caller card, whatever its branch.',
    routes: [
      'GET /student-portal/extra-phone',
      'POST /student-portal/extra-phone/remove',
      'POST /student-portal/extra-phone/send-code',
      'POST /student-portal/extra-phone/verify',
    ],
  },
  {
    policy: 'SELF',
    reason:
      'The catalogue itself is COMPANY_WIDE (see above) — these two routes moved ' +
      'out of that block because the RESPONSE is no longer just the catalogue. ' +
      "`getLevels`/`getUnit` now read `DafLessonProgress` for the caller's own " +
      '`studentId` and attach it (`doneCount`, per-lesson `completedAt`/' +
      '`bestScore`/`runs`) — the same content, but the payload differs per ' +
      'student, which is exactly what COMPANY_WIDE promises it does not.',
    routes: [
      'GET /student-portal/lernen/levels',
      'GET /student-portal/lernen/units/:id',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` — the response is the caller's own " +
      "progress or a leaderboard row list, never another student's read by id. " +
      '`GET .../fortschritt` is SELF in the ordinary sense: every field on it ' +
      "is the caller's own (their total, level, streak, rank). " +
      '`GET .../reyting` is SELF for the SAME reason (the caller decides which ' +
      'of their two tables to see via `?scope=`), but its `zentrum` branch is ' +
      'DELIBERATELY NOT branch-scoped inside that — this is the one exception ' +
      'in the whole route-branch story, not an oversight. The CEO decided on ' +
      '2026-09-06 that the weekly ranking spans the whole centre: a student in ' +
      'one branch sees the full name of a student in another. Recorded in ' +
      '`docs/superpowers/specs/2026-09-06-ball-va-yol-design.md` section 6.1, ' +
      "and in the comment on `FortschrittService`'s centre query " +
      '(`fortschritt/fortschritt.service.ts`). Do not add a `branchId` filter ' +
      "there — that would be 'fixing' a considered decision.",
    routes: [
      'GET /student-portal/lernen/fortschritt',
      'GET /student-portal/lernen/reyting',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The settings panel resolves its own scope by calling ' +
      '`resolveCallerBranchScope(userId)` rather than taking `@BranchScope()`, ' +
      'because reads and writes here need a STRICTER rule than ceiling ∩ ' +
      'requested: a CEO may read or write the company-wide row (`branchId = ' +
      'null`) or any one branch, but a Branch Director may NEVER touch the ' +
      'company-wide row — even an empty request body is forced onto the ' +
      "caller's own branch, not merged with it. `@BranchScope()` has no way " +
      'to express "this ceiling can never resolve to company-wide", so the ' +
      'controller does the resolution itself.',
    routes: ['GET /settings/payment', 'PATCH /settings/payment'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      "The Foyda card breakdown resolves its scope through the controller's " +
      '`resolveScope` (`resolveCallerReportBranchIds`, ceiling ∩ requested, ' +
      '403 on an empty scope) and hands it to `assembleMonthlyNetProfit` — ' +
      'the same call behind the card, so the breakdown cannot be scoped ' +
      'differently from the figure it explains. Every extra query it makes ' +
      '(expenses, monthly charges) carries `branchIdWhere` itself or reads ' +
      'ids from the already-scoped lessons.',
    routes: ['GET /reports/profit-composition'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The marketing report resolves its scope with `resolveCallerReportBranchIds` ' +
      '(ceiling ∩ requested, 403 on an empty scope) and hands the one list to ' +
      'every leg: first payments through `studentBranchWhere`, MARKETING spend ' +
      'through `branchIdWhere`, and the month charges, departures and lead-source ' +
      'cohort through their own services with the same list.',
    routes: ['GET /reports/marketing'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The task module does not take `@BranchScope()`: `TasksService.loadActor` ' +
      "builds the caller's `TaskActor` from the DATABASE (roles, and " +
      '`resolveCallerBranchScope` for `scope`), never from the token, and every ' +
      'list-shaped read applies that scope itself — `TasksReadService.' +
      'visibilityWhere` (own tasks, plus the branch for a Branch Director), the ' +
      'workload branch filter and the assignable-people filter. A create takes ' +
      "the task's branch from `resolveTaskBranchId` (the linked entity's " +
      'branch, else the `X-Branch-Id` pick), which refuses a branch outside ' +
      "the caller's scope instead of widening it. The recurrence list (`" +
      'TaskRecurrencesService.list`) applies the same scope: the CEO the ' +
      "company, a Branch Director their own rules plus their branches', " +
      'anyone else their own.',
    routes: [
      'GET /tasks',
      'GET /tasks/assignable',
      'GET /tasks/counts',
      'GET /tasks/recurrences',
      'GET /tasks/workload',
      'POST /tasks',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Every id-addressed task route loads the task through `TasksService.' +
      'loadForAccess`, which finds it by id AND company and runs `resolveAccess` ' +
      "on the RECORD: the caller must be the task's author, an assignee, a " +
      'watcher, or its manager (the CEO, or a Branch Director whose branches ' +
      "include the task's own `branchId`). Anyone else gets the same 404 as for " +
      "a missing id, so another branch's task id leaks nothing. The write " +
      'routes then check `canManage` / `canWork` from that same access result; a ' +
      'duplicate creates the copy through the same branch resolution as a new ' +
      'task. A recurrence rule is loaded by id AND company and checked with ' +
      'the same `resolveAccess` on the RULE (author, the CEO, a Branch ' +
      'Director of its `branchId`); anyone else gets 404. A task file route ' +
      '(list, upload, delete) loads the task through the same `loadForAccess` ' +
      'first; a delete then also needs the uploader or `canManage`.',
    routes: [
      'DELETE /tasks/:id/files/:fileId',
      'DELETE /tasks/:id/steps/:stepId',
      'DELETE /tasks/recurrences/:id',
      'GET /tasks/:id',
      'GET /tasks/:id/files',
      'PATCH /tasks/:id',
      'PATCH /tasks/:id/steps/:stepId',
      'PATCH /tasks/recurrences/:id',
      'POST /tasks/:id/cancel',
      'POST /tasks/:id/duplicate',
      'POST /tasks/:id/events',
      'POST /tasks/:id/files',
      'POST /tasks/:id/review',
      'POST /tasks/:id/seen',
      'POST /tasks/:id/status',
      'POST /tasks/:id/steps',
      'PUT /tasks/:id/participants',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'A server switch, not data: whether the private task-file bucket is ' +
      'configured (`R2_TASKS_BUCKET_NAME`, ADR-0086). The same answer for ' +
      'every caller and branch.',
    routes: ['GET /tasks/config'],
  },
  {
    policy: 'SELF',
    reason:
      "The bell. Every route reads or writes rows keyed on `@CurrentUser('id')` " +
      '(`NotificationsService` filters by `userId` alone), and a notification is ' +
      'addressed to a person, not a branch: an attendance alert of a Namangan group ' +
      'went to that branch’s administrators when it was written, so there is ' +
      'nothing left to narrow at read time.',
    routes: [
      'DELETE /notifications/devices',
      'DELETE /notifications/push/unsubscribe',
      'GET /notifications',
      'GET /notifications/counts',
      'GET /notifications/stream',
      'GET /notifications/unread-count',
      'PATCH /notifications/:id/read',
      'PATCH /notifications/read-all',
      'POST /notifications/devices',
      'POST /notifications/push/subscribe',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'The three reason lists — student exit, enrollment transfer, group ' +
      'teacher change. `StudentExitReason`, `EnrollmentTransferReason` and ' +
      '`GroupTeacherChangeReason` carry `companyId` and no `branchId`, every ' +
      'query filters by `companyId` alone, and both branches pick from the same ' +
      'list, so there is no branch to confine to. The writes change that shared ' +
      'list for every branch; they sit behind `settings.reference`, which Branch ' +
      'Director and Administrator hold by default, so that capability must not ' +
      'be widened past its defaults without a decision (spec §6). Deleting is a ' +
      'soft delete: enrollments and history that already name a reason keep it.',
    routes: [
      'GET /student-exit-reasons',
      'POST /student-exit-reasons',
      'PATCH /student-exit-reasons/:id',
      'DELETE /student-exit-reasons/:id',
      'GET /enrollment-transfer-reasons',
      'POST /enrollment-transfer-reasons',
      'PATCH /enrollment-transfer-reasons/:id',
      'DELETE /enrollment-transfer-reasons/:id',
      'GET /group-teacher-change-reasons',
      'POST /group-teacher-change-reasons',
      'PATCH /group-teacher-change-reasons/:id',
      'DELETE /group-teacher-change-reasons/:id',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Lead sources (Instagram, tavsiya, …) are one list for the whole centre: ' +
      '`LeadSource` has no `branchId`, and both reads return source ids and ' +
      'names only. `GET /lead-sources/filter` also reads `Lead.sourceId` across ' +
      'every branch, but only to keep a deleted source in the filter while some ' +
      'lead still uses it — it returns the source, never the lead. The writes ' +
      '(`leads.setup`, Branch Director and Administrator by default) change the ' +
      'list for every branch. None of these queries filters by `companyId` ' +
      'either; that is a tenant gap, not a branch one, and matters only once a ' +
      'second company exists.',
    routes: [
      'GET /lead-sources',
      'GET /lead-sources/filter',
      'POST /lead-sources',
      'PATCH /lead-sources/:id',
      'DELETE /lead-sources/:id',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Mock-exam sections ("IELTS Mock", "SAT Mock") are a company-level ' +
      'grouping: `MockExamSection` has `companyId` and no `branchId`, and every ' +
      'query is `companyId`-filtered. The exams inside DO carry a branch ' +
      '(`MockExam.branchId`) and are confined by their own `@BranchScope()` ' +
      'routes; only their COUNT crosses here — `examCount` and the delete guard ' +
      "count every branch's exams, so a director may see 3 where their branch " +
      'holds 1, and cannot delete a section another branch still uses. Writes ' +
      '(`mock.manage`, Branch Director and Administrator by default) rename, ' +
      'recolour or reorder the sections for every branch.',
    routes: [
      'GET /mock-exam-sections',
      'POST /mock-exam-sections',
      'PATCH /mock-exam-sections/:id',
      'PATCH /mock-exam-sections/reorder',
      'DELETE /mock-exam-sections/:id',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Holidays (CEO decision 10.10.2026). A holiday belongs to one branch or, ' +
      'with `branchId` null, to the whole centre. Each id-addressed route loads ' +
      "the row first and checks the caller against the row's branch " +
      '(`assertCallerInBranch`). A centre-wide row is read by anyone the route ' +
      'admits, but only the CEO edits, cancels or deletes it ' +
      "(`resolveCallerBranchScope`), because its cascade moves every branch's " +
      'groups. `POST /holidays` checks the branch named in the body the same ' +
      'way, and no branch means a centre-wide holiday, so CEO only. The branch ' +
      'is fixed at creation: `UpdateHolidayDto` has no `branchId`. The list is ' +
      'not here: `GET /holidays` takes `@BranchScope()`.',
    routes: [
      'POST /holidays',
      'PATCH /holidays/:id',
      'PATCH /holidays/:id/status',
      'DELETE /holidays/:id',
      'GET /holidays/:id',
      'GET /holidays/:id/status-history',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'The company row itself: name, phone, logo, lead-form text, the DaF ' +
      "activity norms. `GET /company` reads only the caller's own company " +
      '(`where: { id: companyId }`); `GET /company/:id` and `PATCH /company/:id` ' +
      "refuse another company's id with 403. None of them returns a relation: " +
      '`findOne` used to include every branch and every course (addresses, ' +
      'prices), which handed them to any signed-in account past the ceiling ' +
      'on `GET /branches`. The write needs `settings.company`, which no role ' +
      'but the CEO holds by default.',
    routes: ['GET /company', 'GET /company/:id', 'PATCH /company/:id'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Opening a branch. There is no existing branch to check against: the row ' +
      "is new, and its transaction writes only that branch's own two cash " +
      'accounts and its NEW lead column. It is company structure, not branch ' +
      "data, and by the CEO's decision of 10.10.2026 only the CEO opens one: " +
      '`BranchesService.create` refuses every other caller with 403 before its ' +
      'transaction, although `settings.branches` (Branch Director by default) ' +
      'still admits them to the route — a director keeps editing their own ' +
      'branch through the id-addressed `/branches/:id` routes.',
    routes: ['POST /branches'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Telegram groups that carry no branch. A PENDING group has none yet — the ' +
      'bot cannot know which company or branch a new chat belongs to — so ' +
      '`GET /telegram-groups/pending` lists every pending group across ' +
      'companies (first approver wins), and `POST /telegram-groups/:id/reject` ' +
      'refuses an APPROVED group with 400, so it only ever touches a ' +
      'branch-less row. `POST /telegram-groups/announce` is product news sent to ' +
      'every approved group of every company by design, behind ' +
      '`telegram.announce`, which only the CEO holds by default.',
    routes: [
      'GET /telegram-groups/pending',
      'POST /telegram-groups/:id/reject',
      'POST /telegram-groups/announce',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      '«Bot hisoboti»: the channel gate counts Telegram users who were asked to ' +
      "join the centre's channel before using the bot. " +
      '`TelegramChannelGateEvent` has no branch and no link to a student or ' +
      'employee — the gate meets people before anyone knows who they are — so ' +
      'there is nothing to confine. Both routes read `DEFAULT_COMPANY_ID` only.',
    routes: [
      'GET /telegram/channel-report/list',
      'GET /telegram/channel-report/summary',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      '`POST /upload` writes no row: it stores an image in the bucket and ' +
      'returns its URL. Nothing is attached to a record until a separate, ' +
      'scoped route saves that URL, so there is no branch question here.',
    routes: ['POST /upload'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      "The branch switcher's option list. It takes `@BranchCeiling()` — the " +
      "caller's whole ceiling from `resolveCallerBranchScope`, not the current " +
      'selection — and filters `id: { in: ceiling }`, so a confined caller ' +
      'cannot enumerate a branch that is not theirs and a CEO (`null`) sees ' +
      'all. The ceiling rather than `@BranchScope()` is deliberate: narrowing ' +
      'by the selected branch would leave the user unable to switch away.',
    routes: ['GET /branches'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      "The rooms page's branch tabs: each branch with its name, address, " +
      'status and room count. The route is open to every signed-in account ' +
      '(`@AnyUser`), so it takes `@BranchCeiling()` and filters ' +
      '`id: { in: ceiling }`, the shape of `GET /branches`: a confined caller ' +
      'lists only their own branches, a caller with no branch lists none, the ' +
      'CEO (`null`) lists all. The ceiling rather than the selection, because ' +
      'the page picks among these tabs itself and then reads ' +
      '`GET /rooms?branch_id=`, which is header-scoped.',
    routes: ['GET /rooms/count-by-branch'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The approved groups on the «Telegram guruhlar» settings page. It takes ' +
      '`@BranchCeiling()` (every group the caller may administer, whichever ' +
      'branch the switcher shows) and keeps `branchId in ceiling` OR ' +
      "`branchId null`: a confined caller sees their own branches' groups plus " +
      'the branch-less ones, i.e. an unassigned group they may point at their ' +
      'own branch through `PATCH /telegram-groups/:id`, and an org-wide one. ' +
      'The CEO (`null`) sees every approved group of the company.',
    routes: ['GET /telegram-groups'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'The branch record itself. The requested id is looked up under ' +
      '`AND: [{ id: { in: ceiling } }]` (`@BranchCeiling()`), so a branch ' +
      "outside the caller's ceiling answers the same 404 as a missing one, " +
      'and the counts added to it are of that same branch.',
    routes: ['GET /branches/:id'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'The signed Telegram invitation (ADR-0029). The branch is named in the ' +
      'body and checked against the caller read from the DATABASE ' +
      '(`whereUserMayAct()`): a non-CEO may mint a link only for a branch in ' +
      'their `mainBranch` ∪ `UserBranch`, and only for roles inside ' +
      '`grantableRoleIdsFor` (ADR-0026). The account it later creates skips the ' +
      'caller checks precisely because the link already carries them.',
    routes: ['POST /telegram/employee-link'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      "Money reports scoped by the controller's own `resolveScope` " +
      '(`resolveCallerReportBranchIds(userId, query.branchId)`, ceiling ∩ ' +
      'requested, 403 on an empty scope) — the plumbing of ' +
      '`GET /reports/profit-composition`. The one list reaches every leg: the ' +
      'overview (pinned by `reports-branch-scope-coverage.spec.ts`) and the ' +
      "facade's expectation, month charges and debt split; the trend's " +
      '`getFinancialTrend` (pinned) and per-month canonical profit; the income ' +
      'attribution; write-offs through `branchIdWhere`; the expectation history ' +
      "through each branch's own snapshot rows. The overview's salary card is " +
      'confined by payroll scope from `performedById`, after `resolveScope` has ' +
      "already refused a branch outside the ceiling. The history's holiday " +
      'markers are not branch-filtered: they mark every holiday created in the ' +
      "company, other branches' included. " +
      '`GET /reports/financial-excel` resolves the same way and hands that one ' +
      'list to every leg of the workbook. Payroll and the operational sheets ' +
      '(rooms, attendance, teacher performance and changes) take ONE branch, ' +
      'so `ReportsExcelService.generate` refuses a list of several with 400 ' +
      '«filialni tanlang» before reading anything, as `scoped()` does on the ' +
      'operational report routes; the «Lidlar» sheet counts leads with ' +
      '`companyId` and `leadAttributionWhere`, so a branch funnel leaves the ' +
      'unassigned pool out.',
    routes: [
      'GET /reports/debt-write-offs-summary',
      'GET /reports/expectation-history',
      'GET /reports/financial-excel',
      'GET /reports/financial-overview',
      'GET /reports/financial-trend',
      'GET /reports/income-month-attribution',
    ],
  },
  {
    policy: 'SELF',
    reason:
      "The student portal's own-card routes (`@StudentOnly()`). Every handler " +
      'but the password change refuses a token without `studentId` (404) before ' +
      "any query and keys every read and write on `@CurrentUser('studentId')`: " +
      'profile, schedule, attendance, payment history, name, photo, the payment ' +
      "intent and checkout link. The QR scan writes only the caller's own " +
      'attendance row and refuses a group the caller is not enrolled in. ' +
      "`PATCH /student-portal/password` is keyed on `@CurrentUser('id')`, the " +
      "caller's own account, behind `OwnPasswordAttemptGuard`. No student id " +
      'comes from the request.',
    routes: [
      'GET /student-portal/profile',
      'GET /student-portal/schedule',
      'GET /student-portal/attendance/stats',
      'GET /student-portal/attendance/history',
      'GET /student-portal/payments',
      'PATCH /student-portal/name',
      'PATCH /student-portal/password',
      'POST /student-portal/photo',
      'DELETE /student-portal/photo',
      'POST /student-portal/payments/init',
      'POST /student-portal/attendance/scan',
    ],
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
  'DELETE /telegram-groups/:id',
  'GET /archive/:entityType',
  'GET /archive/:entityType/:id',
  'GET /archive/counts',
  'GET /gateways/events',
  'POST /archive/:entityType/:id/restore',
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
export const UNREVIEWED_BUDGET = 7;
