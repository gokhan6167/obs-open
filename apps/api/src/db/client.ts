import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as core from './schema.js';
import * as academic from './schema-academic.js';
import * as parameters from './schema-parameters.js';
import * as enrollment from './schema-enrollment.js';
import * as gradesSchema from './schema-grades.js';
import * as documentsSchema from './schema-documents.js';
import * as financeSchema from './schema-finance.js';
import * as commSchema from './schema-comm.js';
import * as healthSchema from './schema-health.js';
import * as migrationSchema from './schema-migration.js';
import * as doubleMajorSchema from './schema-double-major.js';
import * as portalSchema from './schema-portal.js';

const schema = {
  ...core,
  ...academic,
  ...parameters,
  ...enrollment,
  ...gradesSchema,
  ...documentsSchema,
  ...financeSchema,
  ...commSchema,
  ...healthSchema,
  ...migrationSchema,
  ...doubleMajorSchema,
  ...portalSchema,
};

export type Sql = postgres.Sql;
export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  client: Sql;
  db: Db;
}

/** Uygulama bağlantısı (RLS'e tabi obs_app rolü beklenir). */
export function createDb(url: string, max = 10): DbHandle {
  const client = postgres(url, { max });
  const db = drizzle(client, { schema });
  return { client, db };
}
