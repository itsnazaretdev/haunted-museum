// Every shape a ghost can take. Used by Ghost.astro and the exhibits' frontmatter (shape: ...).
export const GHOST_SHAPES = [
  "classic",
  "floppy",
  "vhs",
  "cassette",
  "handheld",
  "disc",
  "book",
  "browser",
  "clapper",
  "letter",
  "bubble",
  "coin",
  "folder",
] as const;

export type GhostShape = (typeof GHOST_SHAPES)[number];