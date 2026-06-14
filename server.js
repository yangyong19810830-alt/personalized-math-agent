const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const DEEPSEEK_PRO_API_KEY = process.env.DEEPSEEK_PRO_API_KEY || DEEPSEEK_API_KEY;
const DEEPSEEK_PRO_BASE_URL = (process.env.DEEPSEEK_PRO_BASE_URL || DEEPSEEK_BASE_URL).replace(/\/$/, "");
const DEEPSEEK_PRO_MODEL = process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro";
const DEEPSEEK_PRO_FALLBACK = String(process.env.DEEPSEEK_PRO_FALLBACK || "false").toLowerCase() === "true";
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
  return [
    "你是一个面向小学到大学学生的个性化数学学习智能体。",
    "核心教学观：先判断学生已有基础、当前卡点和可推进的下一步，再帮助学生形成稳定理解。",
    "回答必须使用数学教育本地话语，不能暴露任何内部理论标签或框架名。",
    "禁止在输出中使用这些词：SDE、纠缠、差异序列、结构显露、显露态、六爪、抓核、抓裂缝、改姓、锻造、投放、本体论、空虚混沌、发生链、在 E 中、经 D、成 S。",
    "数学公式优先用学生可直接读懂的普通文本或 Unicode 符号，例如 x <= (a-2)/4、x ≥ -1、3/4 ÷ 1/8。不要输出 \\dfrac、\\leqslant、\\begin{cases} 这类 LaTeX 原码。只有确实需要时才用 $...$ 包裹简单公式。",
    "如果题目中带有 LaTeX 原码，要先把它翻译成自然数学表达，再启发学生。",
    "不要一上来直接给完整答案。先定位卡点，再给一层提示，再要求学生补充条件或第一步；必要时给分层讲解。",
    "网页右侧有解题结构图，但不能一开始就给完整结构图。真正的教学要先让学生思考。",
    "默认策略：第一次看到具体题目时，先不画完整结构图，只提出 1-2 个启发问题，让学生说已知条件、目标或第一步想法。",
    "只有在以下情况才画结构图：学生主动要求画图；学生已经回答了自己的想法；学生明显卡住或回答错误；题目复杂到没有图很难继续。",
    "结构图一旦出现，也应服务于启发，不要直接把所有计算细节和最终答案全暴露。可以先画局部结构，再逐步补全。",
    `学生阶段：${profile.stage || "小学"}。`,
    `学习目标：${profile.goal || "补齐薄弱知识"}。`,
    `当前状态：${profile.state || "局部会做但不稳定"}。`,
    "输出要求：必须只输出 JSON，不要 Markdown，不要代码块，不要额外解释。",
    "JSON 格式：{\"answer\":\"给学生看的简短讲解或启发问题\",\"diagramAction\":\"hold|show|update\",\"diagram\":{\"title\":\"结构图标题\",\"nodes\":[{\"id\":\"n1\",\"label\":\"短标签\",\"type\":\"given|goal|relation|step|result|check\"}],\"edges\":[{\"from\":\"n1\",\"to\":\"n2\",\"label\":\"箭头短说明\"}]}}",
    "diagramAction=hold 时，diagram 可以为 null，表示先不画图，让学生回答。",
    "diagramAction=show 或 update 时，diagram 必须提供结构图数据。",
    "nodes 最多 9 个，edges 最多 10 条。label 尽量 4-12 个汉字，避免长句。",
    "answer 中可以提示学生先看右侧结构图，但不要说 JSON、节点、模型等技术词。"
  ].join("\n");
}

function deepSeekConfig(messages, profile = {}, forcePro = false) {
  return {
    tier: "pro",
    apiKey: DEEPSEEK_PRO_API_KEY,
    baseUrl: DEEPSEEK_PRO_BASE_URL,
    model: DEEPSEEK_PRO_MODEL,
    temperature: 0.25,
    maxTokens: 3200
  };
}

function modelPromptLine(config) {
  return "当前使用 DeepSeek V4 Pro：所有题目都必须先自检条件、目标、隐含约束、是否需要分类讨论或画结构图；不要给出未经核验的结论。必须输出可展示给学生的内容，不能输出空回复。";
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
      ...messages.slice(-10)
    ]
  };
  if (config.tier.startsWith("pro") && options.thinkingMode) {
    payload.thinking = { type: "enabled" };
    payload.reasoning_effort = "high";
  }
  if (options.strictJsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

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

async function callDeepSeekWithConfig(messages, profile, config) {
  let result;
  try {
    result = await requestDeepSeek(messages, profile, config);
  } catch (error) {
    result = await requestDeepSeek(messages, profile, config, {
      retryHint: "请输出一个合法 JSON 对象，包含 answer、diagramAction、diagram 三个字段。",
      compatibilityMode: true
    });
  }
  if (result.raw) return result;

  result = await requestDeepSeek(messages, profile, config, {
    retryHint: "上一轮模型内容为空。请立刻输出一个合法 JSON 对象，必须包含 answer、diagramAction、diagram 三个字段；不要输出空内容。",
    compatibilityMode: true,
    maxTokens: 3200
  });

  if (!result.raw) {
    const finishReason = result.data?.choices?.[0]?.finish_reason || "unknown";
    throw new Error(`模型返回为空：DeepSeek V4 Pro 本次没有生成可展示内容。finish_reason=${finishReason}。请检查模型权限、账户余额，或稍后重试。`);
  }
  return result;
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
      maxTokens: 3200
    };
    const result = await callDeepSeekWithConfig(messages, profile, fallbackConfig);
    raw = result.raw;
    usedConfig = result.config;
  }

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      answer: raw,
      diagramAction: "hold",
      diagram: null,
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
