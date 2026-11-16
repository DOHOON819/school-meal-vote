import { createBackend } from './backend.js';

const backend = createBackend();
const state = { proposals: [], social: new Map(), category: '전체', sort: 'popular', name: '', busy: new Set(), openComments: new Set() };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const elements = {
  grid: $('#ideaGrid'), loading: $('#loadingCard'), empty: $('#emptyState'), summary: $('#resultSummary'),
  proposalCount: $('#proposalCount'), voteCount: $('#voteCount'), sort: $('#sortSelect'), refresh: $('#refreshButton'),
  composer: $('#composerDialog'), proposalForm: $('#proposalForm'), title: $('#titleInput'), category: $('#categoryInput'),
  description: $('#descriptionInput'), descriptionCount: $('#descriptionCount'), author: $('#authorInput'), submit: $('#submitProposalButton'),
  identityDialog: $('#identityDialog'), identityForm: $('#identityForm'), identityInput: $('#identityInput'), identityLabel: $('#identityLabel'), toast: $('#toast')
};

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const initials = name => [...String(name || '급')].slice(0, 2).join('');
const socialFor = id => state.social.get(id) || { likes: 0, dislikes: 0, mine: 0, comments: [] };
const scoreFor = id => { const social = socialFor(id); return social.likes - social.dislikes; };

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(timestamp * 1000));
}

let toastTimer;
function toast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function setNameLocally(name) {
  state.name = name;
  elements.author.value = name;
  elements.identityInput.value = name;
  elements.identityLabel.textContent = name || '이름 설정';
}

function generatedName() {
  const saved = localStorage.getItem('school-meal-vote:name');
  if (saved) return saved;
  return `급식친구${Math.floor(100 + Math.random() * 900)}`;
}

async function ensureName(preferred) {
  const value = String(preferred || state.name || generatedName()).trim();
  const name = await backend.setName(value);
  localStorage.setItem('school-meal-vote:name', name);
  setNameLocally(name);
  return name;
}

function sortedFilteredProposals() {
  const items = state.proposals.filter(item => state.category === '전체' || item.category === state.category);
  return items.sort((a, b) => {
    if (state.sort === 'newest') return b.createdAt - a.createdAt;
    if (state.sort === 'comments') return socialFor(b.id).comments.length - socialFor(a.id).comments.length || b.createdAt - a.createdAt;
    return scoreFor(b.id) - scoreFor(a.id) || socialFor(b.id).likes - socialFor(a.id).likes || b.createdAt - a.createdAt;
  });
}

function proposalCard(proposal) {
  const social = socialFor(proposal.id);
  const mine = proposal.authorId === backend.me();
  const commentsOpen = state.openComments.has(proposal.id);
  const comments = social.comments.length
    ? social.comments.map(comment => `<div class="comment"><strong>${escapeHtml(comment.name)}</strong>${escapeHtml(comment.body)}</div>`).join('')
    : '<p class="comment-empty">첫 의견을 남겨보세요.</p>';
  return `<article class="idea-card" data-id="${proposal.id}">
    <div class="card-top"><span class="category-chip">${escapeHtml(proposal.category)}</span>${mine ? '<button class="delete-button" data-action="delete" type="button">내 제안 삭제</button>' : ''}</div>
    <h3>${escapeHtml(proposal.title)}</h3>
    <p class="idea-description${proposal.description ? '' : ' placeholder'}">${escapeHtml(proposal.description || '이 메뉴가 먹고 싶어요!')}</p>
    <div class="author-row"><span class="author"><i class="avatar">${escapeHtml(initials(proposal.author))}</i>${escapeHtml(proposal.author)}</span><time>${relativeTime(proposal.createdAt)}</time></div>
    <div class="vote-bar">
      <button class="vote-button like${social.mine === 1 ? ' active' : ''}" data-action="like" type="button" aria-pressed="${social.mine === 1}">♥ 먹고 싶어요 <b>${social.likes}</b></button>
      <button class="vote-button dislike${social.mine === -1 ? ' active' : ''}" data-action="dislike" type="button" aria-pressed="${social.mine === -1}">– 별로예요 <b>${social.dislikes}</b></button>
      <button class="comment-toggle" data-action="comments" type="button">의견 ${social.comments.length}</button>
    </div>
    <div class="comments" ${commentsOpen ? '' : 'hidden'}>
      <div class="comment-list">${comments}</div>
      <form class="comment-form"><input maxlength="300" aria-label="의견" placeholder="의견을 짧게 남겨주세요"><button type="submit">등록</button></form>
    </div>
  </article>`;
}

function render() {
  const items = sortedFilteredProposals();
  elements.grid.innerHTML = items.map(proposalCard).join('');
  elements.empty.hidden = items.length !== 0;
  elements.grid.hidden = items.length === 0;
  elements.summary.textContent = `${state.category === '전체' ? '전체' : state.category} 메뉴 ${items.length}개`;
  elements.proposalCount.textContent = state.proposals.length.toLocaleString('ko-KR');
  elements.voteCount.textContent = [...state.social.values()].reduce((sum, social) => sum + social.likes + social.dislikes, 0).toLocaleString('ko-KR');
}

async function load({ quiet = false } = {}) {
  if (!quiet) { elements.loading.hidden = false; elements.grid.hidden = true; elements.empty.hidden = true; }
  elements.refresh.disabled = true;
  try {
    const proposals = await backend.loadProposals();
    const social = await backend.loadSocial(proposals.map(item => item.id));
    state.proposals = proposals;
    state.social = social;
    render();
  } catch (error) {
    toast(error.message || '불러오지 못했어요.');
    if (!state.proposals.length) { elements.empty.hidden = false; elements.grid.hidden = true; }
  } finally {
    elements.loading.hidden = true;
    elements.refresh.disabled = false;
  }
}

async function handleVote(proposalId, requested) {
  if (state.busy.has(proposalId)) return;
  const social = socialFor(proposalId);
  const next = social.mine === requested ? 0 : requested;
  const previous = { ...social };
  if (social.mine === 1) social.likes -= 1;
  if (social.mine === -1) social.dislikes -= 1;
  if (next === 1) social.likes += 1;
  if (next === -1) social.dislikes += 1;
  social.mine = next;
  state.busy.add(proposalId);
  render();
  try {
    await backend.vote(proposalId, next);
    toast(next === 1 ? '먹고 싶어요에 한 표!' : next === -1 ? '의견이 반영됐어요.' : '투표를 취소했어요.');
  } catch (error) {
    Object.assign(social, previous);
    render();
    toast(error.message || '투표하지 못했어요.');
  } finally { state.busy.delete(proposalId); }
}

elements.grid.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('.idea-card');
  const proposalId = card?.dataset.id;
  const proposal = state.proposals.find(item => item.id === proposalId);
  if (!proposal) return;
  if (button.dataset.action === 'like') return handleVote(proposalId, 1);
  if (button.dataset.action === 'dislike') return handleVote(proposalId, -1);
  if (button.dataset.action === 'comments') {
    state.openComments.has(proposalId) ? state.openComments.delete(proposalId) : state.openComments.add(proposalId);
    render();
    if (state.openComments.has(proposalId)) requestAnimationFrame(() => document.querySelector(`[data-id="${proposalId}"] .comment-form input`)?.focus());
  }
  if (button.dataset.action === 'delete') {
    if (!window.confirm(`“${proposal.title}” 제안을 삭제할까요?`)) return;
    button.disabled = true;
    try { await backend.deleteProposal(proposal); state.proposals = state.proposals.filter(item => item.id !== proposalId); state.social.delete(proposalId); render(); toast('제안을 삭제했어요.'); }
    catch (error) { button.disabled = false; toast(error.message || '삭제하지 못했어요.'); }
  }
});

elements.grid.addEventListener('submit', async event => {
  if (!event.target.matches('.comment-form')) return;
  event.preventDefault();
  const card = event.target.closest('.idea-card');
  const proposalId = card.dataset.id;
  const input = event.target.querySelector('input');
  const button = event.target.querySelector('button');
  const body = input.value.trim();
  if (!body) return;
  button.disabled = true;
  try {
    if (!state.name) await ensureName();
    const result = await backend.addComment(proposalId, body, state.name);
    socialFor(proposalId).comments.push({ id: result.id, authorId: backend.me(), name: state.name, body, createdAt: result.created_at });
    state.openComments.add(proposalId);
    render();
    toast('의견을 등록했어요.');
  } catch (error) { button.disabled = false; toast(error.message || '의견을 등록하지 못했어요.'); }
});

$$('[data-open-composer]').forEach(button => button.addEventListener('click', () => {
  elements.author.value = state.name || generatedName();
  elements.composer.showModal();
  requestAnimationFrame(() => elements.title.focus());
}));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', () => elements.composer.close()));
$('#identityButton').addEventListener('click', () => { elements.identityInput.value = state.name || generatedName(); elements.identityDialog.showModal(); requestAnimationFrame(() => elements.identityInput.select()); });
$$('[data-close-identity]').forEach(button => button.addEventListener('click', () => elements.identityDialog.close()));

elements.description.addEventListener('input', () => { elements.descriptionCount.textContent = elements.description.value.length; });
elements.proposalForm.addEventListener('submit', async event => {
  event.preventDefault();
  elements.submit.disabled = true;
  elements.submit.textContent = '올리는 중…';
  try {
    const author = await ensureName(elements.author.value);
    await backend.publishProposal({ title: elements.title.value, category: elements.category.value, description: elements.description.value, author });
    elements.proposalForm.reset();
    elements.descriptionCount.textContent = '0';
    elements.composer.close();
    toast('메뉴 제안이 올라갔어요!');
    await load({ quiet: true });
  } catch (error) { toast(error.message || '메뉴를 올리지 못했어요.'); }
  finally { elements.submit.disabled = false; elements.submit.textContent = '메뉴 제안 올리기'; }
});

elements.identityForm.addEventListener('submit', async event => {
  event.preventDefault();
  try { await ensureName(elements.identityInput.value); elements.identityDialog.close(); toast('표시 이름을 바꿨어요.'); }
  catch (error) { toast(error.message || '이름을 바꾸지 못했어요.'); }
});

$$('.filter').forEach(button => button.addEventListener('click', () => {
  $$('.filter').forEach(item => item.classList.toggle('active', item === button));
  state.category = button.dataset.category;
  render();
}));
elements.sort.addEventListener('change', () => { state.sort = elements.sort.value; render(); });
elements.refresh.addEventListener('click', async () => { await load({ quiet: true }); toast('최신 의견으로 새로고침했어요.'); });
$('#copyLinkButton').addEventListener('click', async () => {
  const shareData = { title: '급식픽', text: '먹고 싶은 급식에 한 표 해줘!', url: location.origin + location.pathname };
  try { if (navigator.share) await navigator.share(shareData); else { await navigator.clipboard.writeText(shareData.url); toast('링크를 복사했어요.'); } } catch { /* Sharing was cancelled. */ }
});

window.addEventListener('DOMContentLoaded', async () => {
  const localName = localStorage.getItem('school-meal-vote:name') || '';
  setNameLocally(localName);
  backend.getName().then(name => { if (name) { localStorage.setItem('school-meal-vote:name', name); setNameLocally(name); } }).catch(() => {});
  await load();
});
