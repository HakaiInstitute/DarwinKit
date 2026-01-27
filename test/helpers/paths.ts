import { join } from "@std/path";

export const TEST_DIR = join(Deno.cwd(), "test");
export const TEST_DATA_DIR = join(TEST_DIR, "data");
export const TEST_CONFIG_DIR = join(TEST_DIR, "example-config");
