#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Regenerate the rocky-subtidal OBIS test fixtures.
 *
 * Produces a small, referentially-consistent slice of the Hakai "Rocky Subtidal
 * Fish and Invertebrate Community Surveys" Darwin Core dataset for use by the R
 * package's integration test. The slice is deliberately tiny (a handful of rows
 * per file) so it is reviewable in a diff and fast to validate on every CI run,
 * while still being real, well-formed Darwin Core data.
 *
 * Source: the `external/rocky-subtidal-fish-invertebrate` git submodule
 * (HakaiInstitute/rocky-subtidal-fish-invertebrate). The submodule is SSH-only,
 * so this script is run by hand when the fixtures need refreshing — the
 * generated CSVs are committed and the tests never touch the submodule.
 *
 * Usage (from the repo root, with the submodule checked out):
 *   git submodule update --init external/rocky-subtidal-fish-invertebrate
 *   deno run --allow-read --allow-write \
 *     packages/r/tests/testthat/fixtures/make-fixtures.ts
 *
 * Optionally pass the source `obis/` directory as the first argument.
 */

const DEFAULT_SRC = new URL(
  "../../../../../external/rocky-subtidal-fish-invertebrate/obis",
  import.meta.url,
).pathname;
const SRC = Deno.args[0] ?? DEFAULT_SRC;
const OUT = new URL(".", import.meta.url).pathname;

// Curated leaf events: one pelagic-fish transect and one rocky-invertebrate
// survey from the same site/date, for taxonomic variety. Their parent chain
// (site-date event + project root) is pulled in automatically so the
// parentEventID hierarchy stays intact.
const LEAVES = [
  "hakaiFI-Second_r-2017-06-22-transect1-pelagic-fish",
  "hakaiFI-Second_r-2017-06-22-transect1-RL-invert",
];
const OCC_CAP = 12; // occurrences kept per leaf event

type Row = Record<string, string>;
interface Csv {
  header: string[];
  rows: Row[];
}

/** Minimal RFC-4180 CSV parser (handles quoted fields, embedded commas/quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") endRow();
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) endRow();
  return rows;
}

function load(file: string): Csv {
  const rows = parseCsv(Deno.readTextFileSync(`${SRC}/${file}`));
  const header = rows[0];
  return {
    header,
    rows: rows.slice(1)
      .filter((r) => r.length === header.length)
      .map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]]))),
  };
}

function csvField(value: string | undefined): string {
  const s = value ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function write(file: string, header: string[], rows: Row[]): void {
  const lines = [header.map(csvField).join(",")];
  for (const r of rows) lines.push(header.map((k) => csvField(r[k])).join(","));
  Deno.writeTextFileSync(`${OUT}/${file}`, lines.join("\n") + "\n");
}

const events = load("hakaiFI_event.csv");
const occ = load("hakaiFI_occ.csv");
const emof = load("hakaiFI_eMOF.csv");

const eventById = Object.fromEntries(events.rows.map((r) => [r.eventID, r]));
const occByEvent: Record<string, Row[]> = {};
for (const r of occ.rows) (occByEvent[r.eventID] ??= []).push(r);

// Event set = curated leaves + every ancestor via parentEventID.
const keepEvents = new Set<string>();
for (const leaf of LEAVES) {
  let cur: string | undefined = leaf;
  while (cur && eventById[cur]) {
    keepEvents.add(cur);
    cur = eventById[cur].parentEventID || undefined;
  }
}

const keptEvents = events.rows.filter((r) => keepEvents.has(r.eventID));
let keptOcc: Row[] = [];
for (const leaf of LEAVES) {
  keptOcc = keptOcc.concat((occByEvent[leaf] ?? []).slice(0, OCC_CAP));
}
const keptOccIds = new Set(keptOcc.map((r) => r.occurrenceID));
// eMOF rows reference an event and optionally an occurrence; keep only those
// whose foreign keys resolve within the slice (event-level rows have no occ).
const keptEmof = emof.rows.filter(
  (r) => keepEvents.has(r.eventID) && (!r.occurrenceID || keptOccIds.has(r.occurrenceID)),
);

write("hakaiFI_event.csv", events.header, keptEvents);
write("hakaiFI_occ.csv", occ.header, keptOcc);
write("hakaiFI_eMOF.csv", emof.header, keptEmof);

console.log(
  `Wrote fixtures: ${keptEvents.length} events, ${keptOcc.length} occurrences, ` +
    `${keptEmof.length} eMOF rows -> ${OUT}`,
);
