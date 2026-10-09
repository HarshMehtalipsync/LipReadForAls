const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "training";

// Static Web Apps passes the signed-in user in this header.
function principal(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;
  try {
    const p = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (!p || !p.userId || !(p.userRoles || []).includes("authenticated")) return null;
    return p;
  } catch (e) {
    return null;
  }
}

function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function container() {
  const cs = process.env.STORAGE_CONNECTION;
  if (!cs) throw new Error("STORAGE_CONNECTION is not set");
  return BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER);
}

async function putJson(path, text) {
  const blob = container().getBlockBlobClient(path);
  await blob.upload(text, Buffer.byteLength(text), { blobHTTPHeaders: { blobContentType: "application/json" } });
}

async function getJson(path) {
  const blob = container().getBlockBlobClient(path);
  if (!(await blob.exists())) return null;
  return (await blob.downloadToBuffer()).toString("utf8");
}

// ---- who may use the shared training store ----
// access.json holds { admins: [...], members: [...] } as lower-case sign-in names
// (the email for a Microsoft account, the username for GitHub).
// The first person to sign in after setup becomes the admin.
const ACCESS = "shared/access.json";

function nameOf(user) {
  return String(user.userDetails || "").trim().toLowerCase();
}

function cleanList(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const n = String(x || "").trim().toLowerCase().slice(0, 200);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 50);
}

async function readAccess() {
  const text = await getJson(ACCESS);
  if (text === null) return null;
  try {
    const a = JSON.parse(text);
    return { admins: cleanList(a.admins), members: cleanList(a.members) };
  } catch (e) {
    return { admins: [], members: [] };
  }
}

async function writeAccess(access) {
  await putJson(ACCESS, JSON.stringify({ admins: cleanList(access.admins), members: cleanList(access.members) }));
}

// Returns "admin", "member" or "" for the signed-in user. Claims admin if nobody has yet.
async function roleOf(user) {
  const name = nameOf(user);
  if (!name) return "";
  let access = await readAccess();
  if (access === null || access.admins.length === 0) {
    access = { admins: [name], members: access ? access.members : [] };
    await writeAccess(access);
    return "admin";
  }
  if (access.admins.includes(name)) return "admin";
  if (access.members.includes(name)) return "member";
  return "";
}

// The refusal message says what the server saw, so a mismatch can be diagnosed from the page.
async function refusal(user) {
  const name = nameOf(user);
  let seen = "no access list was found";
  try {
    const a = await readAccess();
    if (a) seen = `the list has ${a.admins.length} admin(s) and ${a.members.length} member(s)`;
  } catch (e) {
    seen = "the access list could not be read";
  }
  return {
    status: 403,
    jsonBody: {
      error: `This account is not on the access list. The server sees this sign-in as "${name || "(no name)"}" via ${user.identityProvider || "unknown provider"}, and ${seen}.`
    }
  };
}

// Count the stored face-point clips, for the storage check on the Training page.
async function clipSummary() {
  let count = 0, bytes = 0, newest = null;
  for await (const b of container().listBlobsFlat({ prefix: "shared/clips/" })) {
    count++;
    bytes += (b.properties && b.properties.contentLength) || 0;
    const when = b.properties && b.properties.lastModified;
    if (when && (!newest || when > newest)) newest = when;
  }
  return { count, bytes, newest: newest ? new Date(newest).toISOString() : null };
}

module.exports = { principal, safe, putJson, getJson, nameOf, cleanList, readAccess, writeAccess, roleOf, clipSummary, refusal };
