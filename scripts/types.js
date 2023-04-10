import { exec as execFn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const exec = promisify(execFn);

const __dirname = dirname(fileURLToPath(import.meta.url));

const types_src = join(__dirname, "..", "src", "exports", "types.ts");
const types_dest = join(__dirname, "..", "dist", "types.d.ts");

// Run dts generator
await exec(`npm-dts -e="${types_src}" -o="${types_dest}" -L debug generate`);

// Cleanup
let contents = await readFile(types_dest, "utf-8");

// Remove the default package created
contents = contents.replace(/declare module 'bagelecs' {.*?}/ms, "");
// Remane "index" to default package
contents = contents.replace("'bagelecs/exports/index'", "'bagelecs'");

// Rename "worker" to remote
contents = contents.replace("'bagelecs/exports/worker'", "'bagelecs/remote'");

// Remove the "temp" module
contents = contents.replace(
    /declare module 'bagelecs\/exports\/types' {.*?}/ms,
    ""
);

await writeFile(types_dest, contents);
