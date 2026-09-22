#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_NAME = 'skill-ffmpeg';
const SOURCE_ROOT = path.resolve(__dirname, '..');
const SKILL_SOURCE = path.join(SOURCE_ROOT, 'skills', SKILL_NAME);
const WORKSPACE_ROOT = process.cwd();
const GLOBAL_TARGET = path.join(os.homedir(), '.claude', 'skills', SKILL_NAME);
const WORKSPACE_TARGET = path.join(WORKSPACE_ROOT, '.claude', 'skills', SKILL_NAME);
const WORKSPACE_SKILLS_ROOT = path.join(WORKSPACE_ROOT, '.claude', 'skills');
const GLOBAL_SKILLS_ROOT = path.join(os.homedir(), '.claude', 'skills');

const INSTALL_COMMANDS = new Set(['install', 'workspace', 'install-workspace', 'check', 'smoke', 'path', 'help']);
const BINARY_COMMANDS = new Set(['which', 'which-ffprobe', 'exec', 'run', 'probe', 'version']);

function expandHome(value) {
  return String(value || '').replace(/^~(?=$|[\\/])/, os.homedir());
}

// ---------------------------------------------------------------------------
// ffmpeg / ffprobe binary resolution (with integrity verification + repair)
// ---------------------------------------------------------------------------
const VERSION_BANNER = /(?:ffmpeg|ffprobe) version/i;

function truthyEnv(value) {
  return value != null && value !== '' && value !== '0'
    && String(value).toLowerCase() !== 'false';
}

// An existence check is not enough: an incomplete/corrupt ffmpeg-static download
// can leave a wrong-sized or non-executable file on disk that fails at launch
// (e.g. Windows "not a valid Win32 application" / EFTYPE). Verify the binary
// actually runs before trusting it.
function isRunnable(binPath) {
  if (!binPath || !fs.existsSync(binPath)) return false;
  const result = spawnSync(binPath, ['-version'], {
    encoding: 'utf8', timeout: 20000, shell: false,
  });
  if (result.error || result.status !== 0) return false;
  return VERSION_BANNER.test(`${result.stdout || ''}${result.stderr || ''}`);
}

function staticModuleInfo(moduleName) {
  try {
    const mod = require(moduleName);
    const binPath = typeof mod === 'string' ? mod : (mod && (mod.path || mod));
    const pkgDir = path.dirname(require.resolve(`${moduleName}/package.json`));
    return { binPath, pkgDir };
  } catch (_) {
    return null;
  }
}

// ffmpeg-static downloads its binary on install via `install.js`, caching the
// download with @derhuerst/http-basic. install.js short-circuits when the binary
// file already exists, and a corrupt cache entry would just be re-copied, so a
// real repair must remove BOTH the binary and that download cache first.
function repairFfmpegStatic(info) {
  if (!info || !info.pkgDir) return false;
  const installJs = path.join(info.pkgDir, 'install.js');
  if (!fs.existsSync(installJs)) return false;
  // install.js short-circuits if the binary file still exists, so it MUST be
  // gone before we re-run it. fs.rmSync({force:true}) has been observed to
  // silently no-op on a file on some Windows setups, so use unlinkSync and, if
  // that fails (e.g. AV/lock), move the corrupt file aside as a fallback.
  if (info.binPath && fs.existsSync(info.binPath)) {
    try {
      fs.unlinkSync(info.binPath);
    } catch (_) {
      try { fs.renameSync(info.binPath, `${info.binPath}.corrupt-${Date.now()}`); }
      catch (_) { return false; }
    }
    if (fs.existsSync(info.binPath)) return false; // could not clear it; bail to fallback
  }
  try {
    const envPaths = require(require.resolve('env-paths', { paths: [info.pkgDir] }));
    const cacheDir = envPaths('ffmpeg-static').cache;
    if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch (_) { /* best-effort cache clear */ }
  // The download can hang on a flaky network, so bound it; otherwise resolution
  // would block indefinitely. Redirect the installer's stdout to our stderr so
  // `which` stdout stays clean.
  const timeoutMs = Number(process.env.FMODE_FFMPEG_REPAIR_TIMEOUT_MS) || 180000;
  const result = spawnSync(process.execPath, [installJs], {
    cwd: info.pkgDir, stdio: ['ignore', 2, 2], shell: false,
    env: process.env, timeout: timeoutMs,
  });
  return !result.error && result.status === 0;
}

function resolveFfmpeg() {
  const envPath = process.env.FFMPEG_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const info = staticModuleInfo('ffmpeg-static');
  if (info && info.binPath) {
    if (isRunnable(info.binPath)) return info.binPath;
    if (!truthyEnv(process.env.FMODE_FFMPEG_NO_REPAIR)) {
      console.error('skill-ffmpeg: bundled ffmpeg failed to launch (corrupt/incomplete download); re-downloading once...');
      if (repairFfmpegStatic(info)) {
        const fresh = staticModuleInfo('ffmpeg-static');
        if (fresh && isRunnable(fresh.binPath)) return fresh.binPath;
      }
      console.error('skill-ffmpeg: bundled ffmpeg still unavailable after re-download. Falling back to system ffmpeg on PATH; set FFMPEG_PATH to a working ffmpeg to override.');
    }
  }
  return 'ffmpeg';
}

function resolveFfprobe() {
  const envPath = process.env.FFPROBE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const info = staticModuleInfo('ffprobe-static');
  if (info && info.binPath) {
    if (isRunnable(info.binPath)) return info.binPath;
    // ffprobe-static ships the binary inside the package (no download step to
    // retry), so a corrupt copy can only be fixed by reinstalling the package.
    console.error('skill-ffmpeg: bundled ffprobe failed to launch (corrupt install). Falling back to system ffprobe on PATH; set FFPROBE_PATH to override, or reinstall skill-ffmpeg.');
  }
  return 'ffprobe';
}

function runBinary(binary, passthrough) {
  const result = spawnSync(binary, passthrough, { stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`skill-ffmpeg: failed to launch ${binary}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status == null ? 1 : result.status);
}

// Everything after the subcommand, dropping a single leading "--" separator.
function passthroughArgs(argv) {
  const rest = argv.slice(1);
  if (rest[0] === '--') return rest.slice(1);
  return rest;
}

// ---------------------------------------------------------------------------
// Skill installer (mirrors fmode-vision)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const first = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'install';
  const args = { command: first, target: GLOBAL_TARGET, smoke: false, force: false, help: false };
  if (first === 'workspace' || first === 'install-workspace') {
    args.command = 'install';
    args.target = WORKSPACE_TARGET;
  }
  for (let i = first === argv[0] ? 1 : 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--target' && argv[i + 1]) args.target = argv[++i];
    else if (token.startsWith('--target=')) args.target = token.slice('--target='.length);
    else if (token === '--workspace') args.target = WORKSPACE_TARGET;
    else if (token === '--global') args.target = GLOBAL_TARGET;
    else if (token === '--smoke') args.smoke = true;
    else if (token === '--force') args.force = true;
    else if (token === '--help' || token === '-h') args.help = true;
  }
  args.target = path.resolve(expandHome(args.target));
  return args;
}

function printHelp() {
  console.log([
    'skill-ffmpeg — bundled ffmpeg/ffprobe runner + Claude Code skill installer',
    '',
    'Run ffmpeg / ffprobe (no system install needed):',
    '  npx skill-ffmpeg@latest which                      # print bundled ffmpeg binary path',
    '  npx skill-ffmpeg@latest which-ffprobe              # print bundled ffprobe binary path',
    '  npx skill-ffmpeg@latest exec -- -i in.mp4 out.mp3  # run ffmpeg with passthrough args',
    '  npx skill-ffmpeg@latest probe -- -show_format in.mp4  # run ffprobe with passthrough args',
    '  npx skill-ffmpeg@latest version                    # print ffmpeg -version',
    '',
    'Install the Claude Code skill:',
    '  npx skill-ffmpeg@latest workspace [--smoke]   # install into ./.claude/skills/skill-ffmpeg',
    '  npx skill-ffmpeg@latest install [--smoke]     # install into ~/.claude/skills/skill-ffmpeg',
    '  npx skill-ffmpeg@latest install --target <dir> [--force]',
    '  npx skill-ffmpeg@latest check',
    '  npx skill-ffmpeg@latest smoke',
    '  npx skill-ffmpeg@latest path',
    '',
    'Options:',
    '  --workspace      Install into ./.claude/skills/skill-ffmpeg',
    '  --global         Install into ~/.claude/skills/skill-ffmpeg (default)',
    '  --target <dir>   Install into a custom directory',
    '  --force          Allow overwriting a custom target',
    '  --smoke          Run smoke checks after install',
    '  --help, -h       Show help'
  ].join('\n'));
}

function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }

function isInside(parentDir, childDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childDir));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function canOverwriteTarget(targetDir, force) {
  return force
    || path.resolve(targetDir) === path.resolve(GLOBAL_TARGET)
    || isInside(WORKSPACE_SKILLS_ROOT, targetDir)
    || isInside(GLOBAL_SKILLS_ROOT, targetDir);
}

function copyDirRecursive(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(destination);
    for (const child of fs.readdirSync(source)) {
      if (child === 'node_modules' || child === 'outputs' || child === '.git') continue;
      copyDirRecursive(path.join(source, child), path.join(destination, child));
    }
    return;
  }
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function installSkill(target, force) {
  if (!fs.existsSync(SKILL_SOURCE)) {
    throw new Error(`Skill source missing: ${SKILL_SOURCE}`);
  }
  if (fs.existsSync(target)) {
    if (!canOverwriteTarget(target, force)) {
      throw new Error(`Refusing to overwrite custom target without --force: ${target}`);
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
  ensureDir(target);
  copyDirRecursive(SKILL_SOURCE, target);
}

function checkSkill(target) {
  const required = ['SKILL.md', 'scripts/ffmpeg-runner.mjs'];
  const missing = required.filter(entry => !fs.existsSync(path.join(target, entry)));
  if (missing.length) {
    throw new Error(`Install target is missing required files: ${missing.join(', ')}`);
  }
  return { status: 'ok', skill: SKILL_NAME, target, required };
}

function runSmoke() {
  const result = spawnSync(process.execPath, ['scripts/smoke.js'], { cwd: SOURCE_ROOT, stdio: 'inherit', shell: false });
  if (result.status !== 0) throw new Error('smoke failed');
}

function printNextSteps(target) {
  const workspaceMode = isInside(WORKSPACE_SKILLS_ROOT, target);
  console.log('');
  console.log('Install complete.');
  console.log(`Skill installed at: ${target}`);
  console.log('');
  if (workspaceMode) {
    console.log('Project-level skill is ready. Restart the VSCode Claude Code session if it was open.');
  } else {
    console.log('User-level skill is ready for all Claude Code workspaces.');
  }
  console.log('');
  console.log('ffmpeg is bundled (ffmpeg-static); no system install needed.');
  console.log('Try this prompt in Claude Code:');
  console.log('  把 input.mp4 转成 16kHz 单声道 wav 音频。');
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'install';

  // Binary passthrough commands (handled before the installer arg parser).
  if (BINARY_COMMANDS.has(command)) {
    if (command === 'which') { console.log(resolveFfmpeg()); return; }
    if (command === 'which-ffprobe') { console.log(resolveFfprobe()); return; }
    if (command === 'version') { runBinary(resolveFfmpeg(), ['-version']); return; }
    if (command === 'exec' || command === 'run') { runBinary(resolveFfmpeg(), passthroughArgs(argv)); return; }
    if (command === 'probe') { runBinary(resolveFfprobe(), passthroughArgs(argv)); return; }
  }

  const args = parseArgs(argv);
  if (args.help || args.command === 'help') { printHelp(); return; }
  if (args.command === 'path') { console.log(args.target); return; }
  if (args.command === 'install') {
    installSkill(args.target, args.force);
    console.log(JSON.stringify(checkSkill(args.target), null, 2));
    if (args.smoke) runSmoke();
    printNextSteps(args.target);
    return;
  }
  if (args.command === 'check') { console.log(JSON.stringify(checkSkill(args.target), null, 2)); return; }
  if (args.command === 'smoke') { runSmoke(); return; }
  printHelp();
  process.exitCode = 1;
}

try { main(); }
catch (error) { console.error(`skill-ffmpeg failed: ${error.message}`); process.exit(1); }
