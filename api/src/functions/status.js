const { app } = require("@azure/functions");
const store = require("../shared");

// Reads back what is actually in storage, so the Training page can show it.
app.http("status", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "status",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    try {
      if (!(await store.roleOf(user))) return await store.refusal(user);
      const text = await store.getJson("shared/training.json");
      let training = null;
      if (text !== null) {
        const pack = JSON.parse(text);
        training = {
          bytes: Buffer.byteLength(text),
          updated: pack.updated || 0,
          sentences: (pack.cues || []).map((c) => ({ g: c.g, m: c.m, clips: ((pack.bank || {})[c.k] || []).length }))
        };
      }
      return { status: 200, jsonBody: { training, facePoints: await store.clipSummary() }, headers: { "cache-control": "no-store" } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
