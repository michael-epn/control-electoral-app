const test = require('node:test');
const assert = require('node:assert/strict');
const { puedeFirmarFotoActa } = require('../lib/photo-authorization.js');

const base = {
  uid: 'user-1',
  rol: 'RECINTO',
  profileRecintoId: 'recinto-1',
  actaRecintoId: 'recinto-1',
  fotoPath: 'veedor-1/recinto-1/JRV-01_ALCALDE.jpg',
  veedorAsignadoId: null,
};

test('provincial puede firmar evidencias de actas', () => {
  assert.equal(puedeFirmarFotoActa({ ...base, rol: 'PROVINCIAL' }), true);
});

test('recinto solo puede firmar evidencias de su propio recinto', () => {
  assert.equal(puedeFirmarFotoActa(base), true);
  assert.equal(
    puedeFirmarFotoActa({ ...base, profileRecintoId: 'recinto-2' }),
    false,
  );
});

test('veedor solo puede firmar evidencia propia de una JRV asignada', () => {
  const veedor = {
    ...base,
    rol: 'VEEDOR',
    fotoPath: 'user-1/recinto-1/JRV-01_ALCALDE.jpg',
    veedorAsignadoId: 'user-1',
  };
  assert.equal(puedeFirmarFotoActa(veedor), true);
  assert.equal(
    puedeFirmarFotoActa({ ...veedor, veedorAsignadoId: 'user-2' }),
    false,
  );
  assert.equal(
    puedeFirmarFotoActa({
      ...veedor,
      fotoPath: 'user-2/recinto-1/JRV-01_ALCALDE.jpg',
    }),
    false,
  );
});

test('rechaza roles no reconocidos', () => {
  assert.equal(puedeFirmarFotoActa({ ...base, rol: 'INVITADO' }), false);
});
