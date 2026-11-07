const { app } = require("@azure/functions");
const store = require("../shared");

// Asks a language model for Gujarati sentences that could fit a sequence of mouth shapes.
// The page then checks every suggestion against the shapes itself, so a poor guess costs nothing.
// Needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY and AZURE_OPENAI_DEPLOYMENT on the Static Web App.
// Cheapest first: AZURE_OPENAI_DEPLOYMENT should be a cheap model. If AZURE_OPENAI_DEPLOYMENT_STRONG is also set,
// the page asks again with level 1 when none of the cheap model's sentences fit the mouth shapes well, and the
// strong model also stands in when the cheap one fails. Most reads only ever touch the cheap model.
const SYSTEM = `You help a Gujarati-speaking man with ALS communicate. He cannot voice words. He mouths short
sentences silently and a camera detects only the visible mouth shapes, in order. The symbols are:
M = lips pressed together (પ ફ બ ભ મ)
A = mouth wide open (આ)
I = lips spread (ઇ ઈ એ)
U = lips rounded (ઉ ઊ ઓ, and વ)
N = slightly open or neutral (અ, and sounds made inside the mouth such as ક ગ ચ જ ટ ડ ત દ ન ર લ સ હ)
Sounds made inside the mouth are invisible, so many different sentences fit one sequence. Detection is noisy:
a shape may be missing, extra or wrong, and an M at the very start or end may only be his resting mouth.
He is cared for at home by family. He talks about his needs, comfort, pain, breathing, position, food and water,
the room, television, family members, feelings, greetings, thanks and everyday conversation.
Reply with JSON only, in the form {"candidates":["...","..."]}, with 40 different short natural Gujarati
sentences or phrases (1 to 7 words, in Gujarati script, as a family member would really say them) that he
could plausibly be saying and whose mouth shapes fit the sequence as closely as possible. Put the best fits first.`;

// Calls one chat deployment. Newer models (gpt-5, o-series) refuse max_tokens and temperature, so a 400 that names
// either is retried once with max_completion_tokens and no temperature.
async function chat(endpoint, key, deployment, messages) {
  const version = process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview";
  const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(version)}`;
  const send = (extra) => fetch(url, {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ messages, response_format: { type: "json_object" } }, extra))
  });
  let r = await send({ max_tokens: 1800, temperature: 0.8 });
  if (r.status === 400) {
    const why = await r.text();
    if (!/max_tokens|temperature|unsupported/i.test(why)) return { status: 400 };
    r = await send({ max_completion_tokens: 6000 });
  }
  if (!r.ok) return { status: r.status };
  const data = await r.json();
  let candidates = [];
  try { candidates = JSON.parse(data.choices[0].message.content).candidates || []; } catch (e) { candidates = []; }
  candidates = candidates.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 120)).slice(0, 60);
  return { status: 200, candidates };
}

app.http("guess", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "guess",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
    const key = process.env.AZURE_OPENAI_KEY, cheap = process.env.AZURE_OPENAI_DEPLOYMENT;
    const strong = process.env.AZURE_OPENAI_DEPLOYMENT_STRONG || "";
    if (!endpoint || !key || !cheap) return { status: 501, jsonBody: { error: "No language model is connected." } };
    try {
      if (!(await store.roleOf(user))) return await store.refusal(user);
      let q = {};
      try { q = JSON.parse(await request.text()) || {}; } catch (e) { /* handled below */ }
      const shapes = String(q.shapes || "").toUpperCase().replace(/[^MAIUN ]/g, "").trim().slice(0, 200);
      if (!shapes) return { status: 400, jsonBody: { error: "No mouth shapes were sent." } };
      const list = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map((s) => String(s).slice(0, 120));
      const hour = Number(q.hour);
      const userText = [
        `Detected mouth shapes: ${shapes}`,
        `The mouthing lasted about ${Number(q.secs || 0).toFixed(1)} seconds.`,
        Number.isFinite(hour) ? `Local time is about ${hour}:00.` : "",
        list(q.recent, 5).length ? `He recently said: ${list(q.recent, 5).join(" | ")}` : "",
        list(q.known, 60).length ? `Sentences he is known to use: ${list(q.known, 60).join(" | ")}` : "",
        list(q.avoid, 60).length ? `These were already suggested and did not fit the shapes well, so suggest different ones: ${list(q.avoid, 60).join(" | ")}` : ""
      ].filter(Boolean).join("\n");
      const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: userText }];

      // Level 0 asks the cheap model, level 1 the strong one. The other is tried only when a call fails outright.
      const order = strong ? (Number(q.level) >= 1 ? [strong, cheap] : [cheap, strong]) : [cheap];
      let res = { status: 500 }, used = "";
      for (const d of order) {
        res = await chat(endpoint, key, d, messages);
        used = d;
        if (res.status === 200) break;
        context.warn(`Language model ${d} answered ${res.status}`);
        if (res.status === 401 || res.status === 403) break;   // a wrong key fails on every deployment
      }
      if (res.status !== 200) {
        return { status: 502, jsonBody: { error: `The language model answered with error ${res.status}. Check the endpoint, key and deployment names.` } };
      }
      const tier = strong && used === strong && strong !== cheap ? "strong" : "cheap";
      return { status: 200, jsonBody: { candidates: res.candidates, tier, canEscalate: Boolean(strong) && tier === "cheap" }, headers: { "cache-control": "no-store" } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "The language model could not be reached." } };
    }
  }
});
