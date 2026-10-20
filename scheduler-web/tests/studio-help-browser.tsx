import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { StudioHelpDialog, type HelpTab } from '../src/components/StudioHelpDialog';
import { markHelpSeen, readHelpStatus } from '../src/components/studioHelpState';

function Fixture() {
  const [tab, setTab] = useState<HelpTab|null>('guide');
  const [language, setLanguage] = useState<'ko'|'vi'>('ko');
  const [lastMenu, setLastMenu] = useState('');
  return <main className="p-5"><h1 className="text-xl font-bold">기술본부 스튜디오</h1><div className="mt-3 flex gap-2"><button onClick={()=>setTab('guide')}>사용 안내 열기</button><button onClick={()=>setTab('updates')}>업데이트 열기</button><button onClick={()=>setLanguage(language==='ko'?'vi':'ko')}>언어 변경</button></div><p role="status">메뉴: {lastMenu||'없음'}</p><p data-test-help-state>{JSON.stringify(readHelpStatus('fixture-user'))}</p>{tab&&<StudioHelpDialog initialTab={tab} language={language} onClose={()=>{markHelpSeen('fixture-user');setTab(null);}} onOpenMenu={menu=>{markHelpSeen('fixture-user');setLastMenu(menu);setTab(null);}}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
