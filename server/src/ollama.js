const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
// Preferred model. If it is not installed, the museum uses the first chat model it finds.
export const PREFERRED_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

const TAGS_TTL = 30 * 1000;
let tagsCache = { at: 0, online: false, models: [] };

// "llama3.2" and "llama3.2:latest" are the same model for Ollama.
const sameModel = (a, b) => a === b || a === `${b}:latest` || b === `${a}:latest`;

// Installed chat models (embedding models can't talk, so they are skipped). Cached for 30 seconds.
export async function listModels() {
  if (Date.now() - tagsCache.at < TAGS_TTL) return tagsCache;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama answered with status ${res.status}`);
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name).filter((name) => !/embed/i.test(name)).sort();
    tagsCache = { at: Date.now(), online: true, models: names };
  } catch {
    tagsCache = { at: Date.now(), online: false, models: [] };
  }
  return tagsCache;
}

// Picks the model for a request: the one the visitor chose, the preferred one, or any installed one.
export async function resolveModel(requested) {
  const { models } = await listModels();
  const find = (name) => name && models.find((m) => sameModel(m, name));
  return find(requested) ?? find(PREFERRED_MODEL) ?? models[0] ?? PREFERRED_MODEL;
}

// What the header shows: is Ollama running, which models exist and which one this visitor uses.
export async function checkOllama(requested) {
  const { online, models } = await listModels();
  return { online, models, modelReady: models.length > 0, model: await resolveModel(requested) };
}

// Asks for a full answer at once. Used for short texts like epitaphs or reactions.
export async function chat(messages, { temperature = 0.8, model = PREFERRED_MODEL } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
  });
  if (!res.ok) throw new Error(`Ollama answered with status ${res.status}`);
  const data = await res.json();
  return (data.message?.content ?? "").trim();
}

// Streams the model answer, calling onToken for every piece of text.
export async function streamChat(messages, onToken, signal, model = PREFERRED_MODEL) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { temperature: 0.8 },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama answered with status ${res.status}`);
  }

  // Ollama sends one JSON object per line (NDJSON).
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      const data = JSON.parse(line);
      if (data.message?.content) onToken(data.message.content);
    }
  }
}

// Sends a streamed answer straight to the browser as plain text.
export async function streamToReply(request, reply, messages) {
  const controller = new AbortController();
  reply.hijack();
  reply.raw.writeHead(200, {
    ...reply.getHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  // Stop generating if the visitor leaves the page.
  reply.raw.on("close", () => controller.abort());

  try {
    await streamChat(messages, (token) => reply.raw.write(token), controller.signal, request.ghostModel);
  } catch (error) {
    if (!controller.signal.aborted) {
      request.log.error(error);
      reply.raw.write("\n\n*The connection with the other side was lost...*");
    }
  } finally {
    reply.raw.end();
  }
}

// Keeps only valid chat messages and the last few turns.
export function cleanHistory(history, max = 10) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => ["user", "assistant"].includes(m?.role) && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-max);
}