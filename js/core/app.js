(function (window) {
    const PerfSuarez = window.PerfSuarez || {
        core: {},
        config: {},
        models: {},
        views: {},
        viewmodels: {},
        state: {}
    };

    PerfSuarez.core.onReady = function onReady(callback) {
        function runWhenDataReady() {
            const dataReady = PerfSuarez.data && PerfSuarez.data.perfumesReady;
            if (dataReady && typeof dataReady.then === 'function') {
                dataReady.then(callback, callback);
                return;
            }

            callback();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', runWhenDataReady, { once: true });
            return;
        }

        runWhenDataReady();
    };

    // El stock general habilita completos; cada tamaño puede agotarse por
    // separado. Los datos antiguos sin en_stock por tamaño conservan el
    // comportamiento de la bandera general. No se modifica el catálogo.
    function availableCompleteEntries(perfume) {
        if (!perfume || !perfume.en_stock_completos || !perfume.precio_completo) {
            return [];
        }
        const entries = Array.isArray(perfume.precio_completo)
            ? perfume.precio_completo : [perfume.precio_completo];
        return entries.filter(entry => entry && entry.en_stock !== false);
    }

    function isCompleteSizeAvailable(perfume, size) {
        const ml = Number(size);
        return Number.isFinite(ml) && ml > 0
            && availableCompleteEntries(perfume).some(entry => Number(entry.ml) === ml);
    }

    PerfSuarez.core.stock = { availableCompleteEntries, isCompleteSizeAvailable };

    PerfSuarez.core.normalizeRoutePath = function normalizeRoutePath(path) {
        if (!path) {
            return '/index.html';
        }

        let normalized = path.replace(/\/+/g, '/');
        normalized = normalized.replace(/(\.html)\/+$/i, '$1');
        if (!normalized.startsWith('/')) {
            normalized = `/${normalized}`;
        }
        if (normalized === '/' || normalized === '') {
            return '/index.html';
        }
        if (normalized.endsWith('/')) {
            return `${normalized}index.html`;
        }
        return normalized;
    };

    PerfSuarez.core.resolvePath = function resolvePath(value, baseHref) {
        if (!value) {
            return '';
        }

        if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('#') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('javascript:')) {
            return value;
        }

        try {
            return new URL(value, baseHref || window.location.href).href;
        } catch (error) {
            return value;
        }
    };

    // El número de la tienda para los links wa.me, en formato internacional
    // (591 = Bolivia): sin el código de país wa.me no encuentra el chat.
    PerfSuarez.core.WHATSAPP = '59178064327';

    PerfSuarez.core.openWhatsApp = function openWhatsApp(number, message, target) {
        const url = `https://wa.me/${number}/?text=${encodeURIComponent(message)}`;
        window.open(url, target || '_blank', 'noopener');
        return url;
    };

    const SEARCH_ALIASES = [
        [/\bj\s*p\s*g\b/g, ' jean paul gaultier '],
        [/\bjpg\b/g, ' jean paul gaultier '],
        [/\bysl\b/g, ' yves saint laurent '],
        [/\bd\s*&\s*g\b/g, ' dolce gabbana '],
        [/\bd\s+y\s+g\b/g, ' dolce gabbana '],
        [/\bd\s+g\b/g, ' dolce gabbana '],
        [/\bdg\b/g, ' dolce gabbana '],
        [/\bch\b/g, ' carolina herrera '],
        [/\bmnt\s*blanc\b/g, ' montblanc '],
        [/\bmont\s+blanc\b/g, ' montblanc '],
        [/\bpaco\s+rabane\b/g, ' rabanne '],
        [/\bpaco\b/g, ' rabanne '],
        [/\bswy\b/g, ' stronger with you ']
    ];

    function normalizeSearchText(value) {
        let text = String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/&/g, ' y ');

        SEARCH_ALIASES.forEach(([pattern, replacement]) => {
            text = text.replace(pattern, replacement);
        });

        return text
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function tokenizeSearchText(value) {
        const normalized = normalizeSearchText(value);
        return normalized ? normalized.split(' ').filter(Boolean) : [];
    }

    function levenshteinDistance(a, b) {
        if (a === b) {
            return 0;
        }
        if (!a) {
            return b.length;
        }
        if (!b) {
            return a.length;
        }

        const previous = new Array(b.length + 1);
        const current = new Array(b.length + 1);

        for (let i = 0; i <= b.length; i += 1) {
            previous[i] = i;
        }

        for (let i = 1; i <= a.length; i += 1) {
            current[0] = i;
            for (let j = 1; j <= b.length; j += 1) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                current[j] = Math.min(
                    current[j - 1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + cost
                );
            }

            for (let j = 0; j <= b.length; j += 1) {
                previous[j] = current[j];
            }
        }

        return previous[b.length];
    }

    function maxTokenDistance(token) {
        if (token.length <= 2) {
            return 0;
        }
        if (token.length <= 5) {
            return 1;
        }
        return 2;
    }

    function scoreToken(token, targetText, targetTokens) {
        if (!token) {
            return 0;
        }

        if (targetTokens.indexOf(token) >= 0) {
            return 12 + token.length;
        }
        if (targetText.indexOf(token) >= 0) {
            return 9 + token.length;
        }
        if (token.length >= 4 && targetTokens.some(targetToken => targetToken.length >= 4 && (targetToken.indexOf(token) >= 0 || token.indexOf(targetToken) >= 0))) {
            return 6 + token.length;
        }

        const maxDistance = maxTokenDistance(token);
        if (!maxDistance) {
            return 0;
        }

        let bestDistance = Infinity;
        targetTokens.forEach(targetToken => {
            if (Math.abs(targetToken.length - token.length) > maxDistance) {
                return;
            }
            bestDistance = Math.min(bestDistance, levenshteinDistance(token, targetToken));
        });

        if (bestDistance <= maxDistance) {
            return 5 + token.length - bestDistance;
        }

        return 0;
    }

    function scoreSearchMatch(query, target) {
        const queryText = normalizeSearchText(query);
        if (!queryText) {
            return 0;
        }

        const targetText = normalizeSearchText(target);
        if (!targetText) {
            return 0;
        }

        if (targetText.indexOf(queryText) >= 0) {
            return 100 + queryText.length;
        }

        const queryTokens = tokenizeSearchText(queryText);
        const targetTokens = tokenizeSearchText(targetText);
        let matched = 0;
        let score = 0;

        queryTokens.forEach(token => {
            const tokenScore = scoreToken(token, targetText, targetTokens);
            if (tokenScore > 0) {
                matched += 1;
                score += tokenScore;
            }
        });

        if (!matched) {
            return 0;
        }

        const requiredMatches = queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.65);
        return matched >= requiredMatches ? score + (matched * 3) : 0;
    }

    PerfSuarez.core.search = {
        normalizeText: normalizeSearchText,
        scoreMatch: scoreSearchMatch,
        matches: function matches(query, target) {
            return scoreSearchMatch(query, target) > 0;
        }
    };

    PerfSuarez.core.confirmAndOpenWhatsApp = function confirmAndOpenWhatsApp(options) {
        const confirmation = window.confirm(options.confirmationMessage);
        if (!confirmation) {
            return false;
        }

        PerfSuarez.core.openWhatsApp(options.number, options.message, options.target);
        return true;
    };

    /**
     * Parámetros de una página. Las páginas embebidas los reciben en el hash
     * (`perfume.html#id=…`): el hash no viaja al servidor, así que sobrevive a
     * los hosts que redirigen `x.html` a `x` y descartan el query (`npx serve`,
     * Cloudflare Pages). El query sigue valiendo, y el hash manda si están ambos.
     * Con `fuente` (un texto `?a=1`, `#a=1` o `a=1`) se lee ese texto.
     */
    PerfSuarez.core.parametros = function parametros(fuente) {
        if (fuente != null) {
            return new URLSearchParams(String(fuente).replace(/^[?#]/, ''));
        }
        const params = new URLSearchParams(window.location.search.replace(/^\?/, ''));
        new URLSearchParams(window.location.hash.replace(/^#/, '')).forEach((valor, clave) => params.set(clave, valor));
        return params;
    };

    /**
     * Dónde está la píldora del header (`.header-shell`) en la pantalla, SIN
     * contar transforms: en Inicio el header se esconde con translateY(-110%)
     * y medirlo ahí daba un top negativo; Perfumería, cargada al lado, ponía
     * sus salas fuera de la pantalla. `doc` es el documento del shell.
     */
    PerfSuarez.core.medirPildora = function medirPildora(doc) {
        const pildora = doc && doc.querySelector('.header-shell');
        if (!pildora || !pildora.offsetWidth) {
            return null;
        }
        let top = 0;
        let left = 0;
        for (let el = pildora; el; el = el.offsetParent) {
            top += el.offsetTop;
            left += el.offsetLeft;
        }
        const width = pildora.offsetWidth;
        const height = pildora.offsetHeight;
        return { top, left, width, height, right: left + width, bottom: top + height };
    };

    PerfSuarez.core.getShellNavigator = function getShellNavigator() {
        if (typeof window.catalogShellNavigate === 'function') {
            return window.catalogShellNavigate;
        }
        if (window.parent && window.parent !== window && typeof window.parent.catalogShellNavigate === 'function') {
            return window.parent.catalogShellNavigate;
        }
        return null;
    };

    /** Dentro del shell, cambia de panel; abierta sola, la página navega normal. */
    PerfSuarez.core.navigateToShell = function navigateToShell(target) {
        const navigator = PerfSuarez.core.getShellNavigator();
        if (navigator && navigator(target)) {
            return true;
        }
        window.location.href = target;
        return true;
    };

    const RETURN_ROUTE_KEY = 'perf-suarez-return-route';

    // El detalle no es un lugar al que volver: ni `/?seccion=perfume` ni perfume.html.
    function esRutaDeDetalle(url) {
        return url.searchParams.get('seccion') === 'perfume' || /\/perfume(\.html)?$/.test(url.pathname);
    }

    PerfSuarez.core.getCurrentShellRoute = function getCurrentShellRoute() {
        try {
            const sourceWindow = window.parent && window.parent !== window ? window.parent : window;
            return `${sourceWindow.location.pathname}${sourceWindow.location.search}${sourceWindow.location.hash}`;
        } catch (error) {
            return `${window.location.pathname}${window.location.search}${window.location.hash}`;
        }
    };

    PerfSuarez.core.rememberReturnRoute = function rememberReturnRoute(route) {
        if (!route) {
            return;
        }

        try {
            const url = new URL(route, window.location.origin);
            if (esRutaDeDetalle(url)) {
                return;
            }
            window.sessionStorage.setItem(RETURN_ROUTE_KEY, `${url.pathname}${url.search}${url.hash}`);
        } catch (error) {
            // ignore malformed routes
        }
    };

    PerfSuarez.core.getRememberedReturnRoute = function getRememberedReturnRoute() {
        try {
            const route = window.sessionStorage.getItem(RETURN_ROUTE_KEY);
            if (!route) {
                return 'catalogo.html';
            }

            const url = new URL(route, window.location.origin);
            return esRutaDeDetalle(url) ? 'catalogo.html' : `${url.pathname}${url.search}${url.hash}`;
        } catch (error) {
            return 'catalogo.html';
        }
    };

    PerfSuarez.core.navigateBackToCatalog = function navigateBackToCatalog() {
        return PerfSuarez.core.navigateToShell(PerfSuarez.core.getRememberedReturnRoute());
    };

    PerfSuarez.core.navigateToProductDetail = function navigateToProductDetail(id) {
        PerfSuarez.core.rememberReturnRoute(PerfSuarez.core.getCurrentShellRoute());
        return PerfSuarez.core.navigateToShell('perfume.html#id=' + encodeURIComponent(id));
    };

    /** Desde Decants: el detalle muestra solo los decants (con su foto). */
    PerfSuarez.core.navigateToDecantDetail = function navigateToDecantDetail(id) {
        PerfSuarez.core.rememberReturnRoute(PerfSuarez.core.getCurrentShellRoute());
        return PerfSuarez.core.navigateToShell('perfume.html#id=' + encodeURIComponent(id) + '&tipo=decant');
    };

    PerfSuarez.core.navigateToCuadroDetail = function navigateToCuadroDetail(id) {
        PerfSuarez.core.rememberReturnRoute(PerfSuarez.core.getCurrentShellRoute());
        return PerfSuarez.core.navigateToShell('perfume.html#id=' + encodeURIComponent(id) + '&tipo=cuadro');
    };

    /**
     * Esconde (o devuelve) el dock del shell. Las hojas que suben desde abajo
     * en una página embebida quedarían tapadas por él: el dock es del padre y
     * va fijo encima del iframe.
     */
    PerfSuarez.core.ocultarDockDelShell = function ocultarDockDelShell(ocultar) {
        try {
            const padre = window.parent && window.parent !== window ? window.parent.document : null;
            const dock = padre && padre.getElementById('catalog-dock');
            if (dock) {
                dock.classList.toggle('catalog-dock--detail-hidden', !!ocultar);
            }
        } catch (error) {
            // shell de otro origen
        }
    };

    PerfSuarez.core.navigateToSearch = function navigateToSearch(query) {
        return PerfSuarez.core.navigateToShell('search.html#q=' + encodeURIComponent(query));
    };

    window.PerfSuarez = PerfSuarez;
})(window);
