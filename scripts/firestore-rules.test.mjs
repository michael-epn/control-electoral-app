import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'demo-control-electoral-r8';
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

async function assertPermissionDenied(operation) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, 'permission-denied');
    return true;
  });
}

function acta(id, jrvId) {
  return {
    id,
    jrvId,
    recintoId: 'recinto_1',
    dignidad: 'ALCALDE',
    votosOrganizaciones: {
      MUP: 1,
      FCS: 1,
      ARP: 1,
      PDT: 1,
      CPM: 1,
    },
    votosNulos: 0,
    votosBlancos: 0,
    totalSufragantes: 5,
    fotoPath: null,
    gps: { lat: -0.2, lng: -78.5 },
    auditadaPorCoordinador: false,
  };
}

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'usuarios', 'veedor_1'), {
      id: 'veedor_1',
      rol: 'VEEDOR',
      recintoId: 'recinto_1',
      jrvIds: ['JRV-01'],
    });
    await setDoc(doc(db, 'jrvs', 'JRV-01'), {
      id: 'JRV-01',
      recintoId: 'recinto_1',
      veedorId: 'veedor_1',
    });
    await setDoc(doc(db, 'jrvs', 'JRV-02'), {
      id: 'JRV-02',
      recintoId: 'recinto_1',
      veedorId: 'veedor_2',
    });
    await setDoc(doc(db, 'actas', 'acta-JRV-01'), acta('acta-JRV-01', 'JRV-01'));
    await setDoc(doc(db, 'actas', 'acta-JRV-02'), acta('acta-JRV-02', 'JRV-02'));
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('veedor_1 solo puede leer su JRV y recibe permission-denied sobre JRV-02', async () => {
  const db = testEnv.authenticatedContext('veedor_1').firestore();

  await assertSucceeds(getDoc(doc(db, 'jrvs', 'JRV-01')));
  await assertPermissionDenied(getDoc(doc(db, 'jrvs', 'JRV-02')));
  await assertPermissionDenied(
    updateDoc(doc(db, 'jrvs', 'JRV-02'), { veedorId: 'veedor_1' }),
  );

  await assertSucceeds(getDoc(doc(db, 'actas', 'acta-JRV-01')));
  await assertSucceeds(
    updateDoc(doc(db, 'actas', 'acta-JRV-01'), {
      votosNulos: 1,
      totalSufragantes: 6,
    }),
  );
  await assertSucceeds(setDoc(doc(db, 'actas', 'acta-new-JRV-01'), acta('acta-new-JRV-01', 'JRV-01')));
  await assertPermissionDenied(getDoc(doc(db, 'actas', 'acta-JRV-02')));
  await assertPermissionDenied(
    updateDoc(doc(db, 'actas', 'acta-JRV-02'), { votosNulos: 1 }),
  );
  await assertPermissionDenied(
    setDoc(doc(db, 'actas', 'acta-new-JRV-02'), acta('acta-new-JRV-02', 'JRV-02')),
  );
});
