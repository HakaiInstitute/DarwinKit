import { type ConfigWithValidation, workspaceConfigSchema } from "@dwkt/domain";
import { assert, assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import { Schema } from "effect";
import * as Effect from "effect/Effect";
import { WorkspaceConfigService } from "./workspace-config-service.ts";

// Schema-aware equivalence checker for configs
const configEquivalence = Schema.equivalence(workspaceConfigSchema);

async function createTestConfig(
  tempDir: string,
  config: Partial<ConfigWithValidation>,
): Promise<ConfigWithValidation> {
  const fullConfig: ConfigWithValidation = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation: {
      nullValues: ["", "NA"],
      failFast: false,
      outputDir: "./output",
      datasets: config.validation?.datasets || [],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...config,
  };

  await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(fullConfig, null, 2),
  );

  return fullConfig;
}

Deno.test("WorkspaceConfigService - discovers config in current directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    await createTestConfig(tempDir, {
      id: "test-config",
      name: "Test Config",
      version: "0.0.0",
      validation: {
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
        datasets: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const configPath = await Effect.runPromise(
      WorkspaceConfigService.discoverConfig(tempDir),
    );

    assertEquals(configPath, join(tempDir, "darwinkit.json"));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - discovers config in parent directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });
  const subDir = join(tempDir, "subdir");

  try {
    await Deno.mkdir(subDir);
    await createTestConfig(tempDir, {
      name: "Parent Config",
    });

    const configPath = await Effect.runPromise(
      WorkspaceConfigService.discoverConfig(subDir),
    );

    assertEquals(configPath, join(tempDir, "darwinkit.json"));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - fails when config not found", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    const result = await Effect.runPromise(
      Effect.either(WorkspaceConfigService.discoverConfig(tempDir)),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertEquals(result.left._tag, "ConfigNotFoundError");
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - loads valid configuration", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    const expectedConfig = await createTestConfig(tempDir, {
      name: "Valid Config",
      version: "1.0.0",
      validation: {
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
        datasets: [
          {
            name: "test_dataset",
            spec: "dwc-event",
            profile: "Event",
            path: "./data.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID", isRequired: true },
            ],
          },
        ],
      },
    });

    const configPath = join(tempDir, "darwinkit.json");
    const loadedConfig = await Effect.runPromise(
      WorkspaceConfigService.loadConfig(configPath),
    );

    // Verify loaded config is equivalent to what we created
    assert(
      configEquivalence(loadedConfig, expectedConfig),
      "Loaded config should be equivalent to created config",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - fails on invalid JSON", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    await Deno.writeTextFile(
      join(tempDir, "darwinkit.json"),
      "{ invalid json }",
    );

    const configPath = join(tempDir, "darwinkit.json");
    const result = await Effect.runPromise(
      Effect.either(WorkspaceConfigService.loadConfig(configPath)),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertEquals(result.left._tag, "ConfigParseError");
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - validates dataset file paths", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    // Create test CSV file
    const csvPath = join(tempDir, "data.csv");
    await Deno.writeTextFile(csvPath, "id,name\n1,test\n");

    await createTestConfig(tempDir, {
      validation: {
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
        datasets: [
          {
            name: "test_dataset",
            spec: "dwc-event",
            profile: "Event",
            path: "./data.csv",
            fieldMappings: [],
          },
        ],
      },
    });

    const configPath = join(tempDir, "darwinkit.json");
    const config = await Effect.runPromise(
      WorkspaceConfigService.loadConfig(configPath),
    );

    // Should succeed - file exists
    await Effect.runPromise(
      WorkspaceConfigService.validateDatasetPaths(config, tempDir),
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - fails when dataset file missing", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    await createTestConfig(tempDir, {
      validation: {
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
        datasets: [
          {
            name: "missing_dataset",
            spec: "dwc-event",
            profile: "Event",
            path: "./missing.csv",
            fieldMappings: [],
          },
        ],
      },
    });

    const configPath = join(tempDir, "darwinkit.json");
    const config = await Effect.runPromise(
      WorkspaceConfigService.loadConfig(configPath),
    );

    const result = await Effect.runPromise(
      Effect.either(
        WorkspaceConfigService.validateDatasetPaths(config, tempDir),
      ),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertEquals(result.left._tag, "DatasetFileNotFoundError");
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceConfigService - discoverAndLoad end-to-end", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    // Create test CSV
    const csvPath = join(tempDir, "events.csv");
    await Deno.writeTextFile(csvPath, "eventID,country\nE1,Canada\n");

    const expectedConfig = await createTestConfig(tempDir, {
      name: "Complete Config",
      validation: {
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "Event",
            path: "./events.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "country", targetName: "country" },
            ],
          },
        ],
      },
    });

    const { config: loadedConfig, configPath } = await Effect.runPromise(
      WorkspaceConfigService.discoverAndLoad(tempDir),
    );

    assertExists(loadedConfig);
    assertEquals(configPath, join(tempDir, "darwinkit.json"));

    // Verify loaded config is equivalent to what we created
    assert(
      configEquivalence(loadedConfig, expectedConfig),
      "Loaded config should be equivalent to created config",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
