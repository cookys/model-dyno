import type { CompCell } from '@/lib/store'

export interface RouteProvenance {
  engine: string | null
  engine_url: string | null
  runtime_context: string | null
  route_kind?: string | null
  route_url?: string | null
  provider?: string | null
  provider_url?: string | null
  operator?: string | null
  operator_url?: string | null
  harness?: string | null
  harness_url?: string | null
  billing?: string | null
  plan?: string | null
  model_source?: string | null
  model_source_url?: string | null
  weight_format?: string
  weight_path?: string
  weight_source?: string
  weight_source_url?: string
  base_model?: string
  base_model_url?: string
}

type RouteCarrier = Partial<CompCell> & {
  _rec?: Partial<CompCell>
  engine?: string | null
  engine_url?: string | null
  runtime_context?: string | null
}

const ENTITY_URLS: Record<string, string> = {
  Anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
  OpenAI: 'https://platform.openai.com/docs/models',
  Google: 'https://ai.google.dev/gemini-api/docs/models',
  MiniMax: 'https://www.minimax.io/',
  DeepSeek: 'https://api-docs.deepseek.com/quick_start/pricing',
  'Z.AI': 'https://z.ai/',
  Moonshot: 'https://platform.moonshot.ai/',
  Xiaomi: 'https://www.mi.com/global/',
  Tencent: 'https://www.tencent.com/en-us/',
  Alibaba: 'https://qwen.ai/',
  StepFun: 'https://www.stepfun.com/',
  NVIDIA: 'https://www.nvidia.com/en-us/ai/',
  xAI: 'https://x.ai/',
  OpenRouter: 'https://openrouter.ai/models',
  OpenCode: 'https://opencode.ai/docs/',
  'Claude Code': 'https://docs.anthropic.com/en/docs/claude-code/overview',
  'Codex CLI': 'https://github.com/openai/codex',
  'Gemini CLI': 'https://ai.google.dev/gemini-api/docs',
  Antigravity: 'https://ai.google.dev/',
  'Grok CLI': 'https://x.ai/',
  'SWE-personal': 'https://github.com/cookys/llm-playground',
  InternScience: 'https://huggingface.co/InternScience',
  'Qoder CN CLI': 'https://docs.qoder.cn/',
}

const ACCESS_LABELS: Record<string, string> = {
  'direct-api': 'Direct API',
  openrouter: 'OpenRouter',
  'opencode-go': 'OpenCode',
  'opencode-free': 'OpenCode Free',
  'codex-cli': 'Codex CLI',
  'grok-cli': 'Grok CLI',
  'kimi-cli': 'Kimi Code CLI',
  'qoder-cli': 'Qoder CN CLI',
  'claude-harness': 'Claude harness',
  local: 'Local serve',
}

const ACCESS_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/models',
  'opencode-go': 'https://opencode.ai/docs/',
  'opencode-free': 'https://opencode.ai/docs/',
  'codex-cli': 'https://github.com/openai/codex',
  'grok-cli': 'https://x.ai/',
  'kimi-cli': 'https://platform.moonshot.ai/',
  'qoder-cli': 'https://docs.qoder.cn/',
  'claude-harness': 'https://docs.anthropic.com/en/docs/claude-code/llm-gateway',
}

function field(c: RouteCarrier, key: keyof CompCell): any {
  const direct = (c as any)?.[key]
  if (direct !== undefined && direct !== null && direct !== '') return direct
  return (c?._rec as any)?.[key]
}

function routeText(c: RouteCarrier): string {
  const rec = c?._rec || {}
  return [
    c?.cell, c?.display, c?.model, c?.harness,
    rec.cell, rec.display, rec.model, rec.harness,
  ].filter(Boolean).join(' ')
}

function identityAccess(c: RouteCarrier): string | null {
  const identity = field(c, 'identity')
  const access = identity && typeof identity === 'object' ? identity.access : null
  return typeof access === 'string' && access ? access : null
}

function canonicalModel(c: RouteCarrier): string | null {
  const identity = field(c, 'identity')
  const canonical = identity && typeof identity === 'object' ? identity.canonical_model : null
  if (typeof canonical === 'string' && canonical) return canonical
  const model = field(c, 'model')
  return typeof model === 'string' && model ? model : null
}

function entityUrl(name: string | null | undefined): string | null {
  if (!name) return null
  return ENTITY_URLS[name] || null
}

export function tagOf(c: RouteCarrier, key: string): string | null {
  const v = c?._rec?.tags?.[key] ?? c?.tags?.[key]
  return typeof v === 'string' && v && v !== 'none' && v !== 'n/a' ? v : null
}

export function engineOf(c: RouteCarrier): string | null {
  if (c.engine) return c.engine
  const text = routeText(c).toLowerCase()
  if (text.includes('lucifer')) return 'voipmonitor/vllm:lucifer'
  if (text.includes('hy3') && text.includes('mxfp4')) return 'vLLM 0.24.0'
  if (text.includes('step-3.7') || text.includes('step37')) return 'StepFun llama.cpp step3.7'
  if (text.includes('agents-a1')) return 'ik_llama.cpp'
  if (text.includes('qwen3-coder-next')) return 'llama-minimax-m3 (llama.cpp PR #24925)'
  if (text.includes('qwen3.5-122b-a10b')) return 'llama-minimax-m3 (llama.cpp PR #24925)'
  if (text.includes('rocmfp4') || text.includes('rocmfpx')) return 'llama-rocmfpx (charlie12345 fork)'
  return null
}

export function engineUrlOf(c: RouteCarrier): string | null {
  if (c.engine_url) return c.engine_url
  const engine = engineOf(c)
  if (!engine) return null
  if (engine.toLowerCase().includes('vllm')) return 'https://github.com/vllm-project/vllm'
  if (engine.toLowerCase().includes('stepfun')) return 'https://github.com/stepfun-ai/llama.cpp/tree/step3.7'
  if (engine.toLowerCase().includes('ik_llama')) return 'https://github.com/ikawrakow/ik_llama.cpp'
  if (engine.toLowerCase().includes('rocmfpx')) return 'https://github.com/charlie12345/ROCmFPX'
  if (engine.toLowerCase().includes('llama.cpp')) return 'https://github.com/ggml-org/llama.cpp/pull/24925'
  return null
}

export function quantOf(c: RouteCarrier): string | null {
  const tagged = tagOf(c, 'quant')
  if (tagged) return tagged
  const text = routeText(c)
  const rfp = text.match(/(Q\d_0_ROCMFP4[A-Z_]*|ROCMFP4|ROCMFPX)/i)
  if (rfp) return rfp[1]
  const m = text.match(/(MXFP4|NVFP4|IQ\d[\w]*|Q\d_K(?:_[A-Z])?|FP16)/)
  if (m) return m[1]
  if (text.includes('DeepSeek-V4-Flash')) return 'FP4/FP8'
  return null
}

export function contextOf(c: RouteCarrier): string | null {
  if (c.runtime_context) return c.runtime_context
  const text = routeText(c).toLowerCase()
  const m = text.match(/(\d+)k/)
  if (m) return `${m[1]}K`
  if (text.includes('deepseek-v4-flash-lucifer')) return '262K'
  return null
}

function modelSourceUrlOf(c: RouteCarrier): string | null {
  const model = (canonicalModel(c) || '').toLowerCase()
  const publisher = String(field(c, 'publisher') || field(c, 'operator') || '')
  if (model === 'deepseek-v4-flash') return 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash'
  if (model === 'hy3') return 'https://huggingface.co/tencent/Hy3'
  if (model === 'step-3.7-flash') return 'https://huggingface.co/stepfun-ai/Step-3.7-Flash-GGUF'
  if (model === 'agents-a1') return 'https://huggingface.co/InternScience/Agents-A1'
  if (model === 'qwen3-coder-next') return 'https://huggingface.co/Qwen/Qwen3-Coder-Next'
  if (model === 'qwen3.5-122b-a10b') return 'https://huggingface.co/Qwen/Qwen3.5-122B-A10B'
  return entityUrl(publisher)
}

export function weightMetaOf(c: RouteCarrier): Partial<RouteProvenance> {
  const text = routeText(c).toLowerCase()
  if (text.includes('hy3') && text.includes('mxfp4')) {
    return {
      weight_format: 'safetensors · compressed-tensors MXFP4',
      weight_path: '/data/models/Hy3-MXFP4',
      weight_source: 'olka-fi/Hy3-MXFP4',
      weight_source_url: 'https://huggingface.co/olka-fi/Hy3-MXFP4',
      base_model: 'tencent/Hy3',
      base_model_url: 'https://huggingface.co/tencent/Hy3',
    }
  }
  if (text.includes('deepseek-v4-flash')) {
    return {
      weight_format: 'safetensors · FP4/FP8 mixed',
      weight_path: '/data/models/DeepSeek-V4-Flash',
      weight_source: 'deepseek-ai/DeepSeek-V4-Flash',
      weight_source_url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
      base_model: 'deepseek-ai/DeepSeek-V4-Flash',
      base_model_url: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash',
    }
  }
  if (text.includes('step-3.7') || text.includes('step37')) {
    return {
      weight_format: 'GGUF · IQ4_XS',
      weight_path: '/data/models/Step-3.7-Flash-GGUF/IQ4_XS/Step-3.7-flash-IQ4_XS-00001-of-00003.gguf',
      weight_source: 'stepfun-ai/Step-3.7-Flash-GGUF',
      weight_source_url: 'https://huggingface.co/stepfun-ai/Step-3.7-Flash-GGUF',
      base_model: 'stepfun-ai/Step-3.7-Flash',
      base_model_url: 'https://huggingface.co/stepfun-ai/Step-3.7-Flash',
    }
  }
  if (text.includes('agents-a1')) {
    return {
      weight_format: 'GGUF · Q4_K_M',
      weight_path: '/data/models/Agents-A1-Q4_K_M-GGUF/Agents-A1-Q4_K_M.gguf',
      weight_source: 'InternScience/Agents-A1-Q4_K_M-GGUF',
      weight_source_url: 'https://huggingface.co/InternScience/Agents-A1-Q4_K_M-GGUF',
      base_model: 'InternScience/Agents-A1',
      base_model_url: 'https://huggingface.co/InternScience/Agents-A1',
    }
  }
  if (text.includes('qwen3-coder-next')) {
    return {
      weight_format: 'GGUF · Q4_K_M',
      weight_path: '/data/models/Qwen3-Coder-Next-GGUF/Qwen3-Coder-Next-Q4_K_M/Qwen3-Coder-Next-Q4_K_M-00001-of-00004.gguf',
      weight_source: 'Qwen/Qwen3-Coder-Next-GGUF',
      weight_source_url: 'https://huggingface.co/Qwen/Qwen3-Coder-Next-GGUF',
      base_model: 'Qwen/Qwen3-Coder-Next',
      base_model_url: 'https://huggingface.co/Qwen/Qwen3-Coder-Next',
    }
  }
  if (text.includes('qwen3.5-122b-a10b')) {
    return {
      weight_format: 'GGUF · UD-Q4_K_XL · MTP',
      weight_path: '/data/models/Qwen3.5-122B-A10B-MTP-GGUF/UD-Q4_K_XL/Qwen3.5-122B-A10B-UD-Q4_K_XL-00001-of-00003.gguf',
      weight_source: 'unsloth/Qwen3.5-122B-A10B-MTP-GGUF',
      weight_source_url: 'https://huggingface.co/unsloth/Qwen3.5-122B-A10B-MTP-GGUF',
      base_model: 'Qwen/Qwen3.5-122B-A10B',
      base_model_url: 'https://huggingface.co/Qwen/Qwen3.5-122B-A10B',
    }
  }
  return {}
}

export function routeProvenanceOf(c: RouteCarrier): RouteProvenance {
  const access = identityAccess(c)
  const publisher = field(c, 'publisher') || null
  const operator = field(c, 'operator') || null
  const harness = field(c, 'harness') || null
  const billing = field(c, 'billing') || null
  const plan = field(c, 'plan') || null
  const modelSource = canonicalModel(c)
  return {
    engine: engineOf(c),
    engine_url: engineUrlOf(c),
    runtime_context: contextOf(c),
    route_kind: access ? ACCESS_LABELS[access] || access : null,
    route_url: access ? ACCESS_URLS[access] || entityUrl(operator) || entityUrl(publisher) : null,
    provider: publisher || operator || null,
    provider_url: entityUrl(publisher || operator),
    operator: operator || null,
    operator_url: entityUrl(operator),
    harness: harness || null,
    harness_url: entityUrl(harness),
    billing: billing || null,
    plan: plan || null,
    model_source: modelSource || undefined,
    model_source_url: modelSourceUrlOf(c) || undefined,
    ...weightMetaOf(c),
  }
}

export function deploymentLine(c: RouteCarrier): string {
  const provenance = routeProvenanceOf(c)
  const parts = [provenance.engine, quantOf(c)]
  const draft = tagOf(c, 'draft')
  if (draft) parts.push(draft.toUpperCase())
  parts.push(provenance.runtime_context)
  const localLine = parts.filter(Boolean).join(' · ')
  if (localLine) return localLine
  const cloudParts = [provenance.provider, provenance.route_kind, provenance.harness, provenance.plan || provenance.billing]
  return cloudParts.filter(Boolean).join(' · ') || (c._rec?.machine || c._rec?.harness || c._rec?.billing || c.source || '')
}
