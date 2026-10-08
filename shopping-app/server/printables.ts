// server/printables.ts — print-ready HTML for gift cards and tear-off vouchers.
// Opened in a new tab from /admin; the browser prints it or saves it as PDF.
import type { DB } from "./db";
import { getSettings } from "./catalog";

const CARDS_PER_SHEET = 8; // 2 × 4 on portrait A4, each 99 × 66mm (3:2, like the artwork)
const STRIPS_PER_ROW = 10; // 2 rows per portrait A4

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

/** "2" < "10", and named groups after numbered ones */
const byGroup = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Nunito:wght@400;600;700;800&family=Playfair+Display:wght@700&family=Roboto+Mono:wght@600;700&display=block" rel="stylesheet">';

function toolbar(title: string, tips: string) {
  return `<div class="toolbar">
  <strong>${esc(title)}</strong>
  <span>${tips}</span>
  <button onclick="window.print()">Print / Save as PDF</button>
</div>`;
}

const TOOLBAR_CSS = `
.toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 16px; align-items: center;
  flex-wrap: wrap; padding: 10px 16px; background: #1976d2; color: #fff;
  font: 14px/1.4 Nunito, system-ui, sans-serif; }
.toolbar span { opacity: .9; flex: 1; min-width: 240px; }
.toolbar button { font: inherit; font-weight: 700; border: 0; border-radius: 12px; padding: 8px 16px;
  background: #fff; color: #1976d2; cursor: pointer; }
@media print { .toolbar { display: none; } }
@media screen { body { background: #8a8a8a; } }
`;

// ------------------------------------------------------------------ gift cards

export function giftCardsHtml(db: DB, opts: { backups: boolean }) {
  const s = getSettings(db);
  const cards = (
    db.prepare("SELECT number, group_name FROM cards").all() as {
      number: string;
      group_name: string;
    }[]
  ).sort((a, b) => {
    if (!a.group_name !== !b.group_name) return a.group_name ? -1 : 1;
    return byGroup(a.group_name, b.group_name) || a.number.localeCompare(b.number);
  });

  const slots: ({ number: string; group_name: string } | null)[] = [...cards];
  if (opts.backups) {
    const total = Math.max(CARDS_PER_SHEET, Math.ceil(slots.length / CARDS_PER_SHEET) * CARDS_PER_SHEET);
    while (slots.length < total) slots.push(null);
  }

  const card = (c: { number: string; group_name: string } | null) => {
    const to = c?.group_name
      ? `<span class="fill">Group ${esc(c.group_name)}</span>`
      : '<span class="fill blank">Group</span>';
    const num = c
      ? `<span class="num">${esc(spaced(c.number))}</span>`
      : '<span class="num blank"></span>';
    const from = s.giftCardFrom
      ? `<span class="fill">${esc(s.giftCardFrom)}</span>`
      : '<span class="fill blank"></span>';
    return `<div class="card">
  <div class="title"><span class="gift">Gift</span><span class="cardw">Card</span></div>
  <div class="store">${esc(s.title)}</div>
  <div class="row"><span class="lbl">TO:</span>${to}</div>
  <div class="row"><span class="lbl">FROM:</span>${from}</div>
  <div class="numrow"><span class="nlbl">Card Number</span>${num}</div>
  ${s.giftCardValidUntil ? `<div class="valid">Valid until ${esc(s.giftCardValidUntil)}</div>` : ""}
</div>`;
  };

  const sheets: string[] = [];
  for (let i = 0; i < slots.length; i += CARDS_PER_SHEET) {
    sheets.push(`<section class="sheet">${slots.slice(i, i + CARDS_PER_SHEET).map(card).join("")}</section>`);
  }

  const backups = slots.length - cards.length;
  const summary = `${cards.length} card${cards.length === 1 ? "" : "s"}${
    backups ? ` + ${backups} blank backup${backups === 1 ? "" : "s"}` : ""
  } on ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}.`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Gift Cards</title>${FONTS}
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact;
       font-family: Nunito, "Helvetica Neue", Arial, sans-serif; color: #4a3438; }
/* Cards keep the artwork's 3:2 shape; the block is centred, leaving ≥6mm for the printer's margin */
.sheet { width: 210mm; height: 297mm; display: grid; place-content: center; background: #fff;
         grid-template-columns: repeat(2, 99mm); grid-template-rows: repeat(4, 66mm);
         break-after: page; overflow: hidden; }
.sheet:last-child { break-after: auto; }
.card { position: relative; outline: 0.2mm dashed #bdbdbd; outline-offset: -0.1mm;
        background: url(/print/giftcard-bg.jpg) center / 100% 100% no-repeat;
        padding: 5mm 5.8mm 4.4mm 46%; display: flex; flex-direction: column;
        justify-content: center; overflow: hidden; }
.title { line-height: 0.9; text-align: center; margin-bottom: 1.1mm; white-space: nowrap; }
.gift { font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 23.5pt; color: #e0636c; }
.cardw { font-family: "Great Vibes", cursive; font-size: 26pt; color: #2d8c8c; margin-left: 1.7mm; }
.store { font-size: 5.8pt; font-weight: 700; letter-spacing: 0.15pt; text-align: center; color: #fff;
         background: #e8737a; border-radius: 1.1mm; padding: 0.7mm 1.1mm; margin: 0 0 2.2mm;
         white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row { display: flex; align-items: baseline; gap: 1.7mm; margin-bottom: 1.5mm; }
.lbl { font-size: 6.7pt; letter-spacing: 0.4pt; color: #b0757a; width: 9.7mm; text-align: right; flex: none; }
.fill { flex: 1; font-size: 10.5pt; font-weight: 700; text-align: center; min-height: 5mm;
        border-bottom: 0.3mm solid #d9a3a7; padding-bottom: 0.3mm; white-space: nowrap; }
.fill.blank { color: #cfaeb1; font-weight: 600; text-align: left; padding-left: 1.4mm; }
.numrow { display: flex; flex-direction: column; align-items: center; margin-top: 1.7mm; }
.nlbl { font-size: 6.7pt; letter-spacing: 0.4pt; color: #b0757a; text-transform: uppercase; }
.num { font-family: "Roboto Mono", Menlo, monospace; font-size: 12pt; font-weight: 700;
       letter-spacing: 0.3pt; white-space: nowrap; margin-top: 0.4mm; }
.num.blank { align-self: stretch; border-bottom: 0.3mm solid #d9a3a7; height: 5.8mm; }
.valid { font-size: 5.4pt; letter-spacing: 0.35pt; text-transform: uppercase; color: #b0757a;
         text-align: center; margin-top: 1.4mm; }
@media screen { .sheet { margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.25); } }
${TOOLBAR_CSS}
</style></head><body>
${toolbar("Gift cards", `${summary} Print on A4 portrait at 100% scale (not “Fit to page”), with background graphics on.`)}
${sheets.join("\n") || '<p style="padding:24px;color:#fff">No gift cards yet.</p>'}
</body></html>`;
}

// ------------------------------------------------------------------ vouchers

const VOUCHER_THEMES = [
  ["#2d8c8c", "#e3f3f2"], // teal
  ["#e0636c", "#fde9ea"], // coral
  ["#9a6a12", "#fbf1d9"], // gold
  ["#6a4c9c", "#efe9f8"], // purple
  ["#3d7a3a", "#e8f3e6"], // green
];

export function vouchersHtml(db: DB, opts: { unusedOnly: boolean; amounts: string[] | null }) {
  const s = getSettings(db);
  const rows = db
    .prepare(
      `SELECT code, kind, amount FROM vouchers ${opts.unusedOnly ? "WHERE used_at IS NULL" : ""}
       ORDER BY kind DESC, amount, created_at, code`
    )
    .all() as { code: string; kind: "percent" | "absolute"; amount: number }[];

  const groups = new Map<string, { label: string; codes: string[] }>();
  for (const v of rows) {
    const key = `${v.kind}:${v.amount}`;
    if (opts.amounts && !opts.amounts.includes(key)) continue;
    const label = v.kind === "percent" ? `${v.amount}%` : `S$${v.amount}`;
    if (!groups.has(key)) groups.set(key, { label, codes: [] });
    groups.get(key)!.codes.push(v.code);
  }

  const vrows: string[] = [];
  [...groups.values()].forEach((g, gi) => {
    const [ink, tint] = VOUCHER_THEMES[gi % VOUCHER_THEMES.length];
    for (let i = 0; i < g.codes.length; i += STRIPS_PER_ROW) {
      const chunk = g.codes.slice(i, i + STRIPS_PER_ROW);
      const strips =
        chunk
          .map(
            (c) =>
              `<div class="strip"><div class="rot"><span class="samt">${esc(g.label)} OFF</span><span class="code">${esc(c)}</span></div></div>`
          )
          .join("") + '<div class="strip empty"></div>'.repeat(STRIPS_PER_ROW - chunk.length);
      vrows.push(`<div class="vrow" style="--ink:${ink};--tint:${tint}">
  <div class="head">
    <div class="big">${esc(g.label)} <small>OFF</small></div>
    <div class="htxt">
      <div class="kind">Discount Voucher</div>
      <div class="hstore">${esc(s.title)}</div>
      <div class="how">Tear off one code and enter it at checkout. Each code works once.</div>
    </div>
  </div>
  <div class="tear"></div>
  <div class="strips">${strips}</div>
</div>`);
    }
  });

  const pages: string[] = [];
  for (let i = 0; i < vrows.length; i += 2) {
    pages.push(`<section class="page">${vrows.slice(i, i + 2).join("")}</section>`);
  }

  const total = [...groups.values()].reduce((a, g) => a + g.codes.length, 0);
  const summary = `${total} code${total === 1 ? "" : "s"} on ${pages.length} page${pages.length === 1 ? "" : "s"}.`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Voucher Strips</title>${FONTS}
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact;
       font-family: Nunito, "Helvetica Neue", Arial, sans-serif; color: #3a2e30; }
.page { width: 210mm; height: 297mm; padding: 7mm 8mm; display: grid; background: #fff;
        grid-template-rows: 1fr 1fr; gap: 7mm; break-after: page; }
.page:last-child { break-after: auto; }
.vrow { display: flex; flex-direction: column; min-height: 0; }
.head { flex: none; height: 34mm; background: var(--tint); border: 0.5mm solid var(--ink);
        border-radius: 3mm 3mm 0 0; display: flex; align-items: center; gap: 6mm; padding: 0 7mm; }
.big { font-family: "Playfair Display", Georgia, serif; font-weight: 700; font-size: 40pt;
       color: var(--ink); line-height: 1; white-space: nowrap; }
.big small { font-size: 20pt; }
.kind { font-size: 15pt; font-weight: 800; color: var(--ink); }
.hstore { font-size: 9pt; font-weight: 600; letter-spacing: 0.3pt; margin-top: 0.6mm; }
.how { font-size: 8.5pt; color: #6d5d60; margin-top: 1.6mm; }
.tear { flex: none; border-top: 0.35mm dashed #8a7d7f; }
.strips { flex: 1; display: grid; grid-template-columns: repeat(${STRIPS_PER_ROW}, 1fr); min-height: 0; }
.strip { position: relative; border-right: 0.3mm dashed #8a7d7f; overflow: hidden; }
.strip:first-child { border-left: 0.3mm dashed #8a7d7f; }
.strip.empty { border-right-color: transparent; }
.strip:not(.empty) { border-bottom: 0.3mm dashed #8a7d7f; }
.rot { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-90deg);
       display: flex; align-items: baseline; gap: 3mm; white-space: nowrap; }
.samt { font-size: 9pt; font-weight: 800; color: var(--ink); }
.code { font-family: "Roboto Mono", Menlo, monospace; font-size: 13pt; font-weight: 700; letter-spacing: 0.6pt; }
@media screen { .page { margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.25); } }
${TOOLBAR_CSS}
</style></head><body>
${toolbar("Voucher strips", `${summary} Print on A4 portrait at 100% scale, with background graphics on.`)}
${pages.join("\n") || '<p style="padding:24px;color:#fff">No voucher codes match.</p>'}
</body></html>`;
}
