(function (App) {
    'use strict';

    /**
     * Pedir por WhatsApp con imagen.
     *
     * Un link wa.me solo lleva texto. Para mandar también la foto, se arma una
     * "ficha" del pedido (canvas: productos con su miniatura, precios y total)
     * y se la pasa a la hoja de compartir del teléfono (`navigator.share` con
     * archivo): el cliente elige WhatsApp y el chat de la tienda. No se puede
     * fijar el número desde ahí; por eso siempre queda "Solo texto", que abre
     * el chat de la tienda directo con el mensaje de siempre.
     *
     * Sin hoja de compartir con archivos (casi todo escritorio): wa.me con el
     * texto más los links a las fotos (WhatsApp muestra la vista previa de la
     * primera) y la ficha se descarga para adjuntarla.
     *
     * La hoja que explica todo se abre en el documento de arriba (el shell)
     * cuando se puede: dentro de un iframe la taparían el header y el dock.
     */

    const NUMERO = App.core.WHATSAPP;
    const SITIO = 'https://perfumeriasuarez.com/';
    const ANCHO = 1080;

    function urlWhatsApp(texto, numero) {
        return `https://wa.me/${numero || NUMERO}/?text=${encodeURIComponent(texto)}`;
    }

    function puedeCompartirArchivos() {
        try {
            const prueba = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' });
            return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [prueba] }));
        } catch (error) {
            return false;
        }
    }

    function absoluta(src) {
        if (!src || /^(data|blob):/.test(src)) return null;
        try {
            const url = new URL(src, SITIO);
            return /^https?:$/.test(url.protocol) ? url.href.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//, SITIO) : null;
        } catch (error) {
            return null;
        }
    }

    /* ---------------- La ficha (canvas) ---------------- */

    function cargarImagen(src) {
        return new Promise(function (resolve) {
            if (!src) {
                resolve(null);
                return;
            }
            const imagen = new Image();
            imagen.onload = function () {
                if (imagen.src.startsWith('blob:')) URL.revokeObjectURL(imagen.src);
                resolve(imagen);
            };
            imagen.onerror = function () { resolve(null); };
            const ajena = /^https?:/.test(src) && !src.startsWith(location.origin);
            if (!ajena) {
                imagen.src = src;
                return;
            }
            // Las fotos del ERP o del CDN (cuadros, decants en producción) traen
            // CORS abierto, pero la página ya las mostró en un <img> sin CORS y
            // el navegador le daba al canvas esa copia: fallaba o lo ensuciaba
            // y la ficha salía sin foto. Se piden aparte con fetch en modo CORS
            // y se dibujan desde un blob propio.
            fetch(src, { mode: 'cors', credentials: 'omit' })
                .then(function (respuesta) {
                    if (!respuesta.ok) throw new Error(String(respuesta.status));
                    return respuesta.blob();
                })
                .then(function (blob) {
                    imagen.src = URL.createObjectURL(blob);
                })
                .catch(function () {
                    imagen.crossOrigin = 'anonymous';
                    imagen.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'cors=1';
                });
        });
    }

    function urlDeVariable(elemento, variable) {
        const valor = getComputedStyle(elemento).getPropertyValue(variable).trim();
        const coincide = /^url\(["']?(.*?)["']?\)$/.exec(valor);
        return coincide ? coincide[1] : null;
    }

    const TEMAS = {
        marmol: {
            base: '#EAE0CF', velo: 'rgba(244, 238, 227, 0.55)', tinta: '#2B241C', tinta2: '#6B5D4C', tinta3: '#978873',
            filete: 'rgba(183, 146, 76, 0.7)', acento: '#8A6E37', nicho: '#F4EEE3', logoClaro: false
        }
    };

    function fuentes(tema) {
        return { display: "'Bodoni Moda', Georgia, serif", ui: "'Jost', system-ui, sans-serif" };
    }

    function cortarLineas(ctx, texto, ancho) {
        const palabras = String(texto).split(/\s+/);
        const lineas = [];
        let actual = '';
        palabras.forEach(function (palabra) {
            const prueba = actual ? `${actual} ${palabra}` : palabra;
            if (ctx.measureText(prueba).width > ancho && actual) {
                lineas.push(actual);
                actual = palabra;
            } else {
                actual = prueba;
            }
        });
        if (actual) lineas.push(actual);
        return lineas;
    }

    function rectRedondo(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    /** Dibuja una foto de producto "contain" en un recuadro, con el blanco multiplicado. */
    function dibujarFoto(ctx, imagen, x, y, w, h, multiplicar) {
        const escala = Math.min(w / imagen.naturalWidth, h / imagen.naturalHeight);
        const dw = imagen.naturalWidth * escala;
        const dh = imagen.naturalHeight * escala;
        ctx.save();
        if (multiplicar) ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(imagen, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        ctx.restore();
    }

    /**
     * items: [{ titulo, subtitulo, lineas[], precio, moneda, imagen, imagenes[], foto }]
     *   imagen   miniatura (src) — imagenes[] para combos (hasta 3)
     *   foto     render grande (data URL), para un producto suelto
     * total: texto ya formateado ("Bs 1.200")
     */
    async function componerFicha(opciones) {
        const tema = TEMAS[opciones.tema] || TEMAS.marmol;
        const tipo = fuentes(opciones.tema);
        const items = opciones.items || [];
        if (document.fonts && document.fonts.load) {
            await Promise.all([
                document.fonts.load(`500 44px ${tipo.display}`),
                document.fonts.load(`400 28px ${tipo.ui}`),
                document.fonts.load(`600 28px ${tipo.ui}`)
            ]).catch(function () {});
        }

        const fondoSrc = urlDeVariable(document.documentElement, '--m-marble-image');
        const [fondo, logo] = await Promise.all([cargarImagen(fondoSrc), cargarImagen('imagenes/Suarez.png')]);
        const fotos = await Promise.all(items.map(function (item) {
            const srcs = item.foto ? [item.foto] : (item.imagenes && item.imagenes.length ? item.imagenes.slice(0, 3) : [item.imagen]);
            return Promise.all(srcs.map(cargarImagen));
        }));

        // Medir primero: el alto depende de cuántas líneas tiene cada producto.
        const medidor = document.createElement('canvas').getContext('2d');
        const M = 72;
        const FOTO = 220;
        const TEXTO_X = M + FOTO + 44;
        const TEXTO_W = ANCHO - TEXTO_X - M;
        const unico = items.length === 1 && items[0].foto;
        const bloques = items.map(function (item) {
            medidor.font = `500 44px ${tipo.display}`;
            const todas = cortarLineas(medidor, item.titulo || '', TEXTO_W);
            const titulo = todas.slice(0, 2);
            if (todas.length > 2) titulo[1] = `${titulo[1].replace(/[\s,.;:-]+$/, '')}…`;
            medidor.font = `400 28px ${tipo.ui}`;
            const detalle = [].concat(item.subtitulo ? [item.subtitulo] : [], item.lineas || [])
                .reduce(function (acc, linea) { return acc.concat(cortarLineas(medidor, linea, TEXTO_W)); }, [])
                .slice(0, 8);
            const alto = Math.max(FOTO, titulo.length * 52 + detalle.length * 38 + 64);
            return { titulo: titulo, detalle: detalle, alto: unico ? 0 : alto };
        });
        const CABEZA = 300;
        const HERO = unico ? 900 : 0;
        const cuerpo = unico
            ? HERO + 60 + bloques[0].titulo.length * 52 + bloques[0].detalle.length * 38 + 80
            : bloques.reduce(function (s, b) { return s + b.alto + 48; }, 0);
        const ALTO = Math.round(CABEZA + cuerpo + 220);

        const lienzo = document.createElement('canvas');
        lienzo.width = ANCHO;
        lienzo.height = ALTO;
        const ctx = lienzo.getContext('2d');

        // Fondo: la piedra del sitio, con el mismo velo.
        ctx.fillStyle = tema.base;
        ctx.fillRect(0, 0, ANCHO, ALTO);
        if (fondo) {
            const patron = ctx.createPattern(fondo, 'repeat');
            const escala = 1.2;
            patron.setTransform(new DOMMatrix().scale(escala * 900 / fondo.naturalWidth || 1));
            ctx.fillStyle = patron;
            ctx.fillRect(0, 0, ANCHO, ALTO);
        }
        ctx.fillStyle = tema.velo;
        ctx.fillRect(0, 0, ANCHO, ALTO);

        // Moldura dorada doble.
        ctx.strokeStyle = tema.filete;
        ctx.lineWidth = 2;
        rectRedondo(ctx, 28, 28, ANCHO - 56, ALTO - 56, 28);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        rectRedondo(ctx, 40, 40, ANCHO - 80, ALTO - 80, 20);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Cabeza: logo y título.
        if (logo) {
            const lw = 260;
            const lh = lw * logo.naturalHeight / logo.naturalWidth;
            ctx.save();
            if (tema.logoClaro) ctx.filter = 'invert(1) sepia(0.3) brightness(1.05)';
            ctx.drawImage(logo, (ANCHO - lw) / 2, 78, lw, lh);
            ctx.restore();
        }
        ctx.fillStyle = tema.tinta3;
        ctx.font = `500 26px ${tipo.ui}`;
        ctx.textAlign = 'center';
        ctx.fillText(opciones.encabezado || 'Mi pedido', ANCHO / 2, 250);
        ctx.textAlign = 'left';

        let y = CABEZA;
        if (unico) {
            const item = items[0];
            const foto = fotos[0][0];
            if (foto) dibujarFoto(ctx, foto, M, y, ANCHO - 2 * M, HERO, false);
            y += HERO + 60;
            ctx.fillStyle = tema.tinta;
            ctx.font = `500 44px ${tipo.display}`;
            bloques[0].titulo.forEach(function (linea) { ctx.fillText(linea, M, y + 40); y += 52; });
            ctx.fillStyle = tema.tinta2;
            ctx.font = `400 28px ${tipo.ui}`;
            bloques[0].detalle.forEach(function (linea) { ctx.fillText(linea, M, y + 30); y += 38; });
            y += 40;
        } else {
            items.forEach(function (item, i) {
                const b = bloques[i];
                // Nicho de la miniatura.
                ctx.save();
                rectRedondo(ctx, M, y, FOTO, FOTO, 22);
                ctx.fillStyle = tema.nicho;
                ctx.fill();
                ctx.clip();
                const lista = fotos[i].filter(Boolean);
                if (lista.length === 1) {
                    dibujarFoto(ctx, lista[0], M + 14, y + 14, FOTO - 28, FOTO - 28, true);
                } else if (lista.length > 1) {
                    const w = (FOTO - 20) / lista.length;
                    lista.forEach(function (foto, k) { dibujarFoto(ctx, foto, M + 10 + k * w, y + 30, w, FOTO - 60, true); });
                }
                ctx.restore();
                ctx.strokeStyle = tema.filete;
                ctx.lineWidth = 2;
                rectRedondo(ctx, M, y, FOTO, FOTO, 22);
                ctx.stroke();

                let ty = y + 8;
                ctx.fillStyle = tema.tinta;
                ctx.font = `500 44px ${tipo.display}`;
                b.titulo.forEach(function (linea) { ctx.fillText(linea, TEXTO_X, ty + 40); ty += 52; });
                ctx.fillStyle = tema.tinta2;
                ctx.font = `400 28px ${tipo.ui}`;
                b.detalle.forEach(function (linea) { ctx.fillText(linea, TEXTO_X, ty + 30); ty += 38; });
                ctx.fillStyle = tema.tinta;
                ctx.font = `600 32px ${tipo.ui}`;
                ctx.fillText(item.precioTexto || '', TEXTO_X, Math.max(ty + 52, y + FOTO - 8));

                y += b.alto + 24;
                ctx.strokeStyle = tema.filete;
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(M, y);
                ctx.lineTo(ANCHO - M, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
                y += 24;
            });
        }

        // Total.
        y += 24;
        ctx.fillStyle = tema.tinta2;
        ctx.font = `500 28px ${tipo.ui}`;
        ctx.fillText('Total', M, y + 34);
        ctx.fillStyle = tema.tinta;
        ctx.font = `500 52px ${tipo.display}`;
        ctx.textAlign = 'right';
        ctx.fillText(opciones.total || '', ANCHO - M, y + 40);
        ctx.textAlign = 'center';
        ctx.fillStyle = tema.acento;
        ctx.font = `500 24px ${tipo.ui}`;
        ctx.fillText('perfumeriasuarez.com', ANCHO / 2, ALTO - 72);
        ctx.textAlign = 'left';

        return new Promise(function (resolve) {
            lienzo.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.9);
        });
    }

    /* ---------------- La hoja ---------------- */

    function hojaHtml(opciones, compartir) {
        const icono = '<span class="pedido-wa" aria-hidden="true"></span>';
        const pasos = compartir
            ? '<ol class="pedido-hoja__pasos">'
                + '<li>Tocá <strong>Enviar con imagen</strong>.</li>'
                + '<li>Elegí <strong>WhatsApp</strong> y el chat de <strong>Perfumería Suárez</strong>.</li>'
                + '<li>Si el texto no aparece, pegalo: ya quedó copiado.</li>'
              + '</ol>'
            : '<p class="pedido-hoja__nota">Se abre el chat con tu pedido escrito y se descarga la imagen para que la adjuntes.</p>';
        const principal = compartir
            ? `<button type="button" class="pedido-boton pedido-boton--principal" data-pedido="compartir" disabled>${icono}<span>Preparando imagen…</span></button>`
            : `<button type="button" class="pedido-boton pedido-boton--principal" data-pedido="abrir">${icono}<span>Abrir WhatsApp</span></button>`;
        const secundario = compartir
            ? '<button type="button" class="pedido-boton pedido-boton--sutil" data-pedido="texto">Solo texto</button>'
            : '<button type="button" class="pedido-boton pedido-boton--sutil" data-pedido="descargar" disabled>Descargar imagen</button>';
        return ''
            + '<div class="pedido-velo" data-pedido="cerrar"></div>'
            + '<section class="pedido-hoja" role="dialog" aria-modal="true" aria-labelledby="pedido-titulo">'
            +   '<div class="pedido-hoja__cabeza">'
            +     `<h2 id="pedido-titulo">${opciones.titulo || 'Enviar pedido'}</h2>`
            +     '<button type="button" class="pedido-cerrar" data-pedido="cerrar" aria-label="Cerrar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>'
            +   '</div>'
            +   '<figure class="pedido-hoja__ficha"><span class="pedido-hoja__cargando">Armando la imagen…</span></figure>'
            +   pasos
            +   `<div class="pedido-hoja__acciones">${secundario}${principal}</div>`
            + '</section>';
    }

    function documentoDeArriba() {
        try {
            if (window.parent && window.parent !== window && window.parent.PerfSuarez
                && window.parent.PerfSuarez.core && window.parent.PerfSuarez.core.pedido
                && window.parent.document.querySelector('.swipe-hub, body.swipe-hub')) {
                return window.parent;
            }
        } catch (error) {
            // Iframe de otro origen: se queda abajo.
        }
        return null;
    }

    let abierta = null;

    function cerrar() {
        if (!abierta) return;
        const { raiz, url } = abierta;
        raiz.classList.remove('is-abierta');
        setTimeout(function () {
            raiz.remove();
            if (url) URL.revokeObjectURL(url);
        }, 320);
        document.removeEventListener('keydown', alTeclear);
        abierta = null;
    }

    function alTeclear(event) {
        if (event.key === 'Escape') cerrar();
    }

    /**
     * Abre la hoja del pedido.
     *   texto     el mensaje de siempre (no cambia)
     *   items     productos para la ficha (ver componerFicha)
     *   total     total formateado
     *   tema      'marmol'
     *   titulo    título de la hoja
     *   archivo   nombre del archivo (sin extensión)
     */
    function enviar(opciones) {
        const arriba = documentoDeArriba();
        if (arriba) {
            return arriba.PerfSuarez.core.pedido.enviar(opciones);
        }
        cerrar();

        const compartir = puedeCompartirArchivos();
        const raiz = document.createElement('div');
        raiz.className = `pedido pedido--${opciones.tema || 'marmol'}`;
        raiz.innerHTML = hojaHtml(opciones, compartir);
        document.body.appendChild(raiz);
        abierta = { raiz: raiz, url: null, blob: null };
        const estado = abierta;
        requestAnimationFrame(function () { raiz.classList.add('is-abierta'); });
        document.addEventListener('keydown', alTeclear);

        const nombre = `${opciones.archivo || 'pedido-suarez'}.jpg`;
        const principal = raiz.querySelector('.pedido-boton--principal');
        const descargar = raiz.querySelector('[data-pedido="descargar"]');

        const ficha = componerFicha(opciones).then(function (blob) {
            if (!blob || abierta !== estado) return blob;
            estado.blob = blob;
            estado.url = URL.createObjectURL(blob);
            const figura = raiz.querySelector('.pedido-hoja__ficha');
            figura.innerHTML = `<img src="${estado.url}" alt="Imagen del pedido">`;
            if (compartir) {
                principal.disabled = false;
                principal.querySelector('span:last-child').textContent = 'Enviar con imagen';
            } else if (descargar) {
                descargar.disabled = false;
            }
            return blob;
        }).catch(function (error) {
            console.warn('No se pudo armar la imagen del pedido:', error);
            raiz.querySelector('.pedido-hoja__ficha').innerHTML = '<span class="pedido-hoja__cargando">No se pudo armar la imagen</span>';
            if (compartir) {
                principal.disabled = false;
                principal.dataset.pedido = 'texto';
                principal.querySelector('span:last-child').textContent = 'Enviar por WhatsApp';
            }
        });

        function descargarFicha() {
            if (!estado.url) return;
            const enlace = document.createElement('a');
            enlace.href = estado.url;
            enlace.download = nombre;
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
        }

        function abrirChat(texto) {
            window.open(urlWhatsApp(texto, opciones.numero), '_blank', 'noopener');
        }

        raiz.addEventListener('click', function (event) {
            const boton = event.target.closest('[data-pedido]');
            if (!boton || boton.disabled) return;
            const accion = boton.dataset.pedido;
            if (accion === 'cerrar') {
                cerrar();
            } else if (accion === 'texto') {
                abrirChat(opciones.texto);
                cerrar();
            } else if (accion === 'descargar') {
                descargarFicha();
            } else if (accion === 'abrir') {
                const fotos = (opciones.items || []).map(function (item) { return absoluta(item.imagen); }).filter(Boolean);
                const texto = fotos.length
                    ? `${opciones.texto}\n\n${fotos.length > 1 ? 'Fotos' : 'Foto'}:\n${fotos.join('\n')}`
                    : opciones.texto;
                ficha.then(function () { descargarFicha(); });
                abrirChat(texto);
            } else if (accion === 'compartir' && estado.blob) {
                // Dentro del mismo toque: share() necesita la activación del usuario.
                const archivo = new File([estado.blob], nombre, { type: 'image/jpeg' });
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(opciones.texto).catch(function () {});
                }
                navigator.share({ files: [archivo], text: opciones.texto }).then(cerrar).catch(function (error) {
                    if (error && error.name === 'AbortError') return;
                    abrirChat(opciones.texto);
                });
            }
        });

        return ficha;
    }

    App.core.pedido = {
        enviar: enviar,
        componerFicha: componerFicha,
        urlWhatsApp: urlWhatsApp,
        puedeCompartirArchivos: puedeCompartirArchivos,
        NUMERO: NUMERO
    };
})(window.PerfSuarez);
