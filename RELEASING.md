# 发布流程

本文件记录把 `pi-at-skills` 发布到 npm 的配置步骤。npm 发布由 GitHub Actions 触发，本地不需要 npm 账号密码。

## 一次性配置

### 1. npm 侧的凭据（二选一）

**方案 A：Trusted Publishing（推荐，不保存长期 token）**

1. 在 <https://www.npmjs.com/package/pi-at-skills/access> 页面添加 Trusted Publisher：仓库 `Ttungx/pi-at-skills`，workflow 文件名 `ci.yml`，环境留空。
2. 需要先存在同名包。若包尚未创建，先在本地执行一次 `npm publish --access public`（需要本机已登录的 npm 账号），再回来配置 Trusted Publisher。
3. 配置完成后，删除工作流中的 `NODE_AUTH_TOKEN` 环境变量，只保留 `permissions: id-token: write`。

**方案 B：Automation token**

1. 在 <https://www.npmjs.com/settings/tokens> 创建 token，类型选择 `Automation`，过期时间按需设置。
2. 仓库进入 `Settings` → `Secrets and variables` → `Actions`，新增 repository secret `NPM_TOKEN`，值为该 token。
3. 工作流保持现状：`id-token: write` 提供 provenance，`secrets.NPM_TOKEN` 提供发布权限。

### 2. 仓库设置

`Settings` → `Actions` → `General` → `Workflow permissions` 保持 Read and write 即可（当前工作流只申请 `contents: read` 和 `id-token: write`，无需更高权限）。

## 每次发布

版本号与 pi 的版本号保持一致（见 README「版本策略」）。发布步骤：

1. 修改 `package.json` 中的 `version`。
2. 提交并推送：

   ```bash
   git commit -am "release: v<版本号>"
   git push origin main
   ```

3. 打标签并推送：

   ```bash
   git tag -a v<版本号> -m "v<版本号>"
   git push origin v<版本号>
   ```

4. 等待 GitHub Actions 的 `publish` 任务完成。该任务会先跑测试，再校验标签与 `package.json` 版本一致，最后执行 `npm publish --provenance`。
5. 发布完成后确认包库页面：<https://pi.dev/packages/pi-at-skills>。包库依赖 `keywords` 中的 `pi-package`，预览图依赖 `package.json` 中的 `pi.image`。

## 回滚

npm 不允许覆盖已发布版本。需要撤回错误版本时，发布一个修正后的次版本号，并把 README 中的安装说明指向该版本。

## 本地验证打包内容

```bash
npm pack --dry-run
```

确认 tarball 中只包含 `src/`、`README.md`、`README.en.md` 和 `LICENSE`。