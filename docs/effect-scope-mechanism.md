# How Effect.acquireRelease Registers with Scopes

## The Mechanism

Effect uses a **service/context system** to pass the `Scope` around implicitly. Here's what happens:

### Simplified Internal View

```typescript
// When you call Effect.acquireRelease
function acquireRelease(acquire, release) {
  return Effect.gen(function* (_) {
    // 1. Request the current Scope from Effect's context
    const scope = yield* _(Effect.scope);  // Gets the nearest scope

    // 2. Run the acquire
    const resource = yield* _(acquire);

    // 3. Register the release function with the scope
    yield* _(scope.addFinalizer((exit) => release(resource)));

    // 4. Return the resource
    return resource;
  });
}
```

### What Effect.scoped Does

```typescript
// When you call Effect.scoped
function scoped(effect) {
  return Effect.gen(function* (_) {
    // 1. Create a new Scope
    const newScope = makeScope();

    // 2. Provide this scope as context to the effect
    const result = yield* _(
      Effect.provideService(effect, Scope, newScope)
    );

    // 3. When effect completes, run all finalizers
    yield* _(newScope.close(result));

    return result;
  });
}
```

## Real Example from Our Code

```typescript
private createWorkspaceDbResource(workspaceId: string) {
  const acquire = Effect.gen(function* (_) {
    const connection = yield* _(Effect.tryPromise(() => DuckDB.create(), ...));
    // ... setup ...
    return { connection, workspaceConnection };
  });

  const release = (resource) => Effect.sync(() => {
    resource.connection.closeSync();
  });

  // Returns Effect<Resource, Error, Scope>
  //                              ^^^^^ Requires a Scope
  return Effect.acquireRelease(acquire, release);
}

validateUniqueFields(...) {
  const workspaceDbResource = this.createWorkspaceDbResource(workspaceId);

  return Effect.scoped(
    //   ^^^^^^^^ Creates and provides a Scope
    Effect.gen(function* (_) {
      // When this runs:
      // 1. Effect.scoped created a Scope and put it in the context
      // 2. workspaceDbResource requires a Scope (see type signature)
      // 3. Effect's runtime finds the Scope from context
      // 4. acquireRelease uses that Scope to register the release
      const { connection } = yield* _(workspaceDbResource);

      // ... use connection ...

      return violations;
    })
    // Effect.scoped closes the Scope here, running all registered finalizers
  );
}
```

## Visual Flow

```
Effect.scoped                              ← Creates Scope A
    |
    └─> Provides Scope A to effect tree
        |
        └─> Effect.gen
            |
            └─> yield* workspaceDbResource
                |
                ├─> Needs Scope (see type signature)
                |
                ├─> Effect runtime finds Scope A in context
                |
                ├─> acquireRelease runs:
                |   ├─> Calls acquire()
                |   ├─> Gets resource
                |   └─> Registers release in Scope A
                |       Scope A.finalizers = [release1]
                |
                └─> Returns resource to your code

        [... your code uses resource ...]

    Effect.scoped exits:
    └─> Calls Scope A.close()
        └─> Runs all finalizers: [release1]
```

## Multiple Resources Example

```typescript
Effect.scoped(
  Effect.gen(function* (_) {
    const db1 = yield* _(Effect.acquireRelease(acquireDb1, releaseDb1));
    //                                                     ^^^^^^^^^^^
    //                   Scope.finalizers = [releaseDb1]

    const db2 = yield* _(Effect.acquireRelease(acquireDb2, releaseDb2));
    //                                                     ^^^^^^^^^^^
    //                   Scope.finalizers = [releaseDb1, releaseDb2]

    const file = yield* _(Effect.acquireRelease(acquireFile, releaseFile));
    //                                                       ^^^^^^^^^^^
    //                   Scope.finalizers = [releaseDb1, releaseDb2, releaseFile]

    // ... use resources ...

    return result;
  })
  // Scope closes: runs releaseFile(), releaseDb2(), releaseDb1() in that order
);
```

## Key Points

1. **Scope is a service** in Effect's context system
2. **Effect.scoped** creates a Scope and provides it as context
3. **Effect.acquireRelease** requires a Scope (see type signature)
4. **Effect's runtime** automatically passes the Scope through the chain
5. **acquireRelease** calls `scope.addFinalizer()` to register cleanup
6. **Effect.scoped** calls `scope.close()` when exiting, running finalizers

## Type Safety

The type system enforces correct usage:

```typescript
// ❌ Won't compile - no scope provided
const resource = await Effect.runPromise(
  Effect.acquireRelease(acquire, release)
);
// Error: Effect requires Scope but none provided

// ✅ Compiles - Effect.scoped provides the Scope
const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* (_) {
      const resource = yield* _(Effect.acquireRelease(acquire, release));
      return useResource(resource);
    })
  )
);
```

## The Magic: Context Propagation

Effect uses **implicit context propagation** (similar to Haskell's ReaderT or Scala's ZIO):

```typescript
// Pseudo-code showing what Effect does internally
type Effect<A, E, R> = (context: R) => Result<A, E>

// Effect.scoped
function scoped<A, E, R>(
  effect: Effect<A, E, R | Scope>
): Effect<A, E, R> {
  return (context) => {
    const scope = new Scope();
    const contextWithScope = { ...context, scope };

    try {
      const result = effect(contextWithScope);  // Pass scope down
      scope.close();
      return result;
    } catch (e) {
      scope.close();
      throw e;
    }
  };
}

// Effect.acquireRelease
function acquireRelease<A, E>(
  acquire: Effect<A, E>,
  release: (a: A) => Effect<void, never>
): Effect<A, E, Scope> {
  return (context) => {
    const scope = context.scope;  // Get scope from context
    const resource = acquire(context);
    scope.addFinalizer(() => release(resource));  // Register!
    return resource;
  };
}
```

This is why you don't see explicit scope passing in your code - Effect's type system and runtime handle it automatically!
