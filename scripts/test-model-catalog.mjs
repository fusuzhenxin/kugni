import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { modelBrands, modelBrand, collectModelChoices, configuredModelChoices, renderModelField } from "../web/src/presentation/model-catalog.mjs";

test("all registered brands have a local mark and known families resolve correctly", () => {
  for (const brand of modelBrands) assert.ok(existsSync(new URL(`../web/public/assets/brands/${brand.file}.svg`, import.meta.url)), brand.key);
  for (const [id, key] of [["doubao-seed-2", "豆包"], ["MiniMax-M2", "MiniMax"], ["mimo-v2-flash", "MiMo"], ["meta-llama/Llama-3.3", "Meta"], ["AiHubmix-mistral-medium", "Mistral"], ["text-embedding-3-small", "GPT"], ["text-embedding-004", "Gemini"], ["text-embedding-v4", "Qwen"], ["bge-large-en", "BAAI"], ["grok-4", "Grok"]]) assert.equal(modelBrand(id)?.key, key, id);
  assert.equal(modelBrand("private-unidentified-model"), null);
  assert.equal(modelBrand("embedding-3"), null);
});

test("source choices deduplicate exact IDs and count providers without losing suffixes", () => {
  const payload = { pricing: { source: [
    { station: "a", rows: [{ cells: ["qwen3-max"], ecosystem: "Qwen" }, { cells: ["qwen3-max"], ecosystem: "Qwen" }, { cells: ["qwen3-max-thinking"], ecosystem: "Qwen" }] },
    { station: "b", rows: [{ cells: ["qwen3-max"], ecosystem: "Qwen" }] },
  ] } };
  const choices = collectModelChoices(payload);
  assert.equal(choices.length, 2);
  assert.equal(choices[0].id, "qwen3-max");
  assert.equal(choices[0].providers, 2);
  const html = renderModelField([{ id: '"><script>bad</script>', label: "", brand: "", providers: 0 }], { id: "example", value: "custom-id" });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('name="model"'));
  assert.ok(html.includes('list="example-options"'));
});

test("configured suggestions use common defaults only when absent and keep brand-local ordering", () => {
  const defaults = configuredModelChoices({});
  assert.equal(defaults.length, 52);
  assert.equal(new Set(defaults.map(m => m.id)).size, defaults.length);
  assert.ok(defaults.every(m => m.brand), 'every common model has a recognized brand');
  assert.ok(defaults.some(m => m.id === 'gpt-6.2-astra'));
  assert.ok(defaults.some(m => m.id === 'claude-fable-5-2'));
  assert.ok(!defaults.some(m => m.id.startsWith('gpt-5')));
  assert.deepEqual(configuredModelChoices({ catalog: { modelSuggestions: [] } }), []);
  const modelSuggestions = [
    { modelId: 'claude-test', sort: 0 },
    { modelId: 'gpt-second', sort: 20 },
    { modelId: 'gpt-first', sort: 10 },
    { modelId: 'gpt-first', sort: 30 },
    { modelId: 'private-model', sort: 1 },
  ];
  const choices = configuredModelChoices({ catalog: { modelSuggestions } });
  assert.deepEqual(choices.map(m => m.id), ['gpt-first', 'gpt-second', 'claude-test', 'private-model']);
  assert.equal(choices.at(-1).brand, '');
});
