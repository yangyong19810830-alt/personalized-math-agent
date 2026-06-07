const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DAILY_LIMIT = Number(process.env.CHAT_LIMIT_PER_DAY || 20);
const quota = new Map();
const sessions = new Map();
const DATA_DIR = path.join(ROOT, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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
    email: user.email
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("请求内容太大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
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

async function handleQuota(req, res) {
  const user = getUserFromRequest(req);
  const identity = user ? `user:${user.id}` : `ip:${clientIp(req)}`;
  sendJson(res, 200, {
    limit: DAILY_LIMIT,
    remaining: remainingFor(req, identity),
    user: user ? publicUser(user) : null
  });
}

async function handleRegister(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!name || !email || !password) {
      sendJson(res, 400, { error: "请填写昵称、邮箱和密码" });
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

    const passwordData = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      salt: passwordData.salt,
      passwordHash: passwordData.hash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);

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
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res);
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
