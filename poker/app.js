(() => {
  'use strict';

  const SUITS = [
    { key: 's', symbol: '♠', red: false },
    { key: 'h', symbol: '♥', red: true },
    { key: 'd', symbol: '♦', red: true },
    { key: 'c', symbol: '♣', red: false }
  ];
  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const POSITIONS = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
  const HERO_SEAT = 3;
  const BOT_NAMES = ['RiverBot', 'Moss', 'Cobalt', 'Juniper', 'North'];
  const DEFAULT_STACK = 100;
  const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const DEVICE_ID_KEY = 'riverlab:poker:device-id:v1';
  const HISTORY_KEY_PREFIX = 'riverlab:poker:history:v1:';
  const AI_STYLES = [
    { key: 'tight-passive', tightness: 0.08, aggression: -0.16 },
    { key: 'tight-aggressive', tightness: 0.08, aggression: 0.18 },
    { key: 'loose-passive', tightness: -0.07, aggression: -0.14 },
    { key: 'loose-aggressive', tightness: -0.07, aggression: 0.22 },
    { key: 'balanced', tightness: 0, aggression: 0 }
  ];
  const FH_RANGES = window.FULLHOUSE_RANGES || { openCharts: {}, defense: {}, vs3Bet: {}, openSizeBb: {} };
  const CATEGORY_KEYS = ['highCard', 'onePair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
  const byId = (id) => document.getElementById(id);
  const t = (key, variables) => window.PokerI18n.t(key, variables);

  const ui = {
    app: byId('app'),
    seats: byId('seats'), board: byId('board'), pot: byId('pot'),
    tableStatus: byId('table-status'), handId: byId('hand-id'),
    streetPill: byId('street-pill'), controls: byId('controls'),
    fold: byId('fold-btn'), pass: byId('pass-btn'), call: byId('call-btn'),
    raise: byId('raise-btn'), raiseInput: byId('raise-input'),
    preflopFilter: byId('preflop-filter'), preflopRange: byId('preflop-extra'),
    rangeExtraValue: byId('range-extra-value'), rangePosition: byId('range-position'),
    rangeBase: byId('range-base'), rangeCurrent: byId('range-current'),
    nextHand: byId('next-hand'), handCount: byId('hands'), accuracy: byId('accuracy'),
    sessionResult: byId('session-result'), nodeDetails: byId('node-details'),
    decisionBox: byId('decision-box'), strategyTitle: byId('strategy-title'),
    strategyList: byId('strategy-list'), feedbackState: byId('feedback-state'),
    footerNote: byId('footer-note'), deviceId: byId('device-id'),
    historyCount: byId('history-count'), historyNet: byId('history-net'),
    historyMatch: byId('history-match'), historyList: byId('history-list')
  };

  const state = {
    mode: 'full', handNumber: 0, players: [], deck: [], board: [], street: 'preflop',
    currentBet: 0, minRaise: 1, pending: [], actedSinceFullRaise: new Set(),
    buttonSeat: 0, currentActor: null, humanTurn: false, handComplete: false, handEnded: false,
    currentReview: null, resultText: '', resultDescriptor: null, actionLog: [], aiStyles: null, playerStats: {},
    decisions: 0, matchedFrequencyTotal: 0, sessionNet: 0, completedHands: 0,
    lastAggressor: null, spotDecisionOnly: false, handStartStack: 100,
    historyRecordedHand: 0,
    preflopExtraPercent: 0
  };

  const deviceId = loadOrCreateDeviceId();
  let historyItems = loadHistory();
  let historyExpiryTimer = null;

  function makeDeviceId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = randomInt(256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function loadOrCreateDeviceId() {
    try {
      const stored = window.localStorage.getItem(DEVICE_ID_KEY);
      if (stored) return stored;
      const created = makeDeviceId();
      window.localStorage.setItem(DEVICE_ID_KEY, created);
      return created;
    } catch (_) {
      return makeDeviceId();
    }
  }

  function pruneHistory(items, now = Date.now()) {
    return items.filter((item) => item && Number.isFinite(item.timestamp) && item.timestamp > now - HISTORY_TTL_MS && item.timestamp <= now
      && ['full', 'preflop', 'postflop'].includes(item.mode) && typeof item.position === 'string'
      && Array.isArray(item.cards) && Array.isArray(item.board) && typeof item.result === 'string');
  }

  function loadHistory() {
    try {
      const raw = window.localStorage.getItem(`${HISTORY_KEY_PREFIX}${deviceId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      const clean = pruneHistory(Array.isArray(parsed) ? parsed : []);
      window.localStorage.setItem(`${HISTORY_KEY_PREFIX}${deviceId}`, JSON.stringify(clean));
      return clean;
    } catch (_) {
      return [];
    }
  }

  function persistHistory() {
    try { window.localStorage.setItem(`${HISTORY_KEY_PREFIX}${deviceId}`, JSON.stringify(historyItems)); }
    catch (_) { /* The current page still keeps the history in memory if browser storage is unavailable. */ }
  }

  function scheduleHistoryExpiry() {
    if (historyExpiryTimer !== null) window.clearTimeout(historyExpiryTimer);
    historyExpiryTimer = null;
    if (!historyItems.length) return;
    const nextExpiry = historyItems.reduce((earliest, item) => Math.min(earliest, item.timestamp + HISTORY_TTL_MS), Infinity);
    const delay = Math.max(1, nextExpiry - Date.now() + 1);
    historyExpiryTimer = window.setTimeout(() => {
      historyExpiryTimer = null;
      const previousCount = historyItems.length;
      historyItems = pruneHistory(historyItems);
      if (historyItems.length !== previousCount) {
        persistHistory();
        renderHistory();
      } else {
        scheduleHistoryExpiry();
      }
    }, delay);
  }

  function recordCompletedHistory() {
    if (state.historyRecordedHand === state.handNumber) return;
    state.historyRecordedHand = state.handNumber;
    const heroPlayer = hero();
    const review = state.currentReview;
    const item = {
      timestamp: Date.now(),
      handNumber: state.handNumber,
      mode: state.mode,
      position: heroPlayer.position,
      cards: heroPlayer.cards.map(cardText),
      board: state.board.map(cardText),
      result: formatResultDescriptor(),
      resultKind: state.resultDescriptor?.kind || '',
      resultKey: state.resultDescriptor?.key || '',
      resultParams: state.resultDescriptor?.params || {},
      resultPrefixKey: state.resultDescriptor?.prefixKey || '',
      resultActionKey: state.resultDescriptor?.actionKey || '',
      resultActionTarget: state.resultDescriptor?.actionTarget || 0,
      action: review ? actionName(review.actionKey, review.actionTarget) : '',
      actionKey: review?.actionKey || '',
      actionTarget: review?.actionTarget || 0,
      matchPercent: review ? review.match : null,
      netBb: state.mode === 'full' ? roundChip(heroPlayer.chips - state.handStartStack) : null
    };
    historyItems = pruneHistory([...historyItems, item]);
    persistHistory();
    renderHistory();
  }

  function renderHistory() {
    if (!ui.historyList) return;
    const now = Date.now();
    historyItems = pruneHistory(historyItems, now);
    persistHistory();
    scheduleHistoryExpiry();
    ui.deviceId.textContent = deviceId.slice(0, 8).toUpperCase();
    ui.historyCount.textContent = String(historyItems.length);
    const fullResults = historyItems.filter((item) => Number.isFinite(item.netBb));
    const totalNet = roundChip(fullResults.reduce((sum, item) => sum + item.netBb, 0));
    ui.historyNet.textContent = `${totalNet > 0 ? '+' : ''}${fmt(totalNet)} bb`;
    ui.historyNet.dataset.result = totalNet > 0 ? 'positive' : totalNet < 0 ? 'negative' : 'even';
    const scored = historyItems.filter((item) => Number.isFinite(item.matchPercent));
    const averageMatch = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.matchPercent, 0) / scored.length) : null;
    ui.historyMatch.textContent = averageMatch === null ? '—' : `${averageMatch}%`;

    ui.historyList.replaceChildren();
    const recent = historyItems.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
    if (!recent.length) {
      const empty = document.createElement('li');
      empty.className = 'history-empty';
      empty.textContent = t('history.empty');
      ui.historyList.append(empty);
      return;
    }
    for (const item of recent) {
      const row = document.createElement('li');
      row.className = 'history-entry';
      const heading = document.createElement('div');
      heading.className = 'history-entry-heading';
      const context = document.createElement('span');
      context.textContent = `${new Intl.DateTimeFormat(window.PokerI18n.locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(item.timestamp)} · ${modeName(item.mode)} · ${item.position}`;
      const delta = document.createElement('strong');
      if (Number.isFinite(item.netBb)) {
        delta.textContent = `${item.netBb > 0 ? '+' : ''}${fmt(item.netBb)} bb`;
        delta.dataset.result = item.netBb > 0 ? 'positive' : item.netBb < 0 ? 'negative' : 'even';
      } else {
        delta.textContent = Number.isFinite(item.matchPercent) ? t('history.matched', { percent: Math.round(item.matchPercent) }) : t('history.trainingComplete');
      }
      heading.append(context, delta);
      const cards = document.createElement('div');
      cards.className = 'history-cards';
      cards.textContent = `${t('history.hand', { cards: item.cards.join(' ') })}${item.board.length ? ` · ${t('history.board', { cards: item.board.join(' ') })}` : ''}`;
      const result = document.createElement('div');
      result.className = 'history-result';
      const action = item.actionKey ? actionName(item.actionKey, item.actionTarget) : legacyActionLabel(item.action);
      const resultText = historyResultLabel(item);
      result.textContent = item.mode === 'full' && action ? `${action} · ${resultText}` : resultText;
      row.append(heading, cards, result);
      ui.historyList.append(row);
    }
  }

  function randomInt(max) {
    if (max <= 1) return 0;
    if (window.crypto && crypto.getRandomValues) {
      const limit = Math.floor(0x100000000 / max) * max;
      const values = new Uint32Array(1);
      let value;
      do { crypto.getRandomValues(values); value = values[0]; } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  }

  function makeDeck() {
    const cards = [];
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit: suit.key });
    return shuffleCards(cards);
  }

  function shuffleCards(cards) {
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  function draw() { return state.deck.pop(); }
  function rankText(rank) { return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank); }
  function suitData(suit) { return SUITS.find((item) => item.key === suit); }
  function cardText(card) { return `${rankText(card.rank)}${suitData(card.suit).symbol}`; }
  function cardMarkup(card, faceDown = false) {
    if (faceDown || !card) return `<div class="card back" aria-label="${t('card.hidden')}"></div>`;
    const data = suitData(card.suit);
    return `<div class="card${data.red ? ' red' : ''}" aria-label="${cardText(card)}"><span class="card-rank">${rankText(card.rank)}</span><span class="card-pip">${data.symbol}</span></div>`;
  }
  function fmt(number) {
    const rounded = Math.round((Number(number) + Number.EPSILON) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, '');
  }
  function roundChip(number) { return Math.round(number * 2) / 2; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function sumPot() { return state.players.reduce((sum, player) => sum + player.committed, 0); }
  function alivePlayers() { return state.players.filter((player) => !player.folded); }
  function canAct(player) { return player && !player.folded && !player.allIn && player.chips > 0; }
  function hero() { return state.players.find((player) => player.human); }
  function streetName(street) {
    return t(({ preflop: 'street.preflop', flop: 'street.flop', turn: 'street.turn', river: 'street.river' })[street] || 'street.showdown');
  }
  function modeName(mode = state.mode) {
    return t(({ full: 'mode.full', preflop: 'mode.preflop', postflop: 'mode.postflop' })[mode] || 'mode.full');
  }
  function categoryName(index) { return t(`hand.${CATEGORY_KEYS[index] || CATEGORY_KEYS[0]}`); }
  function formatResultDescriptor(descriptor = state.resultDescriptor) {
    if (!descriptor) return state.resultText || '';
    if (descriptor.kind === 'training') {
      const action = descriptor.actionKey ? actionName(descriptor.actionKey, descriptor.actionTarget) : t('result.noDecision');
      return t('result.trainingFinished', { prefix: t(descriptor.prefixKey), action });
    }
    const params = { ...(descriptor.params || {}) };
    if (params.handKey) params.hand = t(params.handKey);
    return t(descriptor.key, params);
  }

  function legacyActionLabel(value) {
    if (!value || window.PokerI18n.language === 'zh-CN') return value || '';
    if (value === '弃牌') return t('action.fold');
    if (value === '过牌') return t('action.check');
    if (value === '全下') return t('action.allin');
    if (value === '跟注') return t('action.call');
    let match = value.match(/^跟注\s+(.+)$/);
    if (match) return t('action.callAmount', { amount: match[1] });
    match = value.match(/^下注至\s+(.+)\s+bb$/);
    if (match) return t('action.betTo', { amount: match[1] });
    match = value.match(/^加注至\s+(.+)\s+bb$/);
    if (match) return t('action.raiseTo', { amount: match[1] });
    return value;
  }

  function legacyResultLabel(value) {
    if (!value || window.PokerI18n.language === 'zh-CN') return value || '';
    const exact = {
      '本手结束': t('result.handComplete'),
      '本手无决策': t('result.noDecision'),
      '翻前节点结束': t('result.preflopNodeEnded'),
      '训练节点完成': t('result.trainingNodeEnded'),
      '翻前专项完成': t('result.preflopModeDone'),
      '翻后专项完成': t('result.postflopModeDone')
    };
    if (exact[value]) return exact[value];
    let match = value.match(/^你赢下\s+(.+)\s+bb$/);
    if (match) return t('result.youWin', { amount: match[1] });
    match = value.match(/^(.+) 赢下底池$/);
    if (match) return t('result.botWinsPot', { name: match[1] });
    match = value.match(/^摊牌平分 · 你拿回\s+(.+)\s+bb$/);
    if (match) return t('result.split', { amount: match[1] });
    match = value.match(/^你以(.+)赢下\s+(.+)\s+bb$/);
    if (match) return t('result.heroWins', { hand: legacyHandLabel(match[1]), amount: match[2] });
    match = value.match(/^(.+) 以(.+)赢下底池$/);
    if (match) return t('result.opponentWins', { name: match[1], hand: legacyHandLabel(match[2]) });
    return value.replace(' · 本手无决策', ` · ${t('result.noDecision')}`);
  }

  function legacyHandLabel(value) {
    const index = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'].indexOf(value);
    return index < 0 ? value : categoryName(index);
  }

  function historyResultLabel(item) {
    if (item.resultKind === 'training') {
      return formatResultDescriptor({
        kind: 'training', prefixKey: item.resultPrefixKey,
        actionKey: item.resultActionKey, actionTarget: item.resultActionTarget
      });
    }
    if (item.resultKey) return formatResultDescriptor({ key: item.resultKey, params: item.resultParams || {} });
    return legacyResultLabel(item.result);
  }
  function posIndex(position) { return Math.max(0, POSITIONS.indexOf(position)); }
  function selectedHeroPosition() {
    return POSITIONS[(state.handNumber - 1) % POSITIONS.length];
  }

  function assignPositions(heroPosition) {
    const positionIndex = posIndex(heroPosition);
    state.buttonSeat = (HERO_SEAT - positionIndex + 6) % 6;
    for (const player of state.players) {
      const offset = (player.seat - state.buttonSeat + 6) % 6;
      player.position = POSITIONS[offset];
    }
  }

  function sampleAIStyles() {
    return Array.from({ length: 5 }, () => AI_STYLES[randomInt(AI_STYLES.length)]);
  }

  function makePlayers(stack) {
    state.aiStyles = sampleAIStyles();
    const names = [BOT_NAMES[0], BOT_NAMES[1], BOT_NAMES[2], t('player.you'), BOT_NAMES[3], BOT_NAMES[4]];
    let botIndex = 0;
    state.players = names.map((name, seat) => ({
      id: `p${seat}`, seat, name, human: seat === HERO_SEAT, position: '',
      cards: [], chips: stack, committed: 0, streetBet: 0, folded: false,
      allIn: false, actionLabel: '', actionLabelKey: '', actionLabelParams: {},
      aiStyle: seat === HERO_SEAT ? null : state.aiStyles[botIndex++]
    }));
  }

  function preflopOrder() {
    return [3, 4, 5, 0, 1, 2].map((offset) => (state.buttonSeat + offset) % 6);
  }
  function postflopOrder(afterSeat = state.buttonSeat) {
    const order = Array.from({ length: 6 }, (_, index) => (afterSeat + index + 1) % 6);
    const buttonPlayer = state.players[state.buttonSeat];
    if (afterSeat === state.buttonSeat && alivePlayers().length === 2 && !buttonPlayer.folded) {
      return [state.buttonSeat, ...order.filter((seat) => seat !== state.buttonSeat)];
    }
    return order;
  }
  function playersAfter(seat) {
    return postflopOrder(seat).map((index) => state.players[index]);
  }
  function queueForStreet(street, afterSeat) {
    const order = street === 'preflop' ? preflopOrder().map((index) => state.players[index]) : postflopOrder(afterSeat).map((index) => state.players[index]);
    return order.filter(canAct).map((player) => player.id);
  }
  function positionLabel(position) { return position || '—'; }

  function setCommitment(player, amount) {
    const paid = Math.min(Math.max(0, amount), player.chips);
    player.chips = roundChip(player.chips - paid);
    player.streetBet = roundChip(player.streetBet + paid);
    player.committed = roundChip(player.committed + paid);
    if (player.chips <= 0.001) { player.chips = 0; player.allIn = true; }
    return paid;
  }

  function startNewHand() {
    state.handNumber += 1;
    state.handStartStack = DEFAULT_STACK;
    state.deck = makeDeck();
    state.board = [];
    state.street = 'preflop';
    state.currentBet = 0;
    state.minRaise = 1;
    state.pending = [];
    state.actedSinceFullRaise = new Set();
    state.currentActor = null;
    state.humanTurn = false;
    state.handComplete = false;
    state.handEnded = false;
    state.currentReview = null;
    state.resultText = '';
    state.resultDescriptor = null;
    state.lastAggressor = null;
    state.actionLog = [];
    state.spotDecisionOnly = state.mode !== 'full';
    makePlayers(state.handStartStack);
    const heroPosition = selectedHeroPosition();
    assignPositions(heroPosition);
    const heroPlayer = hero();
    heroPlayer.cards = state.mode === 'postflop' ? [draw(), draw()] : sampleFilteredHeroCards(heroPlayer.position);
    for (const player of state.players) {
      if (player !== heroPlayer) player.cards = [draw(), draw()];
    }

    if (state.mode === 'postflop') {
      setupPostflopSpot();
    } else {
      const smallBlind = state.players[(state.buttonSeat + 1) % 6];
      const bigBlind = state.players[(state.buttonSeat + 2) % 6];
      setCommitment(smallBlind, 0.5);
      setCommitment(bigBlind, 1);
      state.actionLog.push({ order: state.actionLog.length, street: 'preflop', seat: smallBlind.seat, playerId: smallBlind.id, position: smallBlind.position, action: 'small_blind', amount: 0.5 });
      state.actionLog.push({ order: state.actionLog.length, street: 'preflop', seat: bigBlind.seat, playerId: bigBlind.id, position: bigBlind.position, action: 'big_blind', amount: 1 });
      state.currentBet = Math.max(smallBlind.streetBet, bigBlind.streetBet);
      state.lastAggressor = bigBlind;
      state.pending = queueForStreet('preflop', state.buttonSeat);
    }
    render();
    progress(state.handNumber);
  }

  function setupPostflopSpot() {
    const heroPlayer = hero();
    const villainPosition = heroPlayer.position === 'BB' ? 'BTN' : 'BB';
    const villain = state.players.find((player) => player.position === villainPosition);
    for (const player of state.players) {
      if (player !== heroPlayer && player !== villain) player.folded = true;
    }
    setCommitment(heroPlayer, 3);
    setCommitment(villain, 3);
    const streets = ['flop', 'flop', 'flop', 'turn', 'river'];
    state.street = streets[randomInt(streets.length)];
    state.board = [draw(), draw(), draw()];
    if (state.street === 'turn' || state.street === 'river') state.board.push(draw());
    if (state.street === 'river') state.board.push(draw());
    state.currentBet = 0;
    state.minRaise = 1;
    state.actedSinceFullRaise = new Set();
    if (randomInt(2) === 0) {
      const bet = roundChip(Math.max(1, sumPot() * 0.33));
      setCommitment(villain, bet);
      state.currentBet = villain.streetBet;
      state.lastAggressor = villain;
      state.actedSinceFullRaise.add(villain.id);
    }
    state.pending = [heroPlayer.id];
  }

  function queueAfterFullRaise(actor) {
    return playersAfter(actor.seat).filter((player) => player.id !== actor.id && canAct(player)).map((player) => player.id);
  }

  function prunePending() {
    const seen = new Set();
    state.pending = state.pending.filter((id) => {
      const player = state.players.find((item) => item.id === id);
      if (!canAct(player) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function nextStreet() {
    if (state.street === 'preflop') {
      state.street = 'flop';
      state.board.push(draw(), draw(), draw());
    } else if (state.street === 'flop') {
      state.street = 'turn';
      state.board.push(draw());
    } else if (state.street === 'turn') {
      state.street = 'river';
      state.board.push(draw());
    } else {
      showdown();
      return;
    }
    for (const player of state.players) player.streetBet = 0;
    state.currentBet = 0;
    state.minRaise = 1;
    state.actedSinceFullRaise = new Set();
    state.pending = queueForStreet(state.street, state.buttonSeat);
    state.currentActor = null;
    if (alivePlayers().length <= 1) { awardUncontested(); return; }
    if (state.pending.length === 0) { runoutAndShowdown(); return; }
    render();
  }

  function progress(handId) {
    if (handId !== state.handNumber || state.handComplete) return;
    prunePending();
    if (alivePlayers().length <= 1) { awardUncontested(); return; }
    if (state.pending.length === 0) {
      if (state.mode === 'preflop' && state.street !== 'preflop') {
        finishTrainingSpot('result.preflopNodeEnded');
        return;
      }
      nextStreet();
      if (!state.handComplete && state.pending.length > 0) progress(handId);
      return;
    }

    const player = state.players.find((item) => item.id === state.pending[0]);
    state.currentActor = player.id;
    if (player.human) {
      state.humanTurn = true;
      render();
      return;
    }
    state.humanTurn = false;
    render();
    window.setTimeout(() => {
      if (handId !== state.handNumber || state.handComplete || state.currentActor !== player.id) return;
      const choice = chooseBotAction(player);
      applyAction(player, choice.action, choice.target);
      progress(handId);
    }, 330 + randomInt(220));
  }

  function finishTrainingSpot(prefixKey = 'result.trainingNodeEnded') {
    if (state.handComplete) return;
    state.handComplete = true;
    state.humanTurn = false;
    state.currentActor = null;
    state.completedHands += 1;
    state.resultDescriptor = {
      kind: 'training', prefixKey,
      actionKey: state.currentReview?.actionKey || '',
      actionTarget: state.currentReview?.actionTarget || 0
    };
    state.resultText = formatResultDescriptor();
    recordCompletedHistory();
    render();
  }

  function finishHand(descriptor = { key: 'result.handComplete', params: {} }) {
    if (state.handComplete) return;
    state.handComplete = true;
    state.handEnded = true;
    state.humanTurn = false;
    state.currentActor = null;
    state.completedHands += 1;
    const heroPlayer = hero();
    state.sessionNet = roundChip(state.sessionNet + heroPlayer.chips - state.handStartStack);
    state.resultDescriptor = { kind: 'simple', ...descriptor };
    state.resultText = formatResultDescriptor();
    recordCompletedHistory();
    render();
  }

  function awardUncontested() {
    const winner = alivePlayers()[0];
    if (!winner) { finishHand({ key: 'result.handComplete' }); return; }
    const amount = sumPot();
    winner.chips = roundChip(winner.chips + amount);
    finishHand(winner.human
      ? { key: 'result.youWin', params: { amount: fmt(amount) } }
      : { key: 'result.botWinsPot', params: { name: winner.name } });
  }

  function combinations(cards, choose, start = 0, selected = [], out = []) {
    if (selected.length === choose) { out.push(selected.slice()); return out; }
    for (let i = start; i <= cards.length - (choose - selected.length); i += 1) {
      selected.push(cards[i]);
      combinations(cards, choose, i + 1, selected, out);
      selected.pop();
    }
    return out;
  }

  function straightHigh(uniqueRanks) {
    const sorted = [...new Set(uniqueRanks)].sort((a, b) => b - a);
    if (sorted.includes(14)) sorted.push(1);
    for (let index = 0; index <= sorted.length - 5; index += 1) {
      if (sorted[index] - sorted[index + 4] === 4) return sorted[index];
    }
    return 0;
  }

  function scoreFive(cards) {
    const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
    const counts = new Map();
    for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const straight = straightHigh(ranks);
    if (flush && straight) return [8, straight];
    if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
    if (flush) return [5, ...ranks];
    if (straight) return [4, straight];
    if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map((group) => group[0]).sort((a, b) => b - a)];
    if (groups[0][1] === 2 && groups[1][1] === 2) {
      const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]).sort((a, b) => b - a);
      return [2, ...pairs, groups.find((group) => group[1] === 1)[0]];
    }
    if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map((group) => group[0]).sort((a, b) => b - a)];
    return [0, ...ranks];
  }

  function evaluateHand(cards) {
    if (cards.length < 5) {
      const sorted = cards.map((card) => card.rank).sort((a, b) => b - a);
      return [0, ...sorted];
    }
    let best = null;
    for (const combo of combinations(cards, 5)) {
      const score = scoreFive(combo);
      if (!best || compareScores(score, best) > 0) best = score;
    }
    return best;
  }

  function compareScores(left, right) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const difference = (left[index] || 0) - (right[index] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }

  function evaluateLabel(score) { return categoryName(score?.[0] || 0); }

  function rankCode(rank) { return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : rank === 10 ? 'T' : String(rank); }

  function canonicalHand(cards) {
    if (!cards || cards.length !== 2) return '';
    const [first, second] = cards;
    if (first.rank === second.rank) return `${rankCode(first.rank)}${rankCode(second.rank)}`;
    const high = first.rank > second.rank ? first : second;
    const low = first.rank > second.rank ? second : first;
    return `${rankCode(high.rank)}${rankCode(low.rank)}${high.suit === low.suit ? 's' : 'o'}`;
  }

  function expandFullhouseRange(rangeText) {
    const ranks = '23456789TJQKA';
    const values = Object.fromEntries([...ranks].map((rank, index) => [rank, index + 2]));
    const hands = new Set();
    const add = (high, low, suitedness) => {
      if (high === low) { hands.add(high + low); return; }
      for (const suit of suitedness === 'both' ? ['s', 'o'] : [suitedness]) hands.add(high + low + suit);
    };
    for (const raw of String(rangeText || '').split(',')) {
      const token = raw.trim();
      const pair = token.match(/^([2-9TJQKA])\1(\+)?$/);
      if (pair) {
        const start = values[pair[1]];
        for (const rank of ranks) if (values[rank] >= start) add(rank, rank, 'both');
        continue;
      }
      const hand = token.match(/^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?$/);
      if (!hand) continue;
      const high = hand[1];
      const low = hand[2];
      if (values[high] <= values[low]) continue;
      const mode = hand[3] || 'both';
      const end = hand[4] ? values[high] - 1 : values[low];
      for (const value of ranks) {
        if (values[value] >= values[low] && values[value] <= end) add(high, value, mode);
      }
    }
    return hands;
  }

  const FULLHOUSE_EQUITY_RANGES = Object.fromEntries(
    Object.entries(FH_RANGES.equityRangeTokens || {}).map(([name, tokens]) => [name, expandFullhouseRange(tokens)])
  );

  function normalizeActionDistribution(input) {
    const values = { raise: Math.max(0, input.raise || 0), call: Math.max(0, input.call || 0), fold: Math.max(0, input.fold || 0) };
    const total = values.raise + values.call + values.fold;
    if (total <= 0) return { raise: 0, call: 0, fold: 1 };
    for (const key of Object.keys(values)) values[key] /= total;
    return values;
  }

  function styleAdjustedDistribution(input, style, hand, position, context = 'facing') {
    const result = normalizeActionDistribution(input);
    const tightness = style?.tightness || 0;
    const aggression = style?.aggression || 0;
    const handStrength = hand?.length >= 2
      ? preflopStrengthFromCode(hand)
      : 0.5;
    if (tightness > 0) {
      const removedRaise = result.raise * Math.min(0.45, tightness * 1.7);
      const removedCall = result.call * Math.min(0.55, tightness * 2.2);
      result.raise -= removedRaise;
      result.call -= removedCall;
      result.fold += removedRaise + removedCall;
    } else if (tightness < 0) {
      const loosen = Math.abs(tightness);
      const addedCall = Math.min(result.fold, loosen * (context === 'open' ? 0.35 : 0.75) * (handStrength > 0.42 ? 1 : 0.35));
      result.call += addedCall;
      result.fold -= addedCall;
      if (result.raise === 0 && context === 'open') {
        const cutoff = ({ UTG: 0.64, HJ: 0.58, CO: 0.51, BTN: 0.46, SB: 0.45 })[position] || 0.62;
        result.raise = clamp((handStrength - cutoff) * 0.7, 0, 0.13);
        result.fold = Math.max(0, result.fold - result.raise);
      }
    }
    if (aggression > 0) {
      const move = Math.min(result.call, aggression * 0.65);
      result.call -= move;
      result.raise += move;
      if (context === 'open') {
        const extra = Math.min(result.fold, aggression * 0.12);
        result.fold -= extra;
        result.raise += extra;
      }
    } else if (aggression < 0) {
      const move = Math.min(result.raise, -aggression * (result.call > 0 ? 0.5 : 0.22));
      result.raise -= move;
      if (result.call > 0) result.call += move;
      else result.fold += move;
    }
    return normalizeActionDistribution(result);
  }

  function preflopStrengthFromCode(hand) {
    if (!hand) return 0.2;
    const cards = [...hand].slice(0, 2).map((code) => ({ rank: ({ T: 10, J: 11, Q: 12, K: 13, A: 14 })[code] || Number(code), suit: 's' }));
    if (cards.some((card) => !card.rank)) return 0.2;
    if (hand.endsWith('s') && cards.length === 2) cards[1].suit = 's';
    else if (hand.endsWith('o') && cards.length === 2) cards[1].suit = 'h';
    return preflopStrength(cards);
  }

  function fullhouseOpenDistribution(position, hand) {
    if (position === 'BB') return { raise: 0, call: 0, fold: 1 };
    const chart = FH_RANGES.openCharts?.[position] || {};
    const raise = chart[hand] || 0;
    if (position === 'SB') {
      if ((FH_RANGES.neverOpenHeadsUp || []).includes(hand)) return { raise: 0, call: 0, fold: 1 };
      if (raise > 0) return { raise, call: 0, fold: 1 - raise };
      return { raise: 0, call: 0.81, fold: 0.19 };
    }
    return { raise, call: 0, fold: 1 - raise };
  }

  function startingHandCode(cards) {
    const ordered = [...cards].sort((a, b) => b.rank - a.rank);
    const code = (rank) => rank === 10 ? 'T' : rankText(rank);
    if (ordered[0].rank === ordered[1].rank) return `${code(ordered[0].rank)}${code(ordered[1].rank)}`;
    return `${code(ordered[0].rank)}${code(ordered[1].rank)}${ordered[0].suit === ordered[1].suit ? 's' : 'o'}`;
  }

  function startingHandComboCount(hand) {
    return hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12;
  }

  function allStartingHandClasses() {
    const descendingRanks = RANKS.slice().reverse();
    const code = (rank) => rank === 10 ? 'T' : rankText(rank);
    const classes = [];
    for (let highIndex = 0; highIndex < descendingRanks.length; highIndex += 1) {
      const high = descendingRanks[highIndex];
      for (let lowIndex = highIndex; lowIndex < descendingRanks.length; lowIndex += 1) {
        const low = descendingRanks[lowIndex];
        if (high === low) classes.push(`${code(high)}${code(low)}`);
        else {
          classes.push(`${code(high)}${code(low)}s`);
          classes.push(`${code(high)}${code(low)}o`);
        }
      }
    }
    return classes;
  }

  function preflopNonFoldFrequency(position, hand) {
    if (position === 'BB') {
      const defense = FH_RANGES.defense?.lateBB?.[hand];
      return defense ? clamp((defense.raise || 0) + (defense.call || 0), 0, 1) : 0;
    }
    const distribution = fullhouseOpenDistribution(position, hand);
    return clamp(distribution.raise + distribution.call, 0, 1);
  }

  function preflopRangeProfile(position, extraPercent = state.preflopExtraPercent) {
    const handClasses = allStartingHandClasses();
    const frequencies = new Map();
    let baseMass = 0;
    for (const hand of handClasses) {
      const frequency = preflopNonFoldFrequency(position, hand);
      frequencies.set(hand, frequency);
      baseMass += frequency * startingHandComboCount(hand);
    }

    let extraMass = Math.min(1326 - baseMass, baseMass * extraPercent / 100);
    const outsideRange = handClasses
      .filter((hand) => frequencies.get(hand) <= 0)
      .sort((a, b) => preflopStrengthFromCode(b) - preflopStrengthFromCode(a));
    for (const hand of outsideRange) {
      if (extraMass <= 0.0001) break;
      const combos = startingHandComboCount(hand);
      const addedFrequency = Math.min(1, extraMass / combos);
      frequencies.set(hand, addedFrequency);
      extraMass -= addedFrequency * combos;
    }

    const totalMass = [...frequencies].reduce((sum, [hand, frequency]) => sum + frequency * startingHandComboCount(hand), 0);
    return { frequencies, baseMass, totalMass };
  }

  function sampleFilteredHeroCards(position) {
    const profile = preflopRangeProfile(position);
    if (profile.totalMass <= 0) return [draw(), draw()];

    for (let attempt = 0; attempt < 2048; attempt += 1) {
      const cards = [draw(), draw()];
      const frequency = profile.frequencies.get(startingHandCode(cards)) || 0;
      if (randomInt(1000000) < frequency * 1000000) return cards;
      state.deck.push(...cards);
      shuffleCards(state.deck);
    }

    const candidates = [];
    let totalWeight = 0;
    for (let first = 0; first < state.deck.length; first += 1) {
      for (let second = first + 1; second < state.deck.length; second += 1) {
        const frequency = profile.frequencies.get(startingHandCode([state.deck[first], state.deck[second]])) || 0;
        if (frequency <= 0) continue;
        candidates.push({ first, second, frequency });
        totalWeight += frequency;
      }
    }
    if (!candidates.length) return [draw(), draw()];
    let target = (randomInt(1000000) / 1000000) * totalWeight;
    const selected = candidates.find((item) => (target -= item.frequency) < 0) || candidates[candidates.length - 1];
    const cards = [state.deck[selected.first], state.deck[selected.second]];
    state.deck.splice(selected.second, 1);
    state.deck.splice(selected.first, 1);
    return cards;
  }

  function percentageText(value) {
    return `${Math.round(value * 10) / 10}%`;
  }

  function renderPreflopFilter() {
    const player = hero();
    const position = player?.position || selectedHeroPosition();
    const profile = preflopRangeProfile(position);
    ui.app.classList.toggle('postflop-mode', state.mode === 'postflop');
    ui.preflopRange.value = String(state.preflopExtraPercent);
    ui.rangeExtraValue.textContent = t('range.gtoExtra', { percent: state.preflopExtraPercent });
    ui.rangePosition.textContent = position === 'BB' ? t('range.bbOpen') : `${position} · ${t('range.open')}`;
    ui.rangeBase.textContent = percentageText(profile.baseMass / 1326 * 100);
    ui.rangeCurrent.textContent = percentageText(profile.totalMass / 1326 * 100);
  }

  function fullhouseDefenseDistribution(openerPosition, defenderPosition, hand) {
    const tier = openerPosition === 'UTG' ? 'early' : openerPosition === 'HJ' ? 'middle' : 'late';
    const order = { UTG: 0, HJ: 1, CO: 2, BTN: 3, SB: 4, BB: 5 };
    const role = defenderPosition === 'BB' ? 'BB'
      : defenderPosition === 'SB' || (order[defenderPosition] ?? 0) < (order[openerPosition] ?? 0) ? 'OOP' : 'IP';
    return FH_RANGES.defense?.[`${tier}${role}`]?.[hand] || { raise: 0, call: 0, fold: 1 };
  }

  function isAggressiveAction(action) { return action === 'raise' || action === 'bet' || action === 'all_in'; }

  function playerActionStats(player) {
    return state.playerStats[player.id] || { actions: 0, raises: 0, allins: 0, facedBet: 0, callVsBet: 0 };
  }

  function isConfirmedPassive(player) {
    const stats = playerActionStats(player);
    return stats.actions >= 20 && (stats.raises + stats.allins) / stats.actions < 0.10
      && stats.facedBet > 0 && stats.callVsBet / stats.facedBet >= 0.40;
  }

  function isManiac(player) {
    const stats = playerActionStats(player);
    return (stats.allins >= 5 && stats.allins / Math.max(1, stats.actions) >= 0.90)
      || (stats.actions >= 10 && (stats.raises + stats.allins) / stats.actions >= 0.85);
  }

  function fullhouseVillainActions(opponent) {
    const summary = { voluntaryPre: false, opened: false, threeBet: false, fourBet: false, raisedPost: false, continuedPost: false };
    let raisesSeen = 0;
    for (const event of state.actionLog) {
      if (event.street === 'preflop') {
        if (event.playerId === opponent.id && ['call', 'raise', 'bet', 'all_in'].includes(event.action)) summary.voluntaryPre = true;
        if (isAggressiveAction(event.action)) {
          if (event.playerId === opponent.id) {
            if (raisesSeen === 0) summary.opened = true;
            else if (raisesSeen === 1) summary.threeBet = true;
            else summary.fourBet = true;
          }
          raisesSeen += 1;
        }
      } else if (event.playerId === opponent.id) {
        if (isAggressiveAction(event.action)) summary.raisedPost = true;
        if (['call', 'raise', 'bet', 'all_in'].includes(event.action)) summary.continuedPost = true;
      }
    }
    return summary;
  }

  function fullhouseRangeName(opponent) {
    if (isManiac(opponent)) return 'UNKNOWN';
    const actions = fullhouseVillainActions(opponent);
    const preflopRange = actions.fourBet ? 'NUTTED'
      : actions.threeBet ? 'THREEBET'
        : actions.opened ? (({ UTG: 'OPEN_EARLY', HJ: 'OPEN_MIDDLE', CO: 'OPEN_LATE', BTN: 'OPEN_LATE', SB: 'OPEN_LATE' })[opponent.position] || 'OPEN_MIDDLE')
          : actions.voluntaryPre ? 'WIDE' : 'UNKNOWN';
    const passive = isConfirmedPassive(opponent);
    if (state.board.length >= 3 && actions.raisedPost && passive) return preflopRange === 'UNKNOWN' ? 'WIDE' : preflopRange;
    if (state.board.length >= 3 && actions.raisedPost) return 'THREEBET';
    if (actions.opened || actions.threeBet || actions.fourBet) {
      if (passive && state.board.length < 3) return 'NUTTED';
    }
    return preflopRange;
  }

  function fullhouseComboPool(unseen, rangeName) {
    if (rangeName === 'UNKNOWN') return null;
    const handRange = FULLHOUSE_EQUITY_RANGES[rangeName];
    if (!handRange) return null;
    const combos = [];
    for (let first = 0; first < unseen.length; first += 1) {
      for (let second = first + 1; second < unseen.length; second += 1) {
        if (handRange.has(canonicalHand([unseen[first], unseen[second]]))) combos.push([unseen[first], unseen[second]]);
      }
    }
    return combos.length ? combos : null;
  }

  function drawFullhouseCombo(pool, rangePool) {
    if (!rangePool) {
      if (pool.length < 2) return null;
      const firstIndex = randomInt(pool.length);
      let secondIndex = randomInt(pool.length - 1);
      if (secondIndex >= firstIndex) secondIndex += 1;
      return { firstIndex, secondIndex, cards: [pool[firstIndex], pool[secondIndex]] };
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cards = rangePool[randomInt(rangePool.length)];
      const firstIndex = pool.indexOf(cards[0]);
      const secondIndex = pool.indexOf(cards[1]);
      if (firstIndex >= 0 && secondIndex >= 0) return { firstIndex, secondIndex, cards };
    }
    return null;
  }

  function runoutEquity(player, iterations = 28, ignoreRanges = false) {
    const opponents = alivePlayers().filter((item) => item.id !== player.id);
    if (opponents.length <= 0) return 1;
    const known = new Set([...player.cards, ...state.board].map((card) => `${card.rank}${card.suit}`));
    const unseen = [];
    for (const suit of SUITS) for (const rank of RANKS) {
      if (!known.has(`${rank}${suit.key}`)) unseen.push({ rank, suit: suit.key });
    }
    const rangePools = new Map();
    const opponentPools = opponents.map((opponent) => {
      if (ignoreRanges) return null;
      const rangeName = fullhouseRangeName(opponent);
      if (!rangePools.has(rangeName)) rangePools.set(rangeName, fullhouseComboPool(unseen, rangeName));
      return rangePools.get(rangeName);
    });
    let share = 0;
    let completedTrials = 0;
    for (let trial = 0; trial < iterations; trial += 1) {
      const pool = unseen.slice();
      const sampledOpponents = [];
      let failed = false;
      for (let index = 0; index < opponents.length; index += 1) {
        const combo = drawFullhouseCombo(pool, opponentPools[index]);
        if (!combo) { failed = true; break; }
        const remove = [combo.firstIndex, combo.secondIndex].sort((a, b) => b - a);
        pool.splice(remove[0], 1);
        pool.splice(remove[1], 1);
        sampledOpponents.push(combo.cards);
      }
      if (failed) continue;
      const completedBoard = state.board.slice();
      while (completedBoard.length < 5) {
        const index = randomInt(pool.length);
        completedBoard.push(pool.splice(index, 1)[0]);
      }
      completedTrials += 1;
      const heroScore = evaluateHand([...player.cards, ...completedBoard]);
      const scores = sampledOpponents.map((hand) => evaluateHand([...hand, ...completedBoard]));
      const bestScore = scores.reduce((best, score) => compareScores(score, best) > 0 ? score : best, heroScore);
      if (compareScores(heroScore, bestScore) > 0) share += 1;
      else if (compareScores(heroScore, bestScore) === 0) share += 0.5;
    }
    if (!completedTrials) return ignoreRanges ? 0 : runoutEquity(player, iterations, true);
    return share / completedTrials;
  }

  function preflopStrength(cards) {
    if (!cards || cards.length < 2) return 0.5;
    const [first, second] = cards;
    const high = Math.max(first.rank, second.rank);
    const low = Math.min(first.rank, second.rank);
    if (high === low) return clamp(0.55 + (high - 2) * 0.0305, 0.55, 0.94);
    const suited = first.suit === second.suit;
    const gap = high - low;
    const connected = gap === 1 ? 0.055 : gap === 2 ? 0.025 : gap === 3 ? 0 : gap >= 6 ? -0.055 : -0.02;
    const broadway = (high >= 10 ? 0.035 : 0) + (low >= 10 ? 0.035 : 0);
    const ace = high === 14 ? 0.045 : 0;
    return clamp(0.17 + (high - 2) * 0.035 + (low - 2) * 0.014 + (suited ? 0.055 : 0) + connected + broadway + ace, 0.12, 0.91);
  }

  function boardWetness(board) {
    if (!board.length) return 0;
    const suits = new Map();
    const ranks = board.map((card) => card.rank).sort((a, b) => a - b);
    for (const card of board) suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
    const flush = Math.max(...suits.values()) >= 2 ? 0.15 : 0;
    let connected = 0;
    for (let index = 1; index < ranks.length; index += 1) if (ranks[index] - ranks[index - 1] <= 2) connected += 1;
    return clamp(flush + connected * 0.06 + (new Set(ranks).size < ranks.length ? 0.05 : 0), 0, 0.5);
  }

  function currentEquity(player, iterations = 28) { return runoutEquity(player, iterations); }

  function normalizeDistribution(entries) {
    const positive = entries.filter((item) => item.frequency > 0);
    const total = positive.reduce((sum, item) => sum + item.frequency, 0);
    if (!positive.length) return [{ key: 'check', label: t('action.check'), frequency: 100 }];
    const rows = positive.map((item) => ({ ...item, frequency: Math.floor(item.frequency / total * 100) }));
    const remaining = 100 - rows.reduce((sum, item) => sum + item.frequency, 0);
    rows[0].frequency += remaining;
    return rows.sort((a, b) => b.frequency - a.frequency);
  }

  function getBenchmark(player) {
    if (state.street === 'preflop') {
      const strength = preflopStrength(player.cards);
      const toCall = Math.max(0, state.currentBet - player.streetBet);
      if (toCall <= 0.001) {
        if (player.position === 'BB') {
          const raise = strength > 0.84 ? 0.27 : strength > 0.68 ? 0.12 : 0.035;
          return normalizeDistribution([{ key: 'check', label: t('action.check'), frequency: 1 - raise }, { key: 'raise', label: t('action.raise'), frequency: raise }]);
        }
        const thresholds = { UTG: 0.74, HJ: 0.69, CO: 0.63, BTN: 0.56, SB: 0.59, BB: 0.62 };
        const threshold = thresholds[player.position] || 0.64;
        let open = clamp(0.08 + (strength - threshold) * 2.8, 0.035, 0.97);
        if (strength > threshold + 0.12) open = Math.max(open, 0.88);
        return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 1 - open }, { key: 'bet', label: t('action.raise'), frequency: open }]);
      }
      const potOdds = toCall / Math.max(0.01, sumPot() + toCall);
      const aggressorIndex = posIndex(state.lastAggressor?.position || 'UTG');
      const earlyPressure = aggressorIndex >= 3 && aggressorIndex <= 4 ? 0.07 : 0;
      const latePosition = ['BTN', 'CO'].includes(player.position) ? 0.035 : 0;
      const required = clamp(0.39 + earlyPressure + (potOdds - 0.22) * 0.42 - latePosition, 0.31, 0.68);
      const equityProxy = clamp(0.5 + (strength - 0.65) * 1.2, 0.19, 0.88);
      if (equityProxy >= required + 0.19) return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 0.04 }, { key: 'call', label: t('action.call'), frequency: 0.45 }, { key: 'raise', label: t('action.reraise'), frequency: 0.51 }]);
      if (equityProxy >= required + 0.03) return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 0.16 }, { key: 'call', label: t('action.call'), frequency: 0.76 }, { key: 'raise', label: t('action.reraise'), frequency: 0.08 }]);
      if (equityProxy >= required - 0.11) return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 0.55 }, { key: 'call', label: t('action.call'), frequency: 0.43 }, { key: 'raise', label: t('action.reraise'), frequency: 0.02 }]);
      return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 0.9 }, { key: 'call', label: t('action.call'), frequency: 0.1 }]);
    }

    const equity = currentEquity(player, 30);
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    const wetness = boardWetness(state.board);
    const positionAdvantage = ['BTN', 'CO'].includes(player.position) ? 0.065 : 0;
    if (toCall <= 0.001) {
      let bet = clamp(0.19 + (equity - 0.42) * 1.18 + positionAdvantage + wetness * 0.2, 0.08, 0.9);
      if (equity > 0.78) bet = Math.max(bet, 0.68);
      return normalizeDistribution([{ key: 'check', label: t('action.check'), frequency: 1 - bet }, { key: 'bet', label: t('action.bet'), frequency: bet }]);
    }
    const potOdds = toCall / Math.max(0.01, sumPot() + toCall);
    let call = clamp(0.17 + (equity - potOdds) * 2.25 + wetness * 0.12, 0.02, 0.9);
    let raise = equity > 0.67 ? clamp(0.1 + (equity - 0.67) * 0.9 + wetness * 0.1, 0.07, 0.5) : wetness > 0.24 && equity > 0.42 ? 0.11 : 0.025;
    if (call + raise > 0.96) { const scale = 0.96 / (call + raise); call *= scale; raise *= scale; }
    return normalizeDistribution([{ key: 'fold', label: t('action.fold'), frequency: 1 - call - raise }, { key: 'call', label: t('action.call'), frequency: call }, { key: 'raise', label: t('action.raise'), frequency: raise }]);
  }

  function raiseChoice(player, target) {
    const max = player.streetBet + player.chips;
    const minimum = state.currentBet > 0 ? state.currentBet + state.minRaise : 1;
    if (max <= state.currentBet || player.chips <= 0) return null;
    return { action: state.currentBet > 0 ? 'raise' : 'bet', target: Math.min(max, Math.max(minimum, roundChip(target))) };
  }

  function preflopHistory() {
    const actions = state.actionLog.filter((event) => event.street === 'preflop' && ['raise', 'bet', 'all_in', 'call'].includes(event.action));
    const raises = actions.filter((event) => isAggressiveAction(event.action));
    const limpers = actions.filter((event) => event.action === 'call' && !raises.some((raise) => raise.order < event.order)).length;
    return { actions, raises, limpers };
  }

  function effectiveStackBb(player) {
    const mine = player.chips + player.streetBet;
    const opponents = alivePlayers().filter((other) => other.id !== player.id)
      .map((other) => other.chips + other.streetBet).filter((stack) => stack > 0);
    return opponents.length ? Math.min(mine, Math.max(...opponents)) : mine;
  }

  function isFacingJam(player, toCall) {
    if (player.chips > 0 && toCall >= player.chips) return true;
    return state.players.some((other) => other.id !== player.id && !other.folded && other.allIn
      && other.streetBet > player.streetBet);
  }

  function allInChoice(player) {
    return raiseChoice(player, player.streetBet + player.chips)
      || (state.currentBet > player.streetBet ? { action: 'call' } : { action: 'check' });
  }

  function fullhouseRaiseTo(player, target) {
    if (!fullhouseCanRaise(player)) return state.currentBet > player.streetBet ? { action: 'call' } : { action: 'check' };
    const cap = player.streetBet + player.chips;
    const minimum = state.currentBet > 0 ? state.currentBet + state.minRaise : 1;
    const snapped = Math.min(cap, Math.max(minimum, Math.floor(target)));
    return snapped >= cap ? allInChoice(player) : raiseChoice(player, snapped);
  }

  function fullhouseRaiseByPot(player, fraction) {
    return fullhouseRaiseTo(player, state.currentBet + Math.floor(sumPot() * fraction));
  }

  function sampleFullhouseDistribution(distribution, style, hand, position, context = 'facing') {
    const adjusted = styleAdjustedDistribution(distribution, style, hand, position, context);
    const roll = Math.random();
    if (roll < adjusted.raise) return 'raise';
    if (roll < adjusted.raise + adjusted.call) return 'call';
    return 'fold';
  }

  function decidePreflop(player) {
    const style = player.aiStyle;
    const hand = canonicalHand(player.cards);
    const premiumPair = hand === 'AA' || hand === 'KK';
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    const history = preflopHistory();
    const raiseCount = history.raises.length;
    const raiseAllowed = !state.actedSinceFullRaise.has(player.id) && player.chips > toCall + 0.001
      && player.streetBet + player.chips > state.currentBet + 0.001;
    const jam = isFacingJam(player, toCall);
    const effectiveBb = effectiveStackBb(player);
    const canCheck = toCall <= 0.001;

    if (!jam && raiseCount === 1 && history.raises[0].playerId !== player.id
      && ['AA', 'KK', 'QQ', 'AKs'].includes(hand) && raiseAllowed) {
      const callers = history.actions.filter((event) => event.action === 'call' && event.order > history.raises[0].order).length;
      if (callers > 0) {
        const squeezeTo = Math.max(state.currentBet * (4 + callers), state.currentBet + Math.floor(sumPot() * 0.9));
        return fullhouseRaiseTo(player, squeezeTo);
      }
    }

    if (jam && premiumPair && toCall > 0) return { action: 'call' };

    if (!premiumPair && raiseCount >= 1 && toCall >= 0.6 * (player.chips + player.streetBet) && toCall > 0) {
      const equity = currentEquity(player, 32);
      const required = toCall / Math.max(0.01, sumPot() + toCall);
      return equity >= required + 0.06 + Math.max(0, style.tightness * 0.25) ? { action: 'call' } : { action: 'fold' };
    }

    if (effectiveBb <= 20) {
      if (jam) {
        const equity = currentEquity(player, 32);
        const required = toCall / Math.max(0.01, sumPot() + toCall);
        return equity >= required + 0.06 + Math.max(0, style.tightness * 0.25) ? { action: 'call' } : { action: 'fold' };
      }
      if (raiseCount === 0) {
        const depth = effectiveBb <= 8 ? '8BB' : effectiveBb <= 12 ? '12BB' : '20BB';
        const jamRange = FH_RANGES.jamRanges?.[depth]?.[player.position] || [];
        if (jamRange.includes(hand)) return allInChoice(player);
        if (effectiveBb <= 12) return canCheck ? { action: 'check' } : { action: 'fold' };
        const open = fullhouseOpenDistribution(player.position, hand);
        if (open.raise > 0.5) return fullhouseRaiseTo(player, 2.2);
        return canCheck ? { action: 'check' } : { action: 'fold' };
      }
      return decidePreflopDefense(player, hand, history, raiseAllowed, style);
    }

    if (raiseCount === 0) {
      if (player.position === 'SB' && alivePlayers().length === 2) {
        if ((FH_RANGES.neverOpenHeadsUp || []).includes(hand)) {
          if (Math.random() < 0.1 + Math.max(0, style.aggression) * 0.1 && raiseAllowed) {
            return fullhouseRaiseTo(player, FH_RANGES.openSizeBb?.BTN || 2.5);
          }
          return canCheck ? { action: 'check' } : { action: 'fold' };
        }
        if (style.tightness > 0 && Math.random() < style.tightness * 0.35 && canCheck) return { action: 'check' };
        return fullhouseRaiseTo(player, FH_RANGES.openSizeBb?.BTN || 2.5);
      }
      const base = fullhouseOpenDistribution(player.position, hand);
      const choice = sampleFullhouseDistribution(base, style, hand, player.position, 'open');
      if (choice === 'raise' && raiseAllowed) {
        return fullhouseRaiseTo(player, FH_RANGES.openSizeBb?.[player.position] || 2.5);
      }
      if (choice === 'call' && toCall > 0) return { action: 'call' };
      return canCheck ? { action: 'check' } : { action: 'fold' };
    }

    if (raiseCount >= 2 && history.raises[0].playerId !== player.id) {
      if ((FH_RANGES.cold4BetValue || []).includes(hand)) return fullhouseRaiseTo(player, state.currentBet * 2.2);
      if ((FH_RANGES.cold4BetBluff || []).includes(hand) && Math.random() < 0.35 + Math.max(0, style.aggression) * 0.2) {
        return fullhouseRaiseTo(player, state.currentBet * 2.2);
      }
      if ((FH_RANGES.coldCall4Bet || []).includes(hand)) return { action: 'call' };
      return canCheck ? { action: 'check' } : { action: 'fold' };
    }
    if (history.raises[0]?.playerId === player.id) {
      const base = FH_RANGES.vs3Bet?.[hand] || { raise: 0, call: 0, fold: 1 };
      const choice = sampleFullhouseDistribution(base, style, hand, player.position);
      if (choice === 'raise') {
        if (raiseAllowed) return fullhouseRaiseTo(player, state.currentBet * 2.25);
        return toCall > 0 ? { action: 'call' } : { action: 'check' };
      }
      return choice === 'call' && toCall > 0 ? { action: 'call' } : (canCheck ? { action: 'check' } : { action: 'fold' });
    }
    return decidePreflopDefense(player, hand, history, raiseAllowed, style);
  }

  function decidePreflopDefense(player, hand, history, raiseAllowed, style) {
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    const canCheck = toCall <= 0.001;
    const opener = history.raises[0];
    if (!opener) return canCheck ? { action: 'check' } : { action: 'fold' };
    const base = fullhouseDefenseDistribution(opener.position, player.position, hand);
    const choice = sampleFullhouseDistribution(base, style, hand, player.position);
    if (choice === 'raise') {
      if (raiseAllowed) {
        const order = { UTG: 0, HJ: 1, CO: 2, BTN: 3, SB: 4, BB: 5 };
        const inPosition = player.position !== 'SB' && player.position !== 'BB'
          && (order[player.position] ?? 0) > (order[opener.position] ?? 0);
        return fullhouseRaiseTo(player, state.currentBet * (inPosition ? 3 : 4));
      }
      return toCall > 0 ? { action: 'call' } : { action: 'check' };
    }
    if (choice === 'call' && toCall > 0) return { action: 'call' };
    return canCheck ? { action: 'check' } : { action: 'fold' };
  }

  function postflopPositionScore(player) {
    const order = postflopOrder(state.buttonSeat).map((seat) => state.players[seat]).filter((item) => !item.folded);
    if (order.length < 2) return 0.5;
    return order.findIndex((item) => item.id === player.id) / (order.length - 1);
  }

  function fullhouseBoardProfile(board) {
    const ranks = new Map();
    const suits = new Map();
    for (const card of board) {
      ranks.set(card.rank, (ranks.get(card.rank) || 0) + 1);
      suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
    }
    const paired = [...ranks.values()].some((count) => count >= 2);
    const tripsOnBoard = [...ranks.values()].some((count) => count >= 3);
    const maxSuit = Math.max(0, ...suits.values());
    const uniqueRanks = new Set(board.map((card) => card.rank));
    if (uniqueRanks.has(14)) uniqueRanks.add(1);
    let straightHits = 0;
    for (let low = 1; low <= 10; low += 1) {
      let hits = 0;
      for (let offset = 0; offset < 5; offset += 1) if (uniqueRanks.has(low + offset)) hits += 1;
      straightHits = Math.max(straightHits, hits);
    }
    const fourStraight = straightHits >= 4;
    const fourFlush = maxSuit >= 4;
    const threeFlush = maxSuit >= 3;
    const danger = Number(paired) + Number(tripsOnBoard) + Number(threeFlush) + Number(fourFlush) + (fourStraight ? 2 : 0);
    return { paired, tripsOnBoard, threeFlush, fourFlush, fourStraight, danger };
  }

  function fullhouseBoardIsDry(board) {
    const ranks = board.map((card) => card.rank);
    const maxSuit = Math.max(0, ...[...new Set(board.map((card) => card.suit))].map((suit) => board.filter((card) => card.suit === suit).length));
    return maxSuit < 3 && new Set(ranks).size === ranks.length && ranks.length > 0 && Math.max(...ranks) - Math.min(...ranks) >= 5;
  }

  function fullhouseNutValueBucket(player) {
    const cards = [...player.cards, ...state.board];
    const score = evaluateHand(cards);
    if (score[0] >= 6) return 'full_house_plus';
    const suitCounts = new Map();
    for (const card of cards) suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    const flushSuit = [...suitCounts.entries()].find(([, count]) => count >= 5)?.[0];
    if (flushSuit) {
      const heroFlushRank = Math.max(0, ...player.cards.filter((card) => card.suit === flushSuit).map((card) => card.rank));
      return heroFlushRank >= 13 ? 'nut_flush' : 'low_flush';
    }
    const rankCounts = new Map();
    for (const card of cards) rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    if (score[0] === 3 && player.cards[0].rank === player.cards[1].rank
      && state.board.some((card) => card.rank === player.cards[0].rank)) return 'set';
    if ([...rankCounts.values()].some((count) => count >= 3)) return 'trips';
    if (score[0] === 4) return 'straight';
    return 'other';
  }

  function fullhouseEffectiveSpr(player) {
    return effectiveStackBb(player) / Math.max(1, sumPot());
  }

  function fullhouseNutValueSizing(player, action) {
    if (!action || state.street === 'preflop') return action;
    const bucket = fullhouseNutValueBucket(player);
    if (!['full_house_plus', 'nut_flush', 'set'].includes(bucket)) return action;
    const profile = fullhouseBoardProfile(state.board);
    if (bucket === 'set' && (profile.danger >= 3 || profile.fourStraight || profile.fourFlush)) return action;
    const spr = fullhouseEffectiveSpr(player);
    const canCheck = state.currentBet <= player.streetBet + 0.001;
    const owed = Math.max(0, state.currentBet - player.streetBet);
    if (!fullhouseCanRaise(player)) return action;
    if (spr <= 2.2) return allInChoice(player);
    if (canCheck && ['full_house_plus', 'nut_flush'].includes(bucket)) return fullhouseRaiseByPot(player, 1.05) || action;
    if (owed > 0 && ['call', 'raise', 'bet'].includes(action.action) && ['full_house_plus', 'nut_flush'].includes(bucket)) {
      return fullhouseRaiseByPot(player, 1.15) || action;
    }
    return action;
  }

  function fullhousePostflopAction(player) {
    const style = player.aiStyle;
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    const canCheck = toCall <= 0.001;
    const pot = Math.max(1, sumPot());
    const equity = currentEquity(player, 42);
    const position = postflopPositionScore(player);
    let required = toCall > 0 ? toCall / (pot + toCall) : 0;
    const styleMargin = style.tightness > 0 ? 0.025 : style.tightness < 0 ? -0.025 : 0;
    required = clamp(required + styleMargin, 0, 0.95);
    const raiseAllowed = !state.actedSinceFullRaise.has(player.id)
      && player.streetBet + player.chips > state.currentBet + state.minRaise - 0.001;
    const raiseChance = (base) => clamp(base + style.aggression * 0.5, 0.02, 0.98);

    if (!canCheck && state.street === 'river' && toCall >= 0.66 * pot) {
      const villains = alivePlayers().filter((other) => other.id !== player.id);
      if (villains.length === 1) {
        const stats = playerActionStats(villains[0]);
        const raiseRate = (stats.raises + stats.allins) / Math.max(1, stats.actions);
        if (stats.actions >= 12 && raiseRate <= 0.18 && state.actionLog.some((event) => isAggressiveAction(event.action))) {
          required += 0.06;
        }
      }
    }

    if (equity >= 0.72) {
      if (canCheck) {
        if (style.aggression < 0 && Math.random() < Math.abs(style.aggression) * 0.24) return { action: 'check' };
        return fullhouseRaiseByPot(player, 0.7) || { action: 'check' };
      }
      if (equity >= 0.85) {
        if (raiseAllowed && Math.random() < raiseChance(0.70)) return fullhouseRaiseByPot(player, 0.9) || { action: 'call' };
        return { action: 'call' };
      }
      if (equity >= 0.80) {
        if (raiseAllowed && Math.random() < raiseChance(0.55)) return fullhouseRaiseByPot(player, 0.8) || { action: 'call' };
        return { action: 'call' };
      }
      if (!fullhouseBoardIsDry(state.board) && raiseAllowed && Math.random() < raiseChance(0.45)) {
        return fullhouseRaiseByPot(player, 0.75) || { action: 'call' };
      }
      return { action: 'call' };
    }

    if (equity >= 0.55) {
      if (canCheck) {
        if (position > 0.5 && Math.random() < raiseChance(0.65)) return fullhouseRaiseByPot(player, 0.55) || { action: 'check' };
        return { action: 'check' };
      }
      return equity >= required + 0.05 ? { action: 'call' } : { action: 'fold' };
    }

    if (equity >= 0.42) {
      if (canCheck) return { action: 'check' };
      return equity >= required ? { action: 'call' } : { action: 'fold' };
    }

    if (canCheck) {
      if (position > 0.6 && fullhouseBoardIsDry(state.board)
        && Math.random() < clamp(0.18 + style.aggression * 0.3, 0.03, 0.4)) {
        return fullhouseRaiseByPot(player, 0.5) || { action: 'check' };
      }
      return { action: 'check' };
    }
    return { action: 'fold' };
  }

  function fullhouseCanRaise(player) {
    const cap = player.streetBet + player.chips;
    return !state.actedSinceFullRaise.has(player.id) && cap > state.currentBet + state.minRaise - 0.001;
  }

  function fullhouseMetacap(player, action) {
    const hand = canonicalHand(player.cards);
    if (state.street === 'preflop') {
      const history = preflopHistory();
      if (!fullhouseCanRaise(player)) return action;
      if (history.raises.length === 0 && history.limpers > 0 && ['AA', 'KK', 'QQ', 'AKs'].includes(hand)) {
        return fullhouseRaiseTo(player, 5 + history.limpers);
      }
      if (history.raises.length === 1 && history.raises[0].playerId !== player.id
        && state.currentBet <= 2.2 && ['AA', 'KK', 'QQ', 'AKs'].includes(hand)) {
        return fullhouseRaiseTo(player, state.currentBet * 4.8);
      }
      return action;
    }

    const owed = Math.max(0, state.currentBet - player.streetBet);
    const pot = Math.max(1, sumPot());
    if ((state.street === 'flop' || state.street === 'turn') && fullhouseCanRaise(player)
      && owed > 0 && owed <= 0.20 * pot) {
      const bucket = fullhouseNutValueBucket(player);
      const profile = fullhouseBoardProfile(state.board);
      const counts = new Map();
      for (const card of state.board) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
      const topBoard = Math.max(...state.board.map((card) => card.rank));
      const cleanOverpair = player.cards[0].rank === player.cards[1].rank && player.cards[0].rank > topBoard
        && !profile.paired && !profile.fourStraight && !profile.fourFlush;
      const realTwoPair = player.cards[0].rank !== player.cards[1].rank
        && state.board.some((card) => card.rank === player.cards[0].rank)
        && state.board.some((card) => card.rank === player.cards[1].rank)
        && !profile.paired && profile.danger <= 2;
      const hasValue = cleanOverpair || realTwoPair || ['set', 'nut_flush', 'full_house_plus'].includes(bucket);
      if (hasValue && !(bucket === 'set' && profile.danger >= 3)) return fullhouseRaiseByPot(player, 0.70) || action;
    }
    if (state.street === 'river' && fullhouseCanRaise(player) && owed > 0 && owed <= 0.25 * pot
      && ['full_house_plus', 'nut_flush'].includes(fullhouseNutValueBucket(player))) {
      return fullhouseEffectiveSpr(player) <= 2.4 ? allInChoice(player) : fullhouseRaiseByPot(player, 1.15) || action;
    }
    return action;
  }

  function chooseBotAction(player) {
    let action = state.street === 'preflop' ? decidePreflop(player) : fullhousePostflopAction(player);
    if (state.street !== 'preflop') action = fullhouseNutValueSizing(player, action);
    action = fullhouseMetacap(player, action);
    if (!action) return state.currentBet > player.streetBet ? { action: 'call' } : { action: 'check' };
    if (action.action === 'check' && state.currentBet > player.streetBet) return { action: 'fold' };
    return action;
  }

  function actionName(action, target = 0) {
    if (action === 'fold' || action === 'check' || action === 'call' || action === 'all_in') {
      return t(action === 'all_in' ? 'action.allin' : `action.${action}`);
    }
    if (action === 'bet') return target === null ? t('action.bet') : t('action.betTo', { amount: fmt(target) });
    if (action === 'raise') return target === null ? t('action.raise') : t('action.raiseTo', { amount: fmt(target) });
    return action;
  }

  function setPlayerActionLabel(player, key, params = {}) {
    player.actionLabelKey = key;
    player.actionLabelParams = params;
    player.actionLabel = t(key, params);
  }

  function playerActionLabel(player) {
    if (player.folded) return t('action.fold');
    if (player.allIn) return t('action.allin');
    return player.actionLabelKey ? t(player.actionLabelKey, player.actionLabelParams) : legacyActionLabel(player.actionLabel);
  }

  function applyAction(player, action, target = 0) {
    const oldBet = state.currentBet;
    const potBefore = sumPot();
    const toCallBefore = Math.max(0, state.currentBet - player.streetBet);
    let paidAmount = 0;
    if (action === 'fold') {
      player.folded = true;
      setPlayerActionLabel(player, 'action.fold');
      state.pending.shift();
      state.actedSinceFullRaise.add(player.id);
    } else if (action === 'check' || action === 'call') {
      const due = Math.max(0, state.currentBet - player.streetBet);
      const paid = setCommitment(player, action === 'check' ? 0 : due);
      paidAmount = paid;
      if (paid > 0) setPlayerActionLabel(player, 'action.callAmount', { amount: fmt(paid) });
      else setPlayerActionLabel(player, 'action.check');
      state.pending.shift();
      state.actedSinceFullRaise.add(player.id);
    } else {
      const maximum = player.streetBet + player.chips;
      const requested = clamp(roundChip(target), 0, maximum);
      const minimumRaiseTo = state.currentBet > 0 ? state.currentBet + state.minRaise : 1;
      let total = Math.max(state.currentBet, requested);
      if (total < minimumRaiseTo && maximum >= minimumRaiseTo) total = minimumRaiseTo;
      const paid = setCommitment(player, total - player.streetBet);
      paidAmount = paid;
      const actualTotal = player.streetBet;
      const raiseSize = actualTotal - oldBet;
      setPlayerActionLabel(player, action === 'bet' ? 'action.betTo' : 'action.raiseTo', { amount: fmt(actualTotal) });
      state.lastAggressor = player;
      if (raiseSize >= state.minRaise - 0.001) {
        state.minRaise = Math.max(0.5, raiseSize);
        state.currentBet = actualTotal;
        state.actedSinceFullRaise = new Set([player.id]);
        state.pending = queueAfterFullRaise(player);
      } else if (raiseSize > 0.001) {
        state.currentBet = actualTotal;
        state.actedSinceFullRaise.add(player.id);
        const stillPending = new Set(state.pending.filter((id) => id !== player.id));
        const owed = playersAfter(player.seat).filter((other) => other.id !== player.id && canAct(other) && (other.streetBet < state.currentBet - 0.001 || stillPending.has(other.id)));
        state.pending = owed.map((other) => other.id);
      } else {
        state.pending.shift();
        state.actedSinceFullRaise.add(player.id);
      }
      if (paid <= 0.001) setPlayerActionLabel(player, 'action.check');
    }
    const loggedAction = player.allIn && isAggressiveAction(action) ? 'all_in' : action;
    const stats = state.playerStats[player.id] || (state.playerStats[player.id] = { actions: 0, raises: 0, allins: 0, facedBet: 0, callVsBet: 0 });
    stats.actions += 1;
    if (loggedAction === 'raise' || loggedAction === 'bet') stats.raises += 1;
    if (loggedAction === 'all_in') stats.allins += 1;
    if (toCallBefore > 0.001) {
      stats.facedBet += 1;
      if (loggedAction === 'call') stats.callVsBet += 1;
    }
    state.actionLog.push({
      order: state.actionLog.length, street: state.street, seat: player.seat, playerId: player.id,
      position: player.position, action: loggedAction, amount: paidAmount,
      target: player.streetBet, toCall: toCallBefore, potBefore,
      betBefore: oldBet, stackBefore: player.chips + paidAmount
    });
    prunePending();
    state.currentActor = null;
  }

  function recordHumanDecision(action, target, benchmark) {
    const selectedKey = action === 'call' && state.currentBet === hero().streetBet ? 'check' : action;
    const match = benchmark.find((item) => item.key === selectedKey)?.frequency || 0;
    const score = evaluateHand([...hero().cards, ...state.board]);
    const equity = state.street === 'preflop' ? null : currentEquity(hero(), 30);
    state.decisions += 1;
    state.matchedFrequencyTotal += match;
    state.currentReview = {
      street: state.street,
      position: hero().position,
      board: state.board.slice(),
      cards: hero().cards.slice(),
      action: selectedKey,
      actionKey: selectedKey,
      actionTarget: target,
      actionLabel: actionName(selectedKey, selectedKey === 'bet' || selectedKey === 'raise' ? target : null),
      match,
      benchmark,
      handCategoryKey: state.street === 'preflop' ? '' : CATEGORY_KEYS[score?.[0] || 0],
      equity,
      pot: sumPot(),
      toCall: Math.max(0, state.currentBet - hero().streetBet)
    };
  }

  function humanAction(action) {
    if (!state.humanTurn || state.handComplete) return;
    const player = hero();
    const benchmark = getBenchmark(player);
    const target = Number(ui.raiseInput.value) || 0;
    recordHumanDecision(action, target, benchmark);
    state.humanTurn = false;
    if (state.mode !== 'full') {
      finishTrainingSpot(state.mode === 'preflop' ? 'result.preflopModeDone' : 'result.postflopModeDone');
      return;
    }
    applyAction(player, action, target);
    render();
    progress(state.handNumber);
  }

  function runoutAndShowdown() {
    while (state.board.length < 5) state.board.push(draw());
    for (const player of state.players) player.streetBet = 0;
    state.street = 'river';
    state.currentBet = 0;
    showdown();
  }

  function distributePots() {
    const levels = [...new Set(state.players.map((player) => player.committed).filter((amount) => amount > 0))].sort((a, b) => a - b);
    let previous = 0;
    const awards = new Map(state.players.map((player) => [player.id, 0]));
    for (const level of levels) {
      const contributors = state.players.filter((player) => player.committed >= level - 0.001);
      const amount = roundChip((level - previous) * contributors.length);
      let eligible = contributors.filter((player) => !player.folded);
      if (!eligible.length) eligible = contributors.slice(-1);
      let best = null;
      let winners = [];
      for (const player of eligible) {
        const score = evaluateHand([...player.cards, ...state.board]);
        const comparison = best ? compareScores(score, best) : 1;
        if (comparison > 0) { best = score; winners = [player]; }
        else if (comparison === 0) winners.push(player);
      }
      const each = winners.length ? amount / winners.length : 0;
      for (const winner of winners) awards.set(winner.id, (awards.get(winner.id) || 0) + each);
      previous = level;
    }
    for (const player of state.players) player.chips = roundChip(player.chips + (awards.get(player.id) || 0));
    return awards;
  }

  function showdown() {
    if (state.handComplete) return;
    const live = alivePlayers();
    const awards = distributePots();
    const heroPlayer = hero();
    const heroAward = awards.get(heroPlayer.id) || 0;
    const heroScore = evaluateHand([...heroPlayer.cards, ...state.board]);
    let outcome;
    if (heroAward > 0 && hero.folded === false) {
      const tied = live.some((player) => player.id !== heroPlayer.id && compareScores(evaluateHand([...player.cards, ...state.board]), heroScore) === 0);
      outcome = tied
        ? { key: 'result.split', params: { amount: fmt(heroAward) } }
        : { key: 'result.heroWins', params: { handKey: `hand.${CATEGORY_KEYS[heroScore?.[0] || 0]}`, amount: fmt(heroAward) } };
    } else {
      const winner = live.sort((a, b) => (awards.get(b.id) || 0) - (awards.get(a.id) || 0))[0];
      const winnerScore = winner ? evaluateHand([...winner.cards, ...state.board]) : null;
      outcome = { key: 'result.opponentWins', params: {
        name: winner?.name || t('opponent.generic'), handKey: `hand.${CATEGORY_KEYS[winnerScore?.[0] || 0]}`
      } };
    }
    for (const player of live) {
      const score = evaluateHand([...player.cards, ...state.board]);
      setPlayerActionLabel(player, `hand.${CATEGORY_KEYS[score?.[0] || 0]}`);
    }
    finishHand(outcome);
  }

  function currentToCall(player) { return Math.max(0, roundChip(state.currentBet - player.streetBet)); }

  function updateRaiseSizing() {
    const player = hero();
    const toCall = currentToCall(player);
    const maximum = roundChip(player.streetBet + player.chips);
    const minimum = state.currentBet > 0 ? state.currentBet + state.minRaise : 1;
    ui.raiseInput.min = String(Math.min(minimum, maximum));
    ui.raiseInput.max = String(maximum);
    if (!Number.isFinite(Number(ui.raiseInput.value)) || Number(ui.raiseInput.value) < minimum || Number(ui.raiseInput.value) > maximum) {
      ui.raiseInput.value = String(Math.min(maximum, Math.max(minimum, state.street === 'preflop' ? Math.max(2.2, state.currentBet * 2.5) : state.currentBet + toCall + sumPot() * 0.5)));
    }
    const buttons = [...document.querySelectorAll('.quick-size')];
    if (state.street === 'preflop') {
      const labels = ['2.2×', '2.5×', '3×', t('action.allin')];
      buttons.forEach((button, index) => { button.textContent = labels[index]; button.dataset.size = ['2.2', '2.5', '3', 'jam'][index]; });
    } else {
      const labels = ['33%', '66%', t('size.pot'), t('action.allin')];
      buttons.forEach((button, index) => { button.textContent = labels[index]; button.dataset.size = ['33', '66', '100', 'jam'][index]; });
    }
  }

  function renderControls() {
    const player = hero();
    const toCall = currentToCall(player);
    const actionable = state.humanTurn && !state.handComplete;
    ui.controls.classList.toggle('is-actionable', actionable);
    ui.app.classList.toggle('human-turn', actionable);
    ui.controls.style.opacity = actionable ? '1' : '0.38';
    ui.controls.style.pointerEvents = actionable ? 'auto' : 'none';
    ui.fold.disabled = !actionable;
    ui.pass.hidden = toCall > 0.001;
    ui.call.hidden = toCall <= 0.001;
    ui.pass.disabled = !actionable;
    ui.call.disabled = !actionable;
    ui.call.textContent = t('action.callAmount', { amount: fmt(toCall) });
    const raiseAllowed = !state.actedSinceFullRaise.has(player.id) && player.chips > toCall + 0.001;
    const maxRaise = player.streetBet + player.chips;
    ui.raise.disabled = !actionable || !raiseAllowed || maxRaise <= state.currentBet + 0.001;
    ui.raise.textContent = state.currentBet > 0 || state.street === 'preflop' ? t('action.raise') : t('action.bet');
    ui.raiseInput.disabled = !actionable || !raiseAllowed;
    document.querySelectorAll('.quick-size').forEach((button) => { button.disabled = !actionable || !raiseAllowed; });
    updateRaiseSizing();
  }

  function renderSeats() {
    ui.seats.innerHTML = state.players.map((player) => {
      const isActing = !state.handComplete && state.currentActor === player.id;
      const faceUp = player.human || state.handEnded;
      const cardMarkupText = player.cards.map((card) => cardMarkup(card, !faceUp)).join('');
      const dealer = player.position === 'BTN' ? `<span class="dealer" title="${t('table.dealer')}">D</span>` : '';
      const currentAction = playerActionLabel(player);
      const action = currentAction ? `<span class="seat-state">${currentAction}</span>` : '';
      const bet = player.streetBet > 0.001 && !currentAction && !state.handComplete ? `<div class="bet-chip">${fmt(player.streetBet)} bb</div>` : '';
      const styleName = player.aiStyle ? t(`style.${player.aiStyle.key}`) : '';
      const styleShort = player.aiStyle ? t(`style.${player.aiStyle.key}.short`) : '';
      const styleTag = player.aiStyle ? `<span class="ai-style-tag" title="${styleName}">${styleShort}</span>` : '';
      const name = player.human ? t('player.you') : player.name;
      const activeClass = isActing ? (player.human ? ' acting acting-human' : ' acting') : '';
      const allIn = player.allIn ? ` · ${t('action.allin')}` : '';
      return `<div class="seat seat-${player.seat + 1}${player.human ? ' hero' : ''}${player.folded ? ' folded' : ''}${state.handEnded ? ' revealed' : ''}${activeClass}"><div class="nameplate">${dealer}<span class="seat-name">${name}</span>${styleTag}<span class="seat-position">· ${positionLabel(player.position)}</span></div><div class="stack">${fmt(player.chips)} bb${allIn}</div>${action}${bet}<div class="mini-cards">${cardMarkupText}</div></div>`;
    }).join('');
  }

  function renderBoard() {
    ui.board.innerHTML = state.board.length ? state.board.map((card) => cardMarkup(card)).join('') : `<span class="board-placeholder">${t('board.empty')}</span>`;
  }

  function boardSummary(board) { return board.length ? board.map(cardText).join('  ') : t('board.waiting'); }

  function renderFeedback() {
    const player = hero();
    const currentPot = sumPot();
    const postflopActors = postflopOrder(state.buttonSeat).map((seat) => state.players[seat]).filter((item) => !item.folded && !item.allIn);
    const inPosition = postflopActors[postflopActors.length - 1]?.id === player.id;
    const positionContext = state.street === 'preflop' ? t('node.preflopPosition') : inPosition ? t('node.inPosition') : t('node.outOfPosition');
    const nodeLines = [
      [t('node.position'), `${player.position} · ${positionContext}`],
      [t('node.hand'), player.cards.map(cardText).join('  ')],
      [t('node.board'), boardSummary(state.board)],
      [t('node.potStack'), `${fmt(currentPot)} bb / ${fmt(player.chips)} bb`]
    ];
    ui.nodeDetails.innerHTML = nodeLines.map(([label, value]) => `<div class="spot-line"><span>${label}</span><span>${value}</span></div>`).join('');
    ui.feedbackState.textContent = state.handComplete ? t('feedback.nodeEnded') : state.humanTurn ? t('feedback.yourTurn') : t('feedback.aiActing');
    if (state.currentReview) {
      const review = state.currentReview;
      const equityText = review.equity === null ? t('review.preflopEquity') : t('review.randomEquity', { percent: Math.round(review.equity * 100) });
      const strengthText = review.handCategoryKey ? t('review.handStrength', { hand: t(`hand.${review.handCategoryKey}`) }) : t('review.preflopStrength');
      const chosenAction = actionName(review.actionKey, review.actionKey === 'bet' || review.actionKey === 'raise' ? review.actionTarget : null);
      const reviewSummary = [strengthText, equityText, t('review.approximation')].join(t('review.sentenceSeparator'));
      ui.decisionBox.innerHTML = `<div class="decision-kicker">${streetName(review.street)} · ${t('review.yourChoice')}</div><strong>${chosenAction} · ${t('review.reference', { percent: review.match })}</strong><p>${reviewSummary}</p>`;
      ui.strategyTitle.textContent = t('review.localFrequency');
      ui.strategyList.innerHTML = review.benchmark.map((item) => `<div class="strategy-row"><span>${strategyActionName(item.key, review.street)}</span><div class="bar"><i style="width:${item.frequency}%"></i></div><b>${item.frequency}%</b></div>`).join('');
    } else if (state.handComplete) {
      ui.decisionBox.innerHTML = `<div class="decision-kicker">${modeName()} · ${t('review.handResult')}</div><strong>${formatResultDescriptor() || t('result.handComplete')}</strong><p>${state.mode === 'full' ? t('review.fullHandStarted', { stack: DEFAULT_STACK }) : t('review.specialtyNote')}</p>`;
      ui.strategyTitle.textContent = t('review.frequency');
      ui.strategyList.innerHTML = `<div class="empty-strategy">${t('review.waitNext')}</div>`;
    } else if (state.humanTurn) {
      const toCall = currentToCall(player);
      const prompt = toCall > 0 ? t('review.toCall', { amount: fmt(toCall) }) : t('review.noBet');
      ui.decisionBox.innerHTML = `<div class="decision-kicker">${streetName(state.street)} · ${t('feedback.yourTurn')}</div><strong>${toCall > 0 ? t('review.facing', { amount: fmt(toCall) }) : t('review.actionSpot')}</strong><p>${prompt} ${t('review.chooseFrequency')}</p>`;
      ui.strategyTitle.textContent = t('strategy.title');
      ui.strategyList.innerHTML = `<div class="empty-strategy">${t('review.localStrategy')}</div>`;
    } else {
      const actor = state.players.find((item) => item.id === state.currentActor);
      const actorName = actor?.human ? t('player.you') : actor?.name;
      const actorPrompt = actor ? t('status.actor', { name: actorName }) : t('status.waiting');
      ui.decisionBox.innerHTML = `<div class="decision-kicker">${streetName(state.street)} · ${modeName()}</div><strong>${actorPrompt}</strong><p>${t('review.opponentPrompt', { position: player.position, cards: player.cards.map(cardText).join(' ') })}</p>`;
      ui.strategyTitle.textContent = t('strategy.title');
      ui.strategyList.innerHTML = `<div class="empty-strategy">${t('review.yourAction')}</div>`;
    }
  }

  function strategyActionName(action, street) {
    if (action === 'bet' && street === 'preflop') return t('action.raise');
    if (action === 'raise' && street === 'preflop') return t('action.reraise');
    return actionName(action, null);
  }

  function render() {
    const heroPlayer = hero();
    ui.handId.textContent = t('table.handId', { number: String(state.handNumber).padStart(4, '0') });
    ui.streetPill.textContent = streetName(state.street);
    ui.pot.textContent = `${fmt(sumPot())} bb`;
    renderBoard();
    renderSeats();
    renderControls();
    renderFeedback();
    renderPreflopFilter();
    if (state.handComplete) ui.tableStatus.innerHTML = `<strong>${formatResultDescriptor()}</strong>`;
    else if (state.currentActor === heroPlayer.id) {
      const due = currentToCall(heroPlayer);
      ui.tableStatus.innerHTML = due > 0
        ? `${t('status.yourTurnFacing', { amount: fmt(due) })}`
        : t('status.yourTurnOpen');
    } else {
      const actor = state.players.find((player) => player.id === state.currentActor);
      ui.tableStatus.textContent = actor ? t('status.actor', { name: actor.human ? t('player.you') : actor.name }) : t('status.waiting');
    }
    ui.handCount.textContent = String(Math.max(1, state.handNumber)).padStart(2, '0');
    ui.accuracy.textContent = state.decisions ? `${Math.round(state.matchedFrequencyTotal / state.decisions)}%` : '—';
    ui.sessionResult.textContent = state.mode === 'full' ? `${state.sessionNet > 0 ? '+' : ''}${fmt(state.sessionNet)} bb` : t('status.trainingSpots');
    ui.sessionResult.style.color = state.sessionNet > 0 ? 'var(--lime)' : state.sessionNet < 0 ? 'var(--red)' : '';
    ui.nextHand.innerHTML = `${t(state.handComplete ? 'next.deal' : 'next.skip')} <span aria-hidden="true">→</span>`;
    ui.nextHand.setAttribute('aria-label', t(state.handComplete ? 'next.deal' : 'next.skip'));
    ui.footerNote.textContent = state.mode === 'full'
      ? t('status.session', { stack: DEFAULT_STACK })
      : t('status.practice', { mode: modeName() });
  }

  function setQuickSize(value) {
    const player = hero();
    const toCall = currentToCall(player);
    const max = roundChip(player.streetBet + player.chips);
    let target;
    if (value === 'jam') target = max;
    else if (state.street === 'preflop') target = roundChip(Math.max(state.currentBet + state.minRaise, state.currentBet * Number(value)));
    else {
      const fraction = Number(value) / 100;
      target = state.currentBet > 0
        ? state.currentBet + toCall + sumPot() * fraction
        : Math.max(1, sumPot() * fraction);
      target = roundChip(target);
      target = Math.max(state.currentBet > 0 ? state.currentBet + state.minRaise : 1, target);
    }
    ui.raiseInput.value = String(Math.min(max, target));
  }

  function bindEvents() {
    ui.preflopRange.addEventListener('input', () => {
      state.preflopExtraPercent = Number(ui.preflopRange.value) || 0;
      renderPreflopFilter();
    });
    document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.mode === state.mode) return;
      document.querySelectorAll('.mode-button').forEach((item) => {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-selected', item === button ? 'true' : 'false');
      });
      state.mode = button.dataset.mode;
      startNewHand();
    }));
    ui.fold.addEventListener('click', () => humanAction('fold'));
    ui.pass.addEventListener('click', () => humanAction('check'));
    ui.call.addEventListener('click', () => humanAction('call'));
    ui.raise.addEventListener('click', () => humanAction(state.currentBet > 0 ? 'raise' : 'bet'));
    document.querySelectorAll('.quick-size').forEach((button) => button.addEventListener('click', () => setQuickSize(button.dataset.size)));
    ui.raiseInput.addEventListener('change', () => {
      ui.raiseInput.value = String(clamp(roundChip(Number(ui.raiseInput.value) || 0), Number(ui.raiseInput.min), Number(ui.raiseInput.max)));
    });
    ui.nextHand.addEventListener('click', () => startNewHand());
    window.addEventListener('poker-language-change', () => {
      render();
      renderHistory();
    });
  }

  function installWebMcpTools() {
    if (!document.modelContext || typeof document.modelContext.registerTool !== 'function') return;
    const api = document.modelContext;
    const definitions = [
      {
        name: 'get_poker_training_state',
        description: 'Read the current Texas Hold’em training spot. Returns the hero cards, public board, visible player positions and stacks, available actions, and feedback. AI hole cards are not included in this response.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const player = hero();
          const due = currentToCall(player);
          const availableActions = state.handComplete || !state.humanTurn
            ? []
            : ['fold', ...(due > 0.001 ? ['call'] : ['check']), ...((!state.actedSinceFullRaise.has(player.id) && player.chips > due && player.streetBet + player.chips > state.currentBet) ? [state.currentBet > 0 ? 'raise' : 'bet'] : [])];
          return {
            mode: modeName(), handNumber: state.handNumber, street: streetName(state.street),
            opponentStyles: state.players.filter((item) => !item.human).map((item) => ({ name: item.name, style: t(`style.${item.aiStyle.key}`) })),
            hero: { position: player.position, cards: player.cards.map(cardText), stackBb: player.chips },
            board: state.board.map(cardText), potBb: sumPot(), toCallBb: due,
            humanToAct: state.humanTurn, availableActions,
            players: state.players.map((item) => ({ name: item.human ? t('player.you') : item.name, position: item.position, stackBb: item.chips, folded: item.folded, allIn: item.allIn, action: playerActionLabel(item) })),
            lastFeedback: state.currentReview ? { action: actionName(state.currentReview.actionKey, state.currentReview.actionKey === 'bet' || state.currentReview.actionKey === 'raise' ? state.currentReview.actionTarget : null), referenceFrequencyPercent: state.currentReview.match, handStrength: state.currentReview.handCategoryKey ? t(`hand.${state.currentReview.handCategoryKey}`) : null } : null,
            strategyNotice: t('review.localNotice')
          };
        }
      },
      {
        name: 'choose_poker_training_action',
        description: 'Choose the human player action in the current training spot. Only call this when get_poker_training_state says humanToAct=true, and choose one available action. A bet or raise target is the total amount invested on this street in big blinds.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['fold', 'check', 'call', 'bet', 'raise'] },
            targetTotalBb: { type: 'number', description: 'Total street bet after betting, in big blinds. Required for bet and raise.' }
          },
          required: ['action'], additionalProperties: false
        },
        annotations: { readOnlyHint: false },
        execute: async ({ action, targetTotalBb }) => {
          if (!state.humanTurn || state.handComplete) return { ok: false, message: t('review.notYourTurn'), state: { handNumber: state.handNumber, street: streetName(state.street) } };
          const due = currentToCall(hero());
          let normalized = action;
          if (action === 'bet' && state.currentBet > 0) normalized = 'raise';
          if (action === 'raise' && state.currentBet <= 0) normalized = 'bet';
          if (normalized === 'check' && due > 0.001) return { ok: false, message: t('review.cannotCheck') };
          if (normalized === 'call' && due <= 0.001) return { ok: false, message: t('review.cannotCall') };
          if (normalized === 'fold' && due <= 0.001) return { ok: false, message: t('review.cannotFold') };
          const raising = normalized === 'raise' || normalized === 'bet';
          if (raising && (state.actedSinceFullRaise.has(hero().id) || hero().chips <= due || hero().streetBet + hero().chips <= state.currentBet)) return { ok: false, message: t('review.cannotRaise') };
          const target = raising ? Number(targetTotalBb) : 0;
          if (raising && !Number.isFinite(target)) return { ok: false, message: t('review.targetRequired') };
          humanAction(normalized, target);
          return { ok: true, state: { handNumber: state.handNumber, street: streetName(state.street), humanToAct: state.humanTurn, handComplete: state.handComplete, feedback: state.currentReview ? { action: state.currentReview.actionLabel, referenceFrequencyPercent: state.currentReview.match } : null } };
        }
      },
      {
        name: 'start_next_poker_hand',
        description: 'Start another independent poker training hand. Optionally select full-hand, preflop-only, or postflop-only practice.',
        inputSchema: {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['full', 'preflop', 'postflop'] } },
          additionalProperties: false
        },
        annotations: { readOnlyHint: false },
        execute: async ({ mode }) => {
          if (mode) {
            state.mode = mode;
            document.querySelectorAll('.mode-button').forEach((button) => {
              const active = button.dataset.mode === mode;
              button.classList.toggle('active', active);
              button.setAttribute('aria-selected', String(active));
            });
          }
          startNewHand();
          return { ok: true, handNumber: state.handNumber, mode: modeName(), street: streetName(state.street) };
        }
      }
    ];
    for (const definition of definitions) {
      Promise.resolve(api.registerTool(definition)).catch(() => {});
    }
  }

  bindEvents();
  installWebMcpTools();
  renderHistory();
  startNewHand();
})();
