#!/usr/bin/env node
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
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'skills', 'skill-ffmpeg');
const BIN = path.join(ROOT, 'bin', 'skill-ffmpeg.js');

function fail(msg) { console.error('SMOKE FAIL: ' + msg); process.exit(1); }

const required = [
  'SKILL.md',
  'scripts/ffmpeg-runner.mjs'
];
for (const rel of required) {
  if (!fs.existsSync(path.join(SKILL_DIR, rel))) fail('missing ' + rel);
}

(async () => {
  // 1. skill runner module exports
  const mod = await import(pathToFileURL(path.join(SKILL_DIR, 'scripts', 'ffmpeg-runner.mjs')).href);
  for (const fn of ['ffmpegPath', 'ffprobePath', 'runFfmpeg', 'probeMedia', 'probeDurationMs']) {
    if (typeof mod[fn] !== 'function') fail('export ' + fn + ' is not a function');
  }

  // 2. bundled ffmpeg binary resolves and runs
  const which = spawnSync(process.execPath, [BIN, 'which'], { encoding: 'utf8' });
  if (which.status !== 0) fail('`skill-ffmpeg which` exited ' + which.status);
  const ffmpegBin = (which.stdout || '').trim();
  if (!ffmpegBin || !fs.existsSync(ffmpegBin)) fail('ffmpeg binary not resolved: ' + ffmpegBin);

  const version = spawnSync(ffmpegBin, ['-version'], { encoding: 'utf8' });
  if (version.status !== 0 || !/ffmpeg version/i.test(version.stdout || '')) {
    fail('ffmpeg -version did not run');
  }

  // 3. bundled ffprobe binary resolves
  const whichProbe = spawnSync(process.execPath, [BIN, 'which-ffprobe'], { encoding: 'utf8' });
  if (whichProbe.status !== 0) fail('`skill-ffmpeg which-ffprobe` exited ' + whichProbe.status);
  const ffprobeBin = (whichProbe.stdout || '').trim();
  if (!ffprobeBin || !fs.existsSync(ffprobeBin)) fail('ffprobe binary not resolved: ' + ffprobeBin);

  const probeVersion = spawnSync(ffprobeBin, ['-version'], { encoding: 'utf8' });
  if (probeVersion.status !== 0 || !/ffprobe version/i.test(probeVersion.stdout || '')) {
    fail('ffprobe -version did not run');
  }

  console.log('SMOKE OK: skill-ffmpeg structure + bundled ffmpeg/ffprobe verified');
  console.log('  ffmpeg : ' + ffmpegBin);
  console.log('  ffprobe: ' + ffprobeBin);
})().catch(e => fail(e.message));
