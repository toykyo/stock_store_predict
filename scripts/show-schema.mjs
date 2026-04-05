import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const schemaPath = path.join(process.cwd(), "sql", "001_init_schema.sql");
  const content = await readFile(schemaPath, "utf8");
  console.log(content);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
