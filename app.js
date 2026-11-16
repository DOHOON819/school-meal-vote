import { createBackend } from './backend.js?v=8';

const backend = createBackend();
const requestedKind = new URLSearchParams(location.search).get('tab');
const opinionDestination = location.hash === '#topOpinions';
const state = { proposals: [], social: new Map(), kind: requestedKind === 'opinion' || opinionDestination ? 'opinion' : 'meal', sort: 'popular', name: '', busy: new Set(), openComments: new Set(), composerType: 'meal' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const elements = {
  grid: $('#ideaGrid'), ranking: $('#rankingBoard'), loading: $('#loadingCard'), loadingMessage: $('#loadingMessage'), empty: $('#emptyState'), summary: $('#resultSummary'),
  proposalCount: $('#proposalCount'), voteCount: $('#voteCount'), remainingVoteCount: $('#remainingVoteCount'), sort: $('#sortSelect'), refresh: $('#refreshButton'),
  boardTitle: $('#boardTitle'), boardDescription: $('#boardDescription'), emptySymbol: $('#emptySymbol'), emptyTitle: $('#emptyTitle'), emptyDescription: $('#emptyDescription'),
  heroEyebrow: $('#heroEyebrow'), heroTitle: $('#heroTitle'), heroDescription: $('#heroDescription'), heroComposeButton: $('#heroComposeButton'), heroSecondaryLink: $('#heroSecondaryLink'),
  heroTagOne: $('#heroTagOne'), heroTagTwo: $('#heroTagTwo'), winnerBadge: $('#winnerBadge'),
  winnerSymbol: $('#winnerSymbol'), winnerTitle: $('#winnerTitle'), winnerHint: $('#winnerHint'), winnerVotes: $('#winnerVotes'),
  composer: $('#composerDialog'), proposalForm: $('#proposalForm'), title: $('#titleInput'), author: $('#authorInput'), proposalType: $('#proposalTypeInput'),
  titleFieldLabel: $('#titleFieldLabel'), composerTitle: $('#composerTitle'), submit: $('#submitProposalButton'),
  formError: $('#proposalFormError'),
  identityDialog: $('#identityDialog'), identityForm: $('#identityForm'), identityInput: $('#identityInput'), identityLabel: $('#identityLabel'), toast: $('#toast')
};

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const initials = name => [...String(name || '서운')].slice(0, 2).join('');
const socialFor = id => state.social.get(id) || { likes: 0, dislikes: 0, mine: 0, comments: [] };
const scoreFor = id => { const social = socialFor(id); return social.likes - social.dislikes; };
const MAX_ACTIVE_VOTES = 2;
const activeVoteCount = () => [...state.social.values()].filter(social => social.mine !== 0).length;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function nextWeeklyResetTime() {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - daysSinceMonday + 7);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.getTime() - KST_OFFSET_MS;
}

let weeklyResetTimer;
function scheduleWeeklyReset() {
  window.clearTimeout(weeklyResetTimer);
  const delay = Math.max(1000, nextWeeklyResetTime() - Date.now());
  weeklyResetTimer = window.setTimeout(async () => {
    state.proposals = [];
    state.social = new Map();
    render();
    toast('새 주 투표가 시작됐어요!');
    await load({ quiet: true });
    scheduleWeeklyReset();
  }, delay);
}

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
  elements.identityInput.value = name;
  elements.author.value = name;
  elements.identityLabel.textContent = name || '10101 OOO';
}

async function ensureName(preferred) {
  const value = String(preferred || state.name || '').trim();
  if (!/^\d{5}\s+\S{1,10}$/.test(value)) throw new Error('제안자 이름을 10101 OOO 형식으로 입력해 주세요.');
  const name = await backend.setName(value);
  localStorage.setItem('school-meal-vote:name', name);
  setNameLocally(name);
  return name;
}

function ranked(items) {
  return [...items].sort((a, b) => socialFor(b.id).likes - socialFor(a.id).likes || socialFor(a.id).dislikes - socialFor(b.id).dislikes || b.createdAt - a.createdAt);
}

function sortedFilteredProposals() {
  const items = state.proposals.filter(item => item.type === state.kind);
  return items.sort((a, b) => {
    if (state.sort === 'newest') return b.createdAt - a.createdAt;
    if (state.sort === 'comments') return socialFor(b.id).comments.length - socialFor(a.id).comments.length || b.createdAt - a.createdAt;
    return socialFor(b.id).likes - socialFor(a.id).likes || socialFor(a.id).dislikes - socialFor(b.id).dislikes || b.createdAt - a.createdAt;
  });
}

function proposalCard(proposal) {
  const social = socialFor(proposal.id);
  const mine = proposal.authorId === backend.me();
  const commentsOpen = state.openComments.has(proposal.id);
  const comments = social.comments.length
    ? social.comments.map(comment => `<div class="comment"><strong>${escapeHtml(comment.name)}</strong>${escapeHtml(comment.body)}</div>`).join('')
    : '<p class="comment-empty">첫 댓글을 남겨보세요.</p>';
  const typeLabel = proposal.type === 'opinion' ? '💬 학생 의견' : '🍱 급식 메뉴';
  const positiveLabel = proposal.type === 'meal' ? '먹고 싶어요' : '좋아요';
  const voteDisabled = state.busy.has(proposal.id) ? ' disabled' : '';
  const supportPercent = Math.min(100, social.likes / 20);
  return `<article class="idea-card" data-id="${proposal.id}">
    <div class="card-top"><span class="category-chip${proposal.type === 'opinion' ? ' opinion' : ''}">${typeLabel}</span>${mine ? '<button class="delete-button" data-action="delete" type="button">내가 올린 글 삭제</button>' : ''}</div>
    <h3>${escapeHtml(proposal.title)}</h3>
    <div class="author-row"><span class="author"><i class="avatar">${escapeHtml(initials(proposal.author))}</i>${escapeHtml(proposal.author)}</span><time>${relativeTime(proposal.createdAt)}</time></div>
    <div class="support-meter"><span style="width:${supportPercent}%"></span></div><small class="support-count">${social.likes.toLocaleString('ko-KR')} / 2,000표</small>
    <div class="vote-bar">
      <button class="vote-button like${social.mine === 1 ? ' active' : ''}" data-action="like" type="button" aria-pressed="${social.mine === 1}"${voteDisabled}>${social.mine === 1 ? '✓ ' + positiveLabel + ' 취소' : '♥ ' + positiveLabel} <b>${social.likes}</b></button>
      <button class="vote-button dislike${social.mine === -1 ? ' active' : ''}" data-action="dislike" type="button" aria-pressed="${social.mine === -1}"${voteDisabled}>${social.mine === -1 ? '✓ 별로예요 취소' : '– 별로예요'} <b>${social.dislikes}</b></button>
      <button class="comment-toggle" data-action="comments" type="button">댓글 ${social.comments.length}</button>
    </div>
    <div class="comments" ${commentsOpen ? '' : 'hidden'}>
      <div class="comment-list">${comments}</div>
      <form class="comment-form"><input maxlength="300" aria-label="댓글" placeholder="짧게 댓글 남기기"><button type="submit">등록</button></form>
    </div>
  </article>`;
}

function renderRanking() {
  const opinions = ranked(state.proposals.filter(item => item.type === 'opinion')).slice(0, 5);
  if (!opinions.length) {
    elements.ranking.innerHTML = '<div class="ranking-empty"><span>💬</span><strong>아직 올라온 의견이 없어요</strong><small>첫 의견을 올리면 여기에서 1위가 됩니다.</small></div>';
    return;
  }
  elements.ranking.innerHTML = opinions.map((proposal, index) => {
    const social = socialFor(proposal.id);
    const disabled = state.busy.has(proposal.id) ? ' disabled' : '';
    return `<article class="rank-card" data-id="${proposal.id}">
      <span class="rank-number">${index + 1}</span>
      <h3>${escapeHtml(proposal.title)}</h3>
      <div class="rank-meta"><span>학생 의견 · ${social.likes.toLocaleString('ko-KR')} / 2,000표</span><button class="rank-vote${social.mine === 1 ? ' active' : ''}" data-action="like" type="button"${disabled}>${social.mine === 1 ? '✓ 투표 취소' : '♥ 한 표'}</button></div>
    </article>`;
  }).join('');
}

function renderWinner() {
  const opinion = state.kind === 'opinion';
  const candidates = ranked(state.proposals.filter(item => item.type === state.kind));
  const winner = candidates.find(item => socialFor(item.id).likes + socialFor(item.id).dislikes > 0);
  const plate = elements.winnerSymbol.closest('.plate');
  if (!winner) {
    plate.classList.remove('has-winner');
    elements.winnerSymbol.textContent = '?';
    elements.winnerTitle.textContent = opinion ? '어떤 의견이 1위가 될까요?' : '어떤 메뉴가 1위가 될까요?';
    elements.winnerHint.textContent = candidates.length ? '첫 투표를 기다리는 중' : (opinion ? '첫 의견을 기다리는 중' : '첫 메뉴를 기다리는 중');
    elements.winnerVotes.textContent = '♥ 0';
    return;
  }
  const social = socialFor(winner.id);
  plate.classList.add('has-winner');
  elements.winnerSymbol.textContent = '1위';
  elements.winnerTitle.textContent = winner.title;
  elements.winnerHint.textContent = opinion ? '지금 가장 많은 공감' : '지금 가장 많은 표';
  elements.winnerVotes.textContent = `♥ ${social.likes}`;
}

function updateBoardCopy(items) {
  const opinion = state.kind === 'opinion';
  elements.boardTitle.textContent = opinion ? '학생 의견에 투표해요' : '먹고 싶은 급식에 투표해요';
  elements.boardDescription.textContent = opinion ? '아래 의견에 누른 표가 학생 의견 TOP 5 순위에 바로 반영돼요.' : '먹고 싶은 메뉴 이름을 보고 한 표를 눌러주세요.';
  elements.loadingMessage.textContent = opinion ? '친구들의 의견을 모으고 있어요…' : '친구들의 메뉴를 모으고 있어요…';
  elements.emptySymbol.textContent = opinion ? '💬' : '🍽️';
  elements.emptyTitle.textContent = opinion ? '아직 올라온 의견이 없어요' : '아직 올라온 메뉴가 없어요';
  elements.emptyDescription.textContent = opinion ? '급식이나 학교생활에 관한 의견을 자유롭게 내보세요.' : '먹고 싶은 메뉴를 첫 번째로 제안해 보세요.';
  elements.summary.textContent = `${opinion ? '학생 의견' : '급식 메뉴'} ${items.length}개`;
}

function updateModeCopy() {
  const opinion = state.kind === 'opinion';
  document.body.classList.toggle('opinion-mode', opinion);
  elements.heroEyebrow.textContent = '언제나 의견·투표 가능 · 투표 결과는 매주 집계';
  elements.heroTitle.innerHTML = opinion ? '우리 학교,<br><em>우리 의견</em>으로.' : '우리 학교,<br><em>우리의 한 표</em>로.';
  elements.heroDescription.textContent = opinion ? '언제나 쉽게 학생 의견을 내고 투표할 수 있어요. 받은 표는 학생 의견 TOP 5 순위에 바로 반영됩니다.' : '언제나 쉽게 먹고 싶은 메뉴를 제안하고 투표할 수 있어요. 친구들의 선택이 진짜 급식이 될 수도 있습니다.';
  elements.heroComposeButton.textContent = '의견 내기';
  elements.heroSecondaryLink.href = opinion ? '?tab=meal#ideas' : '?tab=opinion#topOpinions';
  elements.heroSecondaryLink.innerHTML = opinion ? '급식 메뉴 투표 보기 <span>↓</span>' : '학생 의견 TOP 5 보기 <span>↓</span>';
  elements.heroTagOne.textContent = opinion ? '의견 내기!' : '🍝 메뉴 제안!';
  elements.heroTagTwo.textContent = '✓ 학생 한 표';
  elements.winnerBadge.textContent = opinion ? '학생 의견 현재 1위' : '급식 투표 현재 1위';
}

function render() {
  const items = sortedFilteredProposals();
  elements.grid.innerHTML = items.map(proposalCard).join('');
  elements.empty.hidden = items.length !== 0;
  elements.grid.hidden = items.length === 0;
  updateBoardCopy(items);
  updateModeCopy();
  elements.proposalCount.textContent = state.proposals.length.toLocaleString('ko-KR');
  elements.voteCount.textContent = [...state.social.values()].reduce((sum, social) => sum + social.likes + social.dislikes, 0).toLocaleString('ko-KR');
  elements.remainingVoteCount.textContent = `${Math.max(0, MAX_ACTIVE_VOTES - activeVoteCount())}/${MAX_ACTIVE_VOTES}`;
  renderRanking();
  renderWinner();
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
    render();
  } finally {
    elements.loading.hidden = true;
    elements.refresh.disabled = false;
  }
}

async function handleVote(proposalId, requested) {
  if (state.busy.has(proposalId)) return;
  const social = socialFor(proposalId);
  const next = social.mine === requested ? 0 : requested;
  if (next !== 0 && social.mine === 0 && activeVoteCount() >= MAX_ACTIVE_VOTES) {
    toast('투표권 2표를 모두 사용했어요. 기존 투표를 취소하면 다시 투표할 수 있어요.');
    return;
  }
  const previous = { ...social };
  if (social.mine === 1) social.likes = Math.max(0, social.likes - 1);
  if (social.mine === -1) social.dislikes = Math.max(0, social.dislikes - 1);
  if (next === 1) social.likes = Math.min(2000, social.likes + 1);
  if (next === -1) social.dislikes = Math.min(2000, social.dislikes + 1);
  social.mine = next;
  state.busy.add(proposalId);
  render();
  try {
    await backend.vote(proposalId, next);
    const proposal = state.proposals.find(item => item.id === proposalId);
    if (next === 0) toast(requested === 1 ? '좋아요 투표를 취소했어요.' : '별로예요 투표를 취소했어요.');
    else if (next === 1) toast(proposal?.type === 'meal' ? '먹고 싶어요에 한 표를 눌렀어요!' : '이 의견에 한 표를 눌렀어요!');
    else toast('별로예요에 한 표를 눌렀어요.');
  } catch (error) {
    Object.assign(social, previous);
    render();
    toast(error.message || '투표하지 못했어요.');
  } finally { state.busy.delete(proposalId); render(); }
}

async function handleAction(button) {
  const card = button.closest('[data-id]');
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
    const originalIndex = state.proposals.findIndex(item => item.id === proposalId);
    const originalSocial = state.social.get(proposalId);
    state.proposals = state.proposals.filter(item => item.id !== proposalId);
    state.social.delete(proposalId);
    render();
    toast('삭제 중…');
    try {
      await backend.deleteProposal(proposal);
      toast('삭제했어요.');
    } catch (error) {
      state.proposals.splice(Math.max(0, originalIndex), 0, proposal);
      if (originalSocial) state.social.set(proposalId, originalSocial);
      render();
      toast(error.message || '삭제하지 못했어요. 다시 시도해 주세요.');
    }
  }
}

elements.grid.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button); });
elements.ranking.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) handleAction(button); });

elements.grid.addEventListener('submit', async event => {
  if (!event.target.matches('.comment-form')) return;
  event.preventDefault();
  const proposalId = event.target.closest('.idea-card').dataset.id;
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
    toast('댓글을 등록했어요.');
  } catch (error) { button.disabled = false; toast(error.message || '댓글을 등록하지 못했어요.'); }
});

function selectComposerType(type) {
  state.composerType = type;
  elements.proposalType.value = type;
  $$('.type-option').forEach(button => button.classList.toggle('active', button.dataset.proposalType === type));
  const opinion = type === 'opinion';
  elements.composerTitle.textContent = opinion ? '어떤 학생 의견을 올릴까요?' : '어떤 급식이 먹고 싶나요?';
  elements.titleFieldLabel.innerHTML = opinion ? '학생 의견 <b>필수</b>' : '먹고 싶은 메뉴 <b>필수</b>';
  elements.title.placeholder = opinion ? '예: 점심시간에 신청곡을 틀어주세요' : '예: 치킨마요 덮밥';
}

function openComposer(type = state.kind) {
  selectComposerType(type);
  elements.author.value = state.name || '';
  elements.formError.hidden = true;
  elements.formError.textContent = '';
  elements.composer.showModal();
  requestAnimationFrame(() => elements.title.focus());
}

$$('[data-open-composer]').forEach(button => button.addEventListener('click', () => openComposer(state.kind)));
$$('[data-open-opinion]').forEach(button => button.addEventListener('click', () => openComposer('opinion')));
$$('[data-close-modal]').forEach(button => button.addEventListener('click', () => elements.composer.close()));
$$('.type-option').forEach(button => button.addEventListener('click', () => selectComposerType(button.dataset.proposalType)));
$('#identityButton').addEventListener('click', () => {
  elements.identityInput.value = state.name || '';
  elements.identityDialog.showModal();
  requestAnimationFrame(() => elements.identityInput.select());
});
$$('[data-close-identity]').forEach(button => button.addEventListener('click', () => elements.identityDialog.close()));

elements.proposalForm.addEventListener('submit', async event => {
  event.preventDefault();
  elements.formError.hidden = true;
  elements.formError.textContent = '';
  elements.submit.disabled = true;
  elements.submit.textContent = '올리는 중…';
  try {
    const author = await ensureName(elements.author.value);
    await backend.publishProposal({ title: elements.title.value, type: elements.proposalType.value, author });
    elements.proposalForm.reset();
    selectComposerType('meal');
    elements.composer.close();
    toast('의견이 등록됐어요!');
    await load({ quiet: true });
  } catch (error) {
    const message = error.message || '올리지 못했어요. 인터넷 연결을 확인해 주세요.';
    elements.formError.textContent = message;
    elements.formError.hidden = false;
    toast(message);
  }
  finally { elements.submit.disabled = false; elements.submit.textContent = '의견 등록하기'; }
});

elements.proposalForm.addEventListener('input', () => {
  elements.formError.hidden = true;
  elements.formError.textContent = '';
});

elements.identityForm.addEventListener('submit', async event => {
  event.preventDefault();
  try { await ensureName(elements.identityInput.value); elements.identityDialog.close(); toast('표시 이름을 바꿨어요.'); }
  catch (error) { toast(error.message || '이름을 바꾸지 못했어요.'); }
});

$$('[data-kind]').forEach(button => button.addEventListener('click', () => {
  $$('[data-kind]').forEach(item => item.classList.toggle('active', item === button));
  state.kind = button.dataset.kind;
  const url = new URL(location.href);
  url.searchParams.set('tab', state.kind);
  history.replaceState({}, '', url);
  render();
}));
$$('[data-view-opinions]').forEach(button => button.addEventListener('click', () => {
  state.kind = 'opinion';
  $$('[data-kind]').forEach(item => item.classList.toggle('active', item.dataset.kind === 'opinion'));
  const url = new URL(location.href);
  url.searchParams.set('tab', 'opinion');
  url.hash = 'ideas';
  history.replaceState({}, '', url);
  render();
  $('#ideas').scrollIntoView({ behavior: 'smooth' });
}));
elements.sort.addEventListener('change', () => { state.sort = elements.sort.value; render(); });
elements.refresh.addEventListener('click', async () => { await load({ quiet: true }); toast('최신 투표로 새로고침했어요.'); });
$('#copyLinkButton').addEventListener('click', async () => {
  const shareData = { title: '서운픽', text: '서운중 메뉴와 의견 투표에 참여해 줘!', url: location.origin + location.pathname };
  try {
    if (navigator.share) await navigator.share(shareData);
    else { await navigator.clipboard.writeText(shareData.url); toast('링크를 복사했어요.'); }
  } catch { /* Sharing was cancelled. */ }
});

window.addEventListener('DOMContentLoaded', async () => {
  const localName = localStorage.getItem('school-meal-vote:name') || '';
  setNameLocally(localName);
  $$('[data-kind]').forEach(button => button.classList.toggle('active', button.dataset.kind === state.kind));
  if (opinionDestination && requestedKind !== 'opinion') {
    const url = new URL(location.href);
    url.searchParams.set('tab', 'opinion');
    history.replaceState({}, '', url);
  }
  updateModeCopy();
  updateBoardCopy([]);
  renderWinner();
  backend.getName().then(name => {
    if (name) { localStorage.setItem('school-meal-vote:name', name); setNameLocally(name); }
  }).catch(() => {});
  await load();
  scheduleWeeklyReset();
});
