const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "training";

const crypto = require("crypto");

// ---- sign-in: the app's own accounts ----
// A signed session token travels in the x-lip-session header. It names the email it was issued to
// and when it expires, and is signed with SESSION_SECRET so it cannot be forged or altered.
const SESSION_DAYS = 30;

function configured() {
  return Boolean(process.env.SESSION_SECRET && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
}

function sign(payload) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(payload).digest("base64url");
}

function makeToken(email) {
  const payload = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 })).toString("base64url");
  return payload + "." + sign(payload);
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Who the request comes from, or null. Only checks the token; roleOf() checks the account still exists.
function principal(request) {
  if (!process.env.SESSION_SECRET) return null;
  const token = request.headers.get("x-lip-session") || "";
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  if (!same(sign(payload), token.slice(dot + 1))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!p || typeof p.e !== "string" || !(p.x > Date.now())) return null;
    return { email: p.e, userDetails: p.e };
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

// ---- accounts ----
// The admin account comes from the ADMIN_EMAIL and ADMIN_PASSWORD settings.
// Everyone else is in users.json as { email, role, salt, hash }, created by an admin.
const USERS = "shared/users.json";

function nameOf(user) {
  return String((user && (user.email || user.userDetails)) || "").trim().toLowerCase();
}

function cleanEmail(s) {
  return String(s || "").trim().toLowerCase().slice(0, 200);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

async function readUsers() {
  const text = await getJson(USERS);
  if (text === null) return [];
  try {
    const list = JSON.parse(text).users;
    return (Array.isArray(list) ? list : []).filter((u) => u && typeof u.email === "string" && u.salt && u.hash);
  } catch (e) {
    return [];
  }
}

async function writeUsers(users) {
  await putJson(USERS, JSON.stringify({ users }));
}

function isEnvAdmin(email) {
  return Boolean(process.env.ADMIN_EMAIL) && cleanEmail(process.env.ADMIN_EMAIL) === cleanEmail(email);
}

// Returns "admin", "member" or "" for a signed-in user. An account removed by the admin gets "".
async function roleOf(user) {
  const email = nameOf(user);
  if (!email) return "";
  if (isEnvAdmin(email)) return "admin";
  const found = (await readUsers()).find((u) => cleanEmail(u.email) === email);
  return found ? (found.role === "admin" ? "admin" : "member") : "";
}

// Checks an email and password. Returns the role, or "" when they do not match.
async function checkLogin(email, password) {
  email = cleanEmail(email);
  if (!email || !password) return "";
  if (isEnvAdmin(email)) return same(password, process.env.ADMIN_PASSWORD || "") ? "admin" : "";
  const found = (await readUsers()).find((u) => cleanEmail(u.email) === email);
  if (!found) return "";
  return same(hashPassword(password, found.salt), found.hash) ? (found.role === "admin" ? "admin" : "member") : "";
}

async function refusal(user) {
  return { status: 403, jsonBody: { error: `The account ${nameOf(user) || "(unknown)"} no longer has access. Ask the admin.` } };
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

module.exports = { principal, safe, putJson, getJson, nameOf, roleOf, clipSummary, refusal, configured, makeToken, checkLogin, readUsers, writeUsers, cleanEmail, hashPassword, isEnvAdmin };
