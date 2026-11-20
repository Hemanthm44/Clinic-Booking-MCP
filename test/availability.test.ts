import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { freeSlots, slotKey, slotProblem, type Doctor, type Leave, type Slot, type SlotQuery } from "../src/availability.js";
import { parseUkLocal, toUkLocalIso } from "../src/time.js";

const NOW = DateTime.fromISO("2026-11-20T11:55:00Z", { setZone: true });
const patel: Doctor = { id: "P", name: "Dr Sarah Patel", workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri"] };
const wilson: Doctor = { id: "W", name: "Dr James Wilson", workingDays: ["Mon", "Tue", "Thu", "Fri"] };
const chen: Doctor = { id: "C", name: "Dr Emily Chen", workingDays: ["Mon", "Wed", "Thu", "Fri"] };
const leaves: Leave[] = [{ doctorId: "W", startDate: "2026-11-26", endDate: "2026-11-26" }];

function query(over: Partial<SlotQuery>): SlotQuery {
  return { doctors: [patel, wilson, chen], leaves, bookedKeys: new Set(), fromDate: "2026-11-20", toDate: "2026-11-20", partOfDay: "any", now: NOW, ...over };
}
const local = (s: Slot) => toUkLocalIso(s.start);
const doctorsOn = (slots: Slot[]) => [...new Set(slots.map((s) => s.doctorName))].sort();

test("weekend has no slots", () => {
  assert.equal(freeSlots(query({ fromDate: "2026-11-21", toDate: "2026-11-22" })).length, 0);
});

test("today: nothing earlier than now + 30 minutes", () => {
  const slots = freeSlots(query({}));
  assert.equal(slots.length, 21);
  assert.equal(local(slots[0]), "2026-11-20T12:30");
});

test("part of day filters to morning or afternoon", () => {
  assert.equal(freeSlots(query({ partOfDay: "morning" })).length, 3);
  assert.equal(freeSlots(query({ partOfDay: "afternoon" })).length, 18);
});

test("lunch is never offered", () => {
  const slots = freeSlots(query({ fromDate: "2026-11-23", toDate: "2026-11-23" }));
  assert.ok(slots.every((s) => !local(s).endsWith("T13:00") && !local(s).endsWith("T13:30")));
});

test("day off and leave remove the doctor", () => {
  assert.deepEqual(doctorsOn(freeSlots(query({ fromDate: "2026-11-25", toDate: "2026-11-25" }))), ["Dr Emily Chen", "Dr Sarah Patel"]);
  assert.deepEqual(doctorsOn(freeSlots(query({ fromDate: "2026-11-26", toDate: "2026-11-26" }))), ["Dr Emily Chen", "Dr Sarah Patel"]);
});

test("booked slots are removed", () => {
  const booked = new Set([slotKey("P", parseUkLocal("2026-11-23T09:00")!)]);
  const slots = freeSlots(query({ doctors: [patel], bookedKeys: booked, fromDate: "2026-11-23", toDate: "2026-11-23", partOfDay: "morning" }));
  assert.equal(slots.length, 7);
  assert.equal(local(slots[0]), "2026-11-23T09:30");
});

test("doctor filter: Dr Chen has nothing on Tuesdays", () => {
  assert.equal(freeSlots(query({ doctors: [chen], fromDate: "2026-11-24", toDate: "2026-11-24" })).length, 0);
});

test("window stops 14 days from today", () => {
  const slots = freeSlots(query({ toDate: "2026-12-31" }));
  assert.equal(local(slots[slots.length - 1]).slice(0, 10), "2026-12-04");
});

test("same-time slots sort by doctor name", () => {
  const slots = freeSlots(query({ fromDate: "2026-11-23", toDate: "2026-11-23" }));
  assert.deepEqual(slots.slice(0, 3).map((s) => s.doctorName), ["Dr Emily Chen", "Dr James Wilson", "Dr Sarah Patel"]);
});

test("summer time: slot keys use UTC, so 09:00 UK is 08:00Z", () => {
  const summerNow = DateTime.fromISO("2027-04-05T08:00:00Z", { setZone: true });
  const key = slotKey("P", parseUkLocal("2027-04-06T09:00")!);
  assert.equal(key, "P|2027-04-06T08:00Z");
  const slots = freeSlots(query({ doctors: [patel], leaves: [], bookedKeys: new Set([key]), fromDate: "2027-04-06", toDate: "2027-04-06", now: summerNow }));
  assert.equal(local(slots[0]), "2027-04-06T09:30");
});

test("slotProblem explains why a time can't be booked", () => {
  const p = (doctor: Doctor, value: string) => slotProblem(doctor, parseUkLocal(value)!, leaves, NOW);
  assert.equal(p(patel, "2026-11-21T10:00"), "clinic_closed");
  assert.equal(p(patel, "2026-11-23T09:15"), "off_grid");
  assert.equal(p(patel, "2026-11-23T13:00"), "lunch");
  assert.equal(p(patel, "2026-11-23T17:00"), "outside_hours");
  assert.equal(p(patel, "2026-11-20T10:00"), "too_soon");
  assert.equal(p(patel, "2026-12-07T10:00"), "beyond_window");
  assert.equal(p(wilson, "2026-11-25T10:00"), "day_off");
  assert.equal(p(wilson, "2026-11-26T10:00"), "on_leave");
});

test("slotProblem returns null for a bookable slot", () => {
  assert.equal(slotProblem(patel, parseUkLocal("2026-11-23T09:00")!, leaves, NOW), null);
});