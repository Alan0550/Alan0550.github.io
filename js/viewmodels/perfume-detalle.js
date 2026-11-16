(function (App) {
    'use strict';

    /**
     * Detalle de un producto (perfume.html#id=…[&tipo=cuadro|decant]; el query
     * también vale). Desde Decants (`tipo=decant`) se muestran solo los
     * decants, con la foto del vial; desde Perfumes, frasco completo y decant.
     *
     * El frasco se para en una hornacina grande; debajo, las presentaciones
     * como placas grabadas (frasco completo y decants) y una barra con
     * "Agregar" y "Pedir por WhatsApp". Lo que se entrega no cambió: el ítem
     * del carrito sale de createPerfumeItem / createCuadroItem y el mensaje de
     * "pedir directo" es el de siempre; ahora además viaja con imagen
     * (js/core/pedido.js).
     */

    const renderer = App.viewmodels.catalogRenderer;
    const bs = renderer.bs;
    const esc = renderer.escapar;
    const WHATSAPP_NUMBER = App.core.WHATSAPP;

    function parametro(nombre) {
        return App.core.parametros().get(nombre);
    }

    function buscarPerfume(id) {
        return ((App.data && App.data.perfumes) || []).find(p => p.id === id) || null;
    }

    function entradasCompleto(perfume) {
        return App.core.stock.availableCompleteEntries(perfume);
    }

    // Oferta válida: bandera activa, precio de oferta presente y menor que el original.
    function precioInfo(perfume, original, oferta) {
        const enOferta = !!perfume.oferta && oferta != null && oferta !== ''
            && Number(oferta) > 0 && Number(oferta) < Number(original);
        return { price: enOferta ? Number(oferta) : Number(original), originalPrice: Number(original), onSale: enOferta };
    }

    /** Las presentaciones que se pueden comprar, como antes (getAvailablePurchaseOptions). */
    function opcionesDeCompra(perfume) {
        const opciones = [];
        if (perfume.en_stock_completos) {
            entradasCompleto(perfume).forEach(e => {
                opciones.push(Object.assign({ kind: 'perfume', label: 'Perfume completo', size: e.ml }, precioInfo(perfume, e.precio, e.precio_oferta)));
            });
        }
        if (perfume.precios_decants && perfume.en_stock_decants) {
            const ofertas = (perfume.oferta && perfume.precios_decants_oferta) || {};
            Object.keys(perfume.precios_decants).map(Number).sort((a, b) => a - b).forEach(size => {
                opciones.push(Object.assign({ kind: 'decant', label: 'Decant', size }, precioInfo(perfume, perfume.precios_decants[size], ofertas[size])));
            });
        }
        return opciones;
    }

    function mensajeDirecto(perfume, modo) {
        return modo === 'cuadro'
            ? 'Hola! Quisiera pedir el cuadro de ' + perfume.nombre_interno + '!'
            : 'Hola! Quisiera saber si tienen disponible el perfume ' + perfume.nombre_interno + '!';
    }

    function imagenesDe(perfume, modo) {
        if (modo === 'cuadro') {
            return [perfume.image_cuadro || perfume.image_miniatura || perfume.image_miniatura_decant || 'imagenes/image.webp'];
        }
        const imgs = [];
        const principales = modo === 'decant'
            ? [perfume.image_miniatura_decant, perfume.image_miniatura]
            : [perfume.image_miniatura, perfume.image_miniatura_decant];
        principales.concat(perfume.images_gallery || []).forEach(src => {
            if (src && imgs.indexOf(src) === -1) imgs.push(src);
        });
        return imgs.length ? imgs : ['imagenes/image.webp'];
    }

    /** Nombre de una miniatura para el lector de pantalla. */
    function nombreDeFoto(perfume, src, i) {
        if (src === perfume.image_miniatura) return 'Foto del frasco';
        if (src === perfume.image_miniatura_decant) return 'Foto del decant';
        return `Foto ${i + 1}`;
    }

    /* ---------------- Pintar ---------------- */

    function escena(src, modo, kind) {
        if (modo === 'cuadro') {
            return `<span class="pieza__lamina ficha-lamina"><img src="${esc(src)}" alt=""></span>`;
        }
        return `<span class="pieza__nicho ficha-nicho" ${renderer.atributosNicho(src, kind === 'decant' ? 'decants' : 'perfumes')}>`
            + '<span class="pieza__sombra" aria-hidden="true"></span>'
            + `<img class="pieza__frasco" src="${esc(src)}" alt="" fetchpriority="high">`
            + '<span class="pieza__piso" aria-hidden="true"></span></span>';
    }

    function placas(perfume, modo) {
        if (modo === 'cuadro') return '<span class="placa">Cuadro decorativo</span>';
        const lista = [];
        if (perfume.etiqueta === 'novedad') lista.push('Nuevo');
        if (perfume.etiqueta === 'a-pedido') lista.push('A pedido');
        const nombres = { hombre: 'Hombre', mujer: 'Mujer', unisex: 'Unisex', nicho: 'Nicho', arabes: 'Árabe' };
        (perfume.tags || []).forEach(t => {
            const n = nombres[String(t).toLowerCase()];
            if (n && lista.indexOf(n) === -1) lista.push(n);
        });
        const sinStock = modo === 'decant' ? !perfume.en_stock_decants : (!entradasCompleto(perfume).length && !perfume.en_stock_decants);
        if (sinStock) lista.unshift('Sin stock');
        return lista.map((t, i) => `<span class="placa${i === 0 && t === 'Sin stock' ? ' placa--agotado' : ''}">${t}</span>`).join('');
    }

    function placaPrecio(opcion, i, seleccionada) {
        return `<button type="button" class="ficha-tam" role="radio" data-opcion="${i}" aria-checked="${seleccionada}">`
            + `<span class="ficha-tam__ml">${opcion.size}<small> ml</small></span>`
            + `<span class="ficha-tam__precio">${opcion.onSale ? `<s>${bs(opcion.originalPrice)}</s>` : ''}${bs(opcion.price)}</span>`
            + '</button>';
    }

    function notas(perfume) {
        const n = perfume.notas || {};
        const filas = [];
        if ((n.salida || []).length) filas.push(['Salida', n.salida]);
        if ((n.corazon || []).length) filas.push(['Corazón', n.corazon]);
        if ((n.fondo || []).length) filas.push(['Fondo', n.fondo]);
        if (!filas.length && (n.generales || []).length) filas.push(['Notas', n.generales]);
        if (!filas.length) return '';
        return '<section class="ficha-notas"><h2>Pirámide olfativa</h2>'
            + filas.map(([nombre, lista]) => `<div class="ficha-notas__fila"><span class="ficha-notas__nombre">${nombre}</span>`
                + `<span class="ficha-notas__lista">${lista.map(x => `<span>${esc(x)}</span>`).join('')}</span></div>`).join('')
            + '</section>';
    }

    function bloqueCombo(perfume) {
        const combo = perfume.precio_combo;
        if (!combo) return '';
        const filas = entradasCompleto(perfume)
            .filter(completo => typeof combo[String(completo.ml)] === 'number')
            .sort((a, b) => a.ml - b.ml)
            .map(completo => {
                const ml = completo.ml;
                // Contra lo que se paga hoy por el frasco suelto (con su oferta).
                const ahorro = precioInfo(perfume, completo.precio, completo.precio_oferta).price - combo[ml];
                return `<span><strong>${bs(combo[ml])}</strong> el de ${ml} ml${ahorro > 0 ? ` · ahorrás ${bs(ahorro)}` : ''}</span>`;
            }).join('');
        if (!filas) return '';
        return '<div class="ficha-combo">'
            + '<span class="ficha-combo__titulo">En un combo de 3 perfumes</span>'
            + filas
            + '<button type="button" class="ficha-combo__ir" data-combo="perfumes">Sumarlo a un combo</button>'
            + '</div>';
    }

    function render(perfume, modo) {
        const raiz = document.getElementById('detail-root');
        const opciones = modo === 'cuadro' ? [] : opcionesDeCompra(perfume).filter(o => modo !== 'decant' || o.kind === 'decant');
        const tieneCompleto = opciones.some(o => o.kind === 'perfume');
        const tieneDecant = opciones.some(o => o.kind === 'decant');
        const estado = {
            kind: tieneCompleto ? 'perfume' : 'decant',
            opcion: null,
            imagen: 0
        };
        const imagenes = imagenesDe(perfume, modo);

        function opcionesDelTipo() {
            return opciones.map((o, i) => ({ o, i })).filter(x => x.o.kind === estado.kind);
        }
        if (opciones.length) estado.opcion = opcionesDelTipo()[0].i;

        const precioCuadro = modo === 'cuadro' && typeof perfume.precio_cuadro === 'number' && perfume.precio_cuadro > 0;
        const comprable = modo === 'cuadro' ? precioCuadro : opciones.length > 0;

        raiz.insertAdjacentHTML('beforeend', ''
            + '<div class="ficha-cuerpo">'
            +   '<div class="ficha-escenario">'
            +     `<div class="ficha-escena" id="ficha-escena">${escena(imagenes[0], modo, estado.kind)}</div>`
            +     (imagenes.length > 1 ? `<div class="ficha-miniaturas" role="tablist" aria-label="Fotos">${imagenes.map((src, i) =>
                    `<button type="button" role="tab" data-foto="${i}" aria-selected="${i === 0}" aria-label="${nombreDeFoto(perfume, src, i)}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : '')
            +   '</div>'
            +   '<div class="ficha-info">'
            +     `<p class="ficha-marca">${esc(perfume.marca)}</p>`
            +     `<h1 class="ficha-nombre">${modo === 'cuadro' ? 'Cuadro ' : ''}${esc(perfume.nombre)}</h1>`
            +     `<div class="ficha-placas">${placas(perfume, modo)}</div>`
            +     (modo === 'cuadro'
                    ? (precioCuadro ? `<p class="ficha-precio-cuadro">${bs(perfume.precio_cuadro)}</p><p class="ficha-texto">Cuadro decorativo con el frasco y sus notas, listo para colgar.</p>` : '')
                    : (opciones.length
                        ? '<section class="ficha-compra">'
                            + (tieneCompleto && tieneDecant
                                ? '<div class="ficha-tipo" role="radiogroup" aria-label="Presentación">'
                                    + `<button type="button" role="radio" data-kind="perfume" aria-checked="${estado.kind === 'perfume'}">Frasco completo</button>`
                                    + `<button type="button" role="radio" data-kind="decant" aria-checked="${estado.kind === 'decant'}">Decant</button>`
                                  + '</div>'
                                : `<span class="perf-etiqueta">${tieneCompleto ? 'Frasco completo' : 'Decant'}</span>`)
                            + '<div class="ficha-tams" role="radiogroup" aria-label="Tamaño" id="ficha-tams"></div>'
                          + '</section>'
                        : '<p class="ficha-texto">Por ahora no hay stock. Escribinos y te avisamos cuando vuelva.</p>'))
            +     (modo === 'perfume' ? bloqueCombo(perfume) : '')
            +     (modo === 'cuadro' ? '' : notas(perfume))
            +   '</div>'
            + '</div>'
            + '<div class="ficha-barra" id="ficha-barra">'
            +   `<div class="ficha-barra__precio"><span id="ficha-barra-detalle"></span><strong id="ficha-barra-total"></strong></div>`
            +   '<div class="ficha-barra__acciones">'
            +     (comprable ? '<button type="button" class="perf-boton perf-boton--losa" id="cart-add-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span>Agregar</span></button>' : '')
            +     `<button type="button" class="perf-boton perf-boton--negro" id="ficha-wa"><span class="perf-wa" aria-hidden="true"></span><span>${modo === 'cuadro' ? 'Pedir cuadro' : (comprable ? 'Pedir<span class="ficha-wa__extra"> directo</span>' : 'Consultar')}</span></button>`
            +   '</div>'
            + '</div>');

        document.title = `${modo === 'cuadro' ? 'Cuadro ' : ''}${perfume.nombre} - ${perfume.marca} | Perfumería Suárez`;

        const tams = document.getElementById('ficha-tams');
        const detalle = document.getElementById('ficha-barra-detalle');
        const total = document.getElementById('ficha-barra-total');

        function pintarTams() {
            if (!tams) return;
            const delTipo = opcionesDelTipo();
            // Todas en una fila: hasta 4 decants o 3 frascos.
            tams.style.setProperty('--n', String(Math.max(1, delTipo.length)));
            tams.innerHTML = delTipo.map(({ o, i }) => placaPrecio(o, i, i === estado.opcion)).join('');
        }

        function pintarBarra() {
            if (modo === 'cuadro') {
                detalle.textContent = 'Cuadro decorativo';
                total.textContent = precioCuadro ? bs(perfume.precio_cuadro) : '';
                return;
            }
            const o = opciones[estado.opcion];
            detalle.textContent = o ? `${o.label} · ${o.size} ml` : 'Sin stock';
            total.textContent = o ? bs(o.price) : '';
        }

        function pintarEscena() {
            const src = imagenes[estado.imagen];
            document.getElementById('ficha-escena').innerHTML = escena(src, modo, estado.kind);
        }

        pintarTams();
        pintarBarra();

        raiz.addEventListener('click', event => {
            const tipo = event.target.closest('[data-kind]');
            if (tipo) {
                estado.kind = tipo.dataset.kind;
                raiz.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-checked', String(b === tipo)));
                estado.opcion = opcionesDelTipo()[0].i;
                // La foto del decant (con su vial) si la hay.
                const preferida = estado.kind === 'decant' ? perfume.image_miniatura_decant : perfume.image_miniatura;
                const indice = imagenes.indexOf(preferida);
                if (indice >= 0 && indice !== estado.imagen) {
                    estado.imagen = indice;
                    raiz.querySelectorAll('[data-foto]').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.foto) === indice)));
                    pintarEscena();
                }
                pintarTams();
                pintarBarra();
                return;
            }
            const tam = event.target.closest('[data-opcion]');
            if (tam) {
                estado.opcion = Number(tam.dataset.opcion);
                pintarTams();
                pintarBarra();
                return;
            }
            const foto = event.target.closest('[data-foto]');
            if (foto) {
                estado.imagen = Number(foto.dataset.foto);
                raiz.querySelectorAll('[data-foto]').forEach(b => b.setAttribute('aria-selected', String(b === foto)));
                pintarEscena();
                return;
            }
            const combo = event.target.closest('[data-combo]');
            if (combo) {
                App.core.navigateToShell(`perfumeria.html#sala=combo&con=${encodeURIComponent(perfume.id)}&tipo=perfumes`);
            }
        });

        const agregar = document.getElementById('cart-add-btn');
        agregar?.addEventListener('click', () => {
            if (!App.models.cart) return;
            const item = modo === 'cuadro'
                ? App.models.cart.createCuadroItem(perfume)
                : App.models.cart.createPerfumeItem(perfume, opciones[estado.opcion]);
            if (!item) return;
            App.models.cart.addItem(item);
            App.viewmodels.cart.openCart();
        });

        document.getElementById('ficha-wa').addEventListener('click', () => {
            const texto = mensajeDirecto(perfume, modo);
            const o = opciones[estado.opcion];
            const src = imagenes[estado.imagen];
            App.core.pedido.enviar({
                texto,
                titulo: modo === 'cuadro' ? 'Pedir el cuadro' : 'Pedir este perfume',
                encabezado: 'Quiero este',
                tema: 'marmol',
                archivo: 'pedido-suarez',
                total: modo === 'cuadro' ? (precioCuadro ? bs(perfume.precio_cuadro) : '') : (o ? bs(o.price) : 'A consultar'),
                items: [{
                    titulo: `${modo === 'cuadro' ? 'Cuadro ' : ''}${perfume.nombre_interno}`,
                    subtitulo: modo === 'cuadro' ? 'Cuadro decorativo' : (o ? `${o.label} ${o.size} ml` : ''),
                    precioTexto: modo === 'cuadro' ? (precioCuadro ? bs(perfume.precio_cuadro) : '') : (o ? bs(o.price) : ''),
                    imagen: src
                }]
            });
        });
    }

    // Los parámetros van en el hash: si el shell pide otro producto en este
    // mismo panel, el navegador no recarga la página. Se recarga sola.
    window.addEventListener('hashchange', () => window.location.reload());

    App.core.onReady(() => {
        const volver = document.getElementById('back-btn');
        volver.addEventListener('click', event => {
            event.preventDefault();
            if (App.core.getShellNavigator()) {
                App.core.navigateBackToCatalog();
                return;
            }
            // Abierta sola (fuera del shell): es una página común.
            let vieneDelSitio = false;
            try {
                vieneDelSitio = !!document.referrer && new URL(document.referrer).origin === location.origin;
            } catch (error) { /* referrer raro */ }
            if (vieneDelSitio && history.length > 1) history.back();
            else location.href = '/';
        });
        document.querySelector('[data-volver]')?.addEventListener('click', event => {
            event.preventDefault();
            App.core.navigateToShell('perfumeria.html');
        });
        // Volver dice adónde: la sala de la que se vino.
        const regreso = App.core.getRememberedReturnRoute();
        const sala = /sala=(decants|cuadros|combo)/.exec(regreso);
        volver.querySelector('span').textContent = sala ? { decants: 'Decants', cuadros: 'Cuadros', combo: 'Combo' }[sala[1]] : (/search/.test(regreso) ? 'Volver' : 'Perfumería');

        const id = parametro('id');
        const perfume = id ? buscarPerfume(id) : null;
        if (!perfume) {
            document.getElementById('not-found').hidden = false;
            return;
        }
        const tipo = parametro('tipo');
        const modo = tipo === 'cuadro' && typeof perfume.precio_cuadro === 'number' && perfume.precio_cuadro > 0
            ? 'cuadro'
            : (tipo === 'decant' && perfume.precios_decants ? 'decant' : 'perfume');
        render(perfume, modo);
    });
})(window.PerfSuarez);
