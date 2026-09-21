/**
 * Resolve hook for `node --test`.
 *
 * The source uses bundler-style extensionless imports ("./serv"), which Next
 * resolves but Node's ESM resolver does not. This appends the extension so the
 * same files can be unit-tested directly, with no build step and no test
 * framework.
 */

import { register } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.__JUDR_RESOLVER__) {
  process.env.__JUDR_RESOLVER__ = "1";
  register("./scripts/ts-resolve.mjs", pathToFileURL("./"));
}

const CANDIDATES = [".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of CANDIDATES) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        // Deliberately no `format`: Node detects .ts and applies type stripping.
        return { url: candidate.href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
