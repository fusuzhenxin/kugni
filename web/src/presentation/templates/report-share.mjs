// Approved prototype presentation. API actions live in public-controller.tsx.
export default function create(window) {
  const t = window.translate || ((value) => value);
  const localize = window.localize || ((value) => value);
  const english = window.locale === "en";
  const document = window.document;
  const matchMedia = window.matchMedia;
  const location = window.location;
  const qrcode = window.qrcode;
  const esc = (value) =>
    String(value).replace(
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

  let dialog = null;

  function close() {
    if (dialog?.open) dialog.close();
  }

  async function copyLink(report, notify) {
    const url = window.KUGNI_TOOL_REPORT_DATA.shareURL(report);
    try {
      await navigator.clipboard.writeText(url);
      notify(t("已复制完整结果链接，不包含接口地址、Key 或原始回答。"));
    } catch {
      open(report, "link");
    }
  }

  function rounded(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawQR(ctx, value, x, y, size) {
    const code = qrcode(0, "M");
    code.addData(value, "Byte");
    code.make();
    const count = code.getModuleCount(),
      pixelSize = Math.max(1, Math.floor((size * 2) / (count + 8))),
      step = pixelSize / 2,
      side = (count + 8) * step;
    const left = Math.round((x + (size - side) / 2) * 2) / 2,
      top = Math.round((y + (size - side) / 2) * 2) / 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = "#122137";
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (code.isDark(row, col))
          ctx.fillRect(
            left + (col + 4) * step,
            top + (row + 4) * step,
            step,
            step,
          );
  }

  function text(ctx, value, x, y, size = 16, color = "#17253c", weight = 400) {
    ctx.font = `${weight} ${size}px "Segoe UI","Microsoft YaHei",sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(t(String(value)), x, y, Math.max(60, 560 - x));
  }

  function wrap(
    ctx,
    value,
    x,
    y,
    width,
    size = 14,
    color = "#64748b",
    lineHeight = 23,
    maxLines = 4,
  ) {
    ctx.font = `400 ${size}px "Segoe UI","Microsoft YaHei",sans-serif`;
    let line = "",
      row = 0;
    const translated = t(String(value));
    const chunks = english ? translated.split(/(\s+)/) : [...translated];
    for (const char of chunks) {
      if (ctx.measureText(line + char).width > width && line) {
        text(ctx, line.trimEnd(), x, y + row * lineHeight, size, color);
        row++;
        line = "";
        if (row >= maxLines) return;
      }
      line += line ? char : char.trimStart();
    }
    if (line) text(ctx, line, x, y + row * lineHeight, size, color);
  }

  function clipped(ctx, value, max) {
    let result = t(String(value));
    while (ctx.measureText(result).width > max && result.length > 1)
      result = result.slice(0, -1);
    return result === t(String(value)) ? result : result + "…";
  }

  function line(ctx, y) {
    ctx.strokeStyle = "#e5eaf2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(560, y);
    ctx.stroke();
  }

  async function paint(canvas, report, url) {
    await document.fonts.ready;
    canvas.width = 1200;
    canvas.height = 1840;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.fillStyle = "#f0f4fa";
    ctx.fillRect(0, 0, 600, 920);
    rounded(ctx, 18, 18, 564, 884, 20, "#ffffff", "#e1e8f2");
    const gradient = ctx.createLinearGradient(18, 18, 582, 176);
    gradient.addColorStop(0, "#edf4ff");
    gradient.addColorStop(1, "#f6faff");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(18, 18, 564, 884, 20);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(18, 18, 564, 156);
    ctx.restore();
    const logo = new Image();
    logo.src = "/favicon.svg";
    await logo.decode();
    ctx.drawImage(logo, 40, 34, 29, 29);
    text(ctx, "UGNI", 76, 60, 21, "#17253c", 750);
    text(
      ctx,
      report.tool === "candy" ? "真实接口答题记录" : "数字频数 · 未匹配指纹库",
      285,
      58,
      13,
      "#526782",
    );
    text(
      ctx,
      report.tool === "candy" ? "糖果测试报告" : "模型指纹测试报告",
      40,
      109,
      28,
      "#17253c",
      650,
    );
    ctx.font = '500 17px "Segoe UI","Microsoft YaHei",sans-serif';
    text(
      ctx,
      clipped(ctx, report.model || "未填写模型", 500),
      40,
      143,
      17,
      "#425c80",
      500,
    );
    text(
      ctx,
      window.KUGNI_TOOL_REPORTS.stamp(report.at) + " UTC+8",
      40,
      194,
      13,
      "#77859a",
    );
    if (report.tool === "candy") {
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#e8eff9";
      ctx.beginPath();
      ctx.arc(105, 268, 51, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#2563eb";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(
        105,
        268,
        51,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * report.score) / 100,
      );
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.textAlign = "center";
      text(ctx, report.score, 105, 275, 38, "#2563eb", 650);
      text(ctx, "/ 100", 105, 298, 13, "#77859a");
      ctx.textAlign = "left";
      text(ctx, "本轮得分", 185, 246, 15, "#64748b");
      text(
        ctx,
        report.score === 100 ? "本轮全部答对" : "有题目需要留意",
        185,
        278,
        24,
        "#17253c",
        600,
      );
      text(
        ctx,
        report.total + " 道固定选择题 · 四项能力分别看",
        185,
        307,
        14,
        "#77859a",
      );
      line(ctx, 342);
      [
        ["答对", report.correct + " / " + report.total],
        ["题目正确率", report.score + "%"],
        ["本轮判定", report.score === 100 ? "正常" : "需留意"],
      ].forEach(([label, value], index) => {
        text(ctx, label, 40 + index * 178, 373, 14, "#77859a");
        text(ctx, value, 40 + index * 178, 406, 24, "#17253c", 600);
      });
      line(ctx, 428);
      text(ctx, "维度得分", 40, 462, 17, "#17253c", 600);
      window.KUGNI_MODEL_TEST.categories.forEach((name, index) => {
        const rows = report.questions.filter(
            (question) => question.category === name,
          ),
          correct = rows.filter(
            (question) => question.answer === question.sampleAnswer,
          ).length,
          score = rows.length ? Math.round((correct / rows.length) * 100) : 0,
          y = 500 + index * 38;
        text(ctx, name, 40, english ? y - 5 : y, 14, "#526782");
        const barX = english ? 40 : 140;
        const barY = english ? y + 7 : y - 9;
        const barWidth = english ? 400 : 300;
        rounded(ctx, barX, barY, barWidth, 6, 3, "#eef2f8");
        if (score)
          rounded(
            ctx,
            barX,
            barY,
            (barWidth * score) / 100,
            6,
            3,
            ["#2563eb", "#0d9488", "#8b5cf6", "#e59a23"][index],
          );
        text(
          ctx,
          rows.length ? score + " 分" : "未覆盖",
          465,
          english ? y + 12 : y,
          14,
          "#526782",
          500,
        );
      });
    } else {
      text(
        ctx,
        report.example ? "固定演示候选 · 非实际匹配" : "数字样本已整理",
        40,
        237,
        14,
        "#77859a",
      );
      text(
        ctx,
        report.example
          ? "gpt-6.1-sol"
          : report.fingerprint?.matchedModel || "暂无可靠匹配",
        40,
        275,
        28,
        "#17253c",
        650,
      );
      text(
        ctx,
        report.example
          ? "51.0%"
          : report.fingerprint?.matchedModel
            ? report.fingerprint.candidates[0].similarity + "%"
            : "—",
        40,
        332,
        44,
        "#2563eb",
        650,
      );
      text(
        ctx,
        report.example ? "演示相对概率" : "候选相似度 · 非身份概率",
        40,
        356,
        13,
        "#77859a",
      );
      const valid = report.evidence.filter((item) => item.count).length;
      text(
        ctx,
        report.example ? "家族对照（示例）" : "有效回答",
        340,
        308,
        14,
        "#77859a",
      );
      text(
        ctx,
        report.example ? "GPT · 79.0%" : valid + " / 3",
        340,
        338,
        22,
        "#17253c",
        600,
      );
      line(ctx, 380);
      text(
        ctx,
        report.example ? "候选模型对照（布局示例）" : "三道题的数字样本",
        40,
        414,
        17,
        "#17253c",
        600,
      );
      if (report.example) {
        window.KUGNI_TOOL_REPORTS.demoCandidates
          .slice(0, 5)
          .forEach(([model, , percent], index) => {
            const y = 455 + index * 34;
            text(ctx, String(index + 1).padStart(2, "0"), 40, y, 13, "#94a3b8");
            text(ctx, model, 77, y, 15, "#425c80");
            text(ctx, percent.toFixed(1) + "%", 480, y, 15, "#2563eb", 550);
          });
      } else {
        report.evidence.forEach((item, index) => {
          const y = 457 + index * 43;
          text(ctx, "第 " + item.question + " 题", 40, y, 15, "#425c80");
          text(
            ctx,
            item.count + " / " + item.expected + " 个数字",
            174,
            y,
            15,
            "#17253c",
            500,
          );
          text(ctx, item.count ? "已计入" : "未提供", 460, y, 14, "#77859a");
        });
        wrap(
          ctx,
          "仅统计数字分布，不包含原始回答；未生成候选身份或匹配概率。",
          40,
          605,
          480,
          14,
          "#77859a",
          23,
          2,
        );
      }
    }
    line(ctx, 650);
    text(ctx, "打开链接 / 扫码查看完整结果", 40, 688, 16, "#17253c", 600);
    wrap(
      ctx,
      report.example
        ? "这是固定示例报告，不代表真实接口的模型质量、身份或稳定性。"
        : "有限样本的实测记录，不构成模型身份或持续服务质量鉴定。",
      40,
      720,
      320,
      14,
      "#64748b",
      24,
      3,
    );
    text(ctx, "链接与海报不包含 API Key", 40, 806, 13, "#64748b");
    drawQR(ctx, url, 390, 671, 170);
    text(ctx, "扫码查看本轮报告", 412, 860, 12, "#77859a");
    text(ctx, "www.kugni.com", 40, 872, 14, "#2563eb", 600);
    canvas.dataset.ready = "true";
  }

  function open(report, mode = "poster", returnFocus = document.activeElement) {
    close();
    const url = window.KUGNI_TOOL_REPORT_DATA.shareURL(report),
      local = ["127.0.0.1", "localhost"].includes(location.hostname);
    const node = document.createElement("dialog");
    dialog = node;
    node.className = "report-share-dialog";
    node.setAttribute("aria-labelledby", "report-share-title");
    node.innerHTML = localize(
      `<header><div><h2 id="report-share-title">${mode === "poster" ? "分享检测海报" : "复制结果链接"}</h2><p>打开链接或扫描二维码，即可查看本轮结果。</p></div><button type="button" class="report-share-close" data-share-action="close" aria-label="关闭分享弹窗">×</button></header><canvas class="report-share-canvas" role="img" aria-label="${report.tool === "candy" ? "糖果测试" : "模型指纹测试"}分享海报" ${mode === "link" ? "hidden" : ""}></canvas><label class="report-share-link">结果链接<input readonly aria-label="完整结果链接" value="${esc(url)}" spellcheck="false"></label><div class="report-share-actions"><button type="button" class="report-button" data-share-action="copy">复制链接</button><a class="report-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开报告</a><button type="button" class="report-button" data-share-action="image" ${mode === "link" ? "hidden" : ""}>复制图片</button><button type="button" class="report-button report-button-primary" data-share-action="${mode === "poster" ? "download" : "poster"}">${mode === "poster" ? "下载海报" : "生成海报"}</button></div><p id="report-share-status" role="status" aria-live="polite"></p><p class="report-share-note">分享仅包含模型名称与结果统计，不包含接口地址、Key 或原始回答。 ${local ? "当前是本地预览，链接需在能够访问当前地址的环境中打开。" : ""}</p>`,
    );
    const canvas = node.querySelector("canvas"),
      status = node.querySelector("#report-share-status");
    let ready = null;
    node.addEventListener("close", () => {
      node.remove();
      if (dialog === node) {
        dialog = null;
        if (returnFocus?.isConnected)
          returnFocus.focus({ preventScroll: true });
      }
    });
    node.addEventListener("click", async (event) => {
      if (event.target === node) {
        const rect = node.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          node.close();
        return;
      }
      const button = event.target.closest("[data-share-action]");
      if (!button) return;
      const action = button.dataset.shareAction;
      if (action === "close") {
        node.close();
        return;
      }
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(url);
          status.textContent = t("完整结果链接已复制");
          button.textContent = t("已复制链接");
        } catch {
          node.querySelector("input").select();
          status.textContent = t("请复制已选中的完整链接");
        }
        return;
      }
      if (action === "poster") {
        node.close();
        open(report, "poster", returnFocus);
        return;
      }
      if (action === "download" || action === "image") {
        button.disabled = true;
        try {
          await ready;
          const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!blob) throw Error("海报未生成");
          if (action === "image") {
            if (!window.ClipboardItem || !navigator.clipboard?.write)
              throw Error("当前浏览器不支持复制图片，请下载海报");
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
              ]);
            } catch {
              throw Error("复制图片未获允许，请下载海报");
            }
            status.textContent = t("海报图片已复制");
          } else {
            const objectURL = URL.createObjectURL(blob),
              link = document.createElement("a");
            link.href = objectURL;
            link.download =
              "KUGNI-" +
              (report.tool === "candy" ? "糖果测试" : "模型指纹测试") +
              "-分享海报.png";
            link.click();
            setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
            status.textContent = t("海报已下载");
          }
        } catch (error) {
          status.textContent = t(error.message || "海报生成失败，请重试");
        } finally {
          button.disabled = false;
        }
      }
    });
    node
      .querySelector("input")
      .addEventListener("focus", (event) => event.target.select());
    window.host.append(node);
    node.showModal();
    if (mode === "poster") {
      status.textContent = t("正在生成海报…");
      ready = paint(canvas, report, url)
        .then(() => {
          if (node.isConnected)
            status.textContent = t("海报已生成，可下载或复制图片");
        })
        .catch(() => {
          status.textContent = t("海报生成失败，请重新打开弹窗");
          throw Error("海报生成失败");
        });
      ready.catch(() => {});
    }
  }
  window.KUGNI_REPORT_SHARE = { open, paint };
  return window.KUGNI_REPORT_SHARE;
}
