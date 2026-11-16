(function (App) {
    const PANEL_META = [
        {
            slug: '',
            src: 'catalogo.html',
            title: 'Perfumería Suárez | Perfumes Originales en Bolivia',
            description: 'Perfumería Suárez: tu perfumería de confianza en Bolivia. Catálogo completo de perfumes originales para mujer y hombre. Envíos a todo el país.'
        },
        {
            slug: 'perfumeria',
            src: 'perfumeria.html',
            title: 'Perfumería | Perfumes, decants, cuadros y combos | Perfumería Suárez Bolivia',
            description: 'Perfumes originales completos, decants de 5 a 30 ml, cuadros decorativos y combos a medida. Todo en un solo lugar, con pedido directo por WhatsApp.'
        },
        {
            slug: 'aux',
            src: 'search.html',
            title: 'Perfumería Suárez',
            description: 'Explora el catálogo de Perfumería Suárez.'
        }
    ];

    const PRIMARY_PANEL_COUNT = 2;
    // Las secciones que antes eran paneles propios ahora son salas de Perfumería.
    const SALAS_DE_PERFUMERIA = { perfumes: 'perfumes', decants: 'decants', cuadros: 'cuadros', armarcombo: 'combo' };
    const AUX_PANEL_INDEX = PANEL_META.length - 1;

    function initCatalogShell() {
        const stage = document.querySelector('.swipe-stage');
        const track = document.getElementById('swipe-track');
        if (!stage || !track) {
            return;
        }

        document.documentElement.classList.add('swipe-shell-lock');

        const panels = Array.from(track.querySelectorAll('.swipe-panel'));
        const dots = Array.from(document.querySelectorAll('.swipe-progress span'));
        // Deslizar entre paneles. Las coordenadas son de PANTALLA (`screenX`):
        // los toques llegan dentro de cada iframe, y el iframe se mueve con el
        // dedo, asi que con `clientX` cada desplazamiento corregia al siguiente
        // y el panel avanzaba a medias, temblando.
        const dragState = { active: false, pending: false, startX: 0, startY: 0, originX: 0, prevTranslate: 0, currentTranslate: 0, pointerId: null, samples: [], frame: 0 };
        // A los 10 px se decide el eje; el panel arranca desde ahi, sin salto.
        const AXIS_SLOP = 10;
        const AXIS_RATIO = 1.2;
        // Resistencia al tirar mas alla del primer o el ultimo panel.
        const EDGE_RESISTANCE = 0.35;
        // Cambia de panel con un cuarto de ancho, o con un gesto rapido.
        const SWITCH_FRACTION = 0.25;
        const FLICK_VELOCITY = 0.4; // px/ms
        const SETTLE_MIN_MS = 180;
        const SETTLE_MAX_MS = 380;
        const SETTLE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
        let pendingHeavyWork = null;
        let settleTimer = 0;
        let currentIndex = 0;
        let currentRoute = null;
        let navController = null;
        let headerLinks = [];

        // El ancho se mide una vez y en cada resize: medirlo en cada toque
        // forzaba layout en medio del gesto.
        let cachedStageWidth = stage.getBoundingClientRect().width;
        // El escenario recorta (overflow: hidden) pero igual se puede desplazar:
        // un foco dentro de un iframe fuera de vista lo corría y el riel
        // quedaba mostrando el panel equivocado. Los paneles se mueven solo
        // con el transform del riel.
        stage.addEventListener('scroll', () => {
            if (stage.scrollLeft || stage.scrollTop) {
                stage.scrollLeft = 0;
                stage.scrollTop = 0;
            }
        });
        const container = stage.closest('.swipe-container');
        container?.addEventListener('scroll', () => {
            if (container.scrollLeft || container.scrollTop) {
                container.scrollLeft = 0;
                container.scrollTop = 0;
            }
        });
        const stageWidth = () => cachedStageWidth || (cachedStageWidth = stage.getBoundingClientRect().width);
        const applyTranslate = value => { track.style.transform = `translate3d(${value}px, 0, 0)`; };
        // Escritorio: el arrastre con mouse/lápiz queda DESHABILITADO (era incómodo);
        // en su lugar se navega con swipe de trackpad (evento wheel horizontal, más abajo).
        // El touch de mobile sigue por los listeners touch*, no por pointer*.
        const pointerShouldHandle = () => false;
        // El gesto que nace dentro de un elemento marcado (p.ej. el carrusel de
        // Novedades) NO debe iniciar el swipe lateral de paneles: o scrollea el
        // recuadro o scrollea el shell, nunca ambos.
        const isSwipeIgnored = event => {
            const target = event.target;
            return !!(target && typeof target.closest === 'function' && target.closest('[data-shell-swipe-ignore]'));
        };

        /*
         * Rutas sin trucos de hosting. La única URL pública es `/`: la sección
         * va en su query (`/?seccion=perfumeria&sala=decants`,
         * `/?seccion=perfume&id=…`), así que no hace falta que el servidor
         * reescriba rutas ni un 404.html que redirija. Los paneles reciben sus
         * parámetros en el hash (`perfume.html#id=…`), que sobrevive a los
         * hosts que redirigen `x.html` a `x` descartando el query.
         */
        const PARAMETROS_DE = {
            // `combo`: código de combo compartido (SRZ-…, combo-code.js).
            perfumeria: ['sala', 'con', 'tipo', 'combo'],
            search: ['q'],
            perfume: ['id', 'tipo']
        };
        const AUXILIARES = {
            search: {
                src: 'search.html',
                title: 'Resultados de búsqueda | Perfumería Suárez',
                description: 'Resultados de búsqueda dentro del catálogo de Perfumería Suárez.'
            },
            perfume: {
                src: 'perfume.html',
                title: 'Perfume | Perfumería Suárez',
                description: 'Detalle de producto dentro del catálogo de Perfumería Suárez.'
            },
            contacto: {
                src: 'contacto.html',
                title: 'Contacto | Perfumería Suárez',
                description: 'Canales de contacto y asesoría de Perfumería Suárez.'
            }
        };

        /** Solo los parámetros que la sección entiende, en orden estable. */
        function parametrosDe(slug, params) {
            const limpios = new URLSearchParams();
            (PARAMETROS_DE[slug] || []).forEach(clave => {
                const valor = params.get(clave);
                if (valor) limpios.set(clave, valor);
            });
            if (slug === 'perfumeria' && limpios.get('sala') === 'perfumes') {
                limpios.delete('sala');
            }
            return limpios;
        }

        function makeHistoryUrl(slug, params) {
            if (!slug) {
                return '/';
            }
            const query = new URLSearchParams({ seccion: slug });
            (params || new URLSearchParams()).forEach((valor, clave) => query.set(clave, valor));
            return `/?${query.toString()}`;
        }

        function srcConParametros(src, params) {
            const texto = params ? params.toString() : '';
            return texto ? `${src}#${texto}` : src;
        }

        function rutaDe(slug, params) {
            if (SALAS_DE_PERFUMERIA[slug]) {
                params = new URLSearchParams(params);
                params.set('sala', SALAS_DE_PERFUMERIA[slug]);
                slug = 'perfumeria';
            }
            if (slug === 'catalogo' || slug === 'index' || slug === 'inicio') {
                slug = '';
            }
            const primario = PANEL_META.findIndex((item, index) => index < PRIMARY_PANEL_COUNT && item.slug === slug);
            if (primario >= 0) {
                const meta = PANEL_META[primario];
                const propios = parametrosDe(slug, params);
                return {
                    index: primario,
                    panelSrc: srcConParametros(meta.src, propios),
                    historyUrl: makeHistoryUrl(slug, propios),
                    navHref: meta.src,
                    meta
                };
            }
            const aux = AUXILIARES[slug];
            if (aux) {
                const propios = parametrosDe(slug, params);
                return {
                    index: AUX_PANEL_INDEX,
                    panelSrc: srcConParametros(aux.src, propios),
                    historyUrl: makeHistoryUrl(slug, propios),
                    navHref: null,
                    meta: { slug, title: aux.title, description: aux.description }
                };
            }
            return rutaDe('', new URLSearchParams());
        }

        /**
         * `target` es una URL del sitio: `/?seccion=…` (la pública) o una
         * página (`perfume.html#id=…`, `perfumeria.html`, y también las rutas
         * viejas como `/perfumes`, por los links que ya circulan).
         */
        function resolveRoute(target) {
            const url = new URL(target, window.location.origin);
            const params = App.core.parametros(url.search);
            App.core.parametros(url.hash).forEach((valor, clave) => params.set(clave, valor));
            const pagina = url.pathname.replace(/\/+$/, '').replace(/^\//, '').replace(/\.html$/, '');
            const slug = !pagina || pagina === 'index' ? (params.get('seccion') || '') : pagina;
            return rutaDe(slug, params);
        }

        function updateDots() {
            dots.forEach((dot, index) => {
                dot.classList.toggle('is-active', index === currentIndex && index < PRIMARY_PANEL_COUNT);
            });
        }

        function syncHeaderLinks(href) {
            // Los links del header llegan con URL absoluta (include.view los
            // resuelve): se compara el pathname.
            const ruta = value => App.core.normalizeRoutePath(new URL(value, window.location.href).pathname);
            const normalized = href ? ruta(href) : null;
            headerLinks.forEach(link => {
                const match = normalized && ruta(link.getAttribute('href')) === normalized;
                link.classList.toggle('is-active', !!match);
                if (match) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        }

        /**
         * Lleva el track al panel actual. `duration` (ms) viene del gesto: la
         * llegada dura segun lo que falta y la velocidad del dedo. Sin ella, la
         * transicion de siempre (swipe-hub.css).
         */
        function snapToIndex(instant, duration) {
            const target = -currentIndex * stageWidth();
            clearTimeout(settleTimer);
            if (instant) {
                track.classList.add('is-dragging');
                track.style.transition = '';
                applyTranslate(target);
                requestAnimationFrame(() => track.classList.remove('is-dragging'));
            } else {
                track.classList.add('is-moving');
                track.style.transition = duration ? `transform ${Math.round(duration)}ms ${SETTLE_EASING}` : '';
                applyTranslate(target);
                settleTimer = setTimeout(settled, (duration || 450) + 80);
            }
            dragState.prevTranslate = target;
            dragState.currentTranslate = target;
        }

        /** Termino la llegada: se suelta la capa y corre lo que se postergo. */
        function settled() {
            clearTimeout(settleTimer);
            track.classList.remove('is-moving');
            track.style.transition = '';
            runHeavyWork();
        }

        function runHeavyWork() {
            const work = pendingHeavyWork;
            pendingHeavyWork = null;
            if (work) {
                work();
            }
        }

        track.addEventListener('transitionend', event => {
            if (event.target === track && event.propertyName === 'transform') {
                settled();
            }
        });

        function bindFrameGestures(iframe) {
            try {
                // La marca va en el documento, no en el iframe: un panel que
                // navega con `location.replace` trae un documento nuevo, sin
                // listeners, y hay que volver a engancharlos.
                const doc = iframe?.contentWindow?.document;
                if (!doc || doc.shellGesturesReady) {
                    return;
                }
                doc.shellGesturesReady = true;

                doc.addEventListener('touchstart', event => {
                    if (event.touches.length !== 1) return;
                    if (isSwipeIgnored(event)) return;
                    const touch = event.touches[0];
                    startDrag(touch.screenX, touch.screenY);
                }, { passive: true });
                doc.addEventListener('touchmove', event => {
                    if (event.touches.length !== 1) return;
                    const touch = event.touches[0];
                    moveDrag(touch.screenX, touch.screenY);
                }, { passive: true });
                doc.addEventListener('touchend', () => endDrag());
                doc.addEventListener('touchcancel', () => endDrag());
                doc.addEventListener('pointerdown', event => {
                    if (!pointerShouldHandle(event) || event.button !== 0) return;
                    if (isSwipeIgnored(event)) return;
                    startDrag(event.screenX, event.screenY, event.pointerId, true);
                });
                doc.addEventListener('pointermove', event => {
                    if (!pointerShouldHandle(event) || event.buttons === 0) return;
                    moveDrag(event.screenX, event.screenY, event.pointerId);
                });
                doc.addEventListener('pointerup', event => {
                    if (pointerShouldHandle(event)) {
                        endDrag(event.pointerId);
                    }
                });
                doc.addEventListener('pointercancel', event => {
                    if (pointerShouldHandle(event)) {
                        endDrag(event.pointerId);
                    }
                });
                doc.addEventListener('wheel', handleWheelNav, { passive: false });
            } catch (error) {
                // ignore inaccessible frames
            }
        }

        /**
         * En el teléfono el header es una píldora arriba a la izquierda. Cada
         * página embebida recibe dónde está, por si quiere usar el lugar a su
         * derecha: `--shell-pill-w` es lo
         * que ocupa desde el borde izquierdo de la pantalla hasta su borde
         * derecho.
         */
        function publishPill(doc) {
            const root = doc?.documentElement;
            if (!root) {
                return;
            }
            const rect = App.core.medirPildora(document);
            if (!rect || !rect.width || window.innerWidth > 960) {
                ['--shell-pill-w', '--shell-pill-h', '--shell-pill-top'].forEach(name => root.style.removeProperty(name));
                return;
            }
            root.style.setProperty('--shell-pill-w', `${Math.round(rect.right)}px`);
            root.style.setProperty('--shell-pill-h', `${Math.round(rect.height)}px`);
            root.style.setProperty('--shell-pill-top', `${Math.round(rect.top)}px`);
        }

        function refreshEmbeddedChrome() {
            panels.forEach(panel => {
                const iframe = panel.querySelector('iframe');
                try {
                    const doc = iframe?.contentWindow?.document;
                    if (!doc?.documentElement) {
                        return;
                    }
                    const bottom = Math.max(0, Math.round(App.core.medirPildora(document)?.bottom || 0));
                    if (bottom) {
                        doc.documentElement.style.setProperty('--shell-embed-top-offset', `${bottom + (window.innerWidth <= 960 ? 10 : 12)}px`);
                    }
                    publishPill(doc);
                } catch (error) {
                    // ignore inaccessible frames
                }
            });
        }

        window.addEventListener('resize', () => requestAnimationFrame(refreshEmbeddedChrome));
        document.addEventListener('headerReady', () => requestAnimationFrame(refreshEmbeddedChrome));

        // En iOS, enfocar un campo dentro de un iframe desplaza la página del
        // shell para mostrarlo, y al cerrar el teclado quedaba corrida unos px:
        // los paneles subían y dejaban de coincidir con la píldora. Con el
        // teclado cerrado, el shell vuelve siempre a 0 (con él abierto no se
        // toca, para no tapar el campo).
        const viewport = window.visualViewport;
        const tecladoCerrado = () => !viewport || viewport.height >= window.innerHeight - 1;
        const volverArriba = () => {
            if ((window.scrollY || window.scrollX) && tecladoCerrado()) {
                window.scrollTo(0, 0);
            }
        };
        window.addEventListener('scroll', volverArriba, { passive: true });
        viewport?.addEventListener('resize', () => {
            if (!tecladoCerrado()) {
                return;
            }
            volverArriba();
            requestAnimationFrame(refreshEmbeddedChrome);
        });

        /**
         * Le dice a cada pagina embebida si es la que se ve. Las que animan algo
         * se detienen fuera de vista: si no, siguen
         * gastando de fondo y traban el resto del sitio.
         */
        function markPanelVisibility(options = {}) {
            panels.forEach((panel, index) => {
                const iframe = panel.querySelector('iframe');
                // Fuera de vista, el panel no existe para el teclado ni para
                // el lector de pantalla (`inert` alcanza al documento del iframe).
                panel.inert = index !== currentIndex;
                try {
                    const doc = iframe?.contentWindow?.document;
                    const root = doc?.documentElement;
                    if (!root) {
                        return;
                    }
                    const hidden = index !== currentIndex;
                    // `soloOcultar`: al arrancar el deslizamiento solo se pausa
                    // lo que sale; el que llega se despierta al terminar
                    // (despertarlo al arrancar trababa la llegada).
                    if (!hidden && options.soloOcultar) {
                        return;
                    }
                    if (root.hasAttribute('data-panel-oculto') !== hidden) {
                        root.toggleAttribute('data-panel-oculto', hidden);
                        doc.dispatchEvent(new Event('shell:visibilidad'));
                    }
                } catch (error) {
                    // ignore inaccessible frames
                }
            });
        }

        function resetEmbeddedViewport(iframe) {
            try {
                const frameWindow = iframe.contentWindow;
                const doc = frameWindow?.document;
                if (!frameWindow || !doc) {
                    return;
                }

                if ('scrollRestoration' in frameWindow.history) {
                    frameWindow.history.scrollRestoration = 'manual';
                }

                const parentHeaderBottom = Math.max(0, Math.round(App.core.medirPildora(document)?.bottom || 0));
                const { documentElement, body } = doc;
                const scrollingElement = doc.scrollingElement || documentElement || body;
                if (documentElement) {
                    documentElement.style.scrollBehavior = 'auto';
                    documentElement.style.marginTop = '0';
                    if (parentHeaderBottom) {
                        documentElement.style.setProperty('--shell-embed-top-offset', `${parentHeaderBottom + (window.innerWidth <= 960 ? 10 : 12)}px`);
                    } else {
                        documentElement.style.removeProperty('--shell-embed-top-offset');
                    }
                    documentElement.scrollTop = 0;
                    publishPill(doc);
                }
                if (body) {
                    // Las paginas livianas (perfumes, decants, cuadros) no cargan
                    // common.viewmodel, que es el que marca esto: sin la marca
                    // reservaban arriba el lugar del header ancho de antes.
                    body.classList.add('is-shell-embed');
                    body.style.scrollBehavior = 'auto';
                    body.style.marginTop = '0';
                    body.style.removeProperty('padding-top');
                    body.scrollTop = 0;
                }

                doc.querySelector('main')?.style.removeProperty('margin-top');
                frameWindow.scrollTo(0, 0);
                if (scrollingElement) {
                    scrollingElement.scrollTop = 0;
                }

                requestAnimationFrame(() => {
                    frameWindow.scrollTo(0, 0);
                    if (scrollingElement) {
                        scrollingElement.scrollTop = 0;
                    }
                });
            } catch (error) {
                // ignore inaccessible frames
            }
        }

        function loadPanel(index, route) {
            const panel = panels[index];
            const iframe = panel?.querySelector('iframe');
            if (!panel || !iframe) {
                return;
            }

            // Sin ruta es una precarga de vecino: si ya está cargado, se deja
            // como está (si no, Perfumería volvía a su primera sala).
            if (!route && iframe.dataset.loadedSrc) {
                return;
            }

            const targetSrc = route?.panelSrc || panel.dataset.src;
            if (!targetSrc) {
                return;
            }

            if (iframe.dataset.loadedSrc === targetSrc) {
                return;
            }

            // La misma página con otros parámetros (Perfumería y sus salas): si
            // ya cargó y sabe cambiar de ruta sola, se le avisa en vez de recargar.
            const base = src => String(src).split(/[?#]/)[0];
            const mismaPagina = !!iframe.dataset.loadedSrc && base(iframe.dataset.loadedSrc) === base(targetSrc);
            if (mismaPagina) {
                try {
                    const avisar = iframe.contentWindow && iframe.contentWindow.alCambiarRuta;
                    if (typeof avisar === 'function') {
                        iframe.dataset.loadedSrc = targetSrc;
                        avisar(targetSrc.slice(base(targetSrc).length));
                        return;
                    }
                } catch (error) {
                    // otro origen: se recarga
                }
            }

            // Un iframe ya cargado navega con `location.replace`: cambiarle el
            // `src` sumaba una entrada al historial y "Atrás" volvía dentro del
            // panel en vez de al anterior. Si solo cambia el hash (otro perfume
            // en el detalle), la página escucha `hashchange` y se recarga sola.
            // "Ya cargado" es que terminó una carga de verdad, no que se le
            // pidió una: sobre el `about:blank` inicial de un iframe que todavía
            // está cargando, `location.replace` competía con esa carga y el
            // panel podía quedar en blanco (solo el mármol del shell).
            const yaCargado = iframe.dataset.frameListo === '1';
            iframe.dataset.loadedSrc = targetSrc;
            try {
                if (!yaCargado) throw new Error('primera carga');
                iframe.contentWindow.location.replace(new URL(targetSrc, window.location.href).href);
            } catch (error) {
                iframe.src = targetSrc;
            }
            iframe.addEventListener('load', () => {
                iframe.dataset.frameListo = '1';
                resetEmbeddedViewport(iframe);
                markPanelVisibility();
                panel.querySelector('.panel-loading')?.remove();
                bindFrameGestures(iframe);
            }, { once: true });
            vigilarCarga(index, iframe, targetSrc);
        }

        /**
         * Red de seguridad: si el panel que se está mirando sigue en
         * `about:blank` un rato después de pedirle su página (una carga que el
         * navegador postergó o perdió, p. ej. en la app instalada de Chrome al
         * volver de segundo plano), se le vuelve a pedir una vez.
         */
        function vigilarCarga(index, iframe, targetSrc) {
            clearTimeout(iframe._vigiaCarga);
            iframe._vigiaCarga = setTimeout(() => {
                if (iframe.dataset.loadedSrc !== targetSrc) return;
                let enBlanco = false;
                try {
                    const doc = iframe.contentDocument;
                    enBlanco = !doc || doc.URL === 'about:blank';
                } catch (error) {
                    return; // otro origen: cargó algo
                }
                if (!enBlanco) return;
                if (index === currentIndex) {
                    iframe.src = targetSrc;
                } else {
                    // Fuera de vista: se reintenta cuando se lo vuelva a pedir.
                    delete iframe.dataset.loadedSrc;
                }
            }, 6000);
        }

        /**
         * Cambia el panel activo. Lo liviano (mover el track, puntitos, clases
         * del header) va enseguida; lo pesado (cargar vecinos, history, meta)
         * con `options.defer` espera a que termine la animacion de llegada:
         * corrido en el mismo cuadro en que arrancaba, la trababa.
         */
        function updateActive(route, pushHistory, options = {}) {
            // Si quedo trabajo de un cambio anterior, primero ese.
            runHeavyWork();
            currentRoute = route;
            currentIndex = Math.max(0, Math.min(route.index, panels.length - 1));

            snapToIndex(!!options.instant, options.duration);
            updateDots();
            // El panel de destino tiene que estar: si no cargo, ya mismo.
            const targetFrame = panels[currentIndex]?.querySelector('iframe');
            if (!targetFrame?.dataset.loadedSrc) {
                loadPanel(currentIndex, route);
            }
            markPanelVisibility({ soloOcultar: !!options.defer });
            const heavyWork = () => {
                markPanelVisibility();
                loadPanel(currentIndex, route);
                if (currentIndex < PRIMARY_PANEL_COUNT) {
                    // Diferido: no compite por red/CPU con la carga del panel activo.
                    // Junto con la caché de sessionStorage del catálogo, este preload
                    // normalmente no genera tráfico real hacia el ERP.
                    const neighborBase = currentIndex;
                    App.views.shell.schedulePreload(() => {
                        // Solo paneles principales: el auxiliar (buscador,
                        // detalle) se carga cuando se lo pide.
                        if (neighborBase + 1 < PRIMARY_PANEL_COUNT) loadPanel(neighborBase + 1);
                        loadPanel(neighborBase - 1);
                    });
                }
                navController?.setActiveByHref(route.navHref);
                syncHeaderLinks(route.navHref);
                if (pushHistory) {
                    history.pushState({ route: route.historyUrl }, '', route.historyUrl);
                }
                App.views.shell.updateMeta(route.meta);
            };
            if (options.defer) {
                pendingHeavyWork = heavyWork;
            } else {
                heavyWork();
            }

            document.body.classList.toggle('is-home-panel', currentIndex === 0);
            document.body.classList.toggle('is-aux-panel', currentIndex >= PRIMARY_PANEL_COUNT);
            document.getElementById('catalog-dock')?.classList.remove('catalog-dock--detail-hidden');
        }

        function routeForIndex(index) {
            // Volver a un panel por deslizar o por el dock lo deja como estaba
            // (Perfumería sigue en su sala): se reusan sus parámetros.
            const meta = PANEL_META[index];
            const cargada = panels[index]?.querySelector('iframe')?.dataset.loadedSrc || '';
            const params = cargada.split(/[?#]/)[0] === meta.src
                ? App.core.parametros(cargada.slice(meta.src.length))
                : new URLSearchParams();
            return rutaDe(meta.slug, params);
        }

        function startDrag(x, y, pointerId, immediate) {
            if (dragState.active || dragState.pending || currentIndex >= PRIMARY_PANEL_COUNT) {
                return;
            }

            // Un dedo que agarra el panel a mitad de la llegada lo frena ahi.
            const moving = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
            dragState.pointerId = pointerId ?? null;
            dragState.startX = x;
            dragState.startY = y || 0;
            dragState.originX = x;
            dragState.prevTranslate = track.classList.contains('is-moving') ? moving : -currentIndex * stageWidth();
            dragState.currentTranslate = dragState.prevTranslate;
            dragState.samples = [];
            dragState.pending = !immediate;
            dragState.active = !!immediate;

            if (immediate) {
                activateDrag(x);
            }
        }

        function cancelPendingDrag() {
            dragState.pending = false;
            dragState.pointerId = null;
        }

        function activateDrag(x) {
            dragState.active = true;
            dragState.pending = false;
            // Desde aca sigue al dedo: los px de la decision no se saltan.
            dragState.originX = x;
            clearTimeout(settleTimer);
            track.classList.add('is-dragging', 'is-moving');
            track.style.transition = '';
            applyTranslate(dragState.prevTranslate);
        }

        function scheduleDragFrame() {
            if (dragState.frame) {
                return;
            }
            dragState.frame = requestAnimationFrame(() => {
                dragState.frame = 0;
                if (dragState.active) {
                    applyTranslate(dragState.currentTranslate);
                }
            });
        }

        function moveDrag(x, y, pointerId) {
            if (!dragState.active && !dragState.pending) {
                return;
            }
            if (dragState.pointerId !== null && pointerId !== undefined && pointerId !== null && pointerId !== dragState.pointerId) {
                return;
            }

            if (dragState.pending) {
                const deltaX = x - dragState.startX;
                const deltaY = (y ?? dragState.startY) - dragState.startY;
                if (Math.hypot(deltaX, deltaY) < AXIS_SLOP) {
                    return;
                }
                if (Math.abs(deltaX) > Math.abs(deltaY) * AXIS_RATIO) {
                    activateDrag(x);
                } else {
                    // Vertical: es scroll de la pagina, no de paneles.
                    cancelPendingDrag();
                    return;
                }
            }

            if (!dragState.active) {
                return;
            }

            let offset = x - dragState.originX;
            const target = dragState.prevTranslate + offset;
            const min = -(PRIMARY_PANEL_COUNT - 1) * stageWidth();
            if (target > 0) {
                offset = -dragState.prevTranslate + (target * EDGE_RESISTANCE);
            } else if (target < min) {
                offset = min - dragState.prevTranslate + ((target - min) * EDGE_RESISTANCE);
            }
            dragState.currentTranslate = dragState.prevTranslate + offset;
            const now = performance.now();
            dragState.samples.push([now, x]);
            while (dragState.samples.length > 2 && now - dragState.samples[0][0] > 100) {
                dragState.samples.shift();
            }
            scheduleDragFrame();
        }

        /** px/ms del dedo en los ultimos ~100 ms. */
        function releaseVelocity() {
            const samples = dragState.samples;
            if (samples.length < 2) {
                return 0;
            }
            const [t0, x0] = samples[0];
            const [t1, x1] = samples[samples.length - 1];
            return t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
        }

        function endDrag(pointerId) {
            if (!dragState.active && !dragState.pending) {
                return;
            }
            if (dragState.pointerId !== null && pointerId !== undefined && pointerId !== null && pointerId !== dragState.pointerId) {
                return;
            }

            if (dragState.pending && !dragState.active) {
                cancelPendingDrag();
                return;
            }

            cancelAnimationFrame(dragState.frame);
            dragState.frame = 0;
            dragState.active = false;
            dragState.pending = false;
            dragState.pointerId = null;
            track.classList.remove('is-dragging');
            applyTranslate(dragState.currentTranslate);

            const width = stageWidth();
            const restTranslate = -currentIndex * width;
            const moved = dragState.currentTranslate - restTranslate;
            const velocity = releaseVelocity();
            let nextIndex = currentIndex;
            const flick = Math.abs(velocity) > FLICK_VELOCITY && Math.sign(velocity) === Math.sign(moved) && Math.abs(moved) > 12;
            if (Math.abs(moved) > width * SWITCH_FRACTION || flick) {
                nextIndex = Math.max(0, Math.min(PRIMARY_PANEL_COUNT - 1, currentIndex + (moved < 0 ? 1 : -1)));
            }
            const remaining = Math.abs(-nextIndex * width - dragState.currentTranslate);
            const duration = Math.max(SETTLE_MIN_MS, Math.min(SETTLE_MAX_MS, remaining / Math.max(Math.abs(velocity), 1.2)));

            if (nextIndex !== currentIndex) {
                updateActive(routeForIndex(nextIndex), true, { duration, defer: true });
            } else {
                snapToIndex(false, duration);
            }
        }

        /*
         * Swipe de trackpad: el mismo arrastre que el dedo en el teléfono. Cada
         * `deltaX` mueve el panel 1:1 (startDrag/moveDrag), y al soltar decide
         * endDrag con la misma distancia y velocidad. El navegador no avisa
         * cuándo se levantan los dedos: se suelta cuando los deltas empiezan a
         * decaer parejo (es la inercia de macOS, no el dedo) o cuando dejan de
         * llegar. La cola de inercia después de soltar se come, para que no
         * mueva otro panel ni dispare el atrás/adelante del navegador.
         */
        const WHEEL_ID = 'wheel';
        const WHEEL_IDLE_MS = 90;       // sin eventos: dedos arriba, sin inercia
        const WHEEL_UNLOCK_MS = 180;    // la inercia terminó: se puede empezar otro
        const WHEEL_DECAY_RUN = 4;      // deltas seguidos achicándose = inercia
        const WHEEL_DECAY_MIN_PX = 6;   // un dedo lento (1-3 px) no es inercia
        const wheelDrag = { active: false, locked: false, x: 0, prev: 0, decays: 0, timer: 0 };

        function wheelPx(event) {
            if (event.deltaMode === 1) return event.deltaX * 16;            // líneas
            if (event.deltaMode === 2) return event.deltaX * stageWidth();  // páginas
            return event.deltaX;
        }

        function unlockWheelLater() {
            clearTimeout(wheelDrag.timer);
            wheelDrag.timer = setTimeout(() => { wheelDrag.locked = false; }, WHEEL_UNLOCK_MS);
        }

        /**
         * `porInercia`: los deltas venían decayendo, así que la velocidad de
         * las últimas muestras es la del gesto y puede ser un flick. Si se
         * suelta porque dejaron de llegar eventos, el dedo se había quedado
         * quieto: esas muestras son viejas y decide solo la distancia.
         */
        function releaseWheelDrag(porInercia) {
            if (!wheelDrag.active) return;
            if (!porInercia) {
                dragState.samples = [];
            }
            wheelDrag.active = false;
            wheelDrag.locked = true;
            unlockWheelLater();
            endDrag(WHEEL_ID);
        }

        function handleWheelNav(event) {
            // Dentro de un recuadro marcado (Novedades) la rueda es suya, aunque
            // el gesto venga de afuera o esté la cola de inercia de otro.
            if (isSwipeIgnored(event)) {
                releaseWheelDrag(false);
                return;
            }
            if (wheelDrag.locked) {
                if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                    event.preventDefault();
                }
                unlockWheelLater();
                return;
            }
            if (!wheelDrag.active) {
                if (currentIndex >= PRIMARY_PANEL_COUNT || isSwipeIgnored(event) || dragState.active || dragState.pending) {
                    return;
                }
                // Solo el gesto horizontal; el vertical es el scroll de la página.
                if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
                    return;
                }
                Object.assign(wheelDrag, { active: true, x: 0, prev: 0, decays: 0 });
                startDrag(0, 0, WHEEL_ID, true);
            }

            event.preventDefault();
            const dx = wheelPx(event);
            // Dedos a la izquierda (deltaX > 0) llevan al panel siguiente.
            wheelDrag.x -= dx;
            moveDrag(wheelDrag.x, 0, WHEEL_ID);

            const magnitude = Math.abs(dx);
            wheelDrag.decays = wheelDrag.prev >= WHEEL_DECAY_MIN_PX && magnitude < wheelDrag.prev ? wheelDrag.decays + 1 : 0;
            wheelDrag.prev = magnitude;
            if (wheelDrag.decays >= WHEEL_DECAY_RUN) {
                releaseWheelDrag(true);
                return;
            }
            clearTimeout(wheelDrag.timer);
            wheelDrag.timer = setTimeout(() => releaseWheelDrag(false), WHEEL_IDLE_MS);
        }

        function goToHref(href) {
            let route = resolveRoute(href);
            if (!route) {
                return false;
            }
            // Un link al panel "pelado" (el dock, el header) no le cambia la sala.
            if (route.index < PRIMARY_PANEL_COUNT && route.panelSrc === PANEL_META[route.index].src) {
                route = routeForIndex(route.index);
            }

            // Si el panel de destino ya está como se lo pide, lo pesado (vecinos,
            // history, despertar el panel) espera a que termine el deslizamiento,
            // como con el dedo: corrido al arrancar, trababa la llegada.
            const destino = panels[route.index]?.querySelector('iframe');
            const listo = route.index !== currentIndex && destino?.dataset.loadedSrc === route.panelSrc;
            updateActive(route, true, { defer: listo });
            return true;
        }

        window.catalogShellNavigate = goToHref;

        document.addEventListener('catalogNavReady', event => {
            navController = event.detail;
            navController?.setActiveByHref(currentRoute?.navHref);
        });

        document.addEventListener('headerReady', () => {
            headerLinks = Array.from(document.querySelectorAll('.nav-link'));
            syncHeaderLinks(currentRoute?.navHref);
        });

        track.addEventListener('touchstart', event => {
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            startDrag(touch.screenX, touch.screenY);
        }, { passive: true });
        track.addEventListener('touchmove', event => {
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            moveDrag(touch.screenX, touch.screenY);
        }, { passive: true });
        track.addEventListener('touchend', () => endDrag());
        track.addEventListener('touchcancel', () => endDrag());
        // A mitad del arrastre el cursor puede quedar sobre el panel vecino,
        // que es `inert`: sus eventos caen acá, en el documento del shell.
        stage.addEventListener('wheel', handleWheelNav, { passive: false });
        track.addEventListener('pointerdown', event => {
            if (!pointerShouldHandle(event) || event.button !== 0) return;
            startDrag(event.screenX, event.screenY, event.pointerId, true);
        });
        track.addEventListener('pointermove', event => {
            if (!pointerShouldHandle(event) || event.buttons === 0) return;
            moveDrag(event.screenX, event.screenY, event.pointerId);
        });
        track.addEventListener('pointerup', event => {
            if (pointerShouldHandle(event)) {
                endDrag(event.pointerId);
            }
        });
        track.addEventListener('pointercancel', event => {
            if (pointerShouldHandle(event)) {
                endDrag(event.pointerId);
            }
        });

        window.addEventListener('resize', () => {
            cachedStageWidth = stage.getBoundingClientRect().width;
            snapToIndex(true);
        });
        window.addEventListener('popstate', event => {
            const routeTarget = typeof event.state?.route === 'string'
                ? event.state.route
                : window.location.pathname + window.location.search + window.location.hash;
            updateActive(resolveRoute(routeTarget), false);
        });

        const initialRoute = resolveRoute(window.location.pathname + window.location.search + window.location.hash);
        history.replaceState({ route: initialRoute.historyUrl }, '', initialRoute.historyUrl);
        // Al abrir el sitio no hay de dónde deslizar: el panel pedido (un
        // perfume, Watches) aparece en su lugar. Animado desde Inicio, con la
        // ventana todavía sin pintar, el riel quedaba a mitad de camino.
        updateActive(initialRoute, false, { instant: true });
    }

    App.viewmodels.shell = {
        initCatalogShell
    };

    App.core.onReady(initCatalogShell);
})(window.PerfSuarez);
