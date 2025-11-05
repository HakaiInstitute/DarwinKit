# Darwin Core Semantic Type Analysis

## Discovery: Everything is Semantic!

Looking through the Darwin Core field definitions in `packages/shared/src/specs/dwc/`, **every field already has a `semanticType`** property. This validates your intuition: in a domain-specific standard like Darwin Core, everything has semantic meaning.

## Existing Semantic Types

### 1. **Identifier** (7+ fields)
**Fields**: `eventID`, `occurrenceID`, `scientificNameID`, `materialSampleID`, `catalogNumber`, etc.

**Semantic properties:**
- Must be unique (within scope)
- Often resolvable (URIs)
- Persistent over time
- May be globally unique or locally scoped
- Used for referential integrity

**Metadata tracked:**
```typescript
identifier: {
  identifierType: "uri" | "local" | "global",
  globallyUnique: boolean,
  persistentIdentifier: boolean,
  resolvable: boolean
}
```

**Class needs:**
- ✅ **HIGH** - Identifiers have complex validation rules, referential relationships
- Validation: uniqueness, format, resolvability
- Behavior: resolve(), validate(), checkUniqueness()

### 2. **Location** (10+ fields)
**Fields**: `decimalLatitude`, `decimalLongitude`, `country`, `countryCode`, `stateProvince`, `county`, `verbatimLocality`

**Semantic properties:**
- Coordinate system (WGS84, NAD83, etc.)
- Precision requirements
- Geographic bounds
- Administrative hierarchy
- Coordinate uncertainty

**Metadata tracked:**
```typescript
location: {
  coordinateSystem: "decimal degrees" | "administrative",
  precision?: number,
  geodeticDatum?: string,
  uncertaintyUnit?: string
}
```

**Class needs:**
- ✅ **HIGH** - Coordinates especially need rich representation
- Validation: range checking, datum conversion, uncertainty calculation
- Behavior: transform(), validate(), calculateDistance()

### 3. **Controlled Vocabulary** (10+ fields)
**Fields**: `basisOfRecord`, `countryCode`, `taxonRank`, `occurrenceStatus`, `lifeStage`, etc.

**Semantic properties:**
- Must match controlled vocabulary
- Case sensitivity rules
- Vocabulary version/authority
- Fuzzy matching for suggestions

**Metadata tracked:**
```typescript
vocabulary: {
  vocabularyKey: string,
  caseSensitive: boolean,
  strictness: "strict" | "recommended" | "loose"
}
```

**Class needs:**
- 🟡 **MEDIUM** - Could benefit from class but not essential
- Validation: vocabulary lookup, fuzzy matching
- Behavior: getSuggestions(), validate(), normalize()

### 4. **Temporal** (4+ fields)
**Fields**: `eventDate`, `year`, `month`, `day`, `verbatimEventDate`

**Semantic properties:**
- ISO 8601 format
- Can't be in future (for occurrence data)
- Incomplete dates allowed (year-only, year-month)
- Intervals supported
- Precision (year, month, day, hour, minute)

**Metadata tracked:**
```typescript
temporal: {
  dateFormat: "iso8601" | "partial",
  allowFutureDates: boolean,
  allowIncompleteDate?: boolean,
  intervalSupported?: boolean
}
```

**Class needs:**
- ✅ **HIGH** - Temporal data has complex rules and precision semantics
- Validation: format checking, future date detection, interval parsing
- Behavior: parse(), validate(), getPrecision(), toISO8601()

### 5. **Taxonomy** (10+ fields)
**Fields**: `scientificName`, `kingdom`, `phylum`, `class`, `order`, `family`, `genus`, etc.

**Semantic properties:**
- Nomenclatural code (ICZN, ICN, etc.)
- Taxonomic rank
- Authority lookups (WoRMS, GBIF, ITIS)
- Hybrid formulas
- Author citations

**Metadata tracked:**
```typescript
taxonomy: {
  rank?: string,                  // "genus", "species", etc.
  nomenclaturalCode?: string,     // "ICZN", "ICN", etc.
  rankVocabularyKey?: string,
  hybridFormula?: boolean
}
```

**Class needs:**
- ✅ **HIGH** - Scientific names have complex validation and lookup requirements
- Validation: format checking, authority lookup, rank consistency
- Behavior: lookupAuthority(), validate(), parseAuthorship()

### 6. **Measurement** (5+ fields)
**Fields**: `organismQuantity`, `minimumDepthInMeters`, `maximumDepthInMeters`, `coordinateUncertaintyInMeters`

**Semantic properties:**
- Unit of measurement
- Precision/decimal places
- Measurement type (count, length, area, etc.)
- Default unit
- Range validation

**Metadata tracked:**
```typescript
measurement: {
  unit: string,
  defaultUnit: string,
  precision: number,
  measurementType: string
}
```

**Class needs:**
- 🟡 **MEDIUM** - Units and conversions could benefit from class
- Validation: range checking, unit conversion
- Behavior: convert(), validate(), getPrecision()

### 7. **Description** (5+ fields)
**Fields**: `verbatimLocality`, `fieldNotes`, `eventRemarks`, `identificationRemarks`, `occurrenceRemarks`

**Semantic properties:**
- Free text
- May contain structured data (references, URIs)
- Language considerations
- Length limits

**Metadata tracked:**
```typescript
// Usually none - just text
```

**Class needs:**
- ❌ **LOW** - Simple text validation sufficient
- Validation: length, format (if URI/reference)
- Behavior: Maybe extract URIs, detect language

## The Answer: Everything IS Semantic

You're absolutely right. In Darwin Core:
- **Every field has domain-specific meaning**
- **Every field has validation rules beyond primitive types**
- **Every field carries metadata about its semantic context**

The question isn't "which fields are semantic?" - they all are.

The question is: **"Which semantic types need rich class representations?"**

## Recommendation: Three-Tier Approach

### Tier 1: Rich Semantic Classes (High Priority)
**Complex semantics requiring class representation:**

1. **Identifier** - Uniqueness, resolution, referential integrity
2. **Coordinate** (location subset) - Coordinate system, precision, transformations
3. **Temporal** - Precision, intervals, format parsing
4. **ScientificName** (taxonomy subset) - Authority lookup, format validation
5. **TaxonomicRank** (taxonomy subset) - Hierarchy, rank validation

**Implementation:**
```typescript
class Identifier extends SemanticValue<string> { ... }
class Coordinate extends SemanticValue<{lat, lon}> { ... }
class TemporalValue extends SemanticValue<Date> { ... }
class ScientificName extends SemanticValue<string> { ... }
class TaxonomicRank extends SemanticValue<string> { ... }
```

### Tier 2: Lightweight Semantic Wrappers (Medium Priority)
**Semantic meaning but simpler:**

1. **ControlledVocabulary** - Vocabulary lookup, suggestions
2. **Measurement** - Unit handling, conversion
3. **GeographicName** (location subset) - Administrative boundaries

**Implementation:**
```typescript
class ControlledVocabulary extends SemanticValue<string> {
  validate() { return this.vocabularyLookup(); }
}
```

### Tier 3: Annotated Primitives (Low Priority)
**Semantic type is just metadata:**

1. **Description** - Just text with length validation
2. **SimpleText** - Any text field without special rules

**Implementation:**
```typescript
// No class - just use string with semantic annotation
{
  semanticType: "description",
  primitiveType: "string"
}
```

## How Semantic Types Work Together

### In Field Definitions
```typescript
export const decimalLatitude: FieldDefinition = {
  semanticType: "location",      // Annotation
  primitiveType: "number",        // Storage type
  location: { ... },              // Semantic metadata
  validators: [ ... ]             // Validation rules
}
```

### At Runtime (with classes)
```typescript
// Reading from DuckDB
const latValue = 45.123;  // Primitive from DB

// Wrap in semantic type
const coordinate = new Coordinate(
  latValue,
  lonValue,
  fieldDef.location.geodeticDatum
);

// Validate using semantic knowledge
const result = coordinate.validate();
```

### At Configuration (transformations)
```typescript
{
  "transformations": [{
    "function": "splitCoordinates",
    "parameters": { ... },
    "outputSemanticType": "location"  // Produces Coordinate class
  }]
}
```

## Benefits of This Approach

1. **Gradual adoption** - Start with high-value classes, add more later
2. **Backward compatible** - Existing `semanticType` annotations remain
3. **Type safety** - TypeScript knows which fields get which classes
4. **UI-friendly** - UI can render based on semantic type
5. **Validation clarity** - Semantic classes encapsulate their rules
6. **Transformation pipeline** - Functions know what semantic type they produce

## Implementation Priority

**Phase 1** (now):
- Define Tier 1 classes (Identifier, Coordinate, Temporal, ScientificName)
- Update transformation system to support semantic output

**Phase 2** (later):
- Add Tier 2 wrappers (ControlledVocabulary, Measurement)
- Enhance validators to use semantic classes

**Phase 3** (future):
- Full semantic type system
- UI widgets per semantic type
- Advanced transformations with semantic awareness

## Conclusion

**You were right**: Everything in Darwin Core is semantic. The codebase already reflects this with `semanticType` annotations on every field.

**Next step**: Build rich class representations for the most complex semantic types (Identifier, Coordinate, Temporal, ScientificName), while keeping simpler types as annotated primitives.

This gives us the best of both worlds:
- Rich behavior where it adds value
- Simplicity where primitives suffice
- Semantic awareness throughout the system
