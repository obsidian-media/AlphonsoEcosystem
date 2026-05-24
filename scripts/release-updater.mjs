import { spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { buildUpdaterManifest } from './updaterReleaseUtils.mjs';
import { deriveUpdaterReleaseContext, publishUpdaterRelease } from './githubReleasePublisher.mjs';

const PROJECT_ROOT = process.cwd();
const TAURI_DIR = join(PROJECT_ROOT, 'src-tauri');
const BUNDLE_NSIS_DIR = join(TAURI_DIR, 'target', 'release', 'bundle', 'nsis');
const RELEASE_DIR = join(PROJECT_ROOT, 'release', 'updater', 'windows-x86_64');

function run(command, args, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      shell: false,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function getNsisArtifact() {
  const conf = readJson(join(TAURI_DIR, 'tauri.conf.json'));
  const productName = conf.productName || 'Alphonso';
  const version = conf.version || '0.1.0';
  const fileName = `${productName}_${version}_x64-setup.exe`;
  const installerPath = join(BUNDLE_NSIS_DIR, fileName);
  const signaturePath = `${installerPath}.sig`;
  if (!existsSync(installerPath)) {
    throw new Error(`Expected NSIS installer not found: ${installerPath}`);
  }
  if (!existsSync(signaturePath)) {
    throw new Error(`Expected updater signature not found: ${signaturePath}`);
  }
  return {
    productName,
    version,
    installerPath,
    signaturePath,
    fileName
  };
}

async function main() {
  const githubRepository = process.env.GITHUB_REPOSITORY || '';
  const githubReleaseTag = process.env.ALPHONSO_UPDATE_TAG || '';
  const baseUrl = process.env.ALPHONSO_UPDATE_BASE_URL || '';
  const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY || '';
  const githubToken = process.env.GITHUB_TOKEN || '';
  const skipBuild = process.argv.includes('--skip-build');
  const tauriConfigPath = join(TAURI_DIR, 'tauri.conf.json');
  const originalTauriConfig = readJson(tauriConfigPath);
  let tauriConfigPatched = false;

  if (!skipBuild && !signingKey.trim()) {
    throw new Error('TAURI_SIGNING_PRIVATE_KEY is required for signed updater builds.');
  }

  const releaseContext = deriveUpdaterReleaseContext({
    version: originalTauriConfig?.version || '0.1.0',
    baseUrl,
    githubRepository,
    githubReleaseTag
  });

  if (!releaseContext.baseUrl) {
    throw new Error('Provide ALPHONSO_UPDATE_BASE_URL or GITHUB_REPOSITORY to build the updater manifest URL.');
  }

  try {
    if (!skipBuild) {
      const patchedConfig = {
        ...originalTauriConfig,
        bundle: {
          ...(originalTauriConfig.bundle || {}),
          createUpdaterArtifacts: true
        }
      };
      writeJson(tauriConfigPath, patchedConfig);
      tauriConfigPatched = true;

      const verify = await run('npm.cmd', ['run', 'verify:app']);
      if (verify.code !== 0) {
        process.exit(verify.code);
      }

      const tauriBuild = await run('npx.cmd', ['tauri', 'build']);
      if (tauriBuild.code !== 0) {
        process.exit(tauriBuild.code);
      }
    }

    const artifact = getNsisArtifact();
    const signature = readFileSync(artifact.signaturePath, 'utf8').trim();
    if (!signature) {
      throw new Error(`Signature file is empty: ${artifact.signaturePath}`);
    }

    mkdirSync(RELEASE_DIR, { recursive: true });
    const outInstaller = join(RELEASE_DIR, artifact.fileName);
    const outSig = `${outInstaller}.sig`;
    const outManifest = join(RELEASE_DIR, 'latest.json');

    copyFileSync(artifact.installerPath, outInstaller);
    copyFileSync(artifact.signaturePath, outSig);

    const manifest = buildUpdaterManifest({
      version: artifact.version,
      baseUrl: releaseContext.baseUrl,
      fileName: basename(outInstaller),
      signature,
      notes: `Alphonso ${artifact.version} release`
    });

    writeFileSync(outManifest, JSON.stringify(manifest, null, 2));

    if (githubToken.trim() && githubRepository.trim()) {
      await publishUpdaterRelease({
        token: githubToken.trim(),
        repository: githubRepository.trim(),
        tag: releaseContext.tag,
        name: `Alphonso ${artifact.version}`,
        body: `Alphonso ${artifact.version} updater artifacts.`,
        assets: [
          { path: outInstaller, contentType: 'application/vnd.microsoft.portable-executable' },
          { path: outSig, contentType: 'text/plain; charset=utf-8' },
          { path: outManifest, contentType: 'application/json; charset=utf-8' }
        ]
      });
    }

    process.stdout.write(`\n[alphonso-release] Updater bundle exported:\n`);
    process.stdout.write(`- Installer: ${outInstaller}\n`);
    process.stdout.write(`- Signature: ${outSig}\n`);
    process.stdout.write(`- Manifest: ${outManifest}\n`);
    process.stdout.write(`- Release tag: ${releaseContext.tag}\n`);
    process.stdout.write(`- Base URL: ${releaseContext.baseUrl}\n`);
  } finally {
    if (tauriConfigPatched) {
      writeJson(tauriConfigPath, originalTauriConfig);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[alphonso-release] Failed: ${String(error)}\n`);
  process.exit(1);
});
