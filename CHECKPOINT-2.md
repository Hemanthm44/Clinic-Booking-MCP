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
- Tools: `get_clinic_info`, `find_available_slots`, `confirm_booking`, `find_my_appointments`,
  `reschedule_appointment`, `cancel_appointment`.

## Milestones
| # | Milestone | Flag (done when…) | Owner | Status |
|---|---|---|---|---|
| 0 | Basecamp | Cloud Run URL returns phase 0; push to `main` redeploys; hospital baseline saved | Hemanth | ✅ 2026-11-20 |
| 1 | Draw the Map | Clinic objects deployed; reset seeds the demo story; hospital counts unchanged after two resets | Hemanth | 🔄 Now |
| 2 | Key to the Vault | Token as the clinic user; test booking created; duplicate slot fails `DUPLICATE_VALUE`; hospital `list_objects` unchanged | Hemanth | ⬜ |
| 3 | Read the Calendar | Inspector locally: slots exclude booked, leave, past, out-of-hours; unit tests pass | Hemanth | ⬜ |
| 4 | Claim the Slot | Parallel bookings of one slot give one booking; repeat booking returns `already_booked` | Hemanth | ⬜ |
| 5 | Move and Release | Reschedule onto a taken slot keeps the original; cancelled slot reappears; wrong phone + DOB refused | Hemanth | ⬜ |
| 6 | Into the Cloud | Auth before secrets; 3–5 pass through Cloud Run with the key; 401 without; every call logged | Hemanth | ⬜ |
| 7 | Pass the Baton | Bridge runs find → confirm → reschedule → cancel by text, no help | Teammate | ⬜ |
| 8 | Give It a Voice | Spoken booking: slot offers, read-back, "yes", booked in Salesforce | Teammate | ⬜ |
| 9 | Capture the Flag | 3 clean dry runs with resets; backup video | Both | ⬜ |

## Subtasks

### Milestone 1: Draw the Map
- [x] 1.1 ARCHITECTURE.md committed
- [x] 1.2 Admin user time zone set to Europe/London
- [x] 1.3 Metadata: `Clinic_Doctor__c` and `Clinic_Leave__c`
- [x] 1.4 Metadata: `Clinic_Patient__c` and `Clinic_Appointment__c` (unique keys)
- [ ] 1.5 Metadata: tabs, `Clinic_Demo_Admin` and `Clinic_Demo_Integration` permission sets, `package.xml`
- [ ] 1.6 Dry-run, deploy, assign `Clinic_Demo_Admin` to the admin; hospital counts unchanged
- [ ] 1.7 `reset.apex`: wipe `Clinic_*` and seed the demo story relative to today
- [ ] 1.8 Run reset twice; seeded counts correct; hospital counts unchanged; unique-key duplicate test as admin
- [ ] 1.9 Flag captured; checkpoint updated

### Milestone 2: Key to the Vault
- [ ] 2.1 Platform-licence user `mcp-clinic@orgfarm-e8c2b27448.demo` with `Clinic_Demo_Integration`
- [ ] 2.2 External Client App "MCP Clinic Booking": OAuth, `api` scope, Client Credentials, Run As the clinic user
- [ ] 2.3 Token via curl (secret read with `read -s`)
- [ ] 2.4 curl: create a booking (201), same slot again (`DUPLICATE_VALUE`), cancel by PATCH (keys blanked)
- [ ] 2.5 Hospital MCP `list_objects` unchanged
- [ ] 2.6 Local `.env` (gitignored, chmod 600) with the clinic credentials

### Milestone 3: Read the Calendar
- [ ] 3.1 Dependencies (`luxon`); Salesforce client ported from the hospital repo with GET/POST/PATCH, 8 s timeout, one retry
- [ ] 3.2 `clinic.ts`, `time.ts`, `validate.ts` + unit tests (phone formats, DOB, UK ↔ UTC, clock change)
- [ ] 3.3 `availability.ts` + unit tests (leave, lunch, weekends, past, booked, forward search) using `CLOCK_OVERRIDE`
- [ ] 3.4 MCP skeleton on stateless `/mcp`; `get_clinic_info`
- [ ] 3.5 `find_available_slots`
- [ ] 3.6 `find_my_appointments`
- [ ] 3.7 Inspector flag tests

### Milestone 4: Claim the Slot
- [ ] 4.1 `confirm_booking` happy path (patient upsert, appointment create)
- [ ] 4.2 Duplicate handling: `already_booked`, `SLOT_TAKEN` + alternatives, `PATIENT_CONFLICT`
- [ ] 4.3 Parallel booking test (two calls at once)
- [ ] 4.4 Flag captured

### Milestone 5: Move and Release
- [ ] 5.1 `reschedule_appointment` (one PATCH, `Previous_Start_Time__c`)
- [ ] 5.2 `cancel_appointment` (keys blanked, `already_cancelled`)
- [ ] 5.3 Ownership, past and repeat tests; flag captured

### Milestone 6: Into the Cloud
- [ ] 6.1 Bearer auth on `/mcp` deployed first (`GET /` shows phase 6)
- [ ] 6.2 Secrets `clinic-sf-client-id`, `clinic-sf-client-secret`, `clinic-mcp-api-key`, granted only to the clinic service account
- [ ] 6.3 Cloud Run: secrets + `SF_INSTANCE_URL`, timeout 300 s (min instances 1 only for demo days)
- [ ] 6.4 One log line per tool call; `GET /ready` (with key)
- [ ] 6.5 Milestone 3–5 tests through Cloud Run; 401 without the key

### Milestone 7: Pass the Baton
- [ ] 7.1 HANDOFF.md: endpoint, auth, tool contracts, errors, agent prompt guidance, demo script
- [ ] 7.2 Teammate gets access to `clinic-mcp-api-key`
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
  Service account `clinic-booking-mcp@heymello-production.iam.gserviceaccount.com`. CD on push to `main`.
- **Salesforce:** `demo-org` (00DjV000007iKJxUAM, API 68.0), My Domain https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com.
  Licences: Salesforce Integration 1/1 used (hospital); **Salesforce Platform 0/6 used** (clinic user goes here; needs API Enabled).
- **Hospital baseline:** `docs/hospital-baseline.txt` (Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3,
  Lab_Result 7, Patient_Treatment 4, Case 1).

## Working conventions
- Bash commands, one per block, no `#` comments. Mac = zsh; Cloud Shell = bash; gcloud only in Cloud Shell.
- Files: `touch`, paste in the editor, save, check with `wc -c`. Always dry-run Salesforce deploys.
- Never paste secrets into chat.

## Gotchas
- Folder and project names look like the hospital ones: check `pwd` before deleting.
- Shell variables only live in the tab where they were set.
- Hospital CHECKPOINT-5 gotchas still apply (metadata deploys, permission sets, plain hyphens, `/health`).

## Current status
- Milestone 0 captured. Architecture agreed. **Next: 1.1.**

## Log
- **2026-11-20:** Plan agreed; repo, Cloud Run service and clinic service account created; CD connected; phase 0 live;
  hospital baseline recorded; licences checked. **Milestone 0 captured.** Architecture designed (4 `Clinic_*` objects,
  computed availability, unique-key write safety, Apex reset); subtasks written.