const { parentPort, workerData } = require("worker_threads");

async function main() {
  const buffer = Buffer.from(workerData.buffer);
  if (workerData.kind === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    parentPort.postMessage({
      text: result.value || "",
      warningCount: Array.isArray(result.messages) ? result.messages.length : 0
    });
    return;
  }
  if (workerData.kind === "pdf") {
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buffer, { max: workerData.maxPages || 40 });
    parentPort.postMessage({
      text: result.text || "",
      totalPages: Number(result.numpages || 0),
      renderedPages: Number(result.numrender || 0)
    });
    return;
  }
  throw new Error("不支持的文档解析类型");
}

main().catch(error => {
  parentPort.postMessage({ error: error.message || "文档解析失败" });
});
