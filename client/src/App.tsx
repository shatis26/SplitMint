import React, { useEffect, useMemo, useState } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api';

type User = { id: string; name: string; email: string };
type Group = { id: string; name: string };
type Participant = { id: string; name: string; color?: string | null; avatar?: string | null; is_primary?: number };

type Expense = {
  id: string;
  amount: number;
  description: string;
  expense_date: string;
  payer_id: string;
  split_mode: 'equal' | 'custom' | 'percentage';
};

type BalanceRow = {
  participant: Participant;
  paid: number;
  owed: number;
  net: number;
};

type Settlement = { from: string; to: string; amount: number };

type Summary = { totalSpent: number; owedByUser: number; owedToUser: number };

const api = async (path: string, token: string | null, options: RequestInit = {}) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const formatMoney = (val: number) => `₹${val.toFixed(2)}`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('splitmint_token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [groupName, setGroupName] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [participantColor, setParticipantColor] = useState('');

  const [expenseForm, setExpenseForm] = useState({
    id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    payerId: '',
    splitMode: 'equal' as 'equal' | 'custom' | 'percentage',
    splits: [] as { participantId: string; amount?: string; percentage?: string }[]
  });

  const [filters, setFilters] = useState({ q: '', participantId: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '' });

  const [mintText, setMintText] = useState('');
  const [mintOutput, setMintOutput] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/auth/me', token)
      .then((data) => setUser(data.user))
      .catch(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('splitmint_token');
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api('/groups', token).then((data) => setGroups(data.groups));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedGroup) return;
    refreshGroup(selectedGroup.id);
  }, [token, selectedGroup?.id]);

  useEffect(() => {
    if (participants.length) {
      setExpenseForm((prev) => (prev.payerId ? prev : { ...prev, payerId: participants[0].id }));
    }
  }, [participants]);

  const refreshGroup = async (groupId: string) => {
    const participantsData = await api(`/groups/${groupId}/participants`, token);
    setParticipants(participantsData.participants);
    const expensesData = await api(`/groups/${groupId}/expenses?${new URLSearchParams(cleanFilters(filters)).toString()}`, token);
    setExpenses(expensesData.expenses);
    const balanceData = await api(`/groups/${groupId}/balances`, token);
    setBalances(balanceData.balances);
    setSettlements(balanceData.settlements);
    const summaryData = await api(`/groups/${groupId}/summary`, token);
    setSummary(summaryData);
  };

  const cleanFilters = (input: typeof filters) => {
    const cleaned: Record<string, string> = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value) cleaned[key] = value;
    });
    return cleaned;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const form = new FormData(e.target as HTMLFormElement);
    const payload: Record<string, string> = {
      email: String(form.get('email') || ''),
      password: String(form.get('password') || '')
    };
    if (authMode === 'register') payload.name = String(form.get('name') || '');
    try {
      const data = await api(`/auth/${authMode}`, null, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('splitmint_token', data.token);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const data = await api('/groups', token, {
      method: 'POST',
      body: JSON.stringify({ name: groupName.trim() })
    });
    setGroups([data.group, ...groups]);
    setGroupName('');
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup) return;
    const data = await api(`/groups/${selectedGroup.id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ name: selectedGroup.name })
    });
    setGroups(groups.map(g => g.id === data.group.id ? data.group : g));
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;
    await api(`/groups/${selectedGroup.id}`, token, { method: 'DELETE' });
    setGroups(groups.filter(g => g.id !== selectedGroup.id));
    setSelectedGroup(null);
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !participantName.trim()) return;
    const data = await api(`/groups/${selectedGroup.id}/participants`, token, {
      method: 'POST',
      body: JSON.stringify({ name: participantName.trim(), color: participantColor || undefined })
    });
    setParticipants([...participants, data.participant]);
    setParticipantName('');
    setParticipantColor('');
  };

  const handleRemoveParticipant = async (id: string) => {
    await api(`/participants/${id}`, token, { method: 'DELETE' });
    setParticipants(participants.filter(p => p.id !== id));
    refreshGroup(selectedGroup!.id);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    const payload: any = {
      amount: Number(expenseForm.amount),
      description: expenseForm.description,
      date: expenseForm.date,
      payerId: expenseForm.payerId,
      splitMode: expenseForm.splitMode,
      splits: [] as any[]
    };

    if (expenseForm.splitMode === 'custom') {
      payload.splits = expenseForm.splits.map(s => ({ participantId: s.participantId, amount: Number(s.amount) }));
    } else if (expenseForm.splitMode === 'percentage') {
      payload.splits = expenseForm.splits.map(s => ({ participantId: s.participantId, percentage: Number(s.percentage) }));
    } else {
      payload.splits = participants.map(p => ({ participantId: p.id }));
    }

    if (expenseForm.id) {
      await api(`/expenses/${expenseForm.id}`, token, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api(`/groups/${selectedGroup.id}/expenses`, token, { method: 'POST', body: JSON.stringify(payload) });
    }

    setExpenseForm({
      id: '',
      amount: '',
      description: '',
      date: new Date().toISOString().slice(0, 10),
      payerId: participants[0]?.id || '',
      splitMode: 'equal',
      splits: []
    });
    refreshGroup(selectedGroup.id);
  };

  const handleEditExpense = (expense: Expense) => {
    setExpenseForm({
      id: expense.id,
      amount: String(expense.amount),
      description: expense.description,
      date: expense.expense_date,
      payerId: expense.payer_id,
      splitMode: expense.split_mode,
      splits: participants.map(p => ({ participantId: p.id }))
    });
  };

  const handleDeleteExpense = async (id: string) => {
    await api(`/expenses/${id}`, token, { method: 'DELETE' });
    refreshGroup(selectedGroup!.id);
  };

  const handleMintSense = async () => {
    if (!selectedGroup) return;
    const data = await api('/ai/parse', token, {
      method: 'POST',
      body: JSON.stringify({ text: mintText, groupId: selectedGroup.id })
    });
    setMintOutput(JSON.stringify(data.parsed, null, 2));
    if (data.parsed) {
      setExpenseForm({
        id: '',
        amount: data.parsed.amount ? String(data.parsed.amount) : '',
        description: data.parsed.description || mintText,
        date: data.parsed.date,
        payerId: data.parsed.payerId || participants[0]?.id || '',
        splitMode: 'equal',
        splits: []
      });
    }
  };

  const handleMintSummary = async () => {
    if (!selectedGroup) return;
    const data = await api('/ai/summary', token, {
      method: 'POST',
      body: JSON.stringify({ groupId: selectedGroup.id })
    });
    setMintOutput(data.summary);
  };

  const applyFilters = async () => {
    if (!selectedGroup) return;
    refreshGroup(selectedGroup.id);
  };

  const totalByParticipant = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach(b => map.set(b.participant.id, b.paid));
    return map;
  }, [balances]);

  if (!user) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>SplitMint</h1>
          <p className="tagline">Splite Your Bills</p>
          <form onSubmit={handleAuth}>
            {authMode === 'register' && (
              <input name="name" placeholder="Name" required />
            )}
            <input name="email" placeholder="Email" type="email" required />
            <input name="password" placeholder="Password" type="password" required />
            {authError && <div className="error">{authError}</div>}
            <button type="submit">{authMode === 'login' ? 'Login' : 'Register'}</button>
          </form>
          <button className="ghost" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>SplitMint</h1>
          <span className="tagline">Splite Your Bills</span>
        </div>
        <div className="header-actions">
          <span>Welcome, {user.name}</span>
          <button
            className="ghost"
            onClick={() => {
              setUser(null);
              setToken(null);
              localStorage.removeItem('splitmint_token');
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <main>
        <section className="sidebar">
          <h2>Groups</h2>
          <form onSubmit={handleCreateGroup} className="inline-form">
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="New group name" />
            <button type="submit">Add</button>
          </form>
          <div className="group-list">
            {groups.map(g => (
              <button
                key={g.id}
                className={`group-item ${selectedGroup?.id === g.id ? 'active' : ''}`}
                onClick={() => setSelectedGroup(g)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </section>

        {selectedGroup ? (
          <section className="content">
            <div className="group-header">
              <input
                value={selectedGroup.name}
                onChange={e => setSelectedGroup({ ...selectedGroup, name: e.target.value })}
                onBlur={handleUpdateGroup}
              />
              <button className="danger" onClick={handleDeleteGroup}>Delete Group</button>
            </div>

            <div className="summary-grid">
              <div className="card">
                <h3>Total Spent</h3>
                <p>{summary ? formatMoney(summary.totalSpent) : '$0.00'}</p>
              </div>
              <div className="card">
                <h3>You Owe</h3>
                <p>{summary ? formatMoney(summary.owedByUser) : '$0.00'}</p>
              </div>
              <div className="card">
                <h3>Owed To You</h3>
                <p>{summary ? formatMoney(summary.owedToUser) : '$0.00'}</p>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Participants</h3>
                <form onSubmit={handleAddParticipant} className="inline-form">
                  <input value={participantName} onChange={e => setParticipantName(e.target.value)} placeholder="Name" />
                  <input value={participantColor} onChange={e => setParticipantColor(e.target.value)} placeholder="Color" />
                  <button type="submit">Add</button>
                </form>
              </div>
              <div className="pill-grid">
                {participants.map(p => (
                  <div key={p.id} className="pill" style={{ borderColor: p.color || '#9ad1b3' }}>
                    <span>{p.name}</span>
                    {!p.is_primary && (
                      <button className="ghost" onClick={() => handleRemoveParticipant(p.id)}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Add / Edit Expense</h3>
              </div>
              <form onSubmit={handleExpenseSubmit} className="expense-form">
                <input value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="Description" required />
                <input value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="Amount" type="number" step="0.01" required />
                <input value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} type="date" required />
                <select value={expenseForm.payerId} onChange={e => setExpenseForm({ ...expenseForm, payerId: e.target.value })}>
                  {participants.map(p => (
                    <option key={p.id} value={p.id}>{p.name} paid</option>
                  ))}
                </select>
                <select value={expenseForm.splitMode} onChange={e => setExpenseForm({ ...expenseForm, splitMode: e.target.value as any })}>
                  <option value="equal">Equal</option>
                  <option value="custom">Custom</option>
                  <option value="percentage">Percentage</option>
                </select>

                {(expenseForm.splitMode === 'custom' || expenseForm.splitMode === 'percentage') && (
                  <div className="split-grid">
                    {participants.map(p => (
                      <div key={p.id} className="split-row">
                        <span>{p.name}</span>
                        {expenseForm.splitMode === 'custom' ? (
                          <input
                            placeholder="Amount"
                            type="number"
                            step="0.01"
                            onChange={e => setExpenseForm({
                              ...expenseForm,
                              splits: upsertSplit(expenseForm.splits, p.id, 'amount', e.target.value)
                            })}
                          />
                        ) : (
                          <input
                            placeholder="%"
                            type="number"
                            step="0.1"
                            onChange={e => setExpenseForm({
                              ...expenseForm,
                              splits: upsertSplit(expenseForm.splits, p.id, 'percentage', e.target.value)
                            })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button type="submit">{expenseForm.id ? 'Update Expense' : 'Add Expense'}</button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Search & Filters</h3>
              </div>
              <div className="filter-grid">
                <input placeholder="Search text" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
                <select value={filters.participantId} onChange={e => setFilters({ ...filters, participantId: e.target.value })}>
                  <option value="">All participants</option>
                  {participants.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
                <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
                <input placeholder="Min amount" value={filters.minAmount} onChange={e => setFilters({ ...filters, minAmount: e.target.value })} />
                <input placeholder="Max amount" value={filters.maxAmount} onChange={e => setFilters({ ...filters, maxAmount: e.target.value })} />
                <button onClick={applyFilters}>Apply</button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Transaction History</h3>
              </div>
              <div className="table">
                <div className="table-row header">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Amount</span>
                  <span>Payer</span>
                  <span>Actions</span>
                </div>
                {expenses.map(exp => (
                  <div key={exp.id} className="table-row">
                    <span>{exp.expense_date}</span>
                    <span>{exp.description}</span>
                    <span>{formatMoney(exp.amount)}</span>
                    <span>{participants.find(p => p.id === exp.payer_id)?.name || 'Unknown'}</span>
                    <span className="table-actions">
                      <button className="ghost" onClick={() => handleEditExpense(exp)}>Edit</button>
                      <button className="ghost danger" onClick={() => handleDeleteExpense(exp.id)}>Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Balances & Settlements</h3>
              </div>
              <div className="balance-grid">
                <div>
                  {balances.map(b => (
                    <div key={b.participant.id} className="balance-row">
                      <span>{b.participant.name}</span>
                      <span>Paid {formatMoney(b.paid)}</span>
                      <span>Owes {formatMoney(b.owed)}</span>
                      <span className={b.net >= 0 ? 'positive' : 'negative'}>{formatMoney(b.net)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4>Settlement Suggestions</h4>
                  {settlements.length === 0 && <p className="muted">All settled.</p>}
                  {settlements.map((s, idx) => (
                    <p key={idx}>
                      {participants.find(p => p.id === s.from)?.name} pays {participants.find(p => p.id === s.to)?.name} {formatMoney(s.amount)}
                    </p>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>MintSense (AI)</h3>
              </div>
              <div className="mint-grid">
                <textarea value={mintText} onChange={e => setMintText(e.target.value)} placeholder="e.g. John paid 24.50 for dinner yesterday" />
                <div className="mint-actions">
                  <button onClick={handleMintSense}>Parse</button>
                  <button className="ghost" onClick={handleMintSummary}>Summarize</button>
                </div>
                <pre>{mintOutput || 'No output yet.'}</pre>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Group Ledger</h3>
              </div>
              <div className="ledger">
                {participants.map(p => (
                  <div key={p.id} className="ledger-card" style={{ borderColor: p.color || '#97c6a8' }}>
                    <h4>{p.name}</h4>
                    <p>Total contributions: {formatMoney(totalByParticipant.get(p.id) || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="content empty">
            <h2>Select a group to begin</h2>
          </section>
        )}
      </main>
    </div>
  );
}

const upsertSplit = (
  splits: { participantId: string; amount?: string; percentage?: string }[],
  participantId: string,
  key: 'amount' | 'percentage',
  value: string
) => {
  const existing = splits.find(s => s.participantId === participantId);
  if (existing) {
    return splits.map(s => s.participantId === participantId ? { ...s, [key]: value } : s);
  }
  return [...splits, { participantId, [key]: value }];
};
