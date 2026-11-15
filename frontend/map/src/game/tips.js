/**
 * Mensajes que aparecen durante la partida. Tienen que leerse de un vistazo: una sola idea y menos de
 * ~90 caracteres. `icon` es un emoji; `text`, la frase.
 */
export const TIPS = [
  { icon: '🧑‍🤝‍🧑', text: 'En Argentina, el 95 % de los incendios forestales empieza por acciones humanas.' },
  { icon: '💧', text: 'Apagá el fogón con mucha agua y removiendo las brasas, hasta que estén frías.' },
  { icon: '🚬', text: 'Nunca tires colillas ni fósforos al suelo.' },
  { icon: '🏕️', text: 'Hacé fuego solo en lugares habilitados.' },
  { icon: '🌬️', text: 'Con viento, calor y sequía, no prendas fuego.' },
  { icon: '🍂', text: 'No quemes basura, hojas ni pastizales.' },
  { icon: '📞', text: '¿Ves humo? Avisá ya a los bomberos (100 en Argentina).' },
  { icon: '⏱️', text: 'Un fuego chico se apaga fácil; uno grande, no. Avisar rápido es clave.' },
  { icon: '🏡', text: 'Mantené sin pasto seco ni hojas el terreno alrededor de tu casa.' },
  { icon: '🚗', text: 'El escape caliente de un auto puede encender el pasto seco: no estaciones encima.' },
  { icon: '😷', text: 'El humo de un incendio daña la salud aun lejos del fuego.' },
  { icon: '🛰️', text: 'Los satélites de la NASA detectan focos de calor en todo el planeta, varias veces por día.' },
];

/** Solo se muestra si el tablero se armó con los datos reales de la zona. */
export const DATA_TIP = { icon: '🗺️', text: 'En este juego el fuego aparece más donde los satélites vieron más focos reales.' };

/** Copia mezclada (Fisher-Yates). */
export function shuffled(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
