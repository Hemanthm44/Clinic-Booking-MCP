import { DateTime } from "luxon";
import { CLINIC } from "./clinic.js";
import { now } from "./time.js";

export function normalisePhone(input: string): string | null {
  let s = input.trim().replace(/\(0\)/g, "").replace(/[\s().-]/g, "");
  if (s.startsWith("+")) s = "+" + s.slice(1).replace(/\D/g, "");
  else s = s.replace(/\D/g, "");

  let national: string;
  if (s.startsWith("+44")) national = s.slice(3);
  else if (s.startsWith("0044")) national = s.slice(4);
  else if (s.startsWith("44") && s.length === 12) national = s.slice(2);
  else if (s.startsWith("0")) national = s.slice(1);
  else return null;

  if (national.startsWith("0")) national = national.slice(1);
  if (!/^[1-9]\d{8,9}$/.test(national)) return null;
  return `+44${national}`;
}

export function parseDob(input: string, at: DateTime = now()): string | null {
  const value = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dob = DateTime.fromISO(value, { zone: CLINIC.timeZone });
  if (!dob.isValid || dob.toFormat("yyyy-MM-dd") !== value) return null;
  const today = at.setZone(CLINIC.timeZone).startOf("day");
  if (dob > today) return null;
  if (today.diff(dob, "years").years > 120) return null;
  return value;
}

export function cleanName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

export function patientKey(phone: string, dob: string): string {
  return `${phone}|${dob}`;
}