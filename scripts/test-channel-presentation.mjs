import assert from "node:assert/strict";
import { modelChannelRows, channelTrend, channelToolbar } from "../web/src/presentation/templates/model-channel-ui.mjs";

const collectedAt = "2026-11-26T08:00:00Z";
const channels = ["GPT-Pro", "GPT-Max"].map((name, i) => ({
  id: String(i), name, modelIds: ["gpt-6.1-sol"],
  history: [{ at: "2026-11-26T07:00:00Z", status: i ? "异常" : "正常" }],
}));
const site = {
  publicModelTable: { rows: [
    { brand: "GPT", cells: ["gpt-6.1-sol", "公开"] },
    { brand: "GPT", cells: ["gpt-6.2-sol", "公开"] },
  ] },
  channelSnapshot: { collectedAt, channels },
};
const rows = modelChannelRows(site, "model");
assert.equal(rows.length, 3);
assert.deepEqual(rows.filter((r) => r.channel).map((r) => r.group), ["GPT-Pro", "GPT-Max"]);
assert.equal(rows.find((r) => r.cells[0] === "gpt-6.2-sol").channel, undefined);
assert.equal(modelChannelRows(site, "group").length, 2);
const html = channelTrend(channels[0], site.channelSnapshot, "24h", String);
assert.equal((html.match(/channel-segment good/g) || []).length, 1);
assert.equal((html.match(/channel-segment unknown/g) || []).length, 23);
assert.match(html, /采样可用率/);
const aggregate = channelTrend({ windows: { "24h": { successRate: 98.816287 } } }, site.channelSnapshot, "24h", String);
assert.match(aggregate, /98.82%/);
assert.doesNotThrow(() => channelTrend(undefined, undefined, "24h", String));
const noModel = modelChannelRows({ ...site, channelSnapshot: { channels: [{ name: "GPT API", group: "OpenAI" }] } }, "model");
assert.ok(noModel.every((r) => !r.channel));
console.log("Channel presentation: exact models, distinct groups, real gaps, rounded metrics and empty sources passed.");

const rightMetric = channelTrend({ windows: { "24h": { latestAvailability: 98.765 } } }, site.channelSnapshot, "24h", String);
assert.match(rightMetric, /98.77%/);
assert.match(rightMetric, /最近时段可用率/);
assert.match(channelTrend(undefined, undefined, "24h", String), /尚未接入渠道监控/);
assert.match(channelTrend(undefined, {channels: []}, "24h", String), /来源未返回渠道数据/);
assert.match(channelTrend(undefined, site.channelSnapshot, "24h", String), /该型号或分组暂无对应监测/);
assert.match(channelTrend({ reportedStatus: "正常" }, site.channelSnapshot, "24h", String), /来源未提供历史/);
const callSnapshot = { collectedAt, historyKind: "ordered-calls", supportedRanges: ["24h"] };
const callChannel = { note: "近期调用，不是时间轴", windows: { "24h": {
  sampleSuccessRate: 50, sourceUpdatedAt: collectedAt,
  recentCalls: [{modelId:"gpt-a", success:true, latencyMs:100}, {modelId:"gpt-a", success:false, latencyMs:200}],
} } };
const callHtml = channelTrend(callChannel, callSnapshot, "24h", String);
assert.match(callHtml, /近期样本成功率/);
assert.match(callHtml, /data-axis="calls"/);
assert.equal((callHtml.match(/channel-segment unknown/g) || []).length, 58);
assert.equal((callHtml.match(/channel-segment good/g) || []).length, 1);
assert.equal((callHtml.match(/channel-segment bad/g) || []).length, 1);
assert.doesNotMatch(callHtml, /2026-11-26 0\d:\d\d – /);
const callToolbar = channelToolbar({mode:"group",range:"24h"}, callSnapshot, String);
assert.match(callToolbar, /非时间轴/);
assert.doesNotMatch(callToolbar, /data-value="7d"|data-value="30d"/);
const legacyPricing = {
  publicModelTable: { rows: [{ cells: ["gpt-a", "GPT-Pro old", "12"] }] },
  channelSnapshot: { ...callSnapshot, channels: [{ id: "new", name: "GPT-Pro current", modelIds: [], windows: callChannel.windows }],
    modelChannels: [{ id: "sample", name: "GPT-Pro current", modelIds: ["gpt-a"], windows: callChannel.windows }] },
};
for (const mode of ["group", "model"]) {
  const sorted = modelChannelRows(legacyPricing, mode);
  assert.equal(sorted[0].group, "GPT-Pro current");
  assert.ok(sorted[0].channel);
  assert.equal(sorted[1].group, "GPT-Pro old");
  assert.equal(sorted[1].channel, undefined);
  assert.equal(sorted[1].cells[2], "12");
}
const emptyCalls = channelTrend({}, callSnapshot, "24h", String);
assert.match(emptyCalls, /data-axis="calls"/);
assert.equal((emptyCalls.match(/channel-segment unknown/g) || []).length, 60);
assert.doesNotMatch(emptyCalls, /2026-11-26/);
const shortToolbar = channelToolbar({mode:"group",range:"90m"}, {...callSnapshot,supportedRanges:["90m"]},String);
assert.match(shortToolbar, /90分钟/);
assert.doesNotMatch(shortToolbar, /data-value="24h"/);
assert.doesNotMatch(channelToolbar({mode:"group",range:"24h"},{},String), /data-value="90m"/);
