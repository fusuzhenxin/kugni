// One brand registry for catalog marks, model suggestions and discovered IDs.
import commonModels from "../../../shared/common-models.json" with { type: "json" };

const brands = [
  [
    "GPT",
    "OpenAI",
    "openai",
    /openai|chatgpt|gpt|codex|davinci|dall-e|whisper|^o[134](?:-|$)|^tts-|^sora-|moderation|text-(?:ada|babbage|curie|search-ada)|text-embedding-(?:3-|ada-)/i,
    true,
  ],
  ["Claude", "Claude", "claude", /claude|anthropic/i],
  [
    "Gemini",
    "Gemini",
    "gemini",
    /gemini|gemma|google|imagen|veo|learnlm|nano-banana|text-embedding-004/i,
  ],
  ["DeepSeek", "DeepSeek", "deepseek", /deepseek/i],
  ["Grok", "Grok", "grok", /grok|^xai$/i, true],
  [
    "Qwen",
    "Qwen",
    "qwen",
    /qwen|qwq|qvq|tongyi|wan\d|通义|^gte-|text-embedding-v[14]/i,
  ],
  ["Kimi", "Kimi", "moonshot", /kimi|moonshot|^k[23](?:-|$)/i, true],
  ["GLM", "GLM", "zhipu", /glm|zhipu|cogview|cogvideo|智谱/i],
  [
    "豆包",
    "Doubao",
    "doubao",
    /doubao|豆包|seedance|seedream|seed-|bytedance/i,
  ],
  ["MiniMax", "MiniMax", "minimax", /minimax|abab|hailuo/i],
  ["Meta", "Meta / Llama", "meta", /meta|llama/i],
  ["MiMo", "Xiaomi MiMo", "xiaomimimo", /mimo|xiaomi|小米/i, true],
  [
    "Mistral",
    "Mistral",
    "mistral",
    /mistral|mixtral|codestral|devstral|pixtral|ministral|magistral|voxtral/i,
  ],
  ["Hunyuan", "Hunyuan", "hunyuan", /hunyuan|混元|^hy(?:\d|-)|\/hy\d/i],
  ["StepFun", "StepFun", "stepfun", /stepfun|step-|阶跃/i],
  ["Baichuan", "Baichuan", "baichuan", /baichuan|百川/i],
  ["Yi", "01.AI / Yi", "yi", /^yi(?:-|$)|零一万物/i],
  ["Cohere", "Cohere", "cohere", /cohere|^command(?:-|$)/i],
  ["NVIDIA", "NVIDIA", "nvidia", /nvidia|nemotron/i],
  [
    "Microsoft",
    "Microsoft / Phi",
    "microsoft",
    /microsoft|(?:^|[-/])phi-|mai-/i,
  ],
  ["Jina", "Jina AI", "jina", /jina/i, true],
  ["FLUX", "FLUX", "flux", /flux|black-forest/i, true],
  [
    "Stability",
    "Stability AI",
    "stability",
    /stability|stable[-_ ]?diffusion|^sd[ -]?3/i,
  ],
  ["Ideogram", "Ideogram", "ideogram", /ideogram/i, true],
  ["Recraft", "Recraft", "recraft", /recraft/i, true],
  ["Midjourney", "Midjourney", "midjourney", /midjourney|^mj-/i, true],
  ["Kling", "Kling", "kling", /kling|可灵/i],
  ["Vidu", "Vidu", "vidu", /vidu/i],
  ["LongCat", "LongCat", "longcat", /longcat/i],
  ["Bilibili", "Bilibili / Index", "bilibili", /bilibili|^index-/i],
  ["Suno", "Suno", "suno", /suno|chirp-/i, true],
  [
    "ERNIE",
    "Baidu ERNIE",
    "wenxin",
    /ernie|wenxin|文心|qianfan|paddleocr|pp-structure|bce-reranker/i,
  ],
  ["Perplexity", "Perplexity", "perplexity", /perplexity|sonar/i],
  ["BAAI", "BAAI / BGE", "baai", /(?:^|\/)bge-/i],
  ["AI21", "AI21 / Jamba", "ai21", /ai21|jamba/i, true],
  ["Cursor", "Cursor", "cursor", /cursor/i, true],
  ["Upstage", "Upstage / Solar", "upstage", /upstage|^solar-/i],
  ["Liquid", "Liquid AI", "liquid", /liquid|^lfm-/i, true],
  ["Inception", "Inception / Mercury", "inception", /inception|mercury/i, true],
  ["InternLM", "InternLM", "internlm", /internlm|^intern-/i],
];

export const modelBrands = brands.map(([key, label, file, pattern, mono]) => ({
  key,
  label,
  file,
  pattern,
  mono: Boolean(mono),
}));
const escape = (value) =>
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

export function modelBrand(value, hint = "") {
  const exact = modelBrands.find((b) => b.key === value || b.label === value);
  return (
    exact ||
    modelBrands.find((b) => b.pattern.test(String(value))) ||
    modelBrands.find((b) => b.key === hint || b.label === hint) ||
    null
  );
}

export function modelBrandIcon(value, cls = "brand-icon", hint = "") {
  const brand = modelBrand(value, hint);
  return brand
    ? `<img class="${escape(cls)}" data-model-brand="${escape(brand.key)}"${brand.mono ? " data-brand-mono" : ""} src="/assets/brands/${brand.file}.svg" alt="${escape(brand.label)}" width="20" height="20">`
    : "";
}

// Suggestions are published source IDs, not a promise of access for a given Key.
const brandOrder = new Map(
  modelBrands.map((brand, index) => [brand.key, index]),
);

// Keep each brand together, preserving the existing order within that brand.
// The registry defines GPT, Claude, Gemini, ...; unidentified models follow last.
export function groupModelChoices(choices) {
  const rank = (choice) =>
    brandOrder.get(choice.brand || modelBrand(choice.id)?.key) ??
    modelBrands.length;
  return [...choices].sort((a, b) => rank(a) - rank(b));
}

// An explicitly empty configured list means no suggestions, not all source models.
// Defaults only support deployment while the API is being upgraded.
export function configuredModelChoices(payload) {
  const configured = payload.catalog?.modelSuggestions;
  const rows = Array.isArray(configured)
    ? configured
    : commonModels.map((modelId, sort) => ({ modelId, sort }));
  const seen = new Set();
  return groupModelChoices(
    [...rows]
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .flatMap((row) => {
        const id = String(row.modelId || "").trim();
        if (!id || seen.has(id)) return [];
        seen.add(id);
        const brand = modelBrand(id);
        return [
          {
            id,
            brand: brand?.key || "",
            label: brand?.label || "",
            providers: 0,
          },
        ];
      }),
  );
}

// Keep the exact provider ID: prefixes and suffixes can change routing.
export function collectModelChoices(payload) {
  const entries = new Map();
  const add = (id, hint = "", station = "") => {
    id = String(id || "").trim();
    if (!id || id.length > 300) return;
    const brand = modelBrand(id, hint);
    const entry = entries.get(id) || {
      id,
      brand: brand?.key || "",
      label: brand?.label || "",
      stations: new Set(),
    };
    if (station) entry.stations.add(station);
    entries.set(id, entry);
  };
  for (const source of payload.pricing?.source || [])
    for (const row of source.rows || [])
      add(row.cells?.[0], row.ecosystem || row.brand, source.station);
  for (const station of payload.stations || [])
    for (const row of station.sourcePricing?.rows || [])
      add(row.cells?.[0], row.ecosystem || row.brand, station.slug);
  for (const row of payload.pricing?.items || [])
    add(row.modelId, row.vendor, row.station);
  return groupModelChoices(
    [...entries.values()]
      .sort(
        (a, b) => b.stations.size - a.stations.size || a.id.localeCompare(b.id),
      )
      .map(({ stations, ...entry }) => ({
        ...entry,
        providers: stations.size,
      })),
  );
}

export function renderModelField(
  choices,
  { id, value = "", label = "目标模型" },
) {
  const listId = id + "-options";
  return `<div class="public-model-field" data-model-field><span class="public-model-mark" data-model-mark>${modelBrandIcon(value)}</span><input id="${escape(id)}" name="model" data-model-picker required value="${escape(value)}" list="${listId}" placeholder="搜索或填写模型 ID" aria-label="${escape(label)}" maxlength="300" autocomplete="off" spellcheck="false"><datalist id="${listId}">${choices.map((m) => `<option value="${escape(m.id)}" data-brand="${escape(m.brand)}" label="${escape(m.label)}"></option>`).join("")}</datalist></div>`;
}

// Exact IDs preserve variants and dates. Ecosystem matches are kept separate.
export function matchModelProviders(model, sites) {
  const identity = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[._]/g, "-");
  const target = identity(model.modelId);
  const brand =
    modelBrand(model.modelId) ||
    modelBrand(model.organization?.organizationId) ||
    modelBrand(model.organization?.nameEn);
  const exact = [],
    related = [];
  for (const site of sites) {
    const ids = [
      ...(site.models || []),
      ...(site.publicModelTable?.rows || []).map((row) => row.cells?.[0]),
    ];
    if (target && ids.some((id) => identity(id) === target)) exact.push(site);
    else if (brand && ids.some((id) => modelBrand(id)?.key === brand.key))
      related.push(site);
  }
  return { exact, related, brand: brand?.key || "" };
}
