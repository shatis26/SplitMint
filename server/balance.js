const computeBalances = (participants, expenses) => {
  const balances = new Map();
  participants.forEach(p => balances.set(p.id, { participant: p, paid: 0, owed: 0, net: 0 }));

  expenses.forEach(exp => {
    const payer = balances.get(exp.payer_id);
    if (payer) payer.paid += exp.amount_cents;
    exp.splits.forEach(s => {
      const entry = balances.get(s.participant_id);
      if (entry) entry.owed += s.amount_cents;
    });
  });

  balances.forEach(b => { b.net = b.paid - b.owed; });

  const creditors = [];
  const debtors = [];
  balances.forEach(b => {
    if (b.net > 0) creditors.push({ id: b.participant.id, amount: b.net });
    if (b.net < 0) debtors.push({ id: b.participant.id, amount: -b.net });
  });

  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);
    if (pay > 0) {
      settlements.push({ from: debtor.id, to: creditor.id, amount_cents: pay });
      debtor.amount -= pay;
      creditor.amount -= pay;
    }
    if (debtor.amount === 0) i += 1;
    if (creditor.amount === 0) j += 1;
  }

  return { balances: Array.from(balances.values()), settlements };
};

module.exports = { computeBalances };
