const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Worker } = require("worker_threads");
const AdmZip = require("adm-zip");
const { buildRagContext, getRagStatus } = require("./rag-retriever");
const {
  buildImplementationContext,
  getImplementationStatus,
  implementationRoute
} = require("./implementation-retriever");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const APP_VERSION = "sde-knowledge-20260724-rag-v0.2-implementation-v2";
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5.5";
const OPENAI_VISION_TIMEOUT_MS = Number(process.env.OPENAI_VISION_TIMEOUT_MS || 20000);
const OPENAI_DIAGRAM_MODEL = process.env.OPENAI_DIAGRAM_MODEL || OPENAI_VISION_MODEL;
const OPENAI_DIAGRAM_TIMEOUT_MS = Number(process.env.OPENAI_DIAGRAM_TIMEOUT_MS || 12000);
const VISION_API_KEY = process.env.VISION_API_KEY || "";
const RAW_VISION_PROVIDER = (process.env.VISION_PROVIDER || "qwen").toLowerCase();
const VISION_FALLBACK_ENABLED = String(process.env.VISION_FALLBACK_ENABLED || "true").toLowerCase() === "true";
const VISION_PROVIDER = RAW_VISION_PROVIDER
  .replace("-only", "")
  .replace("qianwen", "qwen")
  .replace("tongyi", "qwen")
  .replace("dashscope", "qwen");
const QWEN_API_KEY = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY || (VISION_PROVIDER === "qwen" ? VISION_API_KEY : "");
const QWEN_BASE_URL = (process.env.QWEN_BASE_URL || process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
const QWEN_VISION_MODEL = process.env.QWEN_VISION_MODEL || process.env.QWEN_MODEL || "qwen3.7-plus";
const QWEN_VISION_TIMEOUT_MS = Number(process.env.QWEN_VISION_TIMEOUT_MS || process.env.DASHSCOPE_VISION_TIMEOUT_MS || 15000);
const VISION_BASE_URL = (process.env.VISION_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
const ZHIPU_VISION_API_KEY = process.env.ZHIPU_API_KEY || (VISION_PROVIDER === "zhipu" ? VISION_API_KEY : "");
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
const GROWTH_PROFILES_FILE = path.join(DATA_DIR, "growth-profiles.json");
const TTS_CACHE_DIR = path.join(DATA_DIR, "tts-cache");
const pendingTts = new Map();
const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_MAX_TEXT_CHARS = 30000;
const ZIP_MAX_ENTRIES = 40;
const ZIP_MAX_READABLE_FILES = 12;
const ZIP_MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const ZIP_MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const FILE_PARSE_TIMEOUT_MS = Math.max(5000, Number(process.env.FILE_PARSE_TIMEOUT_MS || 20000));
const PDF_MAX_PAGES = Math.max(1, Number(process.env.PDF_MAX_PAGES || 40));
const READABLE_FILE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".markdown", ".html", ".htm", ".txt", ".zip"]);

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
  if (!fs.existsSync(GROWTH_PROFILES_FILE)) fs.writeFileSync(GROWTH_PROFILES_FILE, "[]", "utf8");
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

function readGrowthProfiles() {
  ensureDataStore();
  try {
    return JSON.parse(fs.readFileSync(GROWTH_PROFILES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeGrowthProfiles(profiles) {
  ensureDataStore();
  fs.writeFileSync(GROWTH_PROFILES_FILE, JSON.stringify(profiles, null, 2), "utf8");
}

function publicGrowthProfile(profile) {
  if (!profile) return { settings: {}, entries: [], updatedAt: "" };
  return {
    settings: profile.settings || {},
    entries: Array.isArray(profile.entries) ? profile.entries.slice(-30).reverse() : [],
    updatedAt: profile.updatedAt || ""
  };
}

function recordImplementationTurn(user, profile, userMessage, assistantMessage, conversationId = "") {
  const route = implementationRoute([{ role: "user", content: userMessage }], profile);
  if (!route) return null;
  const profiles = readGrowthProfiles();
  let growth = profiles.find(item => item.userId === user.id);
  const now = new Date().toISOString();
  if (!growth) {
    growth = {
      userId: user.id,
      settings: {},
      entries: [],
      createdAt: now,
      updatedAt: now
    };
    profiles.push(growth);
  }
  growth.settings = {
    stage: profile.stage || growth.settings?.stage || "",
    goal: profile.goal || growth.settings?.goal || "",
    state: profile.state || growth.settings?.state || "",
    planSpan: profile.planSpan || growth.settings?.planSpan || ""
  };
  growth.entries = Array.isArray(growth.entries) ? growth.entries : [];
  growth.entries.push({
    id: crypto.randomUUID(),
    date: now.slice(0, 10),
    createdAt: now,
    route,
    intent: String(profile.intent || ""),
    stage: String(profile.stage || ""),
    evidence: String(userMessage || "").slice(0, 1000),
    guidance: String(assistantMessage || "").slice(0, 2600),
    conversationId: String(conversationId || "")
  });
  growth.entries = growth.entries.slice(-120);
  growth.updatedAt = now;
  writeGrowthProfiles(profiles);
  return publicGrowthProfile(growth);
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

function userByInviteCode(users, code) {
  const normalized = normalizeInviteCode(code);
  return users.find(user => normalizeInviteCode(user.inviteCode) === normalized) || null;
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
    name: user.name || "体验用户",
    email: user.email || "",
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
  const isKnowledgeTurn = isKnowledgeLessonRequest(messages) || isLearningPlanRequest(messages, profile);
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
        isKnowledgeTurn
          ? "这是用户在请求学习某个知识点或学习规划，不是学生发来的题目，也不是学生作答。不要说“这是新题”，不要追问已知什么、要求什么；请直接进入知识点小课或学习安排。"
          : isFirstUserTurn
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
    "系统化学习指导功能：当用户要求学习计划、系统规划、今天学习、知识点学习、阶段路线、小学/初中/高中/大学数学规划时，不要按解题模式追问。要把自己切换为数学学习教练：先根据学生阶段、目标、当前状态和规划周期判断最该补的主线，再给出可执行计划。",
    "学习规划输出结构：1. 先用两三句话判断当前学习重点；2. 给出本阶段主线地图，按知识块排序；3. 给出规划周期内的学习安排；4. 给出今天第一节课怎么学；5. 配 3-5 道练习，按基础、迁移、表达复述分层；6. 给家长一个观察方法。不要只列大纲，每一项都要能执行。",
    "知识点学习课结构：选一个最适合当前画像的知识点；先说为什么现在学它；再用生活场景唤醒；然后讲核心结构；再给一题启发式练习；最后要求学生用一句话复述结构。若学生阶段是大学，生活化可以减少，重点放在定义环境、对象、结构、证明或计算路径。",
    "个性化落地服务：当意图为 family_diagnosis、lesson_start、teacher_practice 或 practice_feedback 时，使用后台提供的《个性化数学学习落地服务》资料。先区分真实证据与成人判断，再按学段从小学低段、小学中高段、初中或高中任务库中选择一个最小任务，并写清提交成果、完成标准、提示层级和升级或退阶条件。",
    "家庭诊断路径：如果还没有孩子的原始错题、讲题转写或练习作品，只索取一项最小证据，不要连续盘问。得到证据后输出当前观察、一个主要卡点、判断依据、置信度、暂不训练、本周期目标、最小任务、家长动作、学生提交内容和下一次判断。",
    "学生自学路径：当意图为 lesson_start 或初高中学生提交自己的解题过程时，证据清楚就直接诊断，不要用一连串问题阻断。优先修复第一个错误节点，区分确定、猜测和卡住的步骤，训练后给一道结构相同但表面不同的迁移题。",
    "教师课堂路径：把教师要讲什么改写为学生最终能辨认、表达、转换、解释或迁移什么。每次只改一个课堂环节，明确核心问题、学生任务、作品证据、观察标准和一个非换数字式变式，不虚构课堂数据。",
    "实践反馈路径：只根据本轮提交的可观察证据判断已经发生的变化和一个未稳定点，再决定保持、升级或退阶。反馈结束必须给成人下一次只调整的一件事和下一项任务。",
    "落地服务任务库已校准覆盖小学一年级至高中三年级。小学阶段若具体年级未知且任务选择确实依赖年级，只询问一次具体年级。大学超出本落地包校准范围，可以继续数学讲解和一般学习支持，但不要声称调用了大学分学段任务库。",
    "如果知识点学习课里由你自己生成几何例题，不能只写“如图”。必须在文字里写清图形对象、点名和关键关系，例如“三角形 ABC 中，D 在 BC 上，AD 垂直 BC”或“圆 O 外一点 P，PA 是切线，A 为切点”。这样右侧才能自动画出对应示意图。",
    "跨学段规划边界：小学重对象、单位、数量关系、图形直观和表达；初中重方程函数、几何证明、代数变形、模型迁移；高中重函数、数列、解析几何、立体几何、概率统计、导数与综合建模；大学重线性代数、微积分、概率统计、离散数学、数学建模或专业课先修结构。不要把所有知识一次塞满，要给路线和优先级。",
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
    "输出格式必须是普通文本，不要使用 Markdown 标题、加粗、列表符号或代码块。不要输出 ###、**、```、- **标题** 这类标记。",
    "当比较、分类、数据整理或学习计划用表格更清楚时，可以输出简单表格：每行各列之间用“ | ”分隔，第一行写列名，后面直接写数据，不要输出 Markdown 的 --- 分隔行。网页会把它自动显示成正常表格。",
    "数学公式必须用可直接复制粘贴的普通符号，例如 x ≤ (a-2)/4、x ≥ -1、3/4 ÷ 1/8、∠ABC、AB²。不要输出 \\dfrac、\\frac、\\leqslant、\\begin{cases}、$...$ 等 LaTeX 原码。",
    "不要机械问“已知什么、求什么”。要帮助学生看见对象、标准、关系，以及适合用图、表、式还是方程表达。",
    "如果题目来自图片识别，尤其是几何题，且识别结果里有“看不清/不确定/未标注”，不要把不确定关系当成已知条件。先向学生核对关键图形关系，例如点名、平行、垂直、相等、角度、长度、切点、中点等，再继续启发或讲解。",
    `学生阶段：${profile.stage || "小学"}。`,
    `回复模式：${mode}。`,
    `学习目标：${profile.goal || "补齐薄弱知识"}。`,
    `当前状态：${profile.state || "局部会做但不稳定"}。`,
    `规划周期：${profile.planSpan || "今天"}。`,
    `当前意图：${profile.intent || "普通对话"}。`,
    ...modeRules,
    "输出要求：直接给学生看的自然语言，不要输出 JSON，不要 Markdown，不要代码块。",
    "只有学生明确要求画图、作图、配图、图解或示意图时，才在文字中说“我把图放在这段解释下面”。不要把结构图当作每题固定栏目，也不要暗示页面右侧另有图。"
  ].join("\n");
}

function deepSeekConfig(messages, profile = {}, forcePro = false) {
  const isExplanation = profile?.mode === "讲解模式";
  const isPlan = isLearningPlanRequest(messages, profile);
  return {
    tier: "pro",
    apiKey: DEEPSEEK_PRO_API_KEY,
    baseUrl: DEEPSEEK_PRO_BASE_URL,
    model: DEEPSEEK_PRO_MODEL,
    temperature: 0.25,
    maxTokens: isPlan ? 1800 : (isExplanation ? 2200 : 900)
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
  const demoType = String(diagram.demoType || "").toLowerCase();
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
    demoType: /^(geometry|geometry-semantic|geometry-example-[a-z-]+|rectangle-measure|plane-shape|solid-shape|function-concept|sequence-concept|geometry-knowledge|interval-line|primary-olympiad)$/.test(demoType) ? demoType : "",
    figure: normalizeFigure(diagram.figure),
    nodes: cleanNodes,
    edges: cleanEdges
  };
}

function normalizeFigure(value) {
  if (!value || typeof value !== "object") return null;
  const cleanText = (text, limit = 24) => String(text || "").replace(/[^\w\u4e00-\u9fa5⊥∥=∠△⊙.-]/g, "").slice(0, limit);
  const kind = cleanText(value.kind || "", 20);
  const labels = Array.isArray(value.labels)
    ? value.labels.map(label => cleanText(label, 8)).filter(Boolean).slice(0, 12)
    : [];
  const points = Array.isArray(value.points)
    ? value.points.map(point => ({
      id: cleanText(point.id || point.label, 8),
      x: Number(point.x),
      y: Number(point.y)
    })).filter(point => point.id && Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, 12)
    : [];
  const segments = Array.isArray(value.segments)
    ? value.segments.map(segment => ({
      from: cleanText(segment.from || segment.a, 8),
      to: cleanText(segment.to || segment.b, 8),
      label: cleanText(segment.label || "", 16)
    })).filter(segment => segment.from && segment.to).slice(0, 18)
    : [];
  const circles = Array.isArray(value.circles)
    ? value.circles.map(circle => ({
      center: cleanText(circle.center || "O", 8),
      through: cleanText(circle.through || "", 8),
      label: cleanText(circle.label || "", 16)
    })).filter(circle => circle.center).slice(0, 4)
    : [];
  const relations = Array.isArray(value.relations)
    ? value.relations.map(relation => ({
      type: cleanText(relation.type || "", 18),
      a: cleanText(relation.a || relation.left || "", 12),
      b: cleanText(relation.b || relation.right || "", 12),
      point: cleanText(relation.point || "", 8),
      line: cleanText(relation.line || "", 12),
      label: String(relation.label || "").replace(/[<>{}]/g, "").slice(0, 32)
    })).filter(relation => relation.type || relation.label || relation.a || relation.b).slice(0, 12)
    : [];
  return { kind, labels, points, segments, circles, relations };
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

function isPlanningText(text) {
  return /\u5b66\u4e60\u8ba1\u5212|\u5b66\u4e60\u89c4\u5212|\u7cfb\u7edf\u89c4\u5212|\u7cfb\u7edf\u5316|\u89c4\u5212\u5468\u671f|\u5b66\u4e60\u8def\u7ebf|\u77e5\u8bc6\u70b9\u987a\u5e8f|\u7ec3\u4e60\u5b89\u6392|\u5bb6\u957f\u89c2\u5bdf|\u5236\u5b9a.*\u89c4\u5212|\u5b89\u6392.*\u5b66\u4e60|\u5f00\u59cb.*\u77e5\u8bc6\u70b9|\u4e00\u8282\u8bfe/.test(String(text || ""));
}

function isNewProblemInput(text) {
  const value = String(text || "").trim();
  if (isPlanningText(value)) return false;
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
  if (isPlanningText(latest)) return false;
  return /出\s*(一|1)?\s*道|来\s*(一|1)?\s*道|给我.*题|给.*出.*题|练习题|练一练|测试一下|考考我|生成.*题|安排.*练习/.test(latest);
}

function isLearningPlanRequest(messages, profile = {}) {
  const latest = latestUserText(messages);
  if (["daily_plan", "system_plan", "lesson_start"].includes(profile?.intent)) return true;
  if (isKnowledgeLessonRequest(messages)) return true;
  return /学习计划|系统规划|系统化|规划|路线|路线图|今天.*学习|安排.*学习|知识点学习|开始.*学习|一节课|学什么|怎么学|小学.*数学|初中.*数学|高中.*数学|大学.*数学|家长.*指导|练习安排/.test(latest);
}

function isKnowledgeLessonRequest(messages) {
  const latest = latestUserText(messages);
  if (!latest || isPlanningText(latest) || isPracticeRequest(messages) || isNewProblemInput(latest)) return false;
  return /我想学|想学习|想了解|学习一下|学一下|教我|讲讲|讲一下|开始学|相关知识|知识点|怎么学|如何学/.test(latest)
    && /长方形|正方形|矩形|梯形|平行四边形|菱形|多边形|圆柱|圆锥|正方体|长方体|立方体|球|球体|棱柱|棱锥|周长|面积|表面积|侧面积|体积|函数|几何|三角形|四边形|圆|圆形|线段|直线|射线|角|平行|垂直|相似|全等|切线|数列|概率|方程|不等式|分数|小数|百分数|导数/.test(latest);
}

function fallbackLearningPlanReply(messages, profile = {}) {
  const stage = profile.stage || "小学";
  const goal = profile.goal || "补齐薄弱知识";
  const state = profile.state || "局部会做但不稳定";
  const span = profile.planSpan || "今天";
  const map = {
    "小学": "数感与运算 -> 分数小数百分数 -> 数量关系应用题 -> 图形面积体积 -> 表达与迁移",
    "初中": "数与式 -> 方程不等式 -> 函数图像 -> 几何证明 -> 统计概率与综合建模",
    "高中": "函数主线 -> 三角/向量 -> 数列 -> 解析几何 -> 立体几何 -> 概率统计 -> 导数综合",
    "大学": "集合与逻辑 -> 微积分 -> 线性代数 -> 概率统计 -> 离散/建模 -> 专业课数学工具"
  };
  return [
    `我先按“${stage}、${goal}、${state}、${span}”给你做一个可执行的学习安排。`,
    `主线地图：${map[stage] || map["小学"]}。现在不要平均用力，先抓最影响后续学习的那条主线。`,
    `这段时间的重点：先补“对象、单位/标准、关系表达”这三个能力。每天学习不要只刷题，要按“学一个结构 -> 做两三道题 -> 复述结构 -> 换场景迁移”来走。`,
    "今天第一节课：选一个最常卡住的知识点，先用一道典型题定位卡点，再讲这个知识为什么会发生，最后做 3 道练习：1 道基础题、1 道换场景题、1 道让学生说结构的表达题。",
    "家长观察：不要只问做对没有，而是问三句话：题里有哪些对象？单位或标准是谁？它们之间是什么关系？孩子能说清这三句，才说明知识开始稳定。"
  ].join("\n\n");
}

function isDirectUserQuestion(messages) {
  const latest = latestUserText(messages);
  if (isDirectAnswerRequest(messages)) return true;
  if (isProblemContinuationRequest(messages)) return true;
  return /为什么|为啥|怎么会|凭什么|我问的是|不是这个意思|不回答|没回答|先回答|哪里体现|什么意思|解释一下|听不懂|没懂|不明白|不对|是什么|是啥|啥是|什么是|定义|性质|特点/.test(latest);
}

function isDirectAnswerRequest(messages) {
  const latest = latestUserText(messages).trim();
  if (!latest) return false;
  const userTurns = messages.filter(message => message.role === "user").length;
  if (userTurns <= 1 && isNewProblemInput(latest)) return false;
  return [
    "答案",
    "结果",
    "最后",
    "最终",
    "直接",
    "直接讲",
    "直接解",
    "告诉我",
    "算出",
    "算到最后",
    "是多少",
    "多少",
    "等于",
    "给出",
    "不要启发",
    "别问",
    "讲解"
  ].some(term => latest.includes(term));
}

function isProblemContinuationRequest(messages) {
  const latest = latestUserText(messages).trim();
  if (!latest) return false;
  return /做第[一二三四五六七八九十\d]+[问小题]|讲第[一二三四五六七八九十\d]+[问小题]|看第[一二三四五六七八九十\d]+[问小题]|第[一二三四五六七八九十\d]+[问小题]|下一问|下一题|继续做|接着做|往下做|继续讲|接着讲/.test(latest);
}

function directQuestionLine(messages) {
  if (!isDirectUserQuestion(messages)) return "";
  if (isProblemContinuationRequest(messages)) {
    return "当前用户是在要求继续做指定小问或继续下一问，例如“做第二问”。这不是学生回答错误，也不是卡住求入口。请直接接着原题进入对应小问：先用一句话确认要做哪一问，再基于已识别题干和图形继续讲解或启发。不要输出 A/B/C/D 入口选择，不要说“我们先别在同一个地方绕了”。如果上下文缺少该小问题干，只说明需要补充对应小问的题干或清晰图片。";
  }
  if (isDirectAnswerRequest(messages)) {
    return "当前用户明确要求直接答案或直接讲解。请立即回应这个问题本身，不要再让用户选 A/B/C/D，不要再套用“先确认对象/单位/关系”的入口模板。如果能从上下文算出，就直接算到最后；如果原题信息不足，只说清缺哪一条关键条件，请用户重发题干或清晰题图，不要让用户做入口选择。";
  }
  return "当前用户提出了明确疑问或反驳。请先正面回答用户这句话本身，不要继续套用原来的启发流程。回答时先说“你问的是……”，再解释原因；解释完后最多补一个很小的下一步问题。";
}

function learningPlanLine(messages, profile = {}) {
  if (!isLearningPlanRequest(messages, profile)) return "";
  if (profile?.intent === "lesson_start" || isKnowledgeLessonRequest(messages)) {
    return "当前用户要开始知识点学习，不是在解题作答。请直接设计一节小课：如果用户已经指定知识点，就围绕该知识点讲；否则选择一个最适合当前画像的知识点。先说明为什么学它，再讲核心结构，必要时配一个具体例子和 2-3 道练习。不要机械追问已知什么求什么，不要把用户当成已经答错的学生。";
  }
  if (profile?.intent === "daily_plan") {
    return "当前用户要安排今天的数学学习，不是在解题作答。请给一份当天可执行安排：目标、学习知识点、15-30分钟学习流程、练习题类型、复述任务、家长观察点。不要泛泛鼓励。";
  }
  return "当前用户要系统化学习规划，不是在解题作答。请按学生阶段、学习目标、当前状态和规划周期输出：阶段主线地图、优先补的知识块、周期安排、今天第一节课、练习分层、家长观察建议。不要只列目录，要让家长知道明天就怎么用。";
}

function isKnowledgeAnalogyRequest(messages) {
  const latest = latestUserText(messages);
  if (!latest || isPlanningText(latest) || isPracticeRequest(messages) || isNewProblemInput(latest)) return false;
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
  if (isDirectUserQuestion(messages) || isPracticeRequest(messages) || isKnowledgeLessonRequest(messages) || isLearningPlanRequest(messages) || isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) return false;
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
  if (userTurns <= 1 || isDirectUserQuestion(messages) || isPracticeRequest(messages) || isLearningPlanRequest(messages) || isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) return "";
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
  if (isProblemContinuationRequest(messages)) {
    return "好的，我们接着做你指定的这一问。\n\n不过当前对话里这一小问的完整题干不够清楚，我不能硬编步骤。请把这一问的文字贴出来，或重新发一张包含这一问的清晰题图；我会直接从这一问开始讲，不再让你选 A/B/C/D。";
  }
  if (isDirectAnswerRequest(messages)) {
    return "我不再让你选入口了。要给出最后答案，我需要完整题干或清晰题图；当前对话里只保留了部分关系，我不能负责任地报一个数。\n\n请把原题文字贴出来，或重新发一张清晰题图，我会直接算到最后。";
  }
  const shapeReply = shapeDefinitionReply(messages);
  if (shapeReply) return shapeReply;
  if (/平均分|先平均|尽量平均|抽屉|抽屉原理/.test(latest)) {
    return "你问的是：为什么抽屉原理里要先尽量平均分。\n\n原因是：我们想找的是“最少也会多出来”的那个临界点。先平均分，等于把东西尽可能分散，让每个盒子都尽量少，这样才是最不容易超出的情况。连这种最分散的情况都放不下，多出来的那一份就一定会把某个盒子顶上去。\n\n所以“先平均分”不是为了真的平均，而是为了找到最保守、最不容易出事的底线。";
  }
  return "你这个问题应该先直接回答，不能只按步骤往下推。\n\n我的意思是：这一类题里，每一步方法都要有理由。如果我说“先这样做”，就必须解释它为什么能帮助我们看见关系。你可以把你的疑问再具体说一句，比如“为什么先看这个量”或“为什么不用另一种做法”，我会先回答这个问题本身。";
}

function extractShapeTopic(text) {
  const value = String(text || "").replace(/\s+/g, "");
  const topics = [
    "等腰梯形", "直角梯形", "平行四边形", "长方体", "正方体", "圆柱", "圆锥",
    "菱形", "梯形", "长方形", "矩形", "正方形", "三角形", "四边形", "多边形",
    "扇形", "圆环", "半圆", "圆形", "圆", "球体", "球", "棱柱", "棱锥"
  ];
  return topics.find(topic => value.includes(topic)) || "";
}

function isShapeDefinitionQuestion(messages) {
  const latest = latestUserText(messages);
  const topic = extractShapeTopic(latest);
  if (!topic) return false;
  const value = latest.replace(/\s+/g, "").replace(/[？?。！!，,]/g, "");
  if (/(是什么|是啥|啥是|什么是|怎么认|怎样认|定义|性质|特点|属于什么|是哪类|呢)$/.test(value)) return true;
  if (value === topic || value === `${topic}呢` || value === `${topic}是什么` || value === `${topic}是啥`) return true;
  return false;
}

function shapeDefinitionReply(messages) {
  if (!isShapeDefinitionQuestion(messages)) return "";
  const topic = extractShapeTopic(latestUserText(messages));
  const replies = {
    平行四边形: "平行四边形，就是两组对边分别平行的四边形。\n\n一句话记住：上边和下边平行，左边和右边也平行。\n\n它常见的性质是：对边相等，对角相等，对角线互相平分。算面积时看底和高，面积=底×高。注意，高必须垂直于底，不是斜边。",
    菱形: "菱形，就是四条边都相等的平行四边形。\n\n它一定属于平行四边形，因为它有两组对边分别平行；但它比普通平行四边形多一个条件：四条边都相等。\n\n菱形不是梯形。梯形通常指只有一组对边平行的四边形；菱形有两组对边平行。\n\n菱形常见性质是：四边相等，对边平行，对角相等，对角线互相垂直平分。面积可以用底×高，也可以用两条对角线相乘再除以2。",
    梯形: "梯形，就是只有一组对边平行的四边形。\n\n平行的两条边叫上底和下底，另外两条边叫腰。梯形面积要看上底、下底和高，面积=(上底+下底)×高÷2。\n\n它和菱形、平行四边形的区别是：梯形通常只有一组对边平行，而平行四边形和菱形有两组对边平行。",
    等腰梯形: "等腰梯形，就是两条腰相等的梯形。\n\n它先是梯形，所以只有一组对边平行；同时两条腰一样长。同底角相等、对角线相等，是它常用的性质。",
    直角梯形: "直角梯形，就是有一个直角的梯形。\n\n它的一条腰通常垂直于底边，所以这条腰可以直接当高。算面积时仍然用：面积=(上底+下底)×高÷2。",
    长方形: "长方形，就是四个角都是直角的四边形。\n\n它也是一种特殊的平行四边形：两组对边分别平行且相等。周长=(长+宽)×2，面积=长×宽。",
    矩形: "矩形就是长方形：四个角都是直角的四边形。\n\n它有两组对边分别平行且相等，对角线也相等。面积=长×宽。",
    正方形: "正方形，就是四条边都相等、四个角都是直角的四边形。\n\n它既是特殊的长方形，也是特殊的菱形。周长=边长×4，面积=边长×边长。",
    三角形: "三角形，就是由三条线段围成的图形。\n\n学习三角形时重点看三件事：边、角、高。面积=底×高÷2。",
    四边形: "四边形，就是由四条线段围成的图形。\n\n平行四边形、长方形、正方形、菱形、梯形都属于四边形家族。区别它们时，主要看边是否平行、边是否相等、角是否是直角。",
    圆: "圆，就是平面上到同一个点距离相等的所有点组成的图形。\n\n中间那个点叫圆心，这个相等的距离叫半径。直径=2×半径，周长=2πr，面积=πr²。",
    圆形: "圆形，就是平面上到圆心距离不超过半径的整块区域。\n\n如果只说边界，叫圆；如果说里面整块面积，常说圆形区域。面积=πr²。",
    扇形: "扇形，就是圆里由两条半径和一段弧围成的一块区域。\n\n它像一块披萨。关键量是半径和圆心角。圆心角越大，扇形越大。",
    圆环: "圆环，就是大圆中间挖掉一个小圆后剩下的环形区域。\n\n面积=大圆面积-小圆面积，也就是 πR²-πr²。",
    半圆: "半圆，就是圆被一条直径分成的两半之一。\n\n半圆面积=πr²÷2。半圆周长要注意：不是圆周长的一半，而是半圆弧加一条直径，也就是 πr+2r。",
    圆柱: "圆柱，就是上下两个相同的圆形底面，加上一个侧面围成的立体图形。\n\n可以想象成易拉罐。体积=底面积×高，侧面积=底面周长×高。",
    圆锥: "圆锥，就是一个圆形底面和一个顶点连成的立体图形。\n\n可以想象成冰淇淋甜筒。体积=底面积×高÷3。",
    正方体: "正方体，就是长、宽、高都相等的长方体。\n\n它有6个完全一样的正方形面，12条棱都相等。体积=棱长×棱长×棱长。",
    长方体: "长方体，就是由6个长方形面围成的立体图形。\n\n关键看长、宽、高三个方向。体积=长×宽×高。",
    球: "球，就是空间里到同一个点距离相等的所有点形成的立体图形。\n\n中间的点叫球心，这个相等距离叫半径。",
    球体: "球体，就是球面连同里面的整个空间区域。\n\n可以想象成篮球或地球模型。关键量是球心和半径。",
    多边形: "多边形，就是由多条线段首尾相接围成的平面图形。\n\n三角形、四边形、五边形都属于多边形。正多边形还要求各边相等、各角相等。"
  };
  const answer = replies[topic] || `${topic}是一个数学图形。先看它由哪些点、线、面组成，再看它有哪些固定关系，比如平行、相等、垂直或角度关系。`;
  return `${answer}\n\n你可以先用一句话记：${shapeOneLine(topic)}`;
}

function shapeOneLine(topic) {
  const lines = {
    平行四边形: "两组对边分别平行的四边形。",
    菱形: "四条边都相等的平行四边形。",
    梯形: "只有一组对边平行的四边形。",
    等腰梯形: "两条腰相等的梯形。",
    直角梯形: "有一个直角的梯形。",
    长方形: "四个角都是直角的四边形。",
    矩形: "四个角都是直角的四边形。",
    正方形: "四边相等、四角都是直角的四边形。",
    三角形: "三条线段围成的图形。",
    圆: "到圆心距离相等的点围成的图形。",
    扇形: "两条半径和一段弧围成的圆的一部分。",
    圆柱: "两个相同圆形底面加一个侧面形成的立体图形。",
    圆锥: "一个圆形底面和一个顶点形成的立体图形。"
  };
  return lines[topic] || `先看${topic}的组成和固定关系。`;
}

function practiceRequestLine(messages) {
  if (!isPracticeRequest(messages)) return "";
  return "当前用户是在请求出题或练习，不是在回答题目。请先直接给出一道完整题目；不要说“你这一步有价值”“把刚才得到的量放回题目”之类反馈；也不要一开始就要求分析对象、单位/标准、关系。题目后只留一句自然提示：你先试试，卡住了我再提示。";
}

function activeProblemText(messages) {
  const latest = latestUserText(messages);
  if (isLearningPlanRequest(messages) || isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) return "";
  if (!latest || isPracticeRequest(messages) || isNewProblemInput(latest)) return "";
  const assistant = [...messages].reverse()
    .find(message => message.role === "assistant" && /问|多少|几|？|\?/.test(deepSeekMessageText(message)));
  const text = deepSeekMessageText(assistant);
  if (!text || /你好|嗨|当前试用|新的对话已开启|你现在有想/.test(text)) return "";
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

function fallbackKnowledgeAnalogyReply(messages) {
  const latest = latestUserText(messages);
  const scene = hasFamiliarScene(latest) && /做饭/.test(latest) ? "做饭" : "分东西";
  if (/分数|整体单位|单位1|单位一/.test(latest)) {
    if (scene === "做饭") {
      return "你问的是：为什么分数一定要先确定“整体单位”。\n\n我用做饭来比方。1/2 就像“半份配方”，但半份到底是多少，要先知道原来那一整份配方是什么：一整锅汤的一半，和一小碗汤的一半，数量完全不一样。\n\n所以分数里的分母、分子不是孤零零的数，它们都依赖一个“整份”。先确定整份，1/2、3/4 才有具体意义。\n\n哪里像：做饭先定一整份配方，数学里先定单位1。哪里不完全一样：做饭会受锅、人数、口味影响，数学里的整体单位一旦确定，关系就更稳定。";
    }
    return "你问的是：为什么分数一定要先确定“整体单位”。\n\n我用分东西来比方。说“拿走一半”之前，必须先知道是“一半苹果”“一半蛋糕”，还是“一半箱书”。如果整体不同，同样是 1/2，实际数量可能完全不同。\n\n所以分数不是只看分子分母，还要先看它是哪个整体的几分之几。";
  }
  return "你问的是这个知识该怎么用生活场景来理解。\n\n我先用一个最普通的场景来比方：先看场景里有哪些东西，再看它们之间保持什么关系，最后看我们要做什么操作。数学里的概念、公式或方法，也不是凭空来的，而是为了把这种稳定关系表达清楚。\n\n哪里像：生活场景帮助我们看见对象和关系。哪里不完全一样：数学会把生活里的细节压缩掉，只保留最稳定、最可迁移的关系。";
}

function isIntervalPlacementContext(text) {
  const value = String(text || "");
  const placement = /植树|种.*树|栽.*树|树苗|路灯|电线杆|站点|路桩|栏杆柱|摆花|插旗/;
  const interval = /每隔|相隔|间隔|等距|每\s*\d+(?:\.\d+)?\s*(?:米|千米|厘米)/;
  return placement.test(value) && interval.test(value);
}

function classifyPrimaryOlympiadContext(text) {
  const value = String(text || "");
  if (!value.trim()) return "";
  if (isIntervalPlacementContext(value)) return "interval";
  if (/三角形|四边形|梯形|平行四边形|菱形|正方形|长方形|圆|切线|弦|半径|直径|垂直|平行|全等|相似|△|∠|⊙|[A-Z]{2,3}/.test(value)
    && /已知|证明|求|如图|面积|周长|角度|边长/.test(value)) return "";
  if (/鸡兔同笼|头数.*脚数|头.*脚|两轮车.*三轮车|三轮车.*两轮车|龟鹤|总只数.*总腿数/.test(value)) return "two-category";
  if (/答对.*得分|答错.*扣分|错中求解|全答对|得分.*题数/.test(value)) return "two-category";
  if (/浓度|盐水|糖水|溶液|溶质|含盐率|含糖率|混合液/.test(value)) return "mixture";
  if (/抽屉|鸽巢|至少有.*相同|保证.*至少|放入.*盒|分到.*箱/.test(value)) return "pigeonhole";
  if (/容斥|至少一个|至少参加|两项都|既.*又|只参加|重复计算|韦恩图|集合/.test(value)) return "venn";
  if (/平均|移多补少/.test(value)) return "average-bars";
  if (/年龄|岁数|爸爸|妈妈|儿子|女儿|兄弟|姐妹/.test(value) && /岁|年龄|年后|年前|倍/.test(value)) return "age-bars";
  if (/相遇|追及|相向|同向|速度|路程|行程|早到|晚到|顺流|逆流|流水|火车过桥/.test(value)) return "route-line";
  if (/工程|工作效率|工作量|合做|合作|单独完成|修路|加工|每天完成|几天完成|水池|进水|出水|注水|放水|牛吃草|草场|草地.*牛/.test(value)) return "unit-work";
  if (/周期|循环|重复排列|彩灯|按.*顺序|第\s*\d+\s*(?:个|项|盏|面|位|次)|星期几|余数对应/.test(value)) return "cycle-strip";
  if (/盈亏|盈余|亏欠|每人分|每个分|多出|少了|还差|刚好分完|每.*多.*每.*少/.test(value)) return "distribution-balance";
  if (/和差|和倍|差倍|两数.*和.*相差|总和.*相差|倍数关系|是.*的\s*\d+(?:\.\d+)?\s*倍|比.*多|比.*少/.test(value)) return "bar-model";
  if (/等量代换|天平|砝码|归一问题|归总问题|单一量|单价.*总价|单产.*总产/.test(value)) return "bar-model";
  if (/分数|几分之|\d+\s*\/\s*\d+|单位\s*1|单位一|比例|比是|按.*比|份数|占总数/.test(value)) return "fraction-bars";
  if (/利润|成本|售价|定价|折扣|打折|涨价|降价|百分数/.test(value)) return "fraction-bars";
  if (/排列|组合|搭配|有几种|多少种|路线选择|涂色|握手|比赛场次|选法/.test(value)) return "choice-tree";
  if (/余数|除以.*余|整除|约数|因数|倍数|质数|合数|最大公因数|最小公倍数|奇数|偶数|尾数|数字和|数位|页码|数码|位数|数字出现/.test(value)) return "number-groups";
  if (/逻辑推理|真假|谁说真话|谁说假话|对应关系|排序|名次|住第几|各住哪|分别是|根据条件.*判断|列表推理/.test(value)) return "logic-grid";
  if (/数阵|幻方|方阵|数表|九宫格|填数|横竖斜/.test(value)) return "number-grid";
  if (/还原问题|倒推|逆推|原来有|最后剩|连续操作|定义新运算|新运算|运算符号/.test(value)) return "reverse-chain";
  return "";
}

function diagramProblemText(messages = []) {
  const entries = messages
    .map(message => ({ role: message.role, text: deepSeekMessageText(message).trim() }))
    .filter(entry => entry.text);
  if (!entries.length) return "";
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (isIntervalPlacementContext(entry.text)
      || (entry.role === "user" && (isNewProblemInput(entry.text) || entry.text.length >= 36))) {
      return entries.slice(index).map(item => item.text).join("\n");
    }
  }
  return entries.slice(-6).map(item => item.text).join("\n");
}

function shouldShowLocalDiagram(messages, profile = {}) {
  const text = latestUserText(messages);
  return /画图|作图|配图|图解|画出来|关系图|示意图|看图理解|图像画出来|画个图/.test(text);
}

function isKnowledgeVisualTopic(text) {
  const value = String(text || "");
  return /函数|图像|坐标|自变量|因变量|定义域|值域|单调|奇偶|一次函数|二次函数|反比例函数|指数函数|对数函数|导数|斜率|长方形|正方形|矩形|梯形|平行四边形|菱形|多边形|正多边形|扇形|圆环|半圆|轴对称|对称轴|平移|旋转|放缩|圆柱|圆锥|正方体|长方体|立方体|球|棱柱|棱锥|周长|几何|图形|三角形|四边形|圆|线段|直线|射线|角度|平行|垂直|相似|全等|切线|弦|半径|直径|面积|表面积|侧面积|体积|数列|通项|递推|概率|样本空间|事件/.test(value);
}

function shouldPreferLocalDiagram(messages, profile = {}) {
  const problemText = diagramProblemText(messages);
  const text = `${problemText}\n${latestUserText(messages)}`;
  if (classifyPrimaryOlympiadContext(problemText || latestUserText(messages))) return true;
  if (/长方形|正方形|矩形|梯形|平行四边形|菱形|多边形|正多边形|扇形|圆环|半圆|轴对称|对称轴|平移|旋转|放缩|圆柱|圆锥|正方体|长方体|立方体|球|周长|面积|函数|图像|坐标|自变量|因变量|定义域|值域|单调|奇偶/.test(text)) return true;
  if (/知识点|概念|学|学习|讲讲|解释|理解|类比|为什么|是什么|是啥|定义|性质|特点|示意图|图解/.test(text) && isKnowledgeVisualTopic(text)) return true;
  return false;
}

function isGeometryExampleContext(text) {
  const value = String(text || "");
  return /几何|三角形|四边形|梯形|平行四边形|菱形|正方形|长方形|圆|角度|平行|垂直|相似|全等|切线|弦|半径|直径|△|∠|⊙|[A-Z]{2,3}/.test(value)
    && /例题|练习|题目|已知|证明|求|如图|若|设|问|推出|说明/.test(value);
}

function geometryExampleKind(text) {
  const value = String(text || "");
  if (/圆|⊙|切线|弦|半径|直径|圆心/.test(value)) return "circle";
  if (/梯形/.test(value)) return "trapezoid";
  if (/四边形|矩形|正方形|菱形|平行四边形/.test(value)) return "quadrilateral";
  return "triangle";
}

function geometryExampleLabels(text, kind) {
  const found = [...String(text || "").matchAll(/[A-Z]/g)]
    .map(match => match[0])
    .filter(label => !["X", "Y"].includes(label));
  const unique = [...new Set(found)].slice(0, 8);
  const defaults = {
    circle: ["O", "P", "A", "B", "C"],
    trapezoid: ["A", "B", "C", "D", "E"],
    quadrilateral: ["A", "B", "C", "D", "E"],
    triangle: ["A", "B", "C", "D", "E"]
  };
  return unique.length >= 3 ? unique : defaults[kind];
}

function geometryRelationsFromText(text) {
  const value = String(text || "").replace(/\s+/g, "");
  const relations = [];
  const push = relation => {
    const label = relation.label || [relation.a, relation.type, relation.b].filter(Boolean).join(" ");
    if (!label) return;
    const key = `${relation.type}|${relation.a || ""}|${relation.b || ""}|${relation.point || ""}|${relation.line || ""}|${label}`;
    if (relations.some(item => item.key === key)) return;
    relations.push({ ...relation, label, key });
  };

  for (const match of value.matchAll(/([A-Z]{1,2})(?:⊥|垂直于?|与)([A-Z]{1,2})(?:垂直)/g)) {
    push({ type: "perpendicular", a: match[1], b: match[2], label: `${match[1]} ⟂ ${match[2]}` });
  }
  for (const match of value.matchAll(/([A-Z]{1,2})(?:∥|平行于?|与)([A-Z]{1,2})(?:平行)/g)) {
    push({ type: "parallel", a: match[1], b: match[2], label: `${match[1]} ∥ ${match[2]}` });
  }
  for (const match of value.matchAll(/([A-Z])(?:在|位于)([A-Z]{2})上/g)) {
    push({ type: "pointOn", point: match[1], line: match[2], label: `${match[1]} 在 ${match[2]} 上` });
  }
  for (const match of value.matchAll(/([A-Z]{2})(?:=|等于)([A-Z]{2})/g)) {
    push({ type: "equal", a: match[1], b: match[2], label: `${match[1]} = ${match[2]}` });
  }
  for (const match of value.matchAll(/([A-Z]{2})(?:是|为)?(?:⊙?[A-Z]?的?)?切线/g)) {
    push({ type: "tangent", a: match[1], label: `${match[1]} 为切线` });
  }
  for (const match of value.matchAll(/∠?([A-Z]{3})(?:=|等于)∠?([A-Z]{3})/g)) {
    push({ type: "equalAngle", a: `∠${match[1]}`, b: `∠${match[2]}`, label: `∠${match[1]} = ∠${match[2]}` });
  }
  return relations.map(({ key, ...relation }) => relation).slice(0, 8);
}

function buildGeometryExampleDiagram(context) {
  const kind = geometryExampleKind(context);
  const labels = geometryExampleLabels(context, kind);
  const relations = geometryRelationsFromText(context);
  const shapeName = {
    circle: "圆与切线/弦关系",
    trapezoid: "梯形与三角形关系",
    quadrilateral: "四边形关系",
    triangle: "三角形关系"
  }[kind] || "几何关系";
  return {
    title: "几何例题示意图",
    demoType: `geometry-example-${kind}`,
    figure: { kind, labels, relations },
    nodes: [
      { id: "n1", label: shapeName, type: "given" },
      { id: "n2", label: `标注点：${labels.slice(0, 5).join("、")}`, type: "given" },
      { id: "n3", label: "已知关系", type: "relation" },
      { id: "n4", label: "关键辅助关系", type: "step" },
      { id: "n5", label: "要证明/要求的目标", type: "goal" },
      { id: "n6", label: "回到原题核对", type: "check" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "先定位图形" },
      { from: "n2", to: "n3", label: "读已知标注" },
      { from: "n3", to: "n4", label: "找定理桥梁" },
      { from: "n4", to: "n5", label: "推出目标" },
      { from: "n5", to: "n6", label: "防止误读" }
    ],
    note: "根据智能体本轮生成的几何例题自动配图；这是辅助理解示意图，不替代严谨作图。"
  };
}

function buildRectangleMeasureDiagram(context) {
  const isSquare = /正方形/.test(context);
  return {
    title: isSquare ? "正方形周长与面积示意图" : "长方形周长与面积示意图",
    demoType: "rectangle-measure",
    figure: { kind: isSquare ? "square" : "rectangle" },
    nodes: [
      { id: "n1", label: isSquare ? "正方形" : "长方形", type: "given" },
      { id: "n2", label: isSquare ? "边长 a" : "长 a、宽 b", type: "given" },
      { id: "n3", label: "周长看边界一圈", type: "relation" },
      { id: "n4", label: "面积看里面铺满", type: "relation" },
      { id: "n5", label: isSquare ? "周长=4×边长" : "周长=(长+宽)×2", type: "result" },
      { id: "n6", label: isSquare ? "面积=边长×边长" : "面积=长×宽", type: "result" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "先看尺寸" },
      { from: "n2", to: "n3", label: "围一圈" },
      { from: "n2", to: "n4", label: "铺小方格" },
      { from: "n3", to: "n5", label: "边长相加" },
      { from: "n4", to: "n6", label: "行数×列数" }
    ],
    note: "周长是外边界一圈的长度，面积是内部能铺多少个单位小方格。"
  };
}

function buildPlaneShapeDiagram(context) {
  const value = String(context || "");
  const candidates = [
    {
      pattern: /平行四边形/,
      kind: "parallelogram",
      title: "平行四边形结构示意图",
      object: "平行四边形",
      parts: ["两组对边分别平行", "对边相等", "对角相等", "对角线互相平分"],
      formulas: ["面积=底×高", "可割补成长方形理解面积"],
      note: "平行四边形的核心不是长方形本身，而是两组对边分别平行带来的边、角、面积和对角线关系。"
    },
    {
      pattern: /扇形/,
      kind: "sector",
      title: "扇形结构示意图",
      object: "扇形",
      parts: ["圆心 O", "半径 r", "圆心角 θ", "弧长"],
      formulas: ["弧长=圆周长×θ/360°", "面积=圆面积×θ/360°"],
      note: "扇形不是普通三角形，关键是半径、圆心角和弧组成的一块圆。"
    },
    {
      pattern: /圆环|环形/,
      kind: "annulus",
      title: "圆环结构示意图",
      object: "圆环",
      parts: ["外圆半径 R", "内圆半径 r", "外圆面积", "内圆面积"],
      formulas: ["圆环面积=πR²-πr²", "也可写成 π×(R²-r²)"],
      note: "圆环要看成大圆挖去小圆，重点是外半径和内半径。"
    },
    {
      pattern: /半圆/,
      kind: "semicircle",
      title: "半圆结构示意图",
      object: "半圆",
      parts: ["直径 d", "半径 r", "半圆弧", "直径边"],
      formulas: ["面积=πr²÷2", "周长=πr+2r"],
      note: "半圆周长包含弧长和直径，不能只算圆周长的一半。"
    },
    {
      pattern: /菱形/,
      kind: "rhombus",
      title: "菱形结构示意图",
      object: "菱形",
      parts: ["四条边相等", "对边平行", "对角线互相垂直", "对角线互相平分"],
      formulas: ["面积=底×高", "面积=两条对角线乘积÷2"],
      note: "菱形的核心是四边相等，并且对角线互相垂直平分。"
    },
    {
      pattern: /等腰梯形/,
      kind: "isoscelesTrapezoid",
      title: "等腰梯形结构示意图",
      object: "等腰梯形",
      parts: ["上底", "下底", "两腰相等", "同底角相等"],
      formulas: ["面积=(上底+下底)×高÷2"],
      note: "等腰梯形比普通梯形多了两腰相等和同底角相等。"
    },
    {
      pattern: /直角梯形/,
      kind: "rightTrapezoid",
      title: "直角梯形结构示意图",
      object: "直角梯形",
      parts: ["上底", "下底", "一条腰垂直于底", "高"],
      formulas: ["面积=(上底+下底)×高÷2"],
      note: "直角梯形有一条腰本身就是高，先找垂直关系。"
    },
    {
      pattern: /正多边形|正五边形|正六边形|正七边形|正八边形/,
      kind: "regularPolygon",
      title: "正多边形结构示意图",
      object: "正多边形",
      parts: ["各边相等", "各角相等", "中心", "可分成若干全等三角形"],
      formulas: ["周长=边长×边数", "面积=周长×边心距÷2"],
      note: "正多边形的核心是边和角都一样，可从中心切成若干个全等三角形。"
    },
    {
      pattern: /组合图形|阴影面积|割补|拼接|等积变形/,
      kind: "composite",
      title: "组合图形结构示意图",
      object: "组合图形",
      parts: ["基本图形", "重叠/挖去部分", "分割线", "可移动的等面积部分"],
      formulas: ["总面积=相加-重叠", "阴影面积=大区域-空白区域"],
      note: "组合图形先拆成会算的基本图形，再用加、减、割补处理。"
    },
    {
      pattern: /轴对称|对称轴/,
      kind: "symmetry",
      title: "轴对称结构示意图",
      object: "轴对称图形",
      parts: ["对称轴", "对应点", "对应线段", "距离相等"],
      formulas: ["对应点到对称轴距离相等"],
      note: "轴对称要看对应点是否隔着对称轴一一相对。"
    },
    {
      pattern: /平移/,
      kind: "translation",
      title: "平移结构示意图",
      object: "平移",
      parts: ["原图形", "新图形", "方向", "距离"],
      formulas: ["形状大小不变，只改变位置"],
      note: "平移只移动位置，不改变方向、形状和大小。"
    },
    {
      pattern: /旋转/,
      kind: "rotation",
      title: "旋转结构示意图",
      object: "旋转",
      parts: ["旋转中心 O", "旋转方向", "旋转角", "对应点"],
      formulas: ["对应点到旋转中心距离相等"],
      note: "旋转要抓住中心、方向和角度。"
    },
    {
      pattern: /放缩|缩放|相似/,
      kind: "similarity",
      title: "相似/放缩结构示意图",
      object: "相似图形",
      parts: ["对应角相等", "对应边成比例", "放缩中心", "比例 k"],
      formulas: ["周长比=k", "面积比=k²"],
      note: "相似图形形状不变，大小按同一个比例改变。"
    }
  ];
  const meta = candidates.find(item => item.pattern.test(value));
  if (!meta) return null;
  return {
    title: meta.title,
    demoType: "plane-shape",
    figure: { kind: meta.kind, parts: meta.parts, formulas: meta.formulas },
    nodes: [
      { id: "n1", label: meta.object, type: "given" },
      { id: "n2", label: meta.parts[0], type: "given" },
      { id: "n3", label: meta.parts[1] || "关键组成", type: "given" },
      { id: "n4", label: meta.parts[2] || "关键关系", type: "relation" },
      { id: "n5", label: meta.formulas[0], type: "result" },
      { id: "n6", label: meta.formulas[1] || "关系迁移", type: "result" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "先看对象" },
      { from: "n2", to: "n3", label: "找组成" },
      { from: "n3", to: "n4", label: "定关系" },
      { from: "n4", to: "n5", label: "进入公式" },
      { from: "n4", to: "n6", label: "迁移理解" }
    ],
    note: meta.note
  };
}

function buildSolidShapeDiagram(context) {
  const value = String(context || "");
  const kind = /圆锥/.test(value)
    ? "cone"
    : (/正方体|立方体/.test(value) ? "cube" : (/长方体/.test(value) ? "cuboid" : (/球|球体/.test(value) ? "sphere" : (/圆柱/.test(value) ? "cylinder" : ""))));
  if (!kind) return null;
  const meta = {
    cylinder: {
      title: "圆柱结构示意图",
      object: "圆柱",
      parts: ["上底圆", "下底圆", "高 h", "侧面展开是长方形"],
      formulas: ["体积=底面积×高", "侧面积=底面周长×高", "表面积=侧面积+两个底面积"],
      note: "圆柱要看两个相同的圆形底面和一条垂直的高。"
    },
    cone: {
      title: "圆锥结构示意图",
      object: "圆锥",
      parts: ["一个圆形底面", "顶点", "高 h", "母线 l"],
      formulas: ["体积=底面积×高÷3", "侧面积=πrl", "表面积=侧面积+底面积"],
      note: "圆锥和圆柱相比，关键多了顶点，体积是同底等高圆柱的三分之一。"
    },
    cube: {
      title: "正方体结构示意图",
      object: "正方体",
      parts: ["6个全等正方形面", "12条相等棱", "棱长 a"],
      formulas: ["体积=a×a×a", "表面积=6×a×a"],
      note: "正方体的核心是长、宽、高都相等。"
    },
    cuboid: {
      title: "长方体结构示意图",
      object: "长方体",
      parts: ["长 a", "宽 b", "高 h", "相对的面相等"],
      formulas: ["体积=长×宽×高", "表面积=2×(长×宽+长×高+宽×高)"],
      note: "长方体要把三个互相垂直的方向看清：长、宽、高。"
    },
    sphere: {
      title: "球结构示意图",
      object: "球",
      parts: ["球心 O", "半径 r", "直径 d=2r", "表面到球心距离相等"],
      formulas: ["体积=4/3×πr³", "表面积=4πr²"],
      note: "球的核心是所有表面点到球心的距离都等于半径。"
    }
  }[kind];
  return {
    title: meta.title,
    demoType: "solid-shape",
    figure: { kind, parts: meta.parts, formulas: meta.formulas },
    nodes: [
      { id: "n1", label: meta.object, type: "given" },
      { id: "n2", label: meta.parts[0], type: "given" },
      { id: "n3", label: meta.parts[1] || "关键尺寸", type: "given" },
      { id: "n4", label: meta.parts[2] || "高/半径", type: "relation" },
      { id: "n5", label: meta.formulas[0], type: "result" },
      { id: "n6", label: meta.formulas[1] || "表面积关系", type: "result" }
    ],
    edges: [
      { from: "n1", to: "n2", label: "先看组成" },
      { from: "n2", to: "n3", label: "找关键尺寸" },
      { from: "n3", to: "n4", label: "确定高度/半径" },
      { from: "n4", to: "n5", label: "体积入口" },
      { from: "n4", to: "n6", label: "表面积入口" }
    ],
    note: meta.note
  };
}

function buildShapeKnowledgeDiagram(context) {
  const value = String(context || "");
  const plane = buildPlaneShapeDiagram(value);
  if (plane) return plane;
  const solid = buildSolidShapeDiagram(value);
  if (solid) return solid;
  if (/平行四边形/.test(value)) {
    return {
      title: "平行四边形结构示意图",
      demoType: "geometry-semantic",
      figure: {
        kind: "parallelogram",
        labels: ["A", "B", "C", "D", "O"],
        points: [
          { id: "A", x: 58, y: 178 },
          { id: "B", x: 238, y: 178 },
          { id: "C", x: 268, y: 76 },
          { id: "D", x: 88, y: 76 },
          { id: "O", x: 163, y: 127 }
        ],
        segments: [
          { from: "A", to: "B" },
          { from: "B", to: "C" },
          { from: "C", to: "D" },
          { from: "D", to: "A" },
          { from: "A", to: "C", label: "对角线" },
          { from: "B", to: "D", label: "对角线" }
        ],
        relations: [
          { type: "parallel", a: "AB", b: "CD", label: "AB ∥ CD" },
          { type: "parallel", a: "AD", b: "BC", label: "AD ∥ BC" },
          { type: "equal", a: "AB", b: "CD", label: "AB = CD" },
          { type: "equal", a: "AD", b: "BC", label: "AD = BC" },
          { type: "equalAngle", a: "∠A", b: "∠C", label: "∠A = ∠C" }
        ]
      },
      nodes: [
        { id: "n1", label: "一个四边形", type: "given" },
        { id: "n2", label: "两组对边分别平行", type: "relation" },
        { id: "n3", label: "对边相等", type: "result" },
        { id: "n4", label: "对角相等", type: "result" },
        { id: "n5", label: "面积=底×高", type: "result" },
        { id: "n6", label: "对角线互相平分", type: "relation" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "定义入口" },
        { from: "n2", to: "n3", label: "推出边关系" },
        { from: "n2", to: "n4", label: "推出角关系" },
        { from: "n2", to: "n5", label: "转化成长方形" },
        { from: "n2", to: "n6", label: "看对角线" }
      ],
      note: "平行四边形的核心不是“三角形”，而是两组对边分别平行带来的边、角、面积和对角线关系。"
    };
  }
  if (/梯形/.test(value)) {
    return {
      title: "梯形结构示意图",
      demoType: "geometry-semantic",
      figure: {
        kind: "trapezoid",
        labels: ["A", "B", "C", "D", "E"],
        points: [
          { id: "A", x: 58, y: 178 },
          { id: "B", x: 252, y: 178 },
          { id: "C", x: 210, y: 72 },
          { id: "D", x: 112, y: 72 },
          { id: "E", x: 210, y: 178 }
        ],
        segments: [
          { from: "A", to: "B" },
          { from: "B", to: "C" },
          { from: "C", to: "D" },
          { from: "D", to: "A" },
          { from: "C", to: "E", label: "高" }
        ],
        relations: [
          { type: "parallel", a: "AB", b: "CD", label: "AB ∥ CD" },
          { type: "perpendicular", a: "CE", b: "AB", label: "CE ⟂ AB" },
          { type: "formula", label: "面积=(上底+下底)×高÷2" }
        ]
      },
      nodes: [
        { id: "n1", label: "只有一组对边平行", type: "given" },
        { id: "n2", label: "上底、下底、高", type: "relation" },
        { id: "n3", label: "面积公式", type: "result" },
        { id: "n4", label: "可分割/拼成长方形", type: "step" },
        { id: "n5", label: "等腰梯形另有性质", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "看平行边" },
        { from: "n2", to: "n3", label: "平均底×高" },
        { from: "n2", to: "n4", label: "理解公式" },
        { from: "n1", to: "n5", label: "分类判断" }
      ],
      note: "梯形的核心是只有一组对边平行，面积要看上底、下底和高。"
    };
  }
  return null;
}

function buildIntervalPlacementDiagram(context) {
  const value = String(context || "").replace(/\s+/g, " ");
  if (!isIntervalPlacementContext(value)) return null;

  const measurements = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(千米|公里|厘米|米|km|cm|m)(?![\w])/gi)]
    .map(match => ({ value: Number(match[1]), unit: match[2] }))
    .filter(item => Number.isFinite(item.value) && item.value > 0);
  const total = measurements[0]?.value || null;
  const totalUnit = measurements[0]?.unit || "米";
  const spacingItem = measurements.slice(1).find(item => !total || item.value < total) || measurements[1] || null;
  const spacing = spacingItem?.value || null;
  const exactSegments = total && spacing && total >= spacing && Number.isInteger(total / spacing)
    ? total / spacing
    : null;

  const closedLoop = /环形|圆形|围成一圈|首尾相接/.test(value);
  const excludeBoth = /两端(?:都)?不|两头(?:都)?不/.test(value);
  const includeBoth = /两端(?:都)?(?:种|栽|有|放)|两头(?:都)?(?:种|栽|有|放)|起点和终点(?:都)?|首尾(?:都)?(?:种|栽|有|放)/.test(value);
  const oneEnd = /只(?:种|栽|放)一端|一端(?:种|栽|放).*(?:另一端|另端)不|一头(?:种|栽|放).*(?:另一头|另头)不/.test(value);
  let pointCount = null;
  let endpointLabel = "端点条件需要核对";
  if (exactSegments !== null) {
    if (closedLoop || oneEnd) {
      pointCount = exactSegments;
      endpointLabel = closedLoop ? "首尾相接" : "只计一个端点";
    } else if (excludeBoth) {
      pointCount = Math.max(0, exactSegments - 1);
      endpointLabel = "两端都不种";
    } else if (includeBoth) {
      pointCount = exactSegments + 1;
      endpointLabel = "两端都种";
    }
  }

  const visibleCount = exactSegments !== null ? Math.min(exactSegments + 1, 11) : 7;
  const labels = Array.from({ length: visibleCount }, (_, index) => {
    if (spacing && exactSegments !== null && exactSegments <= 10) return `${index * spacing}`;
    return index === 0 ? "起点" : (index === visibleCount - 1 ? "终点" : "");
  });
  const lengthLabel = total ? `路长 ${total}${totalUnit}` : "道路总长";
  const spacingLabel = spacing ? `每隔 ${spacing}${spacingItem?.unit || totalUnit}` : "相邻位置等距";
  const intervalLabel = exactSegments !== null ? `间隔数 ${total}÷${spacing}=${exactSegments}` : "先求间隔数";
  const resultLabel = pointCount !== null ? `位置数 ${pointCount}` : "位置数由端点条件决定";

  return {
    title: "等距种植线段示意图",
    demoType: "interval-line",
    figure: { kind: "interval-line", labels },
    nodes: [
      { id: "n1", label: lengthLabel, type: "given" },
      { id: "n2", label: spacingLabel, type: "given" },
      { id: "n3", label: intervalLabel, type: "relation" },
      { id: "n4", label: endpointLabel, type: "check" },
      { id: "n5", label: resultLabel, type: pointCount !== null ? "result" : "goal" }
    ],
    edges: [
      { from: "n1", to: "n3", label: "总长÷间距" },
      { from: "n2", to: "n3", label: "划分等长段" },
      { from: "n3", to: "n4", label: "再看两端" },
      { from: "n4", to: "n5", label: "确定位置数" }
    ],
    note: "线段被等距点分成若干段；间隔数和种植位置数是否相差 1，取决于两端是否都种。"
  };
}

function buildPrimaryOlympiadDiagram(context) {
  const value = String(context || "").replace(/\s+/g, " ");
  const kind = classifyPrimaryOlympiadContext(value);
  if (!kind || kind === "interval") return null;
  const numbers = [...value.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0]).slice(0, 8);
  const templates = {
    "two-category": {
      title: "鸡兔同笼类双对象模型",
      labels: ["两类对象", "总数量", "总特征量", "单位差", "调整数量"],
      note: "先固定对象总数，再用每类对象的单位贡献差调整；图中两类可以是鸡兔、两轮三轮车或其他双对象。"
    },
    mixture: {
      title: "浓度混合模型",
      labels: ["原溶液", "加入/取出", "溶质数量", "溶液总量", "新浓度"],
      note: "浓度图同时盯住溶质和溶液总量；混合或取出时，两者的变化不能混为一谈。"
    },
    venn: {
      title: "容斥集合示意图",
      labels: ["集合 A", "集合 B", "重复部分", "至少一项", "总人数/总个数"],
      note: "两个集合重叠处被计算了两次，所以合并时要把重复部分减去一次。"
    },
    pigeonhole: {
      title: "抽屉分配示意图",
      labels: ["待分对象", "抽屉数量", "先尽量平均", "剩余对象", "至少一个抽屉"],
      note: "先平均放入每个抽屉，再看剩余对象落到哪里，从而得到至少有多少个。"
    },
    "average-bars": {
      title: "平均数移多补少图",
      labels: ["各个数量", "总量不变", "拉到同一高度", "平均水平", "反查总量"],
      note: "平均数表示把总量重新均分后的同一高度，移动前后总量保持不变。"
    },
    "age-bars": {
      title: "年龄差不变线段图",
      labels: ["较小年龄", "年龄差", "较大年龄", "同时增减", "倍数关系"],
      note: "两个人经过相同年数后年龄差不变，但倍数关系会发生变化。"
    },
    "route-line": {
      title: "行程路线示意图",
      labels: ["起点", "对象 A", "对象 B", "相遇/追及点", "路程=速度×时间"],
      note: "把运动方向、共同时间和各自走过的路程放在同一条路线上，再建立相遇或追及关系。"
    },
    "unit-work": {
      title: "工程总量与效率图",
      labels: ["总工作量=1", "对象 A 效率", "对象 B 效率", "合做效率", "完成时间"],
      note: "把整项工作看成 1，先求单位时间完成多少，再由总量和效率确定时间。"
    },
    "cycle-strip": {
      title: "周期重复格示意图",
      labels: ["最小重复组", "每组长度", "完整组", "余数位置", "目标项"],
      note: "先圈出最小重复组，再用目标位置除以组长，余数决定它落在组内哪个位置。"
    },
    "distribution-balance": {
      title: "盈亏分配对比图",
      labels: ["对象总数", "方案一", "盈/亏一", "方案二", "盈亏总差"],
      note: "比较两种分配方案：每份变化多少、总盈亏相差多少，两者对应同一批对象。"
    },
    "bar-model": {
      title: "和差倍份数线段图",
      labels: ["较小量", "相同份数", "相差部分", "较大量", "总和/目标量"],
      note: "先把相同的一份对齐，再把多出的差或倍数部分单独标出来。"
    },
    "fraction-bars": {
      title: "分数与比例份数图",
      labels: ["整体单位", "平均分份", "已知份数", "对应数量", "目标份数"],
      note: "先确定整体单位，再把整体等分；分数或比例表示其中占了几份。"
    },
    "choice-tree": {
      title: "排列组合树状图",
      labels: ["第一步选择", "第二步选择", "分支不重不漏", "完整路径", "方法总数"],
      note: "每条从起点走到末端的完整路径代表一种方法，分层展开可避免重复和遗漏。"
    },
    "number-groups": {
      title: "数论分组与余数图",
      labels: ["待研究的数", "按除数分组", "完整组", "余数", "整除/周期性质"],
      note: "把数写成若干完整组加余数，整除、奇偶、尾数和周期问题都可在分组中观察。"
    },
    "logic-grid": {
      title: "逻辑对应排除表",
      labels: ["对象", "可能选项", "确定关系", "排除矛盾", "唯一对应"],
      note: "把对象和选项排成表格，逐条标记确定与排除，直到每行每列形成唯一对应。"
    },
    "number-grid": {
      title: "数阵规律示意图",
      labels: ["行规律", "列规律", "对角线", "公共格", "待填数字"],
      note: "分别检查行、列和对角线的关系，公共格必须同时满足多个方向的条件。"
    },
    "reverse-chain": {
      title: "还原问题逆推图",
      labels: ["最后结果", "撤销最后操作", "逐步逆推", "核对顺序", "还原初始量"],
      note: "从最后结果出发，按照相反顺序使用逆运算，一步一步还原到最初状态。"
    }
  };
  const template = templates[kind];
  if (!template) return null;
  const nodes = template.labels.map((label, index) => ({
    id: `n${index + 1}`,
    label,
    type: index < 2 ? "given" : (index === template.labels.length - 1 ? "goal" : "relation")
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index].id,
    to: node.id,
    label: ["对应", "比较", "转化", "推出"][index] || "连接"
  }));
  return {
    title: template.title,
    demoType: "primary-olympiad",
    figure: { kind, labels: numbers },
    nodes,
    edges,
    note: template.note
  };
}

function buildLocalDiagram(messages, answer = "") {
  const text = latestUserText(messages).replace(/\s+/g, " ");
  const problemText = diagramProblemText(messages).replace(/\s+/g, " ");
  const context = `${problemText}\n${answer}`.replace(/\s+/g, " ");
  const problemSource = problemText || text;

  const intervalDiagram = buildIntervalPlacementDiagram(problemSource);
  if (intervalDiagram) return intervalDiagram;

  const primaryOlympiadDiagram = buildPrimaryOlympiadDiagram(problemSource);
  if (primaryOlympiadDiagram) return primaryOlympiadDiagram;

  const explicitShapeDiagram = buildShapeKnowledgeDiagram(text);
  if (explicitShapeDiagram && /知识|概念|学习|学|讲|解释|理解|相关/.test(text)) {
    return explicitShapeDiagram;
  }

  const shapeDiagram = buildShapeKnowledgeDiagram(context);
  if (shapeDiagram && /知识|概念|学习|学|讲|解释|理解|相关/.test(context)) {
    return shapeDiagram;
  }

  if (/长方形|正方形|矩形|周长|面积/.test(context)
    && /长方形|正方形|矩形/.test(context)
    && !/平行四边形|菱形|多边形|四边形|三角形|圆|梯形|切线|弦|半径|直径|相似|全等|证明/.test(context)) {
    return buildRectangleMeasureDiagram(context);
  }

  if (/函数|图像|坐标|自变量|因变量|定义域|值域|单调|奇偶|一次函数|二次函数|反比例函数|指数函数|对数函数|导数|斜率/.test(context)) {
    return {
      title: "函数关系示意图",
      demoType: "function-concept",
      nodes: [
        { id: "n1", label: "输入 x", type: "given" },
        { id: "n2", label: "对应规则 f", type: "relation" },
        { id: "n3", label: "输出 y=f(x)", type: "result" },
        { id: "n4", label: "图像上的点 (x,y)", type: "step" },
        { id: "n5", label: "观察变化趋势", type: "relation" },
        { id: "n6", label: "核对定义域和值域", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "代入规则" },
        { from: "n2", to: "n3", label: "得到对应值" },
        { from: "n3", to: "n4", label: "落到坐标图上" },
        { from: "n4", to: "n5", label: "看整体变化" },
        { from: "n5", to: "n6", label: "回到取值范围" }
      ],
      note: "函数学习要把输入、规则、输出和图像上的点连起来看。"
    };
  }

  if (isGeometryExampleContext(context)) {
    return buildGeometryExampleDiagram(context);
  }

  if (/几何|图形|三角形|四边形|圆|线段|直线|射线|角度|平行|垂直|相似|全等|切线|弦|半径|直径|面积|体积/.test(context)
    && /知识|概念|学习|学|讲|解释|理解|示意|图解|为什么/.test(context)) {
    return {
      title: "几何关系示意图",
      demoType: "geometry-knowledge",
      nodes: [
        { id: "n1", label: "图形对象", type: "given" },
        { id: "n2", label: "点、线、角", type: "given" },
        { id: "n3", label: "明确关系", type: "relation" },
        { id: "n4", label: "可用定理", type: "step" },
        { id: "n5", label: "推出性质或结论", type: "goal" },
        { id: "n6", label: "回图核对标注", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "拆成基本元素" },
        { from: "n2", to: "n3", label: "看相等/平行/垂直" },
        { from: "n3", to: "n4", label: "匹配定理条件" },
        { from: "n4", to: "n5", label: "得到目标关系" },
        { from: "n5", to: "n6", label: "防止读图误差" }
      ],
      note: "几何知识要先看图形由哪些点线角组成，再看关系怎样触发定理。"
    };
  }

  if (/数列|通项|递推|等差|等比|前n项|求和|项数/.test(context)) {
    return {
      title: "数列结构示意图",
      demoType: "sequence-concept",
      nodes: [
        { id: "n1", label: "第 n 项的位置", type: "given" },
        { id: "n2", label: "每一项的值", type: "given" },
        { id: "n3", label: "相邻项关系", type: "relation" },
        { id: "n4", label: "通项或递推式", type: "step" },
        { id: "n5", label: "求指定项/求和", type: "goal" },
        { id: "n6", label: "检查首项和项数", type: "check" }
      ],
      edges: [
        { from: "n1", to: "n2", label: "位置对应数值" },
        { from: "n2", to: "n3", label: "观察变化" },
        { from: "n3", to: "n4", label: "表达规律" },
        { from: "n4", to: "n5", label: "代入目标" },
        { from: "n5", to: "n6", label: "回查边界" }
      ],
      note: "数列学习重点是把位置 n、项的值、变化规律连成一条线。"
    };
  }

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

function diagramMatchesProblem(diagram, messages = []) {
  if (!diagram || !Array.isArray(diagram.nodes) || !diagram.nodes.length) return false;
  const demoType = String(diagram.demoType || "");
  const source = `${diagramProblemText(messages)}\n${latestUserText(messages)}`;
  if (isIntervalPlacementContext(source)) return demoType === "interval-line";
  if (classifyPrimaryOlympiadContext(source)) return demoType === "primary-olympiad";
  if (/^geometry/.test(demoType)) {
    return isGeometryExampleContext(source)
      || /几何|三角形|四边形|梯形|平行四边形|菱形|正方形|长方形|圆|平行|垂直|相似|全等|切线|弦|半径|直径|△|∠|⊙|[A-Z]{2,3}/.test(source);
  }
  return true;
}

function buildDirectShapeDefinitionResult(messages, profile = {}) {
  const answer = shapeDefinitionReply(messages);
  if (!answer) return null;
  const shouldDraw = shouldShowLocalDiagram(messages, profile);
  const topic = extractShapeTopic(latestUserText(messages));
  const diagram = shouldDraw
    ? (buildShapeKnowledgeDiagram(topic || latestUserText(messages)) || buildLocalDiagram(messages, answer))
    : null;
  return {
    answer,
    diagramAction: shouldDraw && diagram ? "show" : "hold",
    diagram,
    modelTier: "local",
    model: "shape-definition-direct"
  };
}

function diagramPromptText(messages, answer, profile = {}) {
  return [
    `回复模式：${profile?.mode || "启发模式"}`,
    "最近对话：",
    historyText(messages, 8),
    "智能体刚生成的回复：",
    String(answer || "").slice(0, 1600)
  ].join("\n\n");
}

function normalizeOpenAIDiagramResult(raw) {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const diagram = normalizeDiagram(parsed.diagram || parsed);
  if (!diagram?.nodes?.length) return null;
  return diagram;
}

async function callOpenAIDiagram(messages, answer, profile = {}) {
  if (!OPENAI_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_DIAGRAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_DIAGRAM_MODEL,
        instructions: [
          "你是数学解题结构图规划器，只输出 JSON，不输出 Markdown。",
          "你的任务不是画原题，而是把当前题目和回复里的关系转成结构图节点和边。",
          "尤其是几何题：不要凭空生成三角形、圆、角标、平行、垂直、相等、切线等原题没有明确给出的图形关系；只把题目或回复中明确出现的点、线、圆、关系放进 figure。",
          "几何题请优先返回 demoType 为 geometry-semantic，并填写 figure：kind 可为 triangle、quadrilateral、trapezoid、circle、rectangle、unknown；labels 是点名；points 可给归一化坐标 0-320/0-240；segments 写线段 from/to；circles 写 center/through；relations 写关系 type、a、b、point、line、label。关系 type 可用 perpendicular、parallel、equal、equalAngle、pointOn、tangent、midpoint、angleBisector。",
          "如果题目图形信息不足，结构图要诚实显示“核对原图标注/补充条件”，不要假装已经知道完整图形。",
          "节点顺序必须贴合学生理解：对象/已知条件 -> 单位或标准 -> 关键关系 -> 解题动作 -> 目标或检查。",
          "返回格式：{\"diagramAction\":\"show\",\"diagram\":{\"title\":\"...\",\"demoType\":\"geometry-semantic\",\"figure\":{\"kind\":\"triangle\",\"labels\":[\"A\",\"B\",\"C\"],\"points\":[{\"id\":\"A\",\"x\":60,\"y\":180}],\"segments\":[{\"from\":\"A\",\"to\":\"B\"}],\"circles\":[{\"center\":\"O\",\"through\":\"A\"}],\"relations\":[{\"type\":\"perpendicular\",\"a\":\"AD\",\"b\":\"BC\",\"label\":\"AD ⟂ BC\"}]},\"nodes\":[{\"id\":\"n1\",\"label\":\"...\",\"type\":\"given|relation|step|goal|check|result\"}],\"edges\":[{\"from\":\"n1\",\"to\":\"n2\",\"label\":\"...\"}],\"note\":\"...\"}}。",
          "节点 4-7 个，边 3-8 条，标签短，不要出现 SDE、三方程、六路径、三原理等术语。"
        ].join("\n"),
        max_output_tokens: 900,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: diagramPromptText(messages, answer, profile) }
            ]
          }
        ]
      }),
      signal: controller.signal
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return normalizeOpenAIDiagramResult(extractOpenAIResponseText(data));
}

function fallbackTeachingReply(messages, profile = {}) {
  const text = latestUserText(messages);
  const allText = historyText(messages, 10);
  const isExplanation = profile?.mode === "讲解模式";
  if (isLearningPlanRequest(messages, profile)) {
    return fallbackLearningPlanReply(messages, profile);
  }
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
  if (isLearningPlanRequest(messages)) {
    return fallbackLearningPlanReply(messages);
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
  // A complete explanation can be long and may finish without a punctuation mark.
  // Do not mistake it for a failed response and replace it with a template.
  if (value.length >= 180) return false;
  if (/[。？！.!?]$/.test(value)) return false;
  if (/[，、：；,;]$/.test(value)) return true;
  if (/(每|把|用|再|先|请|要|可以|应该|因为|所以|那么|如果|这个|那个|第)$/.test(value)) return true;
  return value.length < 30;
}

function trimHeuristicReply(text, messages, profile = {}) {
  const value = String(text || "").trim();
  if (isLearningPlanRequest(messages, profile)) {
    if (!value) return fallbackLearningPlanReply(messages, profile);
    return value.length > 6000 ? `${value.slice(0, 6000)}。` : value;
  }
  if (isKnowledgeAnalogyRequest(messages) || isAnalogySceneChoice(messages)) {
    if (!value) return fallbackKnowledgeAnalogyReply(messages);
    return value.length > 5000 ? `${value.slice(0, 5000)}。` : value;
  }
  if (isDirectUserQuestion(messages)) {
    if (!value) return directQuestionFallback(messages);
    return value.length > 5000 ? `${value.slice(0, 5000)}。` : value;
  }
  if (profile?.mode === "讲解模式") {
    if (!value) return fallbackTeachingReply(messages, profile);
    return value;
  }
  if (!value) return nextHeuristicQuestion(messages);
  const hardRevealPattern = /答案是|最终答案|所以答案|最后答案|直接得到答案|把答案算出来|完整解法如下/;
  const routeRevealPattern = /接下来.*(除以|相除|列方程求出|代入求出|直接求出)|再用.*(除以|相除).*就|这样就知道|即可得到/;
  if (!hardRevealPattern.test(value) && !routeRevealPattern.test(value) && value.length <= 420) return value;
  // Keep a real model response. The prompt governs how much to reveal;
  // replacing it here was the source of unrelated template answers.
  return value;
}

function isLengthCutoff(result) {
  return result?.data?.choices?.[0]?.finish_reason === "length";
}

function buildDeepSeekPayload(messages, profile, config, options = {}) {
  const payload = {
    model: config.model,
    temperature: config.temperature,
    max_tokens: options.maxTokens || config.maxTokens,
    stream: Boolean(options.stream),
    messages: [
      {
        role: "system",
        content: [
          systemPrompt(profile || {}, messages),
          buildRagContext(messages, profile || {}),
          buildImplementationContext(messages, profile || {}),
          modelPromptLine(config),
          learningPlanLine(messages, profile || {}),
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
  return payload;
}

async function requestDeepSeek(messages, profile, config, options = {}) {
  if (!config.apiKey) {
    throw new Error("服务端尚未配置 DEEPSEEK_API_KEY");
  }

  const payload = buildDeepSeekPayload(messages, profile, config, { ...options, stream: false });

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

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function requestDeepSeekStream(messages, profile, config, options = {}) {
  if (!config.apiKey) {
    throw new Error("服务端尚未配置 DEEPSEEK_API_KEY");
  }

  const payload = buildDeepSeekPayload(messages, profile, config, {
    ...options,
    stream: true,
    retryHint: [
      options.retryHint || "",
      "本次使用流式输出。只能输出普通正文文本，不要输出 JSON、Markdown、LaTeX 原码。"
    ].filter(Boolean).join("\n")
  });
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

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || data.message || `DeepSeek API 错误：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let raw = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      const lines = event.split("\n").filter(line => line.startsWith("data:"));
      for (const line of lines) {
        const dataText = line.slice(5).trim();
        if (!dataText || dataText === "[DONE]") continue;
        let data;
        try {
          data = JSON.parse(dataText);
        } catch {
          continue;
        }
        const delta = data.choices?.[0]?.delta || {};
        const piece = delta.content || delta.text || "";
        if (piece) {
          raw += piece;
          options.onToken?.(piece);
        }
      }
    }
  }
  const tail = decoder.decode();
  if (tail) raw += "";
  return { raw, config, data: { streamed: true } };
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
  const directShapeResult = buildDirectShapeDefinitionResult(messages, profile);
  if (directShapeResult) return directShapeResult;

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
    const preferLocal = showDiagram && shouldPreferLocalDiagram(messages, profile);
    const localDiagram = showDiagram ? buildLocalDiagram(messages, raw) : null;
    const aiDiagramCandidate = showDiagram && !preferLocal ? await callOpenAIDiagram(messages, raw, profile) : null;
    const aiDiagram = diagramMatchesProblem(aiDiagramCandidate, messages) ? aiDiagramCandidate : null;
    return {
      answer: raw,
      diagramAction: showDiagram ? "show" : "hold",
      diagram: showDiagram ? (preferLocal ? localDiagram : (aiDiagram || localDiagram)) : null,
      modelTier: usedConfig.tier,
      model: usedConfig.model
    };
  }
  const shouldForceDiagram = shouldShowLocalDiagram(messages, profile);
  const action = ["hold", "show", "update"].includes(parsed.diagramAction) ? parsed.diagramAction : "hold";
  const normalizedCandidate = action === "hold" ? null : normalizeDiagram(parsed.diagram);
  const normalizedDiagram = diagramMatchesProblem(normalizedCandidate, messages) ? normalizedCandidate : null;
  const finalAction = shouldForceDiagram ? (action === "hold" ? "show" : action) : "hold";
  const answer = String(parsed.answer || raw).trim();
  const preferLocal = finalAction !== "hold" && shouldPreferLocalDiagram(messages, profile);
  const localDiagram = finalAction === "hold" ? null : buildLocalDiagram(messages, answer);
  const aiDiagramCandidate = finalAction === "hold" || preferLocal ? null : await callOpenAIDiagram(messages, answer, profile);
  const aiDiagram = diagramMatchesProblem(aiDiagramCandidate, messages) ? aiDiagramCandidate : null;
  return {
    answer,
    diagramAction: finalAction,
    diagram: preferLocal ? localDiagram : (aiDiagram || (normalizedDiagram?.nodes?.length ? normalizedDiagram : localDiagram)),
    modelTier: usedConfig.tier,
    model: usedConfig.model
  };
}

function visionProviderConfig(provider) {
  if (provider === "qwen") {
    return {
      provider,
      apiKey: QWEN_API_KEY,
      baseUrl: QWEN_BASE_URL,
      model: QWEN_VISION_MODEL,
      temperature: 0,
      timeoutMs: QWEN_VISION_TIMEOUT_MS,
      useBareBase64: false,
      endpoint: "chat"
    };
  }
  if (provider === "openai") {
    return {
      provider,
      apiKey: OPENAI_API_KEY,
      baseUrl: OPENAI_BASE_URL,
      model: OPENAI_VISION_MODEL,
      temperature: null,
      timeoutMs: OPENAI_VISION_TIMEOUT_MS,
      useBareBase64: false,
      endpoint: "responses"
    };
  }
  if (provider === "kimi") {
    return {
      provider,
      apiKey: KIMI_API_KEY || (VISION_PROVIDER === "kimi" ? VISION_API_KEY : ""),
      baseUrl: KIMI_BASE_URL,
      model: KIMI_VISION_MODEL,
      temperature: 1,
      timeoutMs: KIMI_VISION_TIMEOUT_MS,
      useBareBase64: false,
      endpoint: "chat"
    };
  }
  return {
    provider: "zhipu",
    apiKey: ZHIPU_VISION_API_KEY,
    baseUrl: VISION_BASE_URL,
    model: VISION_MODEL,
    temperature: 0,
    timeoutMs: VISION_TIMEOUT_MS,
    useBareBase64: true,
    endpoint: "chat"
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

function extractOpenAIResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.value === "string") parts.push(content.value);
    }
  }
  return parts.join("").trim();
}

function visionProviderName(provider) {
  if (provider === "qwen") return "Qwen 3.7-plus";
  if (provider === "openai") return "OpenAI";
  if (provider === "kimi") return "Kimi";
  return "智谱";
}

function buildVisionPrompt(hintPrompt) {
  return [
    "请完整识别这张数学题图片。如果是几何题，先读文字，再逐项描述图形：有哪些点和图形，哪些关系是明确标注的，哪些地方看不清。不要补充图片中没有标注的条件。",
    hintPrompt
  ].filter(Boolean).join("\n");
}

function buildVisionSystemPrompt() {
  return [
    "你是数学题目图片识别助手，尤其要谨慎处理几何图。",
    "只负责识别和转写，不要解题，不要推理答案。",
    "必须区分“看见的图形标注”和“你推测的关系”。禁止把未标注的垂直、平行、相等、角平分、中点、圆心、切线、全等、相似等关系当成已知。",
    "如果图中某个点名、角标、线段标注、数字或符号看不清，写“看不清/不确定”，不要猜。",
    "几何题必须按固定格式输出：题目文字；图形对象；图中明确标注的关系；需要求证/求解；不确定信息。",
    "图形对象要尽量列出点、线段、射线、直线、圆、三角形、四边形及它们的连接关系。",
    "明确标注的关系包括：平行、垂直、相等、角度、长度、切点、中点、圆心、共线、共圆、交点等。只写图中能看见的。",
    "公式尽量转成学生可读的普通文本，例如 x >= -1、(a-2)/4，不要输出复杂 LaTeX 原码。"
  ].join("\n");
}

function chatCompletionsUrl(baseUrl) {
  const value = String(baseUrl || "").replace(/\/$/, "");
  return /\/chat\/completions$/.test(value) ? value : `${value}/chat/completions`;
}

function normalizeVisionImage(image, config) {
  let value = String(image || "");
  if (config.preferJpgMime) {
    value = value.replace(/^data:image\/jpeg;base64,/i, "data:image/jpg;base64,");
  }
  if (config.useBareBase64) {
    return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  }
  return value;
}

async function callVisionWithProvider(image, provider, hint = "") {
  const config = visionProviderConfig(provider);
  if (!config.apiKey) {
    throw new Error(provider === "qwen"
      ? "还没有配置 QWEN_API_KEY 或 DASHSCOPE_API_KEY。请在 Render 环境变量里填写阿里云百炼/千问的 API Key。"
      : provider === "openai"
        ? "还没有配置 OPENAI_API_KEY"
        : provider === "kimi"
          ? "还没有配置 KIMI_API_KEY"
          : "还没有配置 ZHIPU_API_KEY 或 VISION_API_KEY");
  }

  const imageForProvider = normalizeVisionImage(image, config);
  const cleanHint = String(hint || "").trim().slice(0, 800);
  const hintPrompt = cleanHint
    ? `用户补充说明：${cleanHint}\n请结合补充说明识别图片。如果用户指定“只做第3小问/只证明某一步”，仍要识别相关题干和指定小问；如果用户同时输入了题目文字，以用户补充说明作为优先参考，用图片核对图形和条件。`
    : "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  let responseData = null;
  try {
    if (config.endpoint === "responses") {
      response = await fetch(`${config.baseUrl}/responses`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(config.omitModel ? {} : { model: config.requestModel || config.model }),
          instructions: buildVisionSystemPrompt(),
          max_output_tokens: VISION_MAX_TOKENS,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: buildVisionPrompt(hintPrompt) },
                { type: "input_image", image_url: imageForProvider }
              ]
            }
          ]
        }),
        signal: controller.signal
      });
    } else {
      const promptText = buildVisionPrompt(hintPrompt);
      const messageVariants = [
        [
          { role: "system", content: buildVisionSystemPrompt() },
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: imageForProvider } }
            ]
          }
        ]
      ];

      for (let i = 0; i < messageVariants.length; i += 1) {
        response = await fetch(chatCompletionsUrl(config.baseUrl), {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...(config.omitModel ? {} : { model: config.requestModel || config.model }),
            temperature: config.temperature,
            max_tokens: VISION_MAX_TOKENS,
            messages: messageVariants[i]
          }),
          signal: controller.signal
        });
        responseData = await response.json().catch(() => ({}));
        const apiMessage = responseData.error?.message || responseData.message || "";
        if (response.ok || i === messageVariants.length - 1) {
          break;
        }
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`${visionProviderName(provider)}图片识别超过 ${Math.round(config.timeoutMs / 1000)} 秒。请裁剪题图，只保留题干和图形；也可以在输入框补充题目文字后重试。`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = responseData || await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data.error?.message || data.message || `图片识别 API 错误：${response.status}`;
    throw new Error(apiMessage);
  }
  const text = config.endpoint === "responses" ? extractOpenAIResponseText(data) : extractVisionText(data);
  if (!text) throw new Error(`${visionProviderName(provider)}图片识别结果为空`);
  return text;
}

async function callVision(image, hint = "") {
  const fallbackProviders = VISION_PROVIDER === "qwen"
    ? ["qwen", ...(OPENAI_API_KEY ? ["openai"] : [])]
    : VISION_PROVIDER === "openai"
      ? ["openai"]
      : ["qwen", ...(OPENAI_API_KEY ? ["openai"] : [])];
  const providers = VISION_FALLBACK_ENABLED ? fallbackProviders : [VISION_PROVIDER];
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
    throw new Error("图片识别结果为空。请换一张更清晰的图片，或补充输入题目文字；如果使用千问，请检查 QWEN_API_KEY、QWEN_VISION_MODEL 和账号权限。");
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

async function handleInviteLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const inviteCode = normalizeInviteCode(body.inviteCode);
    if (!inviteCode) {
      sendJson(res, 400, { error: "请输入邀请码" });
      return;
    }

    const users = readUsers();
    let user = userByInviteCode(users, inviteCode);
    if (!user) {
      const inviteAccess = findInviteAccess(users, inviteCode);
      if (inviteAccess.error) {
        sendJson(res, inviteAccess.error.includes("已经被使用") ? 409 : 403, { error: inviteAccess.error });
        return;
      }
      const invitePlan = inviteAccess.plan;
      const suffix = inviteCode.replace(/[^A-Z0-9]/g, "").slice(-4) || crypto.randomBytes(2).toString("hex").toUpperCase();
      const passwordData = hashPassword(crypto.randomBytes(18).toString("hex"));
      user = {
        id: crypto.randomUUID(),
        name: `体验用户${suffix}`,
        email: `invite-${suffix.toLowerCase()}-${Date.now()}@local.math-agent`,
        salt: passwordData.salt,
        passwordHash: passwordData.hash,
        inviteCode,
        authMode: "invite",
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
    }

    const token = createSession(user);
    sendJson(
      res,
      200,
      { token, user: publicUser(user), limit: DAILY_LIMIT, remaining: remainingFor(req, `user:${user.id}`) },
      { "Set-Cookie": authCookie(token) }
    );
  } catch (error) {
    sendJson(res, 500, { error: error.message || "邀请码登录失败" });
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

async function handleGrowthProfile(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return;
  }
  const profile = readGrowthProfiles().find(item => item.userId === user.id) || null;
  sendJson(res, 200, {
    profile: publicGrowthProfile(profile),
    implementation: getImplementationStatus()
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
    recordImplementationTurn(
      user,
      profile,
      body.displayText || latestUserMessage.displayContent || latestUserMessage.content,
      result.answer,
      conversation.id
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

async function handleChatStream(req, res) {
  let headersSent = false;
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

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    headersSent = true;
    writeSse(res, "start", { ok: true });

    const directShapeResult = buildDirectShapeDefinitionResult(messages, profile);
    if (directShapeResult) {
      for (const part of directShapeResult.answer.match(/.{1,24}/gs) || [directShapeResult.answer]) {
        writeSse(res, "token", { token: part });
      }
      const conversation = saveConversationMessages(
        user,
        String(body.conversationId || ""),
        {
          content: latestUserMessage.content,
          displayContent: body.displayText || latestUserMessage.displayContent || latestUserMessage.content
        },
        {
          content: directShapeResult.answer,
          diagramAction: directShapeResult.diagramAction,
          diagram: directShapeResult.diagram
        }
      );
      recordImplementationTurn(
        user,
        profile,
        body.displayText || latestUserMessage.displayContent || latestUserMessage.content,
        directShapeResult.answer,
        conversation.id
      );
      writeSse(res, "final", {
        answer: directShapeResult.answer,
        diagramAction: directShapeResult.diagramAction,
        diagram: directShapeResult.diagram,
        conversation: publicConversation(conversation),
        modelTier: directShapeResult.modelTier,
        model: directShapeResult.model,
        limit: DAILY_LIMIT,
        remaining: remainingFor(req, identity),
        user: publicUser(user)
      });
      res.end();
      return;
    }

    const primaryConfig = deepSeekConfig(messages, profile);
    let streamResult;
    try {
      streamResult = await requestDeepSeekStream(messages, profile, primaryConfig, {
        onToken: token => writeSse(res, "token", { token })
      });
    } catch (error) {
      const fallback = trimHeuristicReply(fallbackTeachingReply(messages, profile), messages, profile);
      for (const part of fallback.match(/.{1,18}/gs) || [fallback]) {
        writeSse(res, "token", { token: part });
      }
      streamResult = {
        raw: fallback,
        config: primaryConfig,
        data: { fallback: true, reason: error.message || "stream failed" }
      };
    }

    let answer = trimHeuristicReply(streamResult.raw, messages, profile);
    const shouldForceDiagram = shouldShowLocalDiagram(messages, profile);
    let diagramAction = shouldForceDiagram ? "show" : "hold";
    let diagram = null;
    const parsed = extractJsonObject(answer);
    if (parsed && typeof parsed === "object") {
      answer = String(parsed.answer || answer).trim();
      const action = ["hold", "show", "update"].includes(parsed.diagramAction) ? parsed.diagramAction : "hold";
      diagramAction = shouldForceDiagram ? (action === "hold" ? "show" : action) : "hold";
      const normalizedCandidate = action === "hold" ? null : normalizeDiagram(parsed.diagram);
      const normalizedDiagram = diagramMatchesProblem(normalizedCandidate, messages) ? normalizedCandidate : null;
      if (normalizedDiagram?.nodes?.length) diagram = normalizedDiagram;
    }
    if (diagramAction !== "hold" && shouldPreferLocalDiagram(messages, profile)) {
      diagram = buildLocalDiagram(messages, answer);
    }
    if (diagramAction !== "hold" && !diagram) {
      const preferLocal = shouldPreferLocalDiagram(messages, profile);
      const localDiagram = buildLocalDiagram(messages, answer);
      const aiDiagramCandidate = preferLocal ? null : await callOpenAIDiagram(messages, answer, profile).catch(() => null);
      const aiDiagram = diagramMatchesProblem(aiDiagramCandidate, messages) ? aiDiagramCandidate : null;
      diagram = preferLocal ? localDiagram : (aiDiagram || localDiagram);
    }

    const conversation = saveConversationMessages(
      user,
      String(body.conversationId || ""),
      {
        content: latestUserMessage.content,
        displayContent: body.displayText || latestUserMessage.displayContent || latestUserMessage.content
      },
      {
        content: answer,
        diagramAction,
        diagram
      }
    );
    recordImplementationTurn(
      user,
      profile,
      body.displayText || latestUserMessage.displayContent || latestUserMessage.content,
      answer,
      conversation.id
    );

    writeSse(res, "final", {
      answer,
      diagramAction,
      diagram,
      conversation: publicConversation(conversation),
      modelTier: streamResult.config?.tier,
      model: streamResult.config?.model,
      limit: DAILY_LIMIT,
      remaining: remainingFor(req, identity),
      user: publicUser(user)
    });
    res.end();
  } catch (error) {
    if (headersSent) {
      writeSse(res, "error", { error: error.message || "服务异常", limit: DAILY_LIMIT });
      res.end();
    } else {
      sendJson(res, 500, {
        error: error.message || "服务异常",
        limit: DAILY_LIMIT
      });
    }
  }
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity || "").toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : match;
  });
}

function htmlToReadableText(html) {
  const withoutActiveContent = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|main|aside|h[1-6]|li|tr|table)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutActiveContent);
}

function cleanExtractedText(value, maxChars = UPLOAD_MAX_TEXT_CHARS) {
  const normalized = String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ \u00a0]+\n/g, "\n")
    .replace(/\n[ \u00a0]+/g, "\n")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  return {
    text: normalized.slice(0, maxChars),
    truncated: normalized.length > maxChars,
    originalChars: normalized.length
  };
}

function uploadError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeUploadName(value) {
  return path.basename(String(value || "").replace(/\\/g, "/")).slice(0, 180);
}

function decodeUploadDataUrl(value) {
  const match = /^data:([^;,]*);base64,([a-z0-9+/=\r\n]+)$/i.exec(String(value || ""));
  if (!match) throw uploadError("文件数据无效，请重新选择文件。");
  const base64 = match[2].replace(/\s+/g, "");
  const estimatedBytes = Math.floor(base64.length * 0.75);
  if (estimatedBytes > UPLOAD_MAX_BYTES) {
    throw uploadError("文件太大了，请上传 8MB 以内的文件。");
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw uploadError("文件内容为空，请重新选择文件。");
  if (buffer.length > UPLOAD_MAX_BYTES) {
    throw uploadError("文件太大了，请上传 8MB 以内的文件。");
  }
  return { buffer, mimeType: match[1] || "application/octet-stream" };
}

function readableExtension(fileName) {
  return path.extname(String(fileName || "")).toLowerCase();
}

function parseDocumentInWorker(kind, buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(ROOT, "file-parser-worker.js"), {
      workerData: { kind, buffer, maxPages: PDF_MAX_PAGES },
      stdout: true,
      stderr: true
    });
    worker.stdout?.resume();
    worker.stderr?.resume();
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => {});
      reject(uploadError(`文档读取超过 ${Math.round(FILE_PARSE_TIMEOUT_MS / 1000)} 秒，请拆分文件或只保留需要阅读的页面。`, 408));
    }, FILE_PARSE_TIMEOUT_MS);
    worker.once("message", finish(message => {
      worker.terminate().catch(() => {});
      if (message?.error) reject(uploadError(message.error));
      else resolve(message || {});
    }));
    worker.once("error", finish(error => reject(error)));
    worker.once("exit", code => {
      if (!settled && code !== 0) finish(reject)(uploadError("文档解析进程异常退出，请换一个文件重试。"));
    });
  });
}

async function extractReadableFile(buffer, fileName, options = {}) {
  const extension = readableExtension(fileName);
  if (!READABLE_FILE_EXTENSIONS.has(extension)) {
    if (extension === ".doc") {
      throw uploadError("暂不支持旧版 .doc 文件，请在 Word 中另存为 .docx 后上传。");
    }
    throw uploadError("暂不支持这种文件。可以上传 PDF、Word（.docx）、Markdown、HTML、TXT 或 ZIP。");
  }

  let rawText = "";
  const warnings = [];
  if ([".md", ".markdown", ".txt"].includes(extension)) {
    rawText = buffer.toString("utf8");
  } else if ([".html", ".htm"].includes(extension)) {
    rawText = htmlToReadableText(buffer.toString("utf8"));
  } else if (extension === ".docx") {
    const result = await parseDocumentInWorker("docx", buffer);
    rawText = result.text || "";
    if (result.warningCount) {
      warnings.push("Word 中少量复杂排版、公式或浮动文本框可能未被完整提取。");
    }
  } else if (extension === ".pdf") {
    const result = await parseDocumentInWorker("pdf", buffer);
    rawText = result.text || "";
    if (!rawText.trim()) {
      throw uploadError("这个 PDF 可能是扫描版，未读取到文字。请把相关页面截图后按图片上传。");
    }
    if (result.totalPages > result.renderedPages && result.renderedPages > 0) {
      warnings.push(`PDF 共 ${result.totalPages} 页，本次先读取前 ${result.renderedPages} 页。可拆分后继续上传其余部分。`);
    }
  } else if (extension === ".zip") {
    if (options.inZip) throw uploadError("ZIP 中的嵌套压缩包不会继续展开。");
    return extractReadableZip(buffer, fileName);
  }

  const cleaned = cleanExtractedText(rawText);
  if (!cleaned.text) throw uploadError(`没有从 ${safeUploadName(fileName)} 中读取到可用文字。`);
  if (cleaned.truncated) warnings.push(`文档较长，本次先读取前 ${UPLOAD_MAX_TEXT_CHARS} 个字符。`);
  return {
    text: cleaned.text,
    fileType: extension.slice(1).toUpperCase(),
    warnings,
    truncated: cleaned.truncated,
    originalChars: cleaned.originalChars
  };
}

async function extractReadableZip(buffer, fileName) {
  let entries;
  try {
    entries = new AdmZip(buffer).getEntries();
  } catch {
    throw uploadError("ZIP 压缩包已损坏或无法读取。");
  }
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw uploadError(`ZIP 内文件过多，最多支持 ${ZIP_MAX_ENTRIES} 个文件。`);
  }

  let totalUncompressed = 0;
  let actualUncompressed = 0;
  let combined = "";
  const warnings = [];
  let readCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryName = String(entry.entryName || "").replace(/\\/g, "/");
    const normalized = path.posix.normalize(entryName);
    if (!normalized || normalized.startsWith("../") || normalized.startsWith("/") || normalized.includes("/../")) {
      warnings.push(`已跳过不安全路径：${entryName.slice(0, 80)}`);
      continue;
    }
    const extension = readableExtension(normalized);
    if (!READABLE_FILE_EXTENSIONS.has(extension) || extension === ".zip") continue;
    if (readCount >= ZIP_MAX_READABLE_FILES) {
      warnings.push(`压缩包内可读取文件较多，本次先读取前 ${ZIP_MAX_READABLE_FILES} 个。`);
      break;
    }
    const declaredSize = Number(entry.header?.size || 0);
    if (declaredSize > ZIP_MAX_ENTRY_BYTES) {
      warnings.push(`已跳过过大的文件：${normalized.slice(0, 80)}`);
      continue;
    }
    totalUncompressed += declaredSize;
    if (totalUncompressed > ZIP_MAX_UNCOMPRESSED_BYTES) {
      throw uploadError("ZIP 解压后的内容过大，请只保留需要阅读的文件后重新压缩。");
    }

    try {
      const entryBuffer = entry.getData();
      if (entryBuffer.length > ZIP_MAX_ENTRY_BYTES) {
        warnings.push(`已跳过过大的文件：${normalized.slice(0, 80)}`);
        continue;
      }
      actualUncompressed += entryBuffer.length;
      if (actualUncompressed > ZIP_MAX_UNCOMPRESSED_BYTES) {
        throw uploadError("ZIP 解压后的内容过大，请只保留需要阅读的文件后重新压缩。");
      }
      const extracted = await extractReadableFile(entryBuffer, normalized, { inZip: true });
      const remaining = UPLOAD_MAX_TEXT_CHARS - combined.length;
      if (remaining <= 0) break;
      const section = `\n\n【${normalized}】\n${extracted.text}`;
      combined += section.slice(0, remaining);
      warnings.push(...(extracted.warnings || []));
      readCount += 1;
    } catch (error) {
      warnings.push(`未能读取 ${normalized.slice(0, 80)}：${error.message}`);
    }
  }

  const cleaned = cleanExtractedText(combined);
  if (!cleaned.text || !readCount) {
    throw uploadError("ZIP 中没有可读取的 PDF、DOCX、Markdown、HTML 或 TXT 文件。");
  }
  if (combined.length >= UPLOAD_MAX_TEXT_CHARS) {
    warnings.push(`压缩包内容较长，本次先读取前 ${UPLOAD_MAX_TEXT_CHARS} 个字符。`);
  }
  return {
    text: cleaned.text,
    fileType: "ZIP",
    warnings: Array.from(new Set(warnings)).slice(0, 8),
    truncated: combined.length >= UPLOAD_MAX_TEXT_CHARS,
    originalChars: cleaned.originalChars,
    readCount
  };
}

async function handleFileRead(req, res) {
  try {
    const user = getUserFromRequest(req);
    if (!user) {
      sendJson(res, 401, { error: "请先登录后再上传文件" });
      return;
    }
    if (!isTrialActive(user)) {
      sendJson(res, 403, { error: "试用期已经结束。请联系老师或管理员获取新的试用资格。" });
      return;
    }
    const body = JSON.parse(await readBody(req, 12 * 1024 * 1024) || "{}");
    const fileName = safeUploadName(body.fileName);
    if (!fileName) {
      sendJson(res, 400, { error: "缺少文件名，请重新选择文件。" });
      return;
    }
    const { buffer } = decodeUploadDataUrl(body.data);
    const result = await extractReadableFile(buffer, fileName);
    sendJson(res, 200, {
      fileName,
      fileType: result.fileType,
      text: result.text,
      chars: result.text.length,
      truncated: Boolean(result.truncated),
      readCount: result.readCount || 1,
      warnings: result.warnings || []
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "文件读取失败" });
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
  if (req.method === "GET" && url.pathname === "/version") {
    const ragStatus = getRagStatus();
    const implementationStatus = getImplementationStatus();
    sendJson(res, 200, {
      version: APP_VERSION,
      chatLimitPerDay: DAILY_LIMIT,
      deployedAt: "2026-07-24",
      ragEnabled: ragStatus.enabled,
      ragVersion: ragStatus.version,
      ragCardCount: ragStatus.cardCount,
      ragError: ragStatus.error,
      implementationEnabled: implementationStatus.enabled,
      implementationVersion: implementationStatus.version,
      implementationError: implementationStatus.error,
      visionProvider: VISION_PROVIDER,
      rawVisionProvider: RAW_VISION_PROVIDER,
      visionFallbackEnabled: VISION_FALLBACK_ENABLED,
      qwenConfigured: Boolean(QWEN_API_KEY),
      qwenVisionModel: QWEN_VISION_MODEL,
      qwenBaseUrl: QWEN_BASE_URL,
      openaiConfigured: Boolean(OPENAI_API_KEY),
      openaiVisionModel: OPENAI_VISION_MODEL,
      openaiDiagramModel: OPENAI_DIAGRAM_MODEL
    });
    return;
  }
  if (req.method === "POST" && req.url === "/api/register") {
    handleRegister(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/login") {
    handleLogin(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/invite-login") {
    handleInviteLogin(req, res);
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
  if (req.method === "GET" && url.pathname === "/api/growth-profile") {
    handleGrowthProfile(req, res);
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
  if (req.method === "POST" && req.url === "/api/chat-stream") {
    handleChatStream(req, res);
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
  if (req.method === "POST" && req.url === "/api/files/read") {
    handleFileRead(req, res);
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
  const ragStatus = getRagStatus();
  const implementationStatus = getImplementationStatus();
  console.log(`Math Agent is running on http://localhost:${PORT}`);
  console.log(`Daily chat limit: ${DAILY_LIMIT}`);
  console.log(`SDE RAG: ${ragStatus.enabled ? `${ragStatus.cardCount} cards (${ragStatus.version})` : `disabled - ${ragStatus.error}`}`);
  console.log(`Learning implementation: ${implementationStatus.enabled ? `v${implementationStatus.version}` : `disabled - ${implementationStatus.error}`}`);
});
