import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fingerprintFile = join(projectRoot, "webapp", ".source-fingerprint");
const buildInputs = [
  "app",
  "components",
  "hooks",
  "lib",
  "public",
  "vendor",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "tsconfig.json",
];

function filesUnder(target) {
  if (!existsSync(target)) return [];
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => filesUnder(join(target, entry.name)));
}

export function sourceFingerprint() {
  const hash = createHash("sha256");
  const files = buildInputs.flatMap((input) => filesUnder(join(projectRoot, input))).sort();
  for (const file of files) {
    hash.update(relative(projectRoot, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function writeWebBuildFingerprint() {
  writeFileSync(fingerprintFile, `${sourceFingerprint()}\n`, "utf8");
}

export function verifyWebBuildFingerprint() {
  if (!existsSync(fingerprintFile)) {
    throw new Error("缺少正式版构建产物，请先运行 npm run build:web");
  }
  const built = readFileSync(fingerprintFile, "utf8").trim();
  const current = sourceFingerprint();
  if (built !== current) {
    throw new Error("正式版构建产物与当前源码不一致，请重新运行 npm run build:web");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    verifyWebBuildFingerprint();
    console.log("[verify:web-build] 构建产物与当前源码一致");
  } catch (error) {
    console.error(`[verify:web-build] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
