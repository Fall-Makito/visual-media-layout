import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const pluginId = "visual-media-layout";
const releaseDir = path.join("dist", pluginId);
const releaseFiles = ["main.js", "manifest.json", "styles.css"];

await rm(releaseDir, { force: true, recursive: true });
await mkdir(releaseDir, { recursive: true });

const checksumLines = [];

for (const file of releaseFiles) {
  const input = await readFile(file);
  const outputPath = path.join(releaseDir, file);
  await copyFile(file, outputPath);

  const digest = createHash("sha256").update(input).digest("hex");
  checksumLines.push(`${digest}  ${file}`);
}

await writeFile(
  path.join(releaseDir, "sha256sums.txt"),
  `${checksumLines.join("\n")}\n`,
);

console.log(`Prepared release files in ${releaseDir}`);

