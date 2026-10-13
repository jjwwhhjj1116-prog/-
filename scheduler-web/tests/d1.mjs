import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../../migrations/0001_collaboration.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0002_personal_work.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0003_vault_metadata.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0004_retained_records.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0005_drive_resumable.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0006_intake_sync.sql',import.meta.url),'utf8'));
 // D1 returns null on no row and provides batch transaction semantics.
 const prepare=(sql)=>{let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};return statement;};
 return {db,DB:{prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
}

