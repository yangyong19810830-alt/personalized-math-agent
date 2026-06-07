# 个性化数学学习智能体公网版

这是可部署到云端的网页端版本。别人只需要打开网址即可使用，不需要知道 DeepSeek API Key。

## 已包含

- 网页聊天界面
- 服务端 DeepSeek 转发
- API Key 服务端隐藏
- 用户注册、登录、退出
- 每个账号每日对话次数限制
- 小学、初中、高中、大学阶段选择
- 学习目标与当前状态选择

## 环境变量

部署平台里需要配置：

```txt
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
CHAT_LIMIT_PER_DAY=20
```

`CHAT_LIMIT_PER_DAY` 可以改成你想给每个访客每天使用的次数。

## 本地运行

在这个目录运行：

```bash
npm start
```

然后打开：

```txt
http://localhost:8787
```

## 部署建议

适合部署到 Render、Railway、Fly.io、服务器、宝塔面板或任何支持 Node.js 18+ 的平台。

部署参数：

```txt
Start Command: npm start
Node Version: 18 或更高
```

## 重要说明

当前账号数据保存在服务端本地 `data/users.json`，次数限制使用服务端内存保存，适合试用版、小范围体验和家长内测。

Render 免费服务重新部署或重启后，本地文件和内存状态可能丢失。正式开放给很多人前，建议升级为数据库或 Redis：

- 用户表：保存账号、密码哈希、注册时间
- 会话表：保存登录状态
- 用量表：按账号和日期记录对话次数

这样服务重启后账号和次数记录不会丢失，也能进一步支持手机号、邮箱验证或邀请码。
