const { BlobServiceClient } = require("@azure/storage-blob");

const CONTAINER = "training";

// Static Web Apps passes the signed-in user in this header. Each user only ever
// reads and writes blobs under their own id, so one family's data is not visible to another.
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

module.exports = { principal, safe, putJson, getJson };
