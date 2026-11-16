(function (App) {
    'use strict';

    /**
     * Perfumería: Perfumes, Decants, Cuadros y Arma tu combo en una sola
     * página, como "salas". Cada sala de catálogo tiene su grilla (se arma la
     * primera vez que se entra) y su estado de filtros, página y scroll: ir y
     * volver entre salas no pierde nada. La grilla se pagina (arriba y abajo,
     * como el catálogo de antes); las fotos cargan diferidas.
     *
     * La sala vive en `#sala=` (perfumes por defecto; ver App.core.parametros)
     * y, en el shell, en `/?seccion=perfumeria&sala=`. Cuando la ruta cambia y
     * la página ya está cargada, el shell llama a `window.alCambiarRuta` en vez
     * de recargar el iframe.
     */

    const renderer = App.viewmodels.catalogRenderer;
    const buscar = App.core.search;
    const SALAS = ['perfumes', 'decants', 'cuadros', 'combo'];
    const POR_PAGINA = 24;
    const NOMBRES = {
        perfumes: ['perfume', 'perfumes', 'Perfumes'],
        decants: ['decant', 'decants', 'Decants'],
        cuadros: ['cuadro', 'cuadros', 'Cuadros']
    };

    const $ = id => document.getElementById(id);
    const el = {};
    const salas = {};
    let actual = null;
    let comboListo = null;

    function estadoInicial() {
        return {
            q: '', genero: 'all', estilo: 'all', marca: 'all', orden: 'hype',
            stock: true, nuevos: false, ofertas: false,
            pagina: 1, porPagina: POR_PAGINA, scroll: 0, piezas: null, grilla: null, marcas: null
        };
    }

    function salaDe(parametros) {
        const sala = parametros.get('sala');
        return SALAS.indexOf(sala) >= 0 ? sala : 'perfumes';
    }

    /* ---------------- Ruta ---------------- */

    /** Refleja la sala en la URL de la página y en la del shell (si la hay). */
    function escribirRuta(sala) {
        const hashSala = sala === 'perfumes' ? '' : `#sala=${sala}`;
        try {
            history.replaceState(history.state, '', `${location.pathname}${hashSala}`);
        } catch (error) { /* sin history */ }
        try {
            // Para que el shell, al volver a este panel, lo deje en esta sala.
            if (window.frameElement) window.frameElement.dataset.loadedSrc = `perfumeria.html${hashSala}`;
        } catch (error) { /* sin acceso al marco */ }
        try {
            const padre = window.parent !== window ? window.parent : null;
            if (padre && padre.catalogShellNavigate) {
                const ruta = `/?seccion=perfumeria${sala === 'perfumes' ? '' : `&sala=${sala}`}`;
                padre.history.replaceState({ route: ruta }, '', ruta);
            }
        } catch (error) { /* shell de otro origen */ }
    }

    /* ---------------- Grillas ---------------- */

    function prepararSala(sala) {
        const s = salas[sala];
        if (s.grilla) return s;
        s.grilla = document.createElement('div');
        s.grilla.className = `perf-grilla perf-grilla--${sala}`;
        s.grilla.dataset.sala = sala;
        s.grilla.hidden = true;
        el.grillas.appendChild(s.grilla);
        s.piezas = renderer.renderPiezas(s.grilla, sala);
        // Casas de esta sala, para el selector.
        const mapa = new Map();
        renderer.productosDeSala(sala).forEach(p => {
            const display = String(p.marca || '').trim();
            if (display && !mapa.has(display.toLowerCase())) mapa.set(display.toLowerCase(), display);
        });
        s.marcas = Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es', { sensitivity: 'base' }));
        return s;
    }

    function pintarMarcas(s) {
        el.marca.innerHTML = '<option value="all">Todas las casas</option>'
            + s.marcas.map(([slug, display]) => `<option value="${renderer.escapar(slug)}">${renderer.escapar(display)}</option>`).join('');
        el.marca.value = s.marca;
        if (el.marca.value !== s.marca) {
            s.marca = 'all';
            el.marca.value = 'all';
        }
    }

    function coincide(pieza, s, sala) {
        const tags = buscar.normalizeText(pieza.dataset.tags || '');
        if (s.q) {
            const texto = [pieza.dataset.name, pieza.dataset.tags, pieza.dataset.brand, pieza.textContent].join(' ');
            if (!buscar.matches(s.q, texto)) return false;
        }
        if (s.marca !== 'all' && buscar.normalizeText(pieza.dataset.brand) !== buscar.normalizeText(s.marca)) return false;
        if (sala === 'cuadros') return true;
        if (s.genero !== 'all' && !tags.includes(buscar.normalizeText(s.genero))) return false;
        if (s.estilo !== 'all') {
            const estilo = buscar.normalizeText(s.estilo);
            const ok = estilo === 'disenador' ? (!tags.includes('nicho') && !tags.includes('arabes')) : tags.includes(estilo);
            if (!ok) return false;
        }
        if (s.stock && pieza.dataset.stock !== '1') return false;
        if (s.nuevos && pieza.dataset.nuevo !== '1') return false;
        if (s.ofertas && pieza.dataset.onSale !== '1') return false;
        return true;
    }

    /** Filtra, ordena y muestra la página actual. Filtrar vuelve a la primera. */
    function aplicar(opciones) {
        const sala = actual;
        const s = salas[sala];
        if (!s || !s.piezas) return;
        if (opciones && opciones.reiniciar) s.pagina = 1;
        s.piezas = renderer.sortCardsForQuery(s.piezas, s.q, s.orden, s.grilla);
        const coinciden = s.piezas.filter(pieza => {
            const ok = coincide(pieza, s, sala);
            pieza.classList.toggle('is-filtrada', !ok);
            return ok;
        });
        const visibles = coinciden.length;
        const paginas = Math.max(1, Math.ceil(visibles / s.porPagina));
        s.pagina = Math.min(Math.max(1, s.pagina), paginas);
        const desde = (s.pagina - 1) * s.porPagina;
        const hasta = desde + s.porPagina;
        coinciden.forEach((pieza, i) => pieza.classList.toggle('is-diferida', i < desde || i >= hasta));
        s.piezas.forEach(pieza => {
            if (pieza.classList.contains('is-filtrada')) pieza.classList.remove('is-diferida');
        });
        const [uno, varios] = NOMBRES[sala];
        el.conteo.textContent = visibles === 1 ? `1 ${uno}` : `${visibles} ${varios}`;
        el.vacio.hidden = visibles > 0;
        pintarPaginador(s, paginas, visibles);
        pintarInsignia();
    }

    function pintarPaginador(s, paginas, visibles) {
        const etiqueta = `${NOMBRES[actual][2]} por página`;
        el.paginadores.forEach(nav => {
            nav.querySelector('[data-pagina-estado]').textContent = `Página ${s.pagina} de ${paginas}`;
            nav.querySelector('[data-pagina="-1"]').disabled = s.pagina <= 1;
            nav.querySelector('[data-pagina="1"]').disabled = s.pagina >= paginas;
            nav.querySelector('[data-por-pagina-etq]').textContent = etiqueta;
            const input = nav.querySelector('[data-por-pagina]');
            if (document.activeElement !== input) input.value = String(s.porPagina);
        });
        // Abajo solo hace falta si hay más de una página.
        el.paginadorPie.hidden = !visibles || paginas <= 1;
    }

    /** Lleva el principio de la grilla a la vista (debajo de las salas fijas). */
    function subirALaGrilla() {
        const cabeza = document.querySelector('.perf-cabeza');
        const estilo = getComputedStyle(cabeza);
        const tapado = estilo.position === 'sticky' ? parseFloat(estilo.top) + cabeza.offsetHeight + 10 : 16;
        const destino = el.resultados.getBoundingClientRect().top + window.scrollY - tapado;
        if (window.scrollY > destino) window.scrollTo({ top: Math.max(0, destino), behavior: 'smooth' });
    }

    function irAPagina(paso) {
        const s = salas[actual];
        if (!s) return;
        s.pagina += paso;
        aplicar();
        subirALaGrilla();
    }

    function pintarInsignia() {
        const s = salas[actual];
        if (!s) return;
        const n = (s.marca !== 'all') + (s.orden !== 'hype') + (actual !== 'cuadros' ? (!s.stock) + s.nuevos + s.ofertas : 0);
        el.insignia.hidden = !n;
        el.insignia.textContent = n ? String(n) : '';
        // En el teléfono el texto "Filtros" se esconde: el nombre va aparte.
        el.filtrosBtn.setAttribute('aria-label', n
            ? `Abrir filtros, ${n} ${n === 1 ? 'filtro activo' : 'filtros activos'}`
            : 'Abrir filtros');
    }

    /* ---------------- Controles ---------------- */

    function marcarRadio(grupo, valor) {
        grupo.querySelectorAll('[role="radio"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.valor === valor)));
    }

    /** Pone los controles como los dejó el cliente en esta sala. */
    function volcarControles(s) {
        el.q.value = s.q;
        marcarRadio(el.genero, s.genero);
        marcarRadio(el.estilo, s.estilo);
        marcarRadio(el.orden, s.orden);
        el.stock.checked = s.stock;
        el.nuevos.checked = s.nuevos;
        el.ofertas.checked = s.ofertas;
        el.q.placeholder = actual === 'cuadros' ? 'Buscar por perfume o casa' : 'Buscar perfume, casa o nota';
        pintarMarcas(s);
    }

    function enlazarControles() {
        let espera = 0;
        el.q.addEventListener('input', () => {
            clearTimeout(espera);
            espera = setTimeout(() => {
                salas[actual].q = el.q.value.trim();
                aplicar({ reiniciar: true });
            }, 120);
        });
        el.q.addEventListener('keydown', event => {
            if (event.key === 'Enter') el.q.blur();
        });
        el.chips.addEventListener('click', event => {
            const chip = event.target.closest('.perf-chip');
            if (!chip) return;
            const grupo = chip.closest('[data-filtro]');
            const filtro = grupo.dataset.filtro;
            const s = salas[actual];
            // Estilo se apaga tocándolo de nuevo (no tiene "Todos").
            const valor = filtro === 'estilo' && s.estilo === chip.dataset.valor ? 'all' : chip.dataset.valor;
            s[filtro] = valor;
            marcarRadio(grupo, valor);
            aplicar({ reiniciar: true });
        });
        el.marca.addEventListener('change', () => {
            salas[actual].marca = el.marca.value;
            aplicar({ reiniciar: true });
        });
        el.orden.addEventListener('click', event => {
            const boton = event.target.closest('[role="radio"]');
            if (!boton) return;
            salas[actual].orden = boton.dataset.valor;
            marcarRadio(el.orden, boton.dataset.valor);
            aplicar({ reiniciar: true });
        });
        [['stock', el.stock], ['nuevos', el.nuevos], ['ofertas', el.ofertas]].forEach(([clave, input]) => {
            input.addEventListener('change', () => {
                salas[actual][clave] = input.checked;
                aplicar({ reiniciar: true });
            });
        });
        const limpiar = () => {
            const s = salas[actual];
            Object.assign(s, { q: '', genero: 'all', estilo: 'all', marca: 'all', orden: 'hype', stock: true, nuevos: false, ofertas: false });
            volcarControles(s);
            aplicar({ reiniciar: true });
        };
        $('perf-limpiar').addEventListener('click', limpiar);
        el.vacio.querySelector('[data-limpiar]').addEventListener('click', limpiar);

        el.paginadores.forEach(nav => {
            nav.addEventListener('click', event => {
                const boton = event.target.closest('[data-pagina]');
                if (boton && !boton.disabled) irAPagina(Number(boton.dataset.pagina));
            });
            const input = nav.querySelector('[data-por-pagina]');
            input.addEventListener('change', () => {
                const s = salas[actual];
                const n = Math.round(Number(input.value));
                s.porPagina = Number.isFinite(n) && n > 0 ? Math.min(n, 200) : POR_PAGINA;
                aplicar({ reiniciar: true });
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') input.blur();
            });
        });

        // Las tarjetas son enlaces (sirven para abrir en otra pestaña), pero en
        // el shell el detalle se abre en su panel.
        el.grillas.addEventListener('click', event => {
            const enlace = event.target.closest('.pieza__enlace');
            if (!enlace || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
            event.preventDefault();
            const id = enlace.closest('.pieza').dataset.id;
            if (actual === 'cuadros') App.core.navigateToCuadroDetail(id);
            else if (actual === 'decants') App.core.navigateToDecantDetail(id);
            else App.core.navigateToProductDetail(id);
        });
    }

    /* ---------------- Hoja de filtros (teléfono) ---------------- */

    function filtrosComoHoja() {
        return window.matchMedia('(max-width: 1023px)').matches;
    }

    function abrirFiltros() {
        el.filtros.classList.add('is-abierta');
        el.velo.hidden = false;
        requestAnimationFrame(() => el.velo.classList.add('is-abierto'));
        el.filtrosBtn.setAttribute('aria-expanded', 'true');
        document.body.classList.add('is-hoja-abierta');
        App.core.ocultarDockDelShell(true);
    }

    function cerrarFiltros() {
        el.filtros.classList.remove('is-abierta');
        el.velo.classList.remove('is-abierto');
        el.filtrosBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('is-hoja-abierta');
        App.core.ocultarDockDelShell(false);
        setTimeout(() => {
            if (!el.filtros.classList.contains('is-abierta') && $('combo-hoja').hidden) el.velo.hidden = true;
        }, 300);
    }

    function enlazarFiltros() {
        el.filtrosBtn.addEventListener('click', () => {
            if (filtrosComoHoja()) abrirFiltros();
            else el.filtros.querySelector('select, button')?.focus();
        });
        $('perf-filtros-cerrar').addEventListener('click', cerrarFiltros);
        $('perf-ver').addEventListener('click', () => {
            cerrarFiltros();
            window.scrollTo({ top: el.catalogo.offsetTop - 12, behavior: 'smooth' });
        });
        el.velo.addEventListener('click', () => {
            if (el.filtros.classList.contains('is-abierta')) cerrarFiltros();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && el.filtros.classList.contains('is-abierta')) cerrarFiltros();
        });
    }

    /** Marca los bordes de la fila de chips detrás de los que queda algo. */
    function enlazarPistaDeChips() {
        const marco = document.getElementById('perf-chips-marco');
        const mas = document.getElementById('perf-chips-mas');
        if (!marco || !el.chips) return;
        const pintar = () => {
            const fila = el.chips;
            const resto = fila.scrollWidth - fila.clientWidth - fila.scrollLeft;
            marco.classList.toggle('hay-mas-izq', fila.scrollLeft > 4);
            marco.classList.toggle('hay-mas-der', resto > 4);
        };
        el.chips.addEventListener('scroll', pintar, { passive: true });
        window.addEventListener('resize', pintar);
        if (window.ResizeObserver) new ResizeObserver(pintar).observe(el.chips);
        mas.addEventListener('click', () => {
            el.chips.scrollBy({ left: el.chips.clientWidth * 0.6, behavior: 'smooth' });
        });
        pintar();
    }

    /* ---------------- Salas ---------------- */

    function moverMarca(boton) {
        const caja = el.salas.getBoundingClientRect();
        const r = boton.getBoundingClientRect();
        el.marcaSala.style.transform = `translateX(${r.left - caja.left - 4}px)`;
        el.marcaSala.style.width = `${r.width}px`;
    }

    function irASala(sala, opciones) {
        opciones = opciones || {};
        if (SALAS.indexOf(sala) < 0) sala = 'perfumes';
        if (sala === actual && !opciones.forzar) return;
        if (actual && salas[actual]) salas[actual].scroll = window.scrollY;
        const anterior = actual;
        actual = sala;
        document.body.dataset.sala = sala;

        el.salas.querySelectorAll('[data-sala]').forEach(boton => {
            const activa = boton.dataset.sala === sala;
            boton.setAttribute('aria-selected', String(activa));
            boton.tabIndex = activa ? 0 : -1;
            if (activa) moverMarca(boton);
        });
        if (!anterior) el.salas.classList.add('is-lista');

        const esCombo = sala === 'combo';
        el.catalogo.hidden = esCombo;
        el.combo.hidden = !esCombo;
        if (!esCombo) {
            Object.keys(salas).forEach(k => { if (salas[k].grilla) salas[k].grilla.hidden = k !== sala; });
            const s = prepararSala(sala);
            s.grilla.hidden = false;
            volcarControles(s);
            aplicar();
            requestAnimationFrame(() => window.scrollTo(0, s.scroll || 0));
        } else {
            window.scrollTo(0, 0);
        }
        if (!opciones.sinRuta) escribirRuta(sala);
    }

    /** El shell avisa que la ruta cambió (p. ej. volver del detalle a #sala=decants). */
    window.alCambiarRuta = function alCambiarRuta(texto) {
        const parametros = App.core.parametros(texto || '');
        irASala(salaDe(parametros), { sinRuta: true });
        if ((parametros.get('con') || parametros.get('combo')) && comboListo) {
            comboListo.then(() => App.viewmodels.perfumeriaCombo.precargar(parametros));
        }
    };

    function iniciar() {
        Object.assign(el, {
            salas: document.querySelector('.perf-salas'),
            marcaSala: document.querySelector('.perf-salas__marca'),
            catalogo: $('perf-catalogo'),
            combo: $('perf-combo'),
            grillas: $('perf-grillas'),
            q: $('perf-q'),
            chips: $('perf-chips'),
            genero: document.querySelector('[data-filtro="genero"]'),
            estilo: document.querySelector('[data-filtro="estilo"]'),
            marca: $('perf-marca'),
            orden: $('perf-orden'),
            stock: $('perf-stock'),
            nuevos: $('perf-nuevos'),
            ofertas: $('perf-ofertas'),
            conteo: $('perf-conteo'),
            vacio: $('perf-vacio'),
            resultados: document.querySelector('.perf-resultados'),
            paginadores: Array.from(document.querySelectorAll('[data-paginador]')),
            paginadorPie: $('perf-paginador-pie'),
            filtros: $('perf-filtros'),
            filtrosBtn: $('perf-filtros-abrir'),
            insignia: $('perf-filtros-n'),
            velo: $('perf-velo')
        });
        ['perfumes', 'decants', 'cuadros'].forEach(sala => { salas[sala] = estadoInicial(); });

        el.salas.addEventListener('click', event => {
            const boton = event.target.closest('[data-sala]');
            if (boton) irASala(boton.dataset.sala);
        });
        el.salas.addEventListener('keydown', event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            const i = SALAS.indexOf(actual) + (event.key === 'ArrowRight' ? 1 : -1);
            const destino = SALAS[(i + SALAS.length) % SALAS.length];
            irASala(destino);
            el.salas.querySelector(`[data-sala="${destino}"]`).focus();
        });
        // Los botones cambian de ancho sin un `resize` propio: el shell ajusta
        // --shell-pill-w después, cargan las fuentes. Se sigue a los botones.
        const reubicarMarca = () => {
            const activa = el.salas.querySelector('[aria-selected="true"]');
            if (activa) moverMarca(activa);
        };
        if (window.ResizeObserver) {
            const observador = new ResizeObserver(reubicarMarca);
            el.salas.querySelectorAll('[data-sala]').forEach(boton => observador.observe(boton));
        }
        window.addEventListener('resize', reubicarMarca);

        enlazarControles();
        enlazarFiltros();
        enlazarPistaDeChips();
        comboListo = App.viewmodels.perfumeriaCombo.iniciar();

        const parametros = App.core.parametros();
        irASala(salaDe(parametros), { sinRuta: true });
        if (parametros.get('con') || parametros.get('combo')) {
            comboListo.then(() => App.viewmodels.perfumeriaCombo.precargar(parametros));
        }
        document.fonts && document.fonts.ready.then(() => {
            const activa = el.salas.querySelector('[aria-selected="true"]');
            if (activa) moverMarca(activa);
        });
    }

    App.core.onReady(iniciar);
})(window.PerfSuarez);
