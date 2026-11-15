import { DatabaseSync } from 'node:sqlite';
import * as sqliteVec from 'sqlite-vec';

export function nearest() {
  const db = new DatabaseSync(':memory:', { allowExtension: true });
  try {
    sqliteVec.load(db);
    db.enableLoadExtension(false);
    db.exec('CREATE VIRTUAL TABLE vectors USING vec0(embedding float[3])');
    const insert = db.prepare('INSERT INTO vectors(rowid, embedding) VALUES (?, ?)');
    insert.run(1n, '[1,0,0]');
    insert.run(2n, '[0,1,0]');
    const row = db.prepare('SELECT rowid, distance FROM vectors WHERE embedding MATCH ? AND k = 1 ORDER BY distance').get('[1,0,0]');
    return { id: Number(row.rowid), distance: row.distance,
      version: db.prepare('SELECT vec_version() AS version').get().version };
  } finally { db.close(); }
}
