const { app } = require("@azure/functions");
const store = require("../shared");

// GET: who am I. Admins also get the list of accounts.
// POST (admins only): { email, password, role } creates an account or resets its password;
//                     { email, remove: true } removes it.
app.http("access", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "access",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    try {
      const name = store.nameOf(user);
      const role = await store.roleOf(user);
      if (!role) return await store.refusal(user);
      const people = async () => [{ email: store.cleanEmail(process.env.ADMIN_EMAIL), role: "admin", fixed: true }]
        .concat((await store.readUsers()).map((u) => ({ email: u.email, role: u.role === "admin" ? "admin" : "member" })));
      if (request.method === "GET") {
        const body = { name, role };
        if (role === "admin") body.people = await people();
        return { status: 200, jsonBody: body, headers: { "cache-control": "no-store" } };
      }
      if (role !== "admin") return { status: 403, jsonBody: { error: "Only an admin can change accounts." } };
      let q = {};
      try { q = JSON.parse(await request.text()) || {}; } catch (e) { return { status: 400, jsonBody: { error: "Not valid JSON." } }; }
      const email = store.cleanEmail(q.email);
      if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) return { status: 400, jsonBody: { error: "Enter an email address." } };
      if (store.isEnvAdmin(email)) return { status: 400, jsonBody: { error: "That is the main admin account. Change it in the Azure settings." } };
      let users = (await store.readUsers()).filter((u) => store.cleanEmail(u.email) !== email);
      if (!q.remove) {
        const password = String(q.password || "");
        if (password.length < 4) return { status: 400, jsonBody: { error: "Choose a password of at least 4 characters." } };
        if (users.length >= 50) return { status: 400, jsonBody: { error: "There are already 50 accounts." } };
        const salt = require("crypto").randomBytes(16).toString("hex");
        users.push({ email, role: q.role === "admin" ? "admin" : "member", salt, hash: store.hashPassword(password, salt) });
      }
      await store.writeUsers(users);
      return { status: 200, jsonBody: { name, role, people: await people() } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
