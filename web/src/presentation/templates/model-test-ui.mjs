import { renderModelField } from "../model-catalog.mjs";
// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const esc = (v) =>
    String(v ?? "").replace(
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

  const categories = ["迷惑辨析", "数量关系", "约束求解", "演绎推理"];

  const questions = [
    [
      0,
      "盒里有 6 颗蓝糖和 4 颗红糖。拿走所有红糖后，盒里还有几颗糖？",
      ["4", "6", "10", "无法确定"],
      1,
      "拿走的是 4 颗红糖，6 颗蓝糖仍在盒中。",
    ],
    [
      1,
      "每袋装 8 颗糖，装满 7 袋还剩 3 颗，一共有多少颗？",
      ["53", "56", "59", "64"],
      2,
      "8 × 7 + 3 = 59。",
    ],
    [
      2,
      "甲、乙、丙各拿不同颜色的糖。颜色为红、蓝、绿；甲不拿红或蓝，乙不拿红。丙拿什么？",
      ["红", "蓝", "绿", "不能确定"],
      0,
      "甲只能拿绿，乙只能拿蓝，所以丙拿红。",
    ],
    [
      3,
      "所有薄荷糖都是绿色。有些绿色糖是软糖。哪一项必然成立？",
      [
        "所有薄荷糖是软糖",
        "有些软糖是薄荷糖",
        "所有薄荷糖是绿色",
        "所有绿色糖是薄荷糖",
      ],
      2,
      "只能确定题干给出的包含关系，不能从颜色推断两类糖有交集。",
    ],
    [
      0,
      "今天不是周一，也不是周二。能否断定明天是周四？",
      ["能", "不能", "明天必是周五", "今天必是周三"],
      1,
      "今天可能是周三至周日，信息不足。",
    ],
    [
      1,
      "糖的数量依次是 3、7、11、15，按同一规律下一个数是？",
      ["17", "18", "19", "20"],
      2,
      "每次增加 4，15 + 4 = 19。",
    ],
    [
      2,
      "四个盒子从左到右排成一列。蓝盒在第 2 位，红盒紧靠蓝盒右侧，绿盒在红盒右侧。黄盒在第几位？",
      ["1", "2", "3", "4"],
      0,
      "红盒第 3，绿盒第 4，剩下黄盒第 1。",
    ],
    [
      3,
      "如果下雨就取消野餐。今天没有取消野餐。按这条规则可以推出什么？",
      ["今天下雨", "今天没有下雨", "明天没有雨", "无法判断是否下雨"],
      1,
      "由“下雨则取消”和“没有取消”，可用逆否推理得出没有下雨。",
    ],
    [
      0,
      "一根绳剪 3 次，每次只剪一段且不叠放，最多得到几段？",
      ["3", "4", "6", "8"],
      1,
      "初始 1 段，每次增加 1 段，合计 4 段。",
    ],
    [
      1,
      "12 颗糖平均分给 4 人，其中一人又送出 1 颗。他剩几颗？",
      ["1", "2", "3", "4"],
      1,
      "先得到 12 ÷ 4 = 3 颗，再送出 1 颗，剩 2 颗。",
    ],
    [
      2,
      "甲比乙早到，丙比甲早到，丁比乙晚到。谁最早？",
      ["甲", "乙", "丙", "丁"],
      2,
      "到达顺序为丙、甲、乙、丁。",
    ],
    [
      3,
      "没有圆形糖是酸的。某颗糖是酸的。它一定是什么情况？",
      ["圆形", "不是圆形", "红色", "软糖"],
      1,
      "酸糖与圆形糖没有交集，因此这颗酸糖不是圆形。",
    ],
    [
      0,
      "桌上有 5 个杯子，打碎 2 个但碎片仍留在桌上。完整的杯子有几个？",
      ["2", "3", "5", "7"],
      1,
      "问的是完整杯子，5 − 2 = 3。",
    ],
    [
      1,
      "一盒糖打八折后卖 24 元，原价多少元？",
      ["19.2", "28", "30", "32"],
      2,
      "原价 × 0.8 = 24，因此原价为 30 元。",
    ],
    [
      2,
      "只有一个盒子有糖。甲盒标“糖在乙盒”，乙盒标“糖不在乙盒”，丙盒标“糖不在甲盒”。三个标签恰好一个为真，糖在哪？",
      ["甲盒", "乙盒", "丙盒", "不能确定"],
      0,
      "前两个标签互为否定，必一真一假。第三个必须假，因此糖在甲盒。",
    ],
    [
      3,
      "所有 A 都是 B，没有 B 是 C。哪项必然成立？",
      ["所有 C 都是 A", "没有 A 是 C", "有些 A 是 C", "所有 B 都是 A"],
      1,
      "A 是 B 的子集，B 与 C 不相交，因此 A 与 C 也不相交。",
    ],
    [
      0,
      "小林的姐姐有一个弟弟叫小林。仅据此可知姐姐至少有几个弟弟？",
      ["0", "1", "2", "3"],
      1,
      "至少有明确提到的小林 1 人；不能排除还有其他弟弟。",
    ],
    [
      1,
      "罐里红糖与蓝糖数量比为 2:3，共 25 颗。红糖多少颗？",
      ["5", "10", "15", "20"],
      1,
      "总共 5 份，每份 5 颗，红糖 2 份即 10 颗。",
    ],
    [
      2,
      "A、B、C 三个开关恰好一个开。若 A 关则 B 开；若 B 开则 C 开。哪个开？",
      ["A", "B", "C", "不能确定"],
      0,
      "假设 A 关会使 B、C 同开，违反恰好一个开；所以 A 开，B、C 关。",
    ],
    [
      3,
      "只有持票者可以入场。小周已经按规则入场。能推出什么？",
      ["小周持票", "所有持票者都入场", "小周没持票", "小周是工作人员"],
      0,
      "持票是按规则入场的必要条件，所以小周持票。",
    ],
  ];

  const categoryDescriptions = [
    "识别直觉陷阱与题意差异",
    "处理比例、计算与数量变化",
    "找到同时满足条件的解",
    "从已知前提推导结论",
  ];

  const sampleLengths = [327, 299, 301];

  let promptVariant = 0;

  const prompt = (i) =>
    `请独立生成 ${sampleLengths[i]} 个 0 到 9 的数字，用英文逗号分隔。${["尽量让选择自然。", "请直接给出一组新的序列。", "不要沿用之前的数字顺序。"][(i + promptVariant) % 3]}只输出数字序列，不要解释。`;

  const fingerprintIcon =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 12a8 8 0 0 1 16 0m-20 1a12 12 0 0 1 24 0M12 14a4 4 0 0 1 8 0c0 7-1 12-4 16M8 17c0 5-1 8-3 11m7-11c0 5-1 9-3 13m7-15c0 4 0 8-2 12m10-10c0 6-1 10-3 14m7-14c0 5 0 8-1 11"/></svg>';

  function toolNav(kind) {
    return `<nav class="test-tool-nav" aria-label="检测工具"><a href="#/check">检测首页</a><a href="#/check/history">检测记录</a><a href="#/check/candy" ${kind === "candy" ? 'aria-current="page"' : ""}>糖果测试</a><a href="#/check/fingerprint" ${kind === "fingerprint" ? 'aria-current="page"' : ""}>模型指纹测试</a></nav>`;
  }

  function connectionFields(kind) {
    return `<label class="tool-field tool-wide">API 接口地址<input name="endpoint" type="url" required placeholder="https://api.example.com/v1" maxlength="500" autocomplete="off"></label><label class="tool-field ${kind === "candy" ? "tool-wide" : ""}">API Key<span class="tool-key"><input id="tool-api-key" type="password" autocomplete="off" placeholder="sk-…（请使用示例信息）" maxlength="300"><button type="button" data-tool-action="key" aria-label="显示示例密钥" aria-pressed="false">显示</button></span></label>${kind === "fingerprint" ? '<label class="tool-field">接口协议<select name="protocol"><option value="chat">Chat Completions</option><option value="responses">Responses</option><option value="messages">Claude Messages</option></select></label>' : ""}<div class="tool-field tool-wide"><label for="tool-model">目标模型</label><div class="tool-model-row">${renderModelField(window.modelChoices, { id: "tool-model", value: window.modelChoices[0]?.id || "" })}<button type="button" class="btn light" data-tool-action="models">获取模型${kind === "candy" ? "列表" : ""}</button></div></div>`;
  }

  function distribution(count = 10) {
    return `<aside class="candy-distribution" aria-labelledby="candy-distribution-heading"><header><h2 id="candy-distribution-heading">本轮题目分布</h2><span id="candy-distribution-count">${count} / 20 题</span></header><div>${categories.map((name, i) => `<section data-candy-category="${i}"><div><h3>${name}</h3><span>${questions.slice(0, count).filter((q) => q[0] === i).length} 题</span></div><p>${categoryDescriptions[i]}</p></section>`).join("")}</div><p>完成后，可以查看总分、正确率、四项得分和每道题的模型答案。</p></aside>`;
  }

  function candyPage() {
    return `<header class="site-page-heading"><span>CANDY TEST · 逻辑与推理</span><h1>糖果测试</h1><p>题库 20 道，开考前选 5、10、15 或 20 道。做到哪一题就展示题目和选项，做完给出分数、对错和分项得分。</p></header><ol class="candy-steps" aria-label="测试步骤"><li><span>01</span>连接模型</li><li><span>02</span>选择题量</li><li><span>03</span>查看结果</li></ol><div class="candy-layout"><section class="candy-settings"><div class="tool-section-heading"><h2>测试设置</h2><span>本地演示，不发送请求</span></div><form id="model-test-form"><div class="tool-fields">${connectionFields("candy")}</div><p class="tool-protocol">OpenAI 兼容 <span>Key 只留在这次打开的页面里，不保存</span></p><fieldset class="candy-quantity"><legend>题量</legend><div>${[
      [5, "快速体验"],
      [10, "常用题量"],
      [15, "更多题目"],
      [20, "完整题库"],
    ]
      .map(
        ([count, text]) =>
          `<label><input type="radio" name="count" value="${count}" ${count === 10 ? "checked" : ""}><span><strong>${count}<small> 题</small></strong><span>${text}</span></span></label>`,
      )
      .join(
        "",
      )}</div></fieldset><div class="tool-submit-row"><button type="button" class="btn light" data-tool-action="example">填入示例</button><button type="submit" class="btn primary">开始测试 →</button></div><a class="tool-history-link" href="#/check/history">检测历史 ↗</a></form></section>${distribution()}</div><section class="test-reading"><h2>这页在测什么</h2><p>糖果测试使用 20 道固定选择题，观察一次调用是否把逻辑题做错。题目分为迷惑辨析、数量关系、约束求解、演绎推理。当前展示本地示例，报告包含逐题答案、解释和四项正确率；单次结果不能用于判断整个中转站的模型质量。</p></section>`;
  }

  function manualFields() {
    return `<form id="model-test-manual-form" hidden role="tabpanel" aria-labelledby="fingerprint-manual-tab"><div class="tool-section-heading"><h2>复制题目，把回答贴回来</h2><span>无需接口或 Key</span></div><p class="tool-form-note">每题新开一个对话，使用同一模型并关闭工具、联网和代码执行。至少一题有效即可整理，建议完成三题。测试题目保留中文原文，以保持测试条件一致。</p><label class="tool-field">正在使用的模型 ID（可选）<input name="manualModel" placeholder="例如：gpt-4o" maxlength="120"></label><div class="fingerprint-questions">${sampleLengths.map((length, i) => `<section><header><h3><span>${i + 1}</span>第 ${i + 1} 道数字题</h3><button type="button" class="text-link" data-tool-copy="${i}">复制题目</button></header><details><summary>查看题目 · 要求 ${length} 个数字</summary><p translate="no" lang="zh-CN" data-fingerprint-prompt="${i}">${esc(prompt(i))}</p></details><label class="tool-field">第 ${i + 1} 题的模型回答<textarea name="answer${i}" rows="4" maxlength="20000" placeholder="粘贴模型返回的数字序列…" data-fingerprint-answer="${i}"></textarea></label><p class="fingerprint-answer-status" data-fingerprint-status="${i}">等待粘贴回答</p></section>`).join("")}</div><div class="tool-submit-row"><button type="submit" class="btn primary">分析数字样本 →</button><button type="button" class="text-link" data-tool-action="questions">换一组题目</button></div></form>`;
  }

  function fingerprintPage() {
    return `<header class="fingerprint-heading"><span class="fingerprint-mark">${fingerprintIcon}</span><div class="site-page-heading"><span>MODEL FINGERPRINT <em>独立检测 · 不计综合分</em></span><h1>模型指纹测试</h1><p>通过三道数字题采集回答，观察数字分布与顺序特征，用于独立的模型对照。</p></div><a class="tool-history-link" href="#/check/history">检测历史 ↗</a></header><div class="fingerprint-layout"><section class="fingerprint-panel"><div class="fingerprint-tabs" role="tablist" aria-label="指纹检测方式"><button id="fingerprint-api-tab" type="button" role="tab" aria-selected="true" aria-controls="model-test-form" data-tool-mode="api">API 自动检测</button><button id="fingerprint-manual-tab" type="button" role="tab" aria-selected="false" aria-controls="model-test-manual-form" data-tool-mode="manual" tabindex="-1">手动粘贴回答</button></div><form id="model-test-form" role="tabpanel" aria-labelledby="fingerprint-api-tab"><div class="tool-section-heading"><h2>连接你的模型接口</h2><span>每道题独立请求</span></div><div class="tool-fields">${connectionFields("fingerprint")}</div><p class="tool-form-note">正式检测每轮最多 3 次请求，使用接口默认采样设置。当前仅预览数字样本报告，不发起 API 请求，Key 不写入记录。</p><div class="tool-submit-row"><button type="submit" class="btn primary">开始指纹检测 →</button><button type="button" class="text-link" data-tool-action="example">填入示例</button></div></form>${manualFields()}</section><aside class="fingerprint-guide"><div><span>HOW IT WORKS</span><h2>一次独立的模型对照</h2><ol>${[
      ["获取数字样本", "三次独立对话，记录模型的数字选择。"],
      ["本地对比指纹", "比较数字分布与顺序特征，不使用模型自我介绍。"],
      ["保留检测记录", "结果可下载，不参与能力或综合评分。"],
    ]
      .map(
        ([title, text], i) =>
          `<li><span>0${i + 1}</span><div><h3>${title}</h3><p>${text}</p></div></li>`,
      )
      .join(
        "",
      )}</ol><footer><strong>3</strong><span>道数字题</span><p>GPT / Claude · 独立样本</p></footer></div><p>当前可整理数字分布；真实 API 采集与模型指纹库匹配尚未接入。库外模型与少量样本均不能用于官方身份鉴定。</p></aside></div>`;
  }

  function page(kind) {
    promptVariant = 0;
    return `<article class="model-test" data-tool-kind="${kind}">${toolNav(kind)}<p class="tool-preview-note">界面演示 · 不发送 API 请求，报告中的示例均有标注。</p>${kind === "candy" ? candyPage() : fingerprintPage()}<a class="tool-example-report" href="#/check/${kind}/result?example=1">查看${kind === "candy" ? "糖果测试" : "指纹测试"}示例报告 ↗</a><p id="model-tool-status" class="tool-status" role="status" aria-live="polite"></p><section id="model-test-result" aria-live="polite"></section></article>`;
  }

  function candyReport(count, answers = null) {
    const rows = questions.slice(0, count).map((q, i) => ({
      id: i + 1,
      category: categories[q[0]],
      question: q[1],
      options: q[2],
      answer: q[3],
      sampleAnswer: answers ? answers[i] : i % 5 === 4 ? (q[3] + 1) % 4 : q[3],
      explanation: q[4],
    }));
    const correct = rows.filter((q) => q.answer === q.sampleAnswer).length;
    return {
      example: true,
      tool: "candy",
      version: "kugni-original-20-v1",
      note: "本地固定示例答案，未调用接口。",
      total: count,
      correct,
      score: Math.round((correct / count) * 100),
      questions: rows,
    };
  }

  function readSample(value, expected) {
    const tokens = String(value)
      .trim()
      .split(/[\s,，、;；\[\]]+/)
      .filter(Boolean);
    const valid =
      tokens.length === expected && tokens.every((token) => /^\d$/.test(token));
    return {
      valid,
      count: tokens.length,
      numbers: valid ? tokens.map(Number) : [],
    };
  }

  function fingerprintReport(samples = null) {
    const example = !samples;
    const data =
      samples ||
      sampleLengths.map((length, i) =>
        Array.from(
          { length },
          (_, j) => (j * 7 + i * 3 + Math.floor(j / 13)) % 10,
        ),
      );
    const evidence = data.map((numbers, i) => ({
      question: i + 1,
      count: numbers.length,
      expected: sampleLengths[i],
      distribution: Array.from(
        { length: 10 },
        (_, digit) => numbers.filter((n) => n === digit).length,
      ),
    }));
    return {
      example,
      tool: "fingerprint",
      note: example
        ? "固定数字样本演示，未发送请求。"
        : "仅对粘贴的数字做本地统计，尚未匹配指纹库。",
      conclusion: "指纹库待接入，无法确认模型身份",
      evidence,
    };
  }

  function status(text) {
    document.getElementById("model-tool-status").textContent = text;
  }
  window.KUGNI_MODEL_TEST = {
    page,
    categories,
    sampleLengths,
    prompt,
    readSample,
  };
  return window.KUGNI_MODEL_TEST;
}
