const { app } = require("@azure/functions");
const store = require("../shared");

// Turns a Gujarati sentence into speech with Azure Speech, so the voice does not depend on
// what the phone has installed. Needs SPEECH_KEY and SPEECH_REGION set on the Static Web App.
// Optional SPEECH_VOICE (default gu-IN-DhwaniNeural).
function xml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

app.http("speak", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "speak",
  handler: async (request, context) => {
    const user = store.principal(request);
    if (!user) return { status: 401, jsonBody: { error: "Sign in first." } };
    const key = process.env.SPEECH_KEY, region = process.env.SPEECH_REGION;
    if (!key || !region) return { status: 501, jsonBody: { error: "The cloud voice is not set up." } };
    try {
      if (!(await store.roleOf(user))) return await store.refusal(user);
      let text = "";
      try { text = String((JSON.parse(await request.text()) || {}).text || "").trim(); } catch (e) { /* handled below */ }
      if (!text || text.length > 300) return { status: 400, jsonBody: { error: "Send a sentence of up to 300 characters." } };
      const voice = process.env.SPEECH_VOICE || "gu-IN-DhwaniNeural";
      const ssml = `<speak version="1.0" xml:lang="gu-IN"><voice name="${xml(voice)}"><prosody rate="-8%">${xml(text)}</prosody></voice></speak>`;
      const r = await fetch(`https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "lipcue"
        },
        body: ssml
      });
      if (!r.ok) {
        context.error(`Speech service answered ${r.status}`);
        return { status: 502, jsonBody: { error: `The speech service answered with error ${r.status}. Check SPEECH_KEY, SPEECH_REGION and the voice name.` } };
      }
      return { status: 200, body: Buffer.from(await r.arrayBuffer()), headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } };
    } catch (e) {
      context.error(e);
      return { status: 500, jsonBody: { error: "The cloud voice could not be reached." } };
    }
  }
});
