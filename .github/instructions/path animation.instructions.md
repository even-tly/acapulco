# Instrucciones del proyecto — Maratón de Cali

## 1. Descripción general

Aplicación Vue 3 (Composition API) que visualiza rutas de carrera sobre Mapbox GL JS con animación de trayecto, perfil de elevación interactivo y controles de reproducción. Datos centralizados en `event.json`; tema claro/oscuro con CSS custom properties. Estado global gestionado progresivamente con Pinia.

---

## 2. Convenciones del proyecto

### 2.1 Estructura de archivos

```
src/
  views/          → Vistas conectadas al router (wrappers delgados o orquestadores)
  components/     → Componentes reutilizables de UI
  config/         → Configuración centralizada (Mapbox, etc.)
  stores/         → Stores Pinia (estado global del playback, grabación, etc.)
  theme/          → Tokens de diseño, mixin de tema, variables CSS
  utils/          → Funciones puras de utilidad (parseElevationCsv, flattenGeoJson)
  composables/    → Composables de dominio (lógica reutilizable)
  assets/         → Datos estáticos (JSON, GeoJSON, CSV, imágenes)
  router/         → Definición de rutas de Vue Router
```

### 2.2 Estructura de composables

```
src/
  config/
    mapbox.js               → Configuración centralizada de Mapbox (token, style, center, zoom, pitch)
  stores/                   → Stores Pinia (estado global)
    playbackStore.js        → Estado del playback: progress, isPlaying, speed, routeData, elevationProfile
    recordingStore.js       → Estado de grabación: isRecording, countdown, UI visibility flags
  composables/              → Composables de dominio (lógica reutilizable)
    useRouteAnimation.js    → Animación del mapa (frame loop con coord lookup O(1), cámara lerp con inercia, bearing tangente, throttled progress ~20fps, delega capas a useMapLayers)
    useMapLayers.js         → Sources y layers de Mapbox (full route, animated line) + HTML head marker (mapboxgl.Marker, posicionado con setLngLat)
    useMarkers.js           → Marcas de KM (círculos naranja siempre visibles) + popup de proximidad con geofence de fase y debounce (MIN_PHASE_DELTA)
    useMarkPopup.js         → Popup reutilizable Mapbox GL con cache de cluster (trackPointer:false, closeOnMove:false) — no reposiciona si mismo cluster ya visible
    useScrub.js             → Interacción de scrub (mouse/touch) en la barra de reproducción
    usePlaybackStats.js     → Estadísticas computadas del playback (distancia, elevación, pendiente, etc.)
    useScreenRecording.js   → Lógica de grabación de pantalla (MediaRecorder API, countdown, fullscreen)
  theme/
    useTheme.js             → Toggle dark/light, localStorage, cross-tab sync
    tokensToCSS.js          → Generador: tokens.js → CSS custom properties
```

### 2.3 Estilo de componentes

- **API**: Composition API con `<script setup>`. Todos los componentes usan `defineProps`, `defineEmits`, `ref`, `computed`, `watch`, `onMounted`, etc.
- **Nomenclatura de archivos**: PascalCase para componentes (`.vue`), camelCase para utilidades y composables (`.js`).
- **Nomenclatura de componentes**: inferida automáticamente del nombre de archivo por Vue 3 `<script setup>`.
- **Props**: declaradas con `defineProps({ ... })`, siempre tipadas con `type`, `default` y JSDoc cuando el propósito no es obvio.
- **Emits**: declarados con `defineEmits([...])` en `<script setup>`.
- **CSS**: `<style scoped>` en cada componente. Usar variables CSS globales (`var(--xxx)`), nunca colores/tamaños hardcodeados.
- **BEM en CSS**: los componentes nuevos deben seguir BEM (`bloque__elemento--modificador`). Ejemplo: `RaceTitle.vue` ya lo usa (`.race-title__badge--easy`).
- **Composables**: lógica reutilizable se extrae a funciones `use*()` en `src/composables/` o `src/theme/`.

### 2.3 Sistema de temas

- **Fuente de verdad**: `src/theme/tokens.js` define paletas, tipografía, layout y transiciones.
- **Variables CSS**: `src/theme/variables.css` es un shell; su contenido se genera automáticamente desde `tokens.js` por el Vite plugin `cssTokensPlugin` (vía `src/theme/tokensToCSS.js`).  
  - `:root` = modo oscuro (default).
  - `.light-theme` = modo claro.
- **Composable**: `src/theme/useTheme.js` provee `isLightTheme` (ref) y `toggleTheme()`.  
  Se importa vía `import { useTheme } from '@/theme'` y se usa así:
  ```js
  const { isLightTheme, toggleTheme } = useTheme();
  ```
- **Regla**: todo color, radio y fuente debe referenciarse como `var(--token)` en CSS. Para uso en JS (ej. Mapbox paint), importar `tokens` directamente.

### 2.4 Datos y assets

- **`event.json`**: configuración centralizada del evento (ciudad, fecha, array de rutas con `id`, `name`, `distance`, `difficulty`, `type`, `description`, `duration`, `zoom`).
- **Convención de archivos de ruta**:
  - `assets/routes/{id}.geojson` — GeoJSON con LineString (recorrido) + Points (waypoints).
  - `assets/elevation/{id}.csv` — Perfil de elevación (columnas: `lat, lon, ele, time, segment_distance_km, distance_km_cum, segment_time_s, elev_delta_m, elev_gain_pos_m, elev_gain_pos_cum_m, slope_percent`).
  - `assets/marks/{id}.json` — Marcas legacy (solo rutas con `legacy: true`).
- **Agregar nueva ruta**: añadir entrada en `event.json` → colocar `.geojson` y `.csv` en las carpetas correspondientes.

### 2.5 Variables de entorno

Prefijo `VITE_` (requisito Vite). Definidas en `.env`:

| Variable | Descripción |
|---|---|
| `VITE_MAPBOX_ACCESS_TOKEN` | Token de Mapbox |
| `VITE_MAPBOX_STYLE` | URL del estilo del mapa |
| `VITE_MAPBOX_CENTER_LNG` | Longitud del centro del mapa |
| `VITE_MAPBOX_CENTER_LAT` | Latitud del centro del mapa |

### 2.6 Importaciones y alias

- Usar `@/` como alias de `src/` (configurado en `jsconfig.json` y `vite.config.js`).
- Imports dinámicos con `import()` para lazy-loading de vistas y assets.
- Archivos `.csv` se importan con sufijo `?raw` para obtener texto plano.
- Archivos `.geojson` se transforman a módulos JSON mediante plugin custom en `vite.config.js`.

---

## 3. Patrones de código

### 3.1 Comunicación padre-hijo y estado global

- **Estado actual (props down, events up)**: el padre (`RouteMapView`) es la fuente de verdad del estado compartido (`progress`, `isPlaying`, `currentSpeed`). Hijos emiten eventos (`update:progress`, `toggle-play`, `speed-change`); el padre actualiza su `data` y los hijos reciben las actualizaciones por props.
- **Migración progresiva a Pinia**: el estado compartido del playback se trasladará gradualmente a `playbackStore`. Los componentes leerán del store en lugar de recibir props. La migración es incremental — se mantiene compatibilidad con props durante la transición.
- **Regla de convivencia**: durante la migración, un mismo dato NO debe existir simultáneamente como prop y como store state. Migrar un dato implica: (1) moverlo al store, (2) actualizar todos los consumidores, (3) eliminar la prop del padre.

### 3.2 Animación del mapa

La animación se encapsula en el composable `useRouteAnimation(props, emit)` en `src/composables/useRouteAnimation.js`:

- Retorna `{ setup }` — función que recibe la instancia de `mapboxgl.Map` una vez cargada.
- Delega configuración de sources/layers a `useMapLayers(map, lineFeature)` (retorna `showAnimationLayers`, `showOverviewLayers`).
- Delega sistema de marcas a `useMarkers(map, marksData, showMarks)` (retorna `updateHeadPosition`, `resetPopup`).
- `useMarkers` delega la UI del popup a `useMarkPopup(map)` — popup reutilizable de Mapbox GL.
- **Marcas en el mapa**: solo los KM se muestran como círculos naranja (siempre visibles, sin cambio entre play/pause). El resto de marcas (agua, gatorade, going, salida, llegada) se muestran exclusivamente mediante popup de proximidad durante la animación.
- **Popup de proximidad**: marcas cercanas se agrupan en clusters; cuando la cabeza de la carrera se acerca a un cluster, aparece un popup con los íconos PNG ordenados por jerarquía (KM → Agua → Gatorade → Going). Solo un popup visible a la vez.
- `frame()` — loop de `requestAnimationFrame` que calcula la fase de animación.
- `updateDisplay(phase, moveCamera)` — actualiza posición del marcador, gradiente de la línea y cámara.
- `_togglePause(playing)`, `_seekToPhase(targetPhase)`, `_setSpeed(newSpeed)` — closures internas conectadas a watchers de props.

**Importante**: estas closures capturan variables locales (`startTime`, `isPaused`, `speed`, etc.) para evitar reactividad innecesaria de Vue. Los watchers en el composable referencian las closures mediante variables mutables del scope de `useRouteAnimation`.

### 3.3 Perfil de elevación y playback

- `flattenGeoJson(geojson)` normaliza un FeatureCollection: elimina coordenadas Z (elevación), convierte `MultiLineString` → `LineString`, descarta geometrías no soportadas; el resultado sólo contiene `LineString` y `Point` 2D.
- `parseElevationCsv()` convierte CSV raw a array de objetos tipados.
- `usePlaybackStats(props)` composable calcula estadísticas derivadas (`formattedDistance`, `formattedElevation`, `formattedSlope`, `formattedTotalAscent`, `formattedTime`) usando `findNearestPoint` (binary search por distancia acumulada).
- `useScrub(emit)` composable encapsula la interacción de scrub (mouse/touch) con cleanup automático.
- `ElevationChart.vue` renderiza el mini gráfico SVG con polyline downsampleado (~150 puntos) y gradiente de progreso.
- `PlayBack.vue` orquesta los composables y el subcomponente, manteniendo solo lógica de play/pause y speed.

---

## 4. Instrucciones para refactorización y homogeneización

### 4.1 Migrar de Vue CLI a Vite — ✅ COMPLETADO

Migración realizada. Stack actual: **Vite 6** + `@vitejs/plugin-vue 5`. Archivos eliminados: `vue.config.js`, `babel.config.js`. Variables de entorno con prefijo `VITE_`, accedidas vía `import.meta.env.*`. Scripts: `npm run dev`, `npm run build`, `npm run preview`.

### 4.2 Migrar a Composition API — ✅ COMPLETADO

Migración realizada. Todos los componentes usan `<script setup>` (Composition API):

1. ✅ `themeMixin.js` → `useTheme.js` (composable con `ref`, `watch`, `onMounted`).
2. ✅ Componentes migrados: `App` → `RaceTitle` → `PlayBack` → `EventHome` → `RouteMap` → `RouteMapView` → `HomeView` → `AboutView`.
3. ✅ `mixins: [themeMixin]` reemplazado por `const { isLightTheme, toggleTheme } = useTheme()` en componentes que lo necesitan (`App.vue`, `EventHome.vue`).
4. ✅ Closures de animación extraídos a `src/composables/useRouteAnimation.js` — composable `useRouteAnimation(props, emit)` que retorna `{ setup(map) }`.

Archivos nuevos: `src/theme/useTheme.js`, `src/composables/useRouteAnimation.js`.  
Archivo legacy conservado: `src/theme/themeMixin.js` (ya no se importa).

### 4.3 Eliminar duplicación de tokens (prioridad alta) — ✅ COMPLETADO

Duplicación eliminada. `tokens.js` es la única fuente de verdad:

1. ✅ Creado `src/theme/tokensToCSS.js` — función pura `tokensToCSS(tokens)` que genera el CSS completo (reset + `:root` dark + `.light-theme`).
2. ✅ Añadido Vite plugin `cssTokensPlugin` en `vite.config.js` que intercepta la carga de `variables.css` y retorna el CSS generado desde `tokens.js`.
3. ✅ `variables.css` reducido a shell con comentario; su contenido real se genera en build/dev time.
4. ✅ Tokens nuevos añadidos a `tokens.js`: `colors.light.accentDark` (override claro) y `transitions.theme`.

Archivos nuevos: `src/theme/tokensToCSS.js`.  
Archivos modificados: `tokens.js`, `variables.css`, `vite.config.js`.  
**Nota**: cambios en `tokens.js` requieren reiniciar el dev server.

### 4.4 Homogeneizar CSS (prioridad alta) — ✅ COMPLETADO

Homogeneización realizada:

1. ✅ `PlayBack.vue` migrado a BEM: `.playback-bar` → `.playback`, `.play-pause-btn` → `.playback__play-btn`, `.speed-btn` → `.playback__speed-btn`, `.stats-group` → `.playback__stats`, `.stat` → `.playback__stat`, etc.
2. ✅ `EventHome.vue` migrado a BEM: `.header` → `.event-home__header`, `.hero` → `.event-home__hero`, `.route-card` → `.event-home__card`, `.badge` → `.event-home__badge`, `.footer` → `.event-home__footer`, etc.
3. ✅ Todos los componentes verificados con `<style scoped>`.
4. ✅ Magic numbers extraídos a tokens: `z-index: 1000` → `var(--z-overlay)`, `z-index: 100` → `var(--z-header)`, `bottom: 24px` / `top: 24px` / `left: 24px` → `var(--spacing-overlay-bottom)`. Hardcoded colors en `RouteMapView.vue` reemplazados por variables CSS.

Tokens añadidos a `tokens.js`: `layout.zIndexOverlay`, `layout.zIndexHeader`, `layout.spacingOverlayBottom`.  
Archivos modificados: `PlayBack.vue`, `EventHome.vue`, `RaceTitle.vue`, `RouteMapView.vue`, `tokens.js`, `tokensToCSS.js`.

### 4.5 Extraer SVG inline a componentes icon (prioridad baja) — ✅ COMPLETADO

Extracción realizada:

1. ✅ Creada carpeta `src/components/icons/` con 6 componentes: `IconPlay.vue`, `IconPause.vue`, `IconMoon.vue`, `IconSun.vue`, `IconCalendar.vue`, `IconMap.vue`.
2. ✅ Cada componente acepta props `size` (default 24) y `color` (default `currentColor`).
3. ✅ SVG inline reemplazados en `PlayBack.vue` (play/pause) y `EventHome.vue` (moon/sun, calendar, map).

Archivos nuevos: `src/components/icons/Icon{Play,Pause,Moon,Sun,Calendar,Map}.vue`.  
Archivos modificados: `PlayBack.vue`, `EventHome.vue`.

### 4.6 Centralizar la configuración de Mapbox (prioridad media) — ✅ COMPLETADO

Configuración centralizada. `src/config/mapbox.js` es la única fuente de lectura de variables de entorno Mapbox:

1. ✅ Creado `src/config/mapbox.js` — exporta `mapboxConfig` (objeto congelado con `accessToken`, `style`, `center`, `zoom`, `pitch`), `staticMapStyle` y helper `staticMapStylePath()`.
2. ✅ `RouteMap.vue` actualizado: importa `mapboxConfig` en lugar de leer `import.meta.env` directamente.
3. ✅ `EventHome.vue` actualizado: importa `mapboxConfig` y `staticMapStylePath` en lugar de duplicar lecturas de env.

Archivos nuevos: `src/config/mapbox.js`.  
Archivos modificados: `RouteMap.vue`, `EventHome.vue`.

### 4.7 Limpieza de código existente (prioridad alta) — ✅ COMPLETADO

Limpieza realizada. Componentes grandes divididos en composables y subcomponentes:

1. ✅ **`useRouteAnimation.js`** refactorizado: lógica de sources/layers extraída a `useMapLayers.js`; sistema de marcas a `useMarkers.js`. El composable ahora importa y delega a estos sub-composables, usando `showAnimationLayers()` y `showOverviewLayers()` para gestionar visibilidad de capas.
2. ✅ **`PlayBack.vue`** dividido:
   - `useScrub.js` — lógica de scrub mouse/touch con cleanup automático.
   - `usePlaybackStats.js` — estadísticas computadas (`formattedDistance`, `formattedElevation`, `formattedSlope`, `formattedTotalAscent`, `formattedTime`, `currentProfilePoint`), incluyendo `findNearestPoint` (binary search).
   - `ElevationChart.vue` — mini gráfico SVG de elevación con gradiente de progreso y cabezal indicador.
3. ✅ **`EventHome.vue`** dividido:
   - `HeroSection.vue` — sección hero (título ciudad + fecha).
   - `RouteCard.vue` — tarjeta de ruta individual (imagen, badge, descripción, botón).
   - `EventFooter.vue` — footer del evento (logo, links, copyright).
   - CSS reducido ~70%: solo quedan estilos de header, routes grid y responsive de nav.

Archivos nuevos: `src/composables/useMapLayers.js`, `src/composables/useMarkers.js`, `src/composables/useScrub.js`, `src/composables/usePlaybackStats.js`, `src/components/ElevationChart.vue`, `src/components/HeroSection.vue`, `src/components/RouteCard.vue`, `src/components/EventFooter.vue`.  
Archivos modificados: `useRouteAnimation.js`, `PlayBack.vue`, `EventHome.vue`.

### 4.8 ✅ Mejoras al manejo de errores y loading (prioridad media)

- ✅ Creados componentes reutilizables `LoadingSpinner.vue` y `ErrorMessage.vue`.
- ✅ `RouteMapView` actualizado para usar `LoadingSpinner` y `ErrorMessage` en lugar de `<div>` inline.
- ✅ `ErrorMessage` soporta botón de retry (`retryable` prop + `retry` emit).
- ✅ Añadido error boundary a nivel de vista con `onErrorCaptured` en `RouteMapView`.

Archivos nuevos: `src/components/LoadingSpinner.vue`, `src/components/ErrorMessage.vue`.  
Archivos modificados: `src/views/RouteMapView.vue`.

### 4.9 Testing (prioridad baja)

- Actualmente no hay tests. Agregar:
  - Unit tests para `parseElevationCsv`, `_findNearestPoint`, token generation.
  - Tests de componente para `PlayBack` (emit events), `RaceTitle` (render de props).
  - Configurar Vitest o Jest + `@vue/test-utils`.

### 4.10 Implementar Pinia Store y migrar de props a state (prioridad alta)

Migrar progresivamente el estado compartido del playback (actualmente en `RouteMapView` como refs locales + props) a un store Pinia centralizado. Esto simplifica la comunicación entre componentes, elimina prop drilling y facilita el acceso al estado desde composables y el futuro módulo de grabación.

**Fase 1 — Instalación y store base (✅ completada):**

1. Instalar Pinia: `npm install pinia`.
2. Crear instancia de Pinia en `src/main.js` (`createPinia()`, `app.use(pinia)`).
3. Crear `src/stores/playbackStore.js` — `defineStore('playback', ...)` con:
   - **State**: `progress` (0–1), `isPlaying` (bool), `speed` (number), `routeId` (string|null).
   - **State de datos de ruta**: `pathData`, `marksData`, `elevationProfile`, `totalDistance`, `duration`, `routeConfig`, `loading`, `error`.
   - **Actions**: `loadRoute(routeId)` (mueve la lógica de carga de `RouteMapView`), `setProgress(val)`, `togglePlay()`, `setSpeed(speed)`, `reset()`.
   - **Getters**: `eventCity`, `isReady` (pathData loaded y no error).

**Fase 2 — Migrar `RouteMapView` al store (✅ completada):**

4. `RouteMapView` reemplaza refs locales (`progress`, `isPlaying`, `currentSpeed`, `pathData`, etc.) por `storeToRefs(usePlaybackStore())`.
5. Los handlers de eventos (`onMapProgress`, `onTogglePlay`, etc.) invocan actions del store en lugar de mutar refs locales.
6. Eliminar la función `loadRouteData()` de `RouteMapView` — ahora vive como action `loadRoute()` en el store.
7. `RouteMapView` mantiene el watcher de `route.params.routeId` pero llama a `store.loadRoute(routeId)`.

**Fase 3 — Migrar componentes hijos (✅ completada):**

8. `PlayBack.vue`: reemplazar props (`playing`, `progress`, `elevationProfile`, `totalDistance`) por lectura directa del store. Eliminar emits `toggle-play`, `speed-change`; invocar actions del store directamente.
9. `RouteMap.vue`: reemplazar props (`pathData`, `marksData`, `duration`, `progress`, `playing`, `speed`) por lectura del store. Eliminar emit `update:progress`; el composable `useRouteAnimation` escribe directamente en el store.
10. `RaceTitle.vue`: reemplazar props por lectura del store (`routeConfig`, `eventCity`).
11. `ElevationChart.vue`: sin cambios (recibe props de `PlayBack` que ahora lee del store).

**Fase 4 — Adaptar composables (✅ completada):**

12. `useRouteAnimation`: recibe el store en lugar de `(props, emit)`. Lee `store.progress`, `store.isPlaying`, `store.speed` y escribe `store.setProgress()` directamente.
13. `usePlaybackStats`: recibe el store en lugar de props. Computed values se basan en `store.progress`, `store.elevationProfile`, `store.totalDistance`.
14. `useScrub`: recibe el store; invoca `store.setProgress()` en lugar de `emit('update:progress')`.

**Fase 5 — Limpieza (✅ completada):**

15. Eliminar props obsoletas de `RouteMapView` → hijos.
16. Eliminar emits obsoletos de componentes hijos.
17. Verificar que no queden refs locales duplicando state del store.
18. Actualizar `RouteMapView` template: los componentes hijos ya no necesitan bindings de props/events para estado del playback.

Archivos nuevos: `src/stores/playbackStore.js`.  
Archivos modificados: `main.js`, `RouteMapView.vue`, `RouteMap.vue`, `PlayBack.vue`, `RaceTitle.vue`, `useRouteAnimation.js`, `usePlaybackStats.js`, `useScrub.js`.  
Dependencia nueva: `pinia`.

### 4.11 Mejorar rendimiento y estabilidad de la animación del mapa (prioridad alta)

Solucionar problemas de rendimiento visual en la animación: la cabeza de ruta (head marker) se retrasa respecto a la posición real, los popups de marcas vibran/tiemblan mientras son visibles, y las transiciones de cámara presentan motion blur e inestabilidad.

**Fase 1 — Estabilizar la cabeza de ruta (head marker): ✅ COMPLETADA**

1. ~~**Reemplazar el circle layer por un HTML marker**~~: migrado a `mapboxgl.Marker` con elemento HTML custom (`div` con CSS, `will-change: transform`), posicionado con `marker.setLngLat()`. Se eliminó el source GeoJSON `head` y el layer `headLayer` de `useMapLayers`. La visibilidad se controla con `display: none/block` en `showAnimationLayers()`/`showOverviewLayers()`.
2. ~~**Sincronizar head con cámara**~~: en `updateDisplay()` se reordenó para que `headMarker.setLngLat()` y `updateHeadPosition()` se ejecuten ANTES de `computeCameraPosition()`, eliminando el desfase visual.
3. ~~**Reducir overhead de `setData()`**~~: eliminado por completo — ya no existe la source GeoJSON `head` ni la llamada `map.getSource('head').setData(...)`. El reemplazo por `headMarker.setLngLat([lng, lat])` es una operación de DOM puro (CSS transform), sin pasar por el pipeline de rendering de Mapbox.

**Fase 2 — Estabilizar popups de marcas (vibración): ✅ COMPLETADA**

4. ~~**Fijar popup con `trackPointer: false`**~~: se agregó `trackPointer: false` y `closeOnMove: false` explícitamente al constructor del popup en `useMarkPopup`. Además, `show()` ahora cachea la `lngLat` del cluster activo y cuando se llama repetidamente con las mismas coordenadas (mismo cluster) es un no-op — ya no se reposiciona ni reconstruye HTML cada frame.
5. ~~**Desacoplar popup del frame loop**~~: se agregó un mecanismo de debounce por delta de phase en `useMarkers.updateHeadPosition()`. Solo evalúa clusters si `|phase - lastCheckedPhase| > MIN_PHASE_DELTA` (0.0005 = ~21 m en 42 km). Esto reduce las evaluaciones de ~60/s a solo cuando el head ha avanzado una distancia significativa.
6. ~~**Usar coordenadas fijas de cluster**~~: `showPopup(c.center, c.marks)` ya usaba coordenadas pre-calculadas del cluster, pero se llamaba repetidamente dentro de la ventana de fase. Ahora `show()` en `useMarkPopup` compara un cache key (`lng,lat`) y no reposiciona si el mismo cluster ya está visible. `lastCheckedPhase` se resetea en `resetPopup()` y al pausar.

**Fase 3 — Suavizar transiciones de cámara: ✅ COMPLETADA**

7. ~~**Reemplazar `jumpTo` por interpolación manual**~~: `computeCameraPosition()` ahora usa lerp (linear interpolation) con `CAM_LERP_ALPHA = 0.08` entre la posición actual de la cámara (`camCenter`, `camBearing`) y la posición objetivo. El `jumpTo` se mantiene como primitiva final pero recibe coordenadas ya suavizadas, creando un efecto de "cámara con inercia" que elimina el motion blur frame a frame. Se incluye `lerpBearing()` con wraparound ±180° para rotación por el camino más corto. El estado `camCenter` se resetea a `null` en seek, restart y transiciones flyTo para re-converger instantáneamente.
8. ~~**Calcular bearing de forma continua**~~: el bearing constante `startBearing - phase * 300.0` fue reemplazado por `bearingAtPhase(phase)` que calcula el ángulo tangente a la ruta usando `turf.bearing` entre el punto actual y un punto ~0.5% de la ruta más adelante. Esto hace que la cámara siga la dirección natural del recorrido en curvas.
9. ~~**Ajustar duración de `flyTo` en pause/resume**~~: todas las transiciones `flyTo` reducidas de 3000–4000ms a `2000ms`. Se agregó `essential: true` para evitar interrupciones inadvertidas del usuario. La transición de pause (fit bounds) incluye `easing: (t) => t * (2 - t)` (easeOutQuad) para desaceleración suave.

**Fase 4 — Optimización general del frame loop: ✅ COMPLETADA**

10. ~~**Batch DOM updates**~~: `updateDisplay()` fue reestructurado en dos bloques explícitos: Batch 1 (DOM puro: `headMarker.setLngLat()` + `updateHeadPosition()`) y Batch 2 (Mapbox GL: `computeCameraPosition()` + `setPaintProperty('line-gradient')`). Esto minimiza el intercalado entre operaciones DOM y WebGL.
11. ~~**Throttle de `store.setProgress()`**~~: se agregó un timestamp check (`PROGRESS_THROTTLE_MS = 50`) en el frame loop. `store.setProgress()` solo se llama si han pasado ≥50ms desde la última emisión (~20 fps), o si `phase >= 1` (para garantizar que el final siempre se notifica). Reduce la carga de reactividad Vue de ~60 a ~20 actualizaciones/segundo.
12. ~~**Pre-calcular coordenadas por fase**~~: durante `setup()` se pre-computa un array de `NUM_SAMPLES = 1000` puntos a lo largo de la ruta usando `turf.along()`. La función `coordAtPhase(phase)` hace un lookup O(1) por índice con interpolación lineal entre las dos muestras más cercanas. Elimina el costoso `turf.along()` del frame loop. `bearingAtPhase()` también opera sobre este array via `coordAtPhase()`.

Archivos modificados: `useRouteAnimation.js`, `useMapLayers.js`, `useMarkers.js`, `useMarkPopup.js`.  
Archivos nuevos: ninguno (refactoring interno de composables existentes).

### 4.12 Módulo de grabación de pantalla (prioridad media)

Implementar un sistema de grabación de la animación del mapa para exportar video. Incluye un botón de grabación, countdown visual, modo fullscreen sin controles, y captura vía MediaRecorder API.

**Fase 1 — Store de grabación:**

1. Crear `src/stores/recordingStore.js` — `defineStore('recording', ...)` con:
   - **State**: `isRecording` (bool), `isCountingDown` (bool), `countdown` (3, 2, 1, 0), `recordingBlob` (Blob|null), `uiHidden` (bool).
   - **Getters**: `isPreparingOrRecording` (countdown o recording activo).
   - **Actions**: `startRecordingFlow()`, `stopRecording()`, `resetRecording()`.

**Fase 2 — Composable `useScreenRecording`:**

2. Crear `src/composables/useScreenRecording.js`:
   - `startRecordingFlow(container)` — orquesta la secuencia completa:
     a. Resetear el playback al inicio (`playbackStore.reset()` o `playbackStore.setProgress(0)` + `playbackStore.pause()`).
     b. Activar fullscreen en el contenedor de la ruta (`container.requestFullscreen()`).
     c. Ocultar controles: `recordingStore.uiHidden = true` (PlayBack y botón de grabación se ocultan vía `v-show`).
     d. Iniciar countdown de 3 a 1 (con `setTimeout` o `requestAnimationFrame`, ~1s por step).
     e. Al llegar a 0: iniciar `MediaRecorder` sobre un stream del canvas (`container.captureStream(30)` ó `navigator.mediaDevices.getDisplayMedia()`).
     f. Iniciar playback: `playbackStore.play()`.
   - `stopRecording()` — detiene MediaRecorder, sale de fullscreen, restaura visibilidad de controles, genera Blob y ofrece descarga.
   - `onAnimationComplete()` — callback que detiene la grabación cuando la animación llega a `progress === 1`.

**Fase 3 — Componente `RecordButton.vue`:**

3. Crear `src/components/RecordButton.vue`:
   - Botón circular con ícono de grabación (●) posicionado sobre el mapa.
   - `v-show="!recordingStore.uiHidden"` — se oculta durante la grabación.
   - Click invoca `useScreenRecording.startRecordingFlow()`.
   - BEM: `.record-btn`, `.record-btn__icon`, `.record-btn--active`.

4. Crear `src/components/icons/IconRecord.vue`:
   - Ícono SVG de círculo relleno (●) con props `size` y `color`.

**Fase 4 — Overlay de countdown:**

5. Crear `src/components/RecordCountdown.vue`:
   - Overlay fullscreen semitransparente con número grande (3, 2, 1) centrado.
   - Animación CSS de scale + fade por cada step.
   - `v-if="recordingStore.isCountingDown"` — visible solo durante countdown.
   - BEM: `.record-countdown`, `.record-countdown__number`, `.record-countdown__overlay`.

**Fase 5 — Integración en `RouteMapView`:**

6. Agregar `RecordButton` y `RecordCountdown` al template de `RouteMapView`.
7. `PlayBack` y `RaceTitle` reciben visibilidad condicional durante grabación:
   - `PlayBack`: `v-show="!recordingStore.uiHidden"` para controles, pero el perfil de elevación y stats permanecen visibles (extraer a sub-componente si es necesario o aplicar visibilidad granular con CSS).
   - `RaceTitle`: `v-show="!recordingStore.uiHidden"` — se oculta durante grabación.
   - Alternativa: aplicar clase CSS `.recording-mode` al contenedor y ocultar elementos con `display: none` selectivo.
8. Conectar el evento de fin de animación (`progress === 1`) con `stopRecording()`.

**Fase 6 — Descarga y limpieza:**

9. Al finalizar la grabación, generar URL del Blob y disparar descarga automática como `.webm` (o `.mp4` si el codec está soportado).
10. Restaurar: salir de fullscreen, mostrar controles, resetear `recordingStore`.
11. Manejar edge cases: usuario presiona Escape durante fullscreen, error en MediaRecorder, navegador sin soporte.

**Nota sobre captura**: `HTMLCanvasElement.captureStream()` requiere que el mapa Mapbox use `preserveDrawingBuffer: true` en la inicialización. Verificar impacto en rendimiento y agregar esta opción condicionalmente (solo cuando se activa grabación, o re-inicializar el mapa). Alternativa: `navigator.mediaDevices.getDisplayMedia()` captura toda la pantalla sin necesidad de `preserveDrawingBuffer`, pero requiere permiso del usuario.

Archivos nuevos: `src/stores/recordingStore.js`, `src/composables/useScreenRecording.js`, `src/components/RecordButton.vue`, `src/components/RecordCountdown.vue`, `src/components/icons/IconRecord.vue`.  
Archivos modificados: `RouteMapView.vue`, `PlayBack.vue`, `RouteMap.vue` (agregar `preserveDrawingBuffer`), `tokens.js` (tokens de z-index y colores para countdown overlay).

---

## 5. Reglas para contribuir

### 5.1 Reglas generales

1. **No hardcodear colores ni tamaños**: usar siempre `var(--token)` en CSS o importar `tokens` en JS.
2. **No duplicar estado**: la fuente de verdad del playback está en el store Pinia (`playbackStore`); durante la migración puede estar temporalmente en `RouteMapView`. Nunca mantener estado duplicado en hijos.
3. **Lazy-load assets pesados**: usar `import()` dinámico para GeoJSON, CSVs y vistas.
4. **Comentar closures complejas**: las funciones de animación en `useRouteAnimation` deben documentar qué variables capturan y por qué.
5. **Mantener event.json actualizado**: toda ruta nueva requiere su entrada aquí con todos los campos requeridos (`id`, `name`, `distance`, `distanceUnit`, `difficulty`, `type`, `description`, `duration`, `zoom`).
6. **Probar ambos temas**: verificar que los cambios visuales funcionen en dark y light mode.
7. **Responsive**: verificar en mobile (≤768px) y tablet (≤1024px).
8. **Actualizar documentación ante cambios arquitectónicos**: cualquier refactorización que implique rediseño de arquitectura (mover/renombrar carpetas, cambiar flujo de datos), creación de nuevos componentes o composables, o incorporación de nuevas librerías/herramientas, **debe incluir obligatoriamente** la actualización de:
   - **Este archivo** (`.github/instructions/path animation.instructions.md`): actualizar secciones de arquitectura, convenciones, patrones y plan de refactorización según corresponda.
   - **`README.md`**: actualizar diagrama de arquitectura, stack tecnológico, comandos y cualquier sección afectada.
   - La PR/commit no se considera completa hasta que ambos archivos reflejen el estado actual del proyecto.

### 5.2 Agregar una nueva funcionalidad (feature)

Al implementar una nueva funcionalidad, seguir este checklist:

1. **Planificación**:
   - Definir claramente el alcance de la feature y los archivos que se verán afectados.
   - Si la feature requiere nuevos datos, definir primero el esquema en `event.json` o crear nuevos archivos en `assets/`.
   - Evaluar si la lógica es reutilizable — si lo es, crear un composable en `src/composables/`.

2. **Estructura de archivos**:
   - **Componentes nuevos**: colocar en `src/components/`. Si es un subcomponente específico de otro, considerar si es mejor como componente independiente o como parte de un composable.
   - **Composables nuevos**: colocar en `src/composables/` con prefijo `use` (ej. `useNewFeature.js`). Documentar con JSDoc: parámetros, retorno y responsabilidades.
   - **Vistas nuevas**: colocar en `src/views/`, registrar la ruta en `src/router/index.js` y usar lazy-loading (`() => import('@/views/NewView.vue')`).
   - **Iconos nuevos**: crear componente en `src/components/icons/` siguiendo el patrón existente (props `size` y `color`).
   - **Configuración nueva**: si requiere variables de entorno, agregar con prefijo `VITE_` en `.env` y documentar en la tabla de sección 2.5.

3. **Estilo y CSS**:
   - Usar `<style scoped>` en todos los componentes nuevos.
   - Seguir BEM (`bloque__elemento--modificador`) para nomenclatura de clases.
   - Referenciar solo tokens CSS (`var(--token)`), nunca valores literales de color/tamaño.
   - Agregar nuevos tokens a `src/theme/tokens.js` si se necesitan valores que no existen. Recordar que cambios en `tokens.js` requieren reiniciar el dev server.
   - Actualizar `tokensToCSS.js` si se agregan nuevas categorías de tokens.

4. **Integración con estado existente**:
   - **Con Pinia (preferido)**: si la feature afecta el playback o la grabación, usar el store correspondiente (`playbackStore`, `recordingStore`). Leer estado con `storeToRefs()`, mutar con actions.
   - **Sin Pinia (legacy)**: si la feature afecta componentes que aún no se han migrado al store, respetar el flujo unidireccional: hijos emiten eventos → padre actualiza estado → hijos reciben por props.
   - Si la feature es independiente del playback, puede manejar su propio estado local o crear un store dedicado si otros componentes lo necesitan.

5. **Testing y verificación**:
   - Ejecutar `npm run build` y verificar que no haya errores.
   - Probar en ambos temas (dark y light).
   - Probar en viewports: desktop (>1024px), tablet (≤1024px) y mobile (≤768px).
   - Si la feature toca la animación, verificar play/pause/scrub/speed en al menos una ruta estándar y una legacy.

6. **Documentación**:
   - Actualizar **este archivo** (`path animation.instructions.md`): agregar el composable/componente en la sección de estructura correspondiente (2.1, 2.2), documentar el patrón en la sección 3 si introduce un nuevo patrón, y registrar la feature en la sección 4 si es una tarea planificada.
   - Actualizar **`README.md`**: agregar al diagrama de arquitectura y al flujo de datos si la feature introduce nuevas relaciones entre componentes.
