import { DateTime } from "luxon";
import { WEEKDAYS } from "./clinic.js";
import type { Doctor, Leave } from "./availability.js";
import { sfQuery } from "./salesforce.js";
import { parseUkDate } from "./time.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function soqlDateTime(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
}

export async function loadDoctors(): Promise<Doctor[]> {
  const rows = await sfQuery<{ Id: string; Name: string; Working_Days__c: string | null }>(
    "SELECT Id, Name, Working_Days__c FROM Clinic_Doctor__c ORDER BY Name",
  );
  const order = WEEKDAYS as readonly string[];
  return rows.map((r) => ({
    id: r.Id,
    name: r.Name,
    workingDays: (r.Working_Days__c ?? "")
      .split(";")
      .filter((d) => order.includes(d))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  }));
}

export async function loadLeaves(fromDate: string, toDate: string): Promise<Leave[]> {
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) throw new Error("loadLeaves: dates must be YYYY-MM-DD");
  const rows = await sfQuery<{ Doctor__c: string; Start_Date__c: string; End_Date__c: string }>(
    `SELECT Doctor__c, Start_Date__c, End_Date__c FROM Clinic_Leave__c WHERE Start_Date__c <= ${toDate} AND End_Date__c >= ${fromDate}`,
  );
  return rows.map((r) => ({ doctorId: r.Doctor__c, startDate: r.Start_Date__c, endDate: r.End_Date__c }));
}

export async function loadBookedKeys(fromDate: string, toDate: string): Promise<Set<string>> {
  const from = parseUkDate(fromDate);
  const to = parseUkDate(toDate);
  if (!from || !to) throw new Error("loadBookedKeys: dates must be YYYY-MM-DD");
  const rows = await sfQuery<{ Slot_Key__c: string | null }>(
    `SELECT Slot_Key__c FROM Clinic_Appointment__c WHERE Status__c = 'Booked' AND Start_Time__c >= ${soqlDateTime(from)} AND Start_Time__c < ${soqlDateTime(to.plus({ days: 1 }))}`,
  );
  return new Set(rows.map((r) => r.Slot_Key__c).filter((k): k is string => Boolean(k)));
}