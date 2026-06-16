//
// Copyright 2026 Diffus. Licensed under MIT License.
//

import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const output = `//
// Copyright 2026 Diffus. Licensed under MIT License.
//

export const VERSION = ${JSON.stringify(packageJson.version)};
`;

await writeFile(new URL("../diffus/version.ts", import.meta.url), output);
