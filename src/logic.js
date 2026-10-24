"use strict";
// Transparent keyword baseline. No black-box claims: every tag lists the exact keywords that matched.
const DEFAULT_TAXONOMY = [
  { id: "services-not-provided", label: "Services not provided", keywords: ["never provided", "did not provide", "didn't provide", "no service", "nothing happened", "never received", "not provided", "did not get", "never got", "no results"] },
  { id: "fees-and-charges", label: "Fees and charges", keywords: ["fee", "fees", "charged", "charge", "billing", "billed", "deducted", "extra cost"] },
  { id: "communication-problems", label: "Communication problems", keywords: ["no response", "never called", "cannot reach", "can't reach", "no one answers", "ignored", "no reply", "unresponsive", "never contacted", "still waiting"] },
  { id: "payments-and-account", label: "Payments and account", keywords: ["payment", "dedicated account", "draft", "deposit", "balance", "monthly payment", "payment taken"] },
  { id: "enrollment-promises", label: "Enrollment promises", keywords: ["promised", "guaranteed", "was told", "told me", "sales rep said", "enrollment", "signed up"] },
  { id: "cancellation-and-refunds", label: "Cancellation and refunds", keywords: ["cancel", "cancellation", "refund", "money back", "close my account", "withdraw from"] }
];
const PROMISE_PHRASES = ["was told", "promised", "guaranteed", "assured me", "sales rep said", "told me"];
const OUTCOME_PHRASES = ["never", "nothing happened", "still waiting", "did not happen", "no results", "not provided", "never received"];

function defaultTaxonomy() { return JSON.parse(JSON.stringify(DEFAULT_TAXONOMY)); }
function parseTaxonomyJSON(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("Taxonomy must be a JSON array");
  return parsed.map((t) => {
    if (!t.id || !Array.isArray(t.keywords)) throw new Error("Each theme needs id and keywords array");
    return { id: String(t.id), label: String(t.label || t.id), keywords: t.keywords.map((k) => String(k).toLowerCase()) };
  });
}
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}
function csvEscape(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function parseComplaints(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const firstLine = raw.split(/\r?\n/)[0].toLowerCase();
  if (firstLine.includes(",") && (firstLine.includes("text") || firstLine.includes("complaint"))) {
    const rows = parseCSV(raw);
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const di = header.indexOf("date"), ci = header.indexOf("channel"), ti = header.findIndex((h) => h === "text" || h === "complaint");
    return rows.slice(1).map((r) => ({ date: di >= 0 ? (r[di] || "").trim() : "", channel: ci >= 0 ? (r[ci] || "").trim() : "", text: ti >= 0 ? (r[ti] || "").trim() : "" })).filter((c) => c.text);
  }
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((t) => ({ date: "", channel: "", text: t }));
}
function findMatches(lower, phrases) { return phrases.filter((p) => lower.includes(p.toLowerCase())); }
function tagComplaint(complaint, taxonomy) {
  const tax = taxonomy || DEFAULT_TAXONOMY;
  const lower = String(complaint.text || "").toLowerCase();
  const themes = [], matched = {};
  for (const theme of tax) {
    const hits = findMatches(lower, theme.keywords || []);
    if (hits.length) { themes.push(theme.id); matched[theme.id] = hits; }
  }
  const promiseMatches = findMatches(lower, PROMISE_PHRASES);
  const outcomeMatches = findMatches(lower, OUTCOME_PHRASES);
  const promiseVsOutcome = promiseMatches.length > 0 && outcomeMatches.length > 0;
  if (promiseVsOutcome && !themes.includes("promise-vs-outcome")) themes.push("promise-vs-outcome");
  return { date: complaint.date || "", channel: complaint.channel || "", text: complaint.text || "", themes, matched, promiseVsOutcome, promiseMatches, outcomeMatches };
}
function tagComplaints(complaints, taxonomy) { return (complaints || []).map((c) => tagComplaint(c, taxonomy)); }

/**
 * Mark a theme not applicable for one complaint. Overrides live in page memory
 * only; they are applied to the tagged rows before download.
 * @param {Array} tagged - result of tagComplaints
 * @param {Array} overrides - [{ index, themeId }]
 */
function applyOverrides(tagged, overrides) {
  const map = {};
  (overrides || []).forEach((o) => {
    if (!o) return;
    const key = String(o.index) + "|" + String(o.themeId);
    map[key] = true;
  });
  return (tagged || []).map((row, index) => {
    const themes = row.themes.filter((id) => !map[index + "|" + id]);
    const matched = {};
    Object.keys(row.matched || {}).forEach((id) => {
      if (!map[index + "|" + id]) matched[id] = row.matched[id];
    });
    return Object.assign({}, row, { themes, matched });
  });
}
function summarize(tagged) {
  const total = (tagged || []).length; const counts = {};
  for (const t of tagged || []) for (const id of t.themes) counts[id] = (counts[id] || 0) + 1;
  return Object.keys(counts).sort().map((id) => ({ theme: id, count: counts[id], percent: total ? Math.round(counts[id] / total * 1000) / 10 : 0 }));
}
function monthOf(dateStr) { const m = String(dateStr || "").match(/^(\d{4})-(\d{2})/); return m ? m[1] + "-" + m[2] : ""; }
function trendByMonth(tagged) {
  const by = {};
  for (const t of tagged || []) {
    const mo = monthOf(t.date); if (!mo) continue;
    if (!by[mo]) by[mo] = { month: mo, total: 0, counts: {} };
    by[mo].total++;
    for (const id of t.themes) by[mo].counts[id] = (by[mo].counts[id] || 0) + 1;
  }
  return Object.keys(by).sort().map((k) => by[k]);
}
function taggedToCSV(tagged) {
  const head = ["date", "channel", "text", "themes", "promise_vs_outcome", "matched_keywords"];
  const lines = [head.join(",")];
  for (const t of tagged || []) {
    const evidence = Object.keys(t.matched || {}).map((k) => k + ": " + t.matched[k].join(" | ")).join("; ");
    lines.push([t.date, t.channel, t.text, t.themes.join(";"), t.promiseVsOutcome ? "yes" : "no", evidence].map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}
const api = { DEFAULT_TAXONOMY, PROMISE_PHRASES, OUTCOME_PHRASES, defaultTaxonomy, parseTaxonomyJSON, parseCSV, parseComplaints, tagComplaint, tagComplaints, applyOverrides, summarize, trendByMonth, monthOf, taggedToCSV };
if (typeof module !== "undefined" && module.exports) { module.exports = api; }
if (typeof window !== "undefined") { window.ComplaintThemeTagger = api; }
