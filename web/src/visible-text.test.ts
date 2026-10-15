// Regression test: the game must show its own name ("Bird Launcher") and never the
// old "Angry Birds" name in anything the player can see (page title, install manifest,
// the top bar title and the source that renders them).
import { test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(join(webRoot, file), "utf8");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSources(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

// This file spells out the old name in its own assertions, so it is not scanned.
const appSources = listSources(join(webRoot, "src")).filter((file) => !file.endsWith("visible-text.test.ts"));
const OLD_NAME = /angry/i;

test("no visible file mentions the old 'Angry Birds' name", () => {
  const visibleFiles = [join(webRoot, "index.html"), join(webRoot, "vite.config.ts"), ...appSources];
  const offenders = visibleFiles.filter((file) => /angry\s*birds/i.test(readFileSync(file, "utf8")));
  expect(offenders.map((file) => relative(webRoot, file))).toEqual([]);
});

test("no app source shows the old 'Angry' name", () => {
  const offenders = appSources.filter((file) => OLD_NAME.test(readFileSync(file, "utf8")));
  expect(offenders.map((file) => relative(webRoot, file))).toEqual([]);
});

test("page title uses the new name", () => {
  expect(read("index.html")).toMatch(/<title>Bird Launcher — FreeGameStore<\/title>/);
});

test("install manifest uses the new name", () => {
  expect(read("vite.config.ts")).toMatch(/name: "Bird Launcher",\s*short_name: "Bird Launcher"/);
});

test("top bar shows the new name", () => {
  expect(read("src/App.tsx")).toMatch(/title="Bird Launcher"/);
});
