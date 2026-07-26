// Клиент-safe константы серий (без @/lib/db) — чтобы клиентский StoryComposer
// и серверный lib/stories.ts делили один источник правды по лимитам фото.
export const STORY_MIN_PHOTOS = 5;
export const STORY_MAX_PHOTOS = 60;
