# Clinic Booking MCP: Project Checkpoints (v1)

> Living handoff doc. Any agent or person picking up this project: read this first.
> Update "Current status" and "Log" at the end of every working session.

## Goal
A hosted MCP server that lets a voice agent **find free slots, book, reschedule and cancel** doctor appointments
at a fictional UK clinic, using Salesforce as the data store. A teammate connects it to the voice agent through a
bridge script. **All data synthetic.**

**Split of work:** Hemanth owns data, availability logic, MCP server and hosting (Milestones 0–6).
The teammate owns the bridge and voice layer (7–8). Demo readiness is shared (9).

## Decisions
| Area | Decision |
|---|---|
| Data store | Salesforce, **same org as the hospital demo** (`demo-org`) |
| Callers | Always new. `confirm_booking` creates the patient from name, phone, DOB (upsert on phone + DOB) |
| Setting | UK, one clinic, 3 doctors |
| Slots | 30 min, one type: Standard. Mon–Fri 09:00–17:00, lunch 13:00–14:00, booking window 14 days (defaults) |
| Cancellation | No cutoff; any upcoming booking |
| Confirmation | Agent reads back and gets "yes", then calls `confirm_booking`. No `hold_slot` (production only) |
| Time | Stored in UTC, computed in `Europe/London` (UK clocks change 28 Mar 2027) |

## Design rules (write safety in Salesforce)
- **No double booking:** `Appointment__c.Slot_Key__c` unique = doctor + start (UTC); cleared on cancel.
  A second unique key, patient + start, stops one patient double-booking across doctors.
- **Reschedule = one PATCH** on the same record (new time + new slot key). If the slot is taken, it fails and the original stays.
- **Idempotent writes:** the server derives a key from patient + doctor + start; a retried `confirm_booking` returns the existing appointment.
- **Availability is computed:** working hours − leave − booked appointments. Only sample bookings are seeded relative to today.
- Phone stored normalised (+44…). Reschedule and cancel require phone + DOB to match the appointment's patient.

## Sharing the org with the hospital demo
- New objects for clinic data: `Clinic_Patient__c`, `Appointment__c`, `Doctor_Schedule__c`, `Doctor_Leave__c`.
  Never write to the hospital `Patient__c`, `Visit__c` or `Case`.
- Clinic doctors in the existing `Doctor__c`, linked to a new clinic Account via `Hospital__c`. Adding a "General Practice"
  specialty means redeploying `Specialty__c` with its **full** value list.
- Deploy only new components (partial object files, `CustomField` members). Always dry-run.
- Separate External Client App and integration user with permission set `Clinic_Demo_Integration`.
  The hospital read-only user gets no access to clinic objects.
- Reset script deletes and reseeds clinic records only, scoped to the clinic Account.
- Hospital baseline counts (must stay the same): `docs/hospital-baseline.txt`
  (Account 1, Doctor 2, Condition 3, Treatment 4, Patient 3, Visit 3, Lab_Result 7, Patient_Treatment 4, Case 1).

## Tools (draft)
| Tool | Writes? | Inputs |
|---|---|---|
| `list_doctors` | No | none |
| `find_available_slots` | No | doctor (optional), date or range, morning/afternoon (optional) → up to 3 slots |
| `confirm_booking` | Yes | name, phone, DOB, doctor, start → appointment + speakable summary |
| `find_my_appointments` | No | phone, DOB, name |
| `reschedule_appointment` | Yes | appointment ID, phone, DOB, new start |
| `cancel_appointment` | Yes | appointment ID, phone, DOB |

## Milestones (capture-the-flag)
| # | Milestone | Flag (done when…) | Owner | Status |
|---|---|---|---|---|
| 0 | Basecamp | Cloud Run URL returns phase 0; push to `main` redeploys; hospital baseline saved | Hemanth | ✅ 2026-11-20 |
| 1 | Draw the Map | Clinic objects deployed; reset script seeds doctors, schedules, a leave day, sample bookings; hospital counts unchanged after two resets | Hemanth | ⬜ Next |
| 2 | Key to the Vault | Client Credentials as the clinic user; test appointment created; duplicate slot fails `DUPLICATE_VALUE`; hospital `list_objects` unchanged | Hemanth | ⬜ |
| 3 | Read the Calendar | Inspector locally: slots exclude booked, leave, past, out-of-hours | Hemanth | ⬜ |
| 4 | Claim the Slot | Parallel calls on one slot give one booking; same caller twice reuses one `Clinic_Patient__c` | Hemanth | ⬜ |
| 5 | Move and Release | Reschedule onto a taken slot leaves the original; cancelled slot reappears; wrong phone + DOB refused | Hemanth | ⬜ |
| 6 | Into the Cloud | Auth before secrets; tests 3–5 pass via Cloud Run with the key; 401 without; every write logged | Hemanth | ⬜ |
| 7 | Pass the Baton | HANDOFF.md; bridge runs find → confirm → reschedule → cancel by text without help | Teammate | ⬜ |
| 8 | Give It a Voice | Spoken booking with identity, slot offers, read-back, "yes", booked in Salesforce | Teammate | ⬜ |
| 9 | Capture the Flag | 3 clean dry runs of the demo script with resets; backup video | Both | ⬜ |

## Environment

### Code
- **Repo:** https://github.com/Hemanthm44/Clinic-Booking-MCP (branch `main`)
- **Local path:** `/Users/reactair/Documents/SF Repos/Clinic-Booking-MCP` (path has a space: quote it)
- **Stack:** TypeScript, Node 22 (Dockerfile), Express 5, MCP SDK 1.32.2, zod 4 (copied from the hospital repo; audit clean)

### Google Cloud
- **Project:** `heymello-production` (number 441317184491). **Shared company project with live services**
  (`heymello-prod-website`, `heymello-voice-core`, …). Keep the clinic service fenced off.
- **Cloud Run:** `clinic-booking-mcp`, `europe-west1`, labels `app=clinic-booking-mcp,env=demo`, min 0, max 2, public
- **URL:** https://clinic-booking-mcp-441317184491.europe-west1.run.app
- **Service account:** `clinic-booking-mcp@heymello-production.iam.gserviceaccount.com` (no roles yet).
  The default compute account has `roles/iam.serviceAccountUser` on it so Cloud Build can deploy.
- **Deploys:** Cloud Build continuous deployment on push to `main`
- **Secrets (to come):** prefixed `clinic-` (`clinic-sf-client-id`, `clinic-sf-client-secret`, `clinic-mcp-api-key`),
  granted only to the clinic service account

### Salesforce
- **Org:** `demo-org` (Developer Edition, org ID `00DjV000007iKJxUAM`, API 68.0), shared with the hospital demo
- **My Domain:** https://orgfarm-e8c2b27448-dev-ed.develop.my.salesforce.com
- **Licences:** Salesforce Integration 1/1 used (by the hospital user). Clinic user likely on a Salesforce Platform licence (to check).

## Working conventions
- Bash commands, one per block, no `#` comments. Mac = zsh; Cloud Shell = bash; gcloud only in Cloud Shell.
- Files: `touch`, paste in the editor, save, check with `wc -c`.
- Never paste secrets into chat. Always dry-run Salesforce deploys.

## Gotchas
- Project and repo folder names are similar to the hospital ones; check `pwd` before deleting anything.
- Shell variables only live in the tab where they were set.
- Everything in the hospital CHECKPOINT-5 gotchas still applies (metadata deploys, permission sets, picklist hyphens,
  import tree not re-runnable, `/health` not `/healthz`).

## Current status
- **Milestone 0 captured.**
- **Next: Milestone 1 (Draw the Map)** after the architecture step: object and field design, seed data, reset script.
- **Open:** free licence for the clinic integration user (check Salesforce Platform licences).

## Log
- **2026-11-20:** Plan and milestones agreed. Repo created and cloned to `SF Repos/`; hello-world pushed (73652f5).
  Clinic service account created; Cloud Run `clinic-booking-mcp` deployed and connected to GitHub; URL returns phase 0.
  Hospital baseline recorded. Found the Salesforce Integration licence fully used. **Milestone 0 captured.**