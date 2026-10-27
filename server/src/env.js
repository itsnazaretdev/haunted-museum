import { fileURLToPath } from "node:url";

// Loads server/.env (GITHUB_TOKEN, OLLAMA_MODEL...) before anything else reads process.env.
// Import this file first in index.js. If there is no .env file, nothing happens.
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // No .env file, or a Node version without loadEnvFile: environment variables still work.
}