// Sin dependencias: node --test tests/stock-availability.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const sources = new Map();
function load(context, file) {
    if (!sources.has(file)) sources.set(file, readFileSync(path.join(root, file), 'utf8'));
    vm.runInContext(sources.get(file), context, { filename: file });
}

function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

// DOM mínimo para ejecutar el render y los eventos reales del detalle.
// Las aserciones revisan tamaños, precios y acciones visibles, sin exportar
// funciones privadas ni reescribir el código que se está probando.
function environment(perfumes) {
    const elements = new Map();
    class Element {
        constructor() {
            this.innerHTML = '';
            this.textContent = '';
            this.listeners = {};
            this.dataset = {};
            this.classList = { add() {}, remove() {}, toggle() {} };
            this.style = { setProperty() {} };
        }
        addEventListener(type, callback) { this.listeners[type] = callback; }
        querySelector() { return new Element(); }
        querySelectorAll() { return []; }
        insertAdjacentHTML(position, html) {
            this.innerHTML += html;
            for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element());
        }
    }
    for (const id of ['detail-root', 'back-btn', 'not-found']) elements.set(id, new Element());
    const selectors = new Map();
    const document = {
        readyState: 'loading',
        addEventListener() {},
        querySelector: selector => selectors.get(selector) || null,
        querySelectorAll() { return []; },
        getElementById: id => elements.get(id) || null
    };
    const window = {
        location: new URL('http://localhost/perfume.html#id=' + perfumes[0]?.id),
        localStorage: storage(),
        sessionStorage: storage(),
        matchMedia: () => ({ matches: false }),
        addEventListener() {}
    };
    window.parent = window;
    const context = vm.createContext({
        window, document, URL, URLSearchParams, console,
        location: window.location, sessionStorage: window.sessionStorage,
        navigator: {}, history: { length: 1 }, setTimeout, clearTimeout
    });
    load(context, 'js/core/app.js');
    const App = window.PerfSuarez;
    const ready = [];
    const orders = [];
    App.core.onReady = callback => ready.push(callback);
    App.core.pedido = { enviar: order => orders.push(order) };
    App.data = { perfumes };
    load(context, 'js/scripts.js');
    load(context, 'js/viewmodels/catalog-renderer.js');
    load(context, 'js/models/combo.model.js');
    App.viewmodels.cart.openCart = () => {};
    return {
        App, elements, orders, context, window,
        async initCombo() {
            const html = readFileSync(path.join(root, 'perfumeria.html'), 'utf8');
            for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element());
            selectors.set('.combo-cantidad__opciones', new Element());
            load(context, 'js/models/combo-code.js');
            load(context, 'js/viewmodels/perfumeria-combo.js');
            await App.viewmodels.perfumeriaCombo.iniciar();
        },
        render(mode) {
            if (mode) window.location.hash += '&tipo=' + mode;
            ready.length = 0;
            load(context, 'js/viewmodels/perfume-detalle.js');
            ready[0]();
        }
    };
}

function product(overrides = {}) {
    return {
        id: 'regression-product', marca: 'Prueba', nombre: 'Perfume',
        nombre_interno: 'Perfume de prueba', tags: [], notas: {},
        image_miniatura: 'frasco.png', image_miniatura_decant: 'decant.png',
        en_stock_completos: true, en_stock_decants: false,
        precio_completo: [{ ml: 100, precio: 500, en_stock: false }, { ml: 200, precio: 800, en_stock: true }],
        precio_combo: { 100: 450, 200: 700 }, ...overrides
    };
}

function sizes(html) {
    return Array.from(html.matchAll(/class="ficha-tam__ml">(\d+)/g), match => Number(match[1]));
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('datos antiguos: admite objeto y arreglo sin stock por tamaño, sin mutarlos', () => {
    for (const entries of [{ ml: 100, precio: 500 }, [{ ml: 100, precio: 500 }, { ml: 200, precio: 800 }]]) {
        const p = product({ precio_completo: entries });
        const before = JSON.stringify(p);
        const { App } = environment([p]);
        assert.deepEqual(plain(App.core.stock.availableCompleteEntries(p)), Array.isArray(entries) ? entries : [entries]);
        assert.equal(App.core.stock.isCompleteSizeAvailable(p, '100'), true);
        assert.equal(App.core.stock.isCompleteSizeAvailable(p, 50), false);
        assert.equal(JSON.stringify(p), before);
    }
});

test('la bandera general deshabilita completos aunque haya tamaños habilitados o antiguos', () => {
    const p = product({ en_stock_completos: false });
    const env = environment([p]);
    env.render();
    assert.equal(env.App.core.stock.availableCompleteEntries(p).length, 0);
    assert.equal(env.elements.has('cart-add-btn'), false);
    assert.match(env.elements.get('detail-root').innerHTML, /Por ahora no hay stock/);
    assert.doesNotMatch(env.elements.get('detail-root').innerHTML, /class="ficha-combo"/);
});

test('todos los tamaños agotados prevalecen sobre una bandera general desactualizada', async () => {
    const p = product({ precio_completo: [{ ml: 100, precio: 500, en_stock: false }] });
    const env = environment([p]);
    env.render();
    assert.equal(env.elements.has('cart-add-btn'), false);
    const card = env.App.viewmodels.catalogRenderer.renderPieza(p, 'perfumes', 0);
    assert.match(card, /data-stock="0"/);
    assert.match(card, /Sin stock por ahora/);
    assert.doesNotMatch(card, /pieza__monto/);
    assert.equal((await env.App.models.combo.getProductsFromData('perfumes')).length, 0);
    env.elements.get('ficha-wa').listeners.click();
    assert.equal(env.orders[0].total, 'A consultar');
});

test('tolera precios ausentes y entradas nulas; rechaza tamaños de compra inválidos', () => {
    const { App } = environment([product()]);
    for (const value of [null, {}, product({ precio_completo: null }), product({ precio_completo: [null] })]) {
        assert.equal(App.core.stock.availableCompleteEntries(value).length, 0);
    }
    for (const size of [undefined, null, '', 'no-es-un-tamaño', 0, -100]) {
        assert.equal(App.core.stock.isCompleteSizeAvailable(product(), size), false);
    }
});

for (const scenario of [
    { name: 'One Million Elixir', entries: [{ ml: 200, precio: 1750, en_stock: true }, { ml: 100, precio: 1430, en_stock: false }], expected: [200], cheapest: 1750, combo: { 200: 1420 }, comboSizes: [200] },
    { name: 'Sauvage EDT', entries: [{ ml: 100, precio: 1780, en_stock: false }, { ml: 200, precio: 2500, en_stock: true }, { ml: 300, precio: 3540, en_stock: true }], expected: [200, 300], cheapest: 2500, combo: { 100: 1600, 200: 2470, 300: 2450 }, comboSizes: [200, 300] },
    { name: 'Scandal Pour Homme EDT', entries: [{ ml: 100, precio: 1370, en_stock: true }, { ml: 50, precio: 680, en_stock: false }, { ml: 150, precio: 1510, en_stock: true }], expected: [100, 150], cheapest: 1370, combo: { 50: 640, 150: 1160 }, comboSizes: [150] }
]) {
    test(scenario.name + ': detalle, tarjeta, combos, carrito y pedido respetan el tamaño', async () => {
        const p = product({ nombre: scenario.name, precio_completo: scenario.entries, precio_combo: scenario.combo });
        const env = environment([p]);
        env.render();
        assert.deepEqual(sizes(env.elements.get('ficha-tams').innerHTML), scenario.expected);
        assert.match(env.elements.get('ficha-barra-detalle').textContent, new RegExp(scenario.expected[0] + ' ml'));
        const card = env.App.viewmodels.catalogRenderer.renderPieza(p, 'perfumes', 0);
        assert.match(card, new RegExp('data-sort-price="' + scenario.cheapest + '"'));
        const combos = await env.App.models.combo.getProductsFromData('perfumes');
        assert.deepEqual(plain(combos[0].precios.map(e => e.tamano)), scenario.comboSizes);
        const comboHtml = env.elements.get('detail-root').innerHTML;
        for (const entry of scenario.entries.filter(e => e.en_stock === false)) {
            assert.doesNotMatch(comboHtml, new RegExp('el de ' + entry.ml + ' ml'));
            assert.equal(env.App.models.cart.createPerfumeItem(p, { kind: 'perfume', size: entry.ml, price: entry.precio }), null);
        }
        env.elements.get('cart-add-btn').listeners.click();
        assert.equal(env.App.models.cart.getItemCount(), 1);
        assert.match(env.App.models.cart.getState().items[0].subtitle, new RegExp(scenario.expected[0] + ' ml'));
        env.elements.get('ficha-wa').listeners.click();
        assert.match(env.orders[0].items[0].subtitulo, new RegExp(scenario.expected[0] + ' ml'));
    });
}

test('una selección alternativa disponible actualiza precio, carrito y pedido', () => {
    const p = product({ precio_completo: [{ ml: 100, precio: 500, en_stock: true }, { ml: 200, precio: 800, en_stock: true }] });
    const env = environment([p]);
    env.render();
    env.elements.get('detail-root').listeners.click({
        target: { closest: selector => selector === '[data-opcion]' ? { dataset: { opcion: '1' } } : null }
    });
    env.elements.get('cart-add-btn').listeners.click();
    assert.equal(env.App.models.cart.getState().items[0].totalPrice, 800);
    assert.equal(env.App.models.cart.getState().items[0].subtitle, 'Perfume completo 200 ml');
    env.elements.get('ficha-wa').listeners.click();
    assert.equal(env.orders[0].items[0].subtitulo, 'Perfume completo 200 ml');
});

test('una oferta de un tamaño agotado no altera el precio ni la etiqueta del producto', () => {
    const p = product({ oferta: true, precio_completo: [
        { ml: 100, precio: 500, precio_oferta: 100, en_stock: false },
        { ml: 200, precio: 800, en_stock: true }
    ] });
    const env = environment([p]);
    const card = env.App.viewmodels.catalogRenderer.renderPieza(p, 'perfumes', 0);
    assert.match(card, /data-on-sale="0"/);
    assert.match(card, /data-sort-price="800"/);
    assert.doesNotMatch(card, /placa--oferta/);
    p.precio_completo[1].precio_oferta = 700;
    const saleCard = env.App.viewmodels.catalogRenderer.renderPieza(p, 'perfumes', 0);
    assert.match(saleCard, /data-on-sale="1"/);
    assert.match(saleCard, /data-sort-price="700"/);
});

test('sin tamaño disponible a precio de combo no se anuncia un combo inexistente', async () => {
    const p = product({ precio_combo: { 100: 450, 300: 900 } });
    const env = environment([p]);
    env.render();
    assert.doesNotMatch(env.elements.get('detail-root').innerHTML, /class="ficha-combo"/);
    assert.equal((await env.App.models.combo.getProductsFromData('perfumes')).length, 0);
});

test('los decants conservan sus tamaños y precios con los completos deshabilitados', async () => {
    const p = product({ en_stock_completos: false, en_stock_decants: true, precios_decants: { 5: 100, 10: 190, 15: 270, 30: 510 } });
    const env = environment([p]);
    env.render('decant');
    assert.deepEqual(sizes(env.elements.get('ficha-tams').innerHTML), [5, 10, 15, 30]);
    const products = await env.App.models.combo.getProductsFromData('decants');
    assert.deepEqual(plain(products[0].precios.map(e => [e.tamano, e.precio])), [[5, 100], [10, 190], [15, 270], [30, 510]]);
    env.elements.get('cart-add-btn').listeners.click();
    assert.equal(env.App.models.cart.getState().items[0].totalPrice, 100);
    assert.equal(env.App.models.cart.getState().items[0].subtitle, 'Decant 5 ml');
});

test('un cuadro se puede comprar aunque sus frascos no tengan stock', () => {
    const p = product({ en_stock_completos: false, precio_cuadro: 200 });
    const env = environment([p]);
    env.render('cuadro');
    env.elements.get('cart-add-btn').listeners.click();
    assert.equal(env.App.models.cart.getState().items[0].type, 'cuadro');
    assert.equal(env.App.models.cart.getState().items[0].totalPrice, 200);
});

function comboProducts() {
    return [
        product({ id: 'combo-a' }),
        product({ id: 'combo-b', precio_completo: { ml: 100, precio: 250 }, precio_combo: { 100: 220 } }),
        product({ id: 'combo-c', precio_completo: [{ ml: 75, precio: 350, en_stock: true }], precio_combo: { 75: 300 } })
    ];
}

test('un código de combo con un tamaño agotado deja su espacio vacío, sin sustituirlo', async () => {
    const env = environment(comboProducts());
    await env.initCombo();
    const code = env.App.models.comboCode.encode('perfumes', [
        { id: 'combo-a', ml: 100 }, { id: 'combo-b', ml: 100 }, { id: 'combo-c', ml: 75 }
    ]);
    assert.ok(code);
    env.App.viewmodels.perfumeriaCombo.precargar(new URLSearchParams({ combo: code }));
    assert.match(env.elements.get('combo-estado').textContent, /2 de 3/);
    assert.equal(env.elements.get('combo-carrito').disabled, true);
    assert.match(env.elements.get('combo-codigo-aviso').textContent, /ya no está disponible/);
    assert.doesNotMatch(env.elements.get('combo-nichos').innerHTML, /combo-nicho__ml">200 ml/);

    const restored = environment(comboProducts());
    restored.window.sessionStorage.setItem('ps_combo_borrador_v2', JSON.stringify({ tipo: 'perfumes', perfumes: code }));
    await restored.initCombo();
    assert.match(restored.elements.get('combo-estado').textContent, /2 de 3/);
    assert.equal(restored.elements.get('combo-carrito').disabled, true);
});

test('un combo válido conserva tamaños, total y posibilidad de agregarlo al carrito', async () => {
    const env = environment(comboProducts());
    await env.initCombo();
    const code = env.App.models.comboCode.encode('perfumes', [
        { id: 'combo-a', ml: 200 }, { id: 'combo-b', ml: 100 }, { id: 'combo-c', ml: 75 }
    ]);
    env.App.viewmodels.perfumeriaCombo.precargar(new URLSearchParams({ combo: code }));
    assert.equal(env.elements.get('combo-carrito').disabled, false);
    env.elements.get('combo-carrito').listeners.click();
    const item = env.App.models.cart.getState().items[0];
    assert.equal(item.type, 'combo');
    assert.equal(item.totalPrice, 1220);
    assert.match(item.detailLines[0], /200 ml/);
});

test('el dataset real no ofrece tamaños agotados en completos ni combos y no se muta', async () => {
    const perfumes = JSON.parse(readFileSync(path.join(root, 'js/data/perfumes.json'), 'utf8').replace(/^\uFEFF/, ''));
    const before = JSON.stringify(perfumes);
    const { App } = environment(perfumes);
    for (const p of perfumes) {
        for (const entry of App.core.stock.availableCompleteEntries(p)) {
            assert.ok(p.en_stock_completos, p.id);
            assert.notEqual(entry.en_stock, false, p.id + ' ' + entry.ml);
        }
    }
    for (const combo of await App.models.combo.getProductsFromData('perfumes')) {
        const p = perfumes.find(p => p.id === combo.id);
        for (const price of combo.precios) {
            assert.equal(App.core.stock.isCompleteSizeAvailable(p, price.tamano), true, p.id + ' ' + price.tamano);
        }
    }
    assert.equal(JSON.stringify(perfumes), before);
});
