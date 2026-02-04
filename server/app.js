const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { connectDb, User, Group, Participant, Expense, toId } = require('./db');
const { computeBalances } = require('./balance');
const { parseMintSense, summarizeGroup } = require('./mintsense');

const app = express();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'splitmint_dev_secret';

const authMiddleware = async (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => Number((cents / 100).toFixed(2));

const ensureGroupOwner = async (groupId, userId) => {
  return Group.findOne({ _id: groupId, userId });
};

const mapParticipant = (p) => ({
  id: String(p._id),
  name: p.name,
  color: p.color || null,
  avatar: p.avatar || null,
  is_primary: p.isPrimary ? 1 : 0
});

const mapExpense = (e) => ({
  id: String(e._id),
  payer_id: String(e.payerId),
  amount: fromCents(e.amountCents),
  description: e.description,
  expense_date: e.expenseDate,
  split_mode: e.splitMode
});

const buildSplits = (amountCents, splitMode, participants, splitsInput) => {
  if (splitMode === 'equal') {
    const count = participants.length;
    const base = Math.floor(amountCents / count);
    let remainder = amountCents - base * count;
    return participants.map((p) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { participantId: p.id, amountCents: base + extra, percentage: null };
    });
  }

  if (splitMode === 'custom') {
    let total = 0;
    const mapped = splitsInput.map(s => {
      const cents = toCents(s.amount);
      total += cents;
      return { participantId: s.participantId, amountCents: cents, percentage: null };
    });
    if (total !== amountCents) throw new Error('Custom split must sum to total amount');
    return mapped;
  }

  if (splitMode === 'percentage') {
    let total = 0;
    const mapped = splitsInput.map(s => {
      const cents = Math.round(amountCents * (s.percentage / 100));
      total += cents;
      return { participantId: s.participantId, amountCents: cents, percentage: s.percentage };
    });
    const diff = amountCents - total;
    if (diff !== 0 && mapped.length) mapped[0].amountCents += diff;
    return mapped;
  }

  throw new Error('Invalid split mode');
};

app.post('/api/auth/register', async (req, res) => {
  try {
    await connectDb();
    const data = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) }).parse(req.body);
    const existing = await User.findOne({ email: data.email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(data.password, 10);
    const now = new Date().toISOString();
    const user = await User.create({ email: data.email, passwordHash: hash, name: data.name, createdAt: now });
    const payload = { id: String(user._id), email: user.email, name: user.name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: payload, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await connectDb();
    const data = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
    const user = await User.findOne({ email: data.email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const payload = { id: String(user._id), email: user.email, name: user.name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: payload, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/groups', authMiddleware, async (req, res) => {
  await connectDb();
  const groups = await Group.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ groups: groups.map(g => ({ id: String(g._id), name: g.name })) });
});

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const data = z.object({
      name: z.string().min(2),
      participants: z.array(z.object({ name: z.string().min(2), color: z.string().optional(), avatar: z.string().optional() })).max(3).optional()
    }).parse(req.body);

    const now = new Date().toISOString();
    const group = await Group.create({ userId: req.user.id, name: data.name, createdAt: now });
    await Participant.create({
      groupId: group._id,
      name: req.user.name,
      color: null,
      avatar: null,
      isPrimary: true,
      userId: req.user.id,
      createdAt: now
    });

    if (data.participants && data.participants.length) {
      const inserts = data.participants.map(p => ({
        groupId: group._id,
        name: p.name,
        color: p.color || null,
        avatar: p.avatar || null,
        isPrimary: false,
        userId: null,
        createdAt: now
      }));
      await Participant.insertMany(inserts);
    }

    res.json({ group: { id: String(group._id), name: group.name } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/groups/:id', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const group = await ensureGroupOwner(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const data = z.object({ name: z.string().min(2) }).parse(req.body);
    group.name = data.name;
    await group.save();
    res.json({ group: { id: String(group._id), name: group.name } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/groups/:id', authMiddleware, async (req, res) => {
  await connectDb();
  const group = await ensureGroupOwner(req.params.id, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  await Group.deleteOne({ _id: group._id });
  await Participant.deleteMany({ groupId: group._id });
  await Expense.deleteMany({ groupId: group._id });
  res.json({ ok: true });
});

app.get('/api/groups/:id/participants', authMiddleware, async (req, res) => {
  await connectDb();
  const group = await ensureGroupOwner(req.params.id, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const participants = await Participant.find({ groupId: group._id }).sort({ isPrimary: -1, createdAt: 1 });
  res.json({ participants: participants.map(mapParticipant) });
});

app.post('/api/groups/:id/participants', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const group = await ensureGroupOwner(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const count = await Participant.countDocuments({ groupId: group._id });
    if (count >= 4) return res.status(400).json({ error: 'Max 3 participants plus primary user' });

    const data = z.object({ name: z.string().min(2), color: z.string().optional(), avatar: z.string().optional() }).parse(req.body);
    const now = new Date().toISOString();
    const participant = await Participant.create({
      groupId: group._id,
      name: data.name,
      color: data.color || null,
      avatar: data.avatar || null,
      isPrimary: false,
      userId: null,
      createdAt: now
    });
    res.json({ participant: mapParticipant(participant) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/participants/:id', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const participant = await Participant.findById(req.params.id);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });
    const group = await ensureGroupOwner(participant.groupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const data = z.object({ name: z.string().min(2), color: z.string().optional(), avatar: z.string().optional() }).parse(req.body);
    participant.name = data.name;
    participant.color = data.color || null;
    participant.avatar = data.avatar || null;
    await participant.save();
    res.json({ participant: mapParticipant(participant) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/participants/:id', authMiddleware, async (req, res) => {
  await connectDb();
  const participant = await Participant.findById(req.params.id);
  if (!participant) return res.status(404).json({ error: 'Participant not found' });
  if (participant.isPrimary) return res.status(400).json({ error: 'Cannot remove primary participant' });
  const group = await ensureGroupOwner(participant.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const expenseCount = await Expense.countDocuments({
    groupId: group._id,
    'splits.participantId': participant._id
  });
  if (expenseCount > 0) return res.status(400).json({ error: 'Participant has linked expenses' });

  await Participant.deleteOne({ _id: participant._id });
  res.json({ ok: true });
});

app.get('/api/groups/:id/expenses', authMiddleware, async (req, res) => {
  await connectDb();
  const group = await ensureGroupOwner(req.params.id, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const filters = { groupId: group._id };
  const { q, participantId, dateFrom, dateTo, minAmount, maxAmount } = req.query;
  if (q) filters.description = { $regex: q, $options: 'i' };
  if (participantId) filters['splits.participantId'] = participantId;
  if (dateFrom || dateTo) {
    filters.expenseDate = {};
    if (dateFrom) filters.expenseDate.$gte = dateFrom;
    if (dateTo) filters.expenseDate.$lte = dateTo;
  }
  if (minAmount || maxAmount) {
    filters.amountCents = {};
    if (minAmount) filters.amountCents.$gte = toCents(minAmount);
    if (maxAmount) filters.amountCents.$lte = toCents(maxAmount);
  }

  const expenses = await Expense.find(filters).sort({ expenseDate: -1, createdAt: -1 });
  res.json({ expenses: expenses.map(mapExpense) });
});

app.post('/api/groups/:id/expenses', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const group = await ensureGroupOwner(req.params.id, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const data = z.object({
      amount: z.number().positive(),
      description: z.string().min(2),
      date: z.string(),
      payerId: z.string(),
      splitMode: z.enum(['equal', 'custom', 'percentage']),
      splits: z.array(z.object({ participantId: z.string(), amount: z.number().optional(), percentage: z.number().optional() }))
    }).parse(req.body);

    const participants = await Participant.find({ groupId: group._id });
    const participantMap = new Map(participants.map(p => [String(p._id), p]));
    if (!participantMap.has(data.payerId)) return res.status(400).json({ error: 'Invalid payer' });

    const splitParticipants = data.splitMode === 'equal'
      ? participants.map(p => ({ id: String(p._id) }))
      : data.splits.map(s => ({ id: s.participantId }));

    const amountCents = toCents(data.amount);
    const splits = buildSplits(amountCents, data.splitMode, splitParticipants, data.splits)
      .map(s => ({ participantId: s.participantId, amountCents: s.amountCents, percentage: s.percentage }));

    const now = new Date().toISOString();
    const expense = await Expense.create({
      groupId: group._id,
      payerId: data.payerId,
      amountCents,
      description: data.description,
      expenseDate: data.date,
      splitMode: data.splitMode,
      splits,
      createdAt: now
    });

    res.json({ expense: mapExpense(expense) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    const group = await ensureGroupOwner(expense.groupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const data = z.object({
      amount: z.number().positive(),
      description: z.string().min(2),
      date: z.string(),
      payerId: z.string(),
      splitMode: z.enum(['equal', 'custom', 'percentage']),
      splits: z.array(z.object({ participantId: z.string(), amount: z.number().optional(), percentage: z.number().optional() }))
    }).parse(req.body);

    const participants = await Participant.find({ groupId: group._id });
    const participantMap = new Map(participants.map(p => [String(p._id), p]));
    if (!participantMap.has(data.payerId)) return res.status(400).json({ error: 'Invalid payer' });

    const splitParticipants = data.splitMode === 'equal'
      ? participants.map(p => ({ id: String(p._id) }))
      : data.splits.map(s => ({ id: s.participantId }));

    const amountCents = toCents(data.amount);
    const splits = buildSplits(amountCents, data.splitMode, splitParticipants, data.splits)
      .map(s => ({ participantId: s.participantId, amountCents: s.amountCents, percentage: s.percentage }));

    expense.payerId = data.payerId;
    expense.amountCents = amountCents;
    expense.description = data.description;
    expense.expenseDate = data.date;
    expense.splitMode = data.splitMode;
    expense.splits = splits;
    await expense.save();

    res.json({ expense: mapExpense(expense) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', authMiddleware, async (req, res) => {
  await connectDb();
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  const group = await ensureGroupOwner(expense.groupId, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  await Expense.deleteOne({ _id: expense._id });
  res.json({ ok: true });
});

app.get('/api/groups/:id/balances', authMiddleware, async (req, res) => {
  await connectDb();
  const group = await ensureGroupOwner(req.params.id, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const participants = await Participant.find({ groupId: group._id });
  const expenses = await Expense.find({ groupId: group._id });

  const mappedParticipants = participants.map(mapParticipant);
  const mappedExpenses = expenses.map(e => ({
    id: String(e._id),
    payer_id: String(e.payerId),
    amount_cents: e.amountCents,
    splits: e.splits.map(s => ({ participant_id: String(s.participantId), amount_cents: s.amountCents }))
  }));

  const { balances, settlements } = computeBalances(mappedParticipants, mappedExpenses);
  res.json({
    balances: balances.map(b => ({
      participant: b.participant,
      paid: fromCents(b.paid),
      owed: fromCents(b.owed),
      net: fromCents(b.net)
    })),
    settlements: settlements.map(s => ({ ...s, amount: fromCents(s.amount_cents) }))
  });
});

app.get('/api/groups/:id/summary', authMiddleware, async (req, res) => {
  await connectDb();
  const group = await ensureGroupOwner(req.params.id, req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const participants = await Participant.find({ groupId: group._id });
  const expenses = await Expense.find({ groupId: group._id });

  const mappedParticipants = participants.map(mapParticipant);
  const mappedExpenses = expenses.map(e => ({
    id: String(e._id),
    payer_id: String(e.payerId),
    amount_cents: e.amountCents,
    splits: e.splits.map(s => ({ participant_id: String(s.participantId), amount_cents: s.amountCents }))
  }));

  const { balances } = computeBalances(mappedParticipants, mappedExpenses);
  const totalSpent = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const primary = mappedParticipants.find(p => p.is_primary);
  const primaryBalance = balances.find(b => b.participant.id === (primary ? primary.id : null));

  res.json({
    totalSpent: fromCents(totalSpent),
    owedByUser: primaryBalance ? fromCents(Math.max(0, -primaryBalance.net)) : 0,
    owedToUser: primaryBalance ? fromCents(Math.max(0, primaryBalance.net)) : 0
  });
});

app.post('/api/ai/parse', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const data = z.object({ text: z.string().min(3), groupId: z.string() }).parse(req.body);
    const group = await ensureGroupOwner(data.groupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const participants = await Participant.find({ groupId: group._id });
    const parsed = parseMintSense(data.text, participants.map(mapParticipant));
    res.json({ parsed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ai/summary', authMiddleware, async (req, res) => {
  try {
    await connectDb();
    const data = z.object({ groupId: z.string() }).parse(req.body);
    const group = await ensureGroupOwner(data.groupId, req.user.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const participants = await Participant.find({ groupId: group._id });
    const expenses = await Expense.find({ groupId: group._id });

    const mappedParticipants = participants.map(mapParticipant);
    const mappedExpenses = expenses.map(e => ({
      id: String(e._id),
      payer_id: String(e.payerId),
      amount_cents: e.amountCents,
      splits: e.splits.map(s => ({ participant_id: String(s.participantId), amount_cents: s.amountCents }))
    }));

    const { balances } = computeBalances(mappedParticipants, mappedExpenses);
    const summary = summarizeGroup(group.name, balances);
    res.json({ summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = app;
