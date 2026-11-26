/* One-time, deterministic extraction of the approved prototype's presentation.
 * Event listeners, storage mutations and demo execution are never migrated.
 * The output is ordinary imported JavaScript, not runtime eval or a browser snapshot.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../web/node_modules/typescript");
const postcss = require("../web/node_modules/postcss");
const project = path.resolve(__dirname, "..");
const prototype = path.dirname(project);
const output = path.join(project, "web/src/presentation");
if (
  fs.existsSync(path.join(output, "templates/directory.mjs")) &&
  !process.argv.includes("--overwrite")
)
  throw new Error(
    "Presentation sources already exist. Maintain the files in web/src/presentation; --overwrite deliberately discards subsequent UI fixes.",
  );
fs.mkdirSync(path.join(output, "templates"), { recursive: true });
const modules = {
  "header-navigation": "KUGNI_NAVIGATION",
  "site-ui": "KUGNI_SITE",
  "page-art": "KUGNI_PAGE_ART",
  "developer-ui": "KUGNI_DEVELOPERS",
  "workspace-pages": "KUGNI_WORKSPACE",
  "benefits-ui": "KUGNI_BENEFITS",
  "account-ui": "KUGNI_ACCOUNT",
  "points-ui": "KUGNI_POINTS",
  "submission-ui": "KUGNI_SUBMISSION",
  "model-test-ui": "KUGNI_MODEL_TEST",
  "tool-report-ui": "KUGNI_TOOL_REPORTS",
  "demo-price-ui": "KUGNI_PRICE_DEMO",
  "report-share": "KUGNI_REPORT_SHARE",
};
function bodyOf(file) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(prototype, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const call = ast.statements.find(
    (s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression),
  )?.expression;
  let expression = call?.expression;
  if (expression && ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  if (!expression?.body)
    throw new Error("Missing presentation factory: " + file);
  return { ast, body: expression.body };
}
const omitted = new Set([
  "persist",
  "claim",
  "redeem",
  "recordCheck",
  "saveUser",
  "navigate",
  "copy",
  "closeMenu",
  "submit",
  "selectMode",
  "clearKey",
  "open",
  "notify",
  "filterQuestions",
  "mount",
  "filterPicker",
  "exportHistory",
  "runMockCheck",
  "admin",
  "updateDetailModels",
  "calculate",
  "calculateSnapshot",
  "render",
  "modal",
  "toast",
  "rerenderDirectory",
  "setDetailSection",
  "showPlanDetail",
  "showPlanComparison",
  "checkReportPage",
]);
function extract(file, main = false) {
  const { ast, body } = bodyOf(file);
  const statements = [];
  for (const s of body.statements) {
    if (ts.isFunctionDeclaration(s)) {
      if (file === "points-ui.js" && s.name.text === "data") {
        statements.push(
          'function data(){return window.member.points||{balance:0,records:[],tasks:[],rewards:[],lastCheckin:"",proof:{}};}',
        );
        continue;
      }
      if (file === "points-ui.js" && s.name.text === "bind") {
        statements.push("function bind(c){ctx=c;}");
        continue;
      }
      if (file === "points-ui.js" && s.name.text === "taskStatus") {
        statements.push(
          'function taskStatus(t,d){return window.member.points?.tasks?.find(x=>x.id===t.id)?.status||"go";}',
        );
        continue;
      }
      if (
        !omitted.has(s.name.text) ||
        (!main && s.name.text === "render") ||
        (file === "report-share.js" && s.name.text === "open")
      )
        statements.push(s.getText(ast));
    } else if (ts.isVariableStatement(s)) {
      const names = s.declarationList.declarations.map((d) =>
        d.name.getText(ast),
      );
      if (
        main &&
        names.some((n) =>
          [
            "read",
            "write",
            "state",
            "models",
            "planExamples",
            "checkHistory",
            "detailModelViews",
          ].includes(n),
        )
      )
        continue;
      statements.push(s.getText(ast));
    } else if (
      ts.isExpressionStatement(s) &&
      /^(?:Object\.assign\(icons|icons\.|Object\.assign\(brandFiles)/.test(
        s.getText(ast),
      )
    )
      statements.push(s.getText(ast));
  }
  return statements.join("\n\n");
}
for (const [name, key] of Object.entries(modules)) {
  let code = extract(name + ".js");
  // All account state comes from the authenticated API payload.
  if (name === "points-ui") {
    code = code.replace(
      /const rewards=\[[\s\S]*?\];/,
      'const rewards=window.member.points?.rewards?.filter(r=>r.status==="启用").map(r=>({...r,title:r.name,brand:r.brand||"GPT",description:r.description||"",unit:"积分权益"}))||[];',
    );
  }
  if (name === "account-ui")
    code = code
      .replace(
        "settingsTab='profile'",
        "settingsTab=window.view.settingsTab||'profile'",
      )
      .replace(
        "submissionFilter='all'",
        "submissionFilter=window.view.submissionFilter||'all'",
      );
  if (name === "account-ui") {
    code = code.replace(
      '<span class="member-muted">0 位好友</span>',
      '<span class="member-muted">${(ctx.state.invitations||[]).length} 位好友</span>',
    );
    code = code.replace(
      /\$\{empty\('第一位同行的朋友，会是谁？',[\s\S]*?,'invite'\)\}/,
      (match) =>
        '${ctx.state.invitations?.length?ctx.state.invitations.map(row=>`<article class="member-application"><div><strong>${esc(row.name)}</strong><small>${esc(row.date.slice(0,10))}</small></div><span class="member-status">${esc(row.status)}</span></article>`).join(""):' +
        match.slice(2, -1) +
        "}",
    );
    code = code
      .replaceAll(
        "正式开放后，每位有效邀请可获得",
        "每位经平台核验的有效邀请可获得",
      )
      .replaceAll("邀请奖励规则预览 · 尚未开放发奖", "有效邀请经核验后发放")
      .replaceAll("本地预览", "专属邀请")
      .replaceAll("正式功能开放后按规则发放", "有效邀请核验通过后发放")
      .replaceAll(
        "当前仅预览邀请流程，尚未连接真实注册统计。",
        "通过你的链接完成注册的朋友，会显示在这里。",
      )
      .replaceAll(
        "申请与审核状态为当前浏览器内的演示记录。",
        "申请与审核进度与你的账户同步。",
      )
      .replaceAll("正式上线后进入站点目录", "审核通过后进入站点目录");
  }
  if (name === "points-ui")
    code = code.replace(
      "tab='tasks',recordFilter='all',taskFilter='all'",
      "tab=window.view.pointsTab||'tasks',recordFilter=window.view.recordFilter||'all',taskFilter=window.view.taskFilter||'all'",
    );
  if (name === "workspace-pages")
    code = code.replace(
      /(const ui=\{[^;]+;)/,
      "$1\nObject.assign(ui,window.view.workspace||{});",
    );
  if (name === "workspace-pages")
    code = code
      .replace(
        "r.score+'<small> / 100</small>'",
        "(r.score==null?'—':r.score)+'<small> / 100</small>'",
      )
      .replaceAll("11 / 12 通过", "本次执行记录")
      .replaceAll("1 项未通过 · 查看原因", "详情以实际报告为准")
      .replaceAll("401", "失败")
      .replaceAll("仅本次打开期间 · 最多 20 条", "账户记录 · 最近 100 次")
      .replaceAll("本次记录", "账户记录")
      .replaceAll(
        "记录仅保留在当前打开的页面中，刷新后清空；所有评分与耗时为本地模拟，不代表实际服务表现。",
        "执行记录保存在账户中；失败或未评分的项目不按零分处理。",
      )
      .replace(
        /href="#\/check\/result\/\$\{c.esc\(r.id\)\}"/g,
        'href="/tools/history/?execution=${c.esc(r.id)}"',
      )
      .replace(
        "${c.history.length?action(c,glyph.trash+' 清空记录','work-clear-history','','wk-inline'):''}",
        "",
      );
  if (name === "benefits-ui")
    code = code.replace(
      /(const filters=\{[^;]+;)/,
      "$1\nObject.assign(filters,window.view.benefits||{});",
    );
  if (name === "submission-ui")
    code = code.replace(
      /const categories=\[[^;]+;/,
      "const categories=window.KUGNI_CONFIG.categories.map(c=>c.name);",
    );
  if (name === "report-share")
    code = code
      .replace("document.body.append(node)", "window.host.append(node)")
      .replace("logo.src='favicon.svg'", "logo.src='/favicon.svg'")
      .replace(
        "report.example?'本地示例 · 未调用接口':'手动数字统计 · 未匹配指纹库'",
        "report.tool==='candy'?'真实接口答题记录':'数字频数 · 未匹配指纹库'",
      )
      .replaceAll("本轮示例得分", "本轮得分")
      .replaceAll("判定（示例）", "本轮判定")
      .replace(
        "'这是手动粘贴数字的本地统计，不构成模型身份鉴定。'",
        "'有限样本的实测记录，不构成模型身份或持续服务质量鉴定。'",
      );
  if (name === "demo-price-ui") {
    code = code.replace(
      /(const state=\{[^;]+;)/,
      "$1\nObject.assign(state,window.view.pricing||{});",
    );
    code = code.replace(
      "model:data.models[0].id",
      "model:window.view.pricing?.model||data.models[0].id",
    );
    code = code.replace(
      /(const drafts=\{[^;]+;)/,
      "$1\nObject.assign(drafts,window.view.pricing||{});",
    );
  }
  const exports = {
    "header-navigation": "{render,toggle}",
    "site-ui": "{footer,faq,documentPage,business,contactCards}",
    "page-art": "{render,gift}",
    "developer-ui":
      "{page,artwork,clientSlug,prompt,copyButton,installCommand}",
    "workspace-pages":
      "{check,history,saved,compare,picker,historyList,savedList}",
    "benefits-ui": "{page,list,details}",
    "account-ui": "{header,routes}",
    "points-ui": "{page,data,bind}",
    "submission-ui": "{page,socialRow,details}",
    "model-test-ui": "{page,categories,sampleLengths,prompt,readSample}",
    "tool-report-ui": "{page,candyView,fingerprintView,historyPanel,stamp}",
    "demo-price-ui":
      "{page,controls,quote,purchasingPower,summary,ranking,state}",
    "report-share": "{open,paint}",
  }[name];
  fs.writeFileSync(
    path.join(output, "templates", name + ".mjs"),
    `// Approved prototype presentation. API actions live in public-controller.tsx.\nexport default function create(window){\nconst document=window.document; const matchMedia=window.matchMedia; const location=window.location;${name === "report-share" ? "const qrcode=window.qrcode;" : ""}\n${code}\nwindow.${key}=${exports}; return window.${key};\n}\n`,
  );
}
let main = extract("app.js", true);
// Render actual reviewed reports in the approved compact three-card layout.
main = main.replace(
  /const recent=sites\.slice\(0,3\)[^;]+;/,
  'const recent=(window.reports.length?window.reports.slice(0,3).map(r=>({site:sites.find(s=>s.id===r.stationId)||{id:"",name:r.model,logo:"/favicon.svg"},model:r.model,score:r.score,id:r.id})):sites.slice(0,3).map(s=>({site:s,model:s.models[0],score:null,id:null})));',
);
main = main.replace(
  'href="#/site/${s.id}" class="workspace-update"',
  'href="/tools/api-check/reports/${recent.find(r=>r.site===s)?.id}/" class="workspace-update"',
);
main = main
  .replace("模型评分 · 示例数据", "审核通过的公开报告")
  .replace("示例评分 ${score}", "实测评分 ${score}");
main = main.replace(
  "${score}<small> / 100</small>",
  '${score==null?"待检测":score}<small>${score==null?"":" / 100"}</small>',
);
main = main.replace(
  /const fmtLatency = [^;]+;/,
  'const fmtLatency=s=>s.latency==null?"未记录":s.latency>=1000?(s.latency/1000).toFixed(1)+" s":s.latency+" ms";',
);
main = main.replaceAll(
  "s.uptime.toFixed(2)",
  '(s.uptime==null?"—":s.uptime.toFixed(2))',
);
main = main
  .replace("function header(){", "function header(){")
  .replace("$('#header').removeAttribute('data-menu-open');", "")
  .replace("$('#header').innerHTML=", "return ");
main = main.replace(
  "function footer(){$('#footer').innerHTML=",
  "function footer(){return ",
);
main = main.replace(
  "function tray(){$('#compare-tray').innerHTML=",
  "function tray(){return ",
);
main = main
  .replace(
    "function initialQuoteModel(){",
    "function initialQuoteModel(){if(window.view.quote?.model)return window.view.quote.model;",
  )
  .replace(
    "let modelOrder='default',providerQuery='';",
    "let modelOrder='default',providerQuery=window.view.providerQuery||'';",
  );
main = main
  .replaceAll("此处评论仅保存在当前浏览器。", "评价经审核后公开。")
  .replaceAll("还没有本地评价", "还没有公开评价")
  .replaceAll("评价只在本地保存", "评价提交后进入审核");
main = main.replace(
  "const spec=m=>modelSpecs[m.id];",
  'const spec=m=>({publisher:m.brand==="GPT"?"OpenAI":m.brand,output:"未公开",inputs:["文字"],reasoning:null,...modelSpecs[m.id]});',
);
main = main.replace(
  "$${m.input} / $${m.output}",
  '${m.input==null?"未公开报价":"$"+m.input+" / $"+m.output}',
);
main = main.replace(
  /href="#\/check\/result\/\$\{c.esc\(r.id\)\}"/g,
  'href="/tools/history/?execution=${c.esc(r.id)}"',
);
const snapshotBody = bodyOf("app.js").body.statements.find(
  (s) => ts.isFunctionDeclaration(s) && s.name.text === "calculateSnapshot",
);
let snapshot = snapshotBody.getText(bodyOf("app.js").ast);
snapshot =
  "function snapshotResults(){const m=relayModelOptions.find(m=>m.id===quoteView.model);" +
  snapshot
    .slice(snapshot.indexOf("const all="))
    .replace("$('#price-result').innerHTML=", "return ");
main +=
  "\n" +
  snapshot +
  '\nObject.assign(quoteView,window.view.quote||{});Object.assign(modelFilters,window.view.modelFilters||{});Object.assign(planFilters,window.view.planFilters||{});modelOrder=window.view.modelOrder||"default";state.brand=window.view.brand||"全部";selectedPlans=window.view.selectedPlans||[];for(const p of planExamples)planEditorial[p.id]||= {brief:p.description||"查看服务商发布的套餐资料",billing:p.billing||"以服务商说明为准",access:p.access||"详见服务商文档",uses:[],note:"以实际发布信息为准"};';
// The API, rather than template fixtures, supplies all catalogue values.
const setup = `const read=(key,fallback)=>window.member[key]??fallback; const write=()=>{};
const state={saved:[],compare:[],applications:[],reviews:[],user:null,theme:'light',query:'',kind:'全部',payment:'全部',model:'全部',sort:'recommended',view:'list',limit:100,modelQuery:'',brand:'全部',benefit:'全部',...window.member,...window.view};
const models=window.models; const planExamples=window.plans||[]; const checkHistory=window.member.history||[];
const detailModelViews=new Map(window.view.detailViews||[]);
const render=()=>{}; const modal=()=>{}; const toast=()=>{};\n`;
fs.writeFileSync(
  path.join(output, "templates/directory.mjs"),
  `// Pure presentation extracted from the approved front end.\nexport default function create(window){\nconst document=window.document;const matchMedia=window.matchMedia;const localStorage={getItem:()=>null};\n${setup}\n${main}\nreturn {header,footer,tray,home,detail,modelsPage,modelDetail,codingPlans,snapshotPrices,snapshotResults,sourceModelTable,check,checkHistoryPage,benefits,compare,saved,submitPage,account,accountContext,workspaceContext,page,icon,brandIcon,empty,params,esc};\n}\n`,
);
// Shared approved identity and editorial copy. These are data, not running prototype scripts.
const config = require(path.join(prototype, "site-config.js"));
const content = require(path.join(prototype, "page-content.js"));
const routes = require(path.join(prototype, "site-routes.js"));
fs.writeFileSync(
  path.join(output, "approved-content.json"),
  JSON.stringify(
    {
      config,
      pages: content.pages,
      documents: content.documents,
      routes: routes.entries,
    },
    null,
    2,
  ),
);
const html = fs.readFileSync(path.join(prototype, "index.html"), "utf8");
const sheets = [...html.matchAll(/href="([^"?]+\.css)/g)].map((m) => m[1]);
for (const sheet of sheets) {
  const ast = postcss.parse(
    fs.readFileSync(path.join(prototype, sheet), "utf8"),
  );
  ast.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name))
      return;
    rule.selector = rule.selector.replace(
      /:root|(?<![\w-])(?:html|body)(?![\w-])/g,
      ":scope",
    );
  });
  const scoped = `/* Migrated from ${sheet}; public site only. */\n@scope (.public-site) {\n${ast.toString()}\n}\n`;
  fs.mkdirSync(path.join(output, "styles"), { recursive: true });
  fs.writeFileSync(path.join(output, "styles", sheet), scoped);
}
fs.writeFileSync(
  path.join(output, "approved.css"),
  sheets.map((s) => `@import "./styles/${s}";`).join("\n") + "\n",
);
require("./build-platform-styles.cjs");
fs.cpSync(
  path.join(prototype, "assets"),
  path.join(project, "web/public/assets"),
  { recursive: true },
);
for (const f of [
  "stations.md",
  "methodology.md",
  "pricing.md",
  "llms-full.txt",
])
  fs.copyFileSync(path.join(prototype, f), path.join(project, "web/public", f));
for (const dir of ["agent-kit", "data"])
  fs.cpSync(path.join(prototype, dir), path.join(project, "web/public", dir), {
    recursive: true,
  });
console.log(
  "Migrated approved presentation, scoped styles and local artwork. No prototype event handlers installed.",
);
