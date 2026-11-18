import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createVSIX } from "@vscode/vsce";

const { version } = JSON.parse(await readFile("vscode/package.json", "utf8"));
await copyFile("LICENSE", "vscode/LICENSE");
await mkdir("releases", { recursive: true });
const packagePath = `releases/rill-${version}.vsix`;
await createVSIX({ cwd: "vscode", packagePath, dependencies: false });
console.log(`Packaged ${packagePath}`);
