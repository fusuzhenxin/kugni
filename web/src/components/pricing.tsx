"use client";
import { useMemo, useState } from "react";
import type { Entity } from "@/lib/types";
import { text } from "@/lib/types";
import { Empty, Icon } from "./ui";

export function PricingCalculator({ quotes }: { quotes: Entity[] }) {
  const [mode, setMode] = useState("budget"),
    [budget, setBudget] = useState(100),
    [scenario, setScenario] = useState("coding"),
    [cache, setCache] = useState(0),
    [input, setInput] = useState(100000),
    [output, setOutput] = useState(20000),
    [days, setDays] = useState(30),
    [model, setModel] = useState("");
  const models = [...new Set(quotes.map((q) => String(q.modelId)))],
    ratio = scenario === "writing" ? 0.25 : scenario === "context" ? 0.95 : 0.8;
  const rows = useMemo(
    () =>
      quotes
        .filter(
          (q) =>
            (!model || q.modelId === model) &&
            q.currency === "CNY" &&
            ["百万 Token", "千 Token"].includes(String(q.unit)),
        )
        .map((q) => {
          const unit = q.unit === "千 Token" ? 1000 : 1_000_000;
          const cachedPrice = cache > 0 ? Number(q.cache) : 0;
          if (cache > 0 && (q.cache == null || q.cache === ""))
            return { q, value: null };
          if (
            q.input == null ||
            q.input === "" ||
            q.output == null ||
            q.output === ""
          )
            return { q, value: null };
          const inputPrice = Number(q.input),
            outputPrice = Number(q.output),
            multiplier =
              q.multiplier == null || q.multiplier === ""
                ? 1
                : Number(q.multiplier);
          if (
            ![inputPrice, outputPrice, cachedPrice, multiplier].every(
              Number.isFinite,
            ) ||
            multiplier <= 0
          )
            return { q, value: null };
          const weighted =
            ((inputPrice * (1 - cache / 100) + (cachedPrice * cache) / 100) *
              ratio +
              outputPrice * (1 - ratio)) *
            multiplier;
          const value =
            mode === "budget"
              ? weighted > 0
                ? (budget / weighted) * unit
                : null
              : ((input *
                  ((1 - cache / 100) * inputPrice +
                    (cache / 100) * cachedPrice) +
                  output * outputPrice) /
                  unit) *
                multiplier *
                days;
          return { q, value };
        }),
    [quotes, model, ratio, mode, budget, input, output, cache, days],
  );
  return (
    <>
      <div className="calculator">
        <div className="segmented">
          {[
            ["budget", "按预算估算"],
            ["custom", "自定义用量"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="calculator-fields">
          <label>
            模型
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">全部已录入型号</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {mode === "budget" ? (
            <>
              <label>
                每月预算（元）
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={budget}
                  onChange={(e) =>
                    setBudget(Math.max(0, Number(e.target.value)))
                  }
                />
              </label>
              <label>
                主要用途
                <select
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                >
                  <option value="coding">编程开发 · 输入约 80%</option>
                  <option value="writing">内容写作 · 输入约 25%</option>
                  <option value="context">长上下文 · 输入约 95%</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                每日输入 Token
                <input
                  type="number"
                  min={0}
                  value={input}
                  onChange={(e) =>
                    setInput(Math.max(0, Number(e.target.value)))
                  }
                />
              </label>
              <label>
                每日输出 Token
                <input
                  type="number"
                  min={0}
                  value={output}
                  onChange={(e) =>
                    setOutput(Math.max(0, Number(e.target.value)))
                  }
                />
              </label>
              <label>
                每月使用天数
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={days}
                  onChange={(e) =>
                    setDays(Math.min(31, Math.max(1, Number(e.target.value))))
                  }
                />
              </label>
            </>
          )}
          <label>
            输入缓存命中率（%）
            <input
              type="number"
              min={0}
              max={100}
              value={cache}
              onChange={(e) =>
                setCache(Math.min(100, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
        </div>
        <p className="source-note">
          <Icon name="help" size={14} />
          预算模式按用途预设输入／输出比例估算，不代表固定调用次数；自定义模式使用实际
          Token。缓存属于输入的一部分。
        </p>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>服务商 / 模型</th>
                <th>输入 / 输出</th>
                <th>缓存命中</th>
                <th>{mode === "budget" ? "预估可用总 Token" : "预估月费用"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ q, value }) => (
                <tr key={q.id}>
                  <td>
                    <strong>{text(q.stationName || q.station)}</strong>
                    <small>{text(q.modelId)}</small>
                  </td>
                  <td>
                    ¥{text(q.input)} / ¥{text(q.output)}
                    <small>每{text(q.unit)}</small>
                  </td>
                  <td>{q.cache == null ? "未公开" : "¥" + text(q.cache)}</td>
                  <td>
                    {value == null
                      ? "缺少可计算价格"
                      : mode === "budget"
                        ? (value / 1_000_000).toFixed(2) + " M"
                        : "¥" + value.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="还没有可统一计算的报价"
          description="需要明确型号、币种、输入输出价格和计费单位后才能计算；来源分组倍率不会冒充 Token 单价。"
        />
      )}
    </>
  );
}
