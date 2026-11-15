/**
 * Integrantes del equipo Terra Australis. Único lugar con sus datos: la landing (círculos del hero) y la
 * pantalla Equipo leen de acá.
 *
 * TODO(equipo): completar nombre, rol, descripción y enlaces de cada integrante, y dejar su foto cuadrada
 * (≥ 400 px) en public/team/member-N.jpg; después cambiar `photo: null` por '/team/member-N.jpg'.
 * Mientras tanto se muestra un círculo neutro con las iniciales del nombre genérico.
 * No inventar nombres, roles ni biografías: los escribe el equipo.
 */
export const team = [1, 2, 3, 4, 5].map((n) => ({
  id: `member-${n}`,
  photo: null, // TODO(equipo): `/team/member-${n}.jpg`
  name: `Integrante ${n}`, // TODO(equipo): nombre real
  role: { es: 'Rol por definir', en: 'Role to be defined' }, // TODO(equipo)
  bio: {
    es: 'Descripción pendiente: qué aportó al proyecto (2–3 líneas).', // TODO(equipo)
    en: 'Description pending: what this member contributed to the project (2–3 lines).', // TODO(equipo)
  },
  links: [], // TODO(equipo): [{ kind: 'github' | 'linkedin', url: 'https://…' }]
  placeholder: true,
}));

/** Iniciales para el círculo sin foto ("Integrante 3" → "I3"; "Ana Pérez" → "AP"). */
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const last = parts.at(-1);
  return (parts[0][0] + (/^\d+$/.test(last) ? last : last[0])).toUpperCase();
}
