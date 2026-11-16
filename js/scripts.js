// Las páginas livianas (Perfumería) usan el carrito sin common.viewmodel.
window.initCatalogNav = window.PerfSuarez.viewmodels.common?.initCatalogNav;
window.normalizeRoutePath = window.PerfSuarez.core.normalizeRoutePath;

(function (App) {
    const STORAGE_KEY = 'perf-suarez-cart-v1';
    const WHATSAPP_NUMBER = window.PerfSuarez.core.WHATSAPP;
    const DEFAULT_CURRENCY = 'Bs';
    const MYSTERY_BOX_PRICE = 580;
    const MYSTERY_BOX_RULES = [
        { category: 'arabes', count: 2 },
        { category: 'disenador', count: 2 },
        { category: 'nicho', count: 1 }
    ];
    const CATEGORY_LABELS = {
        arabes: 'Árabe',
        disenador: 'Diseñador',
        nicho: 'Nicho'
    };

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function normalizeTags(tags) {
        return (Array.isArray(tags) ? tags : [])
            .reduce(function (acc, tag) {
                return acc.concat(String(tag || '').split(/\s+/));
            }, [])
            .map(normalizeText)
            .filter(Boolean);
    }

    function formatPrice(value) {
        const amount = Number(value) || 0;
        return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    }

    // El catálogo cotiza en Bs. Un ítem puede declarar otra moneda; las
    // monedas nunca se mezclan en un mismo total.
    function currencyOf(item) {
        return (item && item.currency) || DEFAULT_CURRENCY;
    }

    function formatMoney(value, currency) {
        return `${currency || DEFAULT_CURRENCY} ${formatPrice(value)}`;
    }

    function formatTotals(totals) {
        const parts = Object.keys(totals).map(function (currency) {
            return formatMoney(totals[currency], currency);
        });
        return parts.length ? parts.join(' + ') : formatMoney(0, DEFAULT_CURRENCY);
    }

    function buildWhatsAppUrl(message) {
        return `https://wa.me/${WHATSAPP_NUMBER}/?text=${encodeURIComponent(message)}`;
    }

    function createId(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function readStorage() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return { items: [] };
            }

            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.items)) {
                return { items: [] };
            }

            return {
                items: parsed.items.filter(Boolean)
            };
        } catch (error) {
            return { items: [] };
        }
    }

    let cartState = readStorage();
    const subscribers = [];

    function persist() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cartState));
        } catch (error) {
            console.error('No se pudo persistir el carrito:', error);
        }
    }

    function notify() {
        subscribers.forEach(function (listener) {
            try {
                listener(cartState);
            } catch (error) {
                console.error('Error actualizando suscriptor del carrito:', error);
            }
        });
    }

    function setState(nextState) {
        cartState = {
            items: Array.isArray(nextState.items) ? nextState.items : []
        };
        persist();
        notify();
    }

    function getLatestState() {
        cartState = readStorage();
        return cartState;
    }

    function getState() {
        return {
            items: cartState.items.slice()
        };
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') {
            return function () {};
        }

        subscribers.push(listener);
        return function unsubscribe() {
            const index = subscribers.indexOf(listener);
            if (index >= 0) {
                subscribers.splice(index, 1);
            }
        };
    }

    function getItemCount() {
        return cartState.items.length;
    }

    function getTotalsByCurrency() {
        return cartState.items.reduce(function (totals, item) {
            const currency = currencyOf(item);
            totals[currency] = (totals[currency] || 0) + (Number(item.totalPrice) || 0);
            return totals;
        }, {});
    }

    function getTotal() {
        return getTotalsByCurrency()[DEFAULT_CURRENCY] || 0;
    }

    function addItem(item) {
        if (!item) {
            return null;
        }

        const latestState = getLatestState();
        const nextItem = Object.assign({
            id: createId('cart'),
            currency: 'Bs'
        }, item);

        setState({
            items: latestState.items.concat(nextItem)
        });

        return nextItem;
    }

    function removeItem(itemId) {
        const latestState = getLatestState();
        setState({
            items: latestState.items.filter(function (item) {
                return item.id !== itemId;
            })
        });
    }

    function clear() {
        getLatestState();
        setState({ items: [] });
    }

    function getPerfumes() {
        return Array.isArray(App.data && App.data.perfumes) ? App.data.perfumes : [];
    }

    function classifyPerfume(perfume) {
        const tags = normalizeTags(perfume && perfume.tags);
        if (tags.indexOf('arabes') >= 0) {
            return 'arabes';
        }
        if (tags.indexOf('nicho') >= 0) {
            return 'nicho';
        }
        return 'disenador';
    }

    function shuffle(array) {
        const copy = array.slice();
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const temp = copy[index];
            copy[index] = copy[swapIndex];
            copy[swapIndex] = temp;
        }
        return copy;
    }

    function createPerfumeItem(perfume, selection) {
        if (!perfume || !selection) {
            return null;
        }
        if (selection.kind === 'perfume' && !App.core.stock.isCompleteSizeAvailable(perfume, selection.size)) {
            return null;
        }

        const typeLabel = selection.kind === 'perfume' ? 'Perfume completo' : 'Decant';
        const image = selection.kind === 'perfume'
            ? (perfume.image_miniatura || perfume.image_miniatura_decant || 'imagenes/image.webp')
            : (perfume.image_miniatura_decant || perfume.image_miniatura || 'imagenes/image.webp');

        const onSale = !!selection.onSale && Number(selection.originalPrice) > Number(selection.price);
        const priceText = onSale
            ? `Bs ${formatPrice(selection.price)} (oferta, antes Bs ${formatPrice(selection.originalPrice)})`
            : `Bs ${formatPrice(selection.price)}`;

        return {
            id: createId('perfume'),
            type: 'perfume',
            title: perfume.nombre_interno,
            subtitle: `${typeLabel} ${selection.size} ml`,
            totalPrice: Number(selection.price) || 0,
            image: image,
            detailLines: [
                `${typeLabel}: ${selection.size} ml`,
                `Precio: ${priceText}`
            ],
            whatsappLines: [
                `- ${perfume.nombre_interno}`,
                `  ${typeLabel} ${selection.size} ml`,
                `  ${priceText}`
            ]
        };
    }

    function createCuadroItem(perfume) {
        if (!perfume || typeof perfume.precio_cuadro !== 'number' || perfume.precio_cuadro <= 0) {
            return null;
        }

        const image = perfume.image_miniatura || perfume.image_miniatura_decant || 'imagenes/image.webp';

        return {
            id: createId('cuadro'),
            type: 'cuadro',
            title: 'Cuadro ' + perfume.nombre_interno,
            subtitle: 'Cuadro decorativo',
            totalPrice: Number(perfume.precio_cuadro) || 0,
            image: image,
            detailLines: [
                'Cuadro decorativo',
                `Precio: Bs ${formatPrice(perfume.precio_cuadro)}`
            ],
            whatsappLines: [
                `- Cuadro ${perfume.nombre_interno}`,
                '  Cuadro decorativo',
                `  Bs ${formatPrice(perfume.precio_cuadro)}`
            ]
        };
    }

    function createComboItem(summary) {
        if (!summary || !Array.isArray(summary.items) || !summary.items.length) {
            return null;
        }

        const title = summary.isDecants ? 'Set de Decants' : 'Combo de Perfumes';
        const subtitle = summary.isDecants
            ? `${summary.items.length} decants seleccionados`
            : `${summary.items.length} perfumes seleccionados`;

        return {
            id: createId('combo'),
            type: 'combo',
            title: title,
            subtitle: subtitle,
            totalPrice: Number(summary.total) || 0,
            detailLines: summary.items.map(function (item) {
                return `${item.name} - ${item.size} ml`;
            }).concat(summary.savings > 0 ? [`Ahorro: Bs ${formatPrice(summary.savings)}`] : []),
            whatsappLines: [
                `- ${title}`,
                `  ${subtitle}`
            ].concat(summary.items.map(function (item) {
                return `  • ${item.name} - ${item.size} ml`;
            })).concat([
                `  Total combo: Bs ${formatPrice(summary.total)}`
            ])
        };
    }

    function buildMysteryBoxSelections() {
        const perfumes = getPerfumes().filter(function (perfume) {
            return perfume && perfume.en_stock_decants && perfume.precios_decants;
        });

        if (!perfumes.length) {
            return [];
        }

        const usedIds = {};
        const selections = [];

        MYSTERY_BOX_RULES.forEach(function (rule) {
            const pool = shuffle(perfumes.filter(function (perfume) {
                return !usedIds[perfume.id] && classifyPerfume(perfume) === rule.category;
            })).slice(0, rule.count);

            pool.forEach(function (perfume) {
                usedIds[perfume.id] = true;
                selections.push({
                    perfumeId: perfume.id,
                    name: perfume.nombre_interno,
                    category: rule.category
                });
            });
        });

        if (selections.length < 5) {
            shuffle(perfumes.filter(function (perfume) {
                return !usedIds[perfume.id];
            })).slice(0, 5 - selections.length).forEach(function (perfume) {
                selections.push({
                    perfumeId: perfume.id,
                    name: perfume.nombre_interno,
                    category: classifyPerfume(perfume)
                });
            });
        }

        return selections;
    }

    function createMysteryBoxItem() {
        const selections = buildMysteryBoxSelections();
        if (!selections.length) {
            return null;
        }

        return {
            id: createId('mystery'),
            type: 'mystery-box',
            title: 'Mystery Box',
            subtitle: '2 árabes, 2 diseñador y 1 nicho',
            totalPrice: MYSTERY_BOX_PRICE,
            detailLines: selections.map(function (item) {
                return `${CATEGORY_LABELS[item.category] || 'Selección'}: ${item.name}`;
            }),
            whatsappLines: [
                '- Mystery Box',
                '  Incluye: 2 árabes, 2 diseñador y 1 nicho'
            ].concat(selections.map(function (item) {
                return `  • ${CATEGORY_LABELS[item.category] || 'Selección'}: ${item.name}`;
            })).concat([
                `  Precio: Bs ${formatPrice(MYSTERY_BOX_PRICE)}`
            ])
        };
    }

    function buildWhatsAppMessage() {
        if (!cartState.items.length) {
            return 'Hola! Quisiera pedir estos productos.';
        }

        const lines = ['Hola! Quisiera pedir este carrito:', ''];

        cartState.items.forEach(function (item, index) {
            lines.push(`${index + 1}.`);
            if (Array.isArray(item.whatsappLines) && item.whatsappLines.length) {
                item.whatsappLines.forEach(function (line) {
                    lines.push(`   ${line}`);
                });
            } else {
                lines.push(`   ${item.title}`);
                if (item.subtitle) {
                    lines.push(`   ${item.subtitle}`);
                }
            }
            lines.push(`   Subtotal: ${formatMoney(item.totalPrice, currencyOf(item))}`);
            lines.push('');
        });

        lines.push(`Total del carrito: ${formatTotals(getTotalsByCurrency())}`);
        return lines.join('\n');
    }

    App.models.cart = {
        addItem,
        buildWhatsAppMessage,
        buildWhatsAppUrl,
        clear,
        createComboItem,
        createCuadroItem,
        createMysteryBoxItem,
        createPerfumeItem,
        formatMoney,
        formatPrice,
        formatTotals,
        getItemCount,
        getState,
        getTotal,
        getTotalsByCurrency,
        removeItem,
        subscribe
    };

    App.viewmodels.cart = App.viewmodels.cart || {};
    App.viewmodels.cart = Object.assign(App.viewmodels.cart, (function () {
        let isOpen = false;
        const formatoVisible = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
        // Tipos que muestran su lista de detalle (los demás se leen con el subtítulo).
        const CON_DETALLE = { combo: true, 'mystery-box': true };
        const DETALLE_CORTO = 3;
        const abiertos = {};

        function escapar(texto) {
            return String(texto == null ? '' : texto)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        /** Precio para mirar ("Bs 12.230"); el del mensaje de WhatsApp no cambia. */
        function precioVisible(valor, moneda) {
            return `${moneda || DEFAULT_CURRENCY} ${formatoVisible.format(Number(valor) || 0)}`;
        }

        function totalVisible() {
            const totales = getTotalsByCurrency();
            const partes = Object.keys(totales).map(function (moneda) { return precioVisible(totales[moneda], moneda); });
            return partes.length ? partes.join(' + ') : precioVisible(0, DEFAULT_CURRENCY);
        }

        function getElements() {
            return {
                toggle: document.getElementById('cart-toggle'),
                panel: document.getElementById('cart-panel'),
                backdrop: document.getElementById('cart-backdrop'),
                count: document.getElementById('cart-count'),
                cuenta: document.getElementById('cart-cuenta'),
                items: document.getElementById('cart-items'),
                total: document.getElementById('cart-total'),
                empty: document.getElementById('cart-empty'),
                send: document.getElementById('cart-send'),
                clearBtn: document.getElementById('cart-clear'),
                close: document.getElementById('cart-close')
            };
        }

        function setOpen(nextOpen) {
            const elements = getElements();
            if (!elements.panel || !elements.toggle || !elements.backdrop) {
                return;
            }

            isOpen = !!nextOpen;
            elements.panel.classList.toggle('is-open', isOpen);
            elements.backdrop.classList.toggle('is-open', isOpen);
            elements.toggle.setAttribute('aria-expanded', String(isOpen));
            elements.panel.setAttribute('aria-hidden', String(!isOpen));
            document.body.classList.toggle('cart-open', isOpen);
            if (isOpen) {
                elements.close?.focus({ preventScroll: true });
            }
        }

        /**
         * Las páginas embebidas no tienen panel: abren el del shell. Antes se
         * relee lo guardado (el aviso `storage` al shell llega un poco después).
         */
        function openCart() {
            if (!document.getElementById('cart-panel')) {
                try {
                    const arriba = window.parent !== window ? window.parent.PerfSuarez : null;
                    arriba?.viewmodels?.cart?.openCart();
                } catch (error) {
                    // shell de otro origen
                }
                return;
            }
            cartState = readStorage();
            notify();
            setOpen(true);
        }

        function closeCart() {
            setOpen(false);
        }

        function fotoHtml(item) {
            const varias = Array.isArray(item.imagenes) ? item.imagenes.filter(Boolean).slice(0, 3) : [];
            if (varias.length > 1) {
                return `<div class="cart-item__foto cart-item__foto--multi">${varias.map(function (src) {
                    return `<img src="${escapar(src)}" alt="" loading="lazy">`;
                }).join('')}</div>`;
            }
            const src = varias[0] || item.image;
            return src
                ? `<div class="cart-item__foto"><img src="${escapar(src)}" alt="" loading="lazy"></div>`
                : '<div class="cart-item__foto"><span class="cart-item__monograma">S</span></div>';
        }

        function itemHtml(item, index) {
            const lineas = CON_DETALLE[item.type] ? (item.detailLines || []) : [];
            const abierto = !!abiertos[item.id];
            const visibles = abierto ? lineas : lineas.slice(0, DETALLE_CORTO);
            const resto = lineas.length - visibles.length;
            return ''
                + `<article class="cart-item" data-cart-id="${escapar(item.id)}" style="--c-foto-pos:${-40 - (index % 4) * 90}px ${-60 - (index % 3) * 110}px">`
                +   fotoHtml(item)
                +   '<div class="cart-item__texto">'
                +     `<h3>${escapar(item.title)}</h3>`
                +     (item.subtitle ? `<p class="cart-item__sub">${escapar(item.subtitle)}</p>` : '')
                +     (visibles.length ? `<ul class="cart-item__details">${visibles.map(function (linea) { return `<li>${escapar(linea)}</li>`; }).join('')}</ul>` : '')
                // "Ver N más" contaba líneas y a veces abría solo el ahorro.
                +     (resto > 0 ? `<button type="button" class="cart-item__mas" data-ver-mas="${escapar(item.id)}" aria-expanded="false">Ver detalle</button>` : '')
                +     (abierto && lineas.length > DETALLE_CORTO ? `<button type="button" class="cart-item__mas" data-ver-mas="${escapar(item.id)}" aria-expanded="true">Ver menos</button>` : '')
                +   '</div>'
                +   '<div class="cart-item__lado">'
                +     `<p class="cart-item__price">${precioVisible(item.totalPrice, currencyOf(item))}</p>`
                +     `<button type="button" class="cart-item__remove" data-remove-cart-item="${escapar(item.id)}" aria-label="Quitar ${escapar(item.title)}">`
                +       '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"></path></svg>'
                +     '</button>'
                +   '</div>'
                + '</article>';
        }

        function render() {
            const elements = getElements();
            if (!elements.count) {
                return;
            }

            const state = App.models.cart.getState();
            const itemCount = App.models.cart.getItemCount();
            const vacio = itemCount === 0;

            elements.count.textContent = String(itemCount);
            elements.count.classList.toggle('is-empty', vacio);
            elements.panel?.classList.toggle('is-vacio', vacio);

            if (elements.cuenta) {
                elements.cuenta.textContent = vacio ? '' : (itemCount === 1 ? '1 producto' : `${itemCount} productos`);
            }
            if (elements.total) {
                elements.total.textContent = totalVisible();
            }
            if (elements.send) {
                elements.send.disabled = vacio;
            }
            if (elements.empty) {
                elements.empty.hidden = !vacio;
            }
            if (elements.items) {
                elements.items.hidden = vacio;
                elements.items.innerHTML = state.items.map(itemHtml).join('');
            }
        }

        /** Lo que va en la imagen del pedido: lo mismo que se ve en el carrito. */
        function itemsDeLaFicha() {
            return App.models.cart.getState().items.map(function (item) {
                const lineas = CON_DETALLE[item.type] ? (item.detailLines || []) : [];
                return {
                    titulo: item.title,
                    subtitulo: item.subtitle,
                    lineas: lineas,
                    precioTexto: precioVisible(item.totalPrice, currencyOf(item)),
                    imagen: item.image,
                    imagenes: item.imagenes
                };
            });
        }

        function enviarPedido() {
            if (!App.models.cart.getItemCount()) {
                return;
            }
            const texto = App.models.cart.buildWhatsAppMessage();
            if (!App.core.pedido) {
                window.open(App.models.cart.buildWhatsAppUrl(texto), '_blank', 'noopener');
                return;
            }
            App.core.pedido.enviar({
                texto: texto,
                titulo: 'Enviar pedido',
                encabezado: 'Mi pedido',
                tema: 'marmol',
                total: totalVisible(),
                archivo: 'pedido-suarez',
                items: itemsDeLaFicha()
            });
        }

        function bind() {
            const elements = getElements();
            if (!elements.panel || elements.panel.dataset.cartReady === 'true') {
                return;
            }

            elements.panel.dataset.cartReady = 'true';

            elements.toggle?.addEventListener('click', function () {
                setOpen(!isOpen);
            });
            elements.close?.addEventListener('click', closeCart);
            elements.backdrop?.addEventListener('click', closeCart);
            elements.clearBtn?.addEventListener('click', function () {
                App.models.cart.clear();
            });
            elements.send?.addEventListener('click', enviarPedido);
            elements.items?.addEventListener('click', function (event) {
                const verMas = event.target.closest('[data-ver-mas]');
                if (verMas) {
                    const id = verMas.getAttribute('data-ver-mas');
                    abiertos[id] = !abiertos[id];
                    render();
                    return;
                }
                const button = event.target.closest('[data-remove-cart-item]');
                if (!button) {
                    return;
                }
                const fila = button.closest('.cart-item');
                const id = button.getAttribute('data-remove-cart-item');
                if (fila && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    fila.classList.add('is-saliendo');
                    setTimeout(function () { App.models.cart.removeItem(id); }, 200);
                } else {
                    App.models.cart.removeItem(id);
                }
            });
            elements.panel.querySelector('[data-cart-ir]')?.addEventListener('click', function (event) {
                event.preventDefault();
                closeCart();
                App.core.navigateToShell('perfumeria.html');
            });

            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && isOpen && !document.querySelector('.pedido.is-abierta')) {
                    closeCart();
                }
            });

            App.models.cart.subscribe(render);
            window.addEventListener('storage', function (event) {
                if (event.key === STORAGE_KEY) {
                    cartState = readStorage();
                    notify();
                }
            });

            setOpen(false);
            render();
        }

        function initCartUi() {
            bind();
            render();
        }

        return {
            closeCart,
            initCartUi,
            openCart
        };
    })());
})(window.PerfSuarez);

window.PerfSuarez.core.onReady(() => {
    window.PerfSuarez.viewmodels.common?.initGlobalUi();
    window.PerfSuarez.viewmodels.cart?.initCartUi();
});
