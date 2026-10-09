const { app } = require("@azure/functions");
const store = require("../shared");

const MAX = 3 * 1024 * 1024;

// One taught clip as raw face-point positions per frame (no image). Kept so the
// measurements can be recomputed later and a proper model can be trained on them.
app.http("clips", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "clips",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    try {
      if (!(await store.roleOf(user))) return await store.refusal(user);
      const text = await request.text();
      if (text.length > MAX) return { status: 413, jsonBody: { error: "Clip is too large." } };
      let clip;
      try { clip = JSON.parse(text); } catch (e) { return { status: 400, jsonBody: { error: "Not valid JSON." } }; }
      if (!clip || !clip.cue || typeof clip.cue.k !== "string" || !Array.isArray(clip.frames) || !clip.frames.length) {
        return { status: 400, jsonBody: { error: "Not a clip." } };
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `shared/clips/${store.safe(clip.cue.k) || "cue"}/${stamp}.json`;
      await store.putJson(path, text);
      return { status: 201, jsonBody: { ok: true } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
