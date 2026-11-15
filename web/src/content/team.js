/**
 * Integrantes del equipo Terra Australis (orden y datos dados por el equipo). Único lugar con sus datos:
 * la landing (círculos del hero) y la pantalla Equipo leen de acá. Solo nombre, carrera y foto.
 * Fotos: public/team/member-N.jpg, cuadradas de 480 px, recortadas centradas en la cara.
 */
const INFORMATICA = { es: 'Estudiante de ingeniería en informática', en: 'Computer engineering student' };

export const team = [
  { name: 'Tomas Lucas Schroeder', role: INFORMATICA },
  { name: 'Facundo Guevara', role: INFORMATICA },
  { name: 'Alvaro Carrizo', role: { es: 'Estudiante de ingeniería en telecomunicaciones', en: 'Telecommunications engineering student' } },
  { name: 'Yuranys Mavárez', role: INFORMATICA },
  { name: 'Juana Verdú', role: INFORMATICA },
  { name: 'Evelyn Melchor', role: { es: 'Joven colaboradora', en: 'Young collaborator' } },
].map((m, i) => ({ id: `member-${i + 1}`, photo: `/team/member-${i + 1}.jpg`, ...m }));

/** Iniciales para el círculo sin foto ("Ana Pérez" → "AP"). */
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const last = parts.at(-1);
  return (parts[0][0] + (/^\d+$/.test(last) ? last : last[0])).toUpperCase();
}
