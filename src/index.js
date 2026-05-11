const core = require("@actions/core");
const fs = require("fs");
const { createWriteStream, unlinkSync, existsSync } = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const util = require("util");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const asyncExec = util.promisify(exec);

const tempDir = os.tmpdir();

const certificateFileName = path.join(tempDir, "cert.pem");
const signtool = path.join(tempDir, "signtool.exe");
const credentialsFileName = path.join(tempDir, "creds.json");
const toSignFileName = path.join(tempDir, "tosign.txt");

const signtoolFileExtensions = [
  ".dll", ".exe", ".sys", ".vxd",
  ".msix", ".msixbundle", ".appx",
  ".appxbundle", ".msi", ".msp",
  ".msm", ".cab", ".ps1", ".psm1"
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function backoff(i) {
  return Math.min(1000 * 2 ** i, 15000) + Math.random() * 250;
}

async function retry(fn, attempts = 5) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const wait = backoff(i);
      console.log(`Retry ${i + 1}/${attempts} in ${wait.toFixed(0)}ms`);
      await sleep(wait);
    }
  }
  throw last;
}

async function createCertificate() {
  const b64 = core.getInput("certificate");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) return false;
  await fs.promises.writeFile(certificateFileName, buf);
  return true;
}

async function createCredentials() {
  const b64 = core.getInput("credentials");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) return false;
  await fs.promises.writeFile(credentialsFileName, buf);
  return true;
}

async function downloadTool() {
  if (existsSync(signtool)) return;

  console.log("Downloading SignTool...");

  await retry(async () => {
    const res = await fetch(
      "https://github.com/nextgens/CloudSignTool/releases/download/1.0.0/SignTool.exe"
    );

    if (!res.ok || !res.body) {
      throw new Error(`Download failed ${res.status}`);
    }

    await pipeline(
      Readable.fromWeb(res.body),
      createWriteStream(signtool)
    );
  });
}

async function sign() {
  let options = "";

  const ts = core.getInput("timestamp-url");
  if (ts) options += ` -tr "${ts}"`;

  const desc = core.getInput("description");
  if (desc) options += ` -d "${desc}"`;

  const descUrl = core.getInput("description-url");
  if (descUrl) options += ` -du "${descUrl}"`;

  options += core.getInput("page-hash") === "true" ? " -ph" : " -nph";

  const cmd =
    `"${signtool}" sign ` +
    `-kac "${credentialsFileName}" ` +
    `-ac "${certificateFileName}" ` +
    `${options} ` +
    `-k "${core.getInput("key-uri")}" ` +
    `-ifl "${toSignFileName}"`;

  console.log("Signing...");
  const { stdout } = await asyncExec(cmd);
  console.log(stdout);
}

async function* getFiles(folder, recursive) {
  const files = await fs.promises.readdir(folder);

  for (const file of files) {
    const full = path.join(folder, file);
    const stat = await fs.promises.stat(full);

    if (stat.isFile()) {
      if (signtoolFileExtensions.includes(path.extname(file))) {
        yield full;
      }
    } else if (recursive) {
      yield* getFiles(full, recursive);
    }
  }
}

async function signFiles() {
  const folder = core.getInput("folder", { required: true });
  const recursive = core.getInput("recursive") === "true";

  const files = [];

  for await (const f of getFiles(folder, recursive)) {
    console.log(f);
    files.push(f);
  }

  if (!files.length) return;

  await fs.promises.writeFile(toSignFileName, files.join("\r\n"));

  await retry(sign, 6);
}

async function run() {
  try {
    await createCredentials();
    await downloadTool();

    if (await createCertificate()) {
      await signFiles();
    }
  } catch (e) {
    core.setFailed(e?.stack || e?.message || String(e));
  } finally {
    try {
      unlinkSync(credentialsFileName);
    } catch {}
  }
}

run();
