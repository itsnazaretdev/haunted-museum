import { findExhibit } from "../exhibits.js";
import { buildDebateMessages, DEFAULT_TOPIC } from "../prompt.js";
import { streamToReply } from "../ollama.js";
import { read, update } from "../store.js";

export async function debateRoutes(app) {
  // The browser asks for one turn at a time, so each ghost answers the other live.
  app.post("/api/debate/turn", async (request, reply) => {
    const { speaker: speakerId, opponent: opponentId, topic: rawTopic, transcript: rawTranscript } =
      request.body ?? {};

    const [speaker, opponent] = await Promise.all([findExhibit(speakerId), findExhibit(opponentId)]);
    if (!speaker || !opponent || speaker.id === opponent.id) {
      return reply.code(400).send({ error: "Choose two different ghosts." });
    }

    const topic = String(rawTopic ?? "").trim().slice(0, 200) || DEFAULT_TOPIC;
    const transcript = (Array.isArray(rawTranscript) ? rawTranscript : [])
      .filter((t) => [speaker.id, opponent.id].includes(t?.speaker) && typeof t.text === "string")
      .map((t) => ({ speaker: t.speaker, text: t.text.slice(0, 1500) }))
      .slice(-8);

    await streamToReply(request, reply, buildDebateMessages(speaker, opponent, topic, transcript));
  });

  app.post("/api/debate/vote", async (request, reply) => {
    const { winner: winnerId, loser: loserId } = request.body ?? {};
    const [winner, loser] = await Promise.all([findExhibit(winnerId), findExhibit(loserId)]);
    if (!winner || !loser || winner.id === loser.id) {
      return reply.code(400).send({ error: "Vote for one of the two ghosts." });
    }

    return update("debates", {}, (scores) => {
      for (const id of [winner.id, loser.id]) scores[id] ??= { wins: 0, losses: 0 };
      scores[winner.id].wins += 1;
      scores[loser.id].losses += 1;
      return { ...scores };
    });
  });

  app.get("/api/debate/scoreboard", async () => read("debates"));
}
