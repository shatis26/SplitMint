const parseMintSense = (text, participants) => {
  const lower = text.toLowerCase();
  const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  const date = new Date();
  if (lower.includes('yesterday')) {
    date.setDate(date.getDate() - 1);
  }

  let payer = participants.find(p => lower.includes(p.name.toLowerCase()));
  const paidByMatch = lower.match(/paid by ([a-z\s]+)/);
  if (paidByMatch) {
    const name = paidByMatch[1].trim();
    payer = participants.find(p => p.name.toLowerCase() === name);
  }

  const forMatch = lower.match(/for ([a-z,\s]+)/);
  let splitParticipants = participants;
  if (forMatch) {
    const names = forMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const matched = participants.filter(p => names.includes(p.name.toLowerCase()));
    if (matched.length) splitParticipants = matched;
  }

  const category = inferCategory(lower);

  return {
    amount,
    description: text,
    date: date.toISOString().slice(0, 10),
    payerId: payer ? payer.id : null,
    splitParticipantIds: splitParticipants.map(p => p.id),
    category
  };
};

const inferCategory = (text) => {
  const rules = [
    { key: 'food', words: ['food', 'dinner', 'lunch', 'breakfast', 'restaurant', 'cafe'] },
    { key: 'travel', words: ['taxi', 'uber', 'bus', 'train', 'flight', 'hotel'] },
    { key: 'groceries', words: ['grocery', 'supermarket', 'market'] },
    { key: 'utilities', words: ['electric', 'water', 'internet', 'phone'] },
    { key: 'entertainment', words: ['movie', 'cinema', 'game', 'concert'] }
  ];
  for (const rule of rules) {
    if (rule.words.some(w => text.includes(w))) return rule.key;
  }
  return 'general';
};

const summarizeGroup = (groupName, balances) => {
  const lines = balances.map(b => {
    const amount = (Math.abs(b.net) / 100).toFixed(2);
    if (b.net > 0) return `${b.participant.name} should receive ₹${amount}`;
    if (b.net < 0) return `${b.participant.name} owes ₹${amount}`;
    return `${b.participant.name} is settled`;
  });
  return `Group ${groupName}: ${lines.join('; ')}`;
};

module.exports = { parseMintSense, summarizeGroup };
