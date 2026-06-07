const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DAILY_LIMIT = Number(process.env.CHAT_LIMIT_PER_DAY || 20);
const quota = new Map();

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

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function quotaKey(req, guestId) {
  return `${today()}:${clientIp(req)}:${guestId || "anonymous"}`;
}

function remainingFor(req, guestId) {
  const key = quotaKey(req, guestId);
  const used = quota.get(key) || 0;
  return Math.max(0, DAILY_LIMIT - used);
}

function consumeQuota(req, guestId) {
  const key = quotaKey(req, guestId);
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
    `学生阶段：${profile.stage || "小学"}。`,
    `学习目标：${profile.goal || "补齐薄弱知识"}。`,
    `当前状态：${profile.state || "局部会做但不稳定"}。`,
    "输出要求：中文；短而有行动感；每次最多给 3-5 个步骤；适合学生和家长试用。"
  ].join("\n");
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

  const answer = (data.choices?.[0]?.message?.content || "").trim();
  if (!answer) {
    throw new Error("模型返回为空，请检查模型名或账号权限");
  }
  return answer;
}

async function handleQuota(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const guestId = url.searchParams.get("guestId") || "";
  sendJson(res, 200, {
    limit: DAILY_LIMIT,
    remaining: remainingFor(req, guestId)
  });
}

async function handleChat(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const guestId = String(body.guestId || "");
    const profile = body.profile || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!messages.length) {
      sendJson(res, 400, { error: "缺少对话内容" });
      return;
    }

    if (!consumeQuota(req, guestId)) {
      sendJson(res, 429, {
        error: `今天的 ${DAILY_LIMIT} 次试用次数已经用完，明天可以继续。`,
        limit: DAILY_LIMIT,
        remaining: 0
      });
      return;
    }

    const answer = await callDeepSeek(messages, profile);
    sendJson(res, 200, {
      answer,
      limit: DAILY_LIMIT,
      remaining: remainingFor(req, guestId)
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "服务异常",
      limit: DAILY_LIMIT
    });
  }
}

const server = http.createServer((req, res) => {
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
