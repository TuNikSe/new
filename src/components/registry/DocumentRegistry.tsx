import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  apiListDocuments, apiGetCounts, apiChangeSubmissionStatus, apiSetCheckStatus,
  apiMarkDeletion, apiRestoreMarked, apiPurge, apiRestoreTrash, apiGetAudit,
  apiGetCompanies, apiFastCheck, apiUpdateFields, apiGetUsers,
  type DocumentRow, type DashboardCounts, type AuditLog, type SubmissionStatus,
  type CheckStatus, type AppUser, type Company,
} from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  FileText, CheckCircle2, Clock, AlertCircle, Trash2, RotateCcw, Info,
  Plus, Minus, Search, Printer, ChevronDown, ChevronRight, X, Zap,
  Building2, Calendar, Filter, Check, Pencil, UserCheck, UserX,
} from 'lucide-react';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const YEARS = ['2025', '2026'];

const SUBMISSION_LABELS: Record<SubmissionStatus, string> = {
  NOT_SUBMITTED: 'Не сдано',
  SUBMITTED_PAPER: 'Сдано на бумаге',
  SUBMITTED_EDO_UNSIGNED: 'ЭДО (не подп.)',
  SUBMITTED_EDO_SIGNED: 'ЭДО (подп.)',
  RETURNED: 'Возврат',
};

const SUBMISSION_CYCLE: SubmissionStatus[] = ['NOT_SUBMITTED', 'SUBMITTED_PAPER', 'SUBMITTED_EDO_UNSIGNED'];
const CHECK_LABELS: Record<CheckStatus, string> = {
  PENDING: 'Ожидание',
  APPROVED: 'Сдано',
  RETURNED: 'Возврат',
};

type FilterCard = 'total' | 'not_submitted' | 'paper' | 'edo_unsigned' | 'edo_signed' | 'confirmed' | 'returned' | 'deleted';

export default function DocumentRegistry() {
  const { user } = useAuth();
  const role = user?.role || 'AUTHOR';
  const isAdmin = role === 'ADMIN';
  const isChecker = role === 'CHECKER1' || role === 'CHECKER2' || role === 'ADMIN';
  const canEditFields = isChecker;
  const canMarkDelete = isChecker;
  const canChangeStatus = role === 'AUTHOR' || isChecker;

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>({ total: 0, not_submitted: 0, paper: 0, edo_unsigned: 0, edo_signed: 0, confirmed: 0, returned: 0, deleted: 0 });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterCard>('total');
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [monthOpen, setMonthOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [fastCheckOpen, setFastCheckOpen] = useState(false);
  const [auditDoc, setAuditDoc] = useState<DocumentRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentRow | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [returnDoc, setReturnDoc] = useState<{ doc: DocumentRow; stage: string } | null>(null);

  const loadCompanies = useCallback(async () => {
    const c = await apiGetCompanies();
    setCompanies(c || []);
  }, []);

  const loadUsers = useCallback(async () => {
    const u = await apiGetUsers();
    setUsers(Array.isArray(u) ? u : []);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const showDel = activeFilter === 'deleted' || showDeleted;
    const docs = await apiListDocuments({
      company_id: selectedCompany || undefined,
      year: selectedYear || undefined,
      month: selectedMonth || undefined,
      day: selectedDay || undefined,
      show_deleted: showDel,
    });
    let filtered = docs || [];
    if (activeFilter === 'deleted') {
      filtered = filtered.filter((d) => d.is_deleted);
    } else if (activeFilter !== 'total') {
      const statusMap: Record<FilterCard, SubmissionStatus | null> = {
        total: null, not_submitted: 'NOT_SUBMITTED', paper: 'SUBMITTED_PAPER',
        edo_unsigned: 'SUBMITTED_EDO_UNSIGNED', edo_signed: 'SUBMITTED_EDO_SIGNED',
        returned: 'RETURNED', confirmed: null, deleted: null,
      };
      const targetStatus = statusMap[activeFilter];
      if (targetStatus) {
        filtered = filtered.filter((d) => d.submission_status === targetStatus && !d.is_deleted);
      } else if (activeFilter === 'confirmed') {
        filtered = filtered.filter((d) => d.checker1_status === 'APPROVED' && d.checker2_status === 'APPROVED' && !d.is_deleted);
      }
    } else {
      filtered = filtered.filter((d) => !d.is_deleted);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((d) =>
        d.doc_number?.toLowerCase().includes(q) ||
        d.client_name?.toLowerCase().includes(q) ||
        d.author_raw?.toLowerCase().includes(q) ||
        d.doc_number_clean?.includes(q)
      );
    }

    setDocuments(filtered);
    setLoading(false);
  }, [activeFilter, selectedCompany, selectedYear, selectedMonth, selectedDay, showDeleted, search]);

  const loadCounts = useCallback(async () => {
    const c = await apiGetCounts({
      company_id: selectedCompany || undefined,
      year: selectedYear || undefined,
      month: selectedMonth || undefined,
    });
    setCounts(c);
  }, [selectedCompany, selectedYear, selectedMonth]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const refreshAll = () => { loadDocuments(); loadCounts(); };

  const handleSelectStatus = async (doc: DocumentRow, status: SubmissionStatus) => {
    if (!canChangeStatus) return;
    if (status === 'SUBMITTED_EDO_SIGNED' && !isChecker) return;
    await apiChangeSubmissionStatus(doc.id, status);
    refreshAll();
  };

  const handleCheckAction = async (doc: DocumentRow, stage: string, action: 'approve' | 'return', comment?: string) => {
    if (!isChecker) return;
    const newStatus: CheckStatus = action === 'approve' ? 'APPROVED' : 'RETURNED';
    await apiSetCheckStatus(doc.id, stage, newStatus, comment);
    if (action === 'return' && comment) {
      await apiChangeSubmissionStatus(doc.id, 'RETURNED', comment);
    }
    refreshAll();
  };

  const handleMarkDeletion = async (doc: DocumentRow) => {
    if (!canMarkDelete) return;
    if (doc.is_marked_for_deletion) {
      if (isAdmin) {
        setDeleteDoc(doc);
      }
    } else {
      await apiMarkDeletion(doc.id);
      refreshAll();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)));
    }
  };

  const handlePrint = () => {
    if (selectedIds.size === 0) {
      alert('Выберите строки для печати');
      return;
    }
    window.print();
  };

  const daysInMonth = useMemo(() => {
    if (!selectedMonth) return 0;
    return new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
  }, [selectedMonth, selectedYear]);

  return (
    <div className="space-y-6">
      {/* Dashboard filter cards */}
      <div className="no-print">
        <DashboardCards counts={counts} active={activeFilter} onChange={setActiveFilter} />
      </div>

      {/* Date accordion */}
      <div className="glass-card p-5 no-print relative z-30">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-600">
            <Calendar className="w-4 h-4" /> Период:
          </div>

          {/* Year selector */}
          <div className="flex gap-1">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => { setSelectedYear(y); setSelectedMonth(''); setSelectedDay(''); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedYear === y ? 'bg-blue-500 text-white' : 'bg-white/60 text-neutral-600 hover:bg-white'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Month accordion */}
          <div className="relative">
            <button
              onClick={() => setMonthOpen(!monthOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/60 text-neutral-600 hover:bg-white transition-all"
            >
              {selectedMonth ? MONTHS[parseInt(selectedMonth) - 1] : 'Все месяцы'}
              {monthOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {monthOpen && (
              <div className="absolute top-full mt-2 left-0 z-20 glass-card p-3 grid grid-cols-3 gap-1 animate-scale-in min-w-[280px]">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => { setSelectedMonth(String(i + 1)); setSelectedDay(''); setMonthOpen(false); }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedMonth === String(i + 1) ? 'bg-blue-500 text-white' : 'text-neutral-600 hover:bg-white/80'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Day selector */}
          {selectedMonth && daysInMonth > 0 && (
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="glass-input px-3 py-1.5 text-sm"
            >
              <option value="">Все дни</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
            </select>
          )}

          {/* Direct date input */}
          <input
            type="date"
            value={selectedYear && selectedMonth && selectedDay ? `${selectedYear}-${selectedMonth.padStart(2, '0')}-${selectedDay.padStart(2, '0')}` : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                const [y, m, d] = v.split('-');
                setSelectedYear(y);
                setSelectedMonth(String(parseInt(m)));
                setSelectedDay(String(parseInt(d)));
              } else {
                setSelectedMonth('');
                setSelectedDay('');
              }
            }}
            className="glass-input px-3 py-1.5 text-sm"
          />

          {/* Company filter */}
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="glass-input px-3 py-1.5 text-sm"
          >
            <option value="">Все организации</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-1.5 text-sm"
              placeholder="Поиск по номеру, контрагенту, автору..."
            />
          </div>

          {/* Fast check button */}
          {isChecker && (
            <button
              onClick={() => setFastCheckOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
            >
              <Zap className="w-4 h-4" /> Экспресс-ввод
            </button>
          )}

          {/* Print */}
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/60 text-neutral-600 hover:bg-white transition-all">
            <Printer className="w-4 h-4" /> Печать {selectedIds.size > 0 && `(${selectedIds.size})`}
          </button>
        </div>
      </div>

      {/* Documents table */}
      <div className="glass-card no-print">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">Загрузка реестра...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Документы не найдены</p>
          </div>
        ) : (
          <RegularTable
            documents={documents}
            role={role}
            canChangeStatus={canChangeStatus}
            canEditFields={canEditFields}
            canMarkDelete={canMarkDelete}
            canChangeCheck={isChecker}
            isAdmin={isAdmin}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onSelectStatus={handleSelectStatus}
            onCheckAction={handleCheckAction}
            onMarkDeletion={handleMarkDeletion}
            onShowAudit={setAuditDoc}
            onEditDoc={setEditDoc}
            onReturn={setReturnDoc}
          />
        )}
      </div>

      {/* Print table — grouped by company, each on new page */}
      <div className="print-only">
        {Object.entries(
          documents.filter(d => selectedIds.has(d.id)).reduce((acc, d) => {
            const key = d.company?.name || 'Без организации';
            if (!acc[key]) acc[key] = [];
            acc[key].push(d);
            return acc;
          }, {} as Record<string, DocumentRow[]>)
        ).map(([companyName, docs], gi) => (
          <div key={companyName} className={gi > 0 ? 'print-page-break' : ''}>
            <h2 className="print-company-header">{companyName}</h2>
            <table className="print-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Тип</th>
                  <th>Номер</th>
                  <th>Сумма</th>
                  <th>Контрагент</th>
                  <th>Автор</th>
                  <th>Сдача</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td>{formatDate(d.doc_date)}</td>
                    <td>{d.doc_type}</td>
                    <td>{d.doc_number}</td>
                    <td>{formatAmount(d.amount)}</td>
                    <td>{d.client_name || '—'}</td>
                    <td><AuthorBadge doc={d} /></td>
                    <td>{SUBMISSION_LABELS[d.submission_status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Modals */}
      {fastCheckOpen && (
        <FastCheckModal
          onClose={() => setFastCheckOpen(false)}
          onAction={async (doc, action, comment) => {
            const stage = role === 'CHECKER2' ? 'checker2' : 'checker1';
            await handleCheckAction(doc, stage, action, comment);
          }}
        />
      )}

      {auditDoc && (
        <AuditModal doc={auditDoc} onClose={() => setAuditDoc(null)} />
      )}

      {deleteDoc && (
        <DeleteModal
          doc={deleteDoc}
          isAdmin={isAdmin}
          onRestore={async () => { await apiRestoreMarked(deleteDoc.id); setDeleteDoc(null); refreshAll(); }}
          onPurge={async () => { await apiPurge(deleteDoc.id); setDeleteDoc(null); refreshAll(); }}
          onClose={() => setDeleteDoc(null)}
        />
      )}

      {editDoc && (
        <EditModal
          doc={editDoc}
          users={users}
          onClose={() => setEditDoc(null)}
          onSave={async (fields) => { await apiUpdateFields(editDoc.id, fields); setEditDoc(null); refreshAll(); }}
        />
      )}

      {returnDoc && (
        <ReturnModal
          onClose={() => setReturnDoc(null)}
          onConfirm={async (comment) => {
            await handleCheckAction(returnDoc.doc, returnDoc.stage, 'return', comment);
            setReturnDoc(null);
          }}
        />
      )}
    </div>
  );
}

// ===== Dashboard Cards =====
function DashboardCards({ counts, active, onChange }: { counts: DashboardCounts; active: FilterCard; onChange: (f: FilterCard) => void }) {
  const cards: { key: FilterCard; label: string; value: number; color: string; bg: string }[] = [
    { key: 'total', label: 'ВСЕГО', value: counts.total, color: 'text-neutral-700', bg: 'from-neutral-100 to-neutral-200' },
    { key: 'not_submitted', label: 'НЕ СДАНО', value: counts.not_submitted, color: 'text-neutral-600', bg: 'from-orange-50 to-orange-100' },
    { key: 'paper', label: 'БУМАГА', value: counts.paper, color: 'text-amber-700', bg: 'from-amber-50 to-amber-100' },
    { key: 'edo_unsigned', label: 'ЭДО (НЕ ПОДП.)', value: counts.edo_unsigned, color: 'text-blue-700', bg: 'from-blue-50 to-blue-100' },
    { key: 'edo_signed', label: 'ЭДО (ПОДП.)', value: counts.edo_signed, color: 'text-cyan-700', bg: 'from-cyan-50 to-cyan-100' },
    { key: 'confirmed', label: 'ПОДТВЕРЖДЕНО', value: counts.confirmed, color: 'text-emerald-700', bg: 'from-emerald-50 to-emerald-100' },
    { key: 'returned', label: 'ВОЗВРАТЫ', value: counts.returned, color: 'text-red-700', bg: 'from-red-50 to-red-100' },
    { key: 'deleted', label: 'УДАЛЕНЫ', value: counts.deleted, color: 'text-neutral-500', bg: 'from-neutral-50 to-neutral-100' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map((c) => (
        <button
          key={c.key}
          onClick={() => onChange(c.key)}
          className={`glass-card glass-card-hover p-4 text-left ${active === c.key ? 'ring-2 ring-blue-400' : ''}`}
        >
          <p className="text-xs font-medium text-neutral-500 mb-1">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </button>
      ))}
    </div>
  );
}

// ===== Regular Table =====
function RegularTable({
  documents, role, canChangeStatus, canEditFields, canMarkDelete, canChangeCheck, isAdmin,
  selectedIds, onToggleSelect, onToggleSelectAll,
  onSelectStatus, onCheckAction, onMarkDeletion, onShowAudit, onEditDoc, onReturn,
}: {
  documents: DocumentRow[];
  role: string;
  canChangeStatus: boolean;
  canEditFields: boolean;
  canMarkDelete: boolean;
  canChangeCheck: boolean;
  isAdmin: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onSelectStatus: (d: DocumentRow, s: SubmissionStatus) => void;
  onCheckAction: (d: DocumentRow, stage: string, action: 'approve' | 'return', comment?: string) => void;
  onMarkDeletion: (d: DocumentRow) => void;
  onShowAudit: (d: DocumentRow) => void;
  onEditDoc: (d: DocumentRow) => void;
  onReturn: (d: { doc: DocumentRow; stage: string }) => void;
}) {
  const allSelected = documents.length > 0 && selectedIds.size === documents.length;

  return (
    <div>
      <table className="w-full" style={{ minWidth: 1300 }}>
        <thead className="sticky top-0 z-10">
          <tr className="glass-header">
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="w-4 h-4 cursor-pointer rounded border-neutral-300 text-blue-500 focus:ring-blue-400"
              />
            </th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-24">Дата</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-28">Тип док.</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-32">Номер</th>
            <th className="text-right px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-28">Сумма</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Контрагент</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-32">Автор</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-32">Организация</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-36">Тип сдачи</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-36">Подтверждение</th>
            <th className="text-center px-3 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider w-20">Действия</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, i) => (
            <tr
              key={doc.id}
              className={`border-b border-neutral-100/60 hover:bg-blue-50/30 transition-colors ${doc.is_marked_for_deletion ? 'bg-red-50/40' : ''} ${i % 2 === 1 ? 'bg-neutral-50/30' : ''} ${selectedIds.has(doc.id) ? 'bg-blue-50/50' : ''}`}
            >
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(doc.id)}
                  onChange={() => onToggleSelect(doc.id)}
                  className="w-4 h-4 cursor-pointer rounded border-neutral-300 text-blue-500 focus:ring-blue-400"
                />
              </td>
              <td className="px-3 text-sm text-neutral-600 whitespace-nowrap">{formatDate(doc.doc_date)}</td>
              <td className="px-3 text-sm text-neutral-600 truncate max-w-[120px]">{doc.doc_type}</td>
              <td className="px-3 text-sm font-medium text-neutral-700 truncate max-w-[140px]">{doc.doc_number}</td>
              <td className="px-3 text-sm text-right text-neutral-700 font-mono whitespace-nowrap">{formatAmount(doc.amount)}</td>
              <td className="px-3 text-sm text-neutral-600 truncate max-w-[200px]">{doc.client_name || '—'}</td>
              <td className="px-3 truncate max-w-[140px]"><AuthorBadge doc={doc} /></td>
              <td className="px-3 text-sm text-neutral-500 truncate max-w-[140px]">{doc.company?.name || '—'}</td>
              <td className="px-3 py-3">
                <div className="flex justify-center">
                  <SubmissionDropdown doc={doc} canChange={canChangeStatus} isChecker={role === 'CHECKER1' || role === 'CHECKER2' || role === 'ADMIN'} onSelect={(s) => onSelectStatus(doc, s)} />
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-center gap-1">
                  <CheckBadge
                    label="Проверка 1"
                    status={doc.checker1_status}
                    canChange={canChangeCheck && (role === 'ADMIN' || role === 'CHECKER1')}
                    onApprove={() => onCheckAction(doc, 'checker1', 'approve')}
                    onReturn={() => onReturn({ doc, stage: 'checker1' })}
                  />
                  <CheckBadge
                    label="Итог"
                    status={doc.checker2_status}
                    canChange={canChangeCheck && (role === 'ADMIN' || role === 'CHECKER2')}
                    onApprove={() => onCheckAction(doc, 'checker2', 'approve')}
                    onReturn={() => onReturn({ doc, stage: 'checker2' })}
                  />
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-center gap-1">
                  <button onClick={() => onShowAudit(doc)} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="История">
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  {canMarkDelete && (
                    <button onClick={() => onMarkDeletion(doc)} className={`p-1.5 rounded-lg transition-colors ${doc.is_marked_for_deletion ? 'text-red-500 bg-red-50' : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'}`} title={doc.is_marked_for_deletion ? (isAdmin ? 'Управление удалением' : 'Помечен на удаление') : 'Пометить на удаление'}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canEditFields && (
                    <button onClick={() => onEditDoc(doc)} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Редактировать">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuthorBadge({ doc }: { doc: DocumentRow }) {
  const matched = !!doc.assigned_user_id;
  const displayName = doc.assigned_user?.full_name || doc.author_raw || '—';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap max-w-[130px] truncate ${
        matched
          ? 'bg-emerald-100 text-emerald-700'
          : doc.author_raw
            ? 'bg-neutral-200 text-neutral-500'
            : 'bg-neutral-100 text-neutral-400'
      }`}
      title={matched ? `Сопоставлен: ${doc.assigned_user?.full_name || ''}` : doc.author_raw ? `Не сопоставлен: ${doc.author_raw}` : 'Автор не указан'}
    >
      {matched
        ? <UserCheck className="w-3 h-3 shrink-0" />
        : <UserX className="w-3 h-3 shrink-0" />}
      <span className="truncate">{displayName}</span>
    </span>
  );
}

function SubmissionDropdown({ doc, canChange, isChecker, onSelect }: {
  doc: DocumentRow; canChange: boolean; isChecker: boolean; onSelect: (s: SubmissionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const colors: Record<SubmissionStatus, string> = {
    NOT_SUBMITTED: 'bg-neutral-100 text-neutral-600',
    SUBMITTED_PAPER: 'bg-amber-100 text-amber-700',
    SUBMITTED_EDO_UNSIGNED: 'bg-blue-100 text-blue-700',
    SUBMITTED_EDO_SIGNED: 'bg-cyan-100 text-cyan-700',
    RETURNED: 'bg-red-100 text-red-700',
  };

  const authorStatuses: SubmissionStatus[] = ['NOT_SUBMITTED', 'SUBMITTED_PAPER', 'SUBMITTED_EDO_UNSIGNED'];
  const checkerStatuses: SubmissionStatus[] = ['NOT_SUBMITTED', 'SUBMITTED_PAPER', 'SUBMITTED_EDO_UNSIGNED', 'SUBMITTED_EDO_SIGNED', 'RETURNED'];
  const availableStatuses = isChecker ? checkerStatuses : authorStatuses;

  const handleSelect = (s: SubmissionStatus) => {
    setOpen(false);
    if (s !== doc.submission_status) onSelect(s);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => canChange && setOpen(!open)}
        disabled={!canChange}
        className={`status-badge ${colors[doc.submission_status]} ${canChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} flex items-center gap-1`}
      >
        {SUBMISSION_LABELS[doc.submission_status]}
        {canChange && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 glass-card p-1.5 min-w-[180px] animate-scale-in">
          {availableStatuses.map((s) => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                s === doc.submission_status
                  ? `${colors[s]} ring-1 ring-blue-300`
                  : 'text-neutral-600 hover:bg-white/80'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${colors[s].split(' ')[0]}`} />
              {SUBMISSION_LABELS[s]}
              {s === doc.submission_status && <Check className="w-3 h-3 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckBadge({ label, status, canChange, onApprove, onReturn }: {
  label: string;
  status: CheckStatus;
  canChange: boolean;
  onApprove: () => void;
  onReturn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const config = {
    PENDING: { color: 'bg-neutral-100 text-neutral-500', dot: 'bg-neutral-400', icon: <Clock className="w-3 h-3" /> },
    APPROVED: { color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: <CheckCircle2 className="w-3 h-3" /> },
    RETURNED: { color: 'bg-red-100 text-red-700', dot: 'bg-red-500', icon: <AlertCircle className="w-3 h-3" /> },
  };
  const c = config[status];

  return (
    <div className="relative w-full" ref={ref}>
      <button
        onClick={() => canChange && setOpen(!open)}
        disabled={!canChange}
        className={`status-badge ${c.color} w-full justify-center ${canChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} text-[11px]`}
        title={canChange ? `${label} — нажать для изменения` : label}
      >
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-400 font-normal">{label}:</span>
          {c.icon} {CHECK_LABELS[status]}
          {canChange && <ChevronDown className="w-2.5 h-2.5 opacity-60" />}
        </span>
      </button>
      {open && canChange && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 glass-card p-1.5 min-w-[160px] animate-scale-in">
          <button
            onClick={() => { setOpen(false); if (status !== 'APPROVED') onApprove(); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'text-neutral-600 hover:bg-white/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Подтвердить
            {status === 'APPROVED' && <Check className="w-3 h-3 ml-auto" />}
          </button>
          <button
            onClick={() => { setOpen(false); if (status !== 'RETURNED') onReturn(); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              status === 'RETURNED' ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'text-neutral-600 hover:bg-white/80'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Вернуть
            {status === 'RETURNED' && <Check className="w-3 h-3 ml-auto" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ===== Fast Check Modal =====
function FastCheckModal({ onClose, onAction }: {
  onClose: () => void;
  onAction: (doc: DocumentRow, action: 'approve' | 'return', comment?: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const res = await apiFastCheck(q);
    setResults(res.results || []);
    setLoading(false);
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKey = async (e: React.KeyboardEvent) => {
    if (e.key === '+' && results.length > 0) {
      e.preventDefault();
      const doc = results[0];
      await onAction(doc, 'approve');
      setFeedback(`Документ ${doc.doc_number} — ПРОВЕРКА пройдена`);
      setQuery(''); setResults([]);
      inputRef.current?.focus();
      setTimeout(() => setFeedback(''), 2000);
    } else if (e.key === '-' && results.length > 0) {
      e.preventDefault();
      const comment = prompt('Причина возврата:');
      if (comment) {
        const doc = results[0];
        await onAction(doc, 'return', comment);
        setFeedback(`Документ ${doc.doc_number} — ВОЗВРАТ`);
        setQuery(''); setResults([]);
        inputRef.current?.focus();
        setTimeout(() => setFeedback(''), 3000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-lg animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Экспресс-ввод
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-neutral-500 mb-3">Введите номер документа. Буквы и нули игнорируются. Нажмите <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono text-xs">+</kbd> для подтверждения или <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono text-xs">−</kbd> для возврата.</p>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
          onKeyDown={handleKey}
          className="glass-input w-full px-4 py-3 text-lg font-mono"
          placeholder="Напр.: 10264"
        />

        {feedback && (
          <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700 animate-fade-in">
            {feedback}
          </div>
        )}

        <div className="mt-4 max-h-64 overflow-auto space-y-2">
          {loading && <p className="text-sm text-neutral-400 text-center py-4">Поиск...</p>}
          {!loading && results.length === 0 && query.length >= 2 && (
            <p className="text-sm text-neutral-400 text-center py-4">Ничего не найдено</p>
          )}
          {results.map((d) => (
            <div key={d.id} className="p-3 rounded-xl bg-white/60 border border-white/40 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-700">{d.doc_number}</p>
                <p className="text-xs text-neutral-400">{d.client_name} · {formatAmount(d.amount)} ₽ · {d.company?.name}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={async () => { await onAction(d, 'approve'); setQuery(''); setResults([]); inputRef.current?.focus(); }} className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={async () => { const c = prompt('Причина возврата:'); if (c) { await onAction(d, 'return', c); setQuery(''); setResults([]); inputRef.current?.focus(); } }} className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Audit Modal =====
function AuditModal({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await apiGetAudit(doc.id);
      setLogs(data || []);
      setLoading(false);
    })();
  }, [doc.id]);

  const actionLabels: Record<string, string> = {
    SUBMISSION_STATUS_CHANGE: 'Смена типа сдачи',
    CHECK_CHECKER1_STATUS: 'Проверка 1',
    CHECK_CHECKER2_STATUS: 'Итог',
    MARKED_FOR_DELETION: 'Пометка на удаление',
    RESTORED_FROM_MARKED: 'Снятие пометки',
    PURGED_TO_TRASH: 'Удаление в корзину',
    RESTORED_FROM_TRASH: 'Восстановление из корзины',
    FIELDS_UPDATED: 'Редактирование полей',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-2xl animate-scale-in max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" /> История изменений
            </h3>
            <p className="text-sm text-neutral-500 mt-0.5">Документ № {doc.doc_number}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-auto flex-1 space-y-2">
          {loading && <p className="text-center text-neutral-400 py-8 text-sm">Загрузка...</p>}
          {!loading && logs.length === 0 && <p className="text-center text-neutral-400 py-8 text-sm">История пуста</p>}
          {logs.map((log) => (
            <div key={log.id} className="p-3 rounded-xl bg-white/50 border border-white/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-neutral-700">{actionLabels[log.action_type] || log.action_type}</span>
                <span className="text-xs text-neutral-400">{new Date(log.created_at).toLocaleString('ru-RU')}</span>
              </div>
              <p className="text-xs text-neutral-500">Пользователь: {log.user?.full_name || 'Система'}</p>
              {log.comment && <p className="text-xs text-red-600 mt-1">Причина: {log.comment}</p>}
              {log.old_value && log.new_value && (
                <div className="text-xs text-neutral-400 mt-1 font-mono">
                  {Object.entries(log.new_value).map(([k, v]) => {
                    const oldV = log.old_value?.[k];
                    return oldV !== v ? `${k}: ${String(oldV)} → ${String(v)}` : null;
                  }).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== Delete Modal =====
function DeleteModal({ doc, isAdmin, onRestore, onPurge, onClose }: {
  doc: DocumentRow; isAdmin: boolean; onRestore: () => void; onPurge: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" /> Управление удалением
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-neutral-600 mb-1">Документ: <span className="font-medium">{doc.doc_number}</span></p>
        <p className="text-sm text-neutral-500 mb-6">Документ помечен на удаление. Выберите действие:</p>
        <div className="flex gap-3">
          {isAdmin && (
            <>
              <button onClick={onRestore} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-colors">
                <RotateCcw className="w-4 h-4" /> Восстановить
              </button>
              <button onClick={onPurge} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                <Trash2 className="w-4 h-4" /> Удалить окончательно
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Edit Modal =====
function EditModal({ doc, users, onClose, onSave }: {
  doc: DocumentRow; users: AppUser[]; onClose: () => void; onSave: (fields: { doc_number?: string; amount?: number; client_name?: string; assigned_user_id?: string }) => void;
}) {
  const [docNumber, setDocNumber] = useState(doc.doc_number);
  const [amount, setAmount] = useState(String(doc.amount));
  const [clientName, setClientName] = useState(doc.client_name || '');
  const [assignedUserId, setAssignedUserId] = useState(doc.assigned_user_id || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-800">Редактирование документа</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Номер документа</label>
            <input type="text" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="glass-input w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Сумма</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="glass-input w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Контрагент</label>
            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="glass-input w-full px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Автор</label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="glass-input w-full px-3 py-2 text-sm"
            >
              <option value="">— не назначен —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.login})</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => onSave({ doc_number: docNumber, amount: parseFloat(amount) || 0, client_name: clientName, assigned_user_id: assignedUserId || undefined })}
          className="w-full mt-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          Сохранить изменения
        </button>
      </div>
    </div>
  );
}

// ===== Return Modal =====
function ReturnModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (comment: string) => void }) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-neutral-800 mb-4">Причина возврата</h3>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && comment.trim()) { e.preventDefault(); onConfirm(comment.trim()); } }}
          className="glass-input w-full px-3 py-2 text-sm h-24 resize-none"
          placeholder="Опишите причину возврата документа..."
          autoFocus
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => comment.trim() && onConfirm(comment.trim())}
            disabled={!comment.trim()}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            Подтвердить возврат
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/60 text-neutral-600 text-sm font-medium hover:bg-white transition-colors">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Helpers =====
function formatDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
