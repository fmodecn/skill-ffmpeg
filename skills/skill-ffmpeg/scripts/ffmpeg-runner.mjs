// Copyright (c) 未来飞马
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Trademark Notice:
// The MPL-2.0 license grants copyright permissions for source code only.
// It does NOT grant any rights to use trademarks including "未来飞马",
// "Harness Loop", "RSI", and associated slogan "让AI进化提前发生，让AI落地快人一步".
// Any use of these trademarks requires separate written permission.
// skill-ffmpeg runner — resolve and invoke the bundled ffmpeg/ffprobe binaries.
//
// The skill directory is copied into .claude/skills/ WITHOUT node_modules, so we
// never `import 'ffmpeg-static'` directly. Instead we shell out to the published
// package via `npx --yes skill-ffmpeg ...`, which resolves the platform binary
// from the package's own dependencies. Resolved paths are cached per process.
//
// You can override resolution with the FFMPEG_PATH / FFPROBE_PATH env vars, which
// is also the fast path when ffmpeg is already on the machine.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const NPX_PKG = 'skill-ffmpeg@latest';
let _ffmpeg = null;
let _ffprobe = null;

function npxResolve(subcommand) {
  const res = spawnSync('npx', ['--yes', NPX_PKG, subcommand], { encoding: 'utf8' });
  if (res.status === 0) {
    const out = (res.stdout || '').trim().split('\n').pop().trim();
    if (out && existsSync(out)) return out;
  }
  return null;
}

/** Absolute path to a usable ffmpeg binary. Falls back to "ffmpeg" on PATH. */
export function ffmpegPath() {
  if (_ffmpeg) return _ffmpeg;
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return (_ffmpeg = process.env.FFMPEG_PATH);
  }
  return (_ffmpeg = npxResolve('which') || 'ffmpeg');
}

/** Absolute path to a usable ffprobe binary. Falls back to "ffprobe" on PATH. */
export function ffprobePath() {
  if (_ffprobe) return _ffprobe;
  if (process.env.FFPROBE_PATH && existsSync(process.env.FFPROBE_PATH)) {
    return (_ffprobe = process.env.FFPROBE_PATH);
  }
  return (_ffprobe = npxResolve('which-ffprobe') || 'ffprobe');
}

/**
 * Run ffmpeg with the given argument array. Resolves with
 * { code, stdout, stderr }. Does not throw on non-zero exit; inspect `code`.
 */
export function runFfmpeg(args, { inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, inherit ? { stdio: 'inherit' } : {});
    let stdout = '';
    let stderr = '';
    if (!inherit) {
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
    }
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

/** Run ffprobe and parse JSON output (`-of json` is added automatically). */
export async function probeMedia(input, extraArgs = []) {
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', ...extraArgs, input];
  const res = await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath(), args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  if (res.code !== 0) throw new Error('ffprobe failed: ' + res.stderr);
  return JSON.parse(res.stdout);
}

/** Convenience: media duration in milliseconds (rounded), or null if unknown. */
export async function probeDurationMs(input) {
  const info = await probeMedia(input);
  const secs = info && info.format && info.format.duration ? parseFloat(info.format.duration) : NaN;
  return Number.isFinite(secs) ? Math.round(secs * 1000) : null;
}
