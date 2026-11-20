import { DateTime } from "luxon";
import { CLINIC } from "./clinic.js";

const TZ = CLINIC.timeZone;
const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function now(): DateTime {
  const override = process.env.CLOCK_OVERRIDE;
  if (override) {
    const dt = DateTime.fromISO(override, { setZone: true });
    if (dt.isValid) return dt.toUTC();
  }
  return DateTime.utc();
}

export function ukToday(at: DateTime = now()): string {
  return at.setZone(TZ).toFormat("yyyy-MM-dd");
}

export function parseUkLocal(value: string): DateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const dt = DateTime.fromISO(value, { zone: TZ });
  if (!dt.isValid || dt.toFormat(LOCAL_FORMAT) !== value) return null;
  return dt;
}

export function parseUkDate(value: string): DateTime | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = DateTime.fromISO(value, { zone: TZ });
  if (!dt.isValid || dt.toFormat("yyyy-MM-dd") !== value) return null;
  return dt.startOf("day");
}

export function toUkLocalIso(dt: DateTime): string {
  return dt.setZone(TZ).toFormat(LOCAL_FORMAT);
}

export function toSalesforce(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

export function fromSalesforce(value: string): DateTime {
  return DateTime.fromISO(value, { setZone: true }).toUTC();
}

export function slotKeyTime(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm'Z'");
}

export function weekdayShort(dt: DateTime): string {
  return dt.setZone(TZ).setLocale("en-GB").toFormat("ccc");
}

export function spokenDate(dt: DateTime): string {
  return dt.setZone(TZ).setLocale("en-GB").toFormat("cccc d LLLL");
}

export function spokenTime(dt: DateTime): string {
  const local = dt.setZone(TZ);
  if (local.hour === 12 && local.minute === 0) return "12 noon";
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12;
  const suffix = local.hour < 12 ? "am" : "pm";
  return local.minute === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(local.minute).padStart(2, "0")} ${suffix}`;
}

export function spoken(dt: DateTime): string {
  return `${spokenDate(dt)} at ${spokenTime(dt)}`;
}