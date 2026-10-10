const { app } = require("@azure/functions");
const store = require("../shared");

// Exchanges an email and password for a session token.
app.http("login", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "login",
  handler: async (request, context) => {
    if (!store.configured()) {
      return { status: 501, jsonBody: { error: "Sign-in is not set up yet. Add ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET to the Static Web App settings." } };
    }
    try {
      let body = {};
      try { body = JSON.parse(await request.text()) || {}; } catch (e) { /* handled below */ }
      const email = store.cleanEmail(body.email);
      const role = await store.checkLogin(email, String(body.password || ""));
      if (!role) {
        await new Promise((r) => setTimeout(r, 700));          // slows down guessing
        return { status: 401, jsonBody: { error: "That email and password do not match an account." } };
      }
      return { status: 200, jsonBody: { token: store.makeToken(email), email, role }, headers: { "cache-control": "no-store" } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
