import { DateTime } from "luxon";
import { CLINIC, WEEKDAYS, isSlotTime, slotTimes, type PartOfDay } from "./clinic.js";
import { parseUkDate, parseUkLocal, slotKeyTime, ukToday, weekdayShort } from "./time.js";

export interface Doctor {
  id: string;
  name: string;
  workingDays: string[];
}

export interface Leave {
  doctorId: string;
  startDate: string;
  endDate: string;
}

export interface Slot {
  doctorId: string;
  doctorName: string;
  start: DateTime;
}

export interface SlotQuery {
  doctors: Doctor[];
  leaves: Leave[];
  bookedKeys: Set<string>;
  fromDate: string;
  toDate: string;
  partOfDay: PartOfDay;
  now: DateTime;
}

export type SlotProblem =
  | "clinic_closed"
  | "off_grid"
  | "lunch"
  | "outside_hours"
  | "too_soon"
  | "beyond_window"
  | "day_off"
  | "on_leave";

export function slotKey(ownerId: string, start: DateTime): string {
  return `${ownerId}|${slotKeyTime(start)}`;
}

export function isOnLeave(doctorId: string, date: string, leaves: Leave[]): boolean {
  return leaves.some((l) => l.doctorId === doctorId && l.startDate <= date && date <= l.endDate);
}

export function windowEnd(now: DateTime): string {
  return parseUkDate(ukToday(now))!.plus({ days: CLINIC.windowDays }).toFormat("yyyy-MM-dd");
}

function earliestStart(now: DateTime): DateTime {
  return now.plus({ minutes: CLINIC.minLeadMinutes });
}

export function freeSlots(q: SlotQuery): Slot[] {
  const today = ukToday(q.now);
  const lastDate = windowEnd(q.now);
  const from = q.fromDate < today ? today : q.fromDate;
  const to = q.toDate > lastDate ? lastDate : q.toDate;
  const startDay = parseUkDate(from);
  const endDay = parseUkDate(to);
  if (!startDay || !endDay) return [];

  const earliest = earliestStart(q.now).toMillis();
  const slots: Slot[] = [];

  for (let day = startDay; day.toMillis() <= endDay.toMillis(); day = day.plus({ days: 1 })) {
    const date = day.toFormat("yyyy-MM-dd");
    const weekday = weekdayShort(day);
    for (const doctor of q.doctors) {
      if (!doctor.workingDays.includes(weekday)) continue;
      if (isOnLeave(doctor.id, date, q.leaves)) continue;
      for (const hhmm of slotTimes(q.partOfDay)) {
        const start = parseUkLocal(`${date}T${hhmm}`);
        if (!start || start.toMillis() < earliest) continue;
        if (q.bookedKeys.has(slotKey(doctor.id, start))) continue;
        slots.push({ doctorId: doctor.id, doctorName: doctor.name, start });
      }
    }
  }

  return slots.sort((a, b) => a.start.toMillis() - b.start.toMillis() || a.doctorName.localeCompare(b.doctorName));
}

export function slotProblem(doctor: Doctor, start: DateTime, leaves: Leave[], now: DateTime): SlotProblem | null {
  const local = start.setZone(CLINIC.timeZone);
  const date = local.toFormat("yyyy-MM-dd");
  const hhmm = local.toFormat("HH:mm");
  const weekday = weekdayShort(local);

  if (!(WEEKDAYS as readonly string[]).includes(weekday)) return "clinic_closed";
  if (local.minute % CLINIC.slotMinutes !== 0) return "off_grid";
  if (hhmm === "13:00" || hhmm === "13:30") return "lunch";
  if (!isSlotTime(hhmm)) return "outside_hours";
  if (start.toMillis() < earliestStart(now).toMillis()) return "too_soon";
  if (date > windowEnd(now)) return "beyond_window";
  if (!doctor.workingDays.includes(weekday)) return "day_off";
  if (isOnLeave(doctor.id, date, leaves)) return "on_leave";
  return null;
}