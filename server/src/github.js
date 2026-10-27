const GITHUB_API = process.env.GITHUB_API ?? "https://api.github.com";
const README_LIMIT = 3000;

function headers(accept = "application/vnd.github+json") {
  const result = { Accept: accept, "User-Agent": "haunted-museum-of-dead-tech" };
  // Optional: a token raises the GitHub limit from 60 to 5000 requests per hour.
  if (process.env.GITHUB_TOKEN) result.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return result;
}

async function getJson(path) {
  let res;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: headers() });
  } catch (cause) {
    // No answer at all: no internet, DNS, firewall, proxy...
    const code = cause.cause?.code ?? cause.cause?.errors?.[0]?.code ?? cause.cause?.message ?? cause.message;
    const error = new Error(`Could not connect to GitHub (${code})`);
    error.status = 0;
    throw error;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(`GitHub answered ${res.status}: ${body.message ?? res.statusText}`);
    error.status = res.status;
    // GitHub tells us when the hourly limit resets.
    if (res.headers.get("x-ratelimit-remaining") === "0") {
      error.rateLimited = true;
      error.resetAt = new Date(Number(res.headers.get("x-ratelimit-reset")) * 1000);
    }
    throw error;
  }
  return res.json();
}

export const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date)) / 86_400_000));

// All public repos of a user (without forks), newest activity first.
export async function fetchRepos(user) {
  const repos = await getJson(`/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner`);
  return repos
    .filter((repo) => !repo.fork)
    .map((repo) => ({
      name: repo.name,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      archived: repo.archived,
      url: repo.html_url,
      createdAt: repo.created_at.slice(0, 10),
      pushedAt: repo.pushed_at.slice(0, 10),
    }));
}

// README and last commits: the memories of the repo's ghost.
export async function fetchRepoMemories(user, repo) {
  const base = `/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}`;

  const readmePromise = fetch(`${GITHUB_API}${base}/readme`, {
    headers: headers("application/vnd.github.raw"),
  })
    .then((res) => (res.ok ? res.text() : ""))
    .catch(() => "");

  const commitsPromise = getJson(`${base}/commits?per_page=5`)
    .then((commits) =>
      commits.map((c) => ({
        date: c.commit.author?.date?.slice(0, 10) ?? "unknown",
        message: c.commit.message.split("\n")[0].slice(0, 120),
      }))
    )
    .catch(() => []); // Empty repos answer 409, that's fine.

  const [readme, commits] = await Promise.all([readmePromise, commitsPromise]);
  return { readme: readme.slice(0, README_LIMIT), commits };
}