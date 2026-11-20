import { CLINIC, WEEKDAYS, type PartOfDay } from "./clinic.js";
import { freeSlots, isOnLeave, windowEnd, type Doctor, type Leave, type Slot } from "./availability.js";
import { findPatientByKey, loadBookedKeys, loadDoctors, loadLeaves, loadUpcomingAppointments, type AppointmentRow } from "./data.js";
import { normalisePhone, parseDob, patientKey } from "./validate.js";
import { ToolError } from "./result.js";
import { now, parseUkDate, spoken, spokenDate, spokenTime, toUkLocalIso, ukToday, weekdayShort } from "./time.js";

const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

function joinWith(items: string[], word: "and" | "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
}

export function daysText(days: string[]): string {
  if (days.length === 5) return "Monday to Friday";
  return joinWith(days.map((d) => `${DAY_NAMES[d]}s`), "and");
}

function dateSpoken(date: string): string {
  return spokenDate(parseUkDate(date)!);
}

function dateLabel(date: string): string {
  return `${date} (${parseUkDate(date)!.setLocale("en-GB").toFormat("cccc")})`;
}

function nextDay(date: string): string {
  return parseUkDate(date)!.plus({ days: 1 }).toFormat("yyyy-MM-dd");
}

function leaveText(startDate: string, endDate: string): string {
  return startDate === endDate ? dateSpoken(startDate) : `${dateSpoken(startDate)} to ${dateSpoken(endDate)}`;
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t !== "dr" && t !== "doctor");
}

export function resolveDoctor(doctors: Doctor[], input: string): Doctor {
  const value = input.trim();
  const byId = doctors.find((d) => d.id === value);
  if (byId) return byId;
  const names = doctors.map((d) => d.name);
  const tokens = nameTokens(value);
  const matches = tokens.length ? doctors.filter((d) => tokens.every((t) => nameTokens(d.name).includes(t))) : [];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const options = matches.map((m) => m.name);
    throw new ToolError("DOCTOR_AMBIGUOUS", `Do you mean ${joinWith(options, "or")}?`, { doctors: options });
  }
  throw new ToolError("DOCTOR_NOT_FOUND", `I couldn't find a doctor called ${value}. Our doctors are ${joinWith(names, "and")}.`, { doctors: names });
}

export function slotView(s: Slot) {
  return { doctor_id: s.doctorId, doctor_name: s.doctorName, start: toUkLocalIso(s.start), spoken: spoken(s.start) };
}

export function describeSlots(slots: Slot[]): string {
  const first = slots[0];
  const sameDoctor = slots.every((s) => s.doctorId === first.doctorId);
  const sameDay = slots.every((s) => spokenDate(s.start) === spokenDate(first.start));
  if (sameDoctor && sameDay) return `${first.doctorName} is free on ${spokenDate(first.start)} at ${joinWith(slots.map((s) => spokenTime(s.start)), "or")}`;
  if (sameDoctor) return `${first.doctorName} is free on ${joinWith(slots.map((s) => spoken(s.start)), "or")}`;
  if (sameDay) return `On ${spokenDate(first.start)} I have ${joinWith(slots.map((s) => `${spokenTime(s.start)} with ${s.doctorName}`), "or")}`;
  return `I have ${joinWith(slots.map((s) => `${spoken(s.start)} with ${s.doctorName}`), "or")}`;
}

function whyNothing(from: string, to: string, lastDate: string, part: PartOfDay, leaves: Leave[], doctor?: Doctor): string {
  if (from > lastDate) return `I can only book up to ${dateSpoken(lastDate)}.`;
  const range = from === to ? `on ${dateSpoken(from)}` : `between ${dateSpoken(from)} and ${dateSpoken(to)}`;
  if (from === to) {
    const weekday = weekdayShort(parseUkDate(from)!);
    if (!(WEEKDAYS as readonly string[]).includes(weekday)) return "The clinic is closed at weekends.";
    if (doctor && !doctor.workingDays.includes(weekday)) return `${doctor.name} doesn't work on ${DAY_NAMES[weekday]}s.`;
    if (doctor && isOnLeave(doctor.id, from, leaves)) return `${doctor.name} is on leave ${range}.`;
  }
  const partText = part === "any" ? "" : ` in the ${part}`;
  return `There's nothing free${doctor ? ` with ${doctor.name}` : ""} ${range}${partText}.`;
}

export async function getClinicInfo(): Promise<Record<string, unknown>> {
  const at = now();
  const today = ukToday(at);
  const todayDt = parseUkDate(today)!;
  const [doctors, leaves] = await Promise.all([loadDoctors(), loadLeaves(today, windowEnd(at))]);

  const doctorInfo = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    working_days: d.workingDays,
    works: daysText(d.workingDays),
    upcoming_leave: leaves.filter((l) => l.doctorId === d.id).map((l) => leaveText(l.startDate, l.endDate)),
  }));

  const doctorLines = doctorInfo.map(
    (d) => `${d.name} works ${d.works}${d.upcoming_leave.length ? ` and is on leave ${d.upcoming_leave.join(" and ")}` : ""}`,
  );

  return {
    summary: `This is ${CLINIC.name}, ${CLINIC.city}. Today is ${spokenDate(todayDt)}. We're open ${CLINIC.hoursText}. ${doctorLines.join(". ")}.`,
    clinic: {
      name: CLINIC.name,
      city: CLINIC.city,
      hours: CLINIC.hoursText,
      appointment_type: CLINIC.appointmentType,
      slot_minutes: CLINIC.slotMinutes,
      booking_window_days: CLINIC.windowDays,
    },
    today: {
      date: today,
      weekday: todayDt.setLocale("en-GB").toFormat("cccc"),
      time_uk: at.setZone(CLINIC.timeZone).toFormat("HH:mm"),
    },
    doctors: doctorInfo,
  };
}

export interface SlotArgs {
  doctor?: string;
  date_from?: string;
  date_to?: string;
  part_of_day?: PartOfDay;
  limit?: number;
}

export async function findAvailableSlots(args: SlotArgs): Promise<Record<string, unknown>> {
  const at = now();
  const today = ukToday(at);
  const lastDate = windowEnd(at);
  const part: PartOfDay = args.part_of_day ?? "any";
  const limit = Math.min(Math.max(args.limit ?? 3, 1), 5);

  const fromInput = args.date_from?.trim();
  const from = fromInput || today;
  const to = args.date_to?.trim() || (fromInput ? from : lastDate);
  if (!parseUkDate(from) || !parseUkDate(to)) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch the date. Which day would you like?", { expected: "date_from and date_to as YYYY-MM-DD" });
  }
  if (to < from) throw new ToolError("INVALID_INPUT", "The end date is before the start date. Which days would you like?");

  const [allDoctors, leaves, bookedKeys] = await Promise.all([loadDoctors(), loadLeaves(today, lastDate), loadBookedKeys(today, lastDate)]);
  const doctor = args.doctor?.trim() ? resolveDoctor(allDoctors, args.doctor) : undefined;
  const base = { doctors: doctor ? [doctor] : allDoctors, leaves, bookedKeys, now: at };
  const searched = { from: dateLabel(from), to: dateLabel(to), part_of_day: part, doctor: doctor?.name ?? "any" };

  const found = from > lastDate ? [] : freeSlots({ ...base, partOfDay: part, fromDate: from, toDate: to });
  if (found.length) {
    const shown = found.slice(0, limit);
    return { summary: `${describeSlots(shown)}. Which would you like?`, slots: shown.map(slotView), more_available: found.length - shown.length, searched };
  }

  const reason = whyNothing(from, to, lastDate, part, leaves, doctor);
  const forwardFrom = from > lastDate ? today : nextDay(to);
  let next: Slot[] = [];
  if (forwardFrom <= lastDate) {
    next = freeSlots({ ...base, partOfDay: part, fromDate: forwardFrom, toDate: lastDate });
    if (!next.length && part !== "any") next = freeSlots({ ...base, partOfDay: "any", fromDate: forwardFrom, toDate: lastDate });
  }
  if (!next.length) {
    return {
      summary: `${reason} I'm sorry, there's nothing else available${doctor ? ` with ${doctor.name}` : ""} in the next ${CLINIC.windowDays} days.`,
      slots: [],
      more_available: 0,
      searched,
    };
  }
  const shown = next.slice(0, limit);
  return {
    summary: `${reason} ${describeSlots(shown)} instead. Would any of those work?`,
    slots: shown.map(slotView),
    more_available: next.length - shown.length,
    searched,
    alternatives: true,
  };
}

export function identityKey(phone: string, dateOfBirth: string): string {
  const normalised = normalisePhone(phone ?? "");
  if (!normalised) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch that phone number. Could you say it again?", { field: "phone" });
  }
  const dob = parseDob(dateOfBirth ?? "", now());
  if (!dob) {
    throw new ToolError("INVALID_INPUT", "Sorry, I didn't catch your date of birth. Could you say it again?", { field: "date_of_birth", expected: "YYYY-MM-DD" });
  }
  return patientKey(normalised, dob);
}

export function appointmentView(a: AppointmentRow) {
  return {
    appointment_id: a.id,
    reference: a.reference,
    doctor_id: a.doctorId,
    doctor_name: a.doctorName,
    start: toUkLocalIso(a.start),
    spoken: spoken(a.start),
    reason: a.reason,
  };
}

export async function findMyAppointments(args: { phone: string; date_of_birth: string }): Promise<Record<string, unknown>> {
  const key = identityKey(args.phone, args.date_of_birth);
  const patient = await findPatientByKey(key);
  if (!patient) {
    throw new ToolError("NOT_FOUND", "I couldn't find any appointments under that phone number and date of birth. Could you check the details?");
  }
  const appointments = await loadUpcomingAppointments(patient.id, now());
  if (!appointments.length) {
    return { summary: `I have ${patient.name} on file, but there are no upcoming appointments.`, patient_name: patient.name, appointments: [] };
  }
  const count = appointments.length === 1 ? "one upcoming appointment" : `${appointments.length} upcoming appointments`;
  const list = joinWith(appointments.map((a) => `${spoken(a.start)} with ${a.doctorName}`), "and");
  return {
    summary: `I have ${patient.name} on file, with ${count}: ${list}.`,
    patient_name: patient.name,
    appointments: appointments.map(appointmentView),
  };
}