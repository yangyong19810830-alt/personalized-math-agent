const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "implementation");
const REFERENCES = path.join(ROOT, "references");
const VERSION_FILE = path.join(ROOT, "VERSION.md");
const MAX_REFERENCE_CHARS = 5200;

const files = {
  skill: path.join(ROOT, "SKILL.md"),
  diagnostic: path.join(REFERENCES, "DIAGNOSTIC-RUBRIC.md"),
  routing: path.join(REFERENCES, "TASK-ROUTING.md"),
  stageMap: path.join(REFERENCES, "STAGE-MAP.md"),
  curriculum: path.join(REFERENCES, "CURRICULUM-DOMAIN-MAP.md"),
  tasksG1G2: path.join(REFERENCES, "TASKS-G1-G2.md"),
  tasksG3G6: path.join(REFERENCES, "TASKS-G3-G6.md"),
  tasksG7G9: path.join(REFERENCES, "TASKS-G7-G9.md"),
  tasksG10G12: path.join(REFERENCES, "TASKS-G10-G12.md"),
  teacherTasks: path.join(REFERENCES, "TEACHER-TASKS.md"),
  feedback: path.join(REFERENCES, "FEEDBACK-RUBRIC.md"),
  growth: path.join(REFERENCES, "GROWTH-PROFILE-SCHEMA.md"),
  templates: path.join(REFERENCES, "OUTPUT-TEMPLATES.md"),
  privacy: path.join(REFERENCES, "SAFETY-PRIVACY.md"),
  quality: path.join(REFERENCES, "QUALITY-EVALUATION.md")
};

let cache = null;

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

function extractVersion(text) {
  const match = String(text || "").match(/\b(\d+\.\d+\.\d+)\b/);
  return match ? match[1] : "1.0.0";
}

function loadImplementation() {
  if (cache) return cache;
  try {
    const documents = Object.fromEntries(
      Object.entries(files).map(([key, filePath]) => [key, readText(filePath)])
    );
    cache = {
      enabled: true,
      version: extractVersion(readText(VERSION_FILE)),
      documents,
      error: ""
    };
  } catch (error) {
    cache = {
      enabled: false,
      version: "",
      documents: {},
      error: error.message || "implementation resources unavailable"
    };
  }
  return cache;
}

function latestUserText(messages) {
  return [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find(message => message?.role === "user")?.content || "";
}

function implementationRoute(messages, profile = {}) {
  const intent = String(profile.intent || "");
  const text = `${latestUserText(messages)}\n${intent}`;
  if (intent === "lesson_start" || /学生自学|自主学习|诊断我的解题|我的解题过程|订正记录/.test(text)) {
    return "student";
  }
  if (intent === "family_diagnosis" || /错题诊断|家庭辅导|家长怎么|孩子.*不会|孩子.*错|学习诊断/.test(text)) {
    return "family";
  }
  if (intent === "teacher_practice" || /课堂改造|教学设计|教案|学生作品|教师路径|公开课/.test(text)) {
    return "teacher";
  }
  if (intent === "practice_feedback" || /实践反馈|完成任务|提交作品|反馈一下|成长记录/.test(text)) {
    return "feedback";
  }
  if (/月度报告|成长档案|学习档案/.test(text)) return "growth";
  if (/最小任务|变式迁移|单位意识|数量关系|对象识别|方法为什么成立/.test(text)) return "consult";
  return "";
}

function clip(text, limit = MAX_REFERENCE_CHARS) {
  const value = String(text || "").trim();
  return value.length > limit ? `${value.slice(0, limit)}\n（参考资料已截断）` : value;
}

function stageBand(messages, profile = {}) {
  const text = `${latestUserText(messages)}\n${profile.grade || ""}\n${profile.stage || ""}`;
  if (/一年级|二年级|小学一|小学二|G1|G2/i.test(text)) return "g1g2";
  if (/三年级|四年级|五年级|六年级|小学三|小学四|小学五|小学六|G[3-6]/i.test(text)) return "g3g6";
  if (/七年级|八年级|九年级|初一|初二|初三|初中|G[7-9]/i.test(text)) return "g7g9";
  if (/高一|高二|高三|高中|十年级|十一年级|十二年级|G10|G11|G12/i.test(text)) return "g10g12";
  if (/小学/.test(text)) return "primary";
  if (/大学|本科|研究生/.test(text)) return "outside";
  return "";
}

function stageTaskContext(documents, band) {
  if (band === "g1g2") return "【小学一至二年级任务库】\n" + clip(documents.tasksG1G2, 3800);
  if (band === "g3g6") return "【小学三至六年级任务库】\n" + clip(documents.tasksG3G6, 4200);
  if (band === "g7g9") return "【初中任务库】\n" + clip(documents.tasksG7G9, 4200);
  if (band === "g10g12") return "【高中任务库】\n" + clip(documents.tasksG10G12, 4500);
  if (band === "primary") {
    return [
      "【小学任务选择提醒】尚未获得具体年级。布置任务前只询问一次年级；若已有作品足以判断表征水平，可先给不依赖年级的一步诊断。",
      "【小学一至二年级任务摘要】\n" + clip(documents.tasksG1G2, 1800),
      "【小学三至六年级任务摘要】\n" + clip(documents.tasksG3G6, 2200)
    ].join("\n\n");
  }
  if (band === "outside") {
    return "【范围边界】当前落地任务库校准到高中三年级。大学内容仍可进行数学讲解和一般学习支持，但不要声称使用了已校准的大学任务库。";
  }
  return "【学段待确认】若必须布置分学段任务，只索取一次当前年级；不要连续盘问。";
}

function coreRules(route, band) {
  return [
    "【个性化数学学习落地服务】",
    `当前服务路径：${route}`,
    `当前学段路由：${band || "待确认"}`,
    "服务闭环：真实证据 → 精准诊断 → 一个最小任务 → 实践提交 → 证据化反馈 → 变式迁移 → 成长记录 → 下一步任务。",
    "证据先于判断。没有学生真实作品或讲题记录时，不作确定性诊断，只索取一项最小有效证据。",
    "只描述本次作品中的行为，不给孩子贴粗心、懒、能力差、没有逻辑等标签，也不作医学或心理诊断。",
    "诊断使用十个维度：对象情境、单位参照、概念意义、关系结构、表示转换、运算变换、推理论证、建模应用、迁移生成、监控执行；同时区分知识缺口、结构断点和执行断点。",
    "每轮只抓一个主要卡点，并明确暂时不训练什么。任务时长按学段校准：小学低段 8—15 分钟，小学中高段 15—25 分钟，初中 20—35 分钟，高中 25—45 分钟。",
    "任务必须写清学生做什么、成人做什么、不要做什么、提交什么、完成标准、退阶和升级条件。",
    "记录实际使用的提示层级：0级不提示，1级目标，2级对象或关系，3级表示，4级半成品结构，5级完整示范后迁移。",
    "反馈必须引用可观察证据，并以一个清晰的下一步动作收束。",
    "任务库已校准覆盖小学一年级至高中三年级。大学不在本落地包校准范围内，不得假装已有大学分学段任务数据。",
    "面向用户使用自然语言，不暴露内部评分，不虚构教材、学生表现、课堂数据或成长变化。"
  ].join("\n");
}

function buildImplementationContext(messages, profile = {}) {
  const loaded = loadImplementation();
  const route = implementationRoute(messages, profile);
  if (!loaded.enabled || !route) return "";

  const docs = loaded.documents;
  const band = stageBand(messages, profile);
  const sections = [
    coreRules(route, band),
    "【任务路由规则】\n" + clip(docs.routing, 2400),
    "【学段地图】\n" + clip(docs.stageMap, 2600)
  ];
  if (route === "family") {
    sections.push("【十维诊断量规】\n" + clip(docs.diagnostic, 3800));
    sections.push(stageTaskContext(docs, band));
    sections.push("【家庭诊断输出模板】\n" + clip(docs.templates, 1800));
  } else if (route === "student") {
    sections.push("【十维诊断量规】\n" + clip(docs.diagnostic, 3500));
    sections.push(stageTaskContext(docs, band));
    sections.push("【学生自学输出模板】\n" + clip(docs.templates, 2000));
  } else if (route === "teacher") {
    sections.push("【课程领域地图】\n" + clip(docs.curriculum, 2500));
    sections.push("【教师课堂最小改造任务】\n" + clip(docs.teacherTasks, 3500));
    sections.push("【教师输出模板】\n" + clip(docs.templates, 2000));
  } else if (route === "feedback") {
    sections.push("【实践反馈量规】\n" + clip(docs.feedback, 4300));
    sections.push("【成长档案结构】\n" + clip(docs.growth, 2600));
  } else if (route === "growth") {
    sections.push("【成长档案结构】\n" + clip(docs.growth, 3600));
    sections.push("【报告模板】\n" + clip(docs.templates, 3000));
  } else {
    sections.push("【十维诊断摘要】\n" + clip(docs.diagnostic, 3000));
    sections.push(stageTaskContext(docs, band));
  }
  return sections.join("\n\n");
}

function getImplementationStatus() {
  const loaded = loadImplementation();
  return {
    enabled: loaded.enabled,
    version: loaded.version,
    error: loaded.error,
    routes: ["family", "student", "teacher", "feedback", "growth"]
  };
}

module.exports = {
  buildImplementationContext,
  getImplementationStatus,
  implementationRoute
};
