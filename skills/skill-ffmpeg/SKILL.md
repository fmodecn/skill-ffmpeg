---
name: skill-ffmpeg
description: "使用内置的静态 ffmpeg/ffprobe 二进制处理音视频，无需系统安装 ffmpeg。适用场景：(1) 音视频格式转换/转码, (2) 提取音轨用于转写/识别, (3) 抽取视频帧, (4) 裁剪/拼接/压缩, (5) 用 ffprobe 探测时长、码率、流信息"
description_en: "Process audio & video with a bundled static ffmpeg/ffprobe binary (no system install). Use for: (1) format conversion/transcoding, (2) extracting audio tracks for transcription, (3) extracting video frames, (4) trimming/concatenating/compressing, (5) probing duration/bitrate/stream info with ffprobe"
---

# Fmode FFmpeg — 音视频处理技能

## Overview

本技能内置跨平台静态 `ffmpeg` 与 `ffprobe` 二进制（来自 npm `ffmpeg-static` /
`ffprobe-static`），**无需用户预先安装 ffmpeg**。用户可能要求你转码、提取音轨、
抽帧、裁剪、压缩，或读取媒体文件的时长/分辨率/码率等信息。

> 与 `fmode-listen`（音频转写计费网关）配合：先用本技能把视频/任意音频统一转成
> 16kHz 单声道 wav，再交给转写网关，能显著降低体积并提高识别稳定性。

## 二进制获取（关键）

技能目录被复制进 `.claude/skills/` 时**不包含 node_modules**，所以不要直接
`import 'ffmpeg-static'`。统一通过 `npx skill-ffmpeg` 解析/调用二进制：

| 需求 | 命令 |
|------|------|
| 拿到 ffmpeg 路径 | `npx --yes skill-ffmpeg which` |
| 拿到 ffprobe 路径 | `npx --yes skill-ffmpeg which-ffprobe` |
| 直接跑 ffmpeg | `npx --yes skill-ffmpeg exec -- <ffmpeg 参数>` |
| 直接跑 ffprobe | `npx --yes skill-ffmpeg probe -- <ffprobe 参数>` |
| 查看版本 | `npx --yes skill-ffmpeg version` |

> 注意 `exec` / `probe` 后必须加 `--`，其后的参数会原样透传给二进制。
> 如机器上已装 ffmpeg，可设环境变量 `FFMPEG_PATH` / `FFPROBE_PATH` 直接复用。

也可在 Node 脚本里用本技能的 `scripts/ffmpeg-runner.mjs`：

```js
import { runFfmpeg, probeMedia, probeDurationMs } from './scripts/ffmpeg-runner.mjs';

// 转码：把 mp4 转成 16kHz 单声道 wav
await runFfmpeg(['-y', '-i', 'input.mp4', '-ar', '16000', '-ac', '1', 'out.wav'], { inherit: true });

// 探测：拿到完整 ffprobe JSON
const info = await probeMedia('input.mp4');

// 便捷：拿到时长（毫秒）
const ms = await probeDurationMs('input.mp4');
```

## 常用配方（直接用 CLI）

### 提取音轨为 16kHz 单声道 wav（转写前处理）
```bash
npx --yes skill-ffmpeg exec -- -y -i input.mp4 -vn -ar 16000 -ac 1 -c:a pcm_s16le out.wav
```

### 转 mp3（128k）
```bash
npx --yes skill-ffmpeg exec -- -y -i input.wav -b:a 128k out.mp3
```

### 抽取关键帧（每秒 1 张）
```bash
npx --yes skill-ffmpeg exec -- -y -i input.mp4 -vf fps=1 frame_%04d.jpg
```

### 抽取指定时间点单帧
```bash
npx --yes skill-ffmpeg exec -- -y -ss 00:00:05 -i input.mp4 -frames:v 1 frame.jpg
```

### 裁剪片段（从 10s 起 30s）
```bash
npx --yes skill-ffmpeg exec -- -y -ss 10 -i input.mp4 -t 30 -c copy clip.mp4
```

### 压缩视频（H.264 CRF 28）
```bash
npx --yes skill-ffmpeg exec -- -y -i input.mp4 -c:v libx264 -crf 28 -preset veryfast -c:a aac smaller.mp4
```

### 探测时长 / 流信息
```bash
npx --yes skill-ffmpeg probe -- -v quiet -print_format json -show_format -show_streams input.mp4
```

## 工作流建议

```
拿到媒体文件
├── 先 probe 拿到时长/分辨率/编码 → 决定处理参数
├── 需要转写音频？ → 提取 16kHz 单声道 wav → 交给 fmode-listen
├── 需要画面分析？ → 抽帧 jpg → 交给 fmode-vision
└── 仅转码/裁剪/压缩 → 单条 exec 完成
```

## 注意事项

- 始终带 `-y` 避免覆盖确认卡住非交互流程。
- 大文件转码耗时长，必要时用 `-ss/-t` 先取片段验证参数。
- 路径含空格时在 shell 里加引号；透传参数按 ffmpeg 原生语法书写。
- 输出体积/质量权衡：音频转写场景用 `-ar 16000 -ac 1` 足够且最省。

## 二进制损坏 / 杀软干扰排查（Windows 常见）

`skill-ffmpeg` 在使用前会**真跑 `-version` 校验**内置二进制；若 `ffmpeg-static`
下载不完整/损坏，会自动删除、清缓存、重下一次再校验，仍失败则回退系统 ffmpeg。

如果遇到 `不是有效的 Win32 应用程序` / `EFTYPE`，或二进制「刚下好能跑、过会儿又
跑不了」，多半是 **杀毒软件（如 Windows Defender 实时保护）** 在隔离/篡改下载下来
的 `ffmpeg.exe`。最稳妥的解决办法：自行安装（或加白名单）一个可信 ffmpeg，并设
环境变量 **`FFMPEG_PATH`**（及 `FFPROBE_PATH`）指向它——该路径优先级最高、会直接
跳过内置下载那一套。

- `FMODE_FFMPEG_NO_REPAIR=1`：关闭自动重下，直接走兜底。
- `FMODE_FFMPEG_REPAIR_TIMEOUT_MS`：限制重下耗时（默认 180000ms，防卡死）。
