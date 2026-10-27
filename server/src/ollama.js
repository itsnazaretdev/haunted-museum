const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
export const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

// Returns true if Ollama is running and the model is downloaded.
export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { online: false, modelReady: false };
    const { models = [] } = await res.json();
    const modelReady = models.some((m) => m.name === MODEL || m.name.startsWith(`${MODEL}:`));
    return { online: true, modelReady };
  } catch {
    return { online: false, modelReady: false };
  }
}

// Asks for a full answer at once. Used for short texts like epitaphs or reactions.
export async function chat(messages, { temperature = 0.8 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: false, options: { temperature } }),
  });
  if (!res.ok) throw new Error(`Ollama answered with status ${res.status}`);
  const data = await res.json();
  return (data.message?.content ?? "").trim();
}

// Streams the model answer, calling onToken for every piece of text.
export async function streamChat(messages, onToken, signal) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
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
    await streamChat(messages, (token) => reply.raw.write(token), controller.signal);
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
