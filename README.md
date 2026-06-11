# 个性化数学学习智能体公网版

这是可部署到云端的网页端版本。用户打开网址即可使用，不需要知道 DeepSeek API Key。

## 已包含

- 网页聊天界面
- 服务端 DeepSeek 转发
- 小学题默认 DeepSeek V4 Flash，中学及以上自动 DeepSeek V4 Pro
- API Key 服务端隐藏
- 邀请码注册、登录、退出
- 1 天试用和 1 个月试用两类邀请码
- 管理员网页自动生成随机邀请码
- 每个账号每日对话次数限制
- 每个账号的对话记录保存和新对话
- 自动判断是否需要展示解题结构图
- 题目图片上传和对话框 Ctrl+V 粘贴识别
- 浏览器语音输入和智能体回复朗读
- 小学、初中、高中、大学阶段选择
- 学习目标与当前状态选择

## 环境变量

部署平台里需要配置：

```txt
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_PRO_FALLBACK=true
CHAT_LIMIT_PER_DAY=100
ADMIN_SECRET=你的管理员口令
INVITE_CODES_1_DAY=DAY001,DAY002,DAY003
INVITE_CODES_1_MONTH=MONTH001,MONTH002,MONTH003
```

如果需要图片识别，还需要配置视觉模型：

```txt
VISION_API_KEY=你的智谱 API Key
VISION_PROVIDER=zhipu
VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_MODEL=glm-4v-plus-0111
```

如果需要更自然的人声朗读，还需要配置智谱 TTS：

```txt
TTS_PROVIDER=zhipu
TTS_API_KEY=你的智谱 API Key
TTS_BASE_URL=https://open.bigmodel.cn/api/paas/v4
TTS_MODEL=glm-tts
TTS_VOICE=xiaochen
TTS_SPEED=0.92
TTS_VOLUME=1
TTS_RESPONSE_FORMAT=mp3
TTS_MAX_CHARS=700
```

`CHAT_LIMIT_PER_DAY` 可以改成你想给每个账号每天使用的次数。

`DEEPSEEK_MODEL` 是普通模型，默认用于小学和简单题；`DEEPSEEK_PRO_MODEL` 是强推理模型，默认用于初中、高中、大学，以及几何证明、函数、参数、分类讨论、导数、数列等更容易出错的题。`DEEPSEEK_PRO_FALLBACK=true` 表示 Pro 暂时不可用时自动回退普通模型，避免网站完全不可用。

`ADMIN_SECRET` 是管理员生成和校验邀请码时使用的口令。部署后打开 `/admin.html`，输入这个口令，就可以自动生成带签名的稳定随机邀请码。请保持 `ADMIN_SECRET` 不变；如果更换它，之前生成的邀请码会失效。

`INVITE_CODES_1_DAY` 和 `INVITE_CODES_1_MONTH` 是可选的手工邀请码列表，适合临时预置少量邀请码。多个邀请码用英文逗号隔开。每个邀请码注册成功后会被占用，不能再次注册。

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

## 邀请码、账号与次数限制

当前注册必须填写邀请码。邀请码分两类：

- `INVITE_CODES_1_DAY`：注册后可试用 1 天
- `INVITE_CODES_1_MONTH`：注册后可试用 1 个月

管理员也可以打开：

```txt
https://你的域名/admin.html
```

输入 `ADMIN_SECRET` 后，自动生成 1 天试用或 1 个月试用的邀请码。新版邀请码本身带签名，不再依赖 `data/invites.json` 保存，所以 Render 重启或重新部署后仍能识别。

账号数据保存在服务端本地 `data/users.json`，其中会记录邀请码、试用类型、试用开始时间和试用截止时间。系统会用账号记录判断邀请码是否已经注册过。次数限制使用服务端内存保存，适合试用版、小范围体验和家长内测。

试用期结束后，账号仍可登录，但不能继续对话或识图，需要联系管理员获取新的试用资格。

Render 免费服务重新部署或重启后，本地账号文件和内存状态仍可能丢失。正式开放给更多用户前，建议升级为数据库或 Redis：

- 用户表：保存账号、密码哈希、注册时间
- 会话表：保存登录状态
- 用量表：按账号和日期记录对话次数

## 对话记录

登录后，网页左侧会显示“对话记录”，用户可以：

- 点击“新对话”开启新的学习对话
- 点击历史标题继续之前的对话
- 刷新页面后自动打开最近一条对话

当前对话记录保存在服务端本地 `data/conversations.json`，适合内测试用。Render 免费服务重新部署或重启后，本地文件仍可能丢失；正式长期运营建议迁移到数据库。

## 解题结构图

结构图不是一上来直接给答案，而是启发式出现：

- 第一次看到题目时，优先提出启发问题
- 学生回答后，模型判断是否需要画结构图
- 学生明显卡住、回答错误、主动要求画图理解时，才显示或更新结构图
- 结构图用于展示：已知条件、目标、关键关系、步骤、结果、检查

## 图片识别

DeepSeek 文本接口不负责识别题目图片。当前项目预留独立视觉模型接口，默认使用智谱 GLM-4V。

配置视觉模型后，用户可以上传题目图片，也可以直接在对话框里 Ctrl+V 粘贴题目截图。网页会在后台自动把图片转写成题目文字，不把识别文字塞进输入框，而是直接交给智能体开始启发式提问。

手机端上传图片时，前端会先把图片压缩到适合识别的大小，避免微信、手机相册里的大图导致识别请求失败。

如果未配置 `VISION_API_KEY`，上传入口仍会显示，但会提示“当前网站还没有配置图片识别模型”，用户可以手动输入题目文字。

## 语音功能

网页支持两类语音能力：

- 用户可以点“语音输入”，把说的话转成输入框文字，再确认发送
- 智能体回复下方会出现“AI朗读”，学生可以直接听讲解

语音输入使用浏览器自带能力，不需要额外 API Key。Chrome、Edge 等现代浏览器支持较好；部分微信内置浏览器可能不支持语音识别。

朗读会优先使用智谱 `GLM-TTS` 生成自然 AI 人声。未配置 `TTS_API_KEY` 时，会自动退回浏览器自带朗读，声音会更偏机器感。

如果你已经在 Render 里配置了智谱视觉识别的 `VISION_API_KEY`，朗读也可以复用这个 Key；单独配置 `TTS_API_KEY` 时会优先使用 `TTS_API_KEY`。

朗读已做缓存优化：同一段回复第一次生成会等待 TTS，之后再次点击会直接播放缓存。`TTS_MAX_CHARS` 控制单次朗读长度，默认 700 字，越长生成越慢。`TTS_RESPONSE_FORMAT=mp3` 会优先请求更小的音频格式；如果供应商不支持，会自动回退可用格式。

## 公式显示

网页已加入 MathJax，并额外做了常见 LaTeX 兜底转换。即使模型偶尔输出 `\dfrac{a}{b}` 或 `\leqslant`，前端也会尽量转成学生可读的形式。
