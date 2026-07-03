/**
 * Intrinsic Darwin Core cross-dataset relations.
 *
 * The standard Darwin Core star schema encodes foreign keys between classes
 * (e.g. Occurrence.eventID -> Event.eventID). These are part of the schema, so
 * the engine infers and enforces them automatically — users never declare them.
 *
 * @module specs/dwc-relations
 */

/**
 * Darwin Core class -> its primary identifier field. Mirrors the
 * `type: "identifier"` markers in `generated/dwcSchema.json`.
 */
export const DWC_PRIMARY_IDENTIFIER: Readonly<Record<string, string>> = {
  Event: "eventID",
  Occurrence: "occurrenceID",
  Taxon: "taxonID",
  ExtendedMeasurementOrFact: "measurementID",
};

/** Same-class self references (field -> identifier in the same class). */
const DWC_SELF_REFERENCES: ReadonlyArray<
  { readonly class: string; readonly field: string; readonly targetField: string }
> = [
  { class: "Event", field: "parentEventID", targetField: "eventID" },
];

export interface DatasetShape {
  readonly name: string;
  readonly class: string;
  readonly columns: readonly string[];
}

export interface InferredForeignKey {
  readonly ruleType: "foreignKey";
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetDataset: string;
  readonly targetField: string;
  readonly requirement: "required";
}

export interface RelationConflict {
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetClass: string;
  readonly candidates: readonly string[];
}

/** Minimal shape of an already-declared rule (user config). */
interface DeclaredRule {
  readonly ruleType: string;
  readonly sourceDataset?: string;
  readonly sourceField?: string;
}

// NUL separator: dataset names are user strings and could contain spaces, so a
// space separator could alias two distinct (dataset, field) pairs.
const KEY_SEP = "\0";
const key = (dataset: string, field: string) => `${dataset}${KEY_SEP}${field}`;

/**
 * Infer the standard Darwin Core foreign keys for a set of datasets.
 *
 * A cross-class rule fires when a dataset has another class's identifier column
 * and exactly one dataset of that class exists. Two-or-more candidate datasets
 * of the target class yield a `RelationConflict` instead. Any `(sourceDataset,
 * sourceField)` already declared in `existing` is skipped entirely (user rules
 * win and resolve ambiguity).
 */
export function inferForeignKeyRules(
  datasets: readonly DatasetShape[],
  existing: readonly DeclaredRule[] = [],
): { rules: InferredForeignKey[]; conflicts: RelationConflict[] } {
  const declared = new Set(
    existing
      .filter((r) => r.ruleType === "foreignKey" && r.sourceDataset && r.sourceField)
      .map((r) => key(r.sourceDataset!, r.sourceField!)),
  );

  const byClass = new Map<string, DatasetShape[]>();
  for (const d of datasets) {
    const list = byClass.get(d.class) ?? [];
    list.push(d);
    byClass.set(d.class, list);
  }

  const rules: InferredForeignKey[] = [];
  const conflicts: RelationConflict[] = [];

  for (const source of datasets) {
    // Cross-class references: a column that is another class's primary id.
    for (const [targetClass, idField] of Object.entries(DWC_PRIMARY_IDENTIFIER)) {
      if (targetClass === source.class) continue;
      if (!source.columns.includes(idField)) continue;
      if (declared.has(key(source.name, idField))) continue;

      const candidates = byClass.get(targetClass) ?? [];
      if (candidates.length === 0) continue;
      if (candidates.length > 1) {
        conflicts.push({
          sourceDataset: source.name,
          sourceField: idField,
          targetClass,
          candidates: candidates.map((c) => c.name),
        });
        continue;
      }
      rules.push({
        ruleType: "foreignKey",
        sourceDataset: source.name,
        sourceField: idField,
        targetDataset: candidates[0].name,
        targetField: idField,
        requirement: "required",
      });
    }

    // Self references (e.g. Event.parentEventID -> Event.eventID). The target is
    // always the source dataset itself, so it is never ambiguous.
    for (const self of DWC_SELF_REFERENCES) {
      if (source.class !== self.class) continue;
      if (!source.columns.includes(self.field)) continue;
      if (declared.has(key(source.name, self.field))) continue;
      rules.push({
        ruleType: "foreignKey",
        sourceDataset: source.name,
        sourceField: self.field,
        targetDataset: source.name,
        targetField: self.targetField,
        requirement: "required",
      });
    }
  }

  return { rules, conflicts };
}

/**
 * Order dataset names so that every FK target is created before its source.
 * Self-references are ignored (a table may reference itself at CREATE time).
 * Stable: independent datasets keep their input order.
 */
export function orderByForeignKeyDependencies(
  names: readonly string[],
  edges: readonly { sourceDataset: string; targetDataset: string }[],
): string[] {
  // dependency: source depends on target (target must come first)
  const deps = new Map<string, Set<string>>();
  for (const n of names) deps.set(n, new Set());
  for (const e of edges) {
    if (e.sourceDataset === e.targetDataset) continue;
    if (!deps.has(e.sourceDataset) || !deps.has(e.targetDataset)) continue;
    deps.get(e.sourceDataset)!.add(e.targetDataset);
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (n: string) => {
    if (done.has(n)) return;
    // Cycle guard: skip recursing into a node already on the stack. The DwC star
    // schema is acyclic, so this only degrades gracefully on malformed input
    // (the node is still emitted, just without ordering its cyclic dependency).
    if (visiting.has(n)) return;
    visiting.add(n);
    for (const t of deps.get(n) ?? []) visit(t);
    visiting.delete(n);
    done.add(n);
    ordered.push(n);
  };

  for (const n of names) visit(n);
  return ordered;
}
