// Sin dependencias: node --test tests/novedades.test.cjs
// Carrusel de Novedades armado desde js/data/novedades.js (lo genera el ERP).
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

class Elemento {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.attrs = {};
        this.children = [];
        this.className = '';
    }
    setAttribute(k, v) { this.attrs[k] = String(v); this.orden = (this.orden || []).concat(k); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    hasAttribute(k) { return k in this.attrs; }
    appendChild(hijo) { this.children.push(hijo); return hijo; }
    // Como en el DOM real: asignar innerHTML reemplaza a los hijos.
    set innerHTML(html) { this.html = html; this.children = []; }
    get innerHTML() { return this.html || ''; }
}

function cargar(novedades) {
    const track = new Elemento('div');
    // Las diapositivas escritas en catalogo.html viven en un <template>: el
    // navegador no las descarga salvo que falten las del ERP.
    const respaldo = { innerHTML: '<a class="home-novedades__slide" href="perfume.html#id=respaldo"></a>' };
    const document = {
        readyState: 'loading',
        addEventListener() {},
        createElement: tag => new Elemento(tag),
        getElementById: id => ({ 'novedades-track': track, 'novedades-respaldo': respaldo }[id] || null),
    };
    const window = { CATALOGO_NOVEDADES: novedades };
    const context = vm.createContext({ window, document });
    vm.runInContext(readFileSync(path.join(root, 'js/home-novedades.js'), 'utf8'), context);
    return { HomeNovedades: window.HomeNovedades, track };
}

const perfume = { tipo: 'perfume', valor: 'one-million-black-paco-rabanne', src: 'imagenes/novedades/a.webp', ancho: 1080, alto: 1350, alt: 'Novedad — Rabanne One Million Black' };
const busqueda = { tipo: 'busqueda', valor: 'Lorenzo Pazzaglia', src: 'imagenes/novedades/b.jpg', ancho: 1254, alto: 1254, alt: 'Novedad — Nuevos perfumes Lorenzo Pazzaglia' };
const whatsapp = { tipo: 'whatsapp', valor: 'Hola, quisiera saber más información sobre "212 VIP Black de Carolina Herrera"', src: 'imagenes/novedades/c.webp', ancho: 1080, alto: 1350, alt: 'Novedad — 212 VIP Black de Carolina Herrera' };

test('perfume: abre su ficha dentro del shell', () => {
    const { HomeNovedades } = cargar([]);
    const a = HomeNovedades.construirSlide(perfume, 0);
    assert.equal(a.getAttribute('href'), 'perfume.html#id=one-million-black-paco-rabanne');
    assert.equal(a.getAttribute('data-shell-target'), 'perfume.html#id=one-million-black-paco-rabanne');
    assert.equal(a.className, 'home-novedades__slide');
});

test('búsqueda: abre el buscador con el término codificado', () => {
    const { HomeNovedades } = cargar([]);
    const a = HomeNovedades.construirSlide(busqueda, 1);
    assert.equal(a.getAttribute('href'), 'search.html#q=Lorenzo%20Pazzaglia');
    assert.equal(a.getAttribute('data-shell-target'), 'search.html#q=Lorenzo%20Pazzaglia');
});

test('whatsapp: abre wa.me con el mensaje, en pestaña nueva y fuera del shell', () => {
    const { HomeNovedades } = cargar([]);
    const a = HomeNovedades.construirSlide(whatsapp, 2);
    assert.equal(a.getAttribute('href'), 'https://wa.me/59178064327?text=' + encodeURIComponent(whatsapp.valor));
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(a.hasAttribute('data-shell-target'), false);
});

test('imagen: medidas del arte, alt, y solo la primera se carga de entrada', () => {
    const { HomeNovedades } = cargar([]);
    const img0 = HomeNovedades.construirSlide(perfume, 0).children[0];
    const img1 = HomeNovedades.construirSlide(busqueda, 1).children[0];
    assert.equal(img0.getAttribute('src'), 'imagenes/novedades/a.webp');
    assert.equal(img0.getAttribute('width'), '1080');
    assert.equal(img0.getAttribute('height'), '1350');
    assert.equal(img0.getAttribute('alt'), perfume.alt);
    assert.equal(img0.getAttribute('loading'), 'eager');
    assert.equal(img1.getAttribute('loading'), 'lazy');
    assert.equal(img1.getAttribute('decoding'), 'async');
});

test('lazy va antes que src: si no, el navegador baja las 15 fotos al cargar', () => {
    const { HomeNovedades } = cargar([]);
    const img = HomeNovedades.construirSlide(busqueda, 3).children[0];
    assert.ok(img.orden.indexOf('loading') < img.orden.indexOf('src'), 'orden: ' + img.orden.join(', '));
    assert.equal(img.orden[img.orden.length - 1], 'src');
});

test('con novedades del ERP arma esas diapositivas y no usa el respaldo', () => {
    const { HomeNovedades, track } = cargar([perfume, busqueda]);
    HomeNovedades.renderizar(track);
    assert.equal(track.children.length, 2);
    assert.equal(track.children[1].getAttribute('href'), 'search.html#q=Lorenzo%20Pazzaglia');
    assert.equal(track.innerHTML, '');
});

test('sin novedades del ERP (archivo ausente o vacío) usa las diapositivas de respaldo', () => {
    for (const datos of [[], undefined]) {
        const { HomeNovedades, track } = cargar(datos);
        HomeNovedades.renderizar(track);
        assert.equal(track.innerHTML, '<a class="home-novedades__slide" href="perfume.html#id=respaldo"></a>');
    }
});

test('no depende de replaceChildren (no existe en Safari de iPhones viejos)', () => {
    const { HomeNovedades, track } = cargar([perfume]);
    assert.equal(typeof track.replaceChildren, 'undefined');
    HomeNovedades.renderizar(track);
    assert.equal(track.children.length, 1);
});

test('catalogo.html pide los scripts del carrusel con versión (?v=) para no mezclarlos con una copia vieja en caché', () => {
    // Con el catalogo.html nuevo y un home-novedades.js viejo guardado (GitHub y el
    // navegador guardan cada archivo hasta 10 minutos) el carrusel sale vacío.
    const html = readFileSync(path.join(root, 'catalogo.html'), 'utf8');
    const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    for (const script of ['js/viewmodels/home.viewmodel.js', 'js/home-novedades.js']) {
        const src = srcs.find(s => s.split('?')[0] === script);
        assert.ok(src, script + ' no está en catalogo.html');
        assert.match(src, /\?v=[\w.-]+$/, script);
    }
});
