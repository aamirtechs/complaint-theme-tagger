"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../src/logic.js");

test("tags fees and charges with evidence", () => {
  const r = L.tagComplaint({ text: "I was charged a fee I never agreed to and billed twice" });
  assert.ok(r.themes.includes("fees-and-charges"));
  assert.ok(r.matched["fees-and-charges"].includes("fee"));
});
test("multi-label tagging across themes", () => {
  const r = L.tagComplaint({ text: "No response for weeks, no one answers, and my payment draft was taken" });
  assert.ok(r.themes.includes("communication-problems"));
  assert.ok(r.themes.includes("payments-and-account"));
});
test("promise vs outcome sub-tag fires only with both sides", () => {
  const both = L.tagComplaint({ text: "I was told and promised results, but nothing happened and I am still waiting" });
  assert.equal(both.promiseVsOutcome, true);
  assert.ok(both.themes.includes("promise-vs-outcome"));
  const onlyPromise = L.tagComplaint({ text: "I was promised a call tomorrow" });
  assert.equal(onlyPromise.promiseVsOutcome, false);
});
test("parses plain lines and CSV input", () => {
  assert.equal(L.parseComplaints("first complaint\nsecond complaint").length, 2);
  const csv = 'date,channel,text\n2026-01-05,chat,"Charged a fee, twice"\n2026-02-01,review,No response at all';
  const rows = L.parseComplaints(csv);
  assert.equal(rows.length, 2); assert.equal(rows[0].channel, "chat"); assert.match(rows[0].text, /twice/);
});
test("summary counts and percent", () => {
  const tagged = L.tagComplaints([{ text: "charged a fee" }, { text: "charged a fee again" }, { text: "please cancel and refund me" }]);
  const s = L.summarize(tagged);
  const fees = s.find((x) => x.theme === "fees-and-charges");
  assert.equal(fees.count, 2); assert.equal(fees.percent, 66.7);
});
test("trend by month groups dated complaints", () => {
  const tagged = L.tagComplaints([{ date: "2026-01-10", text: "charged a fee" }, { date: "2026-01-20", text: "cancel please" }, { date: "2026-02-02", text: "charged a fee" }]);
  const trend = L.trendByMonth(tagged);
  assert.equal(trend.length, 2); assert.equal(trend[0].month, "2026-01"); assert.equal(trend[0].counts["fees-and-charges"], 1);
});
test("tagged CSV includes matched keywords as evidence", () => {
  const csv = L.taggedToCSV(L.tagComplaints([{ date: "2026-01-01", channel: "chat", text: "charged a fee" }]));
  assert.match(csv, /matched_keywords/); assert.match(csv, /fees-and-charges: fee/);
});
test("custom taxonomy from JSON is honoured", () => {
  const tax = L.parseTaxonomyJSON('[{"id":"billing-x","label":"Billing X","keywords":["zebra charge"]}]');
  const r = L.tagComplaint({ text: "a zebra charge appeared" }, tax);
  assert.deepEqual(r.themes, ["billing-x"]);
});

test("applyOverrides removes a theme before download", () => {
  const tagged = L.tagComplaints([{ text: "I was charged a fee and billed twice" }]);
  assert.ok(tagged[0].themes.indexOf("fees-and-charges") !== -1);
  const out = L.applyOverrides(tagged, [{ index: 0, themeId: "fees-and-charges" }]);
  assert.equal(out[0].themes.indexOf("fees-and-charges"), -1);
  assert.equal(out[0].matched["fees-and-charges"], undefined);
});
