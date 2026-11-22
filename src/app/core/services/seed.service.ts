import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from '@angular/fire/firestore';
import type { Candidato } from '../models/candidato.model';
import type { Jrv } from '../models/jrv.model';
import type { OrganizacionPolitica } from '../models/organizacion-politica.model';
import type { Recinto } from '../models/recinto.model';
import type { RolUsuario } from '../models/rol-usuario.model';
import type { Usuario } from '../models/usuario.model';

const RECINTOS_INICIALES: readonly Omit<Recinto, 'coordinadorId'>[] = [
  {
    id: 'quito-inaquito-benalcazar',
    provincia: 'Pichincha',
    canton: 'Quito',
    parroquia: 'Iñaquito',
    nombre: 'Unidad Educativa Fiscal Benalcázar',
    cantidadJrv: 4,
  },
  {
    id: 'quito-la-mariscal-mejia',
    provincia: 'Pichincha',
    canton: 'Quito',
    parroquia: 'La Mariscal',
    nombre: 'Colegio Nacional Mejía',
    cantidadJrv: 3,
  },
  {
    id: 'quito-cotocollao-replica-montufar',
    provincia: 'Pichincha',
    canton: 'Quito',
    parroquia: 'Cotocollao',
    nombre: 'Unidad Educativa Réplica Montúfar',
    cantidadJrv: 3,
  },
];

const ORGANIZACIONES_INICIALES: readonly OrganizacionPolitica[] = [
  { id: 'MUP', nombre: 'Movimiento Unidad Provincial', sigla: 'MUP' },
  { id: 'FCS', nombre: 'Frente Ciudadano del Sur', sigla: 'FCS' },
  { id: 'ARP', nombre: 'Alianza Renovación Pichincha', sigla: 'ARP' },
  { id: 'PDT', nombre: 'Partido Democracia y Trabajo', sigla: 'PDT' },
  { id: 'CPM', nombre: 'Coalición Progreso Metropolitano', sigla: 'CPM' },
];

const CANDIDATURAS_INICIALES: readonly Omit<Candidato, 'id'>[] = [
  { dignidad: 'ALCALDE', nombres: 'Carlos Alberto', apellidos: 'Mendoza Paredes', organizacionPoliticaId: null },
  { dignidad: 'ALCALDE', nombres: 'María Fernanda', apellidos: 'Ortiz Salazar', organizacionPoliticaId: null },
  { dignidad: 'ALCALDE', nombres: 'Jorge Luis', apellidos: 'Herrera Cevallos', organizacionPoliticaId: null },
  { dignidad: 'ALCALDE', nombres: 'Patricia Elena', apellidos: 'Viteri Andrade', organizacionPoliticaId: null },
  { dignidad: 'ALCALDE', nombres: 'Andrés Sebastián', apellidos: 'Guamán Flores', organizacionPoliticaId: null },
  { dignidad: 'PREFECTO', nombres: 'Diego Armando', apellidos: 'Noboa Jácome', organizacionPoliticaId: null },
  { dignidad: 'PREFECTO', nombres: 'Lucía Mercedes', apellidos: 'Cordero Espinoza', organizacionPoliticaId: null },
  { dignidad: 'PREFECTO', nombres: 'Ramiro Patricio', apellidos: 'Tapia Zambrano', organizacionPoliticaId: null },
  { dignidad: 'PREFECTO', nombres: 'Sandra Paola', apellidos: 'Benítez Rivadeneira', organizacionPoliticaId: null },
  { dignidad: 'PREFECTO', nombres: 'Fernando Xavier', apellidos: 'Pinos Mora', organizacionPoliticaId: null },
];

const COLECCIONES_SEMILLA = [
  'recintos',
  'jrvs',
  'organizaciones',
  'candidatos',
] as const;

function idCandidato(
  candidatura: Pick<Candidato, 'dignidad' | 'apellidos'>,
): string {
  const apellidos = candidatura.apellidos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');

  return `${candidatura.dignidad.toLowerCase()}-${apellidos}`;
}

@Injectable({
  providedIn: 'root',
})
export class SeedService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);

  async inicializarDatosElectorales(): Promise<void> {
    const usuarioActual = this.auth.currentUser;

    if (!usuarioActual) {
      throw new Error('Debes iniciar sesión para inicializar los datos electorales.');
    }

    const perfilSnapshot = await getDoc(
      doc(this.firestore, 'usuarios', usuarioActual.uid),
    );
    const perfil = perfilSnapshot.data() as Usuario | undefined;

    if (!perfilSnapshot.exists() || perfil?.rol !== 'PROVINCIAL') {
      throw new Error('Solo el Coordinador Provincial puede inicializar los datos electorales.');
    }

    const colecciones = await Promise.all(
      COLECCIONES_SEMILLA.map((nombreColeccion) =>
        getDocs(collection(this.firestore, nombreColeccion)),
      ),
    );
    const idsEsperados: Record<(typeof COLECCIONES_SEMILLA)[number], string[]> = {
      recintos: RECINTOS_INICIALES.map(({ id }) => id),
      jrvs: RECINTOS_INICIALES.flatMap(({ id, cantidadJrv }) =>
        Array.from(
          { length: cantidadJrv },
          (_, indice) => `${id}-JRV-${String(indice + 1).padStart(2, '0')}`,
        ),
      ),
      organizaciones: ORGANIZACIONES_INICIALES.map(({ id }) => id),
      candidatos: CANDIDATURAS_INICIALES.map(idCandidato),
    };
    const todoVacio = colecciones.every(({ empty }) => empty);

    if (!todoVacio) {
      const yaInicializado = colecciones.every((snapshot, indice) => {
        const nombreColeccion = COLECCIONES_SEMILLA[indice];
        const idsActuales = snapshot.docs.map(({ id }) => id).sort();
        const idsDeSemilla = [...idsEsperados[nombreColeccion]].sort();

        return JSON.stringify(idsActuales) === JSON.stringify(idsDeSemilla);
      });

      if (yaInicializado) {
        return;
      }

      throw new Error(
        'No se puede inicializar: los catálogos están vacíos parcialmente o contienen datos distintos.',
      );
    }

    const batch = writeBatch(this.firestore);
    this.agregarRecintosYJrvs(batch);
    this.agregarOrganizaciones(batch);
    this.agregarCandidaturas(batch);
    await batch.commit();
  }

  private agregarRecintosYJrvs(batch: ReturnType<typeof writeBatch>): void {
    for (const recinto of RECINTOS_INICIALES) {
      batch.set(doc(this.firestore, 'recintos', recinto.id), {
        ...recinto,
        coordinadorId: '',
      } satisfies Recinto);

      for (let numero = 1; numero <= recinto.cantidadJrv; numero += 1) {
        const codigo = `JRV-${String(numero).padStart(2, '0')}`;
        const jrv: Jrv = {
          id: `${recinto.id}-${codigo}`,
          numero,
          recintoId: recinto.id,
        };
        batch.set(doc(this.firestore, 'jrvs', jrv.id), jrv);
      }
    }
  }

  private agregarOrganizaciones(batch: ReturnType<typeof writeBatch>): void {
    for (const organizacion of ORGANIZACIONES_INICIALES) {
      batch.set(
        doc(this.firestore, 'organizaciones', organizacion.id),
        organizacion,
      );
    }
  }

  private agregarCandidaturas(batch: ReturnType<typeof writeBatch>): void {
    for (const candidatura of CANDIDATURAS_INICIALES) {
      const id = idCandidato(candidatura);
      const candidato: Candidato = { ...candidatura, id };
      batch.set(doc(this.firestore, 'candidatos', id), candidato);
    }
  }
}
