import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type UserRole = 'ADMIN' | 'AUTHOR' | 'CHECKER1' | 'CHECKER2' | 'DEPT_HEAD' | 'COMPANY_HEAD';

export type SubmissionStatus = 'NOT_SUBMITTED' | 'SUBMITTED_PAPER' | 'SUBMITTED_EDO_UNSIGNED' | 'SUBMITTED_EDO_SIGNED' | 'RETURNED';

export type CheckStatus = 'PENDING' | 'APPROVED' | 'RETURNED';

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
  department_companies?: { company_id: string }[];
}

export interface AppUser {
  id: string;
  auth_id: string | null;
  full_name: string;
  login: string;
  role: UserRole;
  excel_alias: string | null;
  department_id: string | null;
  created_at: string;
  user_companies?: { company_id: string }[];
}

export interface DocumentRow {
  id: string;
  doc_type: string;
  doc_number: string;
  doc_number_clean: string | null;
  doc_date: string;
  company_id: string;
  amount: number;
  client_name: string | null;
  manager_name: string | null;
  author_raw: string | null;
  assigned_user_id: string | null;
  submission_status: SubmissionStatus;
  checker1_status: CheckStatus;
  checker2_status: CheckStatus;
  is_marked_for_deletion: boolean;
  is_deleted: boolean;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  company?: { id: string; name: string } | null;
  assigned_user?: { id: string; full_name: string; login: string } | null;
}

export interface AuditLog {
  id: string;
  document_id: string;
  user_id: string | null;
  action_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  comment: string | null;
  created_at: string;
  user?: { id: string; full_name: string; login: string } | null;
}

export interface DashboardCounts {
  total: number;
  not_submitted: number;
  paper: number;
  edo_unsigned: number;
  edo_signed: number;
  confirmed: number;
  returned: number;
  deleted: number;
}

const FUNCTION_URL = `${supabaseUrl}/functions/v1`;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
  };
  return headers;
}

async function authHeadersWithToken(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${token}`,
  };
}

// ===== API functions =====

export async function apiCheckBootstrap(): Promise<{ needs_bootstrap: boolean }> {
  const res = await fetch(`${FUNCTION_URL}/auth-admin/check-bootstrap`, { headers: authHeaders() });
  return res.json();
}

export async function apiBootstrap(login: string, password: string, fullName: string) {
  const res = await fetch(`${FUNCTION_URL}/auth-admin/bootstrap`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ login, password, full_name: fullName }),
  });
  return res.json();
}

export async function apiLogin(login: string, password: string) {
  const syntheticEmail = `${login.toLowerCase()}@registry.local`;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  });
  if (error) throw error;
  return data;
}

export async function apiLogout() {
  await supabase.auth.signOut();
}

export async function apiGetCurrentUser(): Promise<AppUser | null> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/me`, { headers });
  if (!res.ok) return null;
  return res.json();
}

// Companies
export async function apiGetCompanies(): Promise<Company[]> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/companies`, { headers });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function apiCreateCompany(name: string): Promise<Company> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/companies`, {
    method: 'POST', headers, body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function apiUpdateCompany(id: string, name: string): Promise<Company> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/companies/${id}`, {
    method: 'PUT', headers, body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function apiDeleteCompany(id: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/companies/${id}`, { method: 'DELETE', headers });
  return res.json();
}

// Departments
export async function apiGetDepartments(): Promise<Department[]> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/departments`, { headers });
  return res.json();
}

export async function apiCreateDepartment(name: string, companyIds: string[]): Promise<Department> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/departments`, {
    method: 'POST', headers, body: JSON.stringify({ name, company_ids: companyIds }),
  });
  return res.json();
}

export async function apiUpdateDepartment(id: string, name: string, companyIds: string[]): Promise<Department> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/departments/${id}`, {
    method: 'PUT', headers, body: JSON.stringify({ name, company_ids: companyIds }),
  });
  return res.json();
}

export async function apiDeleteDepartment(id: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/departments/${id}`, { method: 'DELETE', headers });
  return res.json();
}

// Users
export async function apiGetUsers(): Promise<AppUser[]> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/users`, { headers });
  return res.json();
}

export async function apiCreateUser(data: {
  full_name: string; login: string; password: string; role: UserRole;
  excel_alias?: string; department_id?: string; company_ids?: string[];
}): Promise<AppUser> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/users`, {
    method: 'POST', headers, body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiUpdateUser(id: string, data: {
  full_name?: string; login?: string; password?: string; role?: UserRole;
  excel_alias?: string; department_id?: string; company_ids?: string[];
}): Promise<AppUser> {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/users/${id}`, {
    method: 'PUT', headers, body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiDeleteUser(id: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/auth-admin/users/${id}`, { method: 'DELETE', headers });
  return res.json();
}

// Documents
export async function apiListDocuments(params: {
  company_id?: string; year?: string; month?: string; day?: string;
  status?: string; show_deleted?: boolean;
}): Promise<DocumentRow[]> {
  const headers = await authHeadersWithToken();
  const qs = new URLSearchParams();
  if (params.company_id) qs.set('company_id', params.company_id);
  if (params.year) qs.set('year', params.year);
  if (params.month) qs.set('month', params.month);
  if (params.day) qs.set('day', params.day);
  if (params.status) qs.set('status', params.status);
  if (params.show_deleted) qs.set('show_deleted', 'true');
  const res = await fetch(`${FUNCTION_URL}/documents-api/list?${qs}`, { headers });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function apiGetCounts(params: {
  company_id?: string; year?: string; month?: string;
}): Promise<DashboardCounts> {
  const headers = await authHeadersWithToken();
  const qs = new URLSearchParams();
  if (params.company_id) qs.set('company_id', params.company_id);
  if (params.year) qs.set('year', params.year);
  if (params.month) qs.set('month', params.month);
  const res = await fetch(`${FUNCTION_URL}/documents-api/counts?${qs}`, { headers });
  const data = await res.json();
  return data && typeof data.total === 'number' ? data : { total: 0, not_submitted: 0, paper: 0, edo_unsigned: 0, edo_signed: 0, confirmed: 0, returned: 0, deleted: 0 };
}

export async function apiFastCheck(query: string): Promise<{ results: DocumentRow[] }> {
  const headers = await authHeadersWithToken();
  const qs = new URLSearchParams({ q: query });
  const res = await fetch(`${FUNCTION_URL}/documents-api/fast-check?${qs}`, { headers });
  const data = await res.json();
  return data && Array.isArray(data.results) ? data : { results: [] };
}

export async function apiChangeSubmissionStatus(documentId: string, newStatus: SubmissionStatus, comment?: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/submission-status`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId, new_status: newStatus, comment }),
  });
  return res.json();
}

export async function apiSetCheckStatus(documentId: string, stage: string, newStatus: CheckStatus, comment?: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/check-status`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId, stage, new_status: newStatus, comment }),
  });
  return res.json();
}

export async function apiUpdateFields(documentId: string, fields: {
  doc_number?: string; amount?: number; client_name?: string; assigned_user_id?: string;
}) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/update-fields`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId, ...fields }),
  });
  return res.json();
}

export async function apiMarkDeletion(documentId: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/mark-deletion`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId }),
  });
  return res.json();
}

export async function apiRestoreMarked(documentId: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/restore-marked`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId }),
  });
  return res.json();
}

export async function apiPurge(documentId: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/purge`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId }),
  });
  return res.json();
}

export async function apiRestoreTrash(documentId: string) {
  const headers = await authHeadersWithToken();
  const res = await fetch(`${FUNCTION_URL}/documents-api/restore-trash`, {
    method: 'POST', headers, body: JSON.stringify({ document_id: documentId }),
  });
  return res.json();
}

export async function apiGetAudit(documentId: string): Promise<AuditLog[]> {
  const headers = await authHeadersWithToken();
  const qs = new URLSearchParams({ document_id: documentId });
  const res = await fetch(`${FUNCTION_URL}/documents-api/audit?${qs}`, { headers });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function apiPreviewExcel(file: File): Promise<{
  headers: string[];
  sample_rows: string[][];
  total_rows: number;
  auto_mapping: Record<string, number>;
  system_fields: { key: string; label: string }[];
  error?: string;
}> {
  const headers = await authHeadersWithToken();
  delete headers['Content-Type'];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', 'preview');
  const res = await fetch(`${FUNCTION_URL}/upload-excel`, {
    method: 'POST', headers, body: formData,
  });
  return res.json();
}

export async function apiUploadExcel(
  file: File,
  companyId: string,
  columnMapping?: Record<string, number>,
): Promise<{ success: boolean; inserted: number; total_rows: number; matched_authors: number; error?: string }> {
  const headers = await authHeadersWithToken();
  delete headers['Content-Type'];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('company_id', companyId);
  if (columnMapping) {
    formData.append('column_mapping', JSON.stringify(columnMapping));
  }
  const res = await fetch(`${FUNCTION_URL}/upload-excel`, {
    method: 'POST', headers, body: formData,
  });
  return res.json();
}

export async function apiRematchAuthors(): Promise<{ success: boolean; matched: number; checked: number; error?: string }> {
  const res = await fetch(`${FUNCTION_URL}/documents-api/rematch-authors`, {
    method: 'POST', headers: await authHeadersWithToken(),
  });
  return res.json();
}
