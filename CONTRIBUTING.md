# Contributing

本仓库接受 GitHub Pull Request，由单一维护者审阅，不承诺处理时限。提交前应在 Node 22 与
pnpm 11.8.0 下执行：

```sh
pnpm install --frozen-lockfile
pnpm run check:docs
pnpm run typecheck
pnpm run test
```

用户可见变更需要同时更新相关文档；改变公开 API、发布物或版本时还需要 Changeset。不要从
应用代码导入 `@bom-editor/*` 内部物理包，只使用 `@qkplm/*` 的公开入口。

外部贡献采用 Developer Certificate of Origin。每个提交都必须包含签署行，例如：

```text
Signed-off-by: Your Name <you@example.com>
```

可通过 `git commit -s` 自动添加。提交不得包含密钥、令牌、真实业务 BOM 或其他敏感数据。
