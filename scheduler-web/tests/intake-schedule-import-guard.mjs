import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../src/utils/projectCatalog.ts',import.meta.url),'utf8');
const exports={};
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Set,Error});
const {assertNewSchedulesHaveIntake}=exports;
const intake=[{code:'TK-2026095'}];
const existing=[{code:'TK-2020001',department:'마감팀'}];
const schedule=(code,department)=>({code,department});

assert.doesNotThrow(()=>assertNewSchedulesHaveIntake(intake,existing,[schedule(' tk-2026095 ','구조팀')]));
console.log('PASS 접수 원본의 코드면 새 팀 일정 가져오기 허용');
assert.doesNotThrow(()=>assertNewSchedulesHaveIntake(intake,existing,[schedule('TK-2020001','마감팀')]));
console.log('PASS 과거 접수 밖 기존 팀 일정의 복원은 유지');
assert.throws(()=>assertNewSchedulesHaveIntake(intake,existing,[schedule('TK-2020001','구조팀')]),/접수목록에 없는 신규 일정/);
console.log('PASS 접수 밖 과거 프로젝트의 새 팀 일정은 차단');
assert.throws(()=>assertNewSchedulesHaveIntake(intake,existing,[schedule('TK-2026095','마감팀'),schedule('TK-2026999','마감팀')]),/TK-2026999/);
console.log('PASS 엑셀에 정상·미접수 신규 일정이 섞여 있으면 가져오기 전 전체 검증');
