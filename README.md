# 个性化数学学习智能体公网版

这是可部署到云端的网页端版本。用户打开网址即可使用，不需要知道 DeepSeek API Key。

## 已包含

- 网页聊天界面
- 服务端 DeepSeek 转发
- API Key 服务端隐藏
- 用户注册、登录、退出
- 每个账号每日对话次数限制
- 启发式解题结构图
- 题目图片上传入口
- 小学、初中、高中、大学阶段选择
- 学习目标与当前状态选择

## 环境变量

部署平台里需要配置：

```txt
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
CHAT_LIMIT_PER_DAY=20
```

如果需要图片识别，还需要配置视觉模型：

```txt
VISION_API_KEY=你的智谱 API Key
VISION_PROVIDER=zhipu
VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_MODEL=glm-4v-plus-0111
```

`CHAT_LIMIT_PER_DAY` 可以改成你想给每个账号每天使用的次数。

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

## 账号与次数限制

当前账号数据保存在服务端本地 `data/users.json`，次数限制使用服务端内存保存，适合试用版、小范围体验和家长内测。

Render 免费服务重新部署或重启后，本地文件和内存状态可能丢失。正式开放给更多用户前，建议升级为数据库或 Redis：

- 用户表：保存账号、密码哈希、注册时间
- 会话表：保存登录状态
- 用量表：按账号和日期记录对话次数

## 解题结构图

结构图不是一上来直接给答案，而是启发式出现：

- 第一次看到题目时，优先提出启发问题
- 学生回答后，模型判断是否需要画结构图
- 学生明显卡住、回答错误、主动要求，才显示结构图
- 结构图用于展示：已知条件、目标、关键关系、步骤、结果、检查

## 图片识别

DeepSeek 文本接口不负责识别题目图片。当前项目预留独立视觉模型接口，默认使用智谱 GLM-4V。

配置视觉模型后，用户可以上传题目图片，服务端会先把图片转写成题目文字，再让学生确认后发送。

如果未配置 `VISION_API_KEY`，上传入口仍会显示，但会提示“当前网站还没有配置图片识别模型”，用户可以手动输入题目文字。

## 公式显示

网页已加入 MathJax，并额外做了常见 LaTeX 兜底转换。即使模型偶尔输出 `\dfrac{a}{b}` 或 `\leqslant`，前端也会尽量转成学生可读的形式。
