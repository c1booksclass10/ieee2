/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import logo from '../ieee-its-logo.png';
import {
  Calendar,
  LogOut,
  Plus,
  Trash2,
  ChevronRight,
  User,
  Lock,
  Unlock,
  RefreshCw,
  AlertCircle,
  Search,
  Upload
} from 'lucide-react';

const ADMIN_EMAILS = ['ieeeitsvitvellore@gmail.com', 'liki123456m@gmail.com'];

interface DateEntry {
  id: number;
  date_string: string;
}


interface Entry {
  id: number;
  date_id: number;
  name: string;
  reg_no: string;
  email: string;
  coming: string;
  applied: string;
  attendance_1: string;
  attendance_2: string;
  is_locked: number;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<DateEntry | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [newRegNo, setNewRegNo] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    fetchUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchDates();
    }
  }, [user]);

  useEffect(() => {
    if (selectedDate) {
      fetchEntries(selectedDate.id);
    }
  }, [selectedDate]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data.user);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchDates = async () => {
    const res = await fetch('/api/dates');
    const data = await res.json();
    setDates(data);
  };

  const fetchEntries = async (dateId: number) => {
    const res = await fetch(`/api/dates/${dateId}/entries`);
    const data = await res.json();
    setEntries(data);
  };

  const handleLogin = async () => {
    setLoginError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(userCredential);
      const accessToken = credential?.accessToken;
      const token = await userCredential.user.getIdToken();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accessToken })
      });

      if (res.ok) {
        fetchUser();
      } else {
        setLoginError('Server authentication failed.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSelectedDate(null);
  };

  const addDate = async () => {
    if (!newDate) return;
    const res = await fetch('/api/dates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_string: newDate }),
    });
    if (res.ok) {
      fetchDates();
      setNewDate('');
    }
  };

  const deleteDate = async (id: number) => {
    if (!confirm('Are you sure you want to delete this date and all its entries?')) return;
    await fetch(`/api/dates/${id}`, { method: 'DELETE' });
    fetchDates();
    if (selectedDate?.id === id) setSelectedDate(null);
  };

  const addMasterUser = async () => {
    if (!newName || !newEmail) return;

    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: [{ name: newName, reg_no: newRegNo, email: newEmail }] }),
    });

    if (selectedDate) fetchEntries(selectedDate.id);
    setNewName('');
    setNewRegNo('');
    setNewEmail('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      const nIdx = headers.indexOf('name');
      const eIdx = headers.indexOf('email');
      const rIdx = headers.findIndex(h => h.includes('reg'));

      if (nIdx === -1 || eIdx === -1) {
        alert("CSV must have 'Name' and 'Email' columns.");
        e.target.value = '';
        return;
      }

      const newUsers = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length >= 2 && cols[eIdx]) {
          newUsers.push({
            name: cols[nIdx]?.trim(),
            email: cols[eIdx]?.trim(),
            reg_no: rIdx !== -1 ? cols[rIdx]?.trim() : ''
          });
        }
      }

      if (newUsers.length > 0) {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: newUsers })
        });
        if (selectedDate) fetchEntries(selectedDate.id);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const deleteMasterUser = async (id: number) => {
    if (!confirm('Are you sure you want to permanently delete this student and ALL their attendance history?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
       if (selectedDate) fetchEntries(selectedDate.id);
    }
  };

  const updateMasterUser = async (id: number, field: string, value: string) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    });
    if (res.ok) {
       if (selectedDate) fetchEntries(selectedDate.id);
    } else {
       const data = await res.json();
       alert(data.error);
    }
  };

  const updateEntry = async (id: number, field: string, value: string) => {
    const res = await fetch(`/api/dates/${selectedDate?.id}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    });
    if (res.ok) {
      if (selectedDate) fetchEntries(selectedDate.id);
    } else {
      const data = await res.json();
      alert(data.error);
    }
  };

  const resetEntries = async () => {
    if (!selectedDate || !confirm('Reset all rows to default?')) return;
    await fetch(`/api/dates/${selectedDate.id}/reset`, { method: 'POST' });
    fetchEntries(selectedDate.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <RefreshCw className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-stone-200 text-center"
        >
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-6">
            <img src={logo} alt="IEEE ITS Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">IEEE ITS NIGHT SLIP MANAGEMENT</h1>
          <p className="text-stone-500 mb-8">Secure portal for night slip and late hour requests.</p>
          {loginError && <p className="text-red-500 text-sm mb-4 text-center">{loginError}</p>}
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
          >
            <User className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const isAdmin = ADMIN_EMAILS.includes(user.email);

  const filteredEntries = entries.filter(e =>
    (e.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.reg_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-bottom border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedDate(null)}>
            <div className="w-8 h-8 flex items-center justify-center">
              <img src={logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="font-semibold hidden sm:inline">IEEE ITS</span >
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-stone-500">{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {!selectedDate ? (
            <motion.div
              key="date-selection"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-semibold">Select Date</h2>
                {isAdmin && (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                    />
                    <button
                      onClick={addDate}
                      className="p-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {dates.map((date) => (
                  <div
                    key={date.id}
                    className="group bg-white p-6 rounded-2xl border border-stone-200 hover:border-stone-400 transition-all cursor-pointer flex items-center justify-between"
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center group-hover:bg-stone-900 transition-colors">
                        <Calendar className="w-6 h-6 text-stone-400 group-hover:text-white" />
                      </div>
                      <div>
                        <p className="font-medium">{new Date(date.date_string).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p className="text-sm text-stone-500">{date.date_string}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteDate(date.id); }}
                          className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      <ChevronRight className="w-5 h-5 text-stone-300" />
                    </div>
                  </div>
                ))}
                {dates.length === 0 && (
                  <div className="col-span-full py-12 text-center text-stone-500">
                    No dates available. {isAdmin ? 'Add a date to get started.' : 'Please wait for admin to add dates.'}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="sheet-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <div>
                    <h2 className="text-2xl font-semibold">{new Date(selectedDate.date_string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                    <p className="text-sm text-stone-500">Night Slip & Late Hour Requests</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="relative w-full max-w-[200px] sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      placeholder="Search name, reg no..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                    />
                  </div>

                  {isAdmin && (
                    <button
                      onClick={resetEntries}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reset All
                    </button>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white border border-stone-200 rounded-xl shadow-sm">
                  <div className="text-sm font-semibold text-stone-700 w-full sm:w-auto mr-2">Manage Master Data:</div>
                  <input
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 min-w-[120px] px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                  <input
                    placeholder="Reg No"
                    value={newRegNo}
                    onChange={(e) => setNewRegNo(e.target.value)}
                    className="w-28 px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                  <input
                    placeholder="Email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 min-w-[150px] px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                  <button
                    onClick={addMasterUser}
                    className="px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    Add Student
                  </button>
                  <label className="flex items-center gap-2 px-4 py-2 bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors text-sm font-medium cursor-pointer whitespace-nowrap">
                    <Upload className="w-4 h-4" />
                    Upload CSV
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Reg No</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Coming</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Applied</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Night Slip</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Late Hour</th>
                        <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Status</th>
                        {isAdmin && <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Manage</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredEntries.map((entry) => {
                        const isUserRow = entry.email.toLowerCase() === user.email.toLowerCase();
                        const canEdit = isAdmin || (isUserRow && entry.is_locked === 0);

                        const getBgColor = (text: string) => {
                          const upper = (text || '').toUpperCase();
                          if (['COMING', 'APPLIED', 'PRESENT'].includes(upper)) return 'bg-[#B6D7A8] text-green-900';
                          return 'bg-[#EA9999] text-red-900';
                        };

                        return (
                          <tr key={entry.id} className="hover:bg-stone-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-stone-800">
                              {isAdmin ? (
                                <input
                                  value={entry.name}
                                  onChange={(e) => updateMasterUser(entry.id, 'name', e.target.value)}
                                  className="bg-transparent border border-stone-200 focus:border-stone-400 rounded px-1 py-0.5 w-full font-bold"
                                />
                              ) : (
                                entry.name
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-stone-600">
                              {isAdmin ? (
                                <input
                                  value={entry.reg_no}
                                  onChange={(e) => updateMasterUser(entry.id, 'reg_no', e.target.value)}
                                  className="bg-transparent border border-stone-200 focus:border-stone-400 rounded px-1 py-0.5 w-full font-semibold"
                                />
                              ) : (
                                entry.reg_no
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-stone-500">
                              {isAdmin ? (
                                <input
                                  value={entry.email}
                                  onChange={(e) => updateMasterUser(entry.id, 'email', e.target.value)}
                                  className="bg-transparent border border-stone-200 focus:border-stone-400 rounded px-1 py-0.5 w-full"
                                />
                              ) : (
                                entry.email
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={entry.coming}
                                disabled={!canEdit}
                                onChange={(e) => updateEntry(entry.id, 'coming', e.target.value)}
                                className={`text-xs font-bold px-2 py-1 rounded-md border-none focus:ring-0 cursor-pointer disabled:cursor-not-allowed ${getBgColor(entry.coming)}`}
                              >
                                <option value="COMING">COMING</option>
                                <option value="NOT COMING">NOT COMING</option>
                              </select>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={entry.applied}
                                disabled={!canEdit}
                                onChange={(e) => updateEntry(entry.id, 'applied', e.target.value)}
                                className={`text-xs font-bold px-2 py-1 rounded-md border-none focus:ring-0 cursor-pointer disabled:cursor-not-allowed ${getBgColor(entry.applied)}`}
                              >
                                <option value="APPLIED">APPLIED</option>
                                <option value="NOT APPLIED">NOT APPLIED</option>
                              </select>
                            </td>
                            <td className="px-6 py-4">
                              {isAdmin ? (
                                <select
                                  value={entry.attendance_1}
                                  onChange={(e) => updateEntry(entry.id, 'attendance_1', e.target.value)}
                                  className={`text-xs font-bold px-2 py-1 rounded-md border-none focus:ring-0 cursor-pointer ${getBgColor(entry.attendance_1)}`}
                                >
                                  <option value="PRESENT">PRESENT</option>
                                  <option value="ABSENT">ABSENT</option>
                                </select>
                              ) : (
                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${getBgColor(entry.attendance_1)}`}>
                                  {entry.attendance_1}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {isAdmin ? (
                                <select
                                  value={entry.attendance_2}
                                  onChange={(e) => updateEntry(entry.id, 'attendance_2', e.target.value)}
                                  className={`text-xs font-bold px-2 py-1 rounded-md border-none focus:ring-0 cursor-pointer ${getBgColor(entry.attendance_2)}`}
                                >
                                  <option value="PRESENT">PRESENT</option>
                                  <option value="ABSENT">ABSENT</option>
                                </select>
                              ) : (
                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${getBgColor(entry.attendance_2)}`}>
                                  {entry.attendance_2}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {isAdmin ? (
                                  <button
                                    onClick={() => updateEntry(entry.id, 'is_locked', entry.is_locked === 1 ? '0' : '1')}
                                    className={`flex items-center gap-1 text-xs font-medium transition-colors ${entry.is_locked === 1 ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'}`}
                                  >
                                    {entry.is_locked === 1 ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                    {entry.is_locked === 1 ? 'Locked' : 'Open'}
                                  </button>
                                ) : (
                                  entry.is_locked === 1 ? (
                                    <div className="flex items-center gap-1 text-xs text-stone-400 font-medium">
                                      <Lock className="w-3 h-3" />
                                      Locked
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                                      <Unlock className="w-3 h-3" />
                                      Open
                                    </div>
                                  )
                                )}
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="px-6 py-4">
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteMasterUser(entry.id); }}
                                  className="p-1.5 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                  title="Delete Student History"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {entries.length === 0 && (
                  <div className="py-20 text-center">
                    <AlertCircle className="w-12 h-12 text-stone-200 mx-auto mb-4" />
                    <p className="text-stone-500">No entries found for this date.</p>
                    {isAdmin && <p className="text-sm text-stone-400 mt-1">Add rows to start tracking.</p>}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
