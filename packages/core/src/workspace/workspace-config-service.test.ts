/**
 * Tests for WorkspaceConfigService
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { join } from "@std/path";
import { WorkspaceConfigService } from "./workspace-config-service.ts";

async function createTestConfig(tempDir: string, config: Partial<Record<string, unknown>>) {
  const fullConfig = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation: {
      nullValues: ["", "NA"],
      failFast: false,
      outputDir: "./output",
    },
    datasets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...config,
  };

  await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(fullConfig, null, 2),
  );
}

Deno.test("WorkspaceConfigService - discovers config in current directory", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "config_test_" });

  try {
    await createTestConfig(tempDir, {
      name: "Test Config",
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
    await createTestConfig(tempDir, {
      name: "Valid Config",
      version: "1.0.0",
      datasets: [
        {
          name: "test_dataset",
          spec: "dwc-event",
          path: "./data.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ],
        },
      ],
    });

    const configPath = join(tempDir, "darwinkit.json");
    const config = await Effect.runPromise(
      WorkspaceConfigService.loadConfig(configPath),
    );

    assertEquals(config.name, "Valid Config");

    // Type guard - ensure config has validation settings
    if (!("validation" in config)) {
      throw new Error("Config does not have validation settings");
    }

    assertEquals(config.validation.datasets.length, 1);
    assertEquals(config.validation.datasets[0].name, "test_dataset");
    assertEquals(config.validation.datasets[0].spec, "dwc-event");
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
      datasets: [
        {
          name: "test_dataset",
          spec: "dwc-event",
          path: "./data.csv",
          fieldMappings: [],
        },
      ],
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
      datasets: [
        {
          name: "missing_dataset",
          spec: "dwc-event",
          path: "./missing.csv",
          fieldMappings: [],
        },
      ],
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

    await createTestConfig(tempDir, {
      name: "Complete Config",
      datasets: [
        {
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID" },
            { originName: "country", targetName: "country" },
          ],
        },
      ],
    });

    const { config, configPath } = await Effect.runPromise(
      WorkspaceConfigService.discoverAndLoad(tempDir),
    );

    assertExists(config);
    assertEquals(config.name, "Complete Config");

    // Type guard - ensure config has validation settings
    if (!("validation" in config)) {
      throw new Error("Config does not have validation settings");
    }

    assertEquals(config.validation.datasets.length, 1);
    assertEquals(configPath, join(tempDir, "darwinkit.json"));
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
