import { useState, useEffect, useCallback } from 'react';
import {
  apiGetCompanies, apiCreateCompany, apiUpdateCompany, apiDeleteCompany,
  apiGetDepartments, apiCreateDepartment, apiUpdateDepartment, apiDeleteDepartment,
  apiGetUsers, apiCreateUser, apiUpdateUser, apiDeleteUser,
  apiUploadExcel, apiPreviewExcel, apiRematchAuthors,
  type Company, type Department, type AppUser, type UserRole,
} from '@/lib/supabase';
import {
  Building2, Users as UsersIcon, FolderTree, Plus, Pencil, Trash2, X, Upload, Save,
  ArrowRight, Check, AlertCircle, RefreshCw,
} from 'lucide-react';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'AUTHOR', label: 'Автор (Кассир)' },
  { value: 'CHECKER1', label: 'Проверяющий №1' },
  { value: 'CHECKER2', label: 'Проверяющий №2' },
  { value: 'DEPT_HEAD', label: 'Руководитель отдела' },
  { value: 'COMPANY_HEAD', label: 'Руководитель организации' },
];

type Tab = 'companies' | 'departments' | 'users' | 'upload';

export default function SystemManagement() {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [c, d, u] = await Promise.all([
      apiGetCompanies(), apiGetDepartments(), apiGetUsers(),
    ]);
    setCompanies(c || []);
    setDepartments(d || []);
    setUsers(u || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'companies'} onClick={() => setTab('companies')} icon={<Building2 className="w-4 h-4" />}>
          Организации
        </TabButton>
        <TabButton active={tab === 'departments'} onClick={() => setTab('departments')} icon={<FolderTree className="w-4 h-4" />}>
          Отделы
        </TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<UsersIcon className="w-4 h-4" />}>
          Пользователи
        </TabButton>
        <TabButton active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload className="w-4 h-4" />}>
          Загрузка реестра
        </TabButton>
      </div>

      {loading ? (
        <div className="glass-card p-12 text-center text-neutral-500">Загрузка...</div>
      ) : (
        <>
          {tab === 'companies' && <CompaniesTab companies={companies} onChange={loadAll} />}
          {tab === 'departments' && <DepartmentsTab departments={departments} companies={companies} onChange={loadAll} />}
          {tab === 'users' && <UsersTab users={users} departments={departments} companies={companies} onChange={loadAll} />}
          {tab === 'upload' && <UploadTab companies={companies} />}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-white text-neutral-800 shadow-sm border border-white/50' : 'text-neutral-500 hover:text-neutral-700 hover:bg-white/50'
      }`}
    >
      {icon} {children}
    </button>
  );
}

// ===== COMPANIES =====
function CompaniesTab({ companies, onChange }: { companies: Company[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const handleSave = async () => {
    if (editing) {
      await apiUpdateCompany(editing.id, name);
    } else {
      await apiCreateCompany(name);
    }
    setEditing(null); setCreating(false); setName('');
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить организацию? Все связанные документы останутся.')) return;
    await apiDeleteCompany(id);
    onChange();
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-800">Организации</h3>
        <button onClick={() => { setCreating(true); setName(''); }} className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 flex items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input flex-1 px-4 py-2 text-sm"
            placeholder="Название организации"
            autoFocus
          />
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
            <Save className="w-4 h-4" /> Сохранить
          </button>
          <button onClick={() => { setCreating(false); setEditing(null); setName(''); }} className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        {companies.length === 0 ? (
          <p className="text-center text-neutral-400 py-8 text-sm">Организации не созданы</p>
        ) : (
          companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/40 hover:bg-white/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-neutral-700">{c.name}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(c); setName(c.name); setCreating(false); }} className="p-2 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ===== DEPARTMENTS =====
function DepartmentsTab({ departments, companies, onChange }: { departments: Department[]; companies: Company[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  const handleSave = async () => {
    if (editing) {
      await apiUpdateDepartment(editing.id, name, selectedCompanies);
    } else {
      await apiCreateDepartment(name, selectedCompanies);
    }
    setEditing(null); setCreating(false); setName(''); setSelectedCompanies([]);
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить отдел?')) return;
    await apiDeleteDepartment(id);
    onChange();
  };

  const startEdit = (d: Department) => {
    setEditing(d);
    setName(d.name);
    setSelectedCompanies((d.department_companies || []).map((dc) => dc.company_id));
    setCreating(false);
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-800">Отделы</h3>
        <button onClick={() => { setCreating(true); setName(''); setSelectedCompanies([]); }} className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input w-full px-4 py-2 text-sm"
            placeholder="Название отдела"
            autoFocus
          />
          <div>
            <p className="text-xs font-medium text-neutral-600 mb-2">Связанные организации:</p>
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCompanies((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedCompanies.includes(c.id) ? 'bg-blue-500 text-white' : 'bg-white/70 text-neutral-600 hover:bg-white'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
              <Save className="w-4 h-4" /> Сохранить
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); setName(''); setSelectedCompanies([]); }} className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {departments.length === 0 ? (
          <p className="text-center text-neutral-400 py-8 text-sm">Отделы не созданы</p>
        ) : (
          departments.map((d) => {
            const linkedNames = (d.department_companies || []).map((dc) => companies.find((c) => c.id === dc.company_id)?.name).filter(Boolean);
            return (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/40 hover:bg-white/70 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <FolderTree className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-neutral-700">{d.name}</span>
                    {linkedNames.length > 0 && (
                      <p className="text-xs text-neutral-400 mt-0.5">{linkedNames.join(', ')}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(d)} className="p-2 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(d.id)} className="p-2 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ===== USERS =====
function UsersTab({ users, departments, companies, onChange }: { users: AppUser[]; departments: Department[]; companies: Company[]; onChange: () => void }) {
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    full_name: '', login: '', password: '', role: 'AUTHOR' as UserRole,
    excel_alias: '', department_id: '', company_ids: [] as string[],
  });

  const handleSave = async () => {
    const data = {
      full_name: form.full_name,
      login: form.login,
      password: form.password || undefined,
      role: form.role,
      excel_alias: form.excel_alias || undefined,
      department_id: form.department_id || undefined,
      company_ids: form.company_ids,
    };
    if (editing) {
      await apiUpdateUser(editing.id, data);
    } else {
      await apiCreateUser(data as { full_name: string; login: string; password: string; role: UserRole; excel_alias?: string; department_id?: string; company_ids?: string[] });
    }
    setEditing(null); setCreating(false);
    setForm({ full_name: '', login: '', password: '', role: 'AUTHOR', excel_alias: '', department_id: '', company_ids: [] });
    onChange();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить пользователя?')) return;
    await apiDeleteUser(id);
    onChange();
  };

  const startEdit = (u: AppUser) => {
    setEditing(u);
    setCreating(false);
    setForm({
      full_name: u.full_name,
      login: u.login,
      password: '',
      role: u.role,
      excel_alias: u.excel_alias || '',
      department_id: u.department_id || '',
      company_ids: (u.user_companies || []).map((uc) => uc.company_id),
    });
  };

  const roleLabel = (r: UserRole) => ROLES.find((role) => role.value === r)?.label || r;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-800">Пользователи</h3>
        <button onClick={() => { setCreating(true); setForm({ full_name: '', login: '', password: '', role: 'AUTHOR', excel_alias: '', department_id: '', company_ids: [] }); }} className="glass-button flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700">
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">ФИО</label>
              <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="glass-input w-full px-3 py-2 text-sm" placeholder="ФИО" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Логин (псевдоним)</label>
              <input type="text" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} className="glass-input w-full px-3 py-2 text-sm" placeholder="login" disabled={!!editing} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">{editing ? 'Новый пароль (необязательно)' : 'Пароль'}</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="glass-input w-full px-3 py-2 text-sm" placeholder="••••••" required={!editing} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Роль</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="glass-input w-full px-3 py-2 text-sm">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Excel Alias (для 1С)</label>
              <input type="text" value={form.excel_alias} onChange={(e) => setForm({ ...form, excel_alias: e.target.value })} className="glass-input w-full px-3 py-2 text-sm" placeholder="Имя из 1С" />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Отдел</label>
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="glass-input w-full px-3 py-2 text-sm">
                <option value="">Без отдела</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-600 mb-2">Доступ к организациям:</p>
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setForm({ ...form, company_ids: form.company_ids.includes(c.id) ? form.company_ids.filter((id) => id !== c.id) : [...form.company_ids, c.id] })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${form.company_ids.includes(c.id) ? 'bg-blue-500 text-white' : 'bg-white/70 text-neutral-600 hover:bg-white'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
              <Save className="w-4 h-4" /> Сохранить
            </button>
            <button onClick={() => { setCreating(false); setEditing(null); }} className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.length === 0 ? (
          <p className="text-center text-neutral-400 py-8 text-sm">Пользователи не созданы</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/40 hover:bg-white/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-200 flex items-center justify-center text-sm font-semibold text-neutral-600">
                  {u.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="text-sm font-medium text-neutral-700">{u.full_name}</span>
                  <p className="text-xs text-neutral-400 mt-0.5">@{u.login} · {roleLabel(u.role)}{u.excel_alias ? ` · 1С: ${u.excel_alias}` : ''}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(u)} className="p-2 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(u.id)} className="p-2 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ===== UPLOAD =====
function UploadTab({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [preview, setPreview] = useState<{
    headers: string[];
    sampleRows: string[][];
    totalRows: number;
    autoMapping: Record<string, number>;
    systemFields: { key: string; label: string }[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<string | null>(null);

  const handleRematch = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const res = await apiRematchAuthors();
      if (res.error) {
        setRematchResult(`Ошибка: ${res.error}`);
      } else {
        setRematchResult(`Проверено ${res.checked} документов, сопоставлено ${res.matched} авторов.`);
      }
    } catch {
      setRematchResult('Ошибка при сопоставлении');
    } finally {
      setRematching(false);
    }
  };

  const handleFileSelect = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    if (!f) return;
    setPreviewLoading(true);
    try {
      const res = await apiPreviewExcel(f);
      if (res.error) {
        setResult({ success: false, message: res.error });
      } else {
        setPreview({
          headers: res.headers,
          sampleRows: res.sample_rows,
          totalRows: res.total_rows,
          autoMapping: res.auto_mapping,
          systemFields: res.system_fields,
        });
        const init: Record<string, number> = {};
        for (const sf of res.system_fields) {
          if (sf.key !== '__skip__' && res.auto_mapping[sf.key] !== undefined) {
            init[sf.key] = res.auto_mapping[sf.key];
          }
        }
        setMapping(init);
      }
    } catch {
      setResult({ success: false, message: 'Ошибка чтения файла' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !companyId) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await apiUploadExcel(file, companyId, mapping);
      if (res.error) {
        setResult({ success: false, message: res.error });
      } else {
        setResult({
          success: true,
          message: `Загружено ${res.inserted} из ${res.total_rows} строк. Сопоставлено авторов: ${res.matched_authors}.`,
        });
        setPreview(null);
        setFile(null);
      }
    } catch {
      setResult({ success: false, message: 'Ошибка загрузки файла' });
    } finally {
      setImporting(false);
    }
  };

  const handleMappingChange = (fieldKey: string, colIndex: number | '__skip__') => {
    setMapping((prev) => {
      const next = { ...prev };
      if (colIndex === '__skip__') {
        delete next[fieldKey];
      } else {
        for (const k of Object.keys(next)) {
          if (next[k] === colIndex) delete next[k];
        }
        next[fieldKey] = colIndex;
      }
      return next;
    });
  };

  const requiredFields = ['doc_number', 'doc_date'];
  const canImport = !!companyId && !!file && !!preview && requiredFields.every((f) => mapping[f] !== undefined) && !importing;

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 max-w-2xl mx-auto">
        <h3 className="text-lg font-semibold text-neutral-800 mb-2">Загрузка реестра из 1С</h3>
        <p className="text-sm text-neutral-500 mb-6">Выберите организацию и файл .xlsx. После выбора файла вы сможете сопоставить столбцы перед загрузкой.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Организация</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm">
              <option value="">Выберите организацию</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">Файл .xlsx</label>
            <div className="relative">
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer file:transition-colors"
              />
            </div>
          </div>

          {previewLoading && (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
              Анализ файла...
            </div>
          )}

          {result && (
            <div className={`p-4 rounded-xl text-sm animate-fade-in ${result.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
              {result.message}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-800">Повторное сопоставление авторов</h3>
            <p className="text-sm text-neutral-500 mt-1">Если после создания новых пользователей документы без автора остались — пересопоставьте их по имени и псевдониму.</p>
          </div>
          <button
            onClick={handleRematch}
            disabled={rematching}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-medium shadow-md hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {rematching ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Сопоставление...</> : <><RefreshCw className="w-4 h-4" /> Сопоставить</>}
          </button>
        </div>
        {rematchResult && (
          <div className="mt-4 p-4 rounded-xl text-sm bg-blue-50 border border-blue-100 text-blue-700 animate-fade-in">
            {rematchResult}
          </div>
        )}
      </div>

      {preview && (
        <ColumnMappingModal
          preview={preview}
          mapping={mapping}
          onMappingChange={handleMappingChange}
          companyId={companyId}
          canImport={canImport}
          importing={importing}
          onImport={handleImport}
          onCancel={() => { setPreview(null); setFile(null); }}
        />
      )}
    </div>
  );
}

function ColumnMappingModal({
  preview, mapping, onMappingChange, companyId, canImport, importing, onImport, onCancel,
}: {
  preview: {
    headers: string[];
    sampleRows: string[][];
    totalRows: number;
    systemFields: { key: string; label: string }[];
  };
  mapping: Record<string, number>;
  onMappingChange: (fieldKey: string, colIndex: number | '__skip__') => void;
  companyId: string;
  canImport: boolean;
  importing: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  const usedColumns = new Set(Object.values(mapping));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass-card w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div>
            <h3 className="text-lg font-semibold text-neutral-800 flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-blue-500" /> Сопоставление столбцов
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Проверьте, какие столбцы файла соответствуют полям системы. Всего строк: {preview.totalRows}
            </p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-auto flex-1 p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Поле системы</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Столбец файла</th>
                  {preview.sampleRows.map((_, i) => (
                    <th key={i} className="text-left py-2 px-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Образец {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.systemFields.filter((f) => f.key !== '__skip__').map((field) => {
                  const mappedCol = mapping[field.key];
                  return (
                    <tr key={field.key} className="border-b border-neutral-100">
                      <td className="py-2.5 px-3">
                        <span className={`font-medium ${['doc_number', 'doc_date'].includes(field.key) ? 'text-neutral-800' : 'text-neutral-600'}`}>
                          {field.label}
                          {['doc_number', 'doc_date'].includes(field.key) && <span className="text-red-500 ml-0.5">*</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={mappedCol !== undefined ? String(mappedCol) : '__skip__'}
                          onChange={(e) => onMappingChange(field.key, e.target.value === '__skip__' ? '__skip__' : parseInt(e.target.value))}
                          className="glass-input px-3 py-1.5 text-sm min-w-[180px]"
                        >
                          <option value="__skip__">— Пропустить —</option>
                          {preview.headers.map((h, i) => (
                            <option key={i} value={i} disabled={usedColumns.has(i) && mappedCol !== i}>
                              {h || `Столбец ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </td>
                      {preview.sampleRows.map((row, i) => (
                        <td key={i} className="py-2.5 px-3 text-neutral-500 max-w-[160px] truncate">
                          {mappedCol !== undefined ? (row[mappedCol] || '—') : <span className="text-neutral-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-neutral-50/60 border border-neutral-100">
            <p className="text-xs font-medium text-neutral-500 mb-2">Заголовки файла (первые 20):</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.headers.slice(0, 20).map((h, i) => (
                <span key={i} className={`px-2 py-1 rounded-lg text-xs font-mono ${usedColumns.has(i) ? 'bg-blue-100 text-blue-700' : 'bg-white text-neutral-500 border border-neutral-200'}`}>
                  {i}: {h || '(пусто)'}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-neutral-100">
          <div className="text-sm text-neutral-500">
            {!companyId && <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="w-4 h-4" /> Выберите организацию</span>}
            {companyId && !canImport && !importing && (
              <span className="flex items-center gap-1.5 text-amber-600"><AlertCircle className="w-4 h-4" /> Поля «Номер» и «Дата» обязательны</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-4 py-2.5 rounded-xl bg-white/60 text-neutral-600 text-sm font-medium hover:bg-white transition-colors">
              Отмена
            </button>
            <button
              onClick={onImport}
              disabled={!canImport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              {importing ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Загрузка...</>
              ) : (
                <><Check className="w-4 h-4" /> Загрузить {preview.totalRows} строк</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
