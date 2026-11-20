import { DateTime } from "luxon";
import { CLINIC } from "./clinic.js";
import { freeSlots, slotKey, slotProblem, windowEnd, type Doctor, type Slot, type SlotProblem } from "./availability.js";
import { APPOINTMENT_FIELDS, loadAppointment, loadBookedKeys, loadDoctors, loadLeaves, toAppointment, type AppointmentRow } from "./data.js";
import { appointmentView, describeSlots, resolveDoctor, slotView } from "./reads.js";
import { ToolError } from "./result.js";
import { SalesforceError, sfCreate, sfQuery, sfUpsert, soqlString } from "./salesforce.js";
import { now, parseUkLocal, spoken, spokenDate, toSalesforce, ukToday } from "./time.js";
import { cleanName, normalisePhone, parseDob, patientKey } from "./validate.js";

interface Caller {
  name: string;
  phone: string;
  dob: string;
  key: string;
}

function parseCaller(name: string, phone: string, dob: string, at: DateTime): Caller {
  const cleanedName = cleanName(name ?? "");
  if (!cleanedName) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch your name. Could you say it again?", { field: "patient_name" });
  }
  const normalised = normalisePhone(phone ?? "");
  if (!normalised) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch that phone number. Could you say it again?", { field: "phone" });
  }
  const dobIso = parseDob(dob ?? "", at);
  if (!dobIso) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch your date of birth. Could you say it again?", { field: "date_of_birth", expected: "YYYY-MM-DD" });
  }
  return { name: cleanedName, phone: normalised, dob: dobIso, key: patientKey(normalised, dobIso) };
}

export function problemText(problem: SlotProblem, doctor: Doctor, start: DateTime, at: DateTime): string {
  const day = start.setZone(CLINIC.timeZone).setLocale("en-GB").toFormat("cccc");
  switch (problem) {
    case "clinic_closed":
      return "The clinic is closed at weekends.";
    case "off_grid":
      return "Appointments start on the hour or at half past.";
    case "lunch":
      return "The clinic is closed for lunch from 1 to 2 pm.";
    case "outside_hours":
      return "That's outside our opening hours of 9 am to 5 pm.";
    case "too_soon":
      return "That time has already passed or is too soon to book.";
    case "beyond_window":
      return `I can only book up to ${spokenDate(DateTime.fromISO(windowEnd(at), { zone: CLINIC.timeZone }))}.`;
    case "day_off":
      return `${doctor.name} doesn't work on ${day}s.`;
    case "on_leave":
      return `${doctor.name} is on leave on ${spokenDate(start)}.`;
  }
}

async function alternatives(doctor: Doctor, fromDate: string, at: DateTime): Promise<Slot[]> {
  const today = ukToday(at);
  const last = windowEnd(at);
  const from = fromDate < today || fromDate > last ? today : fromDate;
  const [doctors, leaves, bookedKeys] = await Promise.all([loadDoctors(), loadLeaves(today, last), loadBookedKeys(today, last)]);
  const base = { leaves, bookedKeys, partOfDay: "any" as const, now: at, fromDate: from, toDate: last };
  const same = freeSlots({ ...base, doctors: doctors.filter((d) => d.id === doctor.id) });
  return (same.length ? same : freeSlots({ ...base, doctors })).slice(0, 3);
}

export async function failWithAlternatives(code: string, reason: string, doctor: Doctor, fromDate: string, at: DateTime): Promise<never> {
  const alts = await alternatives(doctor, fromDate, at);
  const say = alts.length
    ? `${reason} ${describeSlots(alts)} instead. Would any of those work?`
    : `${reason} I'm sorry, there's nothing else free in the next ${CLINIC.windowDays} days.`;
  throw new ToolError(code, say, { alternatives: alts.map(slotView) });
}

export async function findByKey(field: "Slot_Key__c" | "Patient_Slot_Key__c", key: string): Promise<AppointmentRow | null> {
  const rows = await sfQuery(`SELECT ${APPOINTMENT_FIELDS} FROM Clinic_Appointment__c WHERE ${field} = ${soqlString(key)} LIMIT 1`);
  return rows[0] ? toAppointment(rows[0]) : null;
}

function bookedSummary(a: AppointmentRow, already: boolean): string {
  return `${already ? "You're already booked" : "You're booked"} with ${a.doctorName} on ${spoken(a.start)}. Your reference is ${a.reference}.`;
}

export interface BookingArgs {
  doctor: string;
  start: string;
  patient_name: string;
  phone: string;
  date_of_birth: string;
  reason?: string;
}

export async function confirmBooking(args: BookingArgs): Promise<Record<string, unknown>> {
  const at = now();
  const caller = parseCaller(args.patient_name, args.phone, args.date_of_birth, at);
  const start = parseUkLocal((args.start ?? "").trim());
  if (!start) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch the time. Which slot would you like?", { field: "start", expected: "YYYY-MM-DDTHH:mm (UK time)" });
  }
  const doctor = resolveDoctor(await loadDoctors(), args.doctor ?? "");
  const date = start.toFormat("yyyy-MM-dd");

  const problem = slotProblem(doctor, start, await loadLeaves(date, date), at);
  if (problem) return failWithAlternatives("SLOT_INVALID", problemText(problem, doctor, start, at), doctor, date, at);

  const patient = await sfUpsert("Clinic_Patient__c", "Patient_Key__c", caller.key, {
    Name: caller.name,
    Phone__c: caller.phone,
    Date_of_Birth__c: caller.dob,
  });
  const doctorSlotKey = slotKey(doctor.id, start);
  const patientSlotKey = slotKey(patient.id, start);

  try {
    const id = await sfCreate("Clinic_Appointment__c", {
      Doctor__c: doctor.id,
      Patient__c: patient.id,
      Start_Time__c: toSalesforce(start),
      End_Time__c: toSalesforce(start.plus({ minutes: CLINIC.slotMinutes })),
      Status__c: "Booked",
      Appointment_Type__c: CLINIC.appointmentType,
      Reason__c: args.reason?.trim().slice(0, 255) || null,
      Slot_Key__c: doctorSlotKey,
      Patient_Slot_Key__c: patientSlotKey,
    });
    const created = await loadAppointment(id);
    if (!created) throw new Error(`Appointment ${id} created but not found`);
    return { summary: bookedSummary(created, false), appointment: appointmentView(created), patient_name: caller.name, already_booked: false };
  } catch (err) {
    if (!(err instanceof SalesforceError) || err.errorCode !== "DUPLICATE_VALUE") throw err;
  }

  const holder = await findByKey("Slot_Key__c", doctorSlotKey);
  if (holder && holder.patientId === patient.id) {
    return { summary: bookedSummary(holder, true), appointment: appointmentView(holder), patient_name: caller.name, already_booked: true };
  }
  if (!holder) {
    const clash = await findByKey("Patient_Slot_Key__c", patientSlotKey);
    if (clash) {
      throw new ToolError("PATIENT_CONFLICT", `You already have an appointment at that time with ${clash.doctorName}. Would you like a different time?`, {
        appointment: appointmentView(clash),
      });
    }
  }
  return failWithAlternatives("SLOT_TAKEN", "Sorry, that time has just been taken.", doctor, date, at);
}