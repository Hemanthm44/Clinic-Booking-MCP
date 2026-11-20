# Clinic Booking MCP: Project Checkpoints (v2)

> Living handoff doc. Read this first. Supersedes CHECKPOINT-1.
> Full design: **ARCHITECTURE.md**. Tick subtasks as they finish; update "Current status" and "Log" every session.

## Goal
A hosted MCP server that lets a voice agent **find free slots, book, reschedule and cancel** appointments at a fictional
UK clinic, with Salesforce as the data store. A teammate connects it to the voice agent through a bridge script.
**All data synthetic.** Hemanth: Milestones 0–6. Teammate: 7–8. Both: 9.

## Key decisions
- Salesforce `demo-org`, shared with the hospital demo. **Clinic is a closed box:** 4 new `Clinic_*` objects,
  zero changes to hospital metadata, reset script touches only `Clinic_*` records.
- Objects: `Clinic_Doctor__c` (Working_Days__c), `Clinic_Leave__c` (whole days), `Clinic_Patient__c`
  (unique external ID `Patient_Key__c` = phone|DOB), `Clinic_Appointment__c` (A-{0000}; unique `Slot_Key__c` and
  `Patient_Slot_Key__c`, blanked on cancel). All Public Read/Write.
- Kingsway Medical Centre, Bristol. Europe/London. 09:00–17:00, lunch 13:00–14:00, 30-min slots, window now + 30 min to 14 days.
- Callers always new: `confirm_booking` upserts the patient from name, phone, DOB. Phone + DOB is the identity.
- Confirmation by agent read-back, then `confirm_booking`. No `hold_slot` (production only). No cancellation cutoff.
- Retries are safe: every write is guarded by a unique key or is a no-op when repeated.
- Reset and seed: one transactional Apex script, dates relative to today.
- **MCP key shared with the hospital MCP** (`mcp-api-key`).
- Tools: `get_clinic_info`, `find_available_slots`, `confirm_booking`, `find_my_appointments`,
  `reschedule_appointment`, `cancel_appointment`.

## Milestones
| # | Milestone | Flag (done when…) | Owner | Status |
|---|---|---|---|---|
| 0 | Basecamp | Cloud Run URL returns phase 0; push to `main` redeploys; hospital baseline saved | Hemanth | ✅ 2026-11-20 |
| 1 | Draw the Map | Clinic objects deployed; reset seeds the demo story; hospital counts unchanged after two resets | Hemanth | ✅ 2026-11-20 |
| 2 | Key to the Vault | Token as the clinic user; test booking created; duplicate slot fails `DUPLICATE_VALUE`; hospital `list_objects` unchanged | Hemanth | ✅ 2026-11-20 |
| 3 | Read the Calendar | Inspector locally: slots exclude booked, leave, past, out-of-hours; unit tests pass | Hemanth | ✅ 2026-11-20 |
| 4 | Claim the Slot | Parallel bookings of one slot give one booking; repeat booking returns `already_booked` | Hemanth | ✅ 2026-11-20 |
| 5 | Move and Release | Reschedule onto a taken slot keeps the original; cancelled slot reappears; wrong phone + DOB refused | Hemanth | 🔄 Next |
| 6 | Into the Cloud | Auth before secrets; 3–5 pass through Cloud Run with the key; 401 without; every call logged | Hemanth | ⬜ |
| 7 | Pass the Baton | Bridge runs find → confirm → reschedule → cancel by text, no help | Teammate | ⬜ |
| 8 | Give It a Voice | Spoken booking: slot offers, read-back, "yes", booked in Salesforce | Teammate | ⬜ |
| 9 | Capture the Flag | 3 clean dry runs with resets; backup video | Both | ⬜ |

## Subtasks

### Milestone 1: Draw the Map ✅
- [x] 1.1 ARCHITECTURE.md committed
- [x] 1.2 Admin user time zone set to Europe/London
- [x] 1.3 Metadata: `Clinic_Doctor__c` and `Clinic_Leave__c`
- [x] 1.4 Metadata: `Clinic_Patient__c` and `Clinic_Appointment__c` (unique keys)
- [x] 1.5 Metadata: tabs, `Clinic_Demo_Admin` and `Clinic_Demo_Integration` permission sets, `package.xml`
- [x] 1.6 Dry-run, deploy, assign `Clinic_Demo_Admin` to the admin; hospital counts unchanged
- [x] 1.7 `reset.apex`: wipe `Clinic_*` and seed the demo story relative to today
- [x] 1.8 Run reset twice; seeded counts correct; hospital counts unchanged; unique-key duplicate test as admin
- [x] 1.9 Flag captured; checkpoint updated

### Milestone 2: Key to the Vault ✅
- [x] 2.1 Integration user `mcp-clinic@orgfarm-e8c2b27448.demo` (Salesforce licence, Minimum Access - Salesforce profile) with `Clinic_Demo_Integration`
- [x] 2.2 External Client App "MCP Clinic Booking": OAuth, `api` scope, Client Credentials, Run As the clinic user
- [x] 2.3 Token via curl (secret read with `read -s`)
- [x] 2.4 curl: create a booking (201), same slot again (`DUPLICATE_VALUE`), cancel by PATCH (keys blanked)
- [x] 2.5 Hospital MCP `list_objects` unchanged
- [x] 2.6 Local `.env` (gitignored, chmod 600) with the clinic credentials

### Milestone 3: Read the Calendar
- [x] 3.1 Dependencies (`luxon`); Salesforce client ported from the hospital repo with GET/POST/PATCH, 8 s timeout, one retry
- [x] 3.2 `clinic.ts`, `time.ts`, `validate.ts` + unit tests (phone formats, DOB, UK ↔ UTC, clock change)
- [x] 3.3 `availability.ts` + unit tests (leave, lunch, weekends, past, booked, forward search) using `CLOCK_OVERRIDE`
- [x] 3.4 MCP skeleton on stateless `/mcp`; `get_clinic_info`
- [x] 3.5 `find_available_slots`
- [x] 3.6 `find_my_appointments`
- [x] 3.7 Inspector flag tests

### Milestone 4: Claim the Slot
- [x] 4.1 `confirm_booking` happy path (patient upsert, appointment create)
- [x] 4.2 Duplicate handling: `already_booked`, `SLOT_TAKEN` + alternatives, `PATIENT_CONFLICT`
- [x] 4.3 Parallel booking test (two calls at once)
- [x] 4.4 Flag captured

### Milestone 5: Move and Release
- [ ] 5.1 `reschedule_appointment` (one PATCH, `Previous_Start_Time__c`)
- [ ] 5.2 `cancel_appointment` (keys blanked, `already_cancelled`)
- [ ] 5.3 Ownership, past and repeat tests; flag captured

### Milestone 6: Into the Cloud
- [x] 6.1 Bearer auth on `/mcp` deployed first (`GET /` shows phase 6)
- [x] 6.2 Secrets `clinic-sf-client-id`, `clinic-sf-client-secret` granted only to the clinic service account; **shared** `mcp-api-key` (clinic service account access granted early, 2026-11-20)
- [x] 6.3 Cloud Run: secrets + `SF_INSTANCE_URL`, timeout 300 s (min instances 1 only for demo days)
- [ ] 6.4 One log line per tool call; `GET /ready` (with key)
- [ ] 6.5 Milestone 3–5 tests through Cloud Run; 401 without the key

### Milestone 7: Pass the Baton
- [ ] 7.1 HANDOFF.md: endpoint, auth, tool contracts, errors, agent prompt guidance, demo script
- [ ] 7.2 Teammate confirms they have the shared MCP key (same key as the hospital MCP)
- [ ] 7.3 Bridge text test passes (teammate)

### Milestone 8: Give It a Voice (teammate)
- [ ] 8.1 Agent prompt: `get_clinic_info` at call start, read-back + "yes" before every write, speak `summary` lines
- [ ] 8.2 Spoken tests of all demo scenarios

### Milestone 9: Capture the Flag
- [ ] 9.1 Final demo script
- [ ] 9.2 Reset between runs; 3 clean dry runs on the demo machine and network
- [ ] 9.3 Backup video
- [ ] 9.4 After the demo: min instances back to 0

## Environment
- **Repo:** https://github.com/Hemanthm44/Clinic-Booking-MCP · local `/Users/reactair/Documents/SF Repos/Clinic-Booking-MCP` (quote the path)
- **Stack:** TypeScript, Node 22 (Dockerfile), Express 5, MCP SDK 1.32.2, zod 4, Luxon (from 3.1)
- **GCP:** `heymello-production` (441317184491), **shared company project with live services**.
  Cloud Run `clinic-booking-mcp`, europe-west1, labels `app=clinic-booking-mcp,env=demo`, min 0, max 2, public.
  URL https://clinic-booking-mcp-441317184491.europe-west1.run.app.
  Service account `clinic-booking-mcp@heymello-production.iam.gserviceaccount.com` (has secretAccessor on `mcp-api-key` only).
  CD on push to `main`.
- **Salesforce:** `demo-org` (00DjV000007iKJxUAM, API 68.0), My Domain https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com.
  Admin time zone Europe/London; admin has `Clinic_Demo_Admin`.
  Clinic integration user `mcp-clinic@orgfarm-e8c2b27448.demo` (Salesforce licence, Minimum Access - Salesforce profile,
  Europe/London) with `Clinic_Demo_Integration`. External Client App **MCP Clinic Booking** (Client Credentials,
  Run As the clinic user). Local `.env` holds its credentials (gitignored, chmod 600).
- **MCP key:** shared with the hospital MCP (`mcp-api-key`). One leaked key opens both services; rotating it means
  redeploying both Cloud Run services. Use separate keys in production.
- **Hospital baseline:** `docs/hospital-baseline.txt` (Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3,
  Lab_Result 7, Patient_Treatment 4, Case 1).

## Commands
```bash
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --dry-run --wait 10
sf project deploy start --metadata-dir salesforce/metadata --target-org demo-org --wait 10
sf apex run --file salesforce/scripts/reset.apex --target-org demo-org | grep -E "Executed|CLINIC RESET|EXCEPTION|Error"
sf apex run --file salesforce/scripts/double-booking-test.apex --target-org demo-org | grep -E "Executed|TEST|EXCEPTION|Error"
for o in Clinic_Doctor__c Clinic_Leave__c Clinic_Patient__c Clinic_Appointment__c; do echo "== $o"; sf data query --query "SELECT COUNT() FROM $o" --target-org demo-org 2>/dev/null; done
for o in Account Doctor__c Condition__c Treatment__c Patient__c Visit__c Lab_Result__c Patient_Treatment__c Case; do echo "== $o"; sf data query --query "SELECT COUNT() FROM $o" --target-org demo-org 2>/dev/null; done | diff docs/hospital-baseline.txt - && echo "HOSPITAL UNCHANGED"
```
Seeded counts after reset: Doctor 3, Leave 1, Patient 6, Appointment 12 (all Booked).
Scripts: `reset.apex` (wipe + seed), `double-booking-test.apex` (guard test, rolls back),
`create-integration-user.apex` (run once; safe to re-run).

## Working conventions
- Bash commands, one per block, no `#` comments. Mac = zsh; Cloud Shell = bash; gcloud only in Cloud Shell.
- Files: `touch`, paste in the editor, save, check with `wc -c`. Always dry-run Salesforce deploys.
- Never paste secrets into chat.

## Gotchas
- Folder and project names look like the hospital ones: check `pwd` before deleting.
- Shell variables only live in the tab where they were set, and a skipped line leaves them empty
  (an empty `$DOC` gave `REQUIRED_FIELD_MISSING`). Use `&& echo $VAR` when setting them.
- Hospital CHECKPOINT-5 gotchas still apply (metadata deploys, permission sets, plain hyphens, `/health`).
- **Slot key format is a contract:** `<18-char Salesforce ID>|yyyy-MM-ddTHH:mmZ` (UTC, no seconds), e.g.
  `a0BjV00000ABCDeUAP|2026-11-23T09:00Z`. reset.apex and the MCP server must build it identically, or the
  double-booking guard silently stops working.
- Anonymous Apex runs with the running user's object and field permissions: the admin needs `Clinic_Demo_Admin`.
- Required fields can't be listed in permission sets (they're always accessible with object access).
- Debug logs show `|` as `&#124;` (cosmetic). Read script results with `| grep`.
- Seeded dates move with "today": re-run the reset on demo day, and before each dry run.
- `DUPLICATE_VALUE` returns `fields: []` and names the clashing keys only in the message text (both keys when the same
  patient repeats a booking). The server queries `Slot_Key__c` / `Patient_Slot_Key__c` instead of parsing the message.
- Upsert by `Patient_Key__c` returns the record `id` on both 201 (created) and 200 (updated, `created: false`).
  URL-encode the key: `+` → `%2B`, `|` → `%7C`.
- Appointment auto-numbers keep counting across resets and tests (A-0064 and up). Harmless.
- The clinic integration user can't delete (by design); test records are cleaned by the reset script.
- Isolation holds both ways: the clinic user sees hospital objects as `INVALID_TYPE`; the hospital MCP's
  `list_objects` shows no `Clinic_*`.

## Current status
- **Milestones 0, 1 and 2 captured.** Clinic metadata deployed; reset re-runnable; double-booking guard proven in Apex
  and over REST; clinic user can read doctors, upsert patients, book and cancel; no access to hospital data.
- Seed as of reset on Fri 20 Nov 2026: Dr Patel nearly full Mon 23 Nov (free 11:30, 12:00, 12:30);
  Priya Shah booked Tue 24 Nov 10:30 with Dr Wilson; Dr Wilson on leave Thu 26 Nov.
- **Next: 3.1**, server dependencies and the Salesforce client.

## Log
- **2026-11-20 (afternoon):** Plan agreed; repo, Cloud Run service and clinic service account created; CD connected;
  phase 0 live; hospital baseline recorded; licences checked. **Milestone 0 captured.** Architecture designed
  (4 `Clinic_*` objects, computed availability, unique-key write safety, Apex reset); subtasks written.
- **2026-11-20 (evening):** Architecture committed. Admin time zone set to Europe/London. 4 `Clinic_*` objects,
  4 tabs, permission sets `Clinic_Demo_Admin` (assigned) and `Clinic_Demo_Integration` deployed (32 components,
  all Created). `reset.apex` seeds 3 doctors, 1 leave day, 6 patients, 12 bookings relative to today; ran twice
  with identical counts. `double-booking-test.apex`: duplicate blocked with DUPLICATE_VALUE, slot freed after cancel,
  rolled back. Hospital counts unchanged. **Milestone 1 captured.**
- **2026-11-20 (night):** Clinic integration user created by Apex script (Salesforce licence, Minimum Access - Salesforce
  profile) with `Clinic_Demo_Integration`. External Client App "MCP Clinic Booking" with Client Credentials; token 200 as
  `mcp-clinic`. As the clinic user via REST: doctors readable; `Patient__c` → INVALID_TYPE; patient upsert 201 then 200;
  booking 201; duplicate → DUPLICATE_VALUE; cancel 204 with keys blanked. Hospital MCP `list_objects` unchanged.
  Decided to share `mcp-api-key` with the hospital MCP; clinic service account granted access. Local `.env` created.
  **Milestone 2 captured.**- **2026-11-20 (late):** Milestone 3 built: Salesforce client (8 s timeout, one retry, shared token refresh), clinic rules, UK time helpers, validation, availability engine with slotProblem (24 unit tests). MCP server with get_clinic_info, find_available_slots (reasons + forward search), find_my_appointments (phone + DOB identity). Extra files: src/result.ts, src/data.ts, src/reads.ts, scripts/mcp-call.sh, scripts/smoke.ts. Inspector lists 3 tools and runs them. Gotcha: a paste can silently truncate a file; check with `tail -n 3` after pasting. **Milestone 3 captured.**
- **2026-11-20 (late):** confirm_booking: validation, slotProblem with spoken reasons + alternatives, patient upsert, create with both slot keys; on DUPLICATE_VALUE looks up the key holders (already_booked / SLOT_TAKEN / PATIENT_CONFLICT). Tested: book, repeat (same reference), other caller, second doctor same time, lunch, leave. scripts/race-test.sh: 5, 5 and 8 parallel callers on one slot each gave exactly one booking. Rejected inserts consume auto-numbers (references skip). mcp-call.sh now prints NO RESPONSE when the server is down. **Milestone 4 captured.**
- **2026-11-20 (night):** 6.1-6.3: bearer auth on /mcp (constant-time compare; 503 if no key) deployed first, phase 6 confirmed. Cloud Run given shared mcp-api-key, timeout 300 s. Secrets clinic-sf-client-id and clinic-sf-client-secret created, readable only by the clinic service account, mounted with SF_INSTANCE_URL (revision 00028). get_clinic_info returns live data through Cloud Run with the key; 401 without. Local .env has its own MCP_API_KEY (export MCP_KEY from it for mcp-call.sh). Gotcha: a Cloud Run update that references a missing secret fails and the old revision keeps serving.
