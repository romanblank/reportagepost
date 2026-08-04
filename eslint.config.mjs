import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Сырой fetch в интерфейсе запрещён (аудит 2026-08-01, P2).
    //
    // До появления src/lib/api.ts каждый компонент писал свой
    // `fetch(...).catch(() => null)` и сам решал, что показать при обрыве сети:
    // toast, локальную ошибку, флаг без текста, исчезновение элемента — или
    // ничего. Шесть разных поведений на один и тот же сбой, часть из них
    // беззвучная. Разнобой самовоспроизводился копипастой, поэтому уборки мало:
    // без запрета следующая форма добавит седьмой вариант.
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    ignores: [
      // Отправка «на выходе» со страницы: нужен keepalive, которого нет в слое.
      // Запрос переживает закрытие вкладки — ради этого он и существует.
      "src/app/error.tsx",
      "src/app/global-error.tsx",
      "src/components/ProfileViewBeacon.tsx",
    ],
    rules: {
      // Мёртвый код после return однажды уже прошёл гейт: сброс кэша каталога
      // стоял ниже возврата из функции и не выполнялся никогда, а правило было
      // отключено в базовом конфиге Next.
      'no-unreachable': 'error',
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Используйте apiFetch/apiOk из @/lib/api: таймаут, единый разбор ошибки и повтор идемпотентных GET.",
        },
      ],
    },
  },
]);

export default eslintConfig;
