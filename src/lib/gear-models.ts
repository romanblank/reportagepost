/**
 * Справочник актуальных моделей камер и объективов — подсказки при вводе.
 *
 * Правка партнёра 2026-08-18: «фотографы все разные, некоторые не знают
 * правильное название своей модели — будут писать всё по-разному, а у нас
 * сложности и путаница». Datalist с каноническими названиями решает 90%
 * случаев; ручной ввод остаётся для редкой техники — datalist не запрещает
 * свободный текст.
 *
 * Список СВОЙ, а не спарсенный: чужие базы (dpreview) — чужие данные и чужие
 * условия использования. Ходовые модели репортажной съёмки последних
 * поколений; пополняется руками по мере появления новинок. Канон написания —
 * «Бренд Модель», по нему же работает brandsFromCameras.
 */
export const CAMERA_MODELS: readonly string[] = [
  // Canon
  'Canon EOS R1', 'Canon EOS R3', 'Canon EOS R5 Mark II', 'Canon EOS R5',
  'Canon EOS R6 Mark III', 'Canon EOS R6 Mark II', 'Canon EOS R6', 'Canon EOS R7',
  'Canon EOS R8', 'Canon EOS R10', 'Canon EOS 5D Mark IV', 'Canon EOS-1D X Mark III',
  // Nikon
  'Nikon Z9', 'Nikon Z8', 'Nikon Z7 II', 'Nikon Z6 III', 'Nikon Z6 II',
  'Nikon Z5 II', 'Nikon Zf', 'Nikon D850', 'Nikon D780', 'Nikon D6',
  // Sony
  'Sony A1 II', 'Sony A1', 'Sony A9 III', 'Sony A9 II', 'Sony A7R V',
  'Sony A7 IV', 'Sony A7 III', 'Sony A7C II', 'Sony A7S III', 'Sony A6700',
  'Sony FX3',
  // Fujifilm
  'Fujifilm X-H2S', 'Fujifilm X-H2', 'Fujifilm X-T5', 'Fujifilm X-T4',
  'Fujifilm X-Pro3', 'Fujifilm X100VI', 'Fujifilm GFX100S II',
  // Panasonic
  'Panasonic Lumix S1R II', 'Panasonic Lumix S5 IIX', 'Panasonic Lumix S5 II',
  'Panasonic Lumix GH7', 'Panasonic Lumix G9 II',
  // OM System / Olympus
  'OM System OM-1 Mark II', 'OM System OM-1', 'OM System OM-5',
  'Olympus OM-D E-M1 Mark III',
  // Leica
  'Leica Q3', 'Leica SL3', 'Leica M11',
];

export const LENS_MODELS: readonly string[] = [
  // Canon RF
  'Canon RF 24-70mm F2.8 L', 'Canon RF 70-200mm F2.8 L', 'Canon RF 15-35mm F2.8 L',
  'Canon RF 28-70mm F2 L', 'Canon RF 50mm F1.2 L', 'Canon RF 85mm F1.2 L',
  'Canon RF 100-500mm F4.5-7.1 L', 'Canon RF 24-105mm F4 L',
  // Nikon Z
  'Nikon Z 24-70mm f/2.8 S', 'Nikon Z 70-200mm f/2.8 S', 'Nikon Z 14-24mm f/2.8 S',
  'Nikon Z 50mm f/1.2 S', 'Nikon Z 85mm f/1.2 S', 'Nikon Z 100-400mm f/4.5-5.6 S',
  'Nikon Z 24-120mm f/4 S',
  // Sony E
  'Sony FE 24-70mm F2.8 GM II', 'Sony FE 70-200mm F2.8 GM II', 'Sony FE 16-35mm F2.8 GM II',
  'Sony FE 50mm F1.2 GM', 'Sony FE 85mm F1.4 GM II', 'Sony FE 135mm F1.8 GM',
  'Sony FE 100-400mm F4.5-5.6 GM', 'Sony FE 24-105mm F4 G',
  // Fujifilm X/GF
  'Fujifilm XF 16-55mm F2.8 II', 'Fujifilm XF 50-140mm F2.8', 'Fujifilm XF 8-16mm F2.8',
  'Fujifilm XF 56mm F1.2 II', 'Fujifilm XF 33mm F1.4',
  // Panasonic L
  'Panasonic Lumix S PRO 24-70mm F2.8', 'Panasonic Lumix S PRO 70-200mm F2.8',
  'Panasonic Lumix S 20-60mm F3.5-5.6',
  // Sigma / Tamron (популярные кросс-байонетные)
  'Sigma 24-70mm F2.8 DG DN II Art', 'Sigma 70-200mm F2.8 DG DN Sport',
  'Sigma 85mm F1.4 DG DN Art', 'Sigma 35mm F1.4 DG DN Art',
  'Tamron 28-75mm F2.8 G2', 'Tamron 70-180mm F2.8 G2', 'Tamron 35-150mm F2-2.8',
  // OM System / M4/3
  'OM System 12-40mm F2.8 PRO II', 'OM System 40-150mm F2.8 PRO',
];
