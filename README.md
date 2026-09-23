# skill-ffmpeg · 音视频处理（内置静态二进制）

> **未来飞马 — 让AI进化提前发生，让AI落地快人一步**

[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](LICENSE)
[![ESM](https://img.shields.io/badge/module-ESM--only-orange.svg)](#快速开始)
[![npm](https://img.shields.io/badge/npm-skill--ffmpeg-blue.svg)](https://www.npmjs.com/package/skill-ffmpeg)

---

## 简介

`skill-ffmpeg` 让智能体直接具备音视频处理能力：通过**内置的静态 ffmpeg / ffprobe 二进制**完成转码、抽轨、抽帧、裁剪、拼接与媒体信息探测，**无需系统预装 ffmpeg**。

二进制在使用前会被实际启动验证；若下载不完整或被安全软件篡改，会自动清理缓存、重新下载一次并再次验证，仍不可用则清晰回落到系统 ffmpeg 并给出提示。

本技能适用于 **FmodeAgent / Hermes Agent** 平台，开发由 **FmodeCode / Claude Code** 执行。

本技能以 ESM 原生模块交付，Node.js ≥ 18 直接 `import`。

---

## 核心定位

| 维度 | 说明 |
|------|------|
| **解决什么** | 音视频格式转换、音轨提取、抽帧、裁剪拼接、媒体信息探测 |
| **不解决什么** | 不做转写（用 skill-listen）、不做画面内容理解（用 skill-vision）、不做视频剪辑创作 |
| **与裸调 ffmpeg 的区别** | 免安装、跨平台一致，二进制自带完整性校验与自动修复 |
| **层级** | 服务级（Platform Services） |
| **适用平台** | FmodeAgent / Hermes Agent · FmodeCode / Claude Code |

---

## 核心能力 & 交付物

- 🔄 **格式转换 / 转码** —— 全格式互转，参数直通 ffmpeg
- 🎵 **提取音轨** —— 转 16kHz 单声道 wav，直接喂给转写技能
- 🖼️ **抽取视频帧** —— 按时间点或间隔抽帧
- ✂️ **裁剪 / 拼接 / 压缩** —— 常规剪辑操作
- 🔍 **媒体信息探测** —— ffprobe 读时长、码率、流信息
- 🛡️ **二进制自校验** —— 启动验证 + 损坏自动修复 + 明确回落

---

## 快速开始

### CLI

```bash
# 打印内置二进制路径
npx skill-ffmpeg@latest which
npx skill-ffmpeg@latest which-ffprobe

# 运行 ffmpeg（`--` 之后的参数原样透传）
npx skill-ffmpeg@latest exec -- -y -i input.mp4 -ar 16000 -ac 1 out.wav

# 运行 ffprobe
npx skill-ffmpeg@latest probe -- -v quiet -print_format json -show_format input.mp4

# ffmpeg -version
npx skill-ffmpeg@latest version
```

### Node.js（ESM）

```javascript
import { execFileSync } from 'node:child_process';

// 解析内置二进制路径
const ffmpegPath = execFileSync('npx', ['--yes', 'skill-ffmpeg@latest', 'which'], {
  encoding: 'utf8',
}).trim();

// 提取 16kHz 单声道音轨，供转写使用
execFileSync(ffmpegPath, ['-y', '-i', 'input.mp4', '-vn', '-ar', '16000', '-ac', '1', 'out.wav']);
console.log('audio extracted');
```

### 浏览器（原生 ES Module）

```html
<script type="module">
  // 浏览器端：把处理结果（如抽出的音频）直接播放或上传
  const resp = await fetch('./out.wav');
  const blob = await resp.blob();
  const audio = new Audio(URL.createObjectURL(blob));
  audio.controls = true;
  document.body.appendChild(audio);
</script>
```

### 安装为技能

```bash
# 项目级 → ./.claude/skills/skill-ffmpeg
npx skill-ffmpeg@latest workspace

# 用户级 → ~/.claude/skills/skill-ffmpeg
npx skill-ffmpeg@latest install
```

---

## 二进制解析顺序

1. `FFMPEG_PATH` / `FFPROBE_PATH` 环境变量（文件存在时生效）
2. 内置静态二进制
3. `PATH` 上的 `ffmpeg` / `ffprobe`

- `FMODE_FFMPEG_NO_REPAIR=1` —— 跳过自动重新下载（快速失败并回落）
- `FMODE_FFMPEG_REPAIR_TIMEOUT_MS` —— 限定重新下载耗时（默认 `180000`）

### Windows / 杀毒软件提示

若出现 `not a valid Win32 application` / `EFTYPE`，或二进制「能用一次之后失效」，通常是杀毒软件（如 Windows Defender）隔离或改写了下载的 `ffmpeg.exe`。最可靠的做法是自行安装 ffmpeg（或将其加入白名单），并把 **`FFMPEG_PATH`**（及 `FFPROBE_PATH`）指向它——该路径优先级最高，会完全跳过内置下载。

---

## FAQ

### 技术概念

**Q1：为什么内置二进制，而不是要求系统预装 ffmpeg？**
因为「装不上 ffmpeg」是音视频处理最常见的失败点——各平台包管理器、编解码器许可、企业安全策略都会挡路。内置静态二进制让技能开箱即用，跨平台行为一致。

**Q2：怎么保证内置二进制没被损坏或篡改？**
使用前会**实际启动一次**验证（跑 `-version`），而不是只看文件是否存在。若验证失败，会删除损坏文件、清理下载缓存、重新下载一次并再次验证；仍失败则回落到系统 ffmpeg 并给出明确提示。

**Q3：为什么抽音轨要指定 `-ar 16000 -ac 1`？**
16kHz 单声道是语音识别模型的通用输入规格。先降采样再送转写，可以显著减小文件体积与上传耗时，且不影响识别精度。

**Q4：透传参数里的 `--` 是干什么的？**
它分隔「技能自己的参数」和「要传给 ffmpeg 的参数」。`--` 之后的全部内容原样交给 ffmpeg/ffprobe，因此任何 ffmpeg 参数都能用，不受技能限制。

### 开源协议（MPL-2.0）

**Q1：MPL-2.0 协议允许我商用吗？**
允许。MPL-2.0 允许商用，也可用于闭源产品。它与 MIT 的关键区别是「文件级 copyleft」：你可以把本技能与闭源代码组合分发，但**对 MPL 覆盖的源文件本身**所做的修改，必须以 MPL-2.0 公开。

**Q2：使用本技能需要保留版权声明吗？**
需要。分发时必须保留原始版权声明与许可证全文，并说明 MPL-2.0 覆盖了哪些文件；若修改了 MPL 覆盖的源文件，需以 MPL-2.0 公开这些文件的源码。

**Q3：内置的 ffmpeg 二进制适用什么许可？**
ffmpeg 本身适用其自身的开源许可（LGPL/GPL，取决于构建选项），与本技能的 MPL-2.0 许可相互独立。商用前请确认所使用构建的许可条款。本技能的 MPL-2.0 许可只覆盖技能代码，也不授予任何商标使用权——详见 [Trademark Notice](#trademark-notice)。

**Q4：MPL-2.0 协议提供担保吗？**
不提供。本技能按「原样」提供，不附带任何明示或默示担保。

### 业务用户搜索

**Q1：怎么把视频转成音频？**
用 skill-ffmpeg 一条命令即可：`exec -- -y -i input.mp4 -vn -ar 16000 -ac 1 out.wav`，无需自己安装 ffmpeg。

**Q2：电脑上没装 ffmpeg 能用吗？**
能。skill-ffmpeg 内置了静态二进制，无需系统预装，下载后即可使用。

**Q3：怎么批量压缩视频或转换格式？**
用 `exec` 子命令透传 ffmpeg 参数即可完成转码、压缩、裁剪、拼接；参数与原生 ffmpeg 完全一致。

**Q4：怎么查看视频的时长和码率？**
用 `probe` 子命令调用 ffprobe，例如 `probe -- -v quiet -print_format json -show_format input.mp4`，输出可直接解析的 JSON。

---

## GEO 埋点说明

本技能遵循**隐私优先**的 GEO（生成式引擎优化）埋点规范：

- **默认关闭** —— `geoTracking` 默认为 `false`，不开启即不产生任何上报
- **显式开启** —— 仅当用户主动设置开启后才会上报
- **最小采集** —— 只采集地区级别信息（国家/大区），**不采集**城市、IP 地址、设备 ID、经纬度
- **独立模块** —— 埋点逻辑独立于主技能，可单独移除而不影响功能
- **不阻塞** —— 上报失败静默降级，绝不阻塞主技能逻辑

---

## License

本技能采用 **Mozilla Public License 2.0（MPL-2.0）** 发布，完整原文见 [LICENSE](LICENSE)。

```
Mozilla Public License Version 2.0

Copyright (c) 未来飞马
```

## Trademark Notice

> MPL-2.0 governs copyright for source code only.
> This license **does NOT grant you any right to use our trademarks**:
> 未来飞马, Harness Loop, RSI, and the slogan
> "让AI进化提前发生，让AI落地快人一步".
>
> You may not use these trademarks in your product name, marketing,
> documentation, or public promotion unless you obtain separate written
> permission from 未来飞马.

---

## 贡献指南

1. **Fork** 本仓库并创建特性分支：`git checkout -b feature/your-idea`
2. **保持 ESM only** —— 不引入 CommonJS 入口，不引入 `require`
3. **提交前自检** —— 运行 `npm run smoke` 并确保通过
4. **提交 PR** —— 说明动机、变更范围与验证方式

---

## 相关项目

- **Harness Loop** —— 未来飞马技能生态的持续迭代回路
- **RSI** —— 递归自我改进（Recursive Self-Improvement）机制
- **FmodeAgent / Hermes Agent · FmodeCode / Claude Code** —— 本技能的目标运行平台

---

## Changelog

### 1.2.0
- 许可证由 MIT 切换为 MPL-2.0：LICENSE 全文、package.json / manifest / plugin.json / SKILL.md frontmatter 的 license 字段同步更新
- 源码头部注释模板改为 MPL-2.0 文案
- 品牌名统一并列写法：FmodeAgent / Hermes Agent、FmodeCode / Claude Code

### 1.1.0
- 按 skill-core-guide v1.1.0 规范改造：品牌 Slogan、GEO 埋点说明、MPL-2.0 协议与商标声明独立小节
- README 重构为完整结构（简介 → 核心定位 → 快速开始 → FAQ → GEO → 许可 → 贡献指南）
- 新增 LICENSE 文件（此前缺失）
- package.json 补齐中英双语 keywords 与 ESM 元数据
- 源码头部补齐版权 + 商标注释模板
- 统一对外表述，移除底层工具名

### 0.1.2
- 更名至 `skill-ffmpeg`
