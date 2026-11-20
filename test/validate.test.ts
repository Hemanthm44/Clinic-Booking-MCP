import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { normalisePhone, parseDob, cleanName, patientKey } from "../src/validate.js";

const AT = DateTime.fromISO("2026-11-20T12:00:00Z", { setZone: true });

test("UK phone formats all normalise to +44", () => {
  for (const input of ["07700 900123", "+44 7700 900123", "0044 7700 900123", "447700900123", "+44 (0) 7700 900123", "07700-900-123"]) {
    assert.equal(normalisePhone(input), "+447700900123", input);
  }
  assert.equal(normalisePhone("0117 496 0000"), "+441174960000");
});

test("non-UK or broken phones are rejected", () => {
  for (const input of ["", "12345", "+1 555 123 4567", "07700 9001234567", "phone"]) {
    assert.equal(normalisePhone(input), null, input);
  }
});

test("date of birth: ISO only, real date, past, age up to 120", () => {
  assert.equal(parseDob("1988-04-12", AT), "1988-04-12");
  assert.equal(parseDob("1988-02-30", AT), null);
  assert.equal(parseDob("12/04/1988", AT), null);
  assert.equal(parseDob("2030-01-01", AT), null);
  assert.equal(parseDob("1890-01-01", AT), null);
});

test("names are tidied and length-checked", () => {
  assert.equal(cleanName("  priya   shah "), "priya shah");
  assert.equal(cleanName("A"), null);
});

test("patient key matches the reset script format", () => {
  assert.equal(patientKey("+447700900123", "1988-04-12"), "+447700900123|1988-04-12");
});