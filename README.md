# 散帅 API · 文档站

本仓库现在只用于托管 **散帅 API 的接入文档**（GitHub Pages）。

- 站点：<https://www.ss0100.com>（根路径自动跳转到文档）
- 文档：<https://www.ss0100.com/docs/>
- API：<https://api.ss0100.com/v1>

## 目录

- `index.html`：根路径跳转页
- `docs/index.html`：文档页面（自包含，无外部依赖）
- `docs/api.md`：文档的 Markdown 源文件
- `.github/workflows/pages.yml`：推送到 `main` 后自动发布到 GitHub Pages

## 维护

文档由网关侧的脚本按当前模型与定价生成（`F:\new-api中转站\docs\user-api.*`），改价后重新生成并覆盖 `docs/` 即可。

原有的「散帅灵感库 · 短剧选题」内容与每日自动更新工作流已移除（2026-11-08），完整备份见 `F:\Agents\Backups\ss0100-site-full-backup-20261108`。
