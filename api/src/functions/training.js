const { app } = require("@azure/functions");
const store = require("../shared");

const MAX = 4 * 1024 * 1024;

// The whole training set for the signed-in user: the sentences and the lip measurements of each taught clip.
app.http("training", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "training",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    const path = `users/${store.safe(user.userId)}/training.json`;
    try {
      if (request.method === "GET") {
        const text = await store.getJson(path);
        if (text === null) return { status: 404, jsonBody: { error: "Nothing saved yet." } };
        return { status: 200, body: text, headers: { "content-type": "application/json", "cache-control": "no-store" } };
      }
      const text = await request.text();
      if (text.length > MAX) return { status: 413, jsonBody: { error: "Training set is too large." } };
      let pack;
      try { pack = JSON.parse(text); } catch (e) { return { status: 400, jsonBody: { error: "Not valid JSON." } }; }
      if (!pack || !Array.isArray(pack.cues) || typeof pack.bank !== "object") return { status: 400, jsonBody: { error: "Not a training set." } };
      await store.putJson(path, text);
      return { status: 200, jsonBody: { ok: true, updated: pack.updated || 0 } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
