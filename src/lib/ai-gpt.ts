// LLM за абстракцией — OpenAI-СОВМЕСТИМЫЙ, НЕ Яндекс. Работает с любым провайдером
// через env: DeepSeek (api.deepseek.com, дёшево, доступен из РФ), self-hosted
// (Ollama/vLLM), OpenRouter, Groq. no-op без конфига → фича деградирует к эвристике.
//   LLM_API_URL   — эндпоинт /chat/completions
//   LLM_API_KEY   — Bearer (опционально для self-hosted)
//   LLM_MODEL     — имя модели (deepseek-chat, qwen2.5, …)
// ВАЖНО: вывод модели ВСЕГДА валидируется guard'ом ПОСЛЕ (правило проекта) —
// здесь только транспорт, вердикт модели напрямую не применяется.

/** Настроена ли модель. Нужно /health: без неё третий уровень модерации молчит. */
export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_URL && process.env.LLM_MODEL);
}

export async function llmComplete(system: string, user: string): Promise<string | null> {
  const url = process.env.LLM_API_URL;
  const model = process.env.LLM_MODEL;
  if (!url || !model) return null;
  const key = process.env.LLM_API_KEY;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 300,
        // JSON-режим (Mistral/DeepSeek/OpenAI/OpenRouter). Провайдер без поддержки
        // вернёт ошибку → тихий фолбэк к эвристике (не крэш). Guard всё равно валидирует.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(6000), // подбор не должен ждать LLM дольше 6с
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null; // фича вторична — тихий фолбэк к эвристике (не глотаем в критичных путях)
  }
}
