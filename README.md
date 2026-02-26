# Maratón de Cali

Aplicación web interactiva para visualizar las rutas de la **Maratón de Cali 2026**. Muestra cada recorrido sobre un mapa Mapbox con animación de trayecto, perfil de elevación en tiempo real y controles de reproducción (play/pause, velocidad, scrub). Incluye landing page del evento con tarjetas de ruta, tema claro/oscuro y despliegue en GitHub Pages.

> **Demo en vivo:** <https://datasantana.github.io/maraton-cali/>

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | **Vue 3** (Composition API, `<script setup>`) + Vue Router 4 + **Pinia** |
| Mapa | **Mapbox GL JS 3.12** |
| Cálculos geoespaciales | **Turf.js 3** (`turf.along`, `turf.lineDistance`) |
| Build | **Vite 6** (Rollup) |
| CSS | CSS custom properties (design tokens), sin preprocesador |
| Linting | ESLint + `eslint-plugin-vue` (vue3-essential) |
| Despliegue | **GitHub Pages** (SPA redirect con `404.html`) |

---

## Arquitectura

```
src/
├── main.js                  # Punto de entrada — monta App, router, Pinia (createPinia), CSS global
├── App.vue                  # Shell con <router-view/> y useTheme composable
│
├── router/index.js          # Rutas: / (home), /about, /route/:routeId
│
├── stores/
│   ├── playbackStore.js     # Estado global del playback y datos de ruta (Pinia)
│   └── recordingStore.js    # (Planificado) Estado de grabación de pantalla
│
├── composables/
│   ├── useRouteAnimation.js # Animación del mapa (frame loop con coord lookup O(1), cámara lerp, throttled progress)
│   ├── useMapLayers.js      # Sources/layers de Mapbox + HTML head marker (mapboxgl.Marker)
│   ├── useMarkers.js        # Marcas KM + popup por geofence de fase con debounce
│   ├── useMarkPopup.js      # (implícito) Popup reutilizable con cache de cluster (trackPointer:false)
│   ├── useScrub.js          # Interacción de scrub (mouse/touch) en barra de reproducción
│   ├── usePlaybackStats.js  # Estadísticas computadas del playback
│   └── useScreenRecording.js # (Planificado) Lógica de grabación de pantalla
│
├── config/
│   └── mapbox.js            # Configuración centralizada de Mapbox (token, style, center, zoom, pitch)
│
├── views/
│   ├── HomeView.vue         # Landing page (wrapper de EventHome)
│   ├── RouteMapView.vue     # Vista de ruta — orquesta RouteMap + PlayBack + RaceTitle
│   └── AboutView.vue        # Placeholder
│
├── components/
│   ├── EventHome.vue        # Landing: header, orquesta HeroSection + RouteCard + EventFooter
│   ├── HeroSection.vue      # Hero: título ciudad + fecha del evento
│   ├── RouteCard.vue        # Tarjeta individual de ruta (imagen, badge, descripción, botón)
│   ├── EventFooter.vue      # Footer del evento (logo, links, copyright)
│   ├── RouteMap.vue         # Mapa Mapbox con animación vía useRouteAnimation composable
│   ├── PlayBack.vue         # Barra de reproducción: orquesta useScrub + usePlaybackStats + ElevationChart
│   ├── ElevationChart.vue   # Mini gráfico SVG de elevación con gradiente de progreso
│   ├── RaceTitle.vue        # Overlay con nombre, tipo, ciudad y dificultad de la ruta
│   ├── LoadingSpinner.vue   # Spinner animado reutilizable con mensaje opcional
│   ├── ErrorMessage.vue     # Mensaje de error reutilizable con botón de retry
│   ├── RecordButton.vue     # (Planificado) Botón de grabación de pantalla
│   ├── RecordCountdown.vue  # (Planificado) Overlay countdown 3-2-1 para grabación
│   └── icons/               # Componentes SVG icon reutilizables (IconPlay, IconPause, IconRecord, etc.)
│
├── theme/
│   ├── index.js             # Barrel export (useTheme + tokens)
│   ├── tokens.js            # Tokens de diseño centralizados (colores, tipografía, layout)
│   ├── tokensToCSS.js       # Generador: tokens.js → CSS custom properties
│   ├── useTheme.js          # Composable — toggle dark/light, localStorage, cross-tab sync
│   ├── themeMixin.js        # (Legacy, ya no se importa — conservado como referencia)
│   └── variables.css        # Shell — contenido generado por cssTokensPlugin desde tokens.js
│
├── utils/
│   ├── parseElevationCsv.js # Parser CSV → array de objetos con tipos numéricos
│   └── flattenGeoJson.js   # Strips 3D (Z) coords and normalises geometries to flat 2D LineStrings/Points
│
└── assets/
    ├── event.json           # Config centralizada del evento (ciudad, fecha, rutas)
    ├── routes/*.geojson     # Geometrías GeoJSON (LineString + Points) por ruta
    ├── elevation/*.csv      # Perfiles de elevación por ruta
    └── marks/*.json         # Marcas legacy (5k, 10k, 21k)
```

### Flujo de datos principal

```
event.json ──▶ EventHome (orquestador) ──▶ router-link /route/:id
                 ┌──────┼──────┐
                 ▼      ▼      ▼
            HeroSection RouteCard EventFooter
                                      │
                                      ▼
                             RouteMapView (orquestador)
                              ┌───────┼───────┐
                              ▼       ▼       ▼
                         RouteMap  PlayBack  RaceTitle
                              │    ┌──┼──┐      │
                              │    ▼  ▼  ▼      │
                              │  ElevChart       │
                              │  useScrub         │
                              │  usePlaybackStats │
                              ▼                   │
                     useRouteAnimation         │
                       ┌──────┼──────┐    │
                       ▼      ▼      ▼    │
                  useMapLayers useMarkers  │
                              │           │
                     ────────▼─────────▼───
                     │   playbackStore (Pinia)  │
                     ──────────────────────────
```

1. **`RouteMapView`** delega la carga de assets al store: `playbackStore.loadRoute(routeId)`. Es un orquestador ligero que sólo gestiona el watcher de ruta y el error boundary.
2. La **fuente de verdad** del estado de reproducción (`progress`, `isPlaying`, `speed`) y los datos de ruta (`pathData`, `elevationProfile`, etc.) es `playbackStore`.
3. **`RouteMap`** lee el store directamente vía `useRouteAnimation(store)`, que escribe `store.setProgress()` cada frame y lee `store.isPlaying`/`store.speed`.
4. **`PlayBack`** lee el store con `storeToRefs()` e invoca actions (`store.togglePlay()`, `store.setSpeed()`, `store.setProgress()` vía `useScrub(store)`).
5. **`RaceTitle`** lee `store.routeConfig` y `store.eventCity` directamente.
6. **`ElevationChart`** sigue recibiendo props de `PlayBack` (componente presentacional puro).
7. La comunicación es **store-driven**: no hay prop drilling ni emits para el estado del playback. La única prop que `RouteMapView` pasa es `fullscreenContainer` a `RouteMap`.

### Sistema de temas

- **`useTheme()`** composable se usa en `App.vue` (inicialización global) y `EventHome.vue` (toggle).
- Retorna `{ isLightTheme, toggleTheme }` — ref reactiva y función de toggle.
- Agrega/quita la clase `.light-theme` en `<html>`, con persistencia en localStorage y sincronización cross-tab.
- Las variables CSS en `variables.css` (`:root` = dark, `.light-theme` = light) se aplican globalmente.
- `tokens.js` es la única fuente de verdad; `tokensToCSS.js` genera las custom properties automáticamente en build/dev time.
- El Vite plugin `cssTokensPlugin` intercepta la carga de `variables.css` y la reemplaza con el CSS generado.

### Datos de rutas

Cada ruta se configura en `event.json` y sus assets siguen una convención de nombres:

| Asset | Ruta estándar | Ruta legacy |
|---|---|---|
| Geometría | `routes/{id}.geojson` | `routes/{id}.json` + `marks/{id}.json` |
| Elevación | `elevation/{id}.csv` | — |

El GeoJSON estándar contiene un `LineString` (trayecto) y `Point` features (waypoints enriquecidos).

---

## Configuración

### Variables de entorno

Copiar `.env.example` → `.env` y configurar:

```dotenv
VITE_MAPBOX_ACCESS_TOKEN=tu_token_aquí
VITE_MAPBOX_STYLE=mapbox://styles/mapbox/standard
VITE_MAPBOX_CENTER_LNG=-76.5410942407
VITE_MAPBOX_CENTER_LAT=3.4300127118
```

### Instalación y desarrollo

```bash
npm install        # Instalar dependencias
npm run dev        # Dev server con hot-reload (Vite)
npm run build      # Build de producción (output en dist/)
npm run preview    # Preview del build de producción
npm run lint       # Lint
```

### Configuración de Vite (`vite.config.js`)

- `base` → `/maraton-cali/` en producción (GitHub Pages).
- Alias `@` → `src/`.
- `.csv` importados con sufijo `?raw` para texto plano.
- `.geojson` transformados a módulos JSON vía plugin custom.
- **`cssTokensPlugin`** intercepta `variables.css` y genera CSS custom properties desde `tokens.js` vía `tokensToCSS.js`.

---

## Despliegue

La app se despliega como SPA en **GitHub Pages**. El archivo `public/404.html` redirige rutas desconocidas al `index.html` usando el patrón [spa-github-pages](https://github.com/rafgraph/spa-github-pages), y un script en `index.html` restaura la ruta original para Vue Router.

---

## Licencia

Este proyecto es privado.
