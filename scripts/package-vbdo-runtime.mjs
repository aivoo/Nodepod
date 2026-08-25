#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function git(...args) {
  return run("git", args);
}

function hashFile(filePath, algorithm) {
  return createHash(algorithm).update(readFileSync(filePath)).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);
const sourceTag = readArgument("--tag", process.env.GITHUB_REF_NAME);
const upstreamRef = readArgument("--upstream-ref", "upstream/main");
const outputDirectory = resolve(
  repositoryRoot,
  readArgument("--output-dir", "release"),
);

if (!sourceTag) {
  throw new Error("A source tag is required via --tag or GITHUB_REF_NAME");
}

const expectedTag = new RegExp(
  `^vbdo-nodepod-${escapeRegExp(packageJson.version)}\\.[1-9][0-9]*$`,
);
if (!expectedTag.test(sourceTag)) {
  throw new Error(
    `Tag ${sourceTag} must match vbdo-nodepod-${packageJson.version}.<revision>`,
  );
}

const outputRelativePath = relative(repositoryRoot, outputDirectory);
if (
  outputRelativePath === "" ||
  outputRelativePath === ".." ||
  outputRelativePath.startsWith(`..${sep}`)
) {
  throw new Error("Output directory must be a child of the repository root");
}

const patchedCommit = git("rev-parse", "HEAD");
const taggedCommit = git("rev-list", "-n", "1", sourceTag);
if (taggedCommit !== patchedCommit) {
  throw new Error(
    `Tag ${sourceTag} points to ${taggedCommit}, but HEAD is ${patchedCommit}`,
  );
}

const upstreamCommit = git("merge-base", patchedCommit, upstreamRef);
execFileSync("git", ["merge-base", "--is-ancestor", upstreamCommit, patchedCommit], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
run(pnpm, ["pack", "--pack-destination", outputDirectory]);

const packedFiles = readdirSync(outputDirectory).filter((file) =>
  file.endsWith(".tgz"),
);
if (packedFiles.length !== 1) {
  throw new Error(`Expected one package archive, found ${packedFiles.length}`);
}

const shortCommit = patchedCommit.slice(0, 7);
const artifactName = `scelar-nodepod-${packageJson.version}-${shortCommit}.tgz`;
const artifactPath = resolve(outputDirectory, artifactName);
renameSync(resolve(outputDirectory, packedFiles[0]), artifactPath);

const manifest = {
  schemaVersion: 1,
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  runtimeRevision: `${packageJson.version}-${shortCommit}`,
  artifact: artifactName,
  size: statSync(artifactPath).size,
  sha256: hashFile(artifactPath, "sha256"),
  sha512: hashFile(artifactPath, "sha512"),
  source: {
    upstreamRepository: "https://github.com/R1ck404/Nodepod",
    upstreamCommit,
    forkRepository: "https://github.com/aivoo/Nodepod",
    patchedCommit,
    tag: sourceTag,
    release: `https://github.com/aivoo/Nodepod/releases/tag/${sourceTag}`,
  },
  license: packageJson.license,
};

const manifestPath = resolve(outputDirectory, "nodepod-runtime.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(resolve(repositoryRoot, "LICENSE"), resolve(outputDirectory, "LICENSE"));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `artifact=${artifactName}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `runtime_revision=${manifest.runtimeRevision}\n`);
}

console.log(JSON.stringify(manifest, null, 2));
