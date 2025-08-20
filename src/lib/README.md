# Util Directory - DEPRECATED

This directory has been consolidated into `/lib/` for better organization.

## Migration Status

✅ **Moved to lib/:**

- `vocabulary-service.ts` → `/lib/vocabulary-service.ts` - Database-backed vocabulary functionality
- `zAsyncIterable.ts` → `/lib/zAsyncIterable.ts` - tRPC async iterable utilities
- `validation-functions.ts` functionality → `/lib/validations.ts` - Consolidated into main validation system

❌ **Empty files removed:**

- `configuration-processor.ts` - Empty placeholder
- `configuration-types.ts` - Empty placeholder
- `constants.ts` - Empty placeholder
- `transformation-functions.ts` - Empty placeholder

## Current Imports

If you have imports from this directory, update them to use `/lib/` instead:

```typescript
// OLD
import { getVocabulary } from "../app/util/vocabulary-service";

// NEW
import { getVocabulary } from "../lib/vocabulary-service";
```
