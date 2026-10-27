import { readdir, readFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const EXHIBITS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../exhibits");

let cache = null;

// Reads every exhibit Markdown file once and keeps it in memory.
export async function loadExhibits() {
  if (cache) return cache;

  const files = (await readdir(EXHIBITS_DIR)).filter((file) => file.endsWith(".md"));
  const exhibits = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(EXHIBITS_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return { id: basename(file, ".md"), ...data, archive: content.trim() };
    })
  );

  cache = exhibits.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return cache;
}

export async function findExhibit(id) {
  const exhibits = await loadExhibits();
  return exhibits.find((exhibit) => exhibit.id === id);
}
