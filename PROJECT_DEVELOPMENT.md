# Substrata Jobs development plan and handoff

Last updated: 15 October 2026\
Next checkpoint: User-managed compatible Coolify release and feedback on Jobs submission → Ops correction/lock → project matrix → Jobs synchronization\
Status: Core entry/submission, approve/return and coordinated bounded Ops correction/direct lock/project matrix implemented locally; broader editing and requisition rules remain next; client output is optional follow-up

## 15 October coordinated implementation result

Ops and Jobs were inspected together before code changes; existing uncommitted documentation was preserved. Ops now summarizes work, corrects existing item quantities/units/descriptions/notes and daily notes with an attributable immutable version, and locks directly. Its project Daily work tab collates current locked item contributions, keeps same-day logs separate and opens exact source entries/revisions. Broader attendance/time/bore/allocation editing and requisition finalisation remain outside this increment.

Jobs shares `src/domain/reviewWork.js` with Ops (integration-enforced parity), uses its strict item validation, preserves server-owned `officeCorrection`, and displays reviewer/reason/before/after values after reconciliation. Migration **006_log_item_quantity_precision.sql** removes child-row rounding to three decimal places to match the existing numeric aggregate contract; existing historic values are not rewritten. Ops requires **017_daily_log_corrections.sql** alongside Jobs through 006. Earlier signatures/PDFs stay on earlier work; no new client output is required for a correction.

Fresh local checks passed: lint, **40 tests**, contract examples including a corrected locked aggregate and PWA build. The companion Ops build, 10 unit tests, 17 database integration results and additional actual-app browser scenario passed on a disposable shared PostgreSQL database after Docker was restored. It verifies original preservation, two-bore quantities, correction precision, role/stale/retry protection, project reconciliation and Jobs receiving the locked correction. No deployment, live records or emails were changed. See [OFFICE_REVIEW_INTEGRATION.md](docs/OFFICE_REVIEW_INTEGRATION.md).

Continue with wider shared domain/editor coverage and representative Water/Geotech/ancillary field walkthroughs. Agree measurement/commercial mappings, controlled reopen/replacement and requisition selection/freeze/reuse before implementing those boundaries. The older baseline/sequence below remains context where not superseded by this result.

## Product vision and system boundaries

### Deployment and testing preference, confirmed 15 October

The deployment target is **Coolify on the work server**. Default to local builds and focused tests without containers, then user testing and feedback through the remote apps. Continue independent implementation while feedback is pending. Local Docker is optional for a specific unresolved migration/database/transaction/integration question; explain its purpose before starting it. Do not routinely recreate a local deployment or make Docker a prerequisite to progress. The last disposable database/browser run verified the new shared correction workflow and was removed afterward.

For the next user-managed release, make compatible source available on the configured Coolify branches, verify Jobs through migration **006** and Ops through **017** plus shared-database grants, deploy Jobs before enabling the new Ops workflow, then gather walkthrough feedback. No commit/push/deployment is implied by local implementation. See [Coolify deployment](docs/COOLIFY_DEPLOYMENT.md#next-user-managed-review-release-and-feedback) and the companion Ops `docs/COOLIFY_REVIEW_HANDOFF.md` for concrete steps. This documentation update performs no deployment or live writes.

Capture the right daily work information in Jobs, submit it reliably to Ops, and let the supervisor review it at a glance, correct it where necessary and lock the reviewed work into the project for invoicing. Develop Jobs and Ops together around that complete workflow.

Confirmed on 15 October: the supervisor may edit and lock directly, without mandatory driller confirmation. Sending the record back to the driller for correction or confirmation remains an option. All corrections and lock decisions must be attributable, with the original submission preserved.

Client-facing daily-log PDFs, signatures and email are nice-to-have follow-up features. Preserve existing implementations; their configuration and refinement do not gate operational review, project lock-in or pilot acceptance.

- Ops Manager owns accounts, clients/contacts, jobs, equipment, people, plans and office review decisions.
- Jobs owns actual daily work, attendance, activities, bore progress/readings, quantities, offline drafts, signatures, immutable submissions, PDFs and delivery history.
- CORE-GS owns authoritative project/point references. Jobs reads points directly through its server-side helper, scoped by `CLNT_ID` and Ops `jobNumber = PROJ_ID`.
- Field remains the point-creation and technical-module destination. Jobs keeps references and daily observations rather than taking over geology, SPT, core, installations or photos.

Project-linked locked work is the immediate input needed for invoicing. Invoice creation, rates/pricing, accounting export and payroll automation are separate capabilities; locking a daily record must not imply that it has been invoiced. The detailed target behaviour is in [docs/MVP_SPEC.md](docs/MVP_SPEC.md); implemented contracts are in [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md) and `contracts/v1`.

## Current implementation

| Area | Implemented here | Remaining checkpoint or work |
| --- | --- | --- |
| Foundation and Step 4 | Shared Ops login and assignments; rig/ancillary logs; activities; multiple bores; attendance; quantities; continuation/handover; IndexedDB autosave; offline recovery; idempotent sync and explicit conflict resolution | Current saved Ops assignments, personal-device offline/restart and office visibility need environment acceptance |
| Daily bore input | Combined Daily log screen with prefilled context, bore details, editable Start/Finish/Work Details table, SWL/depth pairs, meter readings/units, quantities, crew and comments | Paired Jobs/Ops walkthrough to agree operational/invoicing information and refine entry |
| Step 5 submission/output | Reliable submission, immutable revisions and retention; existing signatures, draft PDFs and deliberate delivery/history | Structured submission is core; client-output refinement and mailbox/contact setup are optional follow-up |
| First Step 6 review slice | Jobs handles returned comments, owner corrections/resubmission, approved state/locking, server-owned decision metadata and review updates after dormant-device reconnects | Companion Ops review API/inbox and migration 016 must be verified together; Jobs' own office screen remains read-only |
| Current Step 6 increment | Ops work summaries, bounded existing-item/daily-note correction and direct lock; project matrix with effective locked contributions; Jobs correction display/synchronization and preserved item precision | Remote user acceptance; wider times/crew/bore/allocation editors and item additions/removals; agreed commercial/measurement mapping, controlled reopen and requisition boundaries |
| Step 7 | Automated local regression coverage and deployment guidance | Mixed Water/Geotech phone pilot, support procedures and rollout acceptance |

The office workflow is described in [docs/OFFICE_REVIEW_INTEGRATION.md](docs/OFFICE_REVIEW_INTEGRATION.md). The earlier read-only Ops inspection at `af45f0a` is a historical approve/return-only baseline, superseded by the implementation above. The current `approved` state locks reviewed work and feeds the operational project matrix; it does not create a requisition or invoice. Deployed acceptance remains unverified. Existing PDFs remain drafts; finalisation is optional follow-up.

## Immediate checkpoint: paired Jobs and Ops walkthrough

The user corrected the priority on 15 October: accurate information and quick supervisor review/edit/lock-in for project invoicing take precedence over client deliverables. Use `Daily Log Example.pdf` as a reference and evaluate inputs against what the crew records and the supervisor needs to review. Field entry and office review form one iterative workstream; neither waits for PDF/email acceptance.

Walk through one representative full shift:

1. Select a real-looking job, rig, shift and crew; choose the starting bore.
2. Record pre-start and drilling activities with times/descriptions, depths, AM/PM SWL, meter readings, quantities/tests and comments.
3. Change to a second bore; verify the first bore's observations and quantities remain separate. Correct an earlier entry and change crew attendance.
4. Close/reopen a saved draft. On a secure test origin, also disconnect, restart and reconnect to verify recovery and synchronization.
5. Finish and submit without client acknowledgement. In Ops, identify job/rig/crew, activity totals, bore progress, quantities/units, subcontractor work, comments and exceptions without opening a PDF.
6. Walk a supervisor correction and direct lock-in, plus optional return for correction/confirmation. Identify which reviewed figures must appear under the project for invoice preparation.

Record unclear labels, missing information, unnecessary taps and unsuitable units in both apps. Exit criterion: the crew can submit a realistic shift, and a supervisor can quickly understand it, correct it and lock a traceable version to the correct project for invoice preparation.

Daily details are additive `points[].dailyDetails`, validated in `src/domain/boreDetails.js` and stored by migration `005_daily_bore_details.sql`. These are daily observations. Blank/unrecorded remains distinct from explicit zero/Not used; partial readings autosave and invalid/incomplete pairs are flagged at review. Existing catalogue matches are reused; unmatched quick quantities use Other without inventing catalogue/pricing authority. Ancillary screens remain separate and omit client signature/PDF controls.

## Sequence from here

1. **Agree the required information and review layout.** Walk a shift across Jobs and Ops. Establish useful activity/quantity totals, exceptions and project allocation. Distinguish recorded actuals from chargeable decisions; do not invent rates or billing rules.
2. **Refine both apps together.** Adjust Jobs inputs/validation and Ops summary/detail views. Preserve bore/job/crew attribution, explicit units and reliable offline submission. Client acknowledgement and PDF/email must not obstruct the core flow.
3. **Extend correction and lock-in.** Build on the implemented item/note editor and direct lock with shared constraints/editors for times, attendance, bore/progress/allocation and item additions/removals. Retain optional return, immutable before/after attribution, exact-version checks and recoverable offline conflicts.
4. **Refine project collation and define the requisition boundary.** Validate the existing effective-locked operational matrix from user feedback. Agree commercial/measurement mapping, controlled changes/reopening and requisition selection/freeze/reuse before implementing them. Locking is distinct from invoice creation or proof of billing.
5. **Verify and pilot the internal loop.** Use local builds/focused tests and the user's Coolify walkthrough by default. Verify shared migrations/grants, current plans, CORE-GS and phone HTTPS offline/restart in the target environment. Use optional Docker only for a specific unresolved database/integration question, explaining its purpose. The current disposable workflow has already passed. Pilot mixed Water/Geotech and ancillary work against the two-payroll-fortnight reliability target.
6. **Optional follow-up: client deliverables.** Revisit signatures, PDF presentation/finalisation, mailbox/contact configuration and deliberate sending after the internal workflow is accepted.

Jobs and Ops changes may alternate within each increment; verify their shared contract together. Preserve existing output functions while reviewing their prominence/dependencies in the core UI. This plan does not establish deployment approval or authorise live data changes/client email.

## Configuration and cross-repository dependencies

- **CORE-GS:** Copy the working Field `CORE_GS_*` runtime settings into Jobs and verify network/login/read permissions from the Jobs container. `FIELD_API_URL` is not used for point lookup. `FIELD_BASE_URL` / `FIELD_JOBS_KEY` support optional technical/create-point handoffs. No new migration is needed for the direct reader.
- **Ops assignments:** The 15 October source inspection confirms planner persistence and structured crew assignment are implemented, superseding the earlier source gap. Verify deployed migrations/current saved plans; no live assignments were checked or changed.
- **Review:** The current correction/matrix increment requires Ops migrations through **017** and Jobs through **006**, including 004 submission and 005 bore details. Follow the companion Ops `docs/OFFICE_REVIEW_IMPLEMENTATION.md` for the additional runtime grants and verify actual applied state in Coolify.
- **Email:** Proposed mailbox `substrata-jobs@drilling.co.nz` and best-effort branding/wording were selected previously. Mailbox provisioning, Entra application/consent, restricted mailbox authorisation and runtime credentials remain unverified. Local Mailpit has no real relay.
- **Contacts:** Jobs has a client-scoped dropdown and editable recipient. The previously inspected Ops schema had client contacts but no persisted supervisor-selected job contact. Confirm its current schema, selection rule and restricted SELECT access before enabling a default.
- **Signatures/storage:** Configure and back up the persistent encryption key; retain old keys for recovery/rotation. PDFs/signatures use private PostgreSQL storage. See [docs/COOLIFY_DEPLOYMENT.md](docs/COOLIFY_DEPLOYMENT.md) for configuration, grants and retry semantics.

Last recorded LAN URLs are Jobs `http://substrata-jobs.mcm`, Ops `http://substrata.ops.mcm`, and Field `http://substrata.field.mcm`. These were not rechecked on 15 October. HTTP LAN supports a connected UI walkthrough; real-device PWA installation/service-worker/offline acceptance requires a secure origin.

## Implementation map and invariants

| Source | Responsibility |
| --- | --- |
| `src/components/DailySheet.jsx`, `src/domain/dailySheet.js`, `src/domain/boreDetails.js` | Combined bore entry, quantities and daily detail validation |
| `src/App.jsx`, `src/components/LogForms.jsx`, `src/components/SubmissionReview.jsx` | Field navigation, editors, review, acknowledgement, output and deliberate Send |
| `src/domain/dailyLog.js`, `src/domain/submission.js` | Aggregate constraints, completeness, signed-content identity and retention eligibility |
| `src/foundation/offlineStore.js`, `syncManager.js`, `reviewUpdates.js`, `useWorkspace.js` | Atomic local persistence/outbox, frozen intentions/signatures, retry/conflict handling and office-state reconciliation |
| `server/dailyLogs.mjs`, `submissions.mjs`, `output.mjs`, `email.mjs` | Authenticated persistence, authoritative submission, immutable revisions, private output and delivery |
| `server/coregs.mjs`, `repository.mjs`, `field.mjs`, `auth.mjs` | Point reads, Ops master-data reads, Field handoff and identity/access |
| `db/001_jobs_foundation.sql` through `005_daily_bore_details.sql` | Versioned Jobs migrations; actual applied state must be checked per environment |
| `contracts/v1`, `test`, `compose.local.yaml` | Additive v1 contracts and isolated unit/browser/Postgres fixtures |

Keep permanent log/assignment UUIDs and `job_number = PROJ_ID`. Document revision and synchronization `serverRevision` are distinct. Freeze the exact content signed/submitted; retries must not duplicate revisions or deliveries. Preserve old signatures after material edits and never silently carry them onto changed content. Unsigned submission is valid. Submitted/approved records cannot be overwritten through draft sync. Office decisions remain server-owned. Protect unsynced, failed, conflicted, returned and action-required work from retention cleanup; only eligible approved/synchronized records leave the device after the 14-day window, while server records remain.

## Verification and outstanding acceptance

Latest local results on **15 October 2026**: **40 unit/domain/IndexedDB tests**, lint, contracts including a corrected locked aggregate and PWA build passed. Ops passed its build, 10 unit tests, 17 shared-database integration results and the additional actual-app browser scenario. The disposable resources were removed and generated build/PDF changes were restored; existing documentation and implementation work remains in the working trees. These results do not establish a commit, push or deployed revision.

The earlier inspection of clean `master` at `7c50c70` passed 38 tests while Docker was unavailable. The last full standalone Jobs browser/API suite and Docker build report 16 tests passing on 14 October. Those are historical baselines, distinct from the newer shared Ops/Jobs workflow above. The next acceptance step is the user's Coolify walkthrough, not a required repeat local deployment.

Default local checks (select those appropriate to the change):

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run contracts:validate
npm.cmd run build
```

For a specific database/integration question that justifies an optional Docker rerun, explain its purpose and use [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md) or the guarded companion Ops integration workflow. Do not run containers as a routine prerequisite to development or user feedback.

Remaining acceptance gates:

- [ ] Agree the required information with a paired Jobs entry/Ops review walkthrough and resolve critical usability feedback.
- [ ] Run focused verification appropriate to each change and gather remote Coolify feedback; repeat local database/browser tests only where a concrete unresolved risk warrants them.
- [ ] Verify current Ops assignments, live CORE-GS read access and restricted shared-schema permissions.
- [ ] Verify personal Android/iOS install, offline browser restart and reconnection on HTTPS.
- [ ] Verify the compatible Ops submit → return/comment → owner correction/resubmission → approve → Jobs lock cycle in the target test environment.
- [ ] Validate the implemented item/note correction/direct lock, optional return, audit and Jobs synchronization remotely, then extend shared editor coverage to times/crew/bore/allocation and adding/removing items.
- [ ] Validate the implemented effective-locked project matrix remotely; agree commercial/measurement mapping, controlled correction/reopening and requisition freezing/reuse before extending it.
- [ ] Complete the mixed pilot and rollout decision.

Client signatures, final PDFs, mailbox/contact configuration and client delivery are optional follow-up acceptance, not gates above. Existing features remain available; their implementation does not mean production configuration is verified.
