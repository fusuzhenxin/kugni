// Translate persisted evidence into the approved report layout. No sample scores.
export function reportView(record) {
  const e = record.evidence || {};
  const base = {
    id: record.id,
    model: record.model,
    at: Date.parse(record.date),
    example: false,
    conclusion: e.conclusion || "",
    manual: !!e.manual,
  };
  if (record.type === "糖果测试")
    return {
      ...base,
      tool: "candy",
      score: record.score ?? 0,
      total: e.total || e.samples?.length || 0,
      correct: e.correct || 0,
      questions: (e.samples || []).map((s, i) => {
        const options = s.options || [s.expected, "其他答案"];
        const answer = s.options ? String(s.expected).charCodeAt(0) - 65 : 0;
        const sampleAnswer = s.options
          ? /^[A-D][。.!！]?$/i.test(String(s.answer).trim())
            ? String(s.answer).trim().toUpperCase().charCodeAt(0) - 65
            : null
          : s.correct
            ? 0
            : 1;
        return {
          id: i + 1,
          category: s.category,
          question: s.prompt,
          options,
          answer,
          sampleAnswer,
          explanation: s.explanation || "参考答案：" + s.expected,
        };
      }),
    };
  return {
    ...base,
    tool: "fingerprint",
    fingerprint: e.fingerprint || null,
    evidence: (e.samples || []).map((s, i) => {
      const digits = String(s.text || "").match(/(?<!\d)[0-9](?!\d)/g) || [];
      return {
        question: i + 1,
        expected: s.expectedCount || [327, 299, 301][i],
        count: s.count ?? digits.length,
        distribution:
          s.distribution ||
          Array.from(
            { length: 10 },
            (_, n) => digits.filter((d) => d === String(n)).length,
          ),
      };
    }),
  };
}

export function basicReport(record, esc) {
  const e = record.evidence || {},
    samples = e.samples || [],
    success = e.success;
  const stat = (label, value) =>
    "<div><span>" +
    label +
    "</span><strong>" +
    esc(value ?? "—") +
    "</strong></div>";
  const elapsed = samples.map((s) => s.elapsedMs).filter(Number.isFinite),
    latency = elapsed.length
      ? Math.round(elapsed.reduce((s, n) => s + n, 0) / elapsed.length) + " ms"
      : "—";
  const usage = (key) =>
    samples.reduce(
      (sum, s) =>
        sum +
        Object.entries(s.usage || {})
          .filter(([k]) => key.test(k))
          .reduce((n, [, v]) => n + Number(v), 0),
      0,
    ) || "—";
  return `<section class="connection-report" aria-label="检测报告"><div class="cr-top"><div><a href="/tools/api-check/">中转站检测</a><span> / </span><span>检测报告</span></div><div class="cr-actions"><button class="cr-button" data-report-action="link">复制链接</button><button class="cr-button" data-report-action="export">导出报告</button><a class="cr-button cr-primary" href="/tools/api-check/">重新检测 →</a></div></div><div class="cr-summary"><div class="cr-score cr-no-score"><strong>${success ? "✓" : "—"}</strong><small>${success ? "响应成功" : "未完成"}</small></div><div class="cr-identity"><span class="cr-demo">实际请求记录 · ${esc(record.status || "公开报告")}</span><h1>${success ? "检测完成" : "连接异常"}</h1><strong>${esc(e.protocol || record.type)}</strong><p>${esc(e.requestedModel || record.model)}</p><span class="cr-count">${esc(e.successCount ?? samples.length)} 次有效响应 / ${esc(e.total ?? samples.length)} 次请求</span></div><dl class="cr-meta"><dt>检测模型</dt><dd>${esc(record.model)}</dd><dt>检测时间</dt><dd>${esc(new Date(record.date).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</dd><dt>API Key</dt><dd>不包含在报告中</dd></dl></div><div class="cr-stats">${stat("首字响应", e.ttftMs == null ? "—" : e.ttftMs + " ms") + stat("输出速度", e.tokensPerSecond == null ? "—" : e.tokensPerSecond + " tokens/s") + stat("平均响应", latency) + stat("成功率", e.successRate == null ? "—" : e.successRate + "%") + stat("输入 tokens", usage(/input_tokens|prompt_tokens|promptTokenCount/)) + stat("输出 tokens", usage(/output_tokens|completion_tokens|candidatesTokenCount/)) + stat("响应样本数", samples.length)}</div><div class="cr-alert"><span>${esc(e.error || e.errors?.join("；") || "仅展示实际执行的项目，不对未执行能力评分。")}</span></div><div class="cr-toolbar"><div class="cr-tabs" role="tablist" aria-label="报告内容"><button role="tab" aria-selected="true" data-report-action="report">检测报告</button><button role="tab" aria-selected="false" data-report-action="raw">响应证据</button></div></div><div id="cr-report-panel">${samples.map((s, i) => `<details class="cr-item"><summary><span class="cr-number">${String(i + 1).padStart(2, "0")}</span><span class="cr-item-text"><strong>${esc(s.reportedModel || record.model)}</strong><span translate="no">${esc(s.text || s.answer || "无文本响应")}</span></span><span class="cr-status">${esc(s.elapsedMs ?? "—")} ms</span><span class="cr-chevron">⌄</span></summary><div class="cr-evidence"><pre>${esc(JSON.stringify(s, null, 2))}</pre></div></details>`).join("") || '<div class="cr-error-state"><h2>本次未取得有效响应</h2><p>请核对接口地址、协议和模型权限后重试。</p></div>'}</div><div id="cr-raw-panel" hidden><div class="cr-raw-head"><span>已移除凭证的执行证据</span><button class="cr-button" data-report-action="copyraw">复制 JSON</button></div><pre>${esc(JSON.stringify(e, null, 2))}</pre></div><div class="cr-footnote"><p>有限样本只能说明本轮请求的表现，不代表持续可用性或模型身份。<a href="/tools/history/">检测历史 →</a></p></div></section>`;
}
