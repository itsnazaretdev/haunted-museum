import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Everything the museum remembers lives in small JSON files on your own disk.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data");

const cache = new Map();
const queues = new Map();

async function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  try {
    const raw = await readFile(join(DATA_DIR, `${name}.json`), "utf8");
    cache.set(name, JSON.parse(raw));
  } catch {
    cache.set(name, structuredClone(fallback));
  }
  return cache.get(name);
}

async function save(name) {
  await mkdir(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, `${name}.json`);
  // Write to a temp file first so a crash never leaves a broken JSON.
  await writeFile(`${file}.tmp`, JSON.stringify(cache.get(name), null, 2));
  await rename(`${file}.tmp`, file);
}

// Reads a store. Use it for GET requests.
export function read(name, fallback = {}) {
  return load(name, fallback);
}

// Changes a store one request at a time, so two visitors never overwrite each other.
export function update(name, fallback, change) {
  const previous = queues.get(name) ?? Promise.resolve();
  const next = previous.then(async () => {
    const data = await load(name, fallback);
    const result = await change(data);
    await save(name);
    return result;
  });
  queues.set(name, next.catch(() => {}));
  return next;
}
