import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { slotTimes, isSlotTime } from "../src/clinic.js";
import {
  parseUkLocal, parseUkDate, toSalesforce, fromSalesforce, toUkLocalIso,
  slotKeyTime, spoken, weekdayShort, ukToday,
} from "../src/time.js";

test("clinic has 14 slots, 8 morning and 6 afternoon, none at lunch", () => {
  assert.equal(slotTimes("any").length, 14);
  assert.equal(slotTimes("morning").length, 8);
  assert.equal(slotTimes("afternoon").length, 6);
  assert.equal(isSlotTime("13:00"), false);
  assert.equal(isSlotTime("09:15"), false);
  assert.equal(isSlotTime("16:30"), true);
});

test("winter: UK local equals UTC", () => {
  const dt = parseUkLocal("2026-11-24T09:30")!;
  assert.equal(slotKeyTime(dt), "2026-11-24T09:30Z");
  assert.equal(toSalesforce(dt), "2026-11-24T09:30:00.000Z");
});

test("summer: UK local is UTC + 1", () => {
  const dt = parseUkLocal("2027-04-06T09:30")!;
  assert.equal(slotKeyTime(dt), "2027-04-06T08:30Z");
});

test("clock-change day (28 March 2027): clinic hours are unambiguous", () => {
  assert.equal(slotKeyTime(parseUkLocal("2027-03-28T09:30")!), "2027-03-28T08:30Z");
  assert.equal(parseUkLocal("2027-03-28T01:30"), null);
});

test("bad local times and dates are rejected", () => {
  assert.equal(parseUkLocal("2026-11-24 09:30"), null);
  assert.equal(parseUkLocal("2026-02-30T09:30"), null);
  assert.equal(parseUkLocal("2026-11-24T25:00"), null);
  assert.equal(parseUkDate("2026-11-31"), null);
  assert.ok(parseUkDate("2026-11-24"));
});

test("Salesforce times convert back to UK local", () => {
  assert.equal(toUkLocalIso(fromSalesforce("2026-11-23T09:00:00.000+0000")), "2026-11-23T09:00");
  assert.equal(toUkLocalIso(fromSalesforce("2027-04-06T08:30:00.000+0000")), "2027-04-06T09:30");
});

test("spoken times read naturally", () => {
  assert.equal(spoken(parseUkLocal("2026-11-24T09:30")!), "Tuesday 24 November at 9:30 am");
  assert.equal(spoken(parseUkLocal("2026-11-24T12:00")!), "Tuesday 24 November at 12 noon");
  assert.equal(spoken(parseUkLocal("2026-11-24T14:00")!), "Tuesday 24 November at 2 pm");
  assert.equal(weekdayShort(parseUkLocal("2026-11-24T09:30")!), "Tue");
});

test("UK today follows UK time, not UTC", () => {
  assert.equal(ukToday(DateTime.fromISO("2026-11-20T23:30:00Z", { setZone: true })), "2026-11-20");
  assert.equal(ukToday(DateTime.fromISO("2027-06-01T23:30:00Z", { setZone: true })), "2027-06-02");
});