export const CLINIC = {
  name: "Kingsway Medical Centre",
  city: "Bristol",
  timeZone: "Europe/London",
  hoursText: "Monday to Friday, 9 am to 5 pm, closed for lunch from 1 to 2 pm",
  slotMinutes: 30,
  minLeadMinutes: 30,
  windowDays: 14,
  appointmentType: "Standard",
  morningSlots: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"],
  afternoonSlots: ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30"],
} as const;

export type PartOfDay = "morning" | "afternoon" | "any";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export function slotTimes(part: PartOfDay = "any"): string[] {
  if (part === "morning") return [...CLINIC.morningSlots];
  if (part === "afternoon") return [...CLINIC.afternoonSlots];
  return [...CLINIC.morningSlots, ...CLINIC.afternoonSlots];
}

export function isSlotTime(hhmm: string): boolean {
  return slotTimes("any").includes(hhmm);
}