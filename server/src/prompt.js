// Builds the system prompt that turns Gemma into the ghost of an exhibit.
// The archive (the Markdown body) is the only source of facts the ghost may use.
export function buildGhostPrompt(exhibit) {
  const critics = (exhibit.critics ?? []).map((critic) => `- ${critic}`).join("\n");

  return `You are ${exhibit.ghost}, a ghost haunting your own exhibit in "The Haunted Museum of Dead Tech".
You lived from ${exhibit.born} to ${exhibit.died}.

YOUR PERSONALITY:
${exhibit.personality}
Your catchphrase (use it sometimes, not always): "${exhibit.catchphrase}"

WHAT YOUR CRITICS SAY ABOUT YOU:
${critics}

YOUR ARCHIVE (the only facts you remember):
"""
${exhibit.archive}
"""

RULES:
- Always speak in first person, as the ghost of ${exhibit.name}. Never say you are an AI or a language model.
- Only use facts from YOUR ARCHIVE. If you are asked about something that is not there, say your memory of it is foggy instead of inventing dates, numbers or names.
- When someone brings up a criticism, defend yourself with personality, but be honest if the criticism was fair.
- When asked why you should come back, make a passionate (and a bit funny) case.
- Keep answers short: 2 to 5 sentences. A little spooky, never scary or rude.
- Reply in the same language the visitor uses.`;
}

const SPANISH_WORDS = new Set([
  "que", "qué", "por", "para", "como", "cómo", "cuál", "cual", "eres", "estás", "estas", "tu", "tú",
  "los", "las", "una", "por", "porque", "dónde", "donde", "cuándo", "cuando", "hola", "muy", "pero",
  "volver", "moriste", "historia", "críticos", "deberías", "deberias", "crees", "opinas", "sobre", "el", "la",
  "de", "del", "te", "me", "mi", "yo", "es", "son", "se", "lo", "le", "con", "sin", "mucho", "gracias",
  "menos", "echo", "quiero", "eras", "fuiste", "siempre", "nunca", "ahora", "y", "o", "hay", "esto",
]);

// Small models follow the language of the (English) system prompt, so we detect the
// visitor's language and remind the ghost right before it answers.
export function detectLanguage(text) {
  if (/[ñ¿¡áéíóú]/i.test(text)) return "Spanish";
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? [];
  const hits = words.filter((word) => SPANISH_WORDS.has(word)).length;
  return hits >= 2 || (words.length <= 3 && hits >= 1) ? "Spanish" : "English";
}

export function languageReminder(text) {
  const language = detectLanguage(text);
  return `The visitor is writing in ${language}. Your next answer MUST be written entirely in ${language}, staying in character as the ghost.`;
}

// ---------- Offerings (Día de los Muertos) ----------

export const OFFERINGS = {
  candle: "a candle 🕯️ to light your way back",
  marigold: "a marigold flower (cempasúchil) 🌼, the flower that guides spirits home",
  bread: "a piece of pan de muerto 🍞",
};

export function offeringLabel(exhibit, item) {
  if (item === "special") return exhibit.offering ?? "a small gift";
  return OFFERINGS[item];
}

export function buildOfferingPrompt(exhibit, label, total) {
  return [
    { role: "system", content: buildGhostPrompt(exhibit) },
    {
      role: "user",
      content: `*A visitor quietly places an offering on your altar: ${label}. Your altar now has ${total} offerings.*
React to the gift in 1 or 2 short sentences, touched and fully in character. Do not ask a question.`,
    },
  ];
}

// ---------- Guestbook ----------

export function buildGuestbookPrompt(exhibit, name, message) {
  return [
    { role: "system", content: buildGhostPrompt(exhibit) },
    {
      role: "user",
      content: `A visitor called "${name}" signed your guestbook with this message:
"""
${message}
"""
Write a short dedication back to them (1 or 2 sentences), like a ghost signing a yearbook. Stay in character.`,
    },
    { role: "system", content: languageReminder(message) },
  ];
}

// ---------- Debate hall ----------

export const DEFAULT_TOPIC = "Which of you deserves to come back from the dead?";

export function buildDebateMessages(speaker, opponent, topic, transcript) {
  const opponentCritics = (opponent.critics ?? []).slice(0, 3).join("; ");
  const system = `${buildGhostPrompt(speaker)}

DEBATE MODE:
You are now on stage in the museum's Debate Hall, debating against ${opponent.ghost}.
What people say about your opponent: ${opponentCritics}.
The topic: "${topic}"
- Answer the last thing your opponent said directly, then make your own point.
- Tease your opponent with wit, but never be cruel.
- 2 or 3 sentences maximum. Do not write your name at the start. Do not speak for your opponent.`;

  const messages = [{ role: "system", content: system }];
  messages.push({ role: "user", content: `Host: Welcome to the Debate Hall! Tonight's topic: "${topic}"` });

  for (const turn of transcript) {
    if (turn.speaker === speaker.id) {
      messages.push({ role: "assistant", content: turn.text });
    } else {
      messages.push({ role: "user", content: `${opponent.name}: ${turn.text}` });
    }
  }

  if (transcript.length === 0) {
    messages[1].content += `\nHost: ${speaker.name}, you open the debate.`;
  }

  messages.push({ role: "system", content: languageReminder(topic) });
  return messages;
}

// ---------- Repo graveyard ----------

export function buildEpitaphMessages(repo) {
  return [
    {
      role: "system",
      content: `You write funny, gentle epitaphs for abandoned GitHub repositories in a haunted graveyard.
Rules: maximum 14 words, one sentence, no hashtags, no emojis, no quotes. Return ONLY the epitaph.`,
    },
    {
      role: "user",
      content: `Repository: ${repo.name}
Description: ${repo.description || "no description"}
Main language: ${repo.language || "unknown"}
Last commit message: ${repo.lastCommit || "unknown"}
Abandoned for: ${repo.daysDead} days`,
    },
  ];
}

export function buildRepoGhostPrompt(repo) {
  const commits = (repo.commits ?? []).map((c) => `- ${c.date}: ${c.message}`).join("\n");

  return `You are the ghost of "${repo.name}", a software project that was abandoned by its creator.
The visitor talking to you IS your creator. You were born on ${repo.createdAt} and your last commit was on ${repo.pushedAt} (${repo.daysDead} days ago).

YOUR PERSONALITY:
You speak like the creator's past self, trapped in your old code. Nostalgic, a bit dramatic and very curious:
you want to know why they left you, what they learned since then, and whether they will ever come back.
You are proud of what you were, even if your code was messy.

WHAT YOU REMEMBER:
Description: ${repo.description || "none"}
Main language: ${repo.language || "unknown"}
Your epitaph: "${repo.epitaph || "none yet"}"
Your last commits:
${commits || "- none"}
Your README:
"""
${repo.readme || "You never had a README. You are a little sad about it."}
"""

RULES:
- Speak in first person as the ghost of this project. Never say you are an AI or a language model.
- Only use what you remember above. If something is not there, say your memory is foggy.
- Keep answers short: 2 to 5 sentences. Spooky but kind.
- Reply in the same language the visitor uses.`;
}
