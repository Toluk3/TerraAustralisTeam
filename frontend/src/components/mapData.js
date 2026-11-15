/**
 * Módulo del mapa (frontend/map) y sus datos, compartidos por todos los <MapView>.
 *
 * Se carga recién cuando hace falta (import dinámico): MapLibre y deck.gl pesan y no se necesitan en la
 * pantalla de lanzamiento.
 *
 * Los datos son los JSON que genera `map/scripts/build_mocks.py`. `VITE_MOCK_BASE` elige la carpeta
 * (p. ej. `mock-s1`, como en el despliegue); sin esa variable se usa la primera que exista.
 */
const CANDIDATES = ['mock-s1', 'mock-conosur', 'mock-api']

let loading = null

export function loadMapModule() {
  loading ??= (async () => {
    const [mapModule, gameModule] = await Promise.all([
      import('../../map/src/map/index.js'),
      import('../../map/src/game/index.js'),
    ])
    const configured = import.meta.env.VITE_MOCK_BASE
    for (const base of configured ? [configured] : CANDIDATES) {
      const source = mapModule.createStaticSource(`/${base.replace(/^\/+/, '')}`)
      try {
        await source.getMeta()
        return { ...mapModule, ...gameModule, source }
      } catch {
        // esa carpeta no está: se prueba la siguiente
      }
    }
    throw new Error('No se encontraron los datos del mapa (ver frontend/map/README.md, "Correrlo").')
  })()
  // Si falla, el próximo intento vuelve a probar
  loading.catch(() => { loading = null })
  return loading
}
