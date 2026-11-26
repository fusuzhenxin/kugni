import assert from "node:assert/strict";
import { test } from "node:test";
import { matchModelProviders } from "../web/src/presentation/model-catalog.mjs";

test("provider matching separates exact variants from ecosystem support", () => {
  const sites = [
    {
      id: "exact",
      models: ["GPT"],
      publicModelTable: { rows: [{ cells: ["gpt-6.2-astra"] }] },
    },
    {
      id: "family",
      models: ["GPT"],
      publicModelTable: { rows: [{ cells: ["gpt-6.2-sol"] }] },
    },
    { id: "other", models: ["Claude"] },
    { id: "empty", models: [] },
  ];
  const result = matchModelProviders({ modelId: "gpt-6.2-astra" }, sites);
  assert.deepEqual(
    result.exact.map((s) => s.id),
    ["exact"],
  );
  assert.deepEqual(
    result.related.map((s) => s.id),
    ["family"],
  );
  assert.equal(result.brand, "GPT");
  const fallback = matchModelProviders({ modelId: "gpt-unlisted" }, sites);
  assert.equal(fallback.exact.length, 0);
  assert.deepEqual(
    fallback.related.map((s) => s.id),
    ["exact", "family"],
  );
});

test("provider matches retain date suffixes and work for custom exact IDs", () => {
  const sites = [
    {
      id: "date",
      models: [],
      publicModelTable: { rows: [{ cells: ["claude-opus-4-5-20251101"] }] },
    },
    { id: "exact", models: ["claude-opus-4.5"] },
    { id: "custom", models: ["private-special"] },
  ];
  const result = matchModelProviders({ modelId: "claude-opus-4-5" }, sites);
  assert.deepEqual(
    result.exact.map((s) => s.id),
    ["exact"],
  );
  assert.deepEqual(
    result.related.map((s) => s.id),
    ["date"],
  );
  assert.deepEqual(
    matchModelProviders({ modelId: "private-special" }, sites).exact.map(
      (s) => s.id,
    ),
    ["custom"],
  );
  assert.deepEqual(matchModelProviders({ modelId: "unrecognized" }, sites), {
    exact: [],
    related: [],
    brand: "",
  });
});
