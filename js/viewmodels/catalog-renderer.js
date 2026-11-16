(function (App) {
    'use strict';

    function buildTagsHtml(perfume, mode) {
        const parts = [];
        const inStock = inStockFor(perfume, mode);

        if (!inStock) {
            parts.push('<span class="etiqueta fuera-de-stock">Fuera de stock</span>');
        }
        if (isOnSale(perfume, mode)) {
            parts.push('<span class="etiqueta oferta">Oferta</span>');
        }
        if (perfume.etiqueta === 'novedad') {
            parts.push('<span class="etiqueta novedad">Nuevo</span>');
        }
        if (perfume.etiqueta === 'a-pedido') {
            parts.push('<span class="etiqueta a-pedido">A Pedido</span>');
        }

        return parts.length ? `<div class="etiquetas">${parts.join('')}</div>` : '';
    }

    // Una entrada de precio en oferta válida: bandera activa, precio de oferta
    // presente y estrictamente menor que el original.
    function ofertaValida(perfume, original, oferta) {
        return !!perfume.oferta
            && oferta != null && oferta !== ''
            && Number(oferta) > 0 && Number(oferta) < Number(original);
    }

    // Lo que paga el cliente: el de oferta si es válida (como en el render).
    function precioEfectivo(perfume, original, oferta) {
        return Number(ofertaValida(perfume, original, oferta) ? oferta : original);
    }

    // Renderiza un precio: si está en oferta, original tachado + precio rebajado.
    function priceValueHtml(perfume, original, oferta) {
        if (ofertaValida(perfume, original, oferta)) {
            return `<span class="price-old">${original} Bs</span> <span class="price-sale">${oferta} Bs</span>`;
        }
        return `${original} Bs`;
    }

    function buildPriceHtml(perfume, mode) {
        if (mode === 'cuadros') {
            if (perfume.precio_cuadro == null) return '';
            return `<p class="price-label">Cuadro - ${perfume.precio_cuadro} Bs</p>`;
        }

        if (mode === 'perfumes') {
            const entries = App.core.stock.availableCompleteEntries(perfume);
            return entries.map(e => {
                const mlPart = e.ml != null ? `${e.ml} <strong>ml - </strong>` : '';
                const cls = ofertaValida(perfume, e.precio, e.precio_oferta) ? 'price-label price-label--oferta' : 'price-label';
                return `<p class="${cls}">${mlPart}${priceValueHtml(perfume, e.precio, e.precio_oferta)}</p>`;
            }).join('');
        }

        // decants
        const inStock = perfume.en_stock_decants;
        if (!inStock || !perfume.precios_decants) return '';

        const ofertas = perfume.precios_decants_oferta || {};
        const sizes = Object.keys(perfume.precios_decants)
            .map(Number)
            .sort((a, b) => a - b);

        return sizes
            .map(s => {
                const original = perfume.precios_decants[s];
                const oferta = ofertas[s];
                const cls = ofertaValida(perfume, original, oferta) ? 'price-label price-label--oferta' : 'price-label';
                return `<p class="${cls}">${s} <strong>ml - </strong>${priceValueHtml(perfume, original, oferta)}</p>`;
            })
            .join('');
    }

    // ¿La entrada está en oferta para el modo actual? (perfumes => completos;
    // decants => decants; cuadros => nunca).
    function isOnSale(perfume, mode) {
        if (!perfume.oferta) return false;
        if (mode === 'decants') {
            const o = perfume.precios_decants_oferta;
            const dec = perfume.precios_decants || {};
            return !!o && Object.keys(o).some(s => ofertaValida(perfume, dec[s], o[s]));
        }
        if (mode === 'perfumes') {
            const entries = App.core.stock.availableCompleteEntries(perfume);
            return entries.some(e => e && ofertaValida(perfume, e.precio, e.precio_oferta));
        }
        return false;
    }

    function getImage(perfume, mode) {
        if (mode === 'cuadros') {
            // Prefer the dedicated cuadro photo; fall back to the full-bottle catalog photo.
            return perfume.image_cuadro || perfume.image_miniatura || perfume.image_miniatura_decant || 'imagenes/image.webp';
        }
        if (mode === 'perfumes') {
            return perfume.image_miniatura || perfume.image_miniatura_decant || 'imagenes/image.webp';
        }
        return perfume.image_miniatura_decant || perfume.image_miniatura || 'imagenes/image.webp';
    }

    function getSortName(perfume) {
        return perfume.nombre_interno || `${perfume.marca || ''} ${perfume.nombre || ''}`.trim();
    }

    // Ordena por el precio que se paga hoy (con la oferta), el menor de las
    // presentaciones.
    function getSortPrice(perfume, mode) {
        if (mode === 'cuadros') {
            const value = Number(perfume.precio_cuadro);
            return Number.isFinite(value) ? value : Number.NaN;
        }

        if (mode === 'perfumes') {
            const entries = App.core.stock.availableCompleteEntries(perfume);
            const prices = entries.map(e => precioEfectivo(perfume, e.precio, e.precio_oferta)).filter(Number.isFinite);
            return prices.length ? Math.min(...prices) : Number.NaN;
        }

        if (!perfume.precios_decants) {
            return Number.NaN;
        }

        const ofertas = perfume.precios_decants_oferta || {};
        const prices = Object.keys(perfume.precios_decants)
            .map(size => precioEfectivo(perfume, perfume.precios_decants[size], ofertas[size]))
            .filter(Number.isFinite);

        return prices.length ? Math.min(...prices) : Number.NaN;
    }

    function getHypeRank(perfume, fallbackIndex) {
        // El ERP es la fuente de verdad del orden: si el API envía `orden`, se usa.
        if (perfume.orden != null && Number.isFinite(Number(perfume.orden))) {
            return Number(perfume.orden);
        }
        // Fallback (modo estático sin ERP): mapa curado (js/data/hype-ranks.json,
        // cargado por perfumes-data.js) y, por último, orden de aparición.
        const hypeRanks = (App.data && App.data.hypeRanks) || {};
        return Object.prototype.hasOwnProperty.call(hypeRanks, perfume.id)
            ? hypeRanks[perfume.id]
            : 1000 + fallbackIndex;
    }

    function compareCardsByName(a, b, direction) {
        const result = (a.dataset.sortName || '').localeCompare(b.dataset.sortName || '', 'es', { sensitivity: 'base' });
        return direction === 'desc' ? -result : result;
    }

    function compareCardsByHype(a, b) {
        const rankDiff = Number(a.dataset.hypeRank) - Number(b.dataset.hypeRank);
        if (rankDiff !== 0) return rankDiff;
        return Number(a.dataset.hypeIndex) - Number(b.dataset.hypeIndex);
    }

    function compareCardsByPrice(a, b, direction) {
        // Sin precio el atributo va vacío, y Number('') es 0: quedaba primero.
        const aPrice = a.dataset.sortPrice ? Number(a.dataset.sortPrice) : Number.NaN;
        const bPrice = b.dataset.sortPrice ? Number(b.dataset.sortPrice) : Number.NaN;
        const aHasPrice = Number.isFinite(aPrice);
        const bHasPrice = Number.isFinite(bPrice);

        if (aHasPrice && bHasPrice) {
            return direction === 'desc' ? bPrice - aPrice : aPrice - bPrice;
        }
        if (aHasPrice) return -1;
        if (bHasPrice) return 1;
        return compareCardsByName(a, b, 'asc');
    }

    function sortCards(cards, sortValue, gridEl) {
        const sorted = cards.slice().sort((a, b) => {
            if (sortValue === 'name-asc') return compareCardsByName(a, b, 'asc');
            if (sortValue === 'name-desc') return compareCardsByName(a, b, 'desc');
            if (sortValue === 'price-asc') return compareCardsByPrice(a, b, 'asc');
            if (sortValue === 'price-desc') return compareCardsByPrice(a, b, 'desc');
            return compareCardsByHype(a, b);
        });

        if (gridEl) {
            sorted.forEach(card => gridEl.appendChild(card));
        }

        return sorted;
    }

    function getCardSearchText(card) {
        return [
            card.dataset.name,
            card.dataset.tags,
            card.dataset.brand,
            card.textContent
        ].join(' ');
    }

    // Ordena por relevancia de búsqueda cuando hay término y el orden activo es
    // el predeterminado ("Más deseados"). Las mejores coincidencias (marca/nombre
    // exactos) quedan arriba; ante empate se respeta el orden del ERP (hype/orden).
    // Con un orden explícito (nombre/precio) o sin término, delega en sortCards.
    function sortCardsForQuery(cards, query, sortValue, gridEl) {
        const q = App.core.search.normalizeText(query || '');
        const useRelevance = q && (!sortValue || sortValue === 'hype');
        if (!useRelevance) {
            return sortCards(cards, sortValue, gridEl);
        }

        const sorted = cards.slice()
            .map((card, index) => ({ card, index, score: App.core.search.scoreMatch(q, getCardSearchText(card)) }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return compareCardsByHype(a.card, b.card);
            })
            .map(entry => entry.card);

        if (gridEl) {
            sorted.forEach(card => gridEl.appendChild(card));
        }

        return sorted;
    }

    function renderCard(perfume, mode, hypeIndex) {
        const img = getImage(perfume, mode);
        const tags = perfume.tags.join(' ');
        const priceHtml = buildPriceHtml(perfume, mode);
        const tagsHtml = buildTagsHtml(perfume, mode);
        const viewButtonHtml = mode === 'perfumes' || mode === 'decants' || mode === 'cuadros'
            ? '<button class="card-view-btn" type="button">Ver</button>'
            : '';
        const sortPrice = getSortPrice(perfume, mode);
        const priceAttr = Number.isFinite(sortPrice) ? String(sortPrice) : '';
        const hypeRank = getHypeRank(perfume, hypeIndex);
        const onSale = isOnSale(perfume, mode) ? '1' : '0';

        return `<div class="decant" data-name="${perfume.nombre_interno}" data-tags="${tags}" data-id="${perfume.id}" data-hype-index="${hypeIndex}" data-hype-rank="${hypeRank}" data-sort-name="${getSortName(perfume)}" data-sort-price="${priceAttr}" data-on-sale="${onSale}">
            <img src="${img}" alt="${perfume.nombre}" loading="lazy" decoding="async">
            <h3><strong>${perfume.marca}</strong></h3>
            <p>${perfume.nombre}</p>
            ${priceHtml}
            ${tagsHtml}
            ${viewButtonHtml}
        </div>`;
    }

    function renderCatalog(gridEl, mode) {
        if (!App.data || !App.data.perfumes) return [];

        const perfumes = App.data.perfumes.filter(p => {
            if (mode === 'perfumes') return p.precio_completo !== null || p.en_stock_completos === false;
            if (mode === 'decants') return p.precios_decants !== null || p.en_stock_decants === false;
            if (mode === 'cuadros') return p.precio_cuadro != null;
            return true;
        });

        // Filter: for perfumes mode, only include items that have precio_completo OR were listed as perfumes (have image_miniatura)
        const filtered = perfumes.filter(p => {
            if (mode === 'perfumes') return p.image_miniatura !== null;
            if (mode === 'decants') return p.image_miniatura_decant !== null || p.precios_decants !== null;
            if (mode === 'cuadros') return p.precio_cuadro != null;
            return true;
        });

        gridEl.innerHTML = filtered.map((p, index) => renderCard(p, mode, index)).join('');
        return Array.from(gridEl.querySelectorAll('.decant'));
    }

    /* ------------------------------------------------------------------
       Piezas de Perfumería (Oct 2026): cada producto es un frasco parado en
       una hornacina de mármol. Los cuadros, que ya vienen fotografiados en su
       pared, van enmarcados como lámina.
       ------------------------------------------------------------------ */

    const formatoBs = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });

    function bs(valor) {
        return `Bs ${formatoBs.format(Number(valor) || 0)}`;
    }

    function escapar(texto) {
        return String(texto == null ? '' : texto)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Encuadre típico de una foto sin medir (las que sirve el ERP).
    const ENCUADRE_TIPICO = [0.05, 0.95, 0.15, 0.85, 1];
    // Alto visible del frasco (fracción del alto de la hornacina) y el ancho
    // máximo (fracción del alto: la hornacina es 4:5, 0.8 × 0.74).
    const FRASCO_ALTO = { perfumes: 0.64, decants: 0.6 };
    const FRASCO_ANCHO_MAX = 0.59;

    // Encuadres medidos en el navegador: fotos que no están en el JSON
    // (nuevas, o servidas por el ERP). Viven lo que dura la página.
    const medidos = new Map();

    function claveDe(src) {
        let clave = String(src || '');
        const proxy = /[?&]path=([^&]+)/.exec(clave);
        if (proxy) {
            clave = `imagenes/${decodeURIComponent(proxy[1])}`;
        }
        return clave.replace(/^\/+/, '').normalize('NFC');
    }

    /** El encuadre conocido de la foto, o null si nadie lo midió todavía. */
    function encuadreConocido(src) {
        const clave = claveDe(src);
        if (medidos.has(clave)) return medidos.get(clave);
        const encuadres = (App.data && App.data.encuadres) || {};
        return encuadres[clave] || null;
    }

    function variablesFrasco(encuadre, mode) {
        const [arriba, abajo, izquierda, derecha, proporcion, fondo] = encuadre;
        const altoFrasco = Math.max(0.05, abajo - arriba);
        const anchoPorAlto = ((derecha - izquierda) * proporcion) / altoFrasco;
        const visible = Math.min(FRASCO_ALTO[mode] || 0.62, FRASCO_ANCHO_MAX / Math.max(anchoPorAlto, 0.01));
        const altoImagen = visible / altoFrasco;
        const fmt = n => `${(n * 100).toFixed(2)}%`;
        return {
            '--img-alto': fmt(altoImagen),
            '--pie': fmt((1 - abajo) * altoImagen),
            '--dx': fmt(0.5 - (izquierda + derecha) / 2),
            '--sombra': fmt((visible * anchoPorAlto) / 0.8),
            // Fondo gris claro: se lleva a blanco para que no deje recuadro.
            '--brillo': fondo ? Math.min(1.18, 255 / fondo).toFixed(3) : null
        };
    }

    /**
     * Variables CSS que apoyan el frasco en el piso. La foto entera se escala
     * pareja (nunca se deforma): solo cambian su alto y su posición.
     */
    function estiloFrasco(src, mode) {
        const vars = variablesFrasco(encuadreConocido(src) || ENCUADRE_TIPICO, mode);
        return Object.keys(vars).filter(k => vars[k] != null).map(k => `${k}:${vars[k]}`).join(';');
    }

    /**
     * Atributos del nicho: el estilo con el encuadre y el modo, para que
     * `ajustarFrasco` lo pueda recalcular al medir la foto. Una foto sin
     * medir se oculta hasta que se mide: si no, se la ve saltar de lugar.
     */
    function atributosNicho(src, mode) {
        return `style="${estiloFrasco(src, mode)}" data-frasco="${mode}"`
            + (encuadreConocido(src) ? '' : ' data-midiendo');
    }

    /* ---------- Medir el frasco real dentro de la foto ----------
       Mismo criterio que scripts/medir-frascos.py: la foto se achica a 240 px
       sobre blanco, el umbral de "frasco" se corre con el nivel del fondo
       (esquinas) y el recuadro sale de las filas y columnas con contenido. */
    const LADO_MEDIDA = 240;
    const UMBRAL_FRASCO = 238;
    const MINIMO_FRASCO = 0.006;
    let lienzoMedida = null;

    function medirFuente(fuente, ancho, alto) {
        if (!ancho || !alto) return null;
        const escala = LADO_MEDIDA / Math.max(ancho, alto);
        const w = Math.max(1, Math.round(ancho * escala));
        const h = Math.max(1, Math.round(alto * escala));
        if (!lienzoMedida) lienzoMedida = document.createElement('canvas');
        lienzoMedida.width = w;
        lienzoMedida.height = h;
        const ctx = lienzoMedida.getContext('2d', { willReadFrequently: true });
        // El transparente cuenta como fondo.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        // Achique con filtro, como el resize de PIL del script.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(fuente, 0, 0, w, h);
        const datos = ctx.getImageData(0, 0, w, h).data; // tira si la foto es de otro origen sin CORS
        const canal = (x, y) => {
            const i = (y * w + x) * 4;
            return Math.min(datos[i], datos[i + 1], datos[i + 2]);
        };
        const x1 = Math.min(1, w - 1), y1 = Math.min(1, h - 1);
        const nivel = Math.min(canal(x1, y1), canal(w - 1 - x1, y1), canal(x1, h - 1 - y1), canal(w - 1 - x1, h - 1 - y1));
        const umbral = Math.min(UMBRAL_FRASCO, nivel - 14);
        const filas = new Uint32Array(h);
        const columnas = new Uint32Array(w);
        for (let y = 0, i = 0; y < h; y++) {
            for (let x = 0; x < w; x++, i += 4) {
                if (datos[i] < umbral || datos[i + 1] < umbral || datos[i + 2] < umbral) {
                    filas[y]++;
                    columnas[x]++;
                }
            }
        }
        const minFila = MINIMO_FRASCO * w;
        const minColumna = MINIMO_FRASCO * h;
        let arriba = -1, abajo = -1, izquierda = -1, derecha = -1;
        for (let y = 0; y < h; y++) if (filas[y] >= minFila) { if (arriba < 0) arriba = y; abajo = y; }
        for (let x = 0; x < w; x++) if (columnas[x] >= minColumna) { if (izquierda < 0) izquierda = x; derecha = x; }
        if (arriba < 0 || izquierda < 0) return null;
        const base = baseSinReflejo(datos, w, h, nivel, umbral, arriba, abajo, izquierda, derecha);
        const r = n => Math.round(n * 1000) / 1000;
        const encuadre = [r(arriba / h), r(base / h), r(izquierda / w), r((derecha + 1) / w), r(ancho / alto)];
        if (nivel < 252) encuadre.push(nivel);
        return encuadre;
    }

    /**
     * Muchas fotos de estudio traen el reflejo del frasco en una superficie
     * brillante. Cuenta como "frasco" para el recuadro, y entonces el frasco
     * queda parado sobre su reflejo: flota sobre el piso de la hornacina.
     * El reflejo se reconoce porque arranca de golpe más claro que la base,
     * con el mismo ancho, nunca vuelve a oscurecer como ella y sus primeras
     * filas copian en espejo a las de arriba de la base. Devuelve la fila
     * (exclusiva) donde termina el frasco; sin reflejo, `abajo + 1`.
     * Criterio prototipado sobre las 958 fotos del catálogo: es conservador
     * (un reflejo dudoso se deja) porque cortar un frasco de verdad es peor.
     */
    function baseSinReflejo(datos, w, h, nivel, umbral, arriba, abajo, izquierda, derecha) {
        const alto = abajo - arriba + 1;
        const ancho = derecha - izquierda + 1;
        const oscuro = (x, y) => {
            const i = (y * w + x) * 4;
            return Math.max(0, nivel - Math.min(datos[i], datos[i + 1], datos[i + 2]));
        };
        const filaOscura = (y) => {
            const fila = new Float32Array(ancho);
            for (let x = 0; x < ancho; x++) fila[x] = oscuro(izquierda + x, y);
            return fila;
        };
        const suma = new Float32Array(h);
        for (let y = arriba; y <= abajo; y++) {
            let s = 0;
            for (let x = izquierda; x <= derecha; x++) s += oscuro(x, y);
            suma[y] = s;
        }
        const tramo = (y) => {
            let a = -1, b = -1;
            for (let x = izquierda; x <= derecha; x++) {
                const i = (y * w + x) * 4;
                if (datos[i] < umbral || datos[i + 1] < umbral || datos[i + 2] < umbral) { if (a < 0) a = x; b = x; }
            }
            return a < 0 ? null : [a, b];
        };
        const correlacion = (p, q) => {
            let mp = 0, mq = 0;
            for (let i = 0; i < p.length; i++) { mp += p[i]; mq += q[i]; }
            mp /= p.length; mq /= q.length;
            let cov = 0, vp = 0, vq = 0;
            for (let i = 0; i < p.length; i++) {
                const dp = p[i] - mp, dq = q[i] - mq;
                cov += dp * dq; vp += dp * dp; vq += dq * dq;
            }
            return vp > 0 && vq > 0 ? cov / Math.sqrt(vp * vq) : 0;
        };
        const tope = arriba + Math.floor(alto * 0.6);
        for (let b = abajo - 2; b > tope; b--) {
            const cola = abajo - b + 1;
            if (cola < 0.02 * h || cola > 0.4 * alto) continue;
            const fuente = suma[b - 1];
            // Salto: el reflejo arranca bastante más claro que la base…
            if (fuente <= 0 || suma[b] > 0.7 * fuente) continue;
            // …y nunca vuelve a oscurecer como ella.
            let maximo = 0;
            for (let y = b; y <= abajo; y++) if (suma[y] > maximo) maximo = suma[y];
            if (maximo > 0.75 * fuente) continue;
            // Mismo ancho y mismo centro que la base.
            const ta = tramo(b - 1), tb = tramo(b);
            if (!ta || !tb) continue;
            const wa = ta[1] - ta[0] + 1, wb = tb[1] - tb[0] + 1;
            if (wb < 0.75 * wa || wb > 1.25 * wa || Math.abs((ta[0] + ta[1]) - (tb[0] + tb[1])) / 2 > 0.15 * wa) continue;
            // Espejo: las primeras filas del reflejo calcan las de arriba de la base.
            const k = Math.min(cola, 6, b - arriba);
            let minimo = 1, total = 0;
            for (let i = 0; i < k; i++) {
                const c = correlacion(filaOscura(b + i), filaOscura(b - 1 - i));
                minimo = Math.min(minimo, c);
                total += c;
            }
            if (minimo < 0.6 || total / k < 0.72) continue;
            return b;
        }
        return abajo + 1;
    }

    // Una foto de otro origen (ERP/CDN) ensucia el canvas: se vuelve a pedir
    // con CORS y se mide desde el blob, como hace pedido.js.
    async function medirFoto(img) {
        try {
            return medirFuente(img, img.naturalWidth, img.naturalHeight);
        } catch (error) {
            if (typeof createImageBitmap !== 'function') return null;
            const respuesta = await fetch(img.currentSrc || img.src, { mode: 'cors', credentials: 'omit' });
            if (!respuesta.ok) return null;
            const bitmap = await createImageBitmap(await respuesta.blob());
            try {
                return medirFuente(bitmap, bitmap.width, bitmap.height);
            } finally {
                if (bitmap.close) bitmap.close();
            }
        }
    }

    function aplicarEncuadre(nicho, encuadre) {
        const vars = variablesFrasco(encuadre, nicho.dataset.frasco);
        Object.keys(vars).forEach((k) => {
            if (vars[k] == null) nicho.style.removeProperty(k);
            else nicho.style.setProperty(k, vars[k]);
        });
    }

    /**
     * Mide el frasco de una foto que no estaba en el JSON (foto nueva o del
     * ERP) y la apoya en el piso con la altura de las demás. Las que están en
     * el JSON no se tocan: ya se pintaron bien y medirlas de nuevo costaría
     * un dibujo en canvas por foto.
     */
    async function ajustarFrasco(img) {
        const nicho = img.closest('[data-midiendo]');
        if (!nicho) return;
        const clave = claveDe(img.getAttribute('src'));
        try {
            const medido = medidos.get(clave) || await medirFoto(img);
            if (medido) {
                medidos.set(clave, medido);
                aplicarEncuadre(nicho, medido);
            }
        } catch (error) {
            // Sin medida queda el encuadre típico: peor apoyado, pero visible.
        } finally {
            nicho.removeAttribute('data-midiendo');
        }
    }

    /* ---------- Silueta: el frasco tapa el mármol ----------
       La foto se multiplica sobre la piedra para que su fondo blanco
       desaparezca, pero el multiply también vuelve transparente todo lo
       claro del frasco (etiquetas, vidrio, tapas blancas): se veían las
       vetas a través. Debajo de cada frasco va su silueta lisa, del color
       medio del nicho: el blanco de afuera se sigue borrando contra el
       mármol y el frasco queda opaco. La silueta es lo que el fondo (el
       blanco que toca el borde de la foto) no alcanza; se cierra antes para
       que no se meta por un contorno cortado, se corta en la base (el
       reflejo de estudio queda afuera) y se achica un poco para que nunca
       asome. Si algo falla, queda como antes: el frasco multiplicado. */
    const LADO_SILUETA = 320;
    const TOLERANCIA_FONDO = 10;
    const CIERRE_SILUETA = 2;
    // Color medio del nicho: mármol (mediana 226,213,193) bajo el velo crema al 42 %.
    const COLOR_SILUETA = [238, 230, 217];
    const siluetas = new Map(); // clave → Promise<url | null>
    let colaSiluetas = Promise.resolve();

    /** Dilata (busca 1) o erosiona (busca 0) una máscara con un cuadrado de lado 2r+1. */
    function ventanaMascara(src, w, h, r, buscado) {
        const tmp = new Uint8Array(w * h);
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            const fila = y * w;
            let cuenta = 0;
            for (let x = 0; x <= Math.min(r, w - 1); x++) if (src[fila + x] === buscado) cuenta++;
            for (let x = 0; x < w; x++) {
                tmp[fila + x] = cuenta ? buscado : src[fila + x];
                const sale = x - r, entra = x + r + 1;
                if (sale >= 0 && src[fila + sale] === buscado) cuenta--;
                if (entra < w && src[fila + entra] === buscado) cuenta++;
            }
        }
        for (let x = 0; x < w; x++) {
            let cuenta = 0;
            for (let y = 0; y <= Math.min(r, h - 1); y++) if (tmp[y * w + x] === buscado) cuenta++;
            for (let y = 0; y < h; y++) {
                out[y * w + x] = cuenta ? buscado : tmp[y * w + x];
                const sale = y - r, entra = y + r + 1;
                if (sale >= 0 && tmp[sale * w + x] === buscado) cuenta--;
                if (entra < h && tmp[entra * w + x] === buscado) cuenta++;
            }
        }
        return out;
    }

    function siluetaDeFuente(fuente, ancho, alto, encuadre) {
        if (!ancho || !alto) return null;
        const escala = LADO_SILUETA / Math.max(ancho, alto);
        const w = Math.max(1, Math.round(ancho * escala));
        const h = Math.max(1, Math.round(alto * escala));
        const lienzo = document.createElement('canvas');
        lienzo.width = w;
        lienzo.height = h;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(fuente, 0, 0, w, h);
        const imagen = ctx.getImageData(0, 0, w, h);
        const datos = imagen.data;
        const canal = (x, y) => {
            const i = (y * w + x) * 4;
            return Math.min(datos[i], datos[i + 1], datos[i + 2]);
        };
        const nivel = Math.min(canal(1, 1), canal(w - 2, 1), canal(1, h - 2), canal(w - 2, h - 2));
        const limite = nivel - TOLERANCIA_FONDO;

        // Lo que no es fondo, cerrado para tapar cortes del contorno.
        let objeto = new Uint8Array(w * h);
        for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            if (datos[i] < limite || datos[i + 1] < limite || datos[i + 2] < limite) objeto[p] = 1;
        }
        objeto = ventanaMascara(objeto, w, h, CIERRE_SILUETA, 1);

        // El fondo: todo lo claro que se alcanza desde el borde de la foto.
        const fondo = new Uint8Array(w * h);
        const pila = new Int32Array(w * h);
        let tope = 0;
        const sembrar = (p) => {
            if (!objeto[p] && !fondo[p]) { fondo[p] = 1; pila[tope++] = p; }
        };
        for (let x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
        for (let y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }
        while (tope) {
            const p = pila[--tope];
            const x = p % w;
            if (x > 0) sembrar(p - 1);
            if (x < w - 1) sembrar(p + 1);
            if (p >= w) sembrar(p - w);
            if (p < (h - 1) * w) sembrar(p + w);
        }

        // La silueta, solo dentro del frasco medido (sin el reflejo de abajo).
        const [arriba, abajo, izquierda, derecha] = encuadre || [0, 1, 0, 1];
        const y0 = Math.max(0, Math.floor(arriba * h)), y1 = Math.min(h, Math.ceil(abajo * h));
        const x0 = Math.max(0, Math.floor(izquierda * w)), x1 = Math.min(w, Math.ceil(derecha * w));
        let silueta = new Uint8Array(w * h);
        let cuenta = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const p = y * w + x;
                if (!fondo[p]) { silueta[p] = 1; cuenta++; }
            }
        }
        if (cuenta < w * h * 0.01) return null;
        silueta = ventanaMascara(silueta, w, h, CIERRE_SILUETA + 1, 0);

        const [r, g, b] = COLOR_SILUETA;
        for (let p = 0, i = 0; p < w * h; p++, i += 4) {
            datos[i] = r; datos[i + 1] = g; datos[i + 2] = b;
            datos[i + 3] = silueta[p] ? 255 : 0;
        }
        ctx.putImageData(imagen, 0, 0);
        return new Promise((listo) => {
            lienzo.toBlob((blob) => listo(blob ? URL.createObjectURL(blob) : null), 'image/png');
        });
    }

    async function crearSilueta(img, encuadre) {
        try {
            return await siluetaDeFuente(img, img.naturalWidth, img.naturalHeight, encuadre);
        } catch (error) {
            // Foto de otro origen sin CORS en el <img>: se pide con CORS.
            if (typeof createImageBitmap !== 'function') return null;
            const respuesta = await fetch(img.currentSrc || img.src, { mode: 'cors', credentials: 'omit' });
            if (!respuesta.ok) return null;
            const bitmap = await createImageBitmap(await respuesta.blob());
            try {
                return await siluetaDeFuente(bitmap, bitmap.width, bitmap.height, encuadre);
            } finally {
                if (bitmap.close) bitmap.close();
            }
        }
    }

    // De a una, soltando el hilo entre foto y foto: no traba el scroll.
    // (requestIdleCallback no sirve: con el catálogo animado casi nunca hay
    // ocio y cada silueta esperaba el timeout entero.)
    function respiro() {
        return new Promise((listo) => setTimeout(listo, 0));
    }

    function encolarSilueta(img, encuadre) {
        const tarea = colaSiluetas.then(respiro).then(() => crearSilueta(img, encuadre)).catch(() => null);
        colaSiluetas = tarea;
        return tarea;
    }

    async function ponerSilueta(img) {
        const nicho = img.closest('.pieza__nicho');
        if (!nicho) return;
        const clave = claveDe(img.getAttribute('src'));
        const vieja = nicho.querySelector('.pieza__silueta');
        if (vieja) {
            if (vieja.dataset.para === clave) return;
            vieja.remove();
        }
        if (!siluetas.has(clave)) siluetas.set(clave, encolarSilueta(img, encuadreConocido(clave)));
        const url = await siluetas.get(clave);
        if (!url || !img.isConnected || claveDe(img.getAttribute('src')) !== clave) return;
        if (nicho.querySelector('.pieza__silueta')) return;
        const capa = document.createElement('img');
        capa.className = 'pieza__silueta';
        capa.alt = '';
        capa.setAttribute('aria-hidden', 'true');
        capa.dataset.para = clave;
        capa.src = url;
        img.before(capa);
    }

    // Las fotos de los nichos se miden al cargar, las pinte quien las pinte
    // (catálogo, detalle, combo). `load` no burbujea: se escucha en captura.
    function esFrasco(nodo) {
        return nodo && nodo.tagName === 'IMG' && nodo.classList.contains('pieza__frasco');
    }

    document.addEventListener('load', (evento) => {
        if (!esFrasco(evento.target)) return;
        const img = evento.target;
        ajustarFrasco(img).then(() => ponerSilueta(img));
    }, true);
    document.addEventListener('error', (evento) => {
        if (!esFrasco(evento.target)) return;
        const nicho = evento.target.closest('[data-midiendo]');
        if (nicho) nicho.removeAttribute('data-midiendo');
    }, true);

    function inStockFor(perfume, mode) {
        if (mode === 'perfumes') return App.core.stock.availableCompleteEntries(perfume).length > 0;
        if (mode === 'decants') return !!perfume.en_stock_decants;
        return true;
    }

    /** Precio corto de la tarjeta: el principal y una aclaración chica. */
    function precioPieza(perfume, mode) {
        if (mode === 'cuadros') {
            return perfume.precio_cuadro == null ? '' : `<span class="pieza__monto">${bs(perfume.precio_cuadro)}</span><small>Cuadro</small>`;
        }
        if (!inStockFor(perfume, mode)) {
            return '<small>Sin stock por ahora</small>';
        }
        if (mode === 'perfumes') {
            const entries = App.core.stock.availableCompleteEntries(perfume);
            if (!entries.length) return '';
            const e = entries.slice().sort((a, b) => a.precio - b.precio)[0];
            const venta = ofertaValida(perfume, e.precio, e.precio_oferta)
                ? `<s>${bs(e.precio)}</s><span class="pieza__monto is-oferta">${bs(e.precio_oferta)}</span>`
                : `<span class="pieza__monto">${bs(e.precio)}</span>`;
            return `${entries.length > 1 ? '<small>desde</small>' : ''}${venta}${e.ml != null ? `<small>${e.ml} ml</small>` : ''}`;
        }
        const precios = perfume.precios_decants || {};
        const ofertas = perfume.precios_decants_oferta || {};
        const tamanos = Object.keys(precios).map(Number).sort((a, b) => a - b);
        if (!tamanos.length) return '';
        const menor = tamanos[0];
        const venta = ofertaValida(perfume, precios[menor], ofertas[menor])
            ? `<s>${bs(precios[menor])}</s><span class="pieza__monto is-oferta">${bs(ofertas[menor])}</span>`
            : `<span class="pieza__monto">${bs(precios[menor])}</span>`;
        const rango = tamanos.length > 1 ? `${menor} a ${tamanos[tamanos.length - 1]} ml` : `${menor} ml`;
        return `<small>desde</small>${venta}<small>${rango}</small>`;
    }

    function placasPieza(perfume, mode) {
        const placas = [];
        if (!inStockFor(perfume, mode)) placas.push('<span class="placa placa--agotado">Agotado</span>');
        if (isOnSale(perfume, mode)) placas.push('<span class="placa placa--oferta">Oferta</span>');
        if (perfume.etiqueta === 'novedad') placas.push('<span class="placa">Nuevo</span>');
        if (perfume.etiqueta === 'a-pedido') placas.push('<span class="placa">A pedido</span>');
        return placas.length ? `<span class="pieza__placas">${placas.join('')}</span>` : '';
    }

    function renderPieza(perfume, mode, hypeIndex) {
        const img = getImage(perfume, mode);
        const sortPrice = getSortPrice(perfume, mode);
        const enStock = inStockFor(perfume, mode);
        const datos = [
            `data-id="${escapar(perfume.id)}"`,
            `data-name="${escapar(perfume.nombre_interno)}"`,
            `data-brand="${escapar(String(perfume.marca || '').toLowerCase())}"`,
            `data-tags="${escapar((perfume.tags || []).join(' '))}"`,
            `data-hype-index="${hypeIndex}"`,
            `data-hype-rank="${getHypeRank(perfume, hypeIndex)}"`,
            `data-sort-name="${escapar(getSortName(perfume))}"`,
            `data-sort-price="${Number.isFinite(sortPrice) ? sortPrice : ''}"`,
            `data-on-sale="${isOnSale(perfume, mode) ? '1' : '0'}"`,
            `data-stock="${enStock ? '1' : '0'}"`,
            `data-nuevo="${perfume.etiqueta === 'novedad' ? '1' : '0'}"`
        ].join(' ');
        const alt = escapar(`${perfume.marca} ${perfume.nombre}`);
        const escena = mode === 'cuadros'
            ? `<span class="pieza__lamina"><img src="${escapar(img)}" alt="${alt}" loading="lazy" decoding="async"></span>`
            : `<span class="pieza__nicho" ${atributosNicho(img, mode)}>`
                + '<span class="pieza__sombra" aria-hidden="true"></span>'
                + `<img class="pieza__frasco" src="${escapar(img)}" alt="${alt}" loading="lazy" decoding="async">`
                + '<span class="pieza__piso" aria-hidden="true"></span>'
            + '</span>';
        return `<article class="pieza pieza--${mode}${enStock ? '' : ' is-agotado'}" ${datos}>`
            + `<a class="pieza__enlace" href="perfume.html#id=${encodeURIComponent(perfume.id)}${mode === 'cuadros' ? '&amp;tipo=cuadro' : (mode === 'decants' ? '&amp;tipo=decant' : '')}">`
            + escena
            + placasPieza(perfume, mode)
            + '<span class="pieza__texto">'
            + `<span class="pieza__marca">${escapar(perfume.marca)}</span>`
            + `<span class="pieza__nombre">${escapar(perfume.nombre)}</span>`
            + `<span class="pieza__precio">${precioPieza(perfume, mode)}</span>`
            + '</span>'
            + '</a></article>';
    }

    /** Los productos de una sala, con el mismo criterio que renderCatalog. */
    function productosDeSala(mode) {
        const perfumes = (App.data && App.data.perfumes) || [];
        return perfumes.filter(p => {
            if (mode === 'perfumes') return (p.precio_completo !== null || p.en_stock_completos === false) && p.image_miniatura !== null;
            if (mode === 'decants') return (p.precios_decants !== null || p.en_stock_decants === false) && (p.image_miniatura_decant !== null || p.precios_decants !== null);
            if (mode === 'cuadros') return p.precio_cuadro != null;
            return true;
        });
    }

    function renderPiezas(gridEl, mode) {
        gridEl.innerHTML = productosDeSala(mode).map((p, index) => renderPieza(p, mode, index)).join('');
        return Array.from(gridEl.querySelectorAll('.pieza'));
    }

    function bindCardNavigation(gridEl) {
        gridEl.addEventListener('click', function (event) {
            var card = event.target.closest('.decant');
            if (!card) return;
            var id = card.getAttribute('data-id');
            if (id) {
                App.core.navigateToProductDetail(id);
            }
        });
    }

    App.viewmodels = App.viewmodels || {};
    App.viewmodels.catalogRenderer = {
        renderCatalog: renderCatalog,
        bindCardNavigation: bindCardNavigation,
        sortCards: sortCards,
        sortCardsForQuery: sortCardsForQuery,
        renderPieza: renderPieza,
        renderPiezas: renderPiezas,
        productosDeSala: productosDeSala,
        estiloFrasco: estiloFrasco,
        atributosNicho: atributosNicho,
        bs: bs,
        escapar: escapar
    };
})(window.PerfSuarez);
