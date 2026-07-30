// Шоурилы по ссылке. БЕЗОПАСНОСТЬ: встраиваем ТОЛЬКО известных провайдеров
// (YouTube/Vimeo/RuTube/VK) — произвольные URL не превращаем в <iframe> (защита
// от инъекции/кликджекинга). Неизвестный/битый URL → null (не показываем).

export interface ShowreelEmbed {
  provider: 'youtube' | 'vimeo' | 'rutube' | 'vk';
  embedUrl: string;
}

/** Разбирает ссылку на шоурил в безопасный embed-URL известного провайдера. */
export function parseShowreel(raw: string): ShowreelEmbed | null {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return null;

  // YouTube
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  if (m) return { provider: 'youtube', embedUrl: `https://www.youtube.com/embed/${m[1]}` };

  // Vimeo
  m = url.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/i);
  if (m) return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${m[1]}` };

  // RuTube
  m = url.match(/rutube\.ru\/(?:video|play\/embed)\/([A-Za-z0-9]+)/i);
  if (m) return { provider: 'rutube', embedUrl: `https://rutube.ru/play/embed/${m[1]}` };

  // VK video: vk.com/video<oid>_<id> (oid может быть отрицательным)
  m = url.match(/vk\.com\/(?:video_ext\.php\?oid=(-?\d+)&id=(\d+)|video(-?\d+)_(\d+))/i);
  if (m) {
    const oid = m[1] ?? m[3];
    const id = m[2] ?? m[4];
    return { provider: 'vk', embedUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}&hd=2` };
  }

  return null;
}

/** Отфильтровать список ссылок до валидных embed'ов (для показа на профиле). */
export function parseShowreels(urls: string[]): ShowreelEmbed[] {
  return urls.map(parseShowreel).filter((e): e is ShowreelEmbed => e !== null);
}
