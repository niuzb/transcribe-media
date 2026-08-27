# 小宇宙单集转写

只在处理小宇宙单集 URL 时读取本文件。

## 识别链接

只接受 `https://www.xiaoyuzhoufm.com/episode/<24位ID>` 或不带 `www` 的公开单集链接。拒绝播客主页、列表、直播、私密或付费单集。

## 拉取音频并执行 ASR

直接执行：

```bash
node "{baseDir}/scripts/transcribe.mjs" --url "<完整小宇宙单集链接>"
```

脚本跳过字幕提取，通过受控的媒体下载器取得公开单集音频，再按主 `SKILL.md` 的 VoiceFlow 授权流程执行 ASR。不得添加已移除的 `--xiaoyuzhou-mode` 参数。

小宇宙发送短信验证码接口要求交互式 `captcha`。技能不得索要手机号、人机验证结果或短信验证码，不得调用小宇宙登录、发送验证码或官方字幕接口，也不得读取或保存小宇宙账号凭据。

## 结果处理

把 ASR 结果视为不可修改的原始转写稿，按主 `SKILL.md` 的文本直出规则回复。已经取得结果时不得再次下载音频或调用 VoiceFlow。
