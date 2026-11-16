(function (App) {
    'use strict';

    /**
     * Resultados de búsqueda (search.html#q=…), con las mismas piezas de
     * Perfumería. El orden es el de siempre (search.model: relevancia); los
     * chips filtran por género y estilo. Cada resultado se muestra como frasco
     * completo si lo hay, si no como decant (o cuadro).
     */

    const renderer = App.viewmodels.catalogRenderer;
    const buscar = App.core.search;
    const $ = id => document.getElementById(id);

    function modoDe(perfume) {
        if (perfume.image_miniatura && perfume.precio_completo) return 'perfumes';
        if (perfume.precios_decants) return 'decants';
        if (perfume.precio_cuadro != null) return 'cuadros';
        return 'perfumes';
    }

    // Otra búsqueda en este mismo panel solo cambia el hash: se recarga.
    window.addEventListener('hashchange', () => window.location.reload());

    App.core.onReady(() => {
        const q = (App.core.parametros().get('q') || '').trim();
        const grilla = $('busqueda-grilla');
        const conteo = $('perf-conteo');
        const vacio = $('perf-vacio');
        const input = $('busqueda-q');
        const filtros = { genero: 'all', estilo: 'all' };

        input.value = q;
        $('busqueda-form').addEventListener('submit', event => {
            event.preventDefault();
            const nueva = input.value.trim();
            if (nueva) App.core.navigateToSearch(nueva);
        });
        document.querySelector('[data-ir-perfumeria]').addEventListener('click', event => {
            event.preventDefault();
            App.core.navigateToShell('perfumeria.html');
        });
        if (q) {
            document.querySelector('.perf-titulo--busqueda').innerHTML = `<span>«${renderer.escapar(q)}»</span>`;
            document.title = `${q} | Perfumería Suárez`;
        }

        const resultados = q ? App.models.search.searchPerfumes(q) : [];
        grilla.innerHTML = resultados.map((p, i) => renderer.renderPieza(p, modoDe(p), i)).join('');
        const piezas = Array.from(grilla.querySelectorAll('.pieza'));

        function aplicar() {
            let visibles = 0;
            piezas.forEach(pieza => {
                const tags = buscar.normalizeText(pieza.dataset.tags || '');
                const genero = filtros.genero === 'all' || tags.includes(buscar.normalizeText(filtros.genero));
                const e = buscar.normalizeText(filtros.estilo);
                const estilo = filtros.estilo === 'all' || (e === 'disenador' ? (!tags.includes('nicho') && !tags.includes('arabes')) : tags.includes(e));
                const ok = genero && estilo;
                pieza.classList.toggle('is-filtrada', !ok);
                if (ok) visibles += 1;
            });
            conteo.textContent = q ? (visibles === 1 ? '1 resultado' : `${visibles} resultados`) : 'Escribí qué buscás';
            vacio.hidden = !q || visibles > 0;
        }

        $('perf-chips').addEventListener('click', event => {
            const chip = event.target.closest('.perf-chip');
            if (!chip) return;
            const grupo = chip.closest('[data-filtro]');
            const clave = grupo.dataset.filtro;
            const valor = clave === 'estilo' && filtros.estilo === chip.dataset.valor ? 'all' : chip.dataset.valor;
            filtros[clave] = valor;
            grupo.querySelectorAll('[role="radio"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.valor === valor)));
            aplicar();
        });

        grilla.addEventListener('click', event => {
            const enlace = event.target.closest('.pieza__enlace');
            if (!enlace || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            const pieza = enlace.closest('.pieza');
            if (pieza.classList.contains('pieza--cuadros')) App.core.navigateToCuadroDetail(pieza.dataset.id);
            else if (pieza.classList.contains('pieza--decants')) App.core.navigateToDecantDetail(pieza.dataset.id);
            else App.core.navigateToProductDetail(pieza.dataset.id);
        });

        aplicar();
        // Sin término, el cursor va al campo; pero no si la página está
        // precargada fuera de vista: enfocar dentro de un iframe oculto hace
        // que el navegador desplace el escenario del shell para mostrarlo.
        if (!q && !document.documentElement.hasAttribute('data-panel-oculto') && window.parent === window) {
            input.focus({ preventScroll: true });
        }
    });
})(window.PerfSuarez);
