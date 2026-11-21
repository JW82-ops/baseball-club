import { GLOSSARY, LEARN_CATS, learnKeysOf } from '../../data/glossary.js';
import { $, openModal } from '../dom.js';

export function learnHtml(k, inline = false) {
  const g = GLOSSARY[k];
  if (!g) return '';
  const cat = LEARN_CATS.find((c) => c[0] === g.cat);
  const rel = learnKeysOf(g.cat).filter((x) => x !== k).slice(0, 6);
  return `${inline ? '<button class="learnpop-x" data-act="learnClose" aria-label="닫기">×</button>' : '<button class="sheet-close" data-act="closeModal" aria-label="닫기">×</button>'}
    <span class="small amber">${cat ? `${cat[1]} ${cat[2]}` : '야구 교실'}</span>
    <h2 class="disp" style="font-size:21px;margin-top:2px">${g.t}</h2>
    <p class="mt">${g.body}</p>
    ${g.tip ? `<p class="learntip mt">💡 ${g.tip}</p>` : ''}
    ${rel.length ? `<div class="learngrid mt">${rel.map((x) => `<button class="learnitem sm" data-act="learn" data-k="${x}">${GLOSSARY[x].t}</button>`).join('')}</div>` : ''}`;
}

// 모달이 열려 있으면 그 안에 말풍선처럼, 아니면 시트로
export function showLearn(k) {
  const modal = $('#modal');
  const box = $('#modal-box');
  if (modal && !modal.hidden && box) {
    let pop = box.querySelector('.learnpop');
    if (!pop) { pop = document.createElement('div'); pop.className = 'learnpop'; box.prepend(pop); }
    pop.innerHTML = learnHtml(k, true);
    box.scrollTo?.({ top: 0, behavior: 'smooth' });
    return;
  }
  openModal(learnHtml(k), { sheet: true });
}
export function shortWhy(k) {
  const g = GLOSSARY[k];
  if (!g) return '';
  return g.body.split(/(?<=[.요다])\s/)[0];
}
