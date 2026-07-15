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

// Утверждённый сет v2 (оператор, 2026-07-15): широта репортажа — концерт · спорт ·
// город · политика · форум · пресса. Чередование жанров для ритма слайд-шоу.
export const HERO_SHOTS: HeroShot[] = [
  { id: '1459749411175-04bf5292ceea', author: 'Nainoa Shizuru', kind: 'Концерт' },
  { id: '1473976345543-9ffc928e648d', author: 'Mitch Rosen', kind: 'Спорт' },
  { id: '1629032449275-706895bc04cd', author: 'Street', kind: 'Город' },
  { id: '1488942446680-85dd7de440ef', author: 'Vlad Tchompalov', kind: 'Событие' },
  { id: '1560692830-a756fcdcacee', author: 'Red Bull Racing', kind: 'Спорт' },
  { id: '1501612780327-45045538702b', author: 'Y. Papanastasopoulos', kind: 'Концерт' },
  { id: '1685110191139-eb2caaac220d', author: 'Urban', kind: 'Город' },
  { id: '1587825140708-dfaf72ae4b04', author: 'Miguel Henriques', kind: 'Форум' },
  { id: '1504450758481-7338eba7524a', author: 'JC Gellidon', kind: 'Спорт' },
  { id: '1505373877841-8d25f7d46678', author: 'Teemu Paananen', kind: 'Пресса' },
];

export const heroImageUrl = (shot: HeroShot) => U(shot.id);
