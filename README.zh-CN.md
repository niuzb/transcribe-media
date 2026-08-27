# transcribe-media

[English](README.md) | 简体中文

一个把本地音视频文件或公开单条目媒体链接转换为文字的 Agent Skill。它会
优先提取网页已有字幕或官方文字稿，没有可用文本时才使用 VoiceFlow ASR。

## 功能特性

- 转写本地 FLAC、M4A、MP3、MP4、MPEG、OGG、WAV 和 WebM 文件。
- 处理公开单视频或播客单集页面时，优先提取已有字幕，再回退到语音识别。
- 支持 `yt-dlp` 可以处理的公开媒体页面，包括 YouTube、哔哩哔哩、TikTok、
  Vimeo、X/Twitter、小宇宙等网站。
- 小宇宙单集只通过公开音频处理，不会索要手机号、短信验证码、人机验证结果
  或账号凭据。
- 通过浏览器批准流程获取 VoiceFlow Token，并以私有权限保存到用户配置目录。
- 转写文本输出到标准输出，进度和诊断信息输出到标准错误，便于脚本自动化。

## 环境要求

- Node.js 24 或更高版本。
- 本地视频提取音频，以及部分需要格式转换的远程媒体，需要 FFmpeg。
- 只有执行 ASR 时才需要 VoiceFlow Token；提取公开字幕不需要创建 Token。

Skill 可以使用系统中兼容的 `yt-dlp`，也可以自动下载经过校验的固定版本并
保存到用户缓存目录。

## 安装为 Codex Skill

把完整仓库克隆到 Codex 的个人 Skills 目录：

```bash
git clone https://github.com/niuzb/transcribe-media.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/transcribe-media"
```

如果 Codex 没有立即发现该 Skill，请重启 Codex。其他兼容 Agent Skills 的
运行环境可以把仓库安装到各自配置的 Skills 目录。

## 通过 Agent 使用

可以显式调用 Skill，或直接要求 Agent 转写受支持的媒体：

```text
使用 $transcribe-media 转写 /absolute/path/to/interview.mp3。
```

```text
使用 $transcribe-media 提取这个公开视频链接的文字稿：
https://example.com/watch/id
```

Skill 会直接返回原始转写文本，不会自动校对、改写、总结或翻译结果。

## 直接使用 CLI

转写本地文件：

```bash
node scripts/transcribe.mjs --file "/absolute/path/to/audio.wav"
```

提取公开媒体字幕或执行转写：

```bash
node scripts/transcribe.mjs --url "https://example.com/watch/id"
```

仅在已知源语言时指定语言：

```bash
node scripts/transcribe.mjs \
  --file "/absolute/path/to/audio.wav" \
  --language zh
```

运行 `node scripts/transcribe.mjs --help` 可以查看模型、提供方、轮询间隔和
超时设置。

## VoiceFlow 授权

处理公开链接时，请先运行转写命令，因为页面可能已经提供字幕。本地媒体或
需要 ASR 的链接可以先检查当前授权状态：

```bash
node scripts/auth.mjs status
```

如果状态为 `not_connected`，启动浏览器批准流程：

```bash
node scripts/auth.mjs begin
```

打开命令返回的验证链接并批准请求，然后完成授权流程：

```bash
node scripts/auth.mjs wait
```

也可以通过环境变量提供 `VOICEFLOW_TOKEN`。环境变量中的 Token 优先使用，
且不会被 Skill 持久化保存。

## 输入边界

- 本地文件最大为 512 MiB。
- 远程输入必须是一个公开视频或播客单集的 HTTPS 页面。
- 不支持播放列表、频道、用户主页、搜索页、直播、私密或付费媒体、需要登录
  的内容、DRM 媒体和内网地址。
- 网站行为可能随时变化，因此受支持的平台偶尔可能需要等待上游 `yt-dlp`
  更新。

## 安全与隐私

- 不要把 VoiceFlow Token 放入命令参数、日志、源码或 Git 仓库。
- 浏览器授权会在本地生成完整 Token，批准过程中只提交摘要。
- Unix 系统上的凭据文件使用私有权限。
- 只有网页没有可用文本，或需要转写本地文件时，媒体才会发送到 VoiceFlow
  ASR。
- 向远程 ASR 服务提交敏感音视频前，请确认相关数据符合你的隐私要求。

## 开发

运行时只使用 Node.js 内置模块，不需要执行 npm install。使用以下命令运行
完整测试套件：

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

本项目采用 [Apache License 2.0](LICENSE) 许可证。
