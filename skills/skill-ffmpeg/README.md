# skill-ffmpeg (skill)

Claude Code skill that runs **ffmpeg / ffprobe** via a bundled static binary
(`ffmpeg-static` / `ffprobe-static`) — no system ffmpeg install required.

See `SKILL.md` for the full skill definition and recipes. The helper module
`scripts/ffmpeg-runner.mjs` exposes `ffmpegPath()`, `ffprobePath()`,
`runFfmpeg()`, `probeMedia()`, and `probeDurationMs()`.

Resolution order for the binaries: `FFMPEG_PATH` / `FFPROBE_PATH` env var →
`npx --yes skill-ffmpeg which` (bundled static binary) → `ffmpeg` / `ffprobe`
on `PATH`.
