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
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId: user.id,
    createdAt: Date.now()
  });
  return token;
}

function authToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return "";
}

function getUserFromRequest(req) {
  const token = authToken(req);
  const session = sessions.get(token);
  if (!session) return null;
  const users = readUsers();
  return users.find(user => user.id === session.userId) || null;
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

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store"
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

function systemPrompt(profile) {
  const mode = profile?.mode === "讲解模式" ? "讲解模式" : "启发模式";
  const modeRules = mode === "讲解模式"
    ? [
        "当前回复模式：讲解模式。",
        "可以讲完整，但要结构化，不要只堆步骤。建议 350-700 个汉字。",
        "默认结构：真正难点；找对象；定单位/标准；搭关系；选择表达方式；关键步骤；易错点；一句话结构总结；1 道变式问题。",
        "每个关键算式都要解释它表达的关系。讲完后要求学生用一句话复述，减少答案依赖。"
      ]
    : [
        "当前回复模式：启发模式。",
        "启发不是越短越好，要保证学生能继续走。回复建议 160-320 个汉字。",
        "默认结构：先总结学生已经抓住了什么；纠正一个关键误区；补充必要背景；只开放一个新的台阶；最后问一个具体问题。",
        "如果学生已经连续回答了 2 轮以上，可以把前面内容整合成一个小结，再推进一小步，避免兜圈子。",
        "不要直接给最终答案；但可以说明当前步骤的意义，以及为什么要看这个对象、单位/标准或关系。"
      ];
  return [
    "你是一个面向小学到大学学生的个性化数学学习智能体。",
    "核心教学观：数学学习不是会算，而是把题目世界结构化。",
    "每次优先检查：对象、单位/标准、关系、表达方式、验证迁移。不要只给答案或堆步骤。",
    "启发模式的边界：不直接给最终答案，不一次性讲完整路线；但必须有质量，不能反复追问同一个点。学生连续答对时要整合并推进。",
    "对学生说大白话，不暴露内部理论术语。禁止使用：SDE、纠缠、差异序列、结构显露、显露态、六爪、抓核、抓裂缝、改姓、锻造、投放、本体论、发生链、在 E 中、经 D、成 S。",
    "数学公式用学生可读写法，例如 x <= (a-2)/4、x ≥ -1、3/4 ÷ 1/8。尽量不要输出 \\dfrac、\\leqslant、\\begin{cases} 等 LaTeX 原码。",
    "不要机械问“已知什么、求什么”。要帮助学生看见对象、标准、关系，以及适合用图、表、式还是方程表达。",
    `学生阶段：${profile.stage || "小学"}。`,
    `回复模式：${mode}。`,
    `学习目标：${profile.goal || "补齐薄弱知识"}。`,
    `当前状态：${profile.state || "局部会做但不稳定"}。`,
    ...modeRules,
    "输出要求：直接给学生看的自然语言，不要输出 JSON，不要 Markdown，不要代码块。",
    "如果学生主动要求画图，可以在文字中说“我先把关系画出来”，但不要输出图形数据。"
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
    maxTokens: isExplanation ? 1200 : 760
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
    maxTokens: isExplanation ? 900 : 560
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
    nodes: cleanNodes,
    edges: cleanEdges
  };
}

function latestUserText(messages) {
  const latest = [...messages].reverse().find(message => message.role === "user");
  return deepSeekMessageText(latest);
}

function shouldShowLocalDiagram(messages, profile = {}) {
  const text = latestUserText(messages);
  const historyText = messages.slice(-4).map(message => deepSeekMessageText(message)).join("\n");
  if (/画图|结构图|图解|画出来|关系图|示意图|看图理解/.test(text)) return true;
  if (profile.mode === "讲解模式" && /几何|证明|钟|追及|相遇|工程|行程|函数|参数|分类讨论|数列|导数|圆|三角形|面积|体积|概率/.test(historyText)) return true;
  if (messages.filter(message => message.role === "user").length >= 2 && /不会|不懂|卡住|没思路|不知道|错了|再讲|为什么/.test(text)) return true;
  return /几何|证明|钟|追及|相遇|工程|行程|函数|参数|分类讨论|数列|导数|圆|三角形|面积|体积|概率/.test(historyText)
    && messages.filter(message => message.role === "user").length >= 2;
}

function buildLocalDiagram(messages) {
  const text = latestUserText(messages).replace(/\s+/g, " ").slice(0, 40) || "当前题目";
  return {
    title: "解题结构图",
    nodes: [
      { id: "n1", label: "题目条件", type: "given" },
      { id: "n2", label: "要求什么", type: "goal" },
      { id: "n3", label: "关键关系", type: "relation" },
      { id: "n4", label: "先做一步", type: "step" },
      { id: "n5", label: "检查结果", type: "check" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "读题定位" },
      { from: "n1", to: "n3", label: "找规律" },
      { from: "n3", to: "n4", label: "列第一步" },
      { from: "n4", to: "n5", label: "回到问题" }
    ],
    note: text
  };
}

function fallbackTeachingReply(messages, profile = {}) {
  const text = latestUserText(messages);
  const isExplanation = profile?.mode === "讲解模式";
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
  if (userCount >= 4) {
    return "我们把前面合起来看：你已经找到了一个关键对象，也开始说明它和题目关系了。现在不要停在原地，请往前推进一个台阶：用一句话说清“左边这个表达式表示谁，右边这个表达式表示谁”，然后判断两边为什么应该相等或对应。";
  }
  if (userCount >= 2) {
    return "你这一步是有价值的，但我们不能只停在这个点上。请你把刚才得到的量放回题目里说一句完整的话：它表示哪个对象？单位/标准是什么？它和题目要问的量之间是什么关系？";
  }
  return "我们先建立题目的结构，不急着完整解。请你先找两个最关键的对象或量，并分别说出它们的单位/标准；如果题里有变化，也说说哪个量在变，哪个关系保持不变。";
}

function trimHeuristicReply(text, messages, profile = {}) {
  const value = String(text || "").trim();
  if (profile?.mode === "讲解模式") return value;
  const hardRevealPattern = /答案是|最终答案|所以答案|最后答案|直接得到答案|把答案算出来|完整解法如下/;
  const routeRevealPattern = /接下来.*(除以|相除|列方程求出|代入求出|直接求出)|再用.*(除以|相除).*就|这样就知道|即可得到/;
  if (!hardRevealPattern.test(value) && !routeRevealPattern.test(value) && value.length <= 420) return value;
  return nextHeuristicQuestion(messages);
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
          systemPrompt(profile || {}),
          modelPromptLine(config),
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
      ? `Pro 响应较慢或为空，已切换快速模型。请输出 260 字以内的结构化讲解，包含难点、对象、单位/标准、关系、第一步。不要 JSON。原因：${reason}`
      : `Pro 响应较慢或为空，已切换快速模型。请输出 180-260 字的高质量启发：总结学生已完成的点，纠正一个误区，补充必要背景，只推进一个新台阶，最后问一个具体问题。不要最终答案，不要完整路线，不要 JSON。原因：${reason}`,
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
      maxTokens: profile?.mode === "讲解模式" ? 1200 : 700
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
      diagram: showDiagram ? buildLocalDiagram(messages) : null,
      modelTier: usedConfig.tier,
      model: usedConfig.model
    };
  }
  const action = ["hold", "show", "update"].includes(parsed.diagramAction) ? parsed.diagramAction : "hold";
  return {
    answer: String(parsed.answer || raw).trim(),
    diagramAction: action,
    diagram: action === "hold" ? null : normalizeDiagram(parsed.diagram),
    modelTier: usedConfig.tier,
    model: usedConfig.model
  };
}

async function callVision(image) {
  if (!VISION_API_KEY) {
    throw new Error("当前网站还没有配置图片识别模型。请先手动输入题目文字，或联系管理员配置 VISION_API_KEY。");
  }

  const imageForProvider = VISION_PROVIDER === "zhipu"
    ? image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
    : image;

  const response = await fetch(`${VISION_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VISION_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: "你是数学题目 OCR 助手。只负责把图片中的题目准确转写成中文数学文本。保留题号、条件、图形标注、公式和选项。不要解题，不要解释。公式尽量转成学生可读的普通文本，例如 x >= -1、(a-2)/4。"
        },
        {
          role: "user",
          content: [
            { type: "text", text: "请识别这张图片中的数学题目，完整转写。若有几何图，请描述图中点、线、角、相等/平行/垂直等标注。" },
            { type: "image_url", image_url: { url: imageForProvider } }
          ]
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `图片识别 API 错误：${response.status}`);
  }
  const text = (data.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("图片识别结果为空，请换一张更清晰的图片");
  return text;
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
    sendJson(res, 200, { token, user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) });
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
    sendJson(res, 200, { token, user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) });
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
  sendJson(res, 200, { ok: true });
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
    const body = JSON.parse(await readBody(req, 8 * 1024 * 1024) || "{}");
    const image = String(body.image || "");
    if (!image.startsWith("data:image/")) {
      sendJson(res, 400, { error: "请上传有效的题目图片" });
      return;
    }
    if (image.length > 6 * 1024 * 1024) {
      sendJson(res, 400, { error: "图片太大了，请上传更小或压缩后的图片" });
      return;
    }
    const text = await callVision(image);
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
