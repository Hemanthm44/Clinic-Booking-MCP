import { CLINIC } from "./clinic.js";
import { windowEnd } from "./availability.js";
import { loadDoctors, loadLeaves } from "./data.js";
import { now, parseUkDate, spokenDate, ukToday } from "./time.js";

const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

export function daysText(days: string[]): string {
  if (days.length === 5) return "Monday to Friday";
  const names = days.map((d) => `${DAY_NAMES[d]}s`);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function leaveText(startDate: string, endDate: string): string {
  const start = spokenDate(parseUkDate(startDate)!);
  return startDate === endDate ? start : `${start} to ${spokenDate(parseUkDate(endDate)!)}`;
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