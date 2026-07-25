// YandexGPT за абстракцией (та же IAM-авторизация инстанса, что Vision).
// Активен при YC_FOLDER_ID + роли ai.languageModels.user у SA VM. Иначе null —
// фича деградирует к структурному подбору (провайдер за абстракцией, no-op паттерн).

async function iamToken(): Promise<string | null> {
  try {
    const res = await fetch(
      'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    const data = await res.json();
    return (data as { access_token?: string })?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Одиночный вызов YandexGPT. Возвращает текст ответа или null (провайдер выключен/ошибка). */
export async function yandexGpt(system: string, user: string): Promise<string | null> {
  const folderId = process.env.YC_FOLDER_ID;
  if (!folderId) return null;
  const token = await iamToken();
  if (!token) return null;
  try {
    const res = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelUri: `gpt://${folderId}/yandexgpt-lite/latest`,
        completionOptions: { temperature: 0.2, maxTokens: 500, stream: false },
        messages: [
          { role: 'system', text: system },
          { role: 'user', text: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { alternatives?: { message?: { text?: string } }[] };
    };
    return data?.result?.alternatives?.[0]?.message?.text ?? null;
  } catch {
    return null; // ошибки не глотаем молча в проде — но фича вторична, фолбэк к структуре
  }
}
