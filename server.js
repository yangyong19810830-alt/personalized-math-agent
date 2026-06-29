const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const DEEPSEEK_FLASH_MODEL = process.env.DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash";
const DEEPSEEK_PRO_API_KEY = process.env.DEEPSEEK_PRO_API_KEY || DEEPSEEK_API_KEY;
const DEEPSEEK_PRO_BASE_URL = (process.env.DEEPSEEK_PRO_BASE_URL || DEEPSEEK_BASE_URL).replace(/\/$/, "");
const DEEPSEEK_PRO_MODEL = process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro";
const DEEPSEEK_PRO_FALLBACK = String(process.env.DEEPSEEK_PRO_FALLBACK || "false").toLowerCase() === "true";
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 8500);
const DEEPSEEK_HISTORY_LIMIT = Number(process.env.DEEPSEEK_HISTORY_LIMIT || 6);
const VISION_API_KEY = process.env.VISION_API_KEY || "";
const VISION_PROVIDER = (process.env.VISION_PROVIDER || "zhipu").toLowerCase();
const VISION_BASE_URL = (process.env.VISION_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
const VISION_MODEL = process.env.VISION_MODEL || "glm-4v-plus-0111";
const VISION_MAX_TOKENS = Number(process.env.VISION_MAX_TOKENS || 1800);
const VISION_TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS || 15000);
const KIMI_API_KEY = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
const KIMI_BASE_URL = (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/$/, "");
const KIMI_VISION_MODEL = process.env.KIMI_VISION_MODEL || process.env.KIMI_MODEL || "kimi-k2.6";
const KIMI_VISION_TIMEOUT_MS = Number(process.env.KIMI_VISION_TIMEOUT_MS || 10000);
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "zhipu").toLowerCase();
const TTS_API_KEY = process.env.TTS_API_KEY || process.env.ZHIPU_API_KEY || VISION_API_KEY || "";
const TTS_BASE_URL = (process.env.TTS_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
const TTS_MODEL = process.env.TTS_MODEL || "glm-tts";
const TTS_VOICE = process.env.TTS_VOICE || "xiaochen";
const TTS_SPEED = Number(process.env.TTS_SPEED || 0.92);
const TTS_VOLUME = Number(process.env.TTS_VOLUME || 1.0);
const TTS_RESPONSE_FORMAT = (process.env.TTS_RESPONSE_FORMAT || "mp3").toLowerCase();
const TTS_MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 700);
const TTS_INSTRUCTIONS = process.env.TTS_INSTRUCTIONS || "用自然、温和、清晰的中文老师语气朗读。语速稍慢，数学符号读得清楚，给学生稳定感。";
const STT_PROVIDER = (process.env.STT_PROVIDER || "tencent").toLowerCase();
const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || "";
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || "";
const TENCENT_REGION = process.env.TENCENT_REGION || "ap-shanghai";
const TENCENT_ASR_ENDPOINT = process.env.TENCENT_ASR_ENDPOINT || "asr.tencentcloudapi.com";
const TENCENT_ASR_ENGINE = process.env.TENCENT_ASR_ENGINE || "16k_zh";
const DAILY_LIMIT = Number(process.env.CHAT_LIMIT_PER_DAY || 100);
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const AUTH_SECRET = process.env.AUTH_SECRET || ADMIN_SECRET || DEEPSEEK_API_KEY;
const AUTH_TOKEN_DAYS = Math.max(1, Number(process.env.AUTH_TOKEN_DAYS || 30));
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_INVITE_CODES = parseInviteCodes(process.env.INVITE_CODES_1_DAY || process.env.INVITE_CODES_DAY || "");
const ONE_MONTH_INVITE_CODES = parseInviteCodes(process.env.INVITE_CODES_1_MONTH || process.env.INVITE_CODES_MONTH || "");
const quota = new Map();
const sessions = new Map();
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");
const TTS_CACHE_DIR = path.join(DATA_DIR, "tts-cache");
const pendingTts = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TTS_CACHE_DIR)) fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
  if (!fs.existsSync(INVITES_FILE)) fs.writeFileSync(INVITES_FILE, "[]", "utf8");
  if (!fs.existsSync(CONVERSATIONS_FILE)) fs.writeFileSync(CONVERSATIONS_FILE, "[]", "utf8");
}

function readUsers() {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureDataStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

function readInvites() {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(INVITES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeInvites(invites) {
  ensureDataStore();
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), "utf8");
}

function readConversations() {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeConversations(conversations) {
  ensureDataStore();
  fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversations, null, 2), "utf8");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function parseInviteCodes(value) {
  return new Set(String(value || "")
    .split(/[\s,，;；]+/)
    .map(normalizeInviteCode)
    .filter(Boolean));
}

function invitePlanFor(code) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return null;
  if (ONE_DAY_INVITE_CODES.has(normalized)) {
    return { type: "one_day", label: "1 天试用", days: 1 };
  }
  if (ONE_MONTH_INVITE_CODES.has(normalized)) {
    return { type: "one_month", label: "1 个月试用", days: 30 };
  }
  return null;
}

function generatedInvitePlan(invite) {
  if (!invite) return null;
  if (invite.type === "one_day") {
    return { type: "one_day", label: "1 天试用", days: 1 };
  }
  if (invite.type === "one_month") {
    return { type: "one_month", label: "1 个月试用", days: 30 };
  }
  return null;
}

function invitePlanFromType(type) {
  if (type === "one_day") {
    return { type: "one_day", label: "1 天试用", days: 1 };
  }
  if (type === "one_month") {
    return { type: "one_month", label: "1 个月试用", days: 30 };
  }
  return null;
}

function inviteSignature(base) {
  if (!ADMIN_SECRET) return "";
  return crypto.createHmac("sha256", ADMIN_SECRET)
    .update(String(base || "").toUpperCase())
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signedInvitePlanFor(code) {
  const normalized = normalizeInviteCode(code);
  const parts = normalized.split("-");
  if (parts.length !== 5) return null;
  const [prefix, a, b, c, signature] = parts;
  if (!["D", "M"].includes(prefix)) return null;
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(a + b + c)) return null;
  if (!/^[A-F0-9]{10}$/.test(signature)) return null;
  const base = `${prefix}-${a}-${b}-${c}`;
  if (!safeEqualText(inviteSignature(base), signature)) return null;
  return invitePlanFromType(prefix === "M" ? "one_month" : "one_day");
}

function findInviteAccess(users, code) {
  const normalized = normalizeInviteCode(code);
  const signedPlan = signedInvitePlanFor(normalized);
  if (signedPlan) {
    if (inviteCodeUsed(users, normalized)) {
      return { error: "这个邀请码已经被使用，请更换新的邀请码" };
    }
    return { source: "signed", plan: signedPlan };
  }

  const generated = readInvites().find(invite => normalizeInviteCode(invite.code) === normalized);
  if (generated) {
    if (generated.usedBy) {
      return { error: "这个邀请码已经被使用，请更换新的邀请码" };
    }
    const plan = generatedInvitePlan(generated);
    if (!plan) return { error: "邀请码类型异常，请联系管理员" };
    return { source: "generated", plan };
  }

  const envPlan = invitePlanFor(normalized);
  if (envPlan) {
    if (inviteCodeUsed(users, normalized)) {
      return { error: "这个邀请码已经被使用，请更换新的邀请码" };
    }
    return { source: "env", plan: envPlan };
  }

  return { error: "邀请码无效，请检查后再试" };
}

function markGeneratedInviteUsed(code, user) {
  const normalized = normalizeInviteCode(code);
  const invites = readInvites();
  const invite = invites.find(item => normalizeInviteCode(item.code) === normalized);
  if (!invite || invite.usedBy) return;
  invite.usedBy = user.id;
  invite.usedEmail = user.email;
  invite.usedAt = new Date().toISOString();
  writeInvites(invites);
}

function randomInviteCode(existingCodes) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let raw = "";
    for (let index = 0; index < 12; index += 1) {
      raw += alphabet[crypto.randomInt(alphabet.length)];
    }
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("邀请码生成失败，请稍后再试");
}

function randomSignedInviteCode(type, existingCodes) {
  if (!ADMIN_SECRET) {
    throw new Error("还没有配置 ADMIN_SECRET，暂时不能生成稳定邀请码");
  }
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const prefix = type === "one_month" ? "M" : "D";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let raw = "";
    for (let index = 0; index < 12; index += 1) {
      raw += alphabet[crypto.randomInt(alphabet.length)];
    }
    const base = `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const code = `${base}-${inviteSignature(base)}`;
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("邀请码生成失败，请稍后再试");
}

function inviteStats(invites = readInvites()) {
  const unused = invites.filter(invite => !invite.usedBy);
  return {
    total: invites.length,
    unused: unused.length,
    oneDayUnused: unused.filter(invite => invite.type === "one_day").length,
    oneMonthUnused: unused.filter(invite => invite.type === "one_month").length
  };
}

function trialEndsAt(plan) {
  const now = new Date();
  if (plan.type === "one_month") {
    now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  }
  return new Date(Date.now() + ONE_DAY_MS).toISOString();
}

function trialInfo(user) {
  const endsAt = user.trialEndsAt || "";
  const endMs = Date.parse(endsAt);
  const active = Number.isFinite(endMs) && endMs > Date.now();
  const remainingDays = active ? Math.max(1, Math.ceil((endMs - Date.now()) / ONE_DAY_MS)) : 0;
  return {
    type: user.trialType || "",
    label: user.trialLabel || "未开通试用",
    endsAt,
    active,
    remainingDays
  };
}

function isTrialActive(user) {
  return trialInfo(user).active;
}

function inviteCodeUsed(users, code) {
  const normalized = normalizeInviteCode(code);
  return users.some(user => normalizeInviteCode(user.inviteCode) === normalized);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const result = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(result.hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    trial: trialInfo(user)
  };
}

function conversationTitleFrom(text) {
  const clean = String(text || "新的对话")
    .replace(/\s+/g, " ")
    .replace(/[{}[\]<>$\\]/g, "")
    .trim();
  return (clean || "新的对话").slice(0, 28);
}

function publicConversation(conversation) {
  return {
    id: conversation.id,
    title: conversation.title || "新的对话",
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0
  };
}

function getUserConversations(userId) {
  return readConversations()
    .filter(conversation => conversation.userId === userId)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function createConversation(user, title = "新的对话") {
  const now = new Date().toISOString();
  const conversations = readConversations();
  const conversation = {
    id: crypto.randomUUID(),
    userId: user.id,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  conversations.push(conversation);
  writeConversations(conversations);
  return conversation;
}

function getConversation(user, conversationId) {
  return readConversations().find(conversation => conversation.userId === user.id && conversation.id === conversationId) || null;
}

function saveConversationMessages(user, conversationId, userMessage, assistantMessage) {
  const now = new Date().toISOString();
  const conversations = readConversations();
  let conversation = conversations.find(item => item.userId === user.id && item.id === conversationId);
  if (!conversation) {
    conversation = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: conversationTitleFrom(userMessage.content),
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    conversations.push(conversation);
  }
  if (!conversation.title || conversation.title === "新的对话") {
    conversation.title = conversationTitleFrom(userMessage.content);
  }
  conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  conversation.messages.push(
    {
      role: "user",
      content: String(userMessage.content || ""),
      displayContent: String(userMessage.displayContent || userMessage.content || ""),
      createdAt: now
    },
    {
      role: "assistant",
      content: String(assistantMessage.content || ""),
      diagramAction: assistantMessage.diagramAction || "hold",
      diagram: assistantMessage.diagram || null,
      createdAt: now
    }
  );
  conversation.updatedAt = now;
  writeConversations(conversations);
  return conversation;
}

function createSession(user) {
  if (AUTH_SECRET) {
    const payload = Buffer.from(JSON.stringify({
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        trialType: user.trialType,
        trialLabel: user.trialLabel,
        trialStartsAt: user.trialStartsAt,
        trialEndsAt: user.trialEndsAt,
        createdAt: user.createdAt
      },
      expiresAt: Date.now() + AUTH_TOKEN_DAYS * ONE_DAY_MS,
      nonce: crypto.randomBytes(8).toString("hex")
    }), "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
    return `v1.${payload}.${signature}`;
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now()
  });
  return token;
}

function persistentSession(token) {
  if (!AUTH_SECRET || !String(token || "").startsWith("v1.")) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  const provided = Buffer.from(parts[2]);
  const expected = Buffer.from(crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url"));
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.userId || !session.expiresAt || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function authToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)math_agent_token=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return "";
}

function authTokenCandidates(req) {
  const values = [];
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) values.push(header.slice(7));
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)math_agent_token=([^;]+)/);
  if (match) values.push(decodeURIComponent(match[1]));
  return [...new Set(values.filter(Boolean))];
}

function getUserFromRequest(req) {
  for (const token of authTokenCandidates(req)) {
    const session = persistentSession(token) || sessions.get(token);
    if (!session) continue;
    const users = readUsers();
    const existingUser = users.find(user => user.id === session.userId);
    if (existingUser) return existingUser;
    if (!session.user || session.user.id !== session.userId) continue;

    const recoveredUser = {
      ...session.user,
      recoveredAt: new Date().toISOString()
    };
    users.push(recoveredUser);
    writeUsers(users);
    return recoveredUser;
  }
  return null;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function quotaKey(req, identity) {
  return `${today()}:${identity || clientIp(req)}`;
}

function remainingFor(req, identity) {
  const key = quotaKey(req, identity);
  const used = quota.get(key) || 0;
  return Math.max(0, DAILY_LIMIT - used);
}

function consumeQuota(req, identity) {
  const key = quotaKey(req, identity);
  const used = quota.get(key) || 0;
  if (used >= DAILY_LIMIT) return false;
  quota.set(key, used + 1);
  return true;
}

function authCookie(token) {
  return [
    `math_agent_token=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.round(AUTH_TOKEN_DAYS * 24 * 60 * 60)}`,
    "SameSite=Lax",
    "HttpOnly"
  ].join("; ");
}

function clearAuthCookie() {
  return "math_agent_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly";
}

function sendJson(res, status, body, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(data);
}

function sendBinary(res, status, buffer, contentType) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store"
  });
  res.end(buffer);
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;
    req.on("data", chunk => {
      if (finished) return;
      total += chunk.length;
      if (total > maxBytes) {
        finished = true;
        reject(new Error("请求内容太大"));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!finished) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", error => {
      if (!finished) reject(error);
    });
  });
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

function userMessageCount(messages = []) {
  return messages.filter(message => message.role === "user").length;
}

function systemPrompt(profile, messages = []) {
  const mode = profile?.mode === "讲解模式" ? "讲解模式" : "启发模式";
  const isFirstUserTurn = userMessageCount(messages) <= 1;
  const modeRules = mode === "讲解模式"
    ? [
        "当前回复模式：讲解模式。",
        "可以讲完整，但要结构化，不要只堆步骤。建议 450-900 个汉字，必须把结尾讲完整，最后用一句话收束。",
        "默认结构：真正难点；找对象；定单位/标准；搭关系；选择表达方式；关键步骤；易错点；一句话结构总结；要求学生复述结构。",
        "讲解时，找出对象和对象之间的关系后，要立刻说“我们把这个关系画成结构图来看”。图不是装饰，而是把关系具体化、模型化：对象是点，关系是边，单位/标准和变化量要在图里显出来。",
        "每个关键算式都要解释它表达的关系。讲完后不要立刻出新题，先要求学生用一句话复述这道题背后的结构，减少答案依赖。"
      ]
    : [
        "当前回复模式：启发模式。",
        "启发不是越短越好，要保证学生能继续走。回复建议 160-320 个汉字。",
        isFirstUserTurn
          ? "这是用户刚发来的题目，不是学生作答。不要说“你已经抓住了”“你算对了”“你这一步”等反馈语。应先判断题目结构，给一个观察入口和一个具体追问。"
          : "这是学生已经有过回答后的继续对话。可以先总结学生已完成的部分，纠正一个关键误区，补充必要背景，只开放一个新的台阶，最后问一个具体问题。",
        "如果学生已经连续回答了 2 轮以上，可以把前面内容整合成一个小结，再推进一小步，避免兜圈子。",
        "不要直接给最终答案；但可以说明当前步骤的意义，以及为什么要看这个对象、单位/标准或关系。"
      ];
  return [
    "你是一个面向小学到大学学生的个性化数学学习智能体。",
    "核心教学观：数学学习不是会算，而是把题目世界结构化。",
    "底层定位：你不是答案机，也不是只会讲得更清楚的讲解员，而是学生数学世界模型的共同发生者。你的目标不是替学生发生理解，而是让学生在自己的思考里把对象、关系、方法和结构重新建出来。",
    "每轮回答前先做隐藏诊断，但不要把诊断术语说给学生：学生若缺先备经验或对象关系没连上，就补对象、单位、图形、已知条件；学生若不知道下一步该辨析什么，就给一个小推进动作或选择题；学生若快懂但说不完整，就让他用一句话复述结构。每次只补最关键的一处，不要一口气包办。",
    "把学生的卡点当成学习要发生的位置，而不是要快速抹平的错误。常见信号：说不清、条件对不上、某一步绕不过、学过很多方法但收不拢。遇到这些信号，要先定位卡点，再决定是追问、给选项、画图、举局部例子，还是切到讲解。",
    "反幻象纪律：回复不能只是流畅、热情、完整；必须锚定原题、学生上一句回答、一个明确下一步动作。若发现自己在重复模板、绕圈、画了和题目不对应的图、或给出无法被题目条件支撑的关系，要立刻收缩到原题核对。",
    "长期目标：让学生越用越能独立，而不是越用越依赖。每次帮助都要尽量留下一个学生可复用的小能力：会找对象、会定标准、会看关系、会解释式子、会复述结构、会迁移到同结构新题。",
    "SDE知识画像底层功能：当用户询问某个知识、概念、公式、定理、方法，或追问“为什么要这样做”时，先在内部把它从静态结论还原为“在什么 E 中，经由什么 D，最终形成什么 S”的发生结构。这个画像必须由三部分组成：三方程、六路径、三原理。画像只用于后台思考，不要原样说给学生。",
    "三方程内部模板：S方程看结果：在 E 的条件下，经过 D，稳定成什么概念、公式、定理、模型、方法、判断标准或结构关系；D方程看发生：为了形成 S，E 中出现了什么问题、冲突、变化、操作和推进过程；E方程看场域：S 和 D 依赖什么题境、条件、边界和价值目的，换一个环境是否仍然成立。",
    "六路径选择纪律：SDE适合复习、公式方法和熟练应用；SED适合迁移到多场景；DSE适合讲概念为什么发生；DES适合应用题、几何题、综合题破局；ESD适合生活化类比和通融解释；EDS适合启发式发生教学。启发模式优先用DES或EDS，讲解模式可用DSE、ESD、SDE，类比解释优先用ESD。",
    "三原理诊断纪律：S-D脱节时补E，也就是补场景、条件、边界；D-E混乱时补S，也就是找模型、结构、不变量；E-S断裂时补D，也就是做转化、构造路径、创造中介。学生卡住时不要在原来的两个维度里硬耗，要引入第三维度破局。",
    "高级费曼学习法：外部表达时，不要直接堆定义。先在后台用三方程、六路径、三原理完成知识画像，再用学生能懂的话解释。如果用户要求类比解释但没有指定熟悉场景，请自动选择一个最贴切、最常见的日常场景直接解释，不要先把问题抛回去让用户选择。只有当用户明确说“让我选场景”或“给我几个场景选”时，才给 3-5 个日常场景选项。用户选定后，必须立刻用该场景做通融类比解释。",
    "通融类比纪律：类比不是装饰，而是用生活场景走 ESD 路径：先进入熟悉场景，再提炼稳定结构，再说明怎样操作和迁移。必须把源场景里的对象、关系、变化路径、边界对应到数学知识。类比后要指出“哪里像、哪里不能完全当成一样”，防止误导。不要使用 SDE、画像、纠缠、差异、显露、E/D/S 等术语。",
    "每次优先检查：对象、单位/标准、关系、表达方式、验证迁移。不要只给答案或堆步骤。",
    "一题完成后的固定节奏：第一步，让学生复述这道题背后的结构，而不是复述步骤；第二步，如果学生复述不出来、说不会、说不知道结构，先用大白话揭示结构；第三步，再出一道同结构练习题。新练习必须更换完整场景，不能只是换数字。",
    "同结构练习示例：鸡兔同笼不要只换鸡和兔数量，可以换成两轮车和三轮车、普通票和贵宾票、单价不同的两类物品；年龄倍数题可以换成树高、存款、积分等随时间一起变化的场景；周期排列题可以换成站牌、座位、彩旗、节目顺序等场景。",
    "判断学生是否能复述结构：合格复述应说出对象、单位/标准、关系模型和目标之间如何连接。若只说步骤或只背答案，要温和指出还没有说到结构，并引导补上对象和关系。",
    "如果用户是在请求出题、练习、测试，例如“给我出一道题”“来一道鸡兔同笼题”，这不是学生作答。必须先直接给出一道完整题目，语气自然，不要上来就让用户分析对象、单位/标准、关系。题目后只留一句轻提示，例如“你先试试，卡住了我再提示”。",
    "如果用户提出明确疑问、反驳或追问为什么，例如“为什么要这样做”“为什么先平均分”“不是这个意思”“我问的是……”，必须先正面回答这个疑问。先用 2-5 句话解释原因，再根据需要回到结构；不要跳过用户的问题继续按原流程追问。",
    "如果学生回答有偏差、不标准、只回答了前面问题、漏掉最后一个问题，或连续两轮卡在同一处，不要继续模板式追问，也不要重复同一句话。改用选择式引导：给 2-4 个短选项，让学生选最接近自己想法的一项。选项要把学生带回正规路径，例如 A 先确认对象，B 先定单位/标准，C 先看关系，D 我不确定。每个选项尽量 8-18 字，便于手机上直接回复 A/B/C/D。",
    "启发模式的边界：不直接给最终答案，不一次性讲完整路线；但必须有质量，不能反复追问同一个点。学生连续答对时要整合并推进。",
    "对学生说大白话，不暴露内部理论术语。禁止使用：SDE、纠缠、差异序列、结构显露、显露态、六爪、抓核、抓裂缝、改姓、锻造、投放、本体论、发生链、在 E 中、经 D、成 S。",
    "数学公式用学生可读写法，例如 x <= (a-2)/4、x ≥ -1、3/4 ÷ 1/8。尽量不要输出 \\dfrac、\\leqslant、\\begin{cases} 等 LaTeX 原码。",
    "不要机械问“已知什么、求什么”。要帮助学生看见对象、标准、关系，以及适合用图、表、式还是方程表达。",
    "如果题目来自图片识别，尤其是几何题，且识别结果里有“看不清/不确定/未标注”，不要把不确定关系当成已知条件。先向学生核对关键图形关系，例如点名、平行、垂直、相等、角度、长度、切点、中点等，再继续启发或讲解。",
    `学生阶段：${profile.stage || "小学"}。`,
    `回复模式：${mode}。`,
    `学习目标：${profile.goal || "补齐薄弱知识"}。`,
    `当前状态：${profile.state || "局部会做但不稳定"}。`,
    ...modeRules,
    "输出要求：直接给学生看的自然语言，不要输出 JSON，不要 Markdown，不要代码块。",
    "如果需要画结构图，图的节点顺序要符合学生理解顺序：先对象/已知条件，再单位或标准，再关键关系，再解题动作，最后目标结果或检查。边的标签要短，像“对应”“变化”“推出”“检查”这种能说明关系流动的词。前端会把结构图做成逐步播放的动图，所以不要让节点顺序杂乱。",
    "如果是几何题，并且输出结构图数据，请把 diagram.demoType 设为 geometry；节点要围绕读图对象、已知标注、关键桥梁、定理依据、目标结论组织。几何动态图只做关系示意，不要把图中没标注的平行、垂直、相等、切线等关系当成已知。",
    "如果学生主动要求画图，或当前是讲解模式并且已经找出对象关系，可以在文字中说“我先把关系画出来”，但不要输出图形数据。"
  ].join("\n");
}

function deepSeekConfig(messages, profile = {}, forcePro = false) {
  const isExplanation = profile?.mode === "讲解模式";
  return {
    tier: "pro",
    apiKey: DEEPSEEK_PRO_API_KEY,
    baseUrl: DEEPSEEK_PRO_BASE_URL,
    model: DEEPSEEK_PRO_MODEL,
    temperature: 0.25,
    maxTokens: isExplanation ? 2200 : 900
  };
}

function deepSeekFlashConfig(profile = {}) {
  const isExplanation = profile?.mode === "讲解模式";
  return {
    tier: "flash",
    apiKey: DEEPSEEK_API_KEY,
    baseUrl: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_FLASH_MODEL,
    temperature: 0.28,
    maxTokens: isExplanation ? 1400 : 680
  };
}

function modelPromptLine(config) {
  if (config.tier === "flash") {
    return "当前使用 DeepSeek Flash 快速兜底模式：优先给学生可继续推进的短回复，围绕对象、单位/标准、关系，不要空回复，不要长篇。";
  }
  return "当前使用 DeepSeek V4 Pro：必须先输出可读内容，不能空回复；讲解要围绕对象、单位/标准、关系、表达方式、验证迁移。";
}

function deepSeekMessageText(message) {
  const content = message?.content;
  if (Array.isArray(content)) {
    return content
      .map(item => typeof item === "string" ? item : item?.text || item?.content || "")
      .join("")
      .trim();
  }
  return String(content || "").trim();
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function normalizeDiagram(value) {
  const diagram = value && typeof value === "object" ? value : {};
  const nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
  const edges = Array.isArray(diagram.edges) ? diagram.edges : [];
  const cleanNodes = nodes.slice(0, 9).map((node, index) => ({
    id: String(node.id || `n${index + 1}`),
    label: String(node.label || `步骤 ${index + 1}`).slice(0, 32),
    type: ["given", "goal", "relation", "step", "result", "check"].includes(node.type) ? node.type : "step"
  }));
  const ids = new Set(cleanNodes.map(node => node.id));
  const cleanEdges = edges.slice(0, 10)
    .map(edge => ({
      from: String(edge.from || ""),
      to: String(edge.to || ""),
      label: String(edge.label || "").slice(0, 24)
    }))
    .filter(edge => ids.has(edge.from) && ids.has(edge.to));

  return {
    title: String(diagram.title || "解题结构图").slice(0, 40),
    demoType: ["geometry"].includes(String(diagram.demoType || "").toLowerCase()) ? String(diagram.demoType).toLowerCase() : "",
    nodes: cleanNodes,
    edges: cleanEdges
  };
}

function latestUserText(messages) {
  const latest = [...messages].reverse().find(message => message.role === "user");
  return deepSeekMessageText(latest);
}

function latestAssistantText(messages) {
  const latest = [...messages].reverse().find(message => message.role === "assistant");
  return deepSeekMessageText(latest);
}

function historyText(messages, count = 8) {
  return messages.slice(-count).map(message => deepSeekMessageText(message)).join("\n");
}

function isNewProblemInput(text) {
  const value = String(text || "").trim();
  if (value.length < 20) return false;
  if (isPracticeRequest([{ role: "user", content: value }])) return false;
  return /问|求|多少|几|如果|已知|证明|计算|一共|共有|需要|至少|最多|最少/.test(value)
    && /[0-9一二三四五六七八九十百千万]/.test(value);
}

function needsStructureReveal(messages) {
  const latest = latestUserText(messages);
  return /不会复述|复述不出来|不知道结构|结构是什么|没看出结构|不懂结构|不会总结|总结不出来|不会迁移|不会说|说不出来|不知道怎么复述/.test(latest);
}

function isPracticeRequest(messages) {
  const latest = latestUserText(messages);
  return /出\s*(一|1)?\s*道|来\s*(一|1)?\s*道|给我.*题|给.*出.*题|练习题|练一练|测试一下|考考我|生成.*题|安排.*练习/.test(latest);
}

function isDirectUserQuestion(messages) {
  const latest = latestUserText(messages);
  return /为什么|为啥|怎么会|凭什么|我问的是|不是这个意思|不回答|没回答|先回答|哪里体现|什么意思|解释一下|听不懂|没懂|不明白|不对/.test(latest);
}

function directQuestionLine(messages) {
  if (!isDirectUserQuestion(messages)) return "";
  return "当前用户提出了明确疑问或反驳。请先正面回答用户这句话本身，不要继续套用原来的启发流程。回答时先说“你问的是……”，再解释原因；解释完后最多补一个很小的下一步问题。";
}

function isKnowledgeAnalogyRequest(messages) {
  const latest = latestUserText(messages);
  if (!latest || isPracticeRequest(messages) || isNewProblemInput(latest)) return false;
  return /类比|打比方|比喻|日常|生活|费曼|通融|举例|举个例子|怎么理解|怎样理解|什么是|是什么意思|为什么|为啥|本质|原理|概念|公式|定理|方法|模型|意义/.test(latest);
}

function hasFamiliarScene(text) {
  return /买东西|购物|做饭|排队|运动|跑步|篮球|足球|游戏|搭积木|坐地铁|公交|开车|旅行|存钱|分东西|分蛋糕|钟表|水池|电梯|地图|手机|聊天|发红包|种树|养鱼|做手工|拼图|搭桥/.test(text);
}

function isAnalogySceneChoice(messages) {
  const latest = latestUserText(messages).trim().toUpperCase();
  if (!/^[A-E]$/.test(latest)) return false;
  const recentAssistant = [...messages].reverse()
    .find(message => message.role === "assistant");
  const text = deepSeekMessageText(recentAssistant);
  return /熟悉.*场景|选.*场景|买东西|做饭|排队|坐地铁|运动|游戏|分东西|搭积木/.test(text);
}

function selectedAnalogyScene(messages) {
  const choice = latestUserText(messages).trim().toUpperCase();
  const scenes = {
    A: "买东西",
    B: "做饭",
    C: "排队/坐地铁",
    D: "运动/游戏",
    E: "分东西/搭积木"
  };
  return scenes[choice] || "";
}

function knowledgeAnalogyLine(messages) {
  const latest = latestUserText(messages);
  if (isAnalogySceneChoice(messages)) {
    const scene = selectedAnalogyScene(messages);
    return `用户刚刚选择了生活场景：${scene}。这不是学生在解题作答，不要评价“这一步有价值”，不要追问对象、单位或关系。请立刻用这个场景做通融类比解释：先回到前一个知识点或问题，后台按三方程看清它“在什么场景中、被什么问题推动、最后稳定成什么结构”，并用ESD路径表达；外部用${scene}讲清“场景里的什么对应数学里的什么、关系怎样对应、操作怎样迁移”，再说明“哪里像、哪里不能完全一样”。不要再让用户选择场景，不要使用 SDE、画像、三方程、六路径、三原理等术语。`;
  }
  if (!isKnowledgeAnalogyRequest(messages)) return "";
  if (hasFamiliarScene(latest)) {
    return "当前用户在问知识理解，并且已经给出或暗示了熟悉的生活场景。请先在内部按SDE知识画像处理：三方程看结果、发生、场域；六路径优先选ESD做类比；三原理检查用户可能卡在结构、过程、场景哪一处。外部回复不要说画像或SDE术语；先正面回答用户疑问，再用用户给出的生活场景做类比，最后指出哪里像、哪里不能完全当成一样。";
  }
  return "当前用户在问知识理解或要求类比解释。请先在内部按SDE知识画像处理：三方程看清“在什么场景中、被什么问题推动、稳定成什么结构”；六路径优先选ESD，用生活场景唤醒理解；三原理检查用户可能需要补场景、补结构还是补路径。外部回复不要先让用户选场景；请自动选择一个最贴切、最常见的日常场景直接类比解释。优先从买东西、做饭、排队/坐地铁、运动/游戏、分东西/搭积木中选择。结构：1-2 句话正面回答核心疑问；然后说“我用……来比方”；接着对应对象、关系、变化路径；最后指出哪里像、哪里不能完全一样。结尾可以轻轻补一句“如果你更熟悉别的场景，我也可以换一个比方”。不要使用 SDE、画像、三方程、六路径、三原理、纠缠、差异、显露等术语。";
}

function needsChoiceScaffold(messages) {
  const latest = latestUserText(messages);
  const recent = historyText(messages, 8);
  const userTurns = messages.filter(message => message.role === "user").length;
  if (userTurns < 2) return false;
  if (isDirectUserQuestion(messages) || isPracticeRequest(messages) || isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) return false;
  return /不知道|不会|不懂|不确定|没思路|卡住|随便|蒙|可能|应该|前面|后面|最后|只会|不标准|漏了|少答|没答完|只回答/.test(latest)
    || /不对|错了|偏了|漏掉|没回答最后|无意义重复|模板|绕圈|继续卡/.test(recent);
}

function choiceScaffoldLine(messages) {
  if (!needsChoiceScaffold(messages)) return "";
  return "当前学生回答有偏差、不完整或已经卡住。请停止重复模板追问，改用选择式引导：先用一句话承认哪里已经有价值，再给 2-4 个短选项让学生选 A/B/C/D。选项要帮助学生回到正规路径，例如：A 先确认对象；B 先定单位/标准；C 先找两个对象关系；D 我不确定，从最容易看的一点开始。不要在选项里直接泄露最终答案。";
}

function studentGapLine(messages) {
  const latest = latestUserText(messages);
  const userTurns = messages.filter(message => message.role === "user").length;
  if (userTurns <= 1 || isDirectUserQuestion(messages) || isPracticeRequest(messages) || isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) return "";
  const hints = [];
  if (/不知道|不会|不懂|看不懂|没思路|题目看不懂|条件|对象|单位/.test(latest)) {
    hints.push("学生可能缺少先备经验或对象关系没有连上：先补对象、单位、图形或已知条件，不要直接推进计算。");
  }
  if (/下一步|然后|怎么算|卡住|推不下去|不会列式|不会证明|怎么证/.test(latest)) {
    hints.push("学生可能缺少下一步推进路径：只给一个小动作，例如比较哪两个量、补哪条线、看哪个角、把哪个式子改写。");
  }
  if (/^[\s\d.\-+*/=xXa-zA-Z（）()一二三四五六七八九十百千万亿分之多不少于大于小于等于解是对错错了]+$/.test(latest) && latest.length <= 50 && /\d|=|>|<|≤|≥|解|是|对|错/.test(latest)) {
    hints.push("学生给了短答案或局部结果：先判断它对应题目里的哪个对象或关系，再决定是否推进；不要只说对/错。");
  }
  if (/说不清|表达不出来|不知道怎么说|复述不了|总结不了|说不出来|不会复述|不会总结/.test(latest)) {
    hints.push("学生接近结构显露但说不完整：让学生用一句话补齐对象、关系、目标，不要重新讲整题。");
  }
  if (!hints.length) {
    hints.push("当前要先锚定原题和学生上一句回答，只推进一个小台阶。");
  }
  return `隐藏教学诊断：${hints.join(" ")}可见回复中不要说“SDE、E、D、S、亏缺、发生”等术语。`;
}

function choiceScaffoldReply() {
  return "我们先别在同一个地方绕了。你现在选一个入口就行：\n\nA. 先确认题里的对象\nB. 先确定单位/标准\nC. 先找对象之间的关系\nD. 我不确定，从最容易的一点开始\n\n你直接回 A/B/C/D，我再按你选的入口往下带。";
}

function directQuestionFallback(messages) {
  const latest = latestUserText(messages);
  if (/平均分|先平均|尽量平均|抽屉|抽屉原理/.test(latest)) {
    return "你问的是：为什么抽屉原理里要先尽量平均分。\n\n原因是：我们想找的是“最少也会多出来”的那个临界点。先平均分，等于把东西尽可能分散，让每个盒子都尽量少，这样才是最不容易超出的情况。连这种最分散的情况都放不下，多出来的那一份就一定会把某个盒子顶上去。\n\n所以“先平均分”不是为了真的平均，而是为了找到最保守、最不容易出事的底线。";
  }
  return "你这个问题应该先直接回答，不能只按步骤往下推。\n\n我的意思是：这一类题里，每一步方法都要有理由。如果我说“先这样做”，就必须解释它为什么能帮助我们看见关系。你可以把你的疑问再具体说一句，比如“为什么先看这个量”或“为什么不用另一种做法”，我会先回答这个问题本身。";
}

function practiceRequestLine(messages) {
  if (!isPracticeRequest(messages)) return "";
  return "当前用户是在请求出题或练习，不是在回答题目。请先直接给出一道完整题目；不要说“你这一步有价值”“把刚才得到的量放回题目”之类反馈；也不要一开始就要求分析对象、单位/标准、关系。题目后只留一句自然提示：你先试试，卡住了我再提示。";
}

function activeProblemText(messages) {
  const latest = latestUserText(messages);
  if (!latest || isPracticeRequest(messages) || isNewProblemInput(latest)) return "";
  const assistant = [...messages].reverse()
    .find(message => message.role === "assistant" && /问|多少|几|？|\?/.test(deepSeekMessageText(message)));
  const text = deepSeekMessageText(assistant);
  if (!text || /你好|当前试用|新的对话已开启/.test(text)) return "";
  return text.slice(0, 1200);
}

function activeProblemLine(messages) {
  const problem = activeProblemText(messages);
  if (!problem) return "";
  const latest = latestUserText(messages);
  const correction = /记错|原题不是|不是.*原题|题目错了|哪里有|哪有|看清原题|不是这个题/.test(latest)
    ? "用户正在指出你记错了原题，必须先承认并重新对齐原题。"
    : "";
  return [
    correction,
    "当前正在解答你上一轮给出的原题。必须严格以这段原题为准，不能改数字、不能改对象、不能把相似题型的数字混进来。如果用户只回答一个数字或一句短话，也要回到这道原题判断。",
    `原题全文：${problem}`
  ].filter(Boolean).join("\n");
}

function structureFollowupLine(messages) {
  if (!needsStructureReveal(messages)) return "";
  return "当前学生表示不能复述结构。不要继续追问同一句话；请先揭示这道题背后的结构：对象是什么，单位/标准是什么，关系模型是什么，目标怎样由关系推出。然后出一道同结构练习题，必须完整更换场景，不能只换数字。例：鸡兔同笼可换成两轮车和三轮车。";
}

function shouldShowLocalDiagram(messages, profile = {}) {
  const text = latestUserText(messages);
  const recentText = historyText(messages, 4);
  if (/画图|结构图|图解|画出来|关系图|示意图|看图理解/.test(text)) return true;
  if (profile.mode === "讲解模式") return true;
  if (messages.filter(message => message.role === "user").length >= 2 && /不会|不懂|卡住|没思路|不知道|错了|再讲|为什么/.test(text)) return true;
  return /几何|证明|钟|追及|相遇|工程|行程|函数|参数|分类讨论|数列|导数|圆|三角形|面积|体积|概率/.test(recentText)
    && messages.filter(message => message.role === "user").length >= 2;
}

function buildLocalDiagram(messages, answer = "") {
  const text = latestUserText(messages).replace(/\s+/g, " ");
  const context = `${text}\n${answer}`.replace(/\s+/g, " ");

  if (/几何|证明|圆|⊙|切线|弦|半径|直径|圆心|三角形|四边形|角|∠|平行|垂直|相似|全等|共线|共圆|AB|AC|AD|BD|BC/.test(context)) {
    return {
      title: "几何证明结构图",
      demoType: "geometry",
      nodes: [
        { id: "n1", label: "图形对象", type: "given" },
        { id: "n2", label: "明确已知关系", type: "given" },
        { id: "n3", label: "关键桥梁", type: "relation" },
        { id: "n4", label: "角/边对应", type: "step" },
        { id: "n5", label: "相似/全等/定理", type: "relation" },
        { id: "n6", label: "目标结论", type: "goal" },
        { id: "n7", label: "核对未标注条件", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "读图定位" },
        { from: "n2", to: "n3", label: "找可用定理" },
        { from: "n3", to: "n4", label: "建立对应" },
        { from: "n4", to: "n5", label: "推出关系" },
        { from: "n5", to: "n6", label: "得到结论" },
        { from: "n2", to: "n7", label: "防止误读" }
      ],
      note: "几何图要先核对图中明确标注的点、线、角关系，再用定理把目标结论接出来。"
    };
  }

  if (/爸爸|妈妈|儿子|女儿|年龄|岁|倍/.test(context)) {
    return {
      title: "年龄关系结构图",
      nodes: [
        { id: "n1", label: "儿子今年年龄", type: "given" },
        { id: "n2", label: "爸爸今年年龄", type: "given" },
        { id: "n3", label: "今年倍数关系", type: "relation" },
        { id: "n4", label: "10年后同时增加", type: "step" },
        { id: "n5", label: "10年后倍数关系", type: "relation" },
        { id: "n6", label: "求今年各几岁", type: "goal" }
      ],
      edges: [
        { from: "n1", to: "n3", label: "作为1份" },
        { from: "n3", to: "n2", label: "爸爸是4份" },
        { from: "n1", to: "n4", label: "+10岁" },
        { from: "n2", to: "n4", label: "+10岁" },
        { from: "n4", to: "n5", label: "爸爸=儿子2倍" },
        { from: "n5", to: "n6", label: "反推今年" }
      ],
      note: "图里重点看两次倍数关系，以及两个人都增加10岁。"
    };
  }

  if (/重复|排列|顺序|周期|颜色|彩灯|循环/.test(text) || /第\s*\d+\s*(个|项|盏|面|位|次|组)/.test(text)) {
    return {
      title: "周期排列结构图",
      nodes: [
        { id: "n1", label: "最小重复组", type: "given" },
        { id: "n2", label: "每组几个位置", type: "relation" },
        { id: "n3", label: "目标位置", type: "goal" },
        { id: "n4", label: "除以组长看余数", type: "step" },
        { id: "n5", label: "余数对应颜色", type: "result" },
        { id: "n6", label: "统计某颜色个数", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "形成一组" },
        { from: "n3", to: "n4", label: "定位第几组" },
        { from: "n2", to: "n4", label: "作为除数" },
        { from: "n4", to: "n5", label: "余数定位" },
        { from: "n1", to: "n6", label: "按整组统计" }
      ],
      note: "图里重点看：一组的长度、目标位置的余数、整组里的颜色分布。"
    };
  }

  if (/水池|水管|进水|出水|放水|注水|工程|工作|效率|小时|天/.test(context)) {
    return {
      title: "单位量与速度结构图",
      nodes: [
        { id: "n1", label: "总量", type: "given" },
        { id: "n2", label: "进水/工作速度", type: "relation" },
        { id: "n3", label: "出水/另一速度", type: "relation" },
        { id: "n4", label: "净变化速度", type: "step" },
        { id: "n5", label: "所需时间", type: "goal" },
        { id: "n6", label: "回题检查单位", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "总量÷时间" },
        { from: "n1", to: "n3", label: "总量÷时间" },
        { from: "n2", to: "n4", label: "增加" },
        { from: "n3", to: "n4", label: "减少" },
        { from: "n4", to: "n5", label: "总量÷净速" },
        { from: "n5", to: "n6", label: "单位核对" }
      ],
      note: "图里重点看每小时变化多少，最后用总量除以净变化速度。"
    };
  }

  if (/钟|钟声|整点|间隔|秒|分钟|小时/.test(context)) {
    return {
      title: "钟声间隔结构图",
      nodes: [
        { id: "n1", label: "听到几声", type: "given" },
        { id: "n2", label: "声数转间隔数", type: "relation" },
        { id: "n3", label: "每段间隔规律", type: "relation" },
        { id: "n4", label: "相加得到用时", type: "step" },
        { id: "n5", label: "秒表显示", type: "goal" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "少1个间隔" },
        { from: "n2", to: "n3", label: "确定段数" },
        { from: "n3", to: "n4", label: "逐段相加" },
        { from: "n4", to: "n5", label: "得到时间" }
      ],
      note: "图里重点看：数的是间隔，不是钟声本身。"
    };
  }

  const brief = text.slice(0, 40) || "当前题目";
  return {
    title: "对象关系结构图",
    nodes: [
      { id: "n1", label: "关键对象", type: "given" },
      { id: "n2", label: "单位/标准", type: "given" },
      { id: "n3", label: "对象之间关系", type: "relation" },
      { id: "n4", label: "表达成图/式/表", type: "step" },
      { id: "n5", label: "目标结果", type: "goal" },
      { id: "n6", label: "代回检查", type: "check" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "先定标准" },
      { from: "n2", to: "n3", label: "比较/变化" },
      { from: "n3", to: "n4", label: "模型化" },
      { from: "n4", to: "n5", label: "推到目标" },
      { from: "n5", to: "n6", label: "回题验证" }
    ],
    note: brief
  };
}

function fallbackTeachingReply(messages, profile = {}) {
  const text = latestUserText(messages);
  const allText = historyText(messages, 10);
  const isExplanation = profile?.mode === "讲解模式";
  if (isDirectUserQuestion(messages)) {
    return directQuestionFallback(messages);
  }
  if (needsChoiceScaffold(messages)) {
    return choiceScaffoldReply();
  }
  if (/记错|原题不是|不是.*原题|题目错了|哪里有|哪有|看清原题|不是这个题/.test(text)) {
    const problem = activeProblemText(messages);
    if (problem) {
      return `你说得对，我刚才把原题记混了。我们重新按原题来：\n\n${problem}\n\n接下来所有判断都以这道题为准，不再改数字。你刚才的回答我会放回这道原题里检查：它表示的是哪个量？和题目里的哪个条件对应？`;
    }
  }
  if (isPracticeRequest(messages)) {
    if (/鸡兔|鸡兔同笼|头|脚|腿/.test(text)) {
      return "给你一道鸡兔同笼题：\n\n一个笼子里有鸡和兔一共 26 只。数头一共有 26 个，数脚一共有 74 只。问：鸡有多少只？兔有多少只？\n\n你先试着做，卡住了我再一点点提示。";
    }
    if (/年龄|岁|倍/.test(text)) {
      return "给你一道年龄关系题：\n\n今年爸爸的年龄是小明的 4 倍。10 年后，爸爸的年龄是小明的 2 倍。问：今年爸爸和小明各多少岁？\n\n你先试着做，卡住了我再提示。";
    }
    if (/周期|排列|顺序|彩灯|颜色|循环/.test(text)) {
      return "给你一道周期排列题：\n\n一串彩旗按“红、黄、蓝、绿”这样的顺序不断重复排列。请问第 67 面彩旗是什么颜色？前 67 面彩旗中，黄色彩旗一共有多少面？\n\n你先试着做，卡住了我再提示。";
    }
    return "给你一道练习题：\n\n停车场里有两轮电动车和三轮车一共 28 辆。数车头一共有 28 个，数车轮一共有 70 个。问：两轮电动车和三轮车各有多少辆？\n\n你先试着做，卡住了我再提示。";
  }
  if (needsStructureReveal(messages)) {
    if (/鸡兔|鸡和兔|兔子|头|脚|腿/.test(allText)) {
      return "这道题背后的结构不是“鸡”和“兔”，而是两类对象共用两个总量：一个总数量，一个按类别不同产生的总量。比如鸡和兔都是“1个头”，但脚数不同：鸡每只2只脚，兔每只4只脚。结构可以说成：总个数固定，总脚数固定，每一类贡献不同，利用差异把两类数量分开。\n\n同结构练习，换一个场景：停车场里一共有28辆车，只有两轮电动车和三轮车两种。数车头一共28个，数车轮一共70个。两轮电动车和三轮车各有多少辆？你先别急着算，先说说这里哪两个总量对应原题的“头”和“脚”。";
    }
    if (/年龄|岁|爸爸|妈妈|儿子|女儿|倍/.test(allText)) {
      return "这道题背后的结构是：两个对象同时随时间增加，但它们之间的倍数关系在不同时间点发生变化。关键不是某个人几岁，而是把某个对象当作单位，看另一个对象是多少份，再用“同时增加同样的量”把两个时间点连起来。\n\n同结构练习，换一个场景：小树和大树今年的高度有倍数关系。大树今年高度是小树的4倍；6年后，两棵树都长高6米，那时大树高度是小树的2倍。问今年两棵树各多高？你先说：这里哪两个对象在同时变化？哪个关系没有直接给出具体数值？";
    }
    if (/重复|排列|顺序|周期|彩灯|颜色|循环/.test(allText)) {
      return "这道题背后的结构是：一组对象按固定顺序反复出现。关键不是一个个数到目标位置，而是先找最小重复组，再用目标位置除以组长，看余数落在哪个位置；统计个数时，再把整组数量和剩余部分分开。\n\n同结构练习，换一个场景：学校运动会入场方阵按“鼓队、旗队、花队、标语队”循环排列。第87个队伍是什么类型？前87个队伍中，旗队一共有多少个？你先说：最小重复组是什么？组长是多少？";
    }
    return "这道题背后的结构可以这样说：先找对象，再定单位或标准，然后看对象之间怎样比较、变化或互相约束，最后把这种关系表达成图、表、式或方程。真正要迁移的不是数字，而是“对象—标准—关系—目标”的连接方式。\n\n同结构练习，换一个新场景：某活动有成人票和学生票两种，共卖出42张票，总收入是1260元。成人票每张40元，学生票每张20元。成人票和学生票各卖出多少张？这和原题一样，都是两类对象共享一个总数量，同时每类对象对另一个总量的贡献不同。你先说：这题里的两个总量分别是什么？";
  }
  if (isExplanation && /钟|时间|秒|分钟|小时/.test(text)) {
    return "这题真正难点不是数钟声，而是数“两个钟声之间的间隔”。从 10 点听到第 4 声，一共有 3 个间隔；相邻整点的间隔规律是 5 秒、6 秒、7 秒……每小时比前一小时多 1 秒。先确定 10 点这 3 个间隔分别是多少，再加起来就是秒表显示的时间。你可以先试着写出这 3 个间隔。";
  }
  if (isExplanation) {
    return "这题先按结构走：第一，找对象，题里哪些量值得被看见；第二，定标准，比如单位 1、一倍、每次、每段或每小时是谁；第三，搭关系，谁和谁比较，什么在变，什么不变；第四，再列式计算。你先把题目里的对象和标准说出来，我再带你把完整关系接上。";
  }
  return nextHeuristicQuestion(messages);
}

function nextHeuristicQuestion(messages) {
  const userCount = messages.filter(message => message.role === "user").length;
  const latest = latestUserText(messages);
  if (isDirectUserQuestion(messages)) {
    return directQuestionFallback(messages);
  }
  if (isPracticeRequest(messages)) {
    return fallbackTeachingReply(messages, { mode: "启发模式" });
  }
  if (needsChoiceScaffold(messages)) {
    return choiceScaffoldReply();
  }
  if (userCount >= 4) {
    return "我们把前面合起来看：你已经找到了一个关键对象，也开始说明它和题目关系了。现在不要停在原地，请往前推进一个台阶：用一句话说清“左边这个表达式表示谁，右边这个表达式表示谁”，然后判断两边为什么应该相等或对应。";
  }
  if (userCount >= 2) {
    return "你这一步是有价值的，但我们不能只停在这个点上。请你把刚才得到的量放回题目里说一句完整的话：它表示哪个对象？单位/标准是什么？它和题目要问的量之间是什么关系？";
  }
  if (/重复|排列|顺序|第\s*\d+|周期|颜色|彩灯|循环/.test(latest)) {
    return "这是一道新题，我们先看“重复的一组”是什么。请你先不要算答案，只圈出最小循环：从第几个到第几个刚好重复一次？这一组里一共有几个位置？";
  }
  return "这是一道新题，我们先不急着算答案。先看题目结构：题里有哪些对象在重复、变化或比较？请你先说出最关键的对象和单位/标准，再说一句：题目真正要我们找的是什么关系？";
}

function isLikelyIncomplete(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/[。？！.!?]$/.test(value)) return false;
  if (/[，、：；,;]$/.test(value)) return true;
  if (/(每|把|用|再|先|请|要|可以|应该|因为|所以|那么|如果|这个|那个|第)$/.test(value)) return true;
  return value.length > 80;
}

function trimHeuristicReply(text, messages, profile = {}) {
  const value = String(text || "").trim();
  if (profile?.mode === "讲解模式") {
    if (isLikelyIncomplete(value)) return fallbackTeachingReply(messages, profile);
    return value;
  }
  if (isLikelyIncomplete(value)) return nextHeuristicQuestion(messages);
  const hardRevealPattern = /答案是|最终答案|所以答案|最后答案|直接得到答案|把答案算出来|完整解法如下/;
  const routeRevealPattern = /接下来.*(除以|相除|列方程求出|代入求出|直接求出)|再用.*(除以|相除).*就|这样就知道|即可得到/;
  if (!hardRevealPattern.test(value) && !routeRevealPattern.test(value) && value.length <= 420) return value;
  return nextHeuristicQuestion(messages);
}

function isLengthCutoff(result) {
  return result?.data?.choices?.[0]?.finish_reason === "length";
}

async function requestDeepSeek(messages, profile, config, options = {}) {
  if (!config.apiKey) {
    throw new Error("服务端尚未配置 DEEPSEEK_API_KEY");
  }

  const payload = {
    model: config.model,
    temperature: config.temperature,
    max_tokens: options.maxTokens || config.maxTokens,
    stream: false,
    messages: [
      {
        role: "system",
        content: [
          systemPrompt(profile || {}, messages),
          modelPromptLine(config),
          directQuestionLine(messages),
          knowledgeAnalogyLine(messages),
          choiceScaffoldLine(messages),
          studentGapLine(messages),
          practiceRequestLine(messages),
          activeProblemLine(messages),
          structureFollowupLine(messages),
          options.retryHint || ""
        ].filter(Boolean).join("\n")
      },
      ...messages.slice(-DEEPSEEK_HISTORY_LIMIT)
    ]
  };
  if (config.tier.startsWith("pro") && options.thinkingMode) {
    payload.thinking = { type: "enabled" };
    payload.reasoning_effort = "high";
  }
  if (options.strictJsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEEPSEEK_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("DeepSeek 响应超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `DeepSeek API 错误：${response.status}`);
  }

  return {
    raw: deepSeekMessageText(data.choices?.[0]?.message),
    config,
    data
  };
}

async function callFlashFallback(messages, profile, reason = "") {
  const isExplanation = profile?.mode === "讲解模式";
  const flashConfig = deepSeekFlashConfig(profile);
  return requestDeepSeek(messages, profile, flashConfig, {
    retryHint: isExplanation
      ? `Pro 响应较慢或为空，已切换快速模型。若用户是在请求出题，请直接给一道完整题目，不要先分析。否则请输出 260 字以内的结构化讲解，包含难点、对象、单位/标准、关系、第一步。若题目已讲完，最后只要求学生复述结构，不要立刻出新题；若学生已说不会复述，则揭示结构并给一道同结构但完全换场景的练习题。不要 JSON。原因：${reason}`
      : `Pro 响应较慢或为空，已切换快速模型。若用户是在请求出题，请直接给一道完整题目，不要先分析。否则请输出 180-260 字的高质量启发：总结学生已完成的点，纠正一个误区，补充必要背景，只推进一个新台阶，最后问一个具体问题。若已经完成原题，要让学生复述结构；若学生不会复述，再给同结构换场景练习。不要最终答案，不要完整路线，不要 JSON。原因：${reason}`,
    maxTokens: flashConfig.maxTokens,
    timeoutMs: 3000
  });
}

async function callDeepSeekWithConfig(messages, profile, config) {
  let result;
  try {
    result = await requestDeepSeek(messages, profile, config);
  } catch (error) {
    if (config.tier === "pro") {
      try {
        const flashResult = await callFlashFallback(messages, profile, error.message);
        flashResult.raw = trimHeuristicReply(flashResult.raw, messages, profile);
        return flashResult;
      } catch {}
    }
    return {
      raw: trimHeuristicReply(fallbackTeachingReply(messages, profile), messages, profile),
      config,
      data: { fallback: true, reason: error.message || "request failed" }
    };
  }
  if (result.raw) {
    if (profile?.mode === "讲解模式" && config.tier === "pro" && (isLengthCutoff(result) || isLikelyIncomplete(result.raw))) {
      try {
        const retryResult = await requestDeepSeek(messages, profile, config, {
          maxTokens: Math.max(config.maxTokens, 2600),
          retryHint: "上一版讲解被截断或没有完整收束。请重新生成一版完整讲解：保留结构化说明，但控制在 500-900 个汉字；必须讲到最终关系和答案核对；最后用完整句号结束，不要停在半句话。"
        });
        if (retryResult.raw && !isLikelyIncomplete(retryResult.raw)) {
          result = retryResult;
        }
      } catch {}
    }
    result.raw = trimHeuristicReply(result.raw, messages, profile);
    return result;
  }

  if (config.tier === "pro") {
    try {
      const flashResult = await callFlashFallback(messages, profile, "empty model content");
      if (flashResult.raw) {
        flashResult.raw = trimHeuristicReply(flashResult.raw, messages, profile);
        return flashResult;
      }
    } catch {}
  }

  return {
    raw: trimHeuristicReply(fallbackTeachingReply(messages, profile), messages, profile),
    config,
    data: { fallback: true, reason: "empty model content", original: result.data }
  };
}

async function callDeepSeek(messages, profile) {
  const primaryConfig = deepSeekConfig(messages, profile);
  let raw = "";
  let usedConfig = primaryConfig;

  try {
    const result = await callDeepSeekWithConfig(messages, profile, primaryConfig);
    raw = result.raw;
    usedConfig = result.config;
  } catch (error) {
    if (primaryConfig.tier !== "pro" || !DEEPSEEK_PRO_FALLBACK) {
      throw error;
    }
    const fallbackConfig = {
      tier: "pro-retry",
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
      model: DEEPSEEK_PRO_MODEL,
      temperature: 0.25,
      maxTokens: profile?.mode === "讲解模式" ? 2200 : 900
    };
    const result = await callDeepSeekWithConfig(messages, profile, fallbackConfig);
    raw = result.raw;
    usedConfig = result.config;
  }

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    const showDiagram = shouldShowLocalDiagram(messages, profile);
    return {
      answer: raw,
      diagramAction: showDiagram ? "show" : "hold",
      diagram: showDiagram ? buildLocalDiagram(messages, raw) : null,
      modelTier: usedConfig.tier,
      model: usedConfig.model
    };
  }
  const shouldForceDiagram = shouldShowLocalDiagram(messages, profile);
  const action = ["hold", "show", "update"].includes(parsed.diagramAction) ? parsed.diagramAction : "hold";
  const normalizedDiagram = action === "hold" ? null : normalizeDiagram(parsed.diagram);
  const finalAction = action === "hold" && shouldForceDiagram ? "show" : action;
  return {
    answer: String(parsed.answer || raw).trim(),
    diagramAction: finalAction,
    diagram: normalizedDiagram?.nodes?.length ? normalizedDiagram : (finalAction === "hold" ? null : buildLocalDiagram(messages, parsed.answer || raw)),
    modelTier: usedConfig.tier,
    model: usedConfig.model
  };
}

function visionProviderConfig(provider) {
  if (provider === "kimi") {
    return {
      provider,
      apiKey: KIMI_API_KEY || (VISION_PROVIDER === "kimi" ? VISION_API_KEY : ""),
      baseUrl: KIMI_BASE_URL,
      model: KIMI_VISION_MODEL,
      temperature: 1,
      timeoutMs: KIMI_VISION_TIMEOUT_MS,
      useBareBase64: false
    };
  }
  return {
    provider: "zhipu",
    apiKey: VISION_API_KEY,
    baseUrl: VISION_BASE_URL,
    model: VISION_MODEL,
    temperature: 0,
    timeoutMs: VISION_TIMEOUT_MS,
    useBareBase64: true
  };
}

function extractVisionText(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(item => typeof item === "string" ? item : item?.text || item?.content || "")
      .join("")
      .trim();
  }
  return deepSeekMessageText(message);
}

async function callVisionWithProvider(image, provider, hint = "") {
  const config = visionProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(provider === "kimi"
      ? "还没有配置 KIMI_API_KEY"
      : "还没有配置 VISION_API_KEY");
  }

  const imageForProvider = config.useBareBase64
    ? image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    : image;
  const cleanHint = String(hint || "").trim().slice(0, 800);
  const hintPrompt = cleanHint
    ? `用户补充说明：${cleanHint}\n请结合补充说明识别图片。如果用户指定“只做第3小问/只证明某一步”，仍要识别相关题干和指定小问；如果用户同时输入了题目文字，以用户补充说明作为优先参考，用图片核对图形和条件。`
    : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: VISION_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: [
            "你是数学题目图片识别助手，尤其要谨慎处理几何图。",
            "只负责识别和转写，不要解题，不要推理答案。",
            "必须区分“看见的图形标注”和“你推测的关系”。禁止把未标注的垂直、平行、相等、角平分、中点、圆心、切线、全等、相似等关系当成已知。",
            "如果图中某个点名、角标、线段标注、数字或符号看不清，写“看不清/不确定”，不要猜。",
            "几何题必须按固定格式输出：题目文字；图形对象；图中明确标注的关系；需要求证/求解；不确定信息。",
            "图形对象要尽量列出点、线段、射线、直线、圆、三角形、四边形及它们的连接关系。",
            "明确标注的关系包括：平行、垂直、相等、角度、长度、切点、中点、圆心、共线、共圆、交点等。只写图中能看见的。",
            "公式尽量转成学生可读的普通文本，例如 x >= -1、(a-2)/4，不要输出复杂 LaTeX 原码。"
          ].join("\n")
        },
        {
          role: "user",
          content: [
            { type: "text", text: ["请完整识别这张数学题图片。如果是几何题，先读文字，再逐项描述图形：有哪些点和图形，哪些关系是明确标注的，哪些地方看不清。不要补充图片中没有标注的条件。", hintPrompt].filter(Boolean).join("\n") },
            { type: "image_url", image_url: { url: imageForProvider } }
          ]
        }
      ]
    }),
    signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${provider === "kimi" ? "Kimi" : "智谱"}图片识别超时`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `图片识别 API 错误：${response.status}`);
  }
  const text = extractVisionText(data);
  if (!text) throw new Error(`${provider === "kimi" ? "Kimi" : "智谱"}图片识别结果为空`);
  return text;
}

async function callVision(image, hint = "") {
  const providers = VISION_PROVIDER === "kimi"
    ? ["kimi", ...(VISION_API_KEY ? ["zhipu"] : [])]
    : ["zhipu"];
  let lastError = null;

  for (const provider of providers) {
    try {
      return await callVisionWithProvider(image, provider, hint);
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError?.message || "";
  if (/结果为空/.test(message)) {
    throw new Error("图片识别结果为空。Kimi 未返回可用文字；可以换更清晰的图，或在 Render 同时保留智谱 VISION_API_KEY 作为快速兜底。");
  }
  throw new Error(message || "图片识别失败");
}

async function callTts(text) {
  if (!TTS_API_KEY) {
    throw new Error("还没有配置自然人声朗读模型");
  }
  const input = String(text || "").replace(/\s+/g, " ").trim().slice(0, TTS_MAX_CHARS);
  if (!input) throw new Error("缺少朗读内容");

  const primaryFormat = TTS_PROVIDER === "openai" ? "mp3" : TTS_RESPONSE_FORMAT;
  const formats = TTS_PROVIDER === "openai" || primaryFormat === "wav" ? [primaryFormat] : [primaryFormat, "wav"];
  const cacheBase = JSON.stringify({
    provider: TTS_PROVIDER,
    baseUrl: TTS_BASE_URL,
    model: TTS_MODEL,
    voice: TTS_VOICE,
    speed: TTS_SPEED,
    volume: TTS_VOLUME,
    input
  });
  const cacheKey = crypto.createHash("sha256").update(cacheBase).digest("hex");

  for (const format of formats) {
    const ext = format === "wav" ? "wav" : "mp3";
    const cachePath = path.join(TTS_CACHE_DIR, `${cacheKey}.${ext}`);
    if (fs.existsSync(cachePath)) {
      return {
        audio: fs.readFileSync(cachePath),
        contentType: ext === "wav" ? "audio/wav" : "audio/mpeg"
      };
    }
  }

  if (pendingTts.has(cacheKey)) return pendingTts.get(cacheKey);

  const task = generateTtsAudio(input, formats, cacheKey);
  pendingTts.set(cacheKey, task);
  try {
    return await task;
  } finally {
    pendingTts.delete(cacheKey);
  }
}

async function generateTtsAudio(input, formats, cacheKey) {
  let lastError = null;
  for (const format of formats) {
    const payload = TTS_PROVIDER === "openai"
    ? {
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input,
        instructions: TTS_INSTRUCTIONS,
        response_format: "mp3"
      }
    : {
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input,
        response_format: format,
        speed: TTS_SPEED,
        volume: TTS_VOLUME
      };

    const response = await fetch(`${TTS_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TTS_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      lastError = await response.text().catch(() => "");
      continue;
    }

    const ext = format === "wav" ? "wav" : "mp3";
    const audio = Buffer.from(await response.arrayBuffer());
    const cachePath = path.join(TTS_CACHE_DIR, `${cacheKey}.${ext}`);
    fs.writeFile(cachePath, audio, () => {});
    return {
      audio,
      contentType: ext === "wav" ? "audio/wav" : "audio/mpeg"
    };
  }
  throw new Error(lastError || "语音生成失败");
}

function sttConfigured() {
  return STT_PROVIDER === "tencent" && Boolean(TENCENT_SECRET_ID && TENCENT_SECRET_KEY);
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function tencentAuthorization({ action, payload, timestamp }) {
  const service = "asr";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const signedHeaders = "content-type;host";
  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TENCENT_ASR_ENDPOINT}\n`;
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const secretDate = hmacSha256(`TC3${TENCENT_SECRET_KEY}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");
  return `TC3-HMAC-SHA256 Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function callTencentStt(audioBase64) {
  if (!sttConfigured()) {
    throw new Error("还没有配置云端语音识别服务");
  }
  const payload = JSON.stringify({
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: TENCENT_ASR_ENGINE,
    SourceType: 1,
    VoiceFormat: "wav",
    UsrAudioKey: `math-agent-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    Data: audioBase64
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const action = "SentenceRecognition";
  const response = await fetch(`https://${TENCENT_ASR_ENDPOINT}`, {
    method: "POST",
    headers: {
      "Authorization": tencentAuthorization({ action, payload, timestamp }),
      "Content-Type": "application/json; charset=utf-8",
      "Host": TENCENT_ASR_ENDPOINT,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": "2019-06-14",
      "X-TC-Region": TENCENT_REGION
    },
    body: payload
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.Response?.Error) {
    throw new Error(data.Response?.Error?.Message || `语音识别 API 错误：${response.status}`);
  }
  const text = String(data.Response?.Result || "").trim();
  if (!text) throw new Error("没有识别到清楚的语音，请靠近一点再试");
  return text;
}

async function handleQuota(req, res) {
  const user = getUserFromRequest(req);
  const identity = user ? `user:${user.id}` : `ip:${clientIp(req)}`;
  sendJson(res, 200, {
    limit: DAILY_LIMIT,
    remaining: remainingFor(req, identity),
    user: user ? publicUser(user) : null
  });
}

async function handleAdminInviteCodes(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!ADMIN_SECRET) {
      sendJson(res, 500, { error: "还没有配置 ADMIN_SECRET，暂时不能在网页里生成邀请码" });
      return;
    }
    if (String(body.adminSecret || "") !== ADMIN_SECRET) {
      sendJson(res, 401, { error: "管理员口令不正确" });
      return;
    }

    const type = body.type === "one_month" ? "one_month" : "one_day";
    const count = Math.max(1, Math.min(100, Number(body.count || 10)));
    const users = readUsers();
    const legacyInvites = readInvites();
    const existing = new Set([
      ...users.map(user => normalizeInviteCode(user.inviteCode)).filter(Boolean),
      ...legacyInvites.map(invite => normalizeInviteCode(invite.code)),
      ...ONE_DAY_INVITE_CODES,
      ...ONE_MONTH_INVITE_CODES
    ]);
    const created = [];

    for (let index = 0; index < count; index += 1) {
      const code = randomSignedInviteCode(type, existing);
      existing.add(code);
      created.push(code);
    }

    sendJson(res, 200, {
      codes: created,
      stats: {
        total: created.length,
        unused: created.length,
        oneDayUnused: type === "one_day" ? created.length : 0,
        oneMonthUnused: type === "one_month" ? created.length : 0
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "邀请码生成失败" });
  }
}

async function handleRegister(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const inviteCode = normalizeInviteCode(body.inviteCode);

    if (!name || !email || !password || !inviteCode) {
      sendJson(res, 400, { error: "请填写昵称、邮箱、密码和邀请码" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(res, 400, { error: "邮箱格式不正确" });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: "密码至少 6 位" });
      return;
    }

    const users = readUsers();
    if (users.some(user => user.email === email)) {
      sendJson(res, 409, { error: "这个邮箱已经注册，请直接登录" });
      return;
    }
    const inviteAccess = findInviteAccess(users, inviteCode);
    if (inviteAccess.error) {
      sendJson(res, inviteAccess.error.includes("已经被使用") ? 409 : 403, { error: inviteAccess.error });
      return;
    }
    const invitePlan = inviteAccess.plan;

    const passwordData = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      salt: passwordData.salt,
      passwordHash: passwordData.hash,
      inviteCode,
      trialType: invitePlan.type,
      trialLabel: invitePlan.label,
      trialStartsAt: new Date().toISOString(),
      trialEndsAt: trialEndsAt(invitePlan),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);
    if (inviteAccess.source === "generated") {
      markGeneratedInviteUsed(inviteCode, user);
    }

    const token = createSession(user);
    sendJson(
      res,
      200,
      { token, user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) },
      { "Set-Cookie": authCookie(token) }
    );
  } catch (error) {
    sendJson(res, 500, { error: error.message || "注册失败" });
  }
}

async function handleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const user = readUsers().find(item => item.email === email);

    if (!user || !verifyPassword(password, user)) {
      sendJson(res, 401, { error: "邮箱或密码不正确" });
      return;
    }

    const token = createSession(user);
    sendJson(
      res,
      200,
      { token, user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) },
      { "Set-Cookie": authCookie(token) }
    );
  } catch (error) {
    sendJson(res, 500, { error: error.message || "登录失败" });
  }
}

async function handleMe(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 200, { user: null, limit: DAILY_LIMIT, remaining: remainingFor(req, `ip:${clientIp(req)}`) });
    return;
  }
  sendJson(res, 200, { user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) });
}

async function handleLogout(req, res) {
  const token = authToken(req);
  if (token) sessions.delete(token);
  sendJson(res, 200, { ok: true }, { "Set-Cookie": clearAuthCookie() });
}

async function handleListConversations(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }
  sendJson(res, 200, {
    conversations: getUserConversations(user.id).map(publicConversation)
  });
}

async function handleCreateConversation(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }
  const conversation = createConversation(user);
  sendJson(res, 200, {
    conversation: publicConversation(conversation),
    messages: []
  });
}

async function handleReadConversation(req, res, conversationId) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }
  const conversation = getConversation(user, conversationId);
  if (!conversation) {
    sendJson(res, 404, { error: "没有找到这段对话" });
    return;
  }
  sendJson(res, 200, {
    conversation: publicConversation(conversation),
    messages: Array.isArray(conversation.messages) ? conversation.messages : []
  });
}

async function handleChat(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "请先登录后再使用对话功能" });
      return;
    }
    if (!isTrialActive(user)) {
      sendJson(res, 403, {
        error: "试用期已经结束。请联系老师或管理员获取新的试用资格。",
        limit: DAILY_LIMIT,
        remaining: 0,
        user: publicUser(user)
      });
      return;
    }
    const identity = `user:${user.id}`;
    const profile = body.profile || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latestUserMessage = [...messages].reverse().find(message => message.role === "user");

    if (!messages.length || !latestUserMessage) {
      sendJson(res, 400, { error: "缺少对话内容" });
      return;
    }

    if (!consumeQuota(req, identity)) {
      sendJson(res, 429, {
        error: `今天的 ${DAILY_LIMIT} 次试用次数已经用完，明天可以继续。`,
        limit: DAILY_LIMIT,
        remaining: 0
      });
      return;
    }

    const result = await callDeepSeek(messages, profile);
    const conversation = saveConversationMessages(
      user,
      String(body.conversationId || ""),
      {
        content: latestUserMessage.content,
        displayContent: body.displayText || latestUserMessage.displayContent || latestUserMessage.content
      },
      {
        content: result.answer,
        diagramAction: result.diagramAction,
        diagram: result.diagram
      }
    );
    sendJson(res, 200, {
      answer: result.answer,
      diagramAction: result.diagramAction,
      diagram: result.diagram,
      conversation: publicConversation(conversation),
      modelTier: result.modelTier,
      model: result.model,
      limit: DAILY_LIMIT,
      remaining: remainingFor(req, identity),
      user: publicUser(user)
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "服务异常",
      limit: DAILY_LIMIT
    });
  }
}

async function handleVision(req, res) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "请先登录后再使用图片识别功能" });
      return;
    }
    if (!isTrialActive(user)) {
      sendJson(res, 403, { error: "试用期已经结束。请联系老师或管理员获取新的试用资格。" });
      return;
    }
    const body = JSON.parse(await readBody(req, 12 * 1024 * 1024) || "{}");
    const image = String(body.image || "");
    const hint = String(body.hint || "").trim().slice(0, 800);
    if (!image.startsWith("data:image/")) {
      sendJson(res, 400, { error: "请上传有效的题目图片" });
      return;
    }
    if (image.length > 10 * 1024 * 1024) {
      sendJson(res, 400, { error: "图片太大了，请上传更小或压缩后的图片。几何题建议保留清晰点名和角标。" });
      return;
    }
    const text = await callVision(image, hint);
    sendJson(res, 200, { text });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "图片识别失败" });
  }
}

async function handleTts(req, res) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "请先登录后再使用朗读功能" });
      return;
    }
    if (!isTrialActive(user)) {
      sendJson(res, 403, { error: "试用期已经结束。请联系老师或管理员获取新的试用资格。" });
      return;
    }
    const body = JSON.parse(await readBody(req) || "{}");
    const text = String(body.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "缺少朗读内容" });
      return;
    }
    const result = await callTts(text);
    sendBinary(res, 200, result.audio, result.contentType);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "语音生成失败" });
  }
}

async function handleStt(req, res) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "请先登录后再使用语音输入功能" });
      return;
    }
    if (!isTrialActive(user)) {
      sendJson(res, 403, { error: "试用期已经结束。请联系老师或管理员获取新的试用资格。" });
      return;
    }
    if (!sttConfigured()) {
      sendJson(res, 501, {
        error: "云端语音识别还没有配置。请在 Render 环境变量里添加腾讯云语音识别密钥。"
      });
      return;
    }
    const body = JSON.parse(await readBody(req, 6 * 1024 * 1024) || "{}");
    const audio = String(body.audio || "");
    const audioBase64 = audio.includes(",") ? audio.split(",").pop() : audio;
    if (!audioBase64) {
      sendJson(res, 400, { error: "缺少录音内容" });
      return;
    }
    const text = await callTencentStt(audioBase64);
    sendJson(res, 200, { text });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "语音识别失败" });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "POST" && req.url === "/api/register") {
    handleRegister(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/login") {
    handleLogin(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/me") {
    handleMe(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/logout") {
    handleLogout(req, res);
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/quota")) {
    handleQuota(req, res);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/conversations") {
    handleListConversations(req, res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/conversations") {
    handleCreateConversation(req, res);
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
    handleReadConversation(req, res, decodeURIComponent(url.pathname.split("/").pop() || ""));
    return;
  }
  if (req.method === "POST" && req.url === "/api/admin/invite-codes") {
    handleAdminInviteCodes(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/vision") {
    handleVision(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/tts") {
    handleTts(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/stt/status") {
    sendJson(res, 200, { enabled: sttConfigured(), provider: STT_PROVIDER });
    return;
  }
  if (req.method === "POST" && req.url === "/api/stt") {
    handleStt(req, res);
    return;
  }
  if (req.method === "GET") {
    serveFile(req, res);
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Math Agent is running on http://localhost:${PORT}`);
  console.log(`Daily chat limit: ${DAILY_LIMIT}`);
});
