/**
 * Test to understand DuckDB's actual type inference behavior
 */

import { DuckDBConnection as DuckDB } from "@duckdb/node-api";

const TEST_CSV = "./test/data/duckdb-inference-test.csv";

Deno.test("DuckDB type inference behavior", async (t) => {
  // Create test CSV with various types
  await Deno.writeTextFile(
    TEST_CSV,
    `numberCol,textCol,mixedCol,emptyCol,naCol
123,hello,456,,"NA"
456.78,world,789.12,,
999,test,text,,`,
  );

  try {
    await t.step("What types does DuckDB infer?", async () => {
      const connection = await DuckDB.create();

      try {
        // Load with automatic type inference
        await connection.runAndReadAll(`
          CREATE TABLE test_auto AS
          SELECT * FROM read_csv_auto('${TEST_CSV}')
        `);

        // Check the schema DuckDB inferred
        const schemaResult = await connection.runAndReadAll(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'test_auto'
        `);

        const schema = schemaResult.getRowObjects();
        console.log("\n=== DuckDB Inferred Schema ===");
        for (const col of schema) {
          console.log(`${col.column_name}: ${col.data_type}`);
        }

        // Check actual values
        const dataResult = await connection.runAndReadAll(`
          SELECT * FROM test_auto
        `);

        const rows = dataResult.getRowObjects();
        console.log("\n=== DuckDB Stored Values ===");
        console.log("Row 1:", rows[0]);
        console.log("Row 1 numberCol type:", typeof rows[0].numberCol);
        console.log("Row 1 textCol type:", typeof rows[0].textCol);
      } finally {
        connection.closeSync();
      }
    });

    await t.step("How does DuckDB handle null values?", async () => {
      const connection = await DuckDB.create();

      try {
        // Load with nullstr configuration
        await connection.runAndReadAll(`
          CREATE TABLE test_nulls AS
          SELECT * FROM read_csv_auto('${TEST_CSV}', nullstr=['NA'])
        `);

        const result = await connection.runAndReadAll(`
          SELECT naCol FROM test_nulls
        `);

        const rows = result.getRowObjects();
        console.log("\n=== Null Handling ===");
        console.log("Row 1 naCol (CSV has 'NA'):", rows[0].naCol);
        console.log("Row 1 naCol === null:", rows[0].naCol === null);
      } finally {
        connection.closeSync();
      }
    });

    await t.step("What happens with all_varchar=true?", async () => {
      const connection = await DuckDB.create();

      try {
        // Load everything as VARCHAR
        await connection.runAndReadAll(`
          CREATE TABLE test_varchar AS
          SELECT * FROM read_csv_auto('${TEST_CSV}', all_varchar=true)
        `);

        const schemaResult = await connection.runAndReadAll(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'test_varchar'
        `);

        const schema = schemaResult.getRowObjects();
        console.log("\n=== With all_varchar=true ===");
        for (const col of schema) {
          console.log(`${col.column_name}: ${col.data_type}`);
        }

        const dataResult = await connection.runAndReadAll(`
          SELECT * FROM test_varchar LIMIT 1
        `);

        const row = dataResult.getRowObjects()[0];
        console.log("Row 1 numberCol value:", row.numberCol);
        console.log("Row 1 numberCol type:", typeof row.numberCol);
      } finally {
        connection.closeSync();
      }
    });

    await t.step("Does DuckDB store intermediate string values?", async () => {
      const connection = await DuckDB.create();

      try {
        // When DuckDB infers a number, is there ever a string version?
        await connection.runAndReadAll(`
          CREATE TABLE test_direct AS
          SELECT * FROM read_csv_auto('${TEST_CSV}')
        `);

        const result = await connection.runAndReadAll(`
          SELECT numberCol FROM test_direct LIMIT 1
        `);

        const value = result.getRowObjects()[0].numberCol;

        console.log("\n=== Is There a String Intermediate? ===");
        console.log("CSV file contains: '123' (as text)");
        console.log("DuckDB gives us:", value);
        console.log("Type:", typeof value);
        console.log("Conclusion: DuckDB directly parses to number, no string intermediate");
      } finally {
        connection.closeSync();
      }
    });

    await t.step("Can we detect what the CSV string was?", async () => {
      const connection = await DuckDB.create();

      try {
        // Compare all_varchar vs inferred types
        await connection.runAndReadAll(`
          CREATE TABLE csv_raw AS
          SELECT * FROM read_csv_auto('${TEST_CSV}', all_varchar=true)
        `);

        await connection.runAndReadAll(`
          CREATE TABLE csv_typed AS
          SELECT * FROM read_csv_auto('${TEST_CSV}')
        `);

        const rawResult = await connection.runAndReadAll(`
          SELECT numberCol as raw_value FROM csv_raw LIMIT 1
        `);

        const typedResult = await connection.runAndReadAll(`
          SELECT numberCol as typed_value FROM csv_typed LIMIT 1
        `);

        console.log("\n=== Comparing Raw vs Typed ===");
        console.log("Raw (all_varchar):", rawResult.getRowObjects()[0].raw_value);
        console.log("Typed (inferred):", typedResult.getRowObjects()[0].typed_value);
        console.log("These differ in TYPE but content is same");
        console.log("So we CAN read the original CSV string with all_varchar");
      } finally {
        connection.closeSync();
      }
    });
  } finally {
    await Deno.remove(TEST_CSV);
  }
});
