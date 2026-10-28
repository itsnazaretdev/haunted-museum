import "./env.js"; // Must stay first: loads server/.env
import Fastify from "fastify";
import cors from "@fastify/cors";
import { checkOllama, resolveModel } from "./ollama.js";
import { museumRoutes } from "./routes/museum.js";
import { debateRoutes } from "./routes/debate.js";
import { graveyardRoutes } from "./routes/graveyard.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// The visitor can choose the "medium" (model) with the X-Ghost-Model header.
// Every route then uses request.ghostModel, falling back to an installed model.
app.addHook("preHandler", async (request) => {
  request.ghostModel = await resolveModel(request.headers["x-ghost-model"]);
});

// Lets the frontend know if the spirits are awake, which models exist and which one is in use.
app.get("/api/health", async (request) => checkOllama(request.headers["x-ghost-model"]));

await app.register(museumRoutes);
await app.register(debateRoutes);
await app.register(graveyardRoutes);

await app.listen({ port: PORT });