// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const data = window.KUGNI_TOOL_REPORT_DATA;

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    poster:
      '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m5 18 5-5 3 3 3-4 4 5"/>',
    link: '<path d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 2v6h-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 7v1m0 3v6"/>',
  };

  const icon = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.info}</svg>`;

  const stamp = (at) =>
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);

  const names = { candy: "糖果测试", fingerprint: "模型指纹测试" };

  const demoCandidates = [
    ["gpt-6.1-sol", "GPT", 51],
    ["gpt-6-luna", "GPT", 27.9],
    ["claude-sonnet-5", "Claude", 14.9],
    ["claude-opus-5-5", "Claude", 6],
    ["gpt-5.5", "GPT", 0.1],
    ["claude-sonnet-4-6", "Claude", 0.05],
    ["gpt-4.1", "GPT", 0.03],
    ["claude-haiku-4-5", "Claude", 0.02],
  ];

  let current = null;

  function modelMark(model) {
    const brand = [
      [/gpt|openai|codex/i, "openai"],
      [/claude|sonnet|opus/i, "claude"],
      [/gemini/i, "gemini"],
      [/deepseek/i, "deepseek"],
      [/grok/i, "grok"],
      [/qwen/i, "qwen"],
      [/kimi|moonshot/i, "moonshot"],
      [/glm|zhipu/i, "zhipu"],
    ].find(([pattern]) => pattern.test(model));
    return brand
      ? `<img src="assets/brands/${brand[1]}.svg" alt="" class="brand-icon report-model-mark" width="18" height="18">`
      : icon("info");
  }

  function actions(report, again = true) {
    return `<div class="tool-report-actions">${again ? `<a class="report-button report-button-primary" href="#/check/${report.tool}">${icon("refresh")}再测一次</a>` : ""}<button type="button" class="report-button" data-tool-report-action="export">${icon("download")}下载 JSON</button><button type="button" class="report-button" data-tool-report-action="poster">${icon("poster")}分享海报</button><button type="button" class="report-button" data-tool-report-action="link">${icon("link")}复制链接</button></div>`;
  }

  function metadata(report) {
    return `<div class="tool-report-meta"><span>${modelMark(report.model)}${esc(report.model || "未填写模型")}</span><span>${icon("clock")}<time datetime="${new Date(report.at).toISOString()}">${esc(stamp(report.at))} UTC+8</time></span><span class="report-kind-tag">${report.example ? "本地示例" : report.tool === "fingerprint" ? "手动数字统计" : "本轮结果"}</span></div>`;
  }

  function questionRows(report) {
    return report.questions
      .map((question) => {
        const correct = question.answer === question.sampleAnswer;
        return `<li id="tool-question-${question.id}" data-question-outcome="${correct ? "correct" : "wrong"}"><span class="report-question-number">${String(question.id).padStart(2, "0")}</span><div class="report-question-body"><span class="report-question-category">${esc(question.category)}</span><h3 translate="no">${esc(question.question)}</h3><p class="report-model-answer">示例模型答案：<strong translate="no">${question.sampleAnswer === null ? "未回答" : String.fromCharCode(65 + question.sampleAnswer) + " · " + esc(question.options[question.sampleAnswer])}</strong></p><details><summary>选项与参考答案</summary><ol type="A" translate="no">${question.options.map((option) => `<li>${esc(option)}</li>`).join("")}</ol><p><strong>参考答案：${String.fromCharCode(65 + question.answer)}</strong></p><p translate="no">${esc(question.explanation)}</p></details></div><span class="report-outcome ${correct ? "is-correct" : "is-wrong"}">${correct ? "示例答对" : "示例答错"}</span></li>`;
      })
      .join("");
  }

  function candyView(report) {
    const verdict =
      report.correct === report.total
        ? "全部答对"
        : report.score >= 60
          ? "有题需留意"
          : "多题未答对";
    return `<article class="tool-report candy-report" aria-label="糖果测试报告"><a class="report-back" href="#/check/candy">${icon("back")}返回糖果测试</a><header class="tool-report-heading"><span>CANDY REPORT · 本轮测试报告</span><h1>糖果测试报告</h1>${metadata(report)}</header><p class="report-demo-note">${icon("info")}本地示例 · 未调用接口，以下分数和答案用于展示报告布局。</p>${actions(report)}<section class="candy-report-scorebar test-result-heading" aria-label="本轮结果"><div class="report-score-main"><div class="report-score-ring" style="--report-score:${report.score}%"><div><strong>${report.score}</strong><span>/ 100</span></div></div><div><span>本轮示例得分</span><h2>${verdict}</h2><p>${report.total} 道固定选择题 · 四项能力分别看</p></div></div><dl><div><dt>示例判定</dt><dd class="report-verdict">${report.score === 100 ? "正常" : report.score >= 60 ? "需留意" : "异常"}</dd></div><div><dt>答对</dt><dd>${report.correct} / ${report.total}</dd></div><div><dt>题目正确率</dt><dd>${report.score}%</dd></div></dl></section><section class="report-dimensions"><h2>维度得分</h2><div class="test-category-scores">${window.KUGNI_MODEL_TEST.categories
      .map((name, index) => {
        const rows = report.questions.filter(
            (question) => question.category === name,
          ),
          correct = rows.filter(
            (question) => question.answer === question.sampleAnswer,
          ).length,
          score = rows.length ? Math.round((correct / rows.length) * 100) : 0;
        return `<div data-dimension="${index}"><div><span>${name}</span><strong>${rows.length ? score + " 分" : "未覆盖"}</strong></div><span class="report-progress"><i style="width:${score}%"></i></span><small>${rows.length ? correct + " / " + rows.length + " 题答对" : "本轮未抽取该类题目"}</small></div>`;
      })
      .join(
        "",
      )}</div></section><div class="candy-report-grid"><section class="report-question-card"><header><h2>题目明细</h2><div class="report-question-filters" role="group" aria-label="筛选答题结果">${[
      ["all", "全部"],
      ["wrong", "只看答错"],
      ["correct", "只看答对"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-report-question-filter="${value}" aria-pressed="${value === "all"}">${label}</button>`,
      )
      .join(
        "",
      )}</div></header><ol class="test-question-list">${questionRows(report)}</ol></section><aside class="report-question-nav"><h2>答题导航</h2><div>${report.questions.map((question) => `<button type="button" class="${question.answer === question.sampleAnswer ? "is-correct" : "is-wrong"}" data-report-question-jump="${question.id}" aria-label="第 ${question.id} 题，${question.answer === question.sampleAnswer ? "示例答对" : "示例答错"}">${String(question.id).padStart(2, "0")}</button>`).join("")}</div><p><span class="is-correct">● 答对</span><span class="is-wrong">● 答错</span></p><p class="report-result-note">这只是固定示例。本轮答题结果不能单独用于判断整个站点的质量或模型身份。</p><a href="#/methodology">查看测试方法 ${icon("arrow")}</a></aside></div><footer class="tool-report-footer"><a href="#/check/history">查看检测记录 ${icon("arrow")}</a>${actions(report, false)}</footer></article>`;
  }

  function candidateRows(expanded = false) {
    return demoCandidates
      .slice(0, expanded ? 8 : 5)
      .map(
        ([model, family, percent], index) =>
          `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><strong>${modelMark(model)}${model}</strong><small>演示候选 · 非实际匹配</small></td><td>${family}</td><td><div class="report-candidate-probability"><span class="report-progress"><i style="width:${percent}%"></i></span><b>${percent >= 0.1 ? percent.toFixed(1) : percent.toFixed(2)}%</b></div></td></tr>`,
      )
      .join("");
  }

  function actualCandidates(report) {
    const rows = report.fingerprint?.candidates || [];
    if (!rows.length)
      return `<div class="report-candidates-empty">${esc(report.conclusion || "当前没有可用的校准指纹基线。")}</div>`;
    return `<div class="report-candidates-scroll"><table><thead><tr><th>排名</th><th>候选模型</th><th>相似度</th><th>特征距离</th></tr></thead><tbody>${rows.map((row, i) => `<tr><td>${i + 1}</td><td><strong>${modelMark(row.model)}${esc(row.model)}</strong></td><td>${esc(row.similarity)}%</td><td>${esc(row.distance)}</td></tr>`).join("")}</tbody></table></div><p class="report-result-note">相似度基于可信模型的数字分布与顺序特征，不是身份概率；超出校准范围或候选过近时不判断型号。</p>`;
  }

  function fingerprintView(report) {
    const valid = report.evidence.filter((item) => item.count).length,
      total = report.evidence.reduce((sum, item) => sum + item.count, 0);
    return `<article class="tool-report fingerprint-report" aria-label="模型指纹测试报告"><a class="report-back" href="#/check/fingerprint">${icon("back")}返回模型指纹测试</a><header class="tool-report-heading"><span>FINGERPRINT REPORT · 独立模型对照</span><h1>${report.example ? "模型指纹示例报告" : "数字样本分析"}</h1>${metadata(report)}</header><section class="fingerprint-result"><header class="report-section-heading"><h2>指纹对比结果</h2><span class="report-complete">${icon("check")}${report.example ? "演示完成" : "样本已整理"}</span><div class="report-inline-share"><button type="button" class="report-button report-button-primary" data-tool-report-action="poster">${icon("poster")}分享海报</button><button type="button" class="report-button" data-tool-report-action="link">${icon("link")}复制链接</button></div></header><div class="fingerprint-result-hero test-result-heading"><div><span>${report.example ? "固定演示候选 · 非实际检测" : "数字样本已整理"}</span><h2>${report.example ? "gpt-6.1-sol" : esc(report.fingerprint?.matchedModel || "暂无可靠匹配")}</h2><p>${esc(report.conclusion)}</p></div><div class="fingerprint-probability"><strong>${report.example ? "51.0%" : report.fingerprint?.matchedModel ? esc(report.fingerprint.candidates[0].similarity) + "%" : "—"}</strong><span>${report.example ? "演示相对概率" : "候选相似度"}</span></div></div><dl class="fingerprint-result-facts"><div><dt>填写的模型</dt><dd>${esc(report.model || "未填写")}</dd></div><div><dt>${report.example ? "家族对照（示例）" : "基线匹配"}</dt><dd>${report.example ? "GPT · 79.0%" : report.fingerprint?.state === "matched" ? "已匹配" : "未匹配"}</dd></div><div><dt>有效回答</dt><dd>${valid} / 3 <small>· ${total} 个数字</small></dd></div></dl><p class="report-result-note">${report.example ? "候选和概率为固定布局示例，不来自填写地址的响应。" : "按照相同版本的可信模型基线进行匹配，结果受样本和基线覆盖范围影响。"}指纹测试独立展示，不计入综合评分。</p><section class="report-candidates" aria-labelledby="report-candidates-heading"><div class="report-section-heading"><h2 id="report-candidates-heading">候选模型对照</h2><span>${report.example ? "演示数据" : "校准基线对照"}</span></div>${report.example ? `<div class="report-candidates-scroll"><table><thead><tr><th scope="col">排名</th><th scope="col">候选模型</th><th scope="col">家族</th><th scope="col">相对概率（示例）</th></tr></thead><tbody>${candidateRows()}</tbody></table></div><button type="button" class="report-show-candidates" data-tool-report-action="candidates" aria-expanded="false">查看全部 8 个演示候选 ↓</button>` : actualCandidates(report)}</section><div class="test-evidence">${report.evidence.map((item) => `<details><summary><span>第 ${item.question} 题</span><strong>${item.count} / ${item.expected} 个数字</strong><em>${item.count ? "已计入" : "未提供"}</em></summary><section aria-label="第 ${item.question} 题数字频数"><div class="report-digit-chart" aria-label="数字 0 到 9 的频数">${item.distribution.map((count, digit) => `<div><span>${count}</span><i style="--digit-height:${item.count ? Math.max(2, (count / Math.max(...item.distribution)) * 100) : 0}%"></i><b>${digit}</b></div>`).join("")}</div><p>仅展示数字频数，不包含粘贴的原始回答。</p></section></details>`).join("")}</div><footer class="tool-report-footer"><a href="#/check/history">查看检测记录 ${icon("arrow")}</a>${actions(report, false)}</footer></section><div class="tool-report-bottom"><a class="report-button report-button-primary" href="#/check/fingerprint">${icon("refresh")}再测一次</a><a href="#/methodology">方法与证据说明 ${icon("arrow")}</a></div></article>`;
  }

  function page(tool) {
    try {
      current = data.resolve(tool);
      return (
        (tool === "candy" ? candyView(current) : fingerprintView(current)) +
        '<p id="tool-report-status" class="tool-report-status" role="status" aria-live="polite"></p>'
      );
    } catch {
      current = null;
      return `<section class="tool-report report-unavailable"><span>${names[tool]}</span><h1>报告链接无效或已损坏</h1><p>请检查是否复制了完整链接，或重新运行测试。</p><a class="report-button report-button-primary" href="#/check/${tool}">返回测试</a><a class="report-button" href="#/check/${tool}/result?example=1">查看示例报告</a></section>`;
    }
  }

  function historyPanel() {
    const records = data.history();
    return `<section class="tool-report-history" aria-labelledby="tool-history-heading"><header class="report-section-heading"><div><h2 id="tool-history-heading">糖果与指纹测试记录</h2><p>仅保存在当前浏览器 · 最近 20 份 · 不保存 Key 或原始回答</p></div>${records.length ? '<button type="button" class="report-button" data-tool-report-action="clear-history">清空专项记录</button>' : ""}</header>${records.length ? `<div>${records.map(({ report }) => `<article><div>${modelMark(report.model)}<div><strong>${names[report.tool]}${report.example ? " · 示例" : ""}</strong><span>${esc(report.model || "未填写模型")} · ${esc(stamp(report.at))}</span></div></div><strong>${report.tool === "candy" ? report.score + " 分" : report.evidence.filter((item) => item.count).length + " / 3 有效"}</strong><a class="report-button" href="${esc(data.shareURL(report))}">查看报告 ${icon("arrow")}</a></article>`).join("")}</div>` : '<p class="report-history-empty">运行糖果测试或指纹测试后，可在这里回看报告。</p>'}</section>`;
  }
  window.KUGNI_TOOL_REPORTS = {
    page,
    candyView,
    fingerprintView,
    historyPanel,
    stamp,
  };
  return window.KUGNI_TOOL_REPORTS;
}
