# 个性化数学学习智能体公网版

这是可部署到云端的网页端版本。用户打开网址即可使用，不需要知道 DeepSeek API Key。

## 已包含

- 网页聊天界面
- 服务端 DeepSeek 转发
- 所有数学对话默认使用 DeepSeek V4 Pro
- API Key 服务端隐藏
- 邀请码注册、登录、退出
- 1 天试用和 1 个月试用两类邀请码
- 管理员网页自动生成随机邀请码
- 每个账号每日对话次数限制
- 每个账号的对话记录保存和新对话
- PWA 可安装到手机/电脑桌面
- 启发模式 / 讲解模式双模式回复
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
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_FALLBACK=false
DEEPSEEK_TIMEOUT_MS=8500
DEEPSEEK_HISTORY_LIMIT=6
CHAT_LIMIT_PER_DAY=100
ADMIN_SECRET=你的管理员口令
AUTH_TOKEN_DAYS=30
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

如果要把复杂图形识别切换为 Kimi，可在 Render 环境变量里改为：

```txt
VISION_PROVIDER=kimi
KIMI_API_KEY=你的 Kimi / Moonshot API Key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_VISION_MODEL=kimi-k2.6
VISION_MAX_TOKENS=1800
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

如果需要稳定的语音输入，建议配置腾讯云语音识别：

```txt
STT_PROVIDER=tencent
TENCENT_SECRET_ID=你的腾讯云 SecretId
TENCENT_SECRET_KEY=你的腾讯云 SecretKey
TENCENT_REGION=ap-shanghai
TENCENT_ASR_ENGINE=16k_zh
```

`CHAT_LIMIT_PER_DAY` 可以改成你想给每个账号每天使用的次数。

当前所有数学对话都走 `DEEPSEEK_PRO_MODEL`，默认是 `deepseek-v4-pro`。`DEEPSEEK_MODEL` 也建议同步填写 `deepseek-v4-pro`，避免部署平台仍保留旧的 Flash 配置。`DEEPSEEK_PRO_FALLBACK=false` 表示 Pro 暂时不可用时不自动回退普通模型，避免用户误以为正在使用 Pro。

`DEEPSEEK_TIMEOUT_MS` 控制 Pro 单次等待上限，默认 8.5 秒；超过后会切到 `DEEPSEEK_FLASH_MODEL` 快速兜底。Flash 也异常时，才使用本地教学兜底回复。`DEEPSEEK_HISTORY_LIMIT` 控制每次发给模型的最近对话条数，默认 6 条，能减少延迟。

`ADMIN_SECRET` 是管理员生成和校验邀请码时使用的口令。部署后打开 `/admin.html`，输入这个口令，就可以自动生成带签名的稳定随机邀请码。请保持 `ADMIN_SECRET` 不变；如果更换它，之前生成的邀请码会失效。

登录令牌默认有效 30 天，并使用 `ADMIN_SECRET` 签名，所以 Render 休眠、重启或重新部署后仍可自动登录。邀请码只在首次注册时使用；以后只需邮箱和密码。可通过 `AUTH_TOKEN_DAYS` 修改登录保持天数。

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

## PWA 安装到桌面

当前版本已经支持 PWA。部署后，家长和学生可以把网站安装成桌面应用：

- 安卓 Chrome：打开网站，点浏览器右上角菜单，选择“安装应用”或“添加到主屏幕”
- 电脑 Chrome/Edge：打开网站，地址栏右侧可能出现安装图标，也可以点页面右上角“安装到桌面”
- iPhone Safari：打开网站，点分享按钮，选择“添加到主屏幕”

PWA 需要通过 HTTPS 访问才会正常安装。Render 的 `https://personalized-math-agent.onrender.com/` 满足这个条件。

本项目新增了这些 PWA 文件：

```txt
manifest.webmanifest
sw.js
icons/app-icon.svg
icons/app-icon-192.png
icons/app-icon-512.png
```

上传到 GitHub 时，请一起上传这些文件和 `icons` 文件夹。

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

## 回复模式

当前智能体支持两种回复模式：

- 启发模式：适合学生自己思考。不会直接给最终答案，但会保证质量：先整合学生已完成的部分，纠正一个关键误区，再开放一个新台阶，避免反复兜圈子。
- 讲解模式：适合学生卡住或家长希望看完整讲法。回复会按“真正难点、找对象、定单位/标准、搭关系、关键步骤、易错点、结构总结、变式问题”展开。

底层设计来自个性化数学学习 Skill：数学学习不是会算，而是把题目世界结构化。智能体会优先检查对象、单位/标准、关系、表达方式、过程控制、条件边界、迁移和复述。

## 图片识别

DeepSeek 文本接口不负责识别题目图片。当前项目预留独立视觉模型接口，默认使用智谱 GLM-4V，也可以通过 `VISION_PROVIDER=kimi` 切换到 Kimi / Moonshot 视觉接口。

配置视觉模型后，用户可以上传题目图片，也可以直接在对话框里 Ctrl+V 粘贴题目截图。网页会在后台自动把图片转写成题目文字，不把识别文字塞进输入框，而是直接交给智能体开始启发式提问。

手机端上传图片时，前端会先把图片压缩到适合识别的大小，避免微信、手机相册里的大图导致识别请求失败。

如果未配置 `VISION_API_KEY`，上传入口仍会显示，但会提示“当前网站还没有配置图片识别模型”，用户可以手动输入题目文字。

## 语音功能

网页支持两类语音能力：

- 用户可以点“语音输入”，把说的话转成输入框文字，再确认发送
- 智能体回复下方会出现“快速朗读”和“AI人声”，学生可以直接听讲解

语音输入会优先使用服务端的腾讯云语音识别。这样不依赖 Chrome 背后的 Google 语音服务，更适合国内网络和微信环境。未配置腾讯云密钥时，网页会尝试退回浏览器自带语音识别；如果浏览器报 `network` 或 `service-not-allowed`，通常说明浏览器语音服务连不上，不是用户操作问题。

“快速朗读”使用浏览器本地朗读，几乎秒开，但声音会更偏机器感。“AI人声”会优先使用智谱 `GLM-TTS` 生成自然 AI 人声。未配置 `TTS_API_KEY` 时，会自动退回浏览器自带朗读。

如果你已经在 Render 里配置了智谱视觉识别的 `VISION_API_KEY`，朗读也可以复用这个 Key；单独配置 `TTS_API_KEY` 时会优先使用 `TTS_API_KEY`。

朗读已做缓存优化：同一段回复第一次生成会等待 TTS，之后再次点击会直接播放缓存。`TTS_MAX_CHARS` 控制单次朗读长度，默认 700 字，越长生成越慢。`TTS_RESPONSE_FORMAT=mp3` 会优先请求更小的音频格式；如果供应商不支持，会自动回退可用格式。

## 公式显示

网页已加入 MathJax，并额外做了常见 LaTeX 兜底转换。即使模型偶尔输出 `\dfrac{a}{b}` 或 `\leqslant`，前端也会尽量转成学生可读的形式。
