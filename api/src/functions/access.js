const { app } = require("@azure/functions");
const store = require("../shared");

// GET: who am I and what may I do. Admins also get the list of people.
// PUT (admins only): replace the list of admins and members.
app.http("access", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "access",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    try {
      const name = store.nameOf(user);
      const role = await store.roleOf(user);
      if (request.method === "GET") {
        const body = { name, role };
        if (role === "admin") Object.assign(body, await store.readAccess());
        return { status: 200, jsonBody: body, headers: { "cache-control": "no-store" } };
      }
      if (role !== "admin") return { status: 403, jsonBody: { error: "Only an admin can change who has access." } };
      let wanted;
      try { wanted = JSON.parse(await request.text()); } catch (e) { return { status: 400, jsonBody: { error: "Not valid JSON." } }; }
      const admins = store.cleanList(wanted && wanted.admins);
      if (!admins.includes(name)) admins.unshift(name);           // an admin cannot remove themselves
      const members = store.cleanList(wanted && wanted.members).filter((m) => !admins.includes(m));
      await store.writeAccess({ admins, members });
      return { status: 200, jsonBody: { name, role: "admin", admins, members } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "Storage is not reachable. Check the STORAGE_CONNECTION setting and the training container." } };
    }
  }
});
