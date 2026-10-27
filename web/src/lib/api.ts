export const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";

// Escapes HTML and turns *whispers* into italics.
export function format(text: string) {
  const safe = text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return safe.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Status ${res.status}`);
  return res.json();
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Status ${res.status}`);
  return res.json();
}

// Posts a request and calls onText with the full answer so far, every time a new piece arrives.
export async function streamText(path: string, body: unknown, onText: (text: string) => void) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Status ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}
