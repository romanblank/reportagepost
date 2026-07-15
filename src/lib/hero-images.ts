// Обои главной: курированный сет репортажных кадров (Unsplash) по нашим
// категориям — концерты, конференции, частные события. Временный источник до
// наполнения реальными работами фотографов; тогда сет сменится на лучшие кадры
// сообщества (Award/Editors' Choice).
//
// Единство достигается НЕ подбором совпадающих кадров, а общим грейдом + скримом
// в HeroWallpaper (grayscale/contrast/brightness + тёмный градиент) — белый текст
// читается на любом. Порядок чередует категории для ритма.

export interface HeroShot {
  id: string;
  author: string;
  kind: string;
}

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1920&q=70`;

export const HERO_SHOTS: HeroShot[] = [
  { id: '1459749411175-04bf5292ceea', author: 'Nainoa Shizuru', kind: 'Концерт' },
  { id: '1540575467063-178a50c2df87', author: 'Product School', kind: 'Конференция' },
  { id: '1519741196428-6a2175fa2557', author: 'Nathan Dumlao', kind: 'Свадьба' },
  { id: '1501612780327-45045538702b', author: 'Yannis Papanastasopoulos', kind: 'Концерт' },
  { id: '1587825140708-dfaf72ae4b04', author: 'Miguel Henriques', kind: 'Форум' },
  { id: '1504993945773-3f38e1b6a626', author: 'Alvaro CvG', kind: 'Праздник' },
  { id: '1470229722913-7c0e2dbbafd3', author: 'Yvette de Wit', kind: 'Концерт' },
  { id: '1505373877841-8d25f7d46678', author: 'Teemu Paananen', kind: 'Презентация' },
  { id: '1524368535928-5b5e00ddc76b', author: 'Vishnu R Nair', kind: 'Сцена' },
  { id: '1511578314322-379afb476865', author: 'Samantha Gades', kind: 'Событие' },
];

export const heroImageUrl = (shot: HeroShot) => U(shot.id);
