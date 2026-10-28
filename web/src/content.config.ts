import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { GHOST_SHAPES } from "./lib/ghost-shapes.ts";

// The exhibits live in the root /exhibits folder, shared with the server.
const exhibits = defineCollection({
  loader: glob({ pattern: "*.md", base: "../exhibits" }),
  schema: z.object({
    name: z.string(),
    ghost: z.string(),
    born: z.number(),
    died: z.union([z.number(), z.string()]),
    order: z.number().default(99),
    color: z.string(),
    shape: z.enum(GHOST_SHAPES).default("classic"),
    epitaph: z.string(),
    offering: z.string().default("🎁 A small gift"),
    personality: z.string(),
    catchphrase: z.string(),
    critics: z.array(z.string()).default([]),
  }),
});

export const collections = { exhibits };