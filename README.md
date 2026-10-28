# 👻 Haunted Museum of Dead Tech

A haunted museum where dead (or almost dead) technologies come back as ghosts.

Built for the Hacktoberfest open-source AI challenge, week "Ghost in the Machine".
Every ghost runs on **Gemma 3 (4B) through Ollama**, locally. No API keys, no cloud.

## What you can do

- **Historical wing** · From 1971 to 2006: the Floppy Disk, VHS, the Walkman, the Game Boy, Encarta,
  Internet Explorer, Flash, Clippy, MSN Messenger and jQuery (who refuses to accept it is dead).
  Hold a séance: each ghost tells its story, answers its critics and argues why it should come back.
- **Ofrenda** · For Día de los Muertos, leave a candle, a marigold, pan de muerto or the ghost's
  special gift on its altar. The ghost reacts, and the most loved ghost gets a badge in the hall.
- **Guestbook** · Sign each exhibit's guestbook and the ghost writes a dedication back.
- **Debate Hall** · Pick two ghosts and a topic. They argue live, turn by turn, and you vote the winner.
- **Repo Graveyard** · Your abandoned GitHub repos get a tombstone and an epitaph written by Gemma.
  Summon the ghost of any repo: it remembers its README and last commits, and asks why you left.

Ghosts answer in the language you write to them (English or Spanish).

## Why open models

- **Your data stays home.** Guestbook messages, offerings and your repo history never leave your machine.
- **Works with the lights off.** Once the graveyard has been visited, it is cached locally,
  so the whole museum works without internet.
- **Swap the medium.** The museum detects the models you have in Ollama. Pick another one from the header
  (Gemma, Qwen, Llama...) and every ghost is channeled by it.
- **Free to haunt.** No tokens, no bills: talk to the dead as long as you want.

## Run it

You need Node 18+, [pnpm](https://pnpm.io) and [Ollama](https://ollama.com).

```bash
ollama pull gemma3:4b

pnpm install
cp web/.env.example web/.env
pnpm dev           # server on http://localhost:3001, museum on http://localhost:4321
```

You can also start each part on its own with `pnpm dev:server` or `pnpm dev:web`.

Gemma is used by default, but any chat model works: if Gemma is not installed, the museum uses
the first model it finds. With more than one model installed, choose the "medium" from the
selector in the header; the choice is saved in your browser.

### Options (server environment variables)

| Variable       | Default            | What it does                                            |
| -------------- | ------------------ | ------------------------------------------------------- |
| `OLLAMA_MODEL` | `gemma3:4b`        | Preferred model. If it is not installed, the first installed chat model is used |
| `OLLAMA_URL`   | `http://localhost:11434` | Where Ollama is running                           |
| `GITHUB_TOKEN` | (none)             | Optional, raises the GitHub limit from 60 to 5000 req/h |

```bash
OLLAMA_MODEL=llama3.2 pnpm dev
```

## Structure

pnpm workspace with two packages:

```
exhibits/          Markdown archive shared by server and web (one file per ghost)
server/
  src/routes/      museum (séance, offerings, guestbook), debate, graveyard
  src/prompt.js    every ghost personality and prompt
  src/store.js     small JSON files in server/data (the museum's memory)
web/               Astro site: hall, exhibits, Debate Hall and Repo Graveyard
```

To add a new ghost, just add a new `.md` file to `/exhibits`.