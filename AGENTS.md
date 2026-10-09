# 工程约定

非代码文档使用中文。保持 DESIGN.md 的星图、文字与控件设计，不引入在线 SQL。

## Testing

运行 `npm run check`；浏览器验证运行 `npm run test:e2e`。修复音频与数据读取时
同时覆盖成功、失败、重试与用户手动暂停。真实 MP3 和 `.env*` 不得提交。
