// Sin dependencias: node --test tests/home-actions.test.cjs
// Los enlaces del inicio con data-shell-target navegan dentro del shell, también
// los que se crean después de cargar (las diapositivas que arma el carrusel).
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function cargar() {
    const oyentes = {};
    const navegados = [];
    const recordados = [];
    const document = {
        querySelector: () => null,
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: (tipo, fn) => { oyentes[tipo] = fn; },
    };
    const window = {
        PerfSuarez: {
            core: {
                onReady: fn => fn(),
                rememberReturnRoute: ruta => recordados.push(ruta),
                navigateToSearch() {},
            },
            viewmodels: {},
        },
    };
    window.parent = { catalogShellNavigate: destino => { navegados.push(destino); return true; } };
    const context = vm.createContext({ window, document });
    vm.runInContext(readFileSync(path.join(root, 'js/viewmodels/home.viewmodel.js'), 'utf8'), context);
    return { oyentes, navegados, recordados };
}

function clicEn(destino) {
    const enlace = { dataset: { shellTarget: destino } };
    let prevenido = false;
    const evento = {
        target: { closest: sel => (sel === '[data-shell-target]' ? enlace : null) },
        preventDefault: () => { prevenido = true; },
    };
    return { evento, prevenido: () => prevenido };
}

test('un enlace creado después de cargar abre su destino en el shell', () => {
    const { oyentes, navegados, recordados } = cargar();
    const clic = clicEn('perfume.html#id=perfume-nuevo');
    oyentes.click(clic.evento);
    assert.deepEqual(navegados, ['perfume.html#id=perfume-nuevo']);
    assert.deepEqual(recordados, ['catalogo.html']);
    assert.equal(clic.prevenido(), true);
});

test('un clic fuera de un enlace del shell no navega', () => {
    const { oyentes, navegados } = cargar();
    oyentes.click({ target: { closest: () => null }, preventDefault() { throw new Error('no debía prevenir'); } });
    assert.deepEqual(navegados, []);
});
