const fs = require("fs");
const path = require("path");

const RAG_VERSION = "v0.2";
const RAG_DIR = path.join(__dirname, "rag");
const CARDS_FILE = path.join(RAG_DIR, "cards.jsonl");
const ROUTES_FILE = path.join(RAG_DIR, "retrieval-routes.json");
const TAXONOMY_FILE = path.join(RAG_DIR, "tag-taxonomy.json");

const FOUNDATION_CARD_IDS = [
  "math_sde_001",
  "math_sde_002",
  "math_sde_003",
  "math_sde_004",
  "math_sde_034",
  "math_sde_035"
];

const STAGE_ALIASES = {
  小学: ["小学低段", "小学中段", "小学高段", "小升初"],
  初中: ["初中", "中考"],
  高中: ["高中", "高考"],
  大学: ["高中", "大学"]
};

const GENERIC_DIRECT_TERMS = new Set([
  "对象", "单位", "标准", "关系", "结构", "变化", "路径", "验证", "迁移",
  "方法", "问题", "数学", "理解", "公式", "证明", "计算", "讲解", "应用题",
  "图形", "条件", "目标", "为什么", "怎么做"
].map(compact));

const state = {
  loaded: false,
  loadedAt: "",
  error: "",
  cards: [],
  routes: {},
  taxonomy: {},
  byId: new Map()
};

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function list(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

function textTokens(value) {
  const normalized = normalize(value);
  const tokens = new Set(
    normalized
      .split(" ")
      .map(token => token.trim())
      .filter(token => token.length >= 2)
  );
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  for (const run of chineseRuns) {
    const maxGram = Math.min(4, run.length);
    for (let size = 2; size <= maxGram; size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        tokens.add(run.slice(index, index + size));
      }
    }
  }
  return [...tokens];
}

function loadJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function searchableCard(card) {
  const fields = [
    card.title,
    card.board,
    card.category,
    ...list(card.grade_level),
    ...list(card.math_domain),
    ...list(card.core_object),
    card.core_unit,
    ...list(card.core_relation),
    card.structural_model,
    card.origin_problem,
    card.knowledge_growth,
    ...list(card.common_mistakes),
    ...list(card.teaching_path),
    ...list(card.retrieval_keywords)
  ];
  const searchText = fields.join(" ");
  return {
    ...card,
    _searchText: normalize(searchText),
    _searchCompact: compact(searchText),
    _titleCompact: compact(card.title),
    _keywords: list(card.retrieval_keywords).map(compact).filter(Boolean),
    _grades: list(card.grade_level).map(compact),
    _domains: list(card.math_domain).map(compact),
    _boardCompact: compact(card.board),
    _tokens: new Set(textTokens(searchText))
  };
}

function loadRagKnowledgeBase() {
  try {
    const raw = fs.readFileSync(CARDS_FILE, "utf8");
    const cards = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return searchableCard(JSON.parse(line));
        } catch (error) {
          throw new Error(`cards.jsonl 第 ${index + 1} 行无法解析：${error.message}`);
        }
      });
    state.cards = cards;
    state.byId = new Map(cards.map(card => [card.id, card]));
    state.routes = loadJson(ROUTES_FILE, {});
    state.taxonomy = loadJson(TAXONOMY_FILE, {});
    state.loaded = cards.length > 0;
    state.loadedAt = new Date().toISOString();
    state.error = "";
  } catch (error) {
    state.cards = [];
    state.byId = new Map();
    state.loaded = false;
    state.loadedAt = "";
    state.error = error.message || "RAG 知识库加载失败";
  }
  return getRagStatus();
}

function userQuery(messages = [], profile = {}) {
  const userTurns = messages
    .filter(message => message?.role === "user")
    .slice(-4)
    .map(message => {
      if (Array.isArray(message.content)) {
        return message.content
          .map(item => typeof item === "string" ? item : item?.text || item?.content || "")
          .join(" ");
      }
      return String(message?.content || "");
    });
  return [
    ...userTurns,
    profile.stage,
    profile.goal,
    profile.state,
    profile.intent,
    profile.mode
  ].filter(Boolean).join(" ");
}

function stageScore(card, stage) {
  const normalizedStage = compact(stage);
  if (!normalizedStage) return 0;
  const aliases = STAGE_ALIASES[stage] || [stage];
  if (aliases.some(alias => card._grades.some(grade => grade.includes(compact(alias))))) return 2;
  if (card._boardCompact.includes(normalizedStage)) return 1;
  return 0;
}

function routeScore(card, queryCompact) {
  let score = 0;
  const routeBoards = state.routes?.boards || {};
  for (const [board, route] of Object.entries(routeBoards)) {
    const boardCompact = compact(board);
    const domains = list(route?.math_domain).map(compact);
    if (!queryCompact.includes(boardCompact) && !domains.some(domain => queryCompact.includes(domain))) continue;
    if (card._boardCompact === boardCompact) score += 9;
    if (card._domains.some(domain => domains.includes(domain))) score += 6;
  }
  const specialRoutes = state.routes?.special_routes || {};
  for (const [routeName, routeTerms] of Object.entries(specialRoutes)) {
    if (!queryCompact.includes(compact(routeName))) continue;
    for (const term of list(routeTerms).map(compact)) {
      if (card._searchCompact.includes(term)) score += 2;
    }
  }
  return score;
}

function cardScore(card, query, profile = {}) {
  const queryCompact = compact(query);
  const queryTokens = textTokens(query).filter(token => token.length >= 3);
  let score = stageScore(card, profile.stage) + routeScore(card, queryCompact);

  if (card._titleCompact && queryCompact.includes(card._titleCompact)) score += 24;
  for (const keyword of card._keywords) {
    if (!keyword) continue;
    if (queryCompact.includes(keyword)) score += keyword.length >= 4 ? 14 : 9;
    else if (keyword.includes(queryCompact) && queryCompact.length >= 4) score += 5;
  }
  for (const domain of card._domains) {
    if (domain && queryCompact.includes(domain)) score += 7;
  }
  if (card._boardCompact && queryCompact.includes(card._boardCompact)) score += 8;

  let overlap = 0;
  for (const token of queryTokens) {
    if (!card._tokens.has(token)) continue;
    overlap += token.length >= 4 ? 1.4 : 0.45;
  }
  score += Math.min(7, overlap);

  if (/错|不会|不懂|卡住|混乱|为什么/.test(query) && /错因|易错|意识|理解/.test(card.title)) {
    score += 4;
  }
  if (card.id === "math_sde_049" && /应用题|审题|读得懂.*不会列|不会列式/.test(query)) {
    score += 18;
  }
  if (card.id === "math_sde_030" && /公式.*(?:背|记|套|不会用|用不来)|背了.*不会用/.test(query)) {
    score += 18;
  }
  return score;
}

function hasDirectMatch(card, query) {
  const queryCompact = compact(query);
  if (!queryCompact) return false;
  const titleTopic = card._titleCompact.split("：")[0];
  if (titleTopic.length >= 2 && queryCompact.includes(titleTopic)) return true;
  if (card._keywords.some(keyword => (
    keyword.length >= 2
    && !GENERIC_DIRECT_TERMS.has(keyword)
    && queryCompact.includes(keyword)
  ))) return true;
  if (card._domains.some(domain => domain.length >= 3 && queryCompact.includes(domain))) return true;
  if (card._boardCompact.length >= 3 && queryCompact.includes(card._boardCompact)) return true;
  return false;
}

function isStageCompatible(card, stage) {
  if (!stage || card.board === "数学底层能力" || !card._grades.length) return true;
  const aliases = STAGE_ALIASES[stage] || [stage];
  return aliases.some(alias => card._grades.some(grade => grade.includes(compact(alias))));
}

function inferTopK(messages = [], profile = {}) {
  const query = userQuery(messages, profile);
  if (/规划|计划|路线|课程|备课|系统学习/.test(query)) return 10;
  if (/错|不会|不懂|卡住|诊断|为什么/.test(query)) return 8;
  if (profile.mode === "讲解模式") return 7;
  return 6;
}

function retrieveRagCards(messages = [], profile = {}, options = {}) {
  if (!state.loaded) loadRagKnowledgeBase();
  if (!state.loaded) return [];
  const query = userQuery(messages, profile);
  const topK = Math.max(1, Math.min(12, Number(options.topK || inferTopK(messages, profile))));
  const ranked = state.cards
    .map(card => ({
      card,
      score: cardScore(card, query, profile),
      directMatch: hasDirectMatch(card, query) && isStageCompatible(card, profile.stage)
    }))
    .sort((a, b) => Number(b.directMatch) - Number(a.directMatch) || b.score - a.score || a.card.id.localeCompare(b.card.id));

  const selected = [];
  const categoryCounts = new Map();
  const directMatches = ranked.filter(item => item.directMatch);
  const bestScore = directMatches[0]?.score || ranked[0]?.score || 0;
  for (const item of ranked) {
    if (directMatches.length) {
      if (!item.directMatch && item.score < Math.max(8, bestScore * 0.6)) continue;
    } else if (item.score < Math.max(7, bestScore * 0.75)) {
      continue;
    }
    const category = item.card.category || item.card.board || "other";
    const count = categoryCounts.get(category) || 0;
    if (count >= 3) continue;
    selected.push(item);
    categoryCounts.set(category, count + 1);
    if (selected.length >= topK) break;
  }

  if (selected.length < Math.min(3, topK)) {
    for (const id of FOUNDATION_CARD_IDS) {
      if (selected.some(item => item.card.id === id)) continue;
      const card = state.byId.get(id);
      if (!card) continue;
      selected.push({ card, score: 1 });
      if (selected.length >= Math.min(3, topK)) break;
    }
  }
  return selected.map(item => ({ ...item.card, retrievalScore: Number(item.score.toFixed(2)) }));
}

function clip(value, max = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function cardContext(card) {
  return [
    `[${card.id}] ${card.title}`,
    `板块/学段：${[card.board, ...list(card.grade_level), ...list(card.math_domain)].filter(Boolean).join("；")}`,
    `对象：${list(card.core_object).join("、") || "按原题识别"}`,
    `单位/标准：${clip(card.core_unit, 120) || "按原题确定"}`,
    `核心关系：${list(card.core_relation).join("；") || "按原题建立"}`,
    `结构模型：${clip(card.structural_model, 220)}`,
    `知识发生：${clip(card.knowledge_growth, 220)}`,
    `常见错因：${list(card.common_mistakes).slice(0, 4).join("；")}`,
    `教学路径：${list(card.teaching_path).slice(0, 8).join(" → ")}`
  ].filter(line => !line.endsWith("：")).join("\n");
}

function buildRagContext(messages = [], profile = {}, options = {}) {
  const cards = retrieveRagCards(messages, profile, options);
  if (!cards.length) return "";
  return [
    "【SDE专业RAG内部检索结果】",
    "以下内容只作为内部教学依据，禁止向学生展示卡片编号、检索分数、SDE术语或本段说明。",
    "使用纪律：",
    "1. 原题、图中明确标注和学生当前追问的优先级最高；知识卡只能辅助理解，不能覆盖或改写原题。",
    "2. 先选最贴近当前问题的一至三张卡组织回答，不要把所有卡片机械拼接，不要照抄卡片。",
    "3. 学生追问具体疑问时必须先正面回答；启发模式只推进一个关键台阶，讲解模式要把关系和结论讲完整。",
    "4. 知识卡中的对象、单位、关系和结构必须重新落回当前题目；若无法对应，就忽略该卡。",
    "5. 对学生使用自然语言，不暴露内部分类；需要类比时指出对应关系和类比边界。",
    "",
    ...cards.map(cardContext)
  ].join("\n\n");
}

function getRagStatus() {
  return {
    enabled: state.loaded,
    version: RAG_VERSION,
    cardCount: state.cards.length,
    loadedAt: state.loadedAt,
    error: state.error
  };
}

loadRagKnowledgeBase();

module.exports = {
  buildRagContext,
  getRagStatus,
  loadRagKnowledgeBase,
  retrieveRagCards
};
