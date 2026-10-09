const { app } = require("@azure/functions");

// Reports whether the API is running and whether the storage setting has been added.
app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => ({
    jsonBody: { ok: true, storageConfigured: Boolean(process.env.STORAGE_CONNECTION) }
  })
});
