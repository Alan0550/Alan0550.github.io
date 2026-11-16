/* Carrusel de Novedades de la pantalla de inicio.
   Reemplaza al buscador principal: muestra los artes promocionales con
   desplazamiento por scroll-snap, puntos indicadores y autoplay suave.
   Es autónomo y no hace nada si la sección no está presente.
   Las diapositivas salen de js/data/novedades.js (lo publica el ERP); si ese
   archivo falta, quedan las escritas en catalogo.html como respaldo. */
(function () {
    'use strict';

    var WHATSAPP = '59178064327';

    function hrefDe(novedad) {
        if (novedad.tipo === 'perfume') {
            return 'perfume.html#id=' + novedad.valor;
        }
        if (novedad.tipo === 'busqueda') {
            return 'search.html#q=' + encodeURIComponent(novedad.valor);
        }
        return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(novedad.valor);
    }

    function construirSlide(novedad, indice) {
        var a = document.createElement('a');
        var href = hrefDe(novedad);
        a.className = 'home-novedades__slide';
        a.setAttribute('href', href);
        a.setAttribute('aria-label', novedad.alt);
        if (novedad.tipo === 'whatsapp') {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        } else {
            a.setAttribute('data-shell-target', href);
        }
        var img = document.createElement('img');
        // `loading` va ANTES que `src`: el navegador empieza a bajar la imagen en
        // cuanto ve el src, y si lazy todavía no está puesto las baja todas.
        img.setAttribute('loading', indice === 0 ? 'eager' : 'lazy');
        img.setAttribute('decoding', 'async');
        img.setAttribute('alt', novedad.alt);
        img.setAttribute('width', novedad.ancho);
        img.setAttribute('height', novedad.alto);
        img.setAttribute('src', novedad.src);
        a.appendChild(img);
        return a;
    }

    // Las diapositivas del ERP; si no hay (archivo ausente o vacío), las de
    // respaldo, que viven en un <template> para que el navegador no las
    // descargue cuando no hacen falta.
    function renderizar(track) {
        var novedades = window.CATALOGO_NOVEDADES;
        if (Array.isArray(novedades) && novedades.length > 0) {
            track.innerHTML = '';
            novedades.forEach(function (novedad, indice) {
                track.appendChild(construirSlide(novedad, indice));
            });
            return;
        }
        var respaldo = document.getElementById('novedades-respaldo');
        if (respaldo) {
            track.innerHTML = respaldo.innerHTML;
        }
    }

    window.HomeNovedades = { construirSlide: construirSlide, renderizar: renderizar };

    function init() {
        var track = document.getElementById('novedades-track');
        var dotsWrap = document.getElementById('novedades-dots');
        if (!track) {
            return;
        }
        renderizar(track);

        var slides = Array.prototype.slice.call(track.children);
        if (slides.length === 0) {
            return;
        }

        var reduceMotion = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var current = 0;
        var autoplayId = null;
        var AUTOPLAY_MS = 5000;

        // Construir puntos indicadores
        var dots = [];
        if (dotsWrap) {
            slides.forEach(function (_, index) {
                var dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'home-novedades__dot';
                dot.setAttribute('role', 'tab');
                dot.setAttribute('aria-label', 'Novedad ' + (index + 1));
                dot.addEventListener('click', function () {
                    goTo(index, true);
                    restartAutoplay();
                });
                dotsWrap.appendChild(dot);
                dots.push(dot);
            });
        }

        function setActive(index) {
            current = index;
            dots.forEach(function (dot, i) {
                var active = i === index;
                dot.classList.toggle('is-active', active);
                dot.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        }

        function goTo(index, smooth) {
            var slide = slides[index];
            if (!slide) {
                return;
            }
            track.scrollTo({
                left: slide.offsetLeft - track.offsetLeft,
                behavior: smooth && !reduceMotion ? 'smooth' : 'auto'
            });
            setActive(index);
        }

        // Sincronizar el punto activo según la posición de scroll
        var scrollTick = null;
        track.addEventListener('scroll', function () {
            if (scrollTick) {
                return;
            }
            scrollTick = window.requestAnimationFrame(function () {
                scrollTick = null;
                var center = track.scrollLeft + track.clientWidth / 2;
                var nearest = 0;
                var minDist = Infinity;
                slides.forEach(function (slide, i) {
                    var slideCenter = slide.offsetLeft - track.offsetLeft + slide.clientWidth / 2;
                    var dist = Math.abs(slideCenter - center);
                    if (dist < minDist) {
                        minDist = dist;
                        nearest = i;
                    }
                });
                setActive(nearest);
            });
        }, { passive: true });

        function startAutoplay() {
            if (reduceMotion || slides.length < 2 || autoplayId) {
                return;
            }
            autoplayId = window.setInterval(function () {
                goTo((current + 1) % slides.length, true);
            }, AUTOPLAY_MS);
        }

        function stopAutoplay() {
            if (autoplayId) {
                window.clearInterval(autoplayId);
                autoplayId = null;
            }
        }

        function restartAutoplay() {
            stopAutoplay();
            startAutoplay();
        }

        // Swipe de trackpad en escritorio: una novedad por gesto. El scroll-snap
        // nativo volvía a la misma slide si el gesto no pasaba de la mitad, y el
        // shell escucha la rueda en este documento para cambiar de panel: el
        // gesto se queda acá. La cola de inercia se come hasta 180 ms de calma.
        var UMBRAL_RUEDA = 24;
        var ruedaAcumulada = 0;
        var ruedaBloqueada = false;
        var ruedaReinicio = null;
        track.addEventListener('wheel', function (event) {
            if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            stopAutoplay(); // vuelve con mouseleave
            window.clearTimeout(ruedaReinicio);
            ruedaReinicio = window.setTimeout(function () {
                ruedaAcumulada = 0;
                ruedaBloqueada = false;
            }, 180);
            if (ruedaBloqueada || slides.length < 2) {
                return;
            }
            ruedaAcumulada += event.deltaX;
            if (Math.abs(ruedaAcumulada) > UMBRAL_RUEDA) {
                ruedaBloqueada = true;
                var destino = current + (ruedaAcumulada > 0 ? 1 : -1);
                goTo(Math.max(0, Math.min(slides.length - 1, destino)), true);
            }
        }, { passive: false });

        // Pausar mientras el usuario interactúa o la pestaña está oculta
        ['pointerdown', 'touchstart', 'mouseenter'].forEach(function (evt) {
            track.addEventListener(evt, stopAutoplay, { passive: true });
        });
        ['pointerup', 'touchend', 'mouseleave'].forEach(function (evt) {
            track.addEventListener(evt, restartAutoplay, { passive: true });
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                stopAutoplay();
            } else {
                startAutoplay();
            }
        });

        setActive(0);
        startAutoplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
