(() => {
  'use strict';

  const LANGUAGE_KEY = 'riverlab:poker:language:v1';
  const messages = {
    'meta.title': { 'zh-CN': 'River Lab — 德州扑克训练桌', en: 'River Lab — Texas Hold’em Trainer' },
    'meta.description': { 'zh-CN': '与五位 AI 对手练习德州扑克，复盘翻前与翻后决策。', en: 'Practice Texas Hold’em against five AI opponents and review preflop and postflop decisions.' },
    'nav.aria': { 'zh-CN': '主导航', en: 'Main navigation' },
    'nav.training': { 'zh-CN': '训练桌', en: 'Training table' },
    'player.avatar': { 'zh-CN': '你', en: 'Y' },
    'player.label': { 'zh-CN': '练习玩家', en: 'Practice player' },
    'player.you': { 'zh-CN': '你', en: 'You' },
    'language.group': { 'zh-CN': '界面语言', en: 'Interface language' },
    'page.eyebrow': { 'zh-CN': 'TRAINING ROOM · 6 MAX', en: 'TRAINING ROOM · 6 MAX' },
    'page.title': { 'zh-CN': '德州扑克训练桌', en: 'Texas Hold’em Trainer' },
    'stats.hands': { 'zh-CN': '本次手数', en: 'Hands' },
    'stats.accuracy': { 'zh-CN': '策略匹配率', en: 'Strategy match' },
    'stats.chips': { 'zh-CN': '筹码变化', en: 'Chip change' },
    'modes.aria': { 'zh-CN': '训练模式', en: 'Training mode' },
    'mode.full': { 'zh-CN': '整手练习', en: 'Full hand' },
    'mode.preflop': { 'zh-CN': '翻前专项', en: 'Preflop' },
    'mode.postflop': { 'zh-CN': '翻后专项', en: 'Postflop' },
    'range.label': { 'zh-CN': '翻前范围', en: 'Preflop range' },
    'range.hint': { 'zh-CN': '下手生效', en: 'Applies next hand' },
    'range.aria': { 'zh-CN': '在翻前参考范围上扩宽百分比', en: 'Expand the preflop reference range' },
    'range.title': { 'zh-CN': '当前手不变，下一手按新范围发牌', en: 'This hand stays the same; the new range applies next hand' },
    'range.current': { 'zh-CN': '范围', en: 'Range' },
    'range.gtoExtra': { 'zh-CN': 'GTO +{percent}%', en: 'GTO +{percent}%' },
    'range.open': { 'zh-CN': '开池', en: 'Open' },
    'range.bbOpen': { 'zh-CN': 'BB · 防守后位开池', en: 'BB · Defend vs. late open' },
    'style.aria': { 'zh-CN': 'AI 对手风格', en: 'AI opponent styles' },
    'style.title': { 'zh-CN': 'AI 对手风格', en: 'AI opponent styles' },
    'style.note': { 'zh-CN': '每手为五位 AI 分别随机抽取风格', en: 'Each AI gets a random style every hand' },
    'style.tight-passive': { 'zh-CN': '紧弱', en: 'Tight-passive' },
    'style.tight-passive.short': { 'zh-CN': '紧弱', en: 'T-P' },
    'style.tight-aggressive': { 'zh-CN': '紧凶', en: 'Tight-aggressive' },
    'style.tight-aggressive.short': { 'zh-CN': '紧凶', en: 'T-A' },
    'style.loose-passive': { 'zh-CN': '松弱', en: 'Loose-passive' },
    'style.loose-passive.short': { 'zh-CN': '松弱', en: 'L-P' },
    'style.loose-aggressive': { 'zh-CN': '松凶', en: 'Loose-aggressive' },
    'style.loose-aggressive.short': { 'zh-CN': '松凶', en: 'L-A' },
    'style.balanced': { 'zh-CN': '均衡', en: 'Balanced' },
    'style.balanced.short': { 'zh-CN': '均衡', en: 'BAL' },
    'table.aria': { 'zh-CN': '德州扑克牌桌', en: 'Texas Hold’em table' },
    'table.blinds': { 'zh-CN': '盲注', en: 'Blinds' },
    'table.dealer': { 'zh-CN': '庄家', en: 'Dealer' },
    'table.handId': { 'zh-CN': '手牌 #{number}', en: 'Hand #{number}' },
    'table.dealing': { 'zh-CN': '正在发牌…', en: 'Dealing…' },
    'board.aria': { 'zh-CN': '公共牌', en: 'Community cards' },
    'board.empty': { 'zh-CN': '公共牌', en: 'Board' },
    'card.hidden': { 'zh-CN': '暗牌', en: 'Face-down card' },
    'pot.label': { 'zh-CN': '底池', en: 'Pot' },
    'action.fold': { 'zh-CN': '弃牌', en: 'Fold' },
    'action.check': { 'zh-CN': '过牌', en: 'Check' },
    'action.call': { 'zh-CN': '跟注', en: 'Call' },
    'action.callAmount': { 'zh-CN': '跟注 {amount} bb', en: 'Call {amount} bb' },
    'action.bet': { 'zh-CN': '下注', en: 'Bet' },
    'action.raise': { 'zh-CN': '加注', en: 'Raise' },
    'action.reraise': { 'zh-CN': '再加注', en: 'Re-raise' },
    'action.betTo': { 'zh-CN': '下注至 {amount} bb', en: 'Bet to {amount} bb' },
    'action.raiseTo': { 'zh-CN': '加注至 {amount} bb', en: 'Raise to {amount} bb' },
    'action.allin': { 'zh-CN': '全下', en: 'All-in' },
    'raise.aria': { 'zh-CN': '加注到多少 bb', en: 'Raise to how many bb' },
    'size.pot': { 'zh-CN': '底池', en: 'Pot' },
    'feedback.title': { 'zh-CN': '决策反馈', en: 'Decision review' },
    'feedback.live': { 'zh-CN': '训练中', en: 'Training' },
    'decision.waiting': { 'zh-CN': '等待你的选择', en: 'Your decision' },
    'decision.intro': { 'zh-CN': '观察位置、底池赔率和牌面结构，再选择行动。', en: 'Consider your position, pot odds, and board texture before acting.' },
    'strategy.title': { 'zh-CN': '参考行动频率', en: 'Action frequencies' },
    'strategy.empty': { 'zh-CN': '做出选择后显示本地策略参考', en: 'Local strategy reference appears after your decision' },
    'notice.title': { 'zh-CN': 'AI 对手', en: 'AI opponents' },
    'notice.text': { 'zh-CN': '每手为五位 AI 分别随机抽取一种风格：紧弱、紧凶、松弱、松凶或均衡；行动以 Fullhouse Bot 原版为基础，再按风格做轻微倾向调整。训练频率是近似参考，不是真实求解器 GTO 频率。', en: 'Each hand, every AI independently draws a tight-passive, tight-aggressive, loose-passive, loose-aggressive, or balanced style. Fullhouse Bot provides the base action, with small adjustments for each style. Training frequencies are approximations, not solver GTO frequencies.' },
    'ai.serviceFallback': { 'zh-CN': 'Fullhouse 服务暂不可用，本手使用本地 AI', en: 'Fullhouse service is unavailable; using local AI for this hand' },
    'next.deal': { 'zh-CN': '发下一手', en: 'Deal next hand' },
    'next.skip': { 'zh-CN': '跳过本手', en: 'Skip this hand' },
    'history.title': { 'zh-CN': '近 7 天记录', en: 'Last 7 days' },
    'history.note': { 'zh-CN': '本机浏览器保存 · 7 天后自动过期', en: 'Saved in this browser · expires after 7 days' },
    'history.device': { 'zh-CN': '设备', en: 'Device' },
    'history.summary': { 'zh-CN': '近七天汇总', en: 'Last 7 days summary' },
    'history.count': { 'zh-CN': '完成记录', en: 'Completed' },
    'history.net': { 'zh-CN': '整手净变化', en: 'Full-hand net' },
    'history.match': { 'zh-CN': '平均策略匹配', en: 'Avg. strategy match' },
    'history.empty': { 'zh-CN': '完成一手牌或训练节点后，会显示在这里。', en: 'Completed hands and training spots will appear here.' },
    'history.matched': { 'zh-CN': '匹配 {percent}%', en: 'Matched {percent}%' },
    'history.trainingComplete': { 'zh-CN': '训练完成', en: 'Training complete' },
    'history.hand': { 'zh-CN': '手牌 {cards}', en: 'Hand {cards}' },
    'history.board': { 'zh-CN': '公共牌 {cards}', en: 'Board {cards}' },
    'street.preflop': { 'zh-CN': '翻牌前', en: 'Preflop' },
    'street.flop': { 'zh-CN': '翻牌圈', en: 'Flop' },
    'street.turn': { 'zh-CN': '转牌圈', en: 'Turn' },
    'street.river': { 'zh-CN': '河牌圈', en: 'River' },
    'street.showdown': { 'zh-CN': '摊牌', en: 'Showdown' },
    'result.trainingFinished': { 'zh-CN': '{prefix} · {action}', en: '{prefix} · {action}' },
    'result.preflopNodeEnded': { 'zh-CN': '翻前节点结束', en: 'Preflop spot complete' },
    'result.trainingNodeEnded': { 'zh-CN': '训练节点完成', en: 'Training spot complete' },
    'result.preflopModeDone': { 'zh-CN': '翻前专项完成', en: 'Preflop practice complete' },
    'result.postflopModeDone': { 'zh-CN': '翻后专项完成', en: 'Postflop practice complete' },
    'result.noDecision': { 'zh-CN': '本手无决策', en: 'No decision this hand' },
    'result.handComplete': { 'zh-CN': '本手结束', en: 'Hand complete' },
    'result.youWin': { 'zh-CN': '你赢下 {amount} bb', en: 'You win {amount} bb' },
    'result.botWinsPot': { 'zh-CN': '{name} 赢下底池', en: '{name} wins the pot' },
    'result.split': { 'zh-CN': '摊牌平分 · 你拿回 {amount} bb', en: 'Split pot · you take back {amount} bb' },
    'result.heroWins': { 'zh-CN': '你以{hand}赢下 {amount} bb', en: 'You win {amount} bb with {hand}' },
    'result.opponentWins': { 'zh-CN': '{name} 以{hand}赢下底池', en: '{name} wins the pot with {hand}' },
    'status.yourTurnFacing': { 'zh-CN': '轮到你行动 · 面对 {amount} bb', en: 'Your turn · {amount} bb to call' },
    'status.yourTurnOpen': { 'zh-CN': '轮到你行动 · 可以过牌或下注', en: 'Your turn · check or bet' },
    'status.actor': { 'zh-CN': '{name} 正在行动…', en: '{name} to act…' },
    'status.waiting': { 'zh-CN': '等待行动…', en: 'Waiting for action…' },
    'status.trainingSpots': { 'zh-CN': '训练点', en: 'Training spots' },
    'status.session': { 'zh-CN': '模拟现金局 · {stack} bb · bb 为大盲注', en: 'Cash game · {stack} bb · bb = big blind' },
    'status.practice': { 'zh-CN': '{mode} · 每次练一个决策节点 · 频率为本地策略估算', en: '{mode} · One decision spot at a time · locally estimated frequencies' },
    'node.position': { 'zh-CN': '位置', en: 'Position' },
    'node.hand': { 'zh-CN': '手牌', en: 'Hand' },
    'node.board': { 'zh-CN': '牌面', en: 'Board' },
    'node.potStack': { 'zh-CN': '底池 / 有效筹码', en: 'Pot / effective stack' },
    'node.preflopPosition': { 'zh-CN': '翻前位置', en: 'Preflop position' },
    'node.inPosition': { 'zh-CN': '有位置', en: 'In position' },
    'node.outOfPosition': { 'zh-CN': '无位置', en: 'Out of position' },
    'board.waiting': { 'zh-CN': '等待翻牌', en: 'Waiting for flop' },
    'feedback.nodeEnded': { 'zh-CN': '节点结束', en: 'Spot complete' },
    'feedback.yourTurn': { 'zh-CN': '轮到你', en: 'Your turn' },
    'feedback.aiActing': { 'zh-CN': 'AI行动中', en: 'AI acting' },
    'review.yourChoice': { 'zh-CN': '你的选择', en: 'Your choice' },
    'review.handResult': { 'zh-CN': '本手结果', en: 'Hand result' },
    'review.reference': { 'zh-CN': '参考频率 {percent}%', en: 'Reference frequency {percent}%' },
    'review.preflopEquity': { 'zh-CN': '翻前范围估算', en: 'Preflop range estimate' },
    'review.randomEquity': { 'zh-CN': '随机手牌权益估算 {percent}%', en: 'Estimated equity vs. random hands: {percent}%' },
    'review.handStrength': { 'zh-CN': '当前牌力：{hand}', en: 'Current hand: {hand}' },
    'review.preflopStrength': { 'zh-CN': '翻前手牌强度结合位置与下注压力评估', en: 'Preflop hand strength is estimated from position and betting pressure' },
    'review.sentenceSeparator': { 'zh-CN': '。', en: '. ' },
    'review.localFrequency': { 'zh-CN': '本地参考频率', en: 'Local reference frequencies' },
    'review.frequency': { 'zh-CN': '参考频率', en: 'Reference frequencies' },
    'review.approximation': { 'zh-CN': '参考频率是本地简化模型的训练提示', en: 'These frequencies are training guidance from a simplified local model' },
    'review.fullHandStarted': { 'zh-CN': '每手以 {stack} bb 开始。发下一手继续练习。', en: 'Each hand starts with {stack} bb. Deal the next hand to keep practicing.' },
    'review.specialtyNote': { 'zh-CN': '参考频率可帮助比较不同选择；本专项不模拟完整后续行动。', en: 'Use reference frequencies to compare choices. This mode does not simulate the rest of the hand.' },
    'review.toCall': { 'zh-CN': '需要跟注 {amount} bb。可以弃牌、跟注或加注。', en: 'Call {amount} bb to continue. You can fold, call, or raise.' },
    'review.noBet': { 'zh-CN': '当前无人下注。可以过牌或选择下注尺寸。', en: 'No bet to call. You can check or choose a bet size.' },
    'review.facing': { 'zh-CN': '面对 {amount} bb', en: 'Facing {amount} bb' },
    'review.actionSpot': { 'zh-CN': '行动空间', en: 'Your action' },
    'review.chooseFrequency': { 'zh-CN': '选择后显示参考频率。', en: 'Reference frequencies appear after your choice.' },
    'review.waitNext': { 'zh-CN': '发下一手进入新的练习节点', en: 'Deal the next hand to start a new spot' },
    'review.localStrategy': { 'zh-CN': '做出选择后显示本地策略参考', en: 'Local strategy reference appears after your decision' },
    'review.yourAction': { 'zh-CN': '轮到你时选择行动', en: 'Choose an action when it is your turn' },
    'review.opponentPrompt': { 'zh-CN': '你的位置是 {position}，手牌 {cards}。留意对手下注和底池变化。', en: 'You are in {position} with {cards}. Watch the action and pot size.' },
    'review.localNotice': { 'zh-CN': '参考频率由本地简化模型估算，不是求解器计算出的真实 GTO 解。', en: 'Reference frequencies are estimated by a local model, not solved GTO frequencies.' },
    'review.notYourTurn': { 'zh-CN': '当前不是你的行动节点。', en: 'It is not your turn to act.' },
    'review.cannotCheck': { 'zh-CN': '当前需要跟注，不能过牌。', en: 'You are facing a bet and cannot check.' },
    'review.cannotCall': { 'zh-CN': '当前没有下注可跟，可以过牌或下注。', en: 'There is no bet to call. You can check or bet.' },
    'review.cannotFold': { 'zh-CN': '无人下注时不能弃牌。', en: 'You cannot fold when no bet is facing you.' },
    'review.cannotRaise': { 'zh-CN': '此节点不能再加注。', en: 'You cannot raise again in this spot.' },
    'review.targetRequired': { 'zh-CN': '下注或加注需要提供 targetTotalBb。', en: 'A bet or raise requires targetTotalBb.' },
    'opponent.generic': { 'zh-CN': '对手', en: 'Opponent' },
    'hand.highCard': { 'zh-CN': '高牌', en: 'High card' },
    'hand.onePair': { 'zh-CN': '一对', en: 'One pair' },
    'hand.twoPair': { 'zh-CN': '两对', en: 'Two pair' },
    'hand.trips': { 'zh-CN': '三条', en: 'Three of a kind' },
    'hand.straight': { 'zh-CN': '顺子', en: 'Straight' },
    'hand.flush': { 'zh-CN': '同花', en: 'Flush' },
    'hand.fullHouse': { 'zh-CN': '葫芦', en: 'Full house' },
    'hand.quads': { 'zh-CN': '四条', en: 'Four of a kind' },
    'hand.straightFlush': { 'zh-CN': '同花顺', en: 'Straight flush' }
  };

  function detectLanguage() {
    const preferences = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
    for (const preference of preferences) {
      if (/^zh(?:-|$)/i.test(preference)) return 'zh-CN';
      if (/^en(?:-|$)/i.test(preference)) return 'en';
    }
    return 'en';
  }

  function getSavedLanguage() {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_KEY);
      return saved === 'zh-CN' || saved === 'en' ? saved : null;
    } catch (_) {
      return null;
    }
  }

  let language = getSavedLanguage() || detectLanguage();

  function translate(key, variables = {}) {
    const message = messages[key];
    let output = message ? (message[language] || message.en || message['zh-CN']) : key;
    output = String(output ?? key ?? '');
    return output.replace(/\{([\w]+)\}/g, (match, name) => String(variables[name] ?? match));
  }

  function applyStaticTranslations() {
    document.documentElement.lang = language;
    document.title = translate('meta.title');
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = translate(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      element.setAttribute('aria-label', translate(element.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      element.setAttribute('title', translate(element.dataset.i18nTitle));
    });
    document.querySelectorAll('[data-i18n-content]').forEach((element) => {
      element.setAttribute('content', translate(element.dataset.i18nContent));
    });
    document.querySelectorAll('[data-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
  }

  function setLanguage(nextLanguage) {
    if (nextLanguage !== 'zh-CN' && nextLanguage !== 'en') return;
    if (language === nextLanguage) return;
    language = nextLanguage;
    try { window.localStorage.setItem(LANGUAGE_KEY, language); } catch (_) { /* Language still changes for this page view. */ }
    applyStaticTranslations();
    window.dispatchEvent(new CustomEvent('poker-language-change', { detail: { language } }));
  }

  window.PokerI18n = {
    t: translate,
    setLanguage,
    get language() { return language; },
    get locale() { return language === 'zh-CN' ? 'zh-CN' : 'en-US'; }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-language]');
    if (button) setLanguage(button.dataset.language);
  });
  applyStaticTranslations();
})();
