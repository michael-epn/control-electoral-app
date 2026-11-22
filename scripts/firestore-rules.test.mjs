import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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

function acta(id, jrvId, ownerUid = 'veedor_1') {
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
    fotoPath: `${ownerUid}/recinto_1/${id}.jpg`,
    fotoUrl: 'https://storage.example.test/signed-acta',
    gps: { lat: -0.2, lng: -78.5 },
    auditadaPorCoordinador: false,
    client_timestamp: Date.now(),
  };
}

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'usuarios', 'veedor_1'), {
      id: 'veedor_1',
      cedula: '1710034065',
      rol: 'VEEDOR',
      recintoId: 'recinto_1',
      jrvIds: ['JRV-01'],
    });
    await setDoc(doc(db, 'usuarios', 'provincial_1'), {
      id: 'provincial_1',
      rol: 'PROVINCIAL',
    });
    await setDoc(doc(db, 'usuarios', 'recinto_coordinator'), {
      id: 'recinto_coordinator',
      rol: 'RECINTO',
      recintoId: 'recinto_1',
    });
    await setDoc(doc(db, 'recintos', 'recinto_2'), {
      id: 'recinto_2',
      coordinadorId: '',
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
    await setDoc(doc(db, 'jrvs', 'JRV-03'), {
      id: 'JRV-03',
      recintoId: 'recinto_1',
      veedorId: null,
    });
    await setDoc(doc(db, 'actas', 'acta-JRV-01'), acta('acta-JRV-01', 'JRV-01'));
    await setDoc(
      doc(db, 'actas', 'acta-JRV-02'),
      acta('acta-JRV-02', 'JRV-02', 'veedor_2'),
    );
    await setDoc(doc(db, 'cedulas_lookup', '1710034065'), {
      email: 'veedor@example.test',
      uid: 'veedor_1',
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('veedor_1 solo puede leer su JRV y recibe permission-denied sobre JRV-02', async () => {
  const db = testEnv.authenticatedContext('veedor_1', {
    email_verified: true,
  }).firestore();

  await assertSucceeds(getDoc(doc(db, 'jrvs', 'JRV-01')));
  await assertPermissionDenied(getDoc(doc(db, 'jrvs', 'JRV-02')));
  await assertSucceeds(
    getDocs(query(collection(db, 'jrvs'), where('veedorId', '==', 'veedor_1'))),
  );
  await assertSucceeds(
    getDocs(query(collection(db, 'actas'), where('jrvId', '==', 'JRV-01'))),
  );
  await assertPermissionDenied(
    getDocs(query(collection(db, 'actas'), where('jrvId', '==', 'JRV-02'))),
  );
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
  await assertPermissionDenied(
    updateDoc(doc(db, 'actas', 'acta-JRV-01'), {
      client_timestamp: Date.now() + 60 * 60 * 1000,
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

test('el Coordinador de Recinto puede corregir y auditar un acta de su recinto', async () => {
  const coordinatorDb = testEnv.authenticatedContext('recinto_coordinator', {
    email_verified: true,
  }).firestore();

  await assertSucceeds(
    getDocs(query(
      collection(coordinatorDb, 'actas'),
      where('jrvId', '==', 'JRV-01'),
      where('recintoId', '==', 'recinto_1'),
    )),
  );

  await assertSucceeds(
    updateDoc(doc(coordinatorDb, 'actas', 'acta-JRV-01'), {
      votosNulos: 2,
      totalSufragantes: 7,
      fotoPath: 'recinto_coordinator/recinto_1/correccion.jpg',
      fotoUrl: 'https://storage.example.test/signed-correction',
      auditadaPorCoordinador: true,
    }),
  );

  const veedorDb = testEnv.authenticatedContext('veedor_1', {
    email_verified: true,
  }).firestore();
  await assertPermissionDenied(
    updateDoc(doc(veedorDb, 'actas', 'acta-JRV-01'), { votosNulos: 3 }),
  );
});

test('el Provincial crea un Coordinador de Recinto y su mapeo de cédula', async () => {
  const db = testEnv.authenticatedContext('provincial_1', {
    email_verified: true,
  }).firestore();
  const batch = writeBatch(db);
  const uid = 'recinto_coordinator_2';
  const email = 'recinto2@example.test';

  batch.set(doc(db, 'usuarios', uid), {
    id: uid,
    cedula: '1710034073',
    nombres: 'Coordinador',
    apellidos: 'Recinto',
    telefono: null,
    email,
    rol: 'RECINTO',
    debeCambiarClave: true,
    recintoId: 'recinto_2',
    jrvIds: [],
  });
  batch.set(doc(db, 'cedulas_lookup', '1710034073'), { uid, email });
  batch.update(doc(db, 'recintos', 'recinto_2'), { coordinadorId: uid });

  await assertSucceeds(batch.commit());
});

test('el Coordinador de Recinto crea un Veedor y lo asigna a una JRV propia', async () => {
  const db = testEnv.authenticatedContext('recinto_coordinator', {
    email_verified: true,
  }).firestore();
  const batch = writeBatch(db);
  const uid = 'veedor_3';
  const email = 'veedor3@example.test';

  batch.set(doc(db, 'usuarios', uid), {
    id: uid,
    cedula: '1710034081',
    nombres: 'Veedor',
    apellidos: 'Tres',
    telefono: null,
    email,
    rol: 'VEEDOR',
    debeCambiarClave: true,
    recintoId: 'recinto_1',
    jrvIds: ['JRV-03'],
  });
  batch.set(doc(db, 'cedulas_lookup', '1710034081'), { uid, email });
  batch.update(doc(db, 'jrvs', 'JRV-03'), { veedorId: uid });

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db, 'jrvs', 'JRV-03')));
});

test('cedulas_lookup permite get puntual pero rechaza list', async () => {
  const db = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(db, 'cedulas_lookup', '1710034065')));
  await assertPermissionDenied(getDocs(collection(db, 'cedulas_lookup')));
});
