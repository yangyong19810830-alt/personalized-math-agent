const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const VISION_API_KEY = process.env.VISION_API_KEY || "";
const VISION_PROVIDER = (process.env.VISION_PROVIDER || "zhipu").toLowerCase();
const VISION_BASE_URL = (process.env.VISION_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
const VISION_MODEL = process.env.VISION_MODEL || "glm-4v-plus-0111";
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

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf8");
  if (!fs.existsSync(INVITES_FILE)) fs.writeFileSync(INVITES_FILE, "[]", "utf8");
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

function findInviteAccess(users, code) {
  const normalized = normalizeInviteCode(code);
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

async function callDeepSeek(messages, profile) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("服务端尚未配置 DEEPSEEK_API_KEY");
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    temperature: 0.4,
    max_tokens: 1200,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt(profile || {}) },
      ...messages.slice(-10)
    ]
  };

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `DeepSeek API 错误：${response.status}`);
  }

  const raw = (data.choices?.[0]?.message?.content || "").trim();
  if (!raw) {
    throw new Error("模型返回为空，请检查模型名或账号权限");
  }
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return {
      answer: raw,
      diagramAction: "hold",
      diagram: null
    };
  }
  const action = ["hold", "show", "update"].includes(parsed.diagramAction) ? parsed.diagramAction : "hold";
  return {
    answer: String(parsed.answer || raw).trim(),
    diagramAction: action,
    diagram: action === "hold" ? null : normalizeDiagram(parsed.diagram)
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
    const label = type === "one_month" ? "1 个月试用" : "1 天试用";
    const invites = readInvites();
    const existing = new Set([
      ...invites.map(invite => normalizeInviteCode(invite.code)),
      ...ONE_DAY_INVITE_CODES,
      ...ONE_MONTH_INVITE_CODES
    ]);
    const created = [];

    for (let index = 0; index < count; index += 1) {
      const code = randomInviteCode(existing);
      existing.add(code);
      const invite = {
        code,
        type,
        label,
        createdAt: new Date().toISOString(),
        usedBy: null,
        usedEmail: null,
        usedAt: null
      };
      invites.push(invite);
      created.push(code);
    }

    writeInvites(invites);
    sendJson(res, 200, { codes: created, stats: inviteStats(invites) });
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

    if (!messages.length) {
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
    sendJson(res, 200, {
      answer: result.answer,
      diagramAction: result.diagramAction,
      diagram: result.diagram,
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

const server = http.createServer((req, res) => {
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
