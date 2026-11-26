import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalizer, localePath, splitLocale } from "../web/src/presentation/localization.mjs";

test("locale paths preserve queries, assets, endpoints and workspace boundaries", () => {
  assert.deepEqual(splitLocale("/en/models/openai/"), { locale: "en", path: "/models/openai/" });
  assert.equal(localePath("/stations/?model=GPT", "en"), "/en/stations/?model=GPT");
  assert.equal(localePath("/en/stations/?model=GPT", "zh-CN"), "/stations/?model=GPT");
  for (const path of ["/api/v1/auth/", "/admin/login/", "/publisher/dashboard/", "/favicon.svg", "/assets/icon.png", "https://example.com/", "//example.com/"]) assert.equal(localePath(path, "en"), path);
});

test("HTML translation protects original evidence, nested prompts and submitted enum values", () => {
  const l = createLocalizer("en", { "原始答案": "Original answer", "显示": "Show" });
  const result = l.html('<label title="显示">显示</label><select><option>显示</option></select><section translate="no"><b>原始答案</b><p>原始答案</p></section><pre>原始答案</pre><a href="/models/">显示</a>', true);
  assert.match(result, /<option value="显示">Show<\/option>/);
  assert.match(result, /<section translate="no"><b>原始答案<\/b><p>原始答案<\/p><\/section>/);
  assert.match(result, /<pre>原始答案<\/pre>/);
  assert.match(result, /href="\/en\/models\/">Show/);
  assert.equal(l.missing.size, 0);
});

test("untranslated and stale sources keep English pages out of the index", () => {
  const l = createLocalizer("en", { "已知句子": "Known sentence" }, ["已知句子"]);
  assert.equal(l.text("已知句子", true), "Known sentence");
  assert.equal(l.text("完全未见过的新资料", true), "完全未见过的新资料");
  assert.deepEqual([...l.missing], ["已知句子", "完全未见过的新资料"]);
});

test("large model pagination translates generated totals without weakening evidence protection", () => {
  const l = createLocalizer("en");
  assert.equal(l.text("第 1 / 41 页 · 每页 12 条", true), "Page 1 of 41 · 12 per page");
  assert.equal(l.text("第 41 页", true), "Page 41");
  assert.equal(l.missing.size, 0);
});
