import { getEnv } from "./env.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readText(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

export async function writeArtifact(fileName, payload) {
  const outputDir = path.join(process.cwd(), getEnv("BATCH_OUTPUT_DIR", "artifacts/batch-runs"));
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, fileName);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}
