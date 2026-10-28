import { fetchRepos, fetchRepoMemories, daysSince } from "../github.js";
import { buildEpitaphMessages, buildRepoGhostPrompt, languageReminder } from "../prompt.js";
import { chat, streamToReply, cleanHistory } from "../ollama.js";
import { read, update } from "../store.js";

const DEFAULT_USER = process.env.GITHUB_USER ?? "itsnazaretdev";
const LIST_TTL = 15 * 60 * 1000; // Ask GitHub again after 15 minutes.
const NAME_PATTERN = /^[\w.-]{1,100}$/;

const EMPTY = { users: {}, memories: {} };

// Turns a GitHub failure into a message the visitor can act on.
function explainGithubError(error) {
  if (error.status === 404) return "That GitHub user does not exist.";
  if (error.rateLimited) {
    const time = error.resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `GitHub's hourly limit was reached. Try again after ${time}, or start the server with GITHUB_TOKEN.`;
  }
  if (error.status === 401) return "Your GITHUB_TOKEN is not valid. Check it or start the server without it.";
  return `Could not reach GitHub: ${error.message}`;
}

function readUser(value) {
  const user = String(value ?? "").trim() || DEFAULT_USER;
  return NAME_PATTERN.test(user) ? user : null;
}

// Gets the repo list from GitHub, or from the local cache when offline.
async function getRepos(user) {
  const store = await read("graveyard", EMPTY);
  const cached = store.users[user];
  const fresh = cached && Date.now() - cached.fetchedAt < LIST_TTL;
  if (fresh) return { repos: cached.repos, offline: false };

  try {
    const repos = await fetchRepos(user);
    await update("graveyard", EMPTY, (data) => {
      data.users[user] = { fetchedAt: Date.now(), repos };
    });
    return { repos, offline: false };
  } catch (error) {
    if (cached) return { repos: cached.repos, offline: true };
    throw error;
  }
}

// Repo info + memories (README, commits, epitaph), cached so the ghost works offline.
// The README and commits cost 2 GitHub requests, so they are only downloaded for a séance.
async function getRepoGhost(user, name, { withMemories = true } = {}) {
  const { repos } = await getRepos(user);
  const repo = repos.find((r) => r.name === name);
  if (!repo) return null;

  const key = `${user}/${name}`;
  const store = await read("graveyard", EMPTY);
  let memories = store.memories[key] ?? {};

  if (withMemories && memories.readme === undefined) {
    const fetched = await fetchRepoMemories(user, name);
    memories = await update("graveyard", EMPTY, (data) => {
      data.memories[key] = { ...data.memories[key], ...fetched };
      return data.memories[key];
    });
  }

  return {
    ...repo,
    ...memories,
    daysDead: daysSince(repo.pushedAt),
    lastCommit: memories.commits?.[0]?.message,
  };
}

export async function graveyardRoutes(app) {
  // Tombstones: repos with no activity for `months` months, plus archived ones.
  app.get("/api/graveyard", async (request, reply) => {
    const user = readUser(request.query.user);
    if (!user) return reply.code(400).send({ error: "That is not a valid GitHub username." });
    const months = Math.min(24, Math.max(1, Number(request.query.months) || 3));

    let result;
    try {
      result = await getRepos(user);
    } catch (error) {
      request.log.error(error, "Graveyard could not load repos from GitHub");
      return reply.code(error.status === 404 ? 404 : 502).send({ error: explainGithubError(error) });
    }

    const store = await read("graveyard", EMPTY);
    const limitDays = months * 30;
    const tombstones = result.repos
      .map((repo) => ({
        ...repo,
        daysDead: daysSince(repo.pushedAt),
        epitaph: store.memories[`${user}/${repo.name}`]?.epitaph ?? null,
      }))
      .filter((repo) => repo.archived || repo.daysDead >= limitDays)
      .sort((a, b) => b.daysDead - a.daysDead);

    return {
      user,
      months,
      offline: result.offline,
      alive: result.repos.length - tombstones.length,
      tombstones,
    };
  });

  // Gemma writes the epitaph once, then it stays carved in stone (cached).
  app.post("/api/graveyard/:repo/epitaph", async (request, reply) => {
    const user = readUser(request.body?.user);
    const name = request.params.repo;
    if (!user || !NAME_PATTERN.test(name)) return reply.code(400).send({ error: "Invalid repo." });

    // The epitaph only needs the repo list (already loaded), so it costs no GitHub requests.
    const ghost = await getRepoGhost(user, name, { withMemories: false });
    if (!ghost) return reply.code(404).send({ error: "That grave is empty." });
    if (ghost.epitaph) return { epitaph: ghost.epitaph };

    const raw = await chat(buildEpitaphMessages(ghost), { temperature: 0.9 });
    const epitaph = raw.split("\n")[0].replace(/^["'“”]+|["'“”]+$/g, "").trim().slice(0, 140);

    await update("graveyard", EMPTY, (data) => {
      data.memories[`${user}/${name}`] = { ...data.memories[`${user}/${name}`], epitaph };
    });
    return { epitaph };
  });

  app.post("/api/graveyard/:repo/seance", async (request, reply) => {
    const user = readUser(request.body?.user);
    const name = request.params.repo;
    if (!user || !NAME_PATTERN.test(name)) return reply.code(400).send({ error: "Invalid repo." });

    const messages = cleanHistory(request.body?.messages);
    if (messages.length === 0 || messages.at(-1).role !== "user") {
      return reply.code(400).send({ error: "Ask the ghost something first." });
    }

    const ghost = await getRepoGhost(user, name);
    if (!ghost) return reply.code(404).send({ error: "That grave is empty." });

    await streamToReply(request, reply, [
      { role: "system", content: buildRepoGhostPrompt(ghost) },
      ...messages,
      { role: "system", content: languageReminder(messages.at(-1).content) },
    ]);
  });
}