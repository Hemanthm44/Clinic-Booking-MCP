# Clinic Booking MCP: Architecture (v1)

> Design reference for the clinic booking demo. Progress lives in the latest CHECKPOINT file.

## 1. Overview

```
Caller ──voice──▶ Voice agent ──▶ Bridge script ──HTTPS + Bearer──▶ MCP server (Cloud Run: clinic-booking-mcp)
                  (teammate)       (teammate)                              │ REST API v68.0, Client Credentials
                                                                           ▼
                                                            Salesforce demo-org (Clinic_* objects only)
```

Three rules:
1. **Salesforce enforces correctness.** Unique fields make double-booking impossible, even with racing calls or retries.
2. **Availability is computed, never stored.** Free slots = working days × clinic hours − leave − booked appointments.
3. **The clinic is a closed box inside the org.** All objects are new and prefixed `Clinic_`. Zero hospital metadata changes;
   the reset script can't touch hospital data.

## 2. Data model

### Clinic_Doctor__c (Name = "Dr Sarah Patel")
| Field | Type | Notes |
|---|---|---|
| `Working_Days__c` | Multi-select picklist: Mon, Tue, Wed, Thu, Fri | Hours are clinic-wide, in code |

### Clinic_Leave__c (auto-number L-{0000})
| Field | Type | Notes |
|---|---|---|
| `Doctor__c` | Lookup → Clinic_Doctor__c, required | |
| `Start_Date__c`, `End_Date__c` | Date, required | Whole days |
| `Reason__c` | Text(80) | |

### Clinic_Patient__c (Name = full name)
| Field | Type | Notes |
|---|---|---|
| `Phone__c` | Text(16) | Normalised: `+447700900123` |
| `Date_of_Birth__c` | Date | |
| `Patient_Key__c` | Text(40), unique, external ID | `+447700900123\|1988-04-12`; upsert key |

### Clinic_Appointment__c (auto-number A-{0000}, from A-1001)
| Field | Type | Notes |
|---|---|---|
| `Patient__c` | Lookup → Clinic_Patient__c, required | |
| `Doctor__c` | Lookup → Clinic_Doctor__c, required | |
| `Start_Time__c`, `End_Time__c` | Date/time (UTC) | End = start + 30 min |
| `Status__c` | Picklist: Booked, Cancelled | |
| `Appointment_Type__c` | Picklist: Standard (default) | |
| `Reason__c` | Text(255) | Optional |
| `Previous_Start_Time__c` | Date/time | Set on reschedule |
| `Slot_Key__c` | Text(60), unique | `doctorId\|2026-11-24T09:30Z`; blanked on cancel |
| `Patient_Slot_Key__c` | Text(60), unique | `patientId\|2026-11-24T09:30Z`; blanked on cancel |

Unique text fields allow any number of blanks, so cancelling frees the slot while keeping the record.

**Sharing:** all four objects Public Read/Write.
**Permission sets:**
- `Clinic_Demo_Admin`: full access to all clinic objects, fields and tabs (admin user; needed for the Apex reset).
- `Clinic_Demo_Integration`: Read on Doctor and Leave; Read, Create, Edit on Patient and Appointment; no Delete; API Enabled.

## 3. Clinic rules (`src/clinic.ts`)
| Setting | Value |
|---|---|
| Clinic | Kingsway Medical Centre, Bristol (fictional) |
| Time zone | Europe/London |
| Hours | 09:00–17:00, lunch 13:00–14:00 → 14 slots per doctor per day |
| Morning / afternoon | 09:00–12:30 / 14:00–16:30 slot starts |
| Slot | 30 min, starting on :00 or :30 |
| Window | From now + 30 min to 14 days ahead |

Times cross the API as UK local time without an offset (`2026-11-24T09:30`) and become UTC only at the Salesforce
boundary. Clinic hours never touch the 01:00–02:00 clock-change hour, so local times are never ambiguous. Library: Luxon.

## 4. Availability (`src/availability.ts`)
Pure function, no Salesforce calls:
```
freeSlots(doctors, leaves, bookedKeys, fromDate, toDate, partOfDay, now) → slots[]
```
1. For each UK date in range and each doctor who works that weekday and isn't on leave:
2. Generate the 14 slots; keep those in the requested part of day and at least 30 min after `now`.
3. Drop any whose `doctorId|startUTC` is in `bookedKeys`.
4. Sort by start, then doctor name.

The tool wrapper runs 3 SOQL queries (doctors, leave in range, Booked appointments in range). If the range has no slots,
it searches forward to the end of the window and returns the next 3.

## 5. Tools
Every result is one JSON text block with a speakable `summary` and structured data. Times are given as `start`
(UK local ISO) and `spoken` ("Tuesday 24 November at 9:30 am"). Doctors are accepted by name or ID everywhere.

| Tool | Inputs | Returns |
|---|---|---|
| `get_clinic_info` | none | Clinic, hours, today's UK date and weekday, doctors with working days and upcoming leave |
| `find_available_slots` | `doctor?`, `date_from?`, `date_to?`, `part_of_day?` (morning, afternoon, any), `limit?` (3, max 5) | `slots[]`, `more_available`, `searched` |
| `confirm_booking` | `doctor`, `start`, `patient_name`, `phone`, `date_of_birth`, `reason?` | Appointment; `already_booked` on repeats |
| `find_my_appointments` | `phone`, `date_of_birth` | Name on file and upcoming Booked appointments |
| `reschedule_appointment` | `appointment_id`, `phone`, `date_of_birth`, `new_start`, `new_doctor?` | Updated appointment with previous time |
| `cancel_appointment` | `appointment_id`, `phone`, `date_of_birth` | Cancelled appointment; `already_cancelled` on repeats |

Example `find_available_slots` result:
```json
{
  "summary": "I have Tuesday 24 November at 11:30 am, 12 noon or 12:30 pm with Dr Sarah Patel.",
  "slots": [
    {"doctor_id": "a0B…", "doctor_name": "Dr Sarah Patel", "start": "2026-11-24T11:30", "spoken": "Tuesday 24 November at 11:30 am"}
  ],
  "more_available": 9,
  "searched": {"from": "2026-11-24 (Tuesday)", "to": "2026-11-24 (Tuesday)", "part_of_day": "morning"}
}
```

### Errors
`isError: true` with `{ "code", "say", "alternatives"? }`; `say` is speakable as is.

| Code | When |
|---|---|
| `INVALID_INPUT` | Bad phone, DOB, date or time format |
| `DOCTOR_NOT_FOUND` / `DOCTOR_AMBIGUOUS` | No match / more than one match (lists doctors) |
| `SLOT_INVALID` | Off-grid, outside hours, lunch, day off, leave, past, beyond window (with alternatives) |
| `SLOT_TAKEN` | Lost the race for the slot (3 alternatives) |
| `PATIENT_CONFLICT` | Caller already has an appointment at that time |
| `NOT_FOUND` | No appointment for that ID and phone + DOB (also covers "wrong person") |
| `APPOINTMENT_PAST` | Rescheduling or cancelling something already started |
| `SALESFORCE_UNAVAILABLE` | Timeout or 5xx after one retry |

## 6. Write flows

**confirm_booking**
1. Validate, normalise phone, resolve doctor.
2. Validate the slot against clinic rules and leave.
3. Upsert patient on `Patient_Key__c`.
4. Create appointment with both keys, Status = Booked.
5. On `DUPLICATE_VALUE`, look up by `Slot_Key__c`: same patient → success with `already_booked`; someone else →
   `SLOT_TAKEN`; clash on `Patient_Slot_Key__c` → `PATIENT_CONFLICT`.

**reschedule_appointment**
1. Load with patient; key mismatch or not Booked → `NOT_FOUND`; started → `APPOINTMENT_PAST`.
2. Already at the new doctor and time → success, no change.
3. Validate new slot; one PATCH: doctor, start, end, both keys, `Previous_Start_Time__c`.
4. `DUPLICATE_VALUE` → `SLOT_TAKEN`; the original is untouched.

**cancel_appointment**
1. Same ownership check; already Cancelled → success with `already_cancelled`.
2. One PATCH: Status = Cancelled, both keys blanked.

Every write is guarded by a unique key or is a no-op when repeated, so the Salesforce client retries once on network
errors and 5xx. A failure after the patient upsert leaves a patient without an appointment, which is harmless.

## 7. Validation (`src/validate.ts`)
- **Phone:** keep digits and a leading +; `0044…`/`44…` → `+44…`; `0…` → `+44…`; valid if `+44` + 9–10 digits.
  Seed data uses Ofcom drama numbers (07700 900000–900999).
- **DOB:** `YYYY-MM-DD`, in the past, age 0–120.
- **Name:** trimmed, 2–80 characters; repeat calls update the stored name.

## 8. Code layout
```
src/
├── index.ts          Express: GET /, /health; POST /mcp (Bearer auth from Milestone 6)
├── mcp.ts            Tool registration (zod), JSON + summary formatting
├── salesforce.ts     Token cache, GET/POST/PATCH, 8 s timeout, one retry
├── clinic.ts         Clinic constants
├── availability.ts   Pure slot generation
├── booking.ts        confirm / reschedule / cancel
├── validate.ts       Phone, DOB, name, local-time parsing
└── time.ts           Luxon helpers: UK ↔ UTC, spoken dates
test/                 availability.test.ts, validate.test.ts (node:test)
salesforce/
├── metadata/         objects, tabs, permission sets, package.xml
└── scripts/reset.apex
```
`CLOCK_OVERRIDE` (env, local only) fixes "now" for tests.

## 9. Reset and seed
```bash
sf apex run --file salesforce/scripts/reset.apex --target-org demo-org
```
Runs as the admin in one transaction. Deletes all `Clinic_*` records, then seeds relative to today (UK time, weekdays only):

| Doctor | Works | Seeded story |
|---|---|---|
| Dr Sarah Patel | Mon–Fri | Next working day morning booked except 11:30, 12:00, 12:30 |
| Dr James Wilson | Mon, Tue, Thu, Fri | On leave on the 3rd working day from today |
| Dr Emily Chen | Mon, Wed, Thu, Fri | Lightly booked |

Plus 4 patients and about 12 bookings. **Priya Shah** (07700 900123, born 1988-04-12) has an upcoming booking with
Dr Wilson for reschedule and cancel tests. Admin time zone is set to Europe/London so Salesforce shows UK times.