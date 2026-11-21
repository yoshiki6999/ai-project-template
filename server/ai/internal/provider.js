// LLM providers. "anthropic" calls the Claude API via the official SDK;
// "mock" returns deterministic demo output (tests / offline demo, clearly labelled).
import Anthropic from '@anthropic-ai/sdk';

export class AiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function createProvider(cfg) {
  if (cfg.provider === 'anthropic') return anthropicProvider(cfg);
  if (cfg.provider === 'mock') return mockProvider();
  return null;
}

function anthropicProvider(cfg) {
  // Credentials resolve from the environment (ANTHROPIC_API_KEY); never hardcoded.
  const client = new Anthropic({ timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
  return {
    name: 'anthropic',
    async generate({ system, messages, schema, task }) {
      let res;
      try {
        res = await client.beta.messages.create({
          model: cfg.model,
          max_tokens: 16000,
          // Server-side refusal fallback (Claude Opus 5.5): re-runs a declined request on a fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: cfg.effort, format: { type: 'json_schema', schema } },
          system,
          messages,
        });
      } catch (err) {
        throw mapSdkError(err, task);
      }
      if (res.stop_reason === 'refusal') {
        throw new AiError(422, 'ai_refused', 'AI 无法回答这个请求，请换一种说法试试。', res.stop_details?.category);
      }
      if (res.stop_reason === 'max_tokens') {
        throw new AiError(502, 'ai_failed', 'AI 回复太长被截断了，请再试一次。', 'max_tokens');
      }
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      try {
        return { data: JSON.parse(text), usage: res.usage, model: res.model };
      } catch {
        throw new AiError(502, 'ai_failed', 'AI 返回的内容格式不对，请再试一次。', 'invalid_json');
      }
    },
  };
}

function mapSdkError(err, task) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(503, 'ai_disabled', 'AI 服务的密钥无效或没有权限，请联系管理员。', `${task}:auth`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError(429, 'rate_limited', 'AI 现在太忙了，请稍后再试。', `${task}:429`);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError(504, 'ai_timeout', 'AI 响应超时，请稍后再试。', `${task}:timeout`);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AiError(502, 'ai_failed', 'AI 请求出错，请稍后再试。', `${task}:400:${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError(502, 'ai_failed', 'AI 暂时没有响应，请稍后再试。', `${task}:${err.status}:${err.message}`);
  }
  return new AiError(502, 'ai_failed', 'AI 暂时没有响应，请稍后再试。', `${task}:${err?.message}`);
}

// ---------------------------------------------------------------------------
// Mock provider: shape-correct demo output so the UI and tests run without a key.
function mockProvider() {
  const tag = '【演示模式·非真实AI】';
  return {
    name: 'mock',
    async generate({ task, meta }) {
      if (task === 'explain') {
        return {
          data: {
            answer: `${tag}这里会显示AI针对「${meta.card.word}」的深挖讲解或对你问题的回答。`,
            examples: [
              { ja: meta.card.example, zh: meta.card.exampleZh },
              { ja: 'これは{例文|れいぶん}です。', zh: '这是例句。' },
              { ja: 'もう{一度|いちど}{言|い}ってください。', zh: '请再说一遍。' },
            ],
            nuance: `${tag}真实语感说明。`,
            kanji: `${tag}汉字拆解说明。`,
            related: ['関連語（相关词）'],
          },
        };
      }
      if (task === 'check') {
        return {
          data: {
            score: 80,
            verdict: 'understandable',
            usedTarget: meta.text.includes(meta.card.target) || meta.text.includes(meta.card.reading),
            corrected: meta.text,
            feedback: `${tag}这里会显示对你句子的点评。`,
            alternatives: [
              { ja: meta.card.example, zh: meta.card.exampleZh },
              { ja: 'いいですね。', zh: '不错呢。' },
            ],
          },
        };
      }
      if (task === 'roleplay') {
        const lines = [
          ['はい、かしこまりました。', '好的，明白了。'],
          ['ほかに{何|なに}かございますか。', '还有其他需要的吗？'],
          ['ありがとうございました。', '谢谢您。'],
        ];
        const turn = Math.min(meta.turn, lines.length - 1);
        return {
          data: {
            reply: lines[turn][0],
            replyZh: `${tag}${lines[turn][1]}`,
            feedback: `${tag}这里会显示对你这句话的点评。`,
            correction: '',
            suggestions: [
              { ja: 'お{願|ねが}いします。', zh: '拜托了。' },
              { ja: '{大丈夫|だいじょうぶ}です。', zh: '不用了。' },
            ],
            goalsDone: Array.from({ length: Math.min(turn + 1, meta.goalCount) }, (_, i) => i),
            finished: turn >= lines.length - 1,
          },
        };
      }
      if (task === 'story') {
        const words = meta.cards.map((c) => c.word).join('、');
        return {
          data: {
            title: `${tag}今日小剧场`,
            lines: meta.cards.slice(0, 6).map((c) => ({ ja: c.example, zh: c.exampleZh })),
            question: {
              q: `故事里出现了哪些词？`,
              options: [words.slice(0, 20), '没有出现', '不知道', '以上都不对'],
              answer: 0,
              explain: `${tag}这里会显示解析。`,
            },
          },
        };
      }
      throw new AiError(400, 'bad_request', '未知任务');
    },
  };
}
