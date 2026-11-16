# PerfSuarez-Catalogo

Catálogo estático de Perfumería Suárez construido en HTML, CSS y JavaScript vanilla.

La versión actual ya no es una simple landing con una sola grilla. El proyecto funciona como una mini app estática con:

- shell principal tipo SPA en `index.html`
- navegación horizontal por paneles embebidos en `iframe`
- rutas amigables (`/perfumeria`; las viejas `/perfumes`, `/decants`, `/cuadros` y `/armarcombo` abren su sala de Perfumería)
- includes dinámicos para `header`, `footer` y dock de navegación
- búsqueda interna
- detalle de perfume
- carrito persistido en `localStorage`, con miniaturas y tema por sala
- pedido por WhatsApp con imagen (hoja de compartir del teléfono)
- `Contacto` como vista auxiliar (`Mystery Box` y `Velas` están discontinuados)

## Estado actual

- Stack: HTML + CSS + JS sin framework
- Build step: no existe
- Backend: no requerido para operar el catálogo
- Datos de producto: `js/data/perfumes-data.js`
- Persistencia local: `localStorage` y `sessionStorage`
- Producción: sitio estático con soporte a rutas shell

## Arquitectura

### 1. Shell principal

La entrada principal es [index.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/index.html). Esa página monta:

- `header.html` por include
- un `swipe-track` con paneles embebidos
- `catalog-nav.html` por include

Paneles principales (Oct 2026):

- `catalogo.html` (Inicio)
- `perfumeria.html` (Perfumería: Perfumes, Decants, Cuadros y Arma tu combo como salas)

Panel auxiliar:

- `search.html`
- `perfume.html`
- `contacto.html`

`perfumes.html`, `decants.html`, `cuadros.html` y `armarcombo.html` quedaron como
redirecciones a su sala para no romper links viejos.

La shell y el ruteo viven principalmente en:

- [js/core/app.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/core/app.js)
- [js/viewmodels/shell.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/shell.viewmodel.js)
- [js/views/shell.view.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/views/shell.view.js)

### 2. Includes dinámicos

El header, footer y dock inferior no están hardcodeados en cada página. Se cargan con fetch desde:

- [js/include.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/include.js)
- [js/viewmodels/include.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/include.viewmodel.js)
- [js/views/include.view.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/views/include.view.js)

Esto además reescribe rutas relativas de `src`, `href` y `form[action]` para que funcionen tanto dentro de la shell como fuera de ella.

### 3. Navegación

Routing sin trucos de hosting (sirve igual en GitHub Pages, Cloudflare, `npx serve` o `python3 -m http.server`):

- La única URL pública es `/`. La sección va en su query: `/?seccion=perfumeria&sala=decants`, `/?seccion=perfume&id=…`, `/?seccion=search&q=…`, `/?seccion=contacto`.
- Los paneles (iframes) reciben sus parámetros en el **hash**: `perfumeria.html#sala=decants`, `perfume.html#id=…&tipo=cuadro`, `search.html#q=…`. El hash no viaja al servidor, así que sobrevive a los hosts que redirigen `x.html` → `x` descartando el query (`npx serve`, Cloudflare Pages). Se leen con `App.core.parametros()`, que también acepta el query.
- Dentro de la shell se navega con `catalogShellNavigate`. Una página abierta sola (por ejemplo `perfume.html#id=…`) funciona como página normal, sin redirecciones.
- No hay `404.html` que redirija ni `sessionStorage` de por medio. `perfumes.html`, `decants.html`, `cuadros.html` y `armarcombo.html` son un `meta refresh` común a su sala, para los links viejos.

## Páginas principales

### Inicio

- archivo: [catalogo.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/catalogo.html)
- propósito: home del catálogo dentro de la shell
- contiene buscador principal y accesos rápidos a secciones

Lógica:

- [js/viewmodels/home.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/home.viewmodel.js)

### Perfumería

- archivo: [perfumeria.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/perfumeria.html)
- salas: Perfumes, Decants, Cuadros y Arma tu combo (`?sala=decants|cuadros|combo`)
- cada sala tiene su grilla y su estado de filtros y scroll; el shell avisa los cambios de sala con `window.alCambiarRuta` en vez de recargar el iframe
- cada producto es una "pieza": el frasco parado en una hornacina de mármol. La foto (fondo blanco) se multiplica sobre la piedra y se apoya en el piso con el encuadre medido por `scripts/medir-frascos.py` (`js/data/encuadre-frascos.json`)

Lógica:

- [js/viewmodels/perfumeria.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/perfumeria.viewmodel.js)
- [js/viewmodels/catalog-renderer.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/catalog-renderer.js) (`renderPieza`, `estiloFrasco`, orden y relevancia)
- [js/viewmodels/perfumeria-combo.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/perfumeria-combo.js)

### Búsqueda

- archivo: [search.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/search.html)
- muestra resultados a partir del parámetro `?q=`
- soporta filtros por marca, género, estilo, stock y novedad

Lógica:

- [js/models/search.model.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/models/search.model.js)
- [js/viewmodels/search.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/search.viewmodel.js)
- [js/search.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/search.js)

### Detalle de perfume

- archivo: [perfume.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/perfume.html)
- usa `?id=` para resolver un perfume del dataset
- renderiza galería, notas, precios, tamaños y CTA de carrito / WhatsApp
- el botón de volver usa la ruta recordada por la shell, no `history.back()` del iframe

### Arma Tu Combo (sala de Perfumería)

- combo de 3 perfumes completos (precio de combo) o set de 5 a 10 decants (10 % + 2 % por cada uno extra sobre 5)
- la cuenta y la salida son las de siempre: `resumenCombo` y `mensajeCombo` en [js/models/combo.model.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/models/combo.model.js), y el carrito recibe `createComboItem(resumen)` sin cambios (paridad verificada contra el armador anterior)
- `?sala=combo&con=<id>&tipo=perfumes|decants` precarga un producto (el detalle lo usa en "Sumarlo a un combo")

### Contacto

- archivo: [contacto.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/contacto.html)
- vista auxiliar, enlazada desde el menú

`mysterybox.html` y `velas.html` están discontinuados: siguen en el repo pero no se enlazan ni se rediseñaron.

## Header, búsqueda global y carrito

El header se define en [header.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/header.html) e incluye:

- navegación superior
- buscador global
- acceso al carrito
- CTA de asesoría

Lógica relevante:

- [js/viewmodels/common.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/common.viewmodel.js)
- [js/viewmodels/search.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/search.viewmodel.js)
- [js/scripts.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/scripts.js)

El carrito:

- persiste en `localStorage`
- comparte estado entre shell y páginas embebidas
- construye mensajes de WhatsApp (el texto no cambió)
- soporta items de perfume, cuadro, combo y mystery box
- estilos en `css/components/cart.css`

## Pedido por WhatsApp con imagen

Un link `wa.me` solo lleva texto. [js/core/pedido.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/core/pedido.js) arma una ficha del pedido (canvas con miniaturas, precios y total) y:

- con hoja de compartir con archivos (teléfonos): `navigator.share({ files, text })`; el cliente elige WhatsApp y el chat de la tienda (no se puede fijar el número), y el texto queda copiado por si WhatsApp lo descarta
- sin ella (escritorio): abre `wa.me` con el texto y los links a las fotos, y descarga la ficha
- siempre está "Enviar solo texto"

Lo usan el carrito, el combo y el detalle.

## Identidad visual

- Tokens de Perfumería en `css/base/tokens.css` (`--m-*`)
- Tipografía: Bodoni Moda + Jost
- Mármol: procedural en [scripts/marmol-fuente.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/scripts/marmol-fuente.js), rasterizado al construir con `node scripts/build-marmol.cjs` → `imagenes/marmol.webp` (dibujarlo en el teléfono costaba ~4 s de CPU)
- QA visual: `node scripts/qa-capturas.cjs casos.json` (capturas reales en Chrome headless)

Storage actual:

- `perf-suarez-cart-v1`
- `perf-suarez-return-route`

## Estructura del proyecto

```text
PerfSuarez-Catalogo/
├── index.html
├── catalogo.html
├── perfumeria.html
├── search.html
├── perfume.html
├── contacto.html
├── perfumes.html / decants.html / cuadros.html / armarcombo.html   (redirecciones a su sala)
├── mysterybox.html / velas.html                                    (discontinuados)
├── header.html
├── footer.html
├── catalog-nav.html
├── css/
│   ├── base/
│   ├── components/
│   ├── layout/
│   ├── legacy/
│   ├── pages/
│   └── styles.css
├── js/
│   ├── core/
│   ├── data/
│   ├── models/
│   ├── views/
│   ├── viewmodels/
│   └── *.js
├── imagenes/
├── manifest.json
├── robots.txt
├── sitemap.xml
└── 404.html
```

## CSS

Entrada principal:

- [css/styles.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/styles.css)

Capas:

- base: tokens, documento, tipografía
- layout: header y footer
- components: dock del catálogo
- pages: estilos específicos por vista
- legacy: utilidades y estilos heredados que todavía existen en repo

Archivos importantes:

- [css/base/document.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/base/document.css)
- [css/layout/header.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/layout/header.css)
- [css/pages/swipe-hub.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/pages/swipe-hub.css)
- [css/pages/catalog-home.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/pages/catalog-home.css)
- [css/pages/catalog-shared.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/pages/catalog-shared.css)
- [css/pages/armarcombo.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/pages/armarcombo.css)
- [css/pages/perfume-detail.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/pages/perfume-detail.css)

## JS

### Core

- [js/core/app.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/core/app.js)
  centraliza navegación, normalización de rutas, acceso a shell y helpers de WhatsApp

### Models

- `catalog.model.js`: filtros y metadata de cards
- `search.model.js`: búsqueda textual sobre dataset
- `combo.model.js`: armado de productos para combos

### Views / Viewmodels

- `shell.viewmodel.js`: navegación horizontal, history API, iframes, meta tags
- `common.viewmodel.js`: UI común, menú, estado de include, offset en embed
- `search.viewmodel.js`: dropdown de búsqueda del header y página de resultados
- `combo.viewmodel.js`: builder de combos
- `catalog.viewmodel.js`: filtros y paginación en grillas
- `catalog-renderer.js`: render inicial de cards desde `perfumes-data.js`

### Script transversal

- [js/scripts.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/scripts.js)
  contiene el modelo y la UI del carrito

## Dataset

El catálogo se alimenta desde:

- [js/data/perfumes-data.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/data/perfumes-data.js)

Ese archivo contiene:

- identificador del perfume
- nombre visible e interno
- marca
- tags
- imágenes de frasco y decant
- stock
- precios de completos
- precios de decants
- precios de combo cuando aplican
- notas olfativas

## Desarrollo local

Opciones simples:

1. abrir con Live Server en VS Code
2. usar un server estático
3. levantar `python3 -m http.server`
4. levantar `php -S localhost:8000`

Se recomienda usar servidor local en vez de abrir archivos con `file://` porque:

- hay includes por `fetch`
- hay reescritura de rutas
- hay assets y formularios internos

## Rutas y comportamiento en desarrollo

Es igual en local y en producción:

- `/` abre la shell completa; `/?seccion=…` abre una sección directa
- las páginas internas se pueden abrir solas (`perfume.html#id=…`, `perfumeria.html#sala=cuadros`) sin redirección

## Convenciones prácticas para tocar el repo

- mantener nuevas páginas dentro del patrón actual de `views` + `viewmodels` cuando aplique
- no mezclar CSS nuevo con CSS legacy si no es estrictamente necesario
- si una vista moderna ya tiene CSS propio en `css/pages/`, evitar redefinir sus selectores desde `css/legacy/`
- si agregas una nueva ruta shell, actualizar:
  - `js/viewmodels/shell.viewmodel.js` (`PANEL_META` o `AUXILIARES`, y `PARAMETROS_DE` si recibe parámetros)
  - metadatos SEO si corresponde

## Problemas recientes ya corregidos

Los fixes más recientes incorporados al repo incluyen:

- buscador web del header convertido a dropdown real
- eliminación del widget de búsqueda flotante permanente
- retorno correcto desde detalle de perfume al catálogo previo
- sincronización robusta del carrito entre shell e iframes
- limpieza del conflicto de scroll duplicado en `Arma Tu Combo` provocado por CSS legacy superpuesto

## Archivos que conviene revisar antes de cambios grandes

- [index.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/index.html)
- [header.html](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/header.html)
- [css/styles.css](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/css/styles.css)
- [js/core/app.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/core/app.js)
- [js/scripts.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/scripts.js)
- [js/viewmodels/shell.viewmodel.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/viewmodels/shell.viewmodel.js)
- [js/data/perfumes-data.js](/Users/alexjarkov/Documents/GitHub/PerfSuarez-Catalogo/js/data/perfumes-data.js)

## Git

Ramas que se han estado usando operativamente:

- `test`
- `master`

Si haces cambios que afecten shell, rutas, carrito o includes, conviene probar al menos:

- navegación entre paneles
- búsqueda global
- apertura de detalle
- volver al catálogo
- añadir al carrito desde perfume
- añadir combo
- añadir mystery box

