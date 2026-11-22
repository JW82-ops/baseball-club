// 세이브 백업: 파일로 저장(공유 시트) · 파일에서 불러오기
import { state, exportSave, importSave, setSlot, slotInfo, save } from '../core/store.js';
import { toast } from './dom.js';

const fileName = () => {
  const t = state?.teams?.[state.userTeamId];
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `프로야구팀_${(t?.name || '구단').replace(/\s+/g, '')}_${state?.season || ''}시즌_${ymd}.json`;
};

export async function backupToFile() {
  if (!state) return;
  const text = exportSave();
  const name = fileName();
  const blob = new Blob([text], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '프로야구팀 백업' });
      state.lastBackup = { season: state.season, day: state.day, at: Date.now() };
      save();
      toast('백업 파일을 보냈어요', 'good');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  state.lastBackup = { season: state.season, day: state.day, at: Date.now() };
  save();
  toast(`${name} 저장`, 'good');
}

// 파일 고르기 → 텍스트. 취소하면 null
export function pickFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json,text/plain';
    inp.onchange = async () => { const f = inp.files?.[0]; resolve(f ? await f.text() : null); };
    inp.click();
  });
}

// 지금 슬롯에 덮어쓰기
export async function restoreFromFile(after) {
  const text = await pickFile();
  if (!text) return;
  try { importSave(text); after?.(); toast('백업을 불러왔어요', 'good'); } catch (e) { toast(e.message || '파일을 읽지 못했어요', 'bad'); }
}
// 타이틀 화면: 빈 슬롯에 불러오기
export async function restoreToEmptySlot(after) {
  const n = [1, 2, 3].find((i) => !slotInfo(i));
  if (!n) { toast('빈 슬롯이 없어요. 슬롯 하나를 지운 뒤 다시 해 주세요', 'bad'); return; }
  const text = await pickFile();
  if (!text) return;
  try { setSlot(n); importSave(text); after?.(n); toast(`슬롯 ${n}에 불러왔어요`, 'good'); } catch (e) { toast(e.message || '파일을 읽지 못했어요', 'bad'); }
}
