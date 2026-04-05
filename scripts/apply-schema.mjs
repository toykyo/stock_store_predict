import { closePool, withClient } from "./lib/db.mjs";
import { readText } from "./lib/files.mjs";

async function main() {
  const sql = await readText("sql/001_init_schema.sql");
  await withClient(async (client) => {
    await client.query(sql);
  });

  console.log("Schema applied successfully.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
