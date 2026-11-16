import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'https://cdn.jsdelivr.net/npm/nostr-tools@2/+esm';

const KEY_STORAGE = 'school-meal-vote:identity:v1';
const APP_TAG = 'school-meal-vote-global-v1';
const PROFILE_KIND = 30078;
const PROPOSAL_KIND = 30023;
const DELETE_KIND = 5;
const PROFILE_D = 'school-meal-profile';
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.band'];
const KST_OFFSET_SECONDS = 9 * 60 * 60;

const bytesToHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const hexToBytes = hex => new Uint8Array((hex.match(/.{2}/g) || []).map(byte => Number.parseInt(byte, 16)));
const now = () => Math.floor(Date.now() / 1000);
const tagValue = (event, name) => event.tags?.find(tag => tag[0] === name)?.[1] || '';
const normalizeName = name => String(name || '').trim().normalize('NFKC').toLocaleLowerCase();

function currentWeekStart() {
  const shifted = new Date(Date.now() + KST_OFFSET_SECONDS * 1000);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - daysSinceMonday);
  shifted.setUTCHours(0, 0, 0, 0);
  return Math.floor(shifted.getTime() / 1000) - KST_OFFSET_SECONDS;
}

function currentWeekId() {
  return new Date((currentWeekStart() + KST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

function loadSecretKey() {
  try {
    const stored = localStorage.getItem(KEY_STORAGE);
    if (/^[0-9a-f]{64}$/i.test(stored || '')) return hexToBytes(stored);
  } catch { /* A session key still lets the page work. */ }
  const secret = generateSecretKey();
  try { localStorage.setItem(KEY_STORAGE, bytesToHex(secret)); } catch { /* Storage can be disabled. */ }
  return secret;
}

function queryRelay(url, filters, timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    const events = [];
    const subscription = `meal-${crypto.randomUUID().slice(0, 8)}`;
    const socket = new WebSocket(url);
    let settled = false;
    const finish = complete => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(['CLOSE', subscription]));
        socket.close();
      } catch { /* Already closed. */ }
      complete ? resolve(events) : reject(new Error('공유 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'));
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, ...filters])));
    socket.addEventListener('message', message => {
      try {
        const data = JSON.parse(message.data);
        if (data[0] === 'EVENT' && data[1] === subscription && verifyEvent(data[2])) events.push(data[2]);
        if (data[0] === 'EOSE' && data[1] === subscription) finish(true);
      } catch { /* Ignore malformed data. */ }
    });
    socket.addEventListener('error', () => finish(false));
    socket.addEventListener('close', () => finish(false));
  });
}

async function queryRelays(filters) {
  const results = await Promise.allSettled(RELAYS.map(relay => queryRelay(relay, filters)));
  if (!results.some(result => result.status === 'fulfilled')) throw new Error('공유 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const unique = new Map();
  results.forEach(result => {
    if (result.status === 'fulfilled') result.value.forEach(event => unique.set(event.id, event));
  });
  return [...unique.values()];
}

function publishRelay(url, event, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { socket.close(); } catch { /* Already closed. */ }
      error ? reject(error) : resolve();
    };
    const timer = window.setTimeout(() => finish(new Error('공유 서버가 응답하지 않았어요.')), timeoutMs);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      try {
        const data = JSON.parse(message.data);
        if (data[0] === 'OK' && data[1] === event.id) finish(data[2] ? null : new Error(data[3] || '공유 서버가 내용을 거절했어요.'));
      } catch { /* Wait for a valid response. */ }
    });
    socket.addEventListener('error', () => finish(new Error('공유 서버에 연결하지 못했어요.')));
  });
}

async function publish(event) {
  const attempts = await Promise.allSettled(RELAYS.map(relay => publishRelay(relay, event)));
  if (!attempts.some(result => result.status === 'fulfilled')) throw new Error('업로드하지 못했어요. 인터넷 연결을 확인해 주세요.');
  return event;
}

function profileMap(events) {
  const latest = new Map();
  events.filter(event => event.kind === PROFILE_KIND && tagValue(event, 'd') === PROFILE_D).forEach(event => {
    const previous = latest.get(event.pubkey);
    if (!previous || previous.created_at < event.created_at) latest.set(event.pubkey, event);
  });
  const profiles = new Map();
  latest.forEach((event, author) => {
    try {
      const name = String(JSON.parse(event.content).displayName || '').trim();
      if (name.length >= 2) profiles.set(author, name.slice(0, 20));
    } catch { /* Ignore invalid profile. */ }
  });
  return profiles;
}

function safeProposal(event, profiles) {
  try {
    const value = JSON.parse(event.content);
    const title = String(value.title || '').trim();
    const type = value.type === 'opinion' ? 'opinion' : 'meal';
    if (title.length < 2 || title.length > 80) return null;
    if (title.startsWith('검증 후 삭제할 의견')) return null;
    return {
      id: event.id,
      authorId: event.pubkey,
      author: profiles.get(event.pubkey) || String(value.author || '급식친구').slice(0, 20),
      title,
      type,
      createdAt: event.created_at,
      coordinate: `${PROPOSAL_KIND}:${event.pubkey}:${tagValue(event, 'd')}`
    };
  } catch { return null; }
}

export function createBackend() {
  const secretKey = loadSecretKey();
  const pubkey = getPublicKey(secretKey);
  const sign = template => finalizeEvent(template, secretKey);
  const reactionTimes = new Map();
  const myActiveVotes = new Set();

  async function loadProfiles() {
    const events = await queryRelays([{ kinds: [PROFILE_KIND], '#d': [PROFILE_D], '#t': [APP_TAG], limit: 1000 }]);
    return profileMap(events);
  }

  return {
    me() { return pubkey; },

    async getName() {
      return (await loadProfiles()).get(pubkey) || '';
    },

    async setName(displayName) {
      const name = String(displayName || '').trim();
      if (name.length < 2 || name.length > 20) throw new Error('이름은 2~20자로 입력해 주세요.');
      const profiles = await loadProfiles();
      const wanted = normalizeName(name);
      for (const [author, existing] of profiles) {
        if (author !== pubkey && normalizeName(existing) === wanted) throw new Error('이미 사용 중인 이름이에요. 다른 이름을 골라주세요.');
      }
      const event = sign({ kind: PROFILE_KIND, created_at: now(), tags: [['d', PROFILE_D], ['t', APP_TAG]], content: JSON.stringify({ displayName: name }) });
      await publish(event);
      return name;
    },

    async loadProposals() {
      const weekStart = currentWeekStart();
      const events = await queryRelays([
        { kinds: [PROFILE_KIND], '#d': [PROFILE_D], '#t': [APP_TAG], limit: 1000 },
        { kinds: [PROPOSAL_KIND], '#t': [APP_TAG], since: weekStart, limit: 1000 },
        { kinds: [DELETE_KIND], '#t': [APP_TAG], '#k': [String(PROPOSAL_KIND)], since: weekStart, limit: 2000 }
      ]);
      const profiles = profileMap(events);
      const deletedIds = new Set();
      const deletedCoordinates = new Set();
      events.filter(event => event.kind === DELETE_KIND).forEach(event => {
        event.tags.forEach(tag => {
          if (tag[0] === 'e') deletedIds.add(`${event.pubkey}:${tag[1]}`);
          if (tag[0] === 'a') deletedCoordinates.add(`${event.pubkey}:${tag[1]}`);
        });
      });
      return events
        .filter(event => event.kind === PROPOSAL_KIND && tagValue(event, 't') === APP_TAG && event.created_at >= weekStart)
        .filter(event => !deletedIds.has(`${event.pubkey}:${event.id}`) && !deletedCoordinates.has(`${event.pubkey}:${PROPOSAL_KIND}:${event.pubkey}:${tagValue(event, 'd')}`))
        .map(event => safeProposal(event, profiles))
        .filter(Boolean);
    },

    async publishProposal(value) {
      const title = String(value.title || '').trim();
      const author = String(value.author || '').trim();
      const type = value.type === 'opinion' ? 'opinion' : 'meal';
      if (title.length < 2 || title.length > 80) throw new Error(type === 'opinion' ? '의견을 2~80자로 입력해 주세요.' : '메뉴 이름을 2~80자로 입력해 주세요.');
      if (author.length < 2 || author.length > 20) throw new Error('이름은 2~20자로 입력해 주세요.');
      const event = sign({
        kind: PROPOSAL_KIND,
        created_at: now(),
        tags: [['d', crypto.randomUUID()], ['t', APP_TAG], ['title', title], ['type', type], ['week', currentWeekId()]],
        content: JSON.stringify({ title, type, author, week: currentWeekId() })
      });
      return publish(event);
    },

    async deleteProposal(proposal) {
      if (proposal.authorId !== pubkey) throw new Error('내가 올린 글만 삭제할 수 있어요.');
      const event = sign({
        kind: DELETE_KIND,
        created_at: now(),
        tags: [['e', proposal.id], ['a', proposal.coordinate], ['k', String(PROPOSAL_KIND)], ['t', APP_TAG]],
        content: 'Deleted meal proposal'
      });
      return publish(event);
    },

    async loadSocial(proposalIds) {
      const ids = [...new Set(proposalIds.filter(id => /^[0-9a-f]{64}$/.test(id)))].slice(0, 500);
      const result = new Map(ids.map(id => [id, { likes: 0, dislikes: 0, mine: 0, comments: [] }]));
      if (!ids.length) return result;
      const events = await queryRelays([
        { kinds: [PROFILE_KIND, 1], '#t': [APP_TAG], '#e': ids, limit: 5000 },
        { kinds: [DELETE_KIND], '#t': [APP_TAG], '#r': ids, limit: 5000 }
      ]);
      const deletedComments = new Set();
      events.filter(event => event.kind === DELETE_KIND).forEach(event => {
        event.tags.filter(tag => tag[0] === 'e').forEach(tag => deletedComments.add(`${event.pubkey}:${tag[1]}`));
      });
      const reactions = new Map();
      for (const event of events) {
        const proposalId = tagValue(event, 'e');
        if (!result.has(proposalId) || tagValue(event, 't') !== APP_TAG) continue;
        try {
          const value = JSON.parse(event.content);
          if (event.kind === PROFILE_KIND && tagValue(event, 'd') === `meal-vote:${proposalId}` && [-1, 0, 1].includes(value.vote)) {
            const key = `${proposalId}:${event.pubkey}`;
            const previous = reactions.get(key);
            if (!previous || previous.created_at < event.created_at || (previous.created_at === event.created_at && event.id < previous.id)) reactions.set(key, { vote: value.vote, created_at: event.created_at, id: event.id, author: event.pubkey });
          }
          if (event.kind === 1 && value.type === 'meal-comment' && typeof value.body === 'string' && value.body.trim() && value.body.length <= 300 && !deletedComments.has(`${event.pubkey}:${event.id}`)) {
            result.get(proposalId).comments.push({ id: event.id, authorId: event.pubkey, name: String(value.name || '급식친구').slice(0, 20), body: value.body.trim(), createdAt: event.created_at });
          }
        } catch { /* Ignore unrelated events. */ }
      }
      myActiveVotes.clear();
      reactions.forEach((reaction, key) => {
        const proposalId = key.slice(0, 64);
        const social = result.get(proposalId);
        if (!social) return;
        if (reaction.vote === 1) social.likes += 1;
        if (reaction.vote === -1) social.dislikes += 1;
        if (reaction.author === pubkey) {
          social.mine = reaction.vote;
          if (reaction.vote === 0) myActiveVotes.delete(proposalId);
          else myActiveVotes.add(proposalId);
          reactionTimes.set(proposalId, Math.max(reactionTimes.get(proposalId) || 0, reaction.created_at));
        }
      });
      result.forEach(social => {
        social.likes = Math.min(2000, social.likes);
        social.dislikes = Math.min(2000, social.dislikes);
        social.comments.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      });
      return result;
    },

    async vote(proposalId, value) {
      if (!/^[0-9a-f]{64}$/.test(proposalId) || ![-1, 0, 1].includes(value)) throw new Error('올바르지 않은 투표예요.');
      if (value !== 0 && !myActiveVotes.has(proposalId) && myActiveVotes.size >= 2) throw new Error('투표권 2표를 모두 사용했어요. 기존 투표를 취소하면 다시 투표할 수 있어요.');
      const createdAt = Math.max(now(), (reactionTimes.get(proposalId) || 0) + 1);
      const event = sign({
        kind: PROFILE_KIND,
        created_at: createdAt,
        tags: [['d', `meal-vote:${proposalId}`], ['t', APP_TAG], ['e', proposalId]],
        content: JSON.stringify({ vote: value })
      });
      await publish(event);
      if (value === 0) myActiveVotes.delete(proposalId);
      else myActiveVotes.add(proposalId);
      reactionTimes.set(proposalId, createdAt);
      return event;
    },

    async addComment(proposalId, body, name) {
      const text = String(body || '').trim();
      const author = String(name || '').trim();
      if (!/^[0-9a-f]{64}$/.test(proposalId) || !text || text.length > 300) throw new Error('댓글은 1~300자로 입력해 주세요.');
      if (author.length < 2 || author.length > 20) throw new Error('이름을 먼저 정해 주세요.');
      const event = sign({
        kind: 1,
        created_at: now(),
        tags: [['t', APP_TAG], ['e', proposalId]],
        content: JSON.stringify({ type: 'meal-comment', body: text, name: author })
      });
      return publish(event);
    }
  };
}
