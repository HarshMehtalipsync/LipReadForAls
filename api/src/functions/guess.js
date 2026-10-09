const { app } = require("@azure/functions");
const store = require("../shared");

// Asks a language model for Gujarati sentences that could fit a sequence of mouth shapes.
// The page then checks every suggestion against the shapes itself, so a poor guess costs nothing.
// Needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY and AZURE_OPENAI_DEPLOYMENT on the Static Web App.
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

app.http("guess", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "guess",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
    const key = process.env.AZURE_OPENAI_KEY, deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    if (!endpoint || !key || !deployment) return { status: 501, jsonBody: { error: "No language model is connected." } };
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
        list(q.known, 60).length ? `Sentences he is known to use: ${list(q.known, 60).join(" | ")}` : ""
      ].filter(Boolean).join("\n");
      const version = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";
      const r = await fetch(`${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(version)}`, {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userText }],
          response_format: { type: "json_object" },
          max_tokens: 1800,
          temperature: 0.8
        })
      });
      if (!r.ok) {
        context.error(`Language model answered ${r.status}`);
        return { status: 502, jsonBody: { error: `The language model answered with error ${r.status}. Check the endpoint, key and deployment name.` } };
      }
      const data = await r.json();
      let candidates = [];
      try { candidates = JSON.parse(data.choices[0].message.content).candidates || []; } catch (e) { candidates = []; }
      candidates = candidates.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().slice(0, 120)).slice(0, 60);
      return { status: 200, jsonBody: { candidates }, headers: { "cache-control": "no-store" } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "The language model could not be reached." } };
    }
  }
});
