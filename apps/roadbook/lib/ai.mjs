// AI 规划：调用 Claude，输出固定格式 JSON（回复 + 方案 + 标准路书），并用核心校验器把关、必要时让模型自我修正一次。
import Anthropic from "@anthropic-ai/sdk";
import core from "../public/core.js";
import { config } from "../config/index.mjs";

export class AIError extends Error {
  constructor(code, status, userMessage) { super(code); this.code = code; this.status = status; this.userMessage = userMessage; }
}

const nullable = (s) => ({ anyOf: [s, { type: "null" }] });
const str = { type: "string" };
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const LEG = obj({ mode: { type: "string", enum: Object.keys(core.MODES) }, summary: str, minutes: { type: "integer" }, fare: nullable({ type: "integer" }) });
const STOP = obj({
  id: str, name: str, nameLocal: str, kind: { type: "string", enum: core.KINDS }, lat: { type: "number" }, lng: { type: "number" },
  arrive: nullable(str), depart: nullable(str), fixed: { type: "boolean" }, optional: { type: "boolean" }, minStay: nullable({ type: "integer" }),
  lastDeparture: nullable(str), hours: nullable(obj({ open: str, close: str })), legIn: nullable(LEG),
  tips: { type: "array", items: str }, mustBuy: nullable(str), photo: nullable(str), tags: { type: "array", items: str }
});
const ROADBOOK = obj({
  title: str, subtitle: str, tz: str, status: { type: "string", enum: ["draft", "final"] },
  days: { type: "array", items: obj({ id: str, date: str, label: str, variants: { type: "array", items: obj({ id: str, name: str, when: str, stops: { type: "array", items: STOP } }) } }) }
});
export const RESPONSE_SCHEMA = obj({
  reply: str,
  proposals: { type: "array", items: obj({ id: str, title: str, summary: str, highlights: { type: "array", items: str }, durationText: str, costText: str, walkKm: { type: "number" }, risk: str }) },
  roadbook: nullable(ROADBOOK),
  quickReplies: { type: "array", items: str }
});

let client = null;
const getClient = () => (client ||= new Anthropic({ timeout: config.ai.timeoutMs, maxRetries: 2 }));

function lastUserWithState(text, roadbook, context) {
  return text + "\n\n【当前路书 JSON】\n" + (roadbook ? JSON.stringify(core.compactForAI(roadbook)) : "（还没有路书）") + "\n\n" + core.contextBlock(context);
}

async function callModel(messages) {
  const params = {
    model: config.ai.model,
    max_tokens: config.ai.maxTokens,
    system: [{ type: "text", text: core.PLANNER_RULES, cache_control: { type: "ephemeral" } }],
    output_config: { effort: config.ai.effort, format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    messages
  };
  if (config.ai.fallbacks) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
  try {
    const stream = getClient().beta.messages.stream(params);
    return await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("AI_AUTH", 503, "AI 服务密钥无效，请联系管理员");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("AI_RATE_LIMIT", 429, "AI 太忙了，请稍后再试");
    if (e instanceof Anthropic.BadRequestError) throw new AIError("AI_BAD_REQUEST", 502, "AI 请求格式有误，已记录");
    if (e instanceof Anthropic.APIConnectionError) throw new AIError("AI_UNREACHABLE", 502, "连不上 AI 服务，请检查网络后重试");
    if (e instanceof Anthropic.APIError) throw new AIError("AI_UPSTREAM", 502, "AI 服务暂时出错，请稍后再试");
    throw e;
  }
}

// messages: [{role:'user'|'assistant', content:string}]，最后一条必须是 user
export async function planChat({ messages, roadbook, context }) {
  const turns = messages.map((m, i) => ({ role: m.role, content: i === messages.length - 1 ? lastUserWithState(m.content, roadbook, context) : m.content }));
  let issues = [];
  for (let round = 0; round <= config.ai.maxRepairRounds; round++) {
    const msg = await callModel(turns);
    if (msg.stop_reason === "refusal") throw new AIError("AI_REFUSED", 422, "这个请求 AI 无法处理，换个说法试试");
    if (msg.stop_reason === "max_tokens") throw new AIError("AI_TRUNCATED", 502, "路书太长被截断了，请分天规划");
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = core.extractJSON(text); }
    if (!parsed) throw new AIError("AI_BAD_OUTPUT", 502, "AI 返回的内容无法解析，请重试");
    const out = core.coerceAIResult(parsed);
    if (out.roadbook) {
      out.roadbook = core.mergeAIRoadbook(roadbook, out.roadbook);
      const v = core.validate(out.roadbook);
      issues = v.issues;
      const errors = v.issues.filter((x) => x.level === "error");
      if (errors.length && round < config.ai.maxRepairRounds) {
        turns.push({ role: "assistant", content: msg.content }); // 原样回传（含思考块）
        turns.push({ role: "user", content: "路书校验没有通过，请只修正以下问题，保持其他内容不变，重新输出完整 JSON：\n" + errors.map((x) => "- " + x.message).join("\n") });
        continue;
      }
    }
    return { ...out, issues, model: msg.model, usage: { input: msg.usage?.input_tokens ?? null, output: msg.usage?.output_tokens ?? null, cacheRead: msg.usage?.cache_read_input_tokens ?? null } };
  }
  throw new AIError("AI_BAD_OUTPUT", 502, "AI 没能生成有效路书，请重试");
}
