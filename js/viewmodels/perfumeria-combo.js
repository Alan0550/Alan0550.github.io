(function (App) {
    'use strict';

    /**
     * Arma tu combo, como sala de Perfumería.
     *
     * La cuenta y lo que se entrega son los de siempre: `resumenCombo` y
     * `mensajeCombo` (combo.model.js) copian al armador anterior, y el carrito
     * recibe `createComboItem(resumen)` sin cambios. Lo nuevo es la forma: cada
     * frasco ocupa un nicho de mármol, se elige desde una hoja con buscador y
     * el resumen queda siempre a la vista.
     *
     * Diferencia de comportamiento: cambiar la cantidad de decants ya no borra
     * lo elegido (antes se rearmaban los nichos vacíos). Los nichos que sobran
     * se descartan; la salida sigue saliendo de los nichos visibles, en orden.
     */

    const combo = App.models.combo;
    const codigos = App.models.comboCode;
    const renderer = App.viewmodels.catalogRenderer;
    // Por sesión (no localStorage): un combo a medio armar es de la visita,
    // no tiene que reaparecer semanas después. Un borrador por tipo, como código.
    const CLAVE_BORRADOR = 'ps_combo_borrador_v2';
    const CANTIDADES = [5, 6, 7, 8, 9, 10];
    const CANTIDAD_PERFUMES = 3;

    const estado = {
        tipo: 'perfumes',
        cantidad: 5,
        productos: { perfumes: [], decants: [] },
        // Lo elegido por tipo, en orden de nicho: { producto, tamano } | null.
        nichos: { perfumes: [], decants: [] },
        nichoAbierto: null,
        listo: false
    };

    const $ = id => document.getElementById(id);
    let el = {};

    function requeridos() {
        return estado.tipo === 'decants' ? estado.cantidad : CANTIDAD_PERFUMES;
    }

    function nichosActuales() {
        const lista = estado.nichos[estado.tipo];
        const n = requeridos();
        while (lista.length < n) lista.push(null);
        return lista.slice(0, n);
    }

    function precioDe(eleccion) {
        if (!eleccion) return null;
        return eleccion.producto.precios.find(p => p.tamano === eleccion.tamano) || eleccion.producto.precios[0] || null;
    }

    function resumen() {
        const selecciones = nichosActuales().map(eleccion => (eleccion ? { producto: eleccion.producto, precio: precioDe(eleccion) } : null));
        return combo.resumenCombo(estado.tipo, estado.cantidad, selecciones);
    }

    function imagenesElegidas() {
        return nichosActuales().filter(Boolean).map(e => e.producto.imagen);
    }

    /* ---------------- Pintar ---------------- */

    function pintarTipos() {
        document.querySelectorAll('.combo-tipo').forEach(boton => {
            boton.setAttribute('aria-checked', String(boton.dataset.tipo === estado.tipo));
        });
        el.cantidad.hidden = estado.tipo !== 'decants';
        el.cantidadOpciones.querySelectorAll('button').forEach(boton => {
            boton.setAttribute('aria-checked', String(Number(boton.dataset.cantidad) === estado.cantidad));
        });
        el.nichos.dataset.tipo = estado.tipo;
    }

    function escenaNicho(eleccion) {
        if (!eleccion) {
            return '<span class="pieza__nicho combo-nicho__vacio"><span class="combo-nicho__mas" aria-hidden="true"></span><span class="pieza__piso" aria-hidden="true"></span></span>';
        }
        const modo = estado.tipo === 'decants' ? 'decants' : 'perfumes';
        const img = eleccion.producto.imagen;
        return `<span class="pieza__nicho" ${renderer.atributosNicho(img, modo)}>`
            + '<span class="pieza__sombra" aria-hidden="true"></span>'
            + `<img class="pieza__frasco" src="${renderer.escapar(img)}" alt="" decoding="async">`
            + '<span class="pieza__piso" aria-hidden="true"></span></span>';
    }

    function pintarNichos() {
        const lista = nichosActuales();
        el.nichos.innerHTML = lista.map((eleccion, i) => {
            const precio = precioDe(eleccion);
            const tamanos = eleccion ? eleccion.producto.precios : [];
            const info = eleccion
                ? `<span class="combo-nicho__nombre">${renderer.escapar(eleccion.producto.nombre)}</span>`
                    + (tamanos.length > 1
                        ? `<span class="combo-nicho__tamanos" role="radiogroup" aria-label="Tamaño">${tamanos.map(t => `<button type="button" role="radio" data-nicho="${i}" data-tamano="${t.tamano}" aria-checked="${t.tamano === precio.tamano}">${t.tamano}</button>`).join('')}<span>ml</span></span>`
                        : `<span class="combo-nicho__ml">${precio.tamano} ml</span>`)
                    + `<span class="combo-nicho__precio">${estado.tipo === 'perfumes' && typeof precio.comboPrecio === 'number'
                        ? `<s>${renderer.bs(precio.precio)}</s> ${renderer.bs(precio.comboPrecio)}`
                        : renderer.bs(precio.precio)}</span>`
                : `<span class="combo-nicho__nombre combo-nicho__nombre--vacio">${estado.tipo === 'decants' ? 'Decant' : 'Perfume'} ${i + 1}</span>`;
            return `<li class="combo-nicho${eleccion ? '' : ' is-vacio'}">`
                + `<button type="button" class="combo-nicho__escena" data-elegir="${i}" aria-label="${eleccion ? 'Cambiar' : 'Elegir'} ${estado.tipo === 'decants' ? 'decant' : 'perfume'} ${i + 1}">${escenaNicho(eleccion)}</button>`
                + (eleccion ? `<button type="button" class="combo-nicho__quitar" data-quitar="${i}" aria-label="Quitar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>` : '')
                + `<span class="combo-nicho__info">${info}</span>`
                + '</li>';
        }).join('');
    }

    function pintarResumen() {
        const r = resumen();
        const faltan = requeridos() - r.selected;
        const completo = faltan <= 0;
        el.estado.textContent = completo
            ? (estado.tipo === 'decants' ? `Tus ${estado.cantidad} decants` : 'Tus 3 perfumes')
            : `${r.selected} de ${requeridos()} · ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}`;
        el.total.textContent = renderer.bs(r.total);
        el.original.textContent = r.savings > 0.005 ? renderer.bs(r.originalTotal) : '';
        el.ahorro.textContent = r.savings > 0.005 ? `Ahorrás ${renderer.bs(r.savings)}` : '';
        el.carrito.disabled = !completo;
        el.whatsapp.disabled = !completo;
        el.compartir.disabled = !completo;
        el.resumen.classList.toggle('is-completo', completo);
    }

    function pintar() {
        pintarTipos();
        pintarNichos();
        pintarResumen();
        guardarBorrador();
    }

    /* ---------------- Hoja para elegir ---------------- */

    function pintarLista() {
        const q = App.core.search.normalizeText(el.hojaQ.value);
        const productos = estado.productos[estado.tipo];
        const visibles = q
            ? productos.map(p => ({ p, s: App.core.search.scoreMatch(q, p.nombre) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.p)
            : productos;
        el.hojaLista.innerHTML = visibles.slice(0, 120).map(p => {
            const menor = p.precios[0];
            const precio = estado.tipo === 'perfumes' && typeof menor.comboPrecio === 'number'
                ? `<s>${renderer.bs(menor.precio)}</s> ${renderer.bs(menor.comboPrecio)}`
                : `${p.precios.length > 1 ? 'desde ' : ''}${renderer.bs(menor.precio)}`;
            return `<li><button type="button" class="combo-opcion" data-producto="${productos.indexOf(p)}">`
                + `<span class="combo-opcion__foto"><img src="${renderer.escapar(p.imagen)}" alt="" loading="lazy" decoding="async"></span>`
                + `<span class="combo-opcion__texto"><span class="combo-opcion__nombre">${renderer.escapar(p.nombre)}</span><span class="combo-opcion__precio">${precio}</span></span>`
                + '</button></li>';
        }).join('') || '<li class="combo-hoja__vacia">Nada con ese nombre.</li>';
    }

    function abrirHoja(indice) {
        estado.nichoAbierto = indice;
        el.hojaTitulo.textContent = estado.tipo === 'decants' ? `Decant ${indice + 1}` : `Perfume ${indice + 1}`;
        el.hojaQ.value = '';
        pintarLista();
        el.velo.hidden = false;
        el.hoja.hidden = false;
        document.body.classList.add('is-combo-hoja');
        App.core.ocultarDockDelShell(true);
        requestAnimationFrame(() => {
            el.velo.classList.add('is-abierto');
            el.hoja.classList.add('is-abierta');
        });
        el.hojaLista.scrollTop = 0;
        // En el teléfono, el teclado tapaba la lista: el foco solo en escritorio.
        if (window.matchMedia('(hover: hover)').matches) el.hojaQ.focus();
    }

    function cerrarHoja() {
        estado.nichoAbierto = null;
        el.velo.classList.remove('is-abierto');
        el.hoja.classList.remove('is-abierta');
        App.core.ocultarDockDelShell(false);
        setTimeout(() => {
            if (estado.nichoAbierto === null) {
                el.velo.hidden = true;
                el.hoja.hidden = true;
                document.body.classList.remove('is-combo-hoja');
            }
        }, 300);
    }

    function elegir(producto, indice) {
        const lista = estado.nichos[estado.tipo];
        while (lista.length <= indice) lista.push(null);
        // Como antes: arranca en el tamaño más chico.
        lista[indice] = { producto, tamano: producto.precios[0].tamano };
        pintar();
    }

    /* ---------------- Entregar ---------------- */

    function alCarrito() {
        const r = resumen();
        if (r.selected < requeridos() || !App.models.cart) return;
        const item = App.models.cart.createComboItem(r);
        if (!item) return;
        // Solo para la miniatura del carrito: el texto del ítem no cambia.
        item.imagenes = imagenesElegidas();
        App.models.cart.addItem(item);
        App.viewmodels.cart.openCart();
    }

    function porWhatsApp() {
        const r = resumen();
        if (r.selected < requeridos()) return;
        App.core.pedido.enviar({
            texto: combo.mensajeCombo(r),
            titulo: 'Pedir el combo',
            tema: 'marmol',
            archivo: 'combo-suarez',
            encabezado: r.isDecants ? 'Mi set de decants' : 'Mi combo de perfumes',
            total: renderer.bs(r.total),
            items: [{
                titulo: r.isDecants ? 'Set de Decants' : 'Combo de Perfumes',
                lineas: r.items.map(item => `${item.name} - ${item.size} ml`)
                    .concat(r.savings > 0.005 ? [`Ahorro: ${renderer.bs(r.savings)}`] : []),
                precioTexto: renderer.bs(r.total),
                imagenes: imagenesElegidas()
            }]
        });
    }

    /* ---------------- Códigos de combo ---------------- */

    // Lo elegido en un tipo como código (con `_` en los nichos vacíos).
    function codigoDe(tipo) {
        const n = tipo === 'decants' ? estado.cantidad : CANTIDAD_PERFUMES;
        const lista = estado.nichos[tipo].slice(0, n);
        while (lista.length < n) lista.push(null);
        if (!lista.some(Boolean)) return null;
        return codigos.encode(tipo, lista.map(e => (e ? { id: e.producto.id, ml: e.tamano } : null)));
    }

    function guardarBorrador() {
        if (!estado.listo) return;
        try {
            sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
                tipo: estado.tipo,
                perfumes: codigoDe('perfumes'),
                decants: codigoDe('decants')
            }));
        } catch (error) {
            // Sin storage: el combo simplemente no sobrevive a la recarga.
        }
    }

    /**
     * Pone lo que dice un código en los nichos de su tipo. Devuelve cuántos
     * productos ya no están (agotados o fuera de combo): esos nichos quedan
     * vacíos para elegir otro. null si el código no se puede leer.
     */
    function ponerCodigo(texto) {
        const decodificado = codigos.decode(codigos.extractFromInput(texto));
        if (!decodificado) return null;
        const { tipo, cantidad, items } = decodificado;
        if (tipo === 'decants') estado.cantidad = cantidad;
        let faltan = 0;
        estado.nichos[tipo] = items.map(item => {
            if (!item) return null;
            const producto = estado.productos[tipo].find(p => p.id === item.id);
            if (!producto || !producto.precios.some(p => p.tamano === item.ml)) {
                faltan += 1;
                return null;
            }
            return { producto, tamano: item.ml };
        });
        estado.tipo = tipo;
        return faltan;
    }

    function restaurarBorrador() {
        let borrador = null;
        try {
            borrador = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || 'null');
        } catch (error) {
            borrador = null;
        }
        if (!borrador) return;
        // El de decants primero: trae su cantidad, y el tipo activo queda último.
        ['decants', 'perfumes'].forEach(tipo => { if (borrador[tipo]) ponerCodigo(borrador[tipo]); });
        estado.tipo = borrador.tipo === 'decants' ? 'decants' : 'perfumes';
    }

    function avisar(texto, esError) {
        el.codigoAviso.textContent = texto || '';
        el.codigoAviso.classList.toggle('is-error', !!texto && !!esError);
    }

    /** Aplica un código pegado o que vino en el link. */
    function aplicarCodigo(texto) {
        const faltan = ponerCodigo(texto);
        if (faltan === null) {
            avisar('Ese código no es de un combo. Revisá que esté completo.', true);
            return false;
        }
        pintar();
        avisar(faltan
            ? `Armamos tu combo, pero ${faltan === 1 ? 'un perfume ya no está disponible: elegí otro' : `${faltan} perfumes ya no están disponibles: elegí otros`} para completarlo.`
            : 'Listo: ese es el combo del código.', !!faltan);
        return true;
    }

    function linkDeCodigo(codigo) {
        const url = new URL('/', window.location.href);
        url.search = new URLSearchParams({ seccion: 'perfumeria', sala: 'combo', [codigos.PARAM]: codigo }).toString();
        return url.toString();
    }

    // "Teléfono" de verdad: Safari de macOS y Edge exponen navigator.share
    // aunque no sean táctiles; el puntero grueso distingue al dispositivo.
    const puedeCompartir = () => typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;

    async function compartir() {
        const codigo = resumen().selected >= requeridos() ? codigoDe(estado.tipo) : null;
        if (!codigo) return;
        if (puedeCompartir()) {
            try {
                await navigator.share({
                    title: 'Mi combo — Perfumería Suárez',
                    text: 'Mirá el combo que armé en Perfumería Suárez:',
                    url: linkDeCodigo(codigo)
                });
            } catch (error) {
                // Canceló la hoja de compartir: no es un error.
            }
            return;
        }
        try {
            await navigator.clipboard.writeText(codigo);
            el.compartirTexto.textContent = '¡Copiado!';
            setTimeout(() => { el.compartirTexto.textContent = 'Copiar código'; }, 2000);
            avisar(`Tu código: ${codigo}. Quien lo pegue acá ve el mismo combo.`, false);
        } catch (error) {
            window.prompt('Copiá el código de tu combo:', codigo);
        }
    }

    function abrirCampoDeCodigo(abrir) {
        el.codigoForm.hidden = !abrir;
        el.codigoAbrir.setAttribute('aria-expanded', String(abrir));
        if (abrir) {
            el.codigoInput.value = '';
            el.codigoInput.focus();
        }
    }

    /* ---------------- Arranque ---------------- */

    function enlazar() {
        document.querySelectorAll('.combo-tipo').forEach(boton => {
            boton.addEventListener('click', () => {
                estado.tipo = boton.dataset.tipo;
                pintar();
            });
        });
        el.cantidadOpciones.addEventListener('click', event => {
            const boton = event.target.closest('[data-cantidad]');
            if (!boton) return;
            estado.cantidad = Number(boton.dataset.cantidad);
            pintar();
        });
        el.nichos.addEventListener('click', event => {
            const quitar = event.target.closest('[data-quitar]');
            if (quitar) {
                estado.nichos[estado.tipo][Number(quitar.dataset.quitar)] = null;
                pintar();
                return;
            }
            const tamano = event.target.closest('[data-tamano]');
            if (tamano) {
                const eleccion = estado.nichos[estado.tipo][Number(tamano.dataset.nicho)];
                if (eleccion) {
                    eleccion.tamano = Number(tamano.dataset.tamano);
                    pintar();
                }
                return;
            }
            const escena = event.target.closest('[data-elegir]');
            if (escena) abrirHoja(Number(escena.dataset.elegir));
        });
        el.hojaQ.addEventListener('input', pintarLista);
        el.hojaLista.addEventListener('click', event => {
            const opcion = event.target.closest('[data-producto]');
            if (!opcion || estado.nichoAbierto === null) return;
            elegir(estado.productos[estado.tipo][Number(opcion.dataset.producto)], estado.nichoAbierto);
            cerrarHoja();
        });
        el.velo.addEventListener('click', cerrarHoja);
        el.hoja.querySelector('[data-cerrar-hoja]').addEventListener('click', cerrarHoja);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && estado.nichoAbierto !== null) cerrarHoja();
        });
        el.carrito.addEventListener('click', alCarrito);
        el.whatsapp.addEventListener('click', porWhatsApp);
        el.compartirTexto.textContent = puedeCompartir() ? 'Compartir combo' : 'Copiar código';
        el.compartir.addEventListener('click', compartir);
        el.codigoAbrir.addEventListener('click', () => abrirCampoDeCodigo(el.codigoForm.hidden));
        el.codigoForm.addEventListener('submit', event => {
            event.preventDefault();
            if (!el.codigoInput.value.trim()) {
                avisar('Pegá un código o el link del combo.', true);
                return;
            }
            if (aplicarCodigo(el.codigoInput.value)) abrirCampoDeCodigo(false);
        });
    }

    /**
     * Precarga desde un link: un código de combo (`combo=SRZ-…`), o desde el
     * detalle de un perfume ("Sumar a un combo"): `con` = id del producto,
     * `tipo` = perfumes | decants.
     */
    function precargar(parametros) {
        // Un link con código (`combo=SRZ-…`): arma ese combo entero.
        const codigo = parametros.get(codigos.PARAM);
        if (codigo) {
            aplicarCodigo(codigo);
            return;
        }
        const id = parametros.get('con');
        const tipo = parametros.get('tipo') === 'decants' ? 'decants' : (parametros.get('tipo') === 'perfumes' ? 'perfumes' : null);
        if (!id) return;
        const buscarEn = tipo ? [tipo] : ['perfumes', 'decants'];
        for (const t of buscarEn) {
            const producto = estado.productos[t].find(p => p.id === id);
            if (!producto) continue;
            estado.tipo = t;
            const lista = nichosActuales();
            const yaEsta = lista.some(e => e && e.producto.id === id);
            if (!yaEsta) {
                const libre = lista.indexOf(null);
                elegir(producto, libre >= 0 ? libre : 0);
            }
            pintar();
            return;
        }
    }

    function iniciar() {
        el = {
            nichos: $('combo-nichos'),
            cantidad: $('combo-cantidad'),
            cantidadOpciones: document.querySelector('.combo-cantidad__opciones'),
            resumen: $('combo-resumen'),
            estado: $('combo-estado'),
            total: $('combo-total'),
            original: $('combo-original'),
            ahorro: $('combo-ahorro'),
            carrito: $('combo-carrito'),
            whatsapp: $('combo-whatsapp'),
            velo: $('perf-velo'),
            hoja: $('combo-hoja'),
            hojaTitulo: $('combo-hoja-titulo'),
            hojaQ: $('combo-hoja-q'),
            hojaLista: $('combo-hoja-lista'),
            compartir: $('combo-compartir'),
            compartirTexto: $('combo-compartir-texto'),
            codigoAbrir: $('combo-codigo-abrir'),
            codigoForm: $('combo-codigo-form'),
            codigoInput: $('combo-codigo-input'),
            codigoAviso: $('combo-codigo-aviso')
        };
        if (!el.nichos) return Promise.resolve();
        el.cantidadOpciones.innerHTML = CANTIDADES.map(n => {
            const descuento = 10 + combo.DESCUENTO_EXTRA_DECANTS[n];
            return `<button type="button" role="radio" data-cantidad="${n}" aria-checked="${n === estado.cantidad}"><strong>${n}</strong><span>−${descuento} %</span></button>`;
        }).join('');
        enlazar();
        return Promise.all([combo.getProductsFromData('perfumes'), combo.getProductsFromData('decants')])
            .then(([perfumes, decants]) => {
                estado.productos.perfumes = perfumes;
                estado.productos.decants = decants;
                // Los tokens salen del catálogo entero, no de estas listas
                // filtradas: así un código vale igual con o sin stock.
                codigos.buildTokenMap((App.data && App.data.perfumes) || []);
                restaurarBorrador();
                estado.listo = true;
                pintar();
            })
            .catch(error => console.error('Error iniciando el combo:', error));
    }

    App.viewmodels.perfumeriaCombo = { iniciar, precargar, cerrarHoja };
})(window.PerfSuarez);
