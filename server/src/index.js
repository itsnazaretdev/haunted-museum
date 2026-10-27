import "./env.js"; // Must stay first: loads server/.env
import Fastify from "fastify";
import cors from "@fastify/cors";
import { checkOllama, MODEL } from "./ollama.js";
import { museumRoutes } from "./routes/museum.js";
import { debateRoutes } from "./routes/debate.js";
import { graveyardRoutes } from "./routes/graveyard.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Lets the frontend know if the spirits are awake (Ollama running + model downloaded).
app.get("/api/health", async () => ({ model: MODEL, ...(await checkOllama()) }));

await app.register(museumRoutes);
await app.register(debateRoutes);
await app.register(graveyardRoutes);

await app.listen({ port: PORT });