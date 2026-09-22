# skill-ffmpeg

Claude Code skill + CLI that runs **ffmpeg / ffprobe** through a bundled static
binary (`ffmpeg-static` / `ffprobe-static`). No system ffmpeg install required.

## Run ffmpeg / ffprobe directly

```bash
# print the bundled binary paths
npx skill-ffmpeg@latest which
npx skill-ffmpeg@latest which-ffprobe

# run ffmpeg (everything after `--` is passed through)
npx skill-ffmpeg@latest exec -- -y -i input.mp4 -ar 16000 -ac 1 out.wav

# run ffprobe
npx skill-ffmpeg@latest probe -- -v quiet -print_format json -show_format input.mp4

# ffmpeg -version
npx skill-ffmpeg@latest version
```

## Install the Claude Code skill

```bash
# project-level → ./.claude/skills/skill-ffmpeg
npx skill-ffmpeg@latest workspace

# user-level → ~/.claude/skills/skill-ffmpeg
npx skill-ffmpeg@latest install
```

Then prompt Claude Code, e.g. `把 input.mp4 转成 16kHz 单声道 wav 音频。`

## Binary resolution order

1. `FFMPEG_PATH` / `FFPROBE_PATH` environment variable (if the file exists)
2. bundled static binary (`ffmpeg-static` / `ffprobe-static`)
3. `ffmpeg` / `ffprobe` on `PATH`

The bundled binary is **verified before use** (it is actually launched with
`-version`). If `ffmpeg-static`'s download was incomplete/corrupt, `skill-ffmpeg`
deletes it, clears the download cache, re-downloads once, and re-verifies; if it
still won't run it falls back to system `ffmpeg`/`FFMPEG_PATH` with a clear hint.

- `FMODE_FFMPEG_NO_REPAIR=1` — skip the auto re-download (fail fast to fallback).
- `FMODE_FFMPEG_REPAIR_TIMEOUT_MS` — bound the re-download (default `180000`).

### Windows / antivirus note

If you see `not a valid Win32 application` / `EFTYPE`, or the binary "works once
then stops", antivirus (e.g. Windows Defender) may be quarantining or altering
the downloaded `ffmpeg.exe`. The most reliable fix is to install ffmpeg yourself
(or whitelist it) and point **`FFMPEG_PATH`** (and `FFPROBE_PATH`) at it — that
path takes priority and skips the bundled download entirely.

## Commands

| Command | Description |
|---------|-------------|
| `which` / `which-ffprobe` | print resolved binary path |
| `exec -- <args>` / `run -- <args>` | run ffmpeg with passthrough args |
| `probe -- <args>` | run ffprobe with passthrough args |
| `version` | `ffmpeg -version` |
| `workspace` / `install` | install the Claude Code skill |
| `check` / `smoke` / `path` | verify install / run smoke test / print target |

## License

MIT
