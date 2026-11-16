(function (App) {
    const MONEDA_LOCAL = 'Bs';
    const PRECIO_REGEX = /(\d+)ml.*?(\d+\.?\d*)Bs/i;

    function parseComboConfig(content) {
        const result = {};
        if (!content) {
            return result;
        }

        const lines = content.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim().length > 0);
        if (!lines.length) {
            return result;
        }

        const headers = lines.shift().replace(/^\ufeff/, '').split(';').map(header => header.trim());

        lines.forEach(line => {
            const values = line.split(';');
            const record = {};

            headers.forEach((header, index) => {
                record[header] = (values[index] || '').trim();
            });

            const name = record.Nombre;
            if (!name) {
                return;
            }

            const entry = result[name] || { tamanos: {}, precioPorDefecto: null };

            [1, 2].forEach(idx => {
                const approved = (record[`Aprobado${idx}`] || '').toUpperCase() === 'APROBADO';
                const ml = record[`ML${idx}`];
                const priceText = (record[`Precio${idx}`] || '').replace(',', '.');
                if (!approved) {
                    return;
                }

                const price = parseFloat(priceText);
                if (Number.isNaN(price)) {
                    return;
                }

                if (ml) {
                    const size = parseInt(ml, 10);
                    if (!Number.isNaN(size)) {
                        entry.tamanos[size] = price;
                    }
                } else if (entry.precioPorDefecto === null) {
                    entry.precioPorDefecto = price;
                }
            });

            if (Object.keys(entry.tamanos).length > 0 || entry.precioPorDefecto !== null) {
                result[name] = entry;
            }
        });

        return result;
    }

    function readPriceData(paragraph) {
        if (!paragraph) {
            return null;
        }

        const text = paragraph.textContent.replace(/\s+/g, '');
        const match = text.match(PRECIO_REGEX);
        if (!match) {
            return null;
        }

        return {
            tamano: parseInt(match[1], 10),
            precio: parseFloat(match[2]),
            moneda: MONEDA_LOCAL
        };
    }

    function getComboPrice(config, name, size) {
        const entry = config[name];
        if (!entry) {
            return null;
        }

        if (typeof entry.tamanos?.[size] === 'number') {
            return entry.tamanos[size];
        }

        return typeof entry.precioPorDefecto === 'number' ? entry.precioPorDefecto : null;
    }

    async function fetchComboConfig(path) {
        const response = await fetch(path);
        const content = await response.text();
        return parseComboConfig(content);
    }

    async function fetchProducts(type, comboConfig) {
        const response = await fetch(`${type}.html`);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        return Array.from(doc.querySelectorAll('.decant'))
            .filter(element => {
                const hasStock = !element.querySelector('.etiquetas .fuera-de-stock');
                if (!hasStock) {
                    return false;
                }

                if (type === 'perfumes' && !comboConfig[element.dataset.name]) {
                    return false;
                }

                return true;
            })
            .map(element => {
                const isPerfume = type === 'perfumes';
                const name = element.dataset.name;

                return {
                    tipo: type,
                    skuBase: isPerfume ? element.dataset.sku : null,
                    nombre: name,
                    imagen: element.querySelector('img')?.src || 'imagenes/image.webp',
                    precios: Array.from(element.querySelectorAll('p'))
                        .map(p => {
                            const data = readPriceData(p);
                            if (!data) {
                                return null;
                            }

                            const comboPrice = isPerfume ? getComboPrice(comboConfig, name, data.tamano) : null;
                            if (isPerfume && typeof comboPrice !== 'number') {
                                return null;
                            }

                            return {
                                sku: p.dataset.sku || 'DECANT',
                                tamano: data.tamano,
                                precio: data.precio,
                                moneda: data.moneda,
                                comboPrecio: comboPrice
                            };
                        })
                        .filter(Boolean)
                        .sort((a, b) => a.tamano - b.tamano)
                };
            })
            .filter(product => product.precios.length > 0);
    }

    function getProductsFromData(type) {
        if (!App.data || !App.data.perfumes) {
            return Promise.reject(new Error('No hay datos de perfumes disponibles'));
        }

        var isPerfume = type === 'perfumes';
        var products = App.data.perfumes
            .filter(function (p) {
                if (isPerfume) {
                    if (!p.en_stock_completos || !p.precio_completo) return false;
                    if (!p.precio_combo) return false;
                    return true;
                }
                return p.en_stock_decants && p.precios_decants;
            })
            .map(function (p) {
                var precios = [];
                if (isPerfume && p.precio_completo && p.precio_combo) {
                    var completos = App.core.stock.availableCompleteEntries(p);
                    completos
                        .slice()
                        .sort(function (a, b) { return a.ml - b.ml; })
                        .forEach(function (entry) {
                            var comboPrice = p.precio_combo[String(entry.ml)] ?? null;
                            if (typeof comboPrice !== 'number') {
                                return;
                            }

                            // El ahorro se cuenta contra lo que cuesta hoy el
                            // frasco suelto: con su oferta, si la tiene.
                            var oferta = Number(entry.precio_oferta);
                            var vigente = p.oferta && oferta > 0 && oferta < Number(entry.precio) ? oferta : entry.precio;
                            precios.push({
                                sku: 'PERFUME',
                                tamano: entry.ml,
                                precio: entry.precio,
                                precioVigente: vigente,
                                moneda: MONEDA_LOCAL,
                                comboPrecio: comboPrice
                            });
                        });
                } else if (!isPerfume && p.precios_decants) {
                    Object.keys(p.precios_decants).map(Number).sort(function (a, b) { return a - b; }).forEach(function (size) {
                        precios.push({
                            sku: 'DECANT',
                            tamano: size,
                            precio: p.precios_decants[size],
                            moneda: MONEDA_LOCAL,
                            comboPrecio: null
                        });
                    });
                }
                return {
                    // El id del catálogo es lo que permite volver a resolver el
                    // producto desde un código de combo compartido.
                    id: p.id,
                    tipo: type,
                    skuBase: null,
                    nombre: p.nombre_interno,
                    imagen: (isPerfume ? p.image_miniatura : p.image_miniatura_decant) || 'imagenes/image.webp',
                    precios: precios
                };
            })
            .filter(function (product) { return product.precios.length > 0; });

        return Promise.resolve(products);
    }

    // Descuento extra de un set de decants según cuántos lleva (sobre el 10 % base).
    const DESCUENTO_EXTRA_DECANTS = { 5: 0, 6: 2, 7: 4, 8: 6, 9: 8, 10: 10 };

    /**
     * El resumen de un combo, la misma cuenta que hacía el armador anterior
     * (buildSelectionSummary): decants al precio normal menos 10 % + el extra
     * por cantidad; perfumes a su precio de combo. `selecciones` va en el
     * orden de los nichos; los vacíos (null) se saltean.
     *   selecciones: [{ producto: { nombre, tipo }, precio: { tamano, precio, comboPrecio } } | null]
     */
    function resumenCombo(tipo, cantidad, selecciones) {
        let total = 0;
        let originalTotal = 0;
        let selected = 0;
        const isDecants = tipo === 'decants';
        const quantity = isDecants ? cantidad : 0;
        const extraDiscount = isDecants ? (DESCUENTO_EXTRA_DECANTS[quantity] || 0) : 0;
        const items = [];

        selecciones.forEach(function (seleccion) {
            if (!seleccion || !seleccion.producto || !seleccion.precio) {
                return;
            }
            const priceData = seleccion.precio;
            const name = seleccion.producto.nombre;

            if (seleccion.producto.tipo === 'decants') {
                const discountedPrice = priceData.precio * (1 - ((10 + extraDiscount) / 100));
                originalTotal += priceData.precio;
                total += discountedPrice;
                selected += 1;
                items.push({ name: name, size: priceData.tamano, basePrice: priceData.precio, finalPrice: discountedPrice, tipo: 'decants' });
                return;
            }

            if (typeof priceData.comboPrecio === 'number') {
                const vigente = priceData.precioVigente ?? priceData.precio;
                originalTotal += vigente;
                total += priceData.comboPrecio;
                selected += 1;
                items.push({ name: name, size: priceData.tamano, basePrice: vigente, finalPrice: priceData.comboPrecio, tipo: 'perfumes' });
            }
        });

        return {
            isDecants: isDecants,
            items: items,
            originalTotal: originalTotal,
            savings: originalTotal - total,
            selected: selected,
            total: total
        };
    }

    /** El mensaje de WhatsApp del combo, idéntico al de siempre. */
    function mensajeCombo(summary) {
        let message = `¡Hola! Quiero armar mi combo de ${summary.isDecants ? 'decants' : 'perfumes'}:\n\n`;
        summary.items.forEach(function (item) {
            message += `➤ ${item.name} (${item.size}ml)\n`;
        });
        message += `\nTotal: ${MONEDA_LOCAL} ${summary.total.toFixed(2)}`;
        return message;
    }

    App.models.combo = {
        resumenCombo,
        mensajeCombo,
        DESCUENTO_EXTRA_DECANTS,
        fetchComboConfig,
        fetchProducts,
        getProductsFromData,
        parseComboConfig,
        getComboPrice,
        readPriceData,
        MONEDA_LOCAL
    };
})(window.PerfSuarez);
