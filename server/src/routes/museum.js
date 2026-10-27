import { loadExhibits, findExhibit } from "../exhibits.js";
import {
  buildGhostPrompt,
  languageReminder,
  offeringLabel,
  buildOfferingPrompt,
  buildGuestbookPrompt,
} from "../prompt.js";
import { chat, streamToReply, cleanHistory } from "../ollama.js";
import { read, update } from "../store.js";

const OFFERING_ITEMS = ["candle", "marigold", "bread", "special"];
const EMPTY_OFFERINGS = { candle: 0, marigold: 0, bread: 0, special: 0 };

const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);

export async function museumRoutes(app) {
  app.get("/api/exhibits", async () => {
    const exhibits = await loadExhibits();
    return exhibits.map(({ archive, personality, ...publicData }) => publicData);
  });

  // ---------- Séance ----------
  app.post("/api/exhibits/:id/seance", async (request, reply) => {
    const exhibit = await findExhibit(request.params.id);
    if (!exhibit) return reply.code(404).send({ error: "This exhibit does not exist." });

    const messages = cleanHistory(request.body?.messages);
    if (messages.length === 0 || messages.at(-1).role !== "user") {
      return reply.code(400).send({ error: "Ask the ghost something first." });
    }

    await streamToReply(request, reply, [
      { role: "system", content: buildGhostPrompt(exhibit) },
      ...messages,
      { role: "system", content: languageReminder(messages.at(-1).content) },
    ]);
  });

  // ---------- Offerings ----------
  // Total offerings per exhibit, for the museum hall.
  app.get("/api/offerings", async () => {
    const offerings = await read("offerings");
    return Object.fromEntries(Object.entries(offerings).map(([id, counts]) => [id, total(counts)]));
  });

  app.get("/api/exhibits/:id/offerings", async (request) => {
    const offerings = await read("offerings");
    const counts = { ...EMPTY_OFFERINGS, ...offerings[request.params.id] };
    return { counts, total: total(counts) };
  });

  app.post("/api/exhibits/:id/offerings", async (request, reply) => {
    const exhibit = await findExhibit(request.params.id);
    if (!exhibit) return reply.code(404).send({ error: "This exhibit does not exist." });

    const item = request.body?.item;
    if (!OFFERING_ITEMS.includes(item)) return reply.code(400).send({ error: "Unknown offering." });

    const counts = await update("offerings", {}, (offerings) => {
      offerings[exhibit.id] = { ...EMPTY_OFFERINGS, ...offerings[exhibit.id] };
      offerings[exhibit.id][item] += 1;
      return { ...offerings[exhibit.id] };
    });

    // The offering is saved even if the ghost is too sleepy to answer.
    let reaction = null;
    try {
      reaction = await chat(buildOfferingPrompt(exhibit, offeringLabel(exhibit, item), total(counts)));
    } catch (error) {
      request.log.warn(error, "Ghost could not react to the offering");
    }

    return { counts, total: total(counts), reaction };
  });

  // ---------- Guestbook ----------
  app.get("/api/exhibits/:id/guestbook", async (request) => {
    const guestbook = await read("guestbook");
    return (guestbook[request.params.id] ?? []).slice(0, 30);
  });

  app.post("/api/exhibits/:id/guestbook", async (request, reply) => {
    const exhibit = await findExhibit(request.params.id);
    if (!exhibit) return reply.code(404).send({ error: "This exhibit does not exist." });

    const name = String(request.body?.name ?? "").trim().slice(0, 40) || "Anonymous visitor";
    const message = String(request.body?.message ?? "").trim().slice(0, 280);
    if (!message) return reply.code(400).send({ error: "Write something in the guestbook first." });

    let ghostReply = null;
    try {
      ghostReply = await chat(buildGuestbookPrompt(exhibit, name, message));
    } catch (error) {
      request.log.warn(error, "Ghost could not answer the guestbook");
    }

    const entry = {
      id: crypto.randomUUID(),
      name,
      message,
      reply: ghostReply,
      createdAt: new Date().toISOString(),
    };

    await update("guestbook", {}, (guestbook) => {
      guestbook[exhibit.id] = [entry, ...(guestbook[exhibit.id] ?? [])].slice(0, 100);
    });

    return entry;
  });
}
