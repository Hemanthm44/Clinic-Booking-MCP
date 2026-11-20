import { DateTime } from "luxon";
import { WEEKDAYS } from "./clinic.js";
import type { Doctor, Leave } from "./availability.js";
import { sfQuery, soqlString } from "./salesforce.js";
import { fromSalesforce, parseUkDate } from "./time.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function soqlDateTime(dt: DateTime): string {
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

export interface PatientRow {
  id: string;
  name: string;
}

export async function findPatientByKey(key: string): Promise<PatientRow | null> {
  const rows = await sfQuery<{ Id: string; Name: string }>(
    `SELECT Id, Name FROM Clinic_Patient__c WHERE Patient_Key__c = ${soqlString(key)} LIMIT 1`,
  );
  return rows[0] ? { id: rows[0].Id, name: rows[0].Name } : null;
}

export interface AppointmentRow {
  id: string;
  reference: string;
  doctorId: string;
  doctorName: string;
  patientId: string;
  patientKey: string;
  start: DateTime;
  status: string;
  reason: string | null;
}

const APPOINTMENT_FIELDS =
  "Id, Name, Doctor__c, Doctor__r.Name, Patient__c, Patient__r.Patient_Key__c, Start_Time__c, Status__c, Reason__c";

function toAppointment(r: any): AppointmentRow {
  return {
    id: r.Id,
    reference: r.Name,
    doctorId: r.Doctor__c,
    doctorName: r.Doctor__r?.Name ?? "",
    patientId: r.Patient__c,
    patientKey: r.Patient__r?.Patient_Key__c ?? "",
    start: fromSalesforce(r.Start_Time__c),
    status: r.Status__c,
    reason: r.Reason__c ?? null,
  };
}

export async function loadUpcomingAppointments(patientId: string, from: DateTime): Promise<AppointmentRow[]> {
  const rows = await sfQuery(
    `SELECT ${APPOINTMENT_FIELDS} FROM Clinic_Appointment__c WHERE Patient__c = ${soqlString(patientId)} AND Status__c = 'Booked' AND Start_Time__c >= ${soqlDateTime(from)} ORDER BY Start_Time__c LIMIT 10`,
  );
  return rows.map(toAppointment);
}

export async function loadAppointment(id: string): Promise<AppointmentRow | null> {
  if (!/^[a-zA-Z0-9]{15,18}$/.test(id)) return null;
  const rows = await sfQuery(`SELECT ${APPOINTMENT_FIELDS} FROM Clinic_Appointment__c WHERE Id = ${soqlString(id)} LIMIT 1`);
  return rows[0] ? toAppointment(rows[0]) : null;
}