# transcribe-media

[English](README.md) | 简体中文

**把你常看的公开视频、播客和本地音视频，直接变成文字。**

`transcribe-media` 是一个面向 Agent 的媒体转写 Skill。给它一个公开视频链接或本地文件，它会优先提取页面已有字幕；没有可用字幕时，再自动获取音频并使用 VoiceFlow ASR 转写。

## 30 秒演示

[![观看 Transcribe Media 30 秒演示](demo/transcribe-media-demo-poster.png)](demo/transcribe-media-demo.mp4)

[观看或下载带字幕的 MP4 演示](demo/transcribe-media-demo.mp4)。视频无需声音即可理解，完整展示字幕优先、明确授权和转写输出流程。

## 支持哪些网站？

只需提供一个**公开、可直接访问的单视频或播客单集链接**。

| 类别 | 常用网站 |
| --- | --- |
| 视频与长视频 | **YouTube、哔哩哔哩、优酷、爱奇艺、西瓜视频、Vimeo、Dailymotion** |
| 短视频与社交媒体 | **抖音、TikTok、小红书、Instagram、Facebook、X / Twitter** |
| 播客 | **小宇宙** |
| 更多公开媒体页 | 新闻、课程及其他公开单条目媒体网站 |

也支持 `b23.tv`、`youtu.be` 等官方分享链接。网站规则可能变化，能否处理以链接当时是否公开可访问、是否能解析为单个媒体条目为准。

## 为什么更快、更省？

### 字幕优先，不重复转写

遇到公开视频时，Skill 会先检查页面提供的人工字幕或自动字幕。只要找到可用文本，就直接清洗并输出，不再下载媒体，也不会调用 ASR。

### 没有字幕，也能继续

如果页面没有可靠字幕，Skill 会先说明外部处理路径并征得同意。只有获得明确同意后，才会获取兼容的公开媒体音轨并交给 VoiceFlow ASR 转写。小宇宙公开单集也遵守同样的授权门槛。

### 本地文件同样支持

支持以下格式，单个文件最大 512 MiB：

`FLAC` · `M4A` · `MP3` · `MP4` · `MPEG` · `OGG` · `WAV` · `WebM`

本地视频会先通过 FFmpeg 在本机提取音频，再进入转写流程。

## 安全与隐私

安全不是附加项，而是默认行为：

- **只处理公开内容**：拒绝私密、付费、DRM、需要登录的媒体，以及内网或本地网络地址。
- **不索要网站账号**：不会要求媒体网站的账号、密码、手机号、短信验证码或人机验证结果；处理小宇宙时也不调用登录或短信验证接口。
- **能用字幕就不上传媒体**：页面已有可用字幕时，直接返回文本，不把音视频发送到 ASR。
- **上传前明确同意**：只有用户同意把媒体发送到 VoiceFlow API 和服务方签发的 HTTPS 存储地址，并为本次命令提供 `--allow-remote-asr` 后，媒体才会离开设备。
- **转写完成即删除**：转写进入终态后，VoiceFlow 会先删除已上传的媒体，再向客户端返回终态结果。如果即时的尽力删除被中断，私有存储桶的强制生命周期策略会在 2–3 天内删除该对象。
- **工具下载前明确同意**：缺少兼容的 `yt-dlp` 时，只有用户同意并提供 `--allow-tool-download` 后，才会缓存固定版本。
- **不静默安装依赖**：缺少 FFmpeg 时只报告依赖要求，不会在未获得用户明确同意时安装。
- **Token 在本地生成**：浏览器授权只提交 Token 摘要，完整 Token 不会出现在授权请求中。
- **凭据私密保存**：Unix 系统上的凭据目录和文件分别使用 `0700` 与 `0600` 权限，并检查文件类型、所有者与权限。
- **受控下载**：远程链接经过 HTTPS、域名解析和公网地址校验；限制重定向、文件类型、响应大小与媒体大小。
- **工具完整性校验**：需要下载媒体解析组件时，只接受固定官方版本，并在运行前校验 SHA-256。
- **敏感信息不进入子进程**：调用媒体解析组件时会从环境中移除 `VOICEFLOW_TOKEN`。

> 向远程 ASR 服务提交敏感音视频前，请先确认内容符合你的隐私与合规要求。

## 快速开始

### 安装为 Codex Skill

```bash
git clone https://github.com/niuzb/transcribe-media.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/transcribe-media"
```

如果 Skill 没有立即被发现，请重启 Codex。其他兼容 Agent Skills 的运行环境，也可以把完整仓库安装到各自的 Skills 目录。

### 让 Agent 转写

转写本地文件：

```text
使用 $transcribe-media 转写 /absolute/path/to/interview.mp3。
```

提取公开视频文字稿：

```text
使用 $transcribe-media 提取这个公开视频链接的文字稿：
https://example.com/watch/id
```

Skill 默认返回忠于来源的原始文本，不会擅自校对、改写、总结或翻译。

## 直接使用 CLI

本地文件：

```bash
node scripts/transcribe.mjs \
  --file "/absolute/path/to/audio.wav" \
  --allow-remote-asr
```

公开视频或播客单集：

```bash
node scripts/transcribe.mjs --url "https://example.com/watch/id"
```

第一次处理 URL 时可以直接返回现有字幕，不上传媒体。如果命令提示需要远程 ASR，请先阅读披露内容，明确同意后再添加 `--allow-remote-asr`。如果提示缺少托管的 `yt-dlp`，请单独确认固定版本和缓存位置，再添加 `--allow-tool-download`。

仅在确定源语言时指定语言：

```bash
node scripts/transcribe.mjs \
  --file "/absolute/path/to/audio.wav" \
  --language zh \
  --allow-remote-asr
```

运行 `node scripts/transcribe.mjs --help` 查看模型、提供方、轮询间隔和超时等选项。

## VoiceFlow 授权

提取网页已有字幕不需要 VoiceFlow Token。只有本地媒体或缺少可用字幕的公开链接需要 ASR。使用 `--allow-remote-asr` 前，用户必须同意通过 HTTPS 把媒体和基本文件元数据发送到 `asr.audioflow123.com` 以及服务方签发的存储地址。转写进入终态后，VoiceFlow 会先删除已上传的媒体，再向客户端返回终态结果。删除操作是幂等的尽力清理；如果即时删除被中断，私有存储桶的强制生命周期策略会在 2–3 天内删除遗留对象。

检查授权状态：

```bash
node scripts/auth.mjs status
```

如果状态为 `not_connected`，启动浏览器授权：

```bash
node scripts/auth.mjs begin
```

打开命令返回的验证链接并批准，然后完成授权：

```bash
node scripts/auth.mjs wait
```

也可以通过环境变量提供 `VOICEFLOW_TOKEN`。环境变量优先使用，且不会由 Skill 持久化保存。不要把 Token 放进命令参数、日志、源码或 Git 仓库。

## 工作原理

```text
输入公开链接
    ↓
校验 HTTPS 与公网地址，确认是单个公开媒体条目
    ↓
发现可用字幕？ ── 是 → 提取并清洗字幕 → 直接输出文字
    │
    否
    ↓
获得明确上传同意 → 获取兼容音轨 → VoiceFlow ASR → 输出文字
```

项目通过受控的媒体解析层处理公开页面，底层使用 `yt-dlp` 获取媒体元数据、字幕或公开音轨。Skill 会优先复用系统中兼容的版本或已经验证的托管副本；否则先征得同意，再下载并缓存固定的官方版本，执行前校验其 SHA-256。

## 使用边界

- 远程输入必须是公开 HTTPS 页面中的**一个**视频或播客单集。
- 不支持播放列表、频道、用户主页、搜索页和包含多个媒体条目的聚合页。
- 不支持直播、私密或付费内容、登录后内容、DRM 媒体与内网地址。
- 网站行为可能变化，个别平台偶尔需要等待媒体解析组件更新。
- 请确保你有权访问和处理输入内容，并遵守来源网站的条款与适用法律。

## 环境要求

- Node.js 24 或更高版本。
- FFmpeg：用于本地视频提取音频，以及部分远程媒体的格式转换；未经明确同意不会安装。
- VoiceFlow Token：仅在需要 ASR 时使用；提取公开字幕无需 Token。

运行时只使用 Node.js 内置模块，无需执行 `npm install`。

## 开发

运行完整测试：

```bash
node --test scripts/*.test.mjs
```

仓库结构：

```text
.
├── SKILL.md                 Agent 工作流与安全规则
├── agents/openai.yaml       Skill 展示元数据
├── references/              平台专用说明
└── scripts/                 运行时模块与 Node.js 测试
```

## 许可证

GitHub 源码仓库采用 [Apache License 2.0](LICENSE) 许可证。根据 ClawHub
平台的发布条款，通过 ClawHub 分发的版本同时以 MIT-0 授权。
