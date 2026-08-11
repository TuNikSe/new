/*
# Registry Management System — Full Schema

## Overview
Creates the complete PostgreSQL schema for the "Automated Management and Two-Stage Control of UPD Registries from 1C" system. Multi-user, role-based application with isolated closed authorization (text login, no public registration, admin-created accounts only).

## Enums
- user_role: ADMIN, AUTHOR, CHECKER1, CHECKER2, DEPT_HEAD, COMPANY_HEAD
- submission_status: NOT_SUBMITTED, SUBMITTED_PAPER, SUBMITTED_EDO_UNSIGNED, SUBMITTED_EDO_SIGNED, RETURNED
- check_status: PENDING, APPROVED, RETURNED

## Tables
1. companies — Organizations
2. departments — Departments
3. department_companies — M2M departments <-> companies
4. app_users — Application users (links to auth.users via auth_id). Text login, role, excel_alias, department.
5. user_companies — M2M app_users <-> companies
6. documents — Core registry table with submission status, two-stage check, soft-delete flags.
7. audit_logs — Chronological change journal per document.

## Indexes
- idx_docs_highload, idx_docs_trim_zero, idx_docs_assigned_dept, idx_audit_doc

## Security (RLS)
- RLS on all tables. Role-based visibility enforced via helper functions.
- Audit logs scoped so users only see entries for documents they can access (comment isolation).
*/

CREATE TYPE user_role AS ENUM ('ADMIN', 'AUTHOR', 'CHECKER1', 'CHECKER2', 'DEPT_HEAD', 'COMPANY_HEAD');

CREATE TYPE submission_status AS ENUM (
  'NOT_SUBMITTED',
  'SUBMITTED_PAPER',
  'SUBMITTED_EDO_UNSIGNED',
  'SUBMITTED_EDO_SIGNED',
  'RETURNED'
);

CREATE TYPE check_status AS ENUM ('PENDING', 'APPROVED', 'RETURNED');

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS department_companies (
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (department_id, company_id)
);
ALTER TABLE department_companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  full_name text NOT NULL,
  login text NOT NULL UNIQUE,
  password_hash text,
  role user_role NOT NULL DEFAULT 'AUTHOR',
  excel_alias text,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_login ON app_users (login);
CREATE INDEX IF NOT EXISTS idx_app_users_excel_alias ON app_users (excel_alias);
CREATE INDEX IF NOT EXISTS idx_app_users_auth_id ON app_users (auth_id);
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS user_companies (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL,
  doc_number text NOT NULL,
  doc_number_clean text,
  doc_date date NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  client_name text,
  manager_name text,
  author_raw text,
  assigned_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  submission_status submission_status NOT NULL DEFAULT 'NOT_SUBMITTED',
  checker1_status check_status NOT NULL DEFAULT 'PENDING',
  checker2_status check_status NOT NULL DEFAULT 'PENDING',
  is_marked_for_deletion boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_docs_highload ON documents (company_id, doc_date, submission_status, is_deleted, is_marked_for_deletion);
CREATE INDEX IF NOT EXISTS idx_docs_trim_zero ON documents (doc_number_clean);
CREATE INDEX IF NOT EXISTS idx_docs_assigned_dept ON documents (assigned_user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_docs_author_raw ON documents (author_raw);
CREATE INDEX IF NOT EXISTS idx_docs_company_date ON documents (company_id, doc_date);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_logs (document_id, created_at);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Trigger: derive doc_number_clean + updated_at
CREATE OR REPLACE FUNCTION derive_doc_number_clean()
RETURNS trigger AS $$
BEGIN
  NEW.doc_number_clean := regexp_replace(NEW.doc_number, '[^0-9]', '', 'g');
  NEW.doc_number_clean := regexp_replace(NEW.doc_number_clean, '^0+', '', '');
  IF NEW.doc_number_clean = '' THEN
    NEW.doc_number_clean := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_derive_doc_number ON documents;
CREATE TRIGGER trg_derive_doc_number
BEFORE INSERT OR UPDATE OF doc_number ON documents
FOR EACH ROW EXECUTE FUNCTION derive_doc_number_clean();

-- Helper functions
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS uuid AS $$
  SELECT id FROM app_users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM app_users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_dept()
RETURNS uuid AS $$
  SELECT department_id FROM app_users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_company_ids()
RETURNS uuid[] AS $$
  SELECT array_agg(uc.company_id) FROM user_companies uc
  JOIN app_users au ON au.id = uc.user_id
  WHERE au.auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS: COMPANIES
DROP POLICY IF EXISTS "companies_admin_all" ON companies;
CREATE POLICY "companies_admin_all" ON companies
  FOR ALL TO authenticated
  USING (current_user_role() = 'ADMIN')
  WITH CHECK (current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "companies_read_accessible" ON companies;
CREATE POLICY "companies_read_accessible" ON companies
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
    OR id = ANY(current_user_company_ids())
    OR id IN (
      SELECT dc.company_id FROM department_companies dc
      WHERE dc.department_id = current_user_dept()
    )
  );

-- RLS: DEPARTMENTS
DROP POLICY IF EXISTS "departments_admin_all" ON departments;
CREATE POLICY "departments_admin_all" ON departments
  FOR ALL TO authenticated
  USING (current_user_role() = 'ADMIN')
  WITH CHECK (current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "departments_read_accessible" ON departments;
CREATE POLICY "departments_read_accessible" ON departments
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
    OR id = current_user_dept()
  );

-- RLS: DEPARTMENT_COMPANIES
DROP POLICY IF EXISTS "dept_companies_admin_all" ON department_companies;
CREATE POLICY "dept_companies_admin_all" ON department_companies
  FOR ALL TO authenticated
  USING (current_user_role() = 'ADMIN')
  WITH CHECK (current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "dept_companies_read" ON department_companies;
CREATE POLICY "dept_companies_read" ON department_companies
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
    OR department_id = current_user_dept()
    OR company_id = ANY(current_user_company_ids())
  );

-- RLS: APP_USERS
DROP POLICY IF EXISTS "app_users_read_self_or_admin" ON app_users;
CREATE POLICY "app_users_read_self_or_admin" ON app_users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "app_users_admin_modify" ON app_users;
CREATE POLICY "app_users_admin_modify" ON app_users
  FOR ALL TO authenticated
  USING (current_user_role() = 'ADMIN')
  WITH CHECK (current_user_role() = 'ADMIN');

-- RLS: USER_COMPANIES
DROP POLICY IF EXISTS "user_companies_admin_all" ON user_companies;
CREATE POLICY "user_companies_admin_all" ON user_companies
  FOR ALL TO authenticated
  USING (current_user_role() = 'ADMIN')
  WITH CHECK (current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "user_companies_read_self" ON user_companies;
CREATE POLICY "user_companies_read_self" ON user_companies
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'ADMIN'
    OR user_id = current_app_user_id()
  );

-- RLS: DOCUMENTS (SELECT — role-based visibility)
DROP POLICY IF EXISTS "documents_select_role" ON documents;
CREATE POLICY "documents_select_role" ON documents
  FOR SELECT TO authenticated
  USING (
    (is_deleted = false OR current_user_role() = 'ADMIN')
    AND (
      current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
      OR (
        current_user_role() = 'AUTHOR' AND (
          assigned_user_id = current_app_user_id()
          OR (
            current_user_dept() IS NOT NULL AND assigned_user_id IN (
              SELECT id FROM app_users WHERE department_id = current_user_dept()
            )
          )
        )
      )
      OR (
        current_user_role() = 'DEPT_HEAD' AND assigned_user_id IN (
          SELECT id FROM app_users WHERE department_id = current_user_dept()
        )
      )
      OR (
        current_user_role() = 'COMPANY_HEAD' AND company_id = ANY(current_user_company_ids())
      )
    )
  );

DROP POLICY IF EXISTS "documents_update_role" ON documents;
CREATE POLICY "documents_update_role" ON documents
  FOR UPDATE TO authenticated
  USING (
    current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
    OR (
      current_user_role() = 'AUTHOR' AND (
        assigned_user_id = current_app_user_id()
        OR (
          current_user_dept() IS NOT NULL AND assigned_user_id IN (
            SELECT id FROM app_users WHERE department_id = current_user_dept()
          )
        )
      )
    )
  )
  WITH CHECK (
    current_user_role() IN ('ADMIN','CHECKER1','CHECKER2','AUTHOR')
  );

DROP POLICY IF EXISTS "documents_insert_admin" ON documents;
CREATE POLICY "documents_insert_admin" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "documents_delete_admin" ON documents;
CREATE POLICY "documents_delete_admin" ON documents
  FOR DELETE TO authenticated
  USING (current_user_role() = 'ADMIN');

-- RLS: AUDIT_LOGS (comment isolation — only see logs for docs you can access)
DROP POLICY IF EXISTS "audit_logs_select_visible" ON audit_logs;
CREATE POLICY "audit_logs_select_visible" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = audit_logs.document_id
      AND (
        current_user_role() IN ('ADMIN','CHECKER1','CHECKER2')
        OR (
          current_user_role() = 'AUTHOR' AND (
            d.assigned_user_id = current_app_user_id()
            OR (
              current_user_dept() IS NOT NULL AND d.assigned_user_id IN (
                SELECT id FROM app_users WHERE department_id = current_user_dept()
              )
            )
          )
        )
        OR (
          current_user_role() = 'DEPT_HEAD' AND d.assigned_user_id IN (
            SELECT id FROM app_users WHERE department_id = current_user_dept()
          )
        )
        OR (
          current_user_role() = 'COMPANY_HEAD' AND d.company_id = ANY(current_user_company_ids())
        )
      )
    )
  );

DROP POLICY IF EXISTS "audit_logs_insert_admin" ON audit_logs;
CREATE POLICY "audit_logs_insert_admin" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'ADMIN');

-- SECURITY DEFINER functions for privileged operations
CREATE OR REPLACE FUNCTION log_audit(
  p_document_id uuid, p_user_id uuid, p_action_type text,
  p_old_value jsonb DEFAULT NULL, p_new_value jsonb DEFAULT NULL, p_comment text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (document_id, user_id, action_type, old_value, new_value, comment)
  VALUES (p_document_id, p_user_id, p_action_type, p_old_value, p_new_value, p_comment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION change_submission_status(
  p_document_id uuid, p_new_status submission_status, p_user_id uuid, p_comment text DEFAULT NULL
)
RETURNS void AS $$
DECLARE v_old submission_status;
BEGIN
  SELECT submission_status INTO v_old FROM documents WHERE id = p_document_id;
  UPDATE documents SET submission_status = p_new_status WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'SUBMISSION_STATUS_CHANGE',
    jsonb_build_object('submission_status', v_old),
    jsonb_build_object('submission_status', p_new_status), p_comment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_check_status(
  p_document_id uuid, p_stage text, p_new_status check_status, p_user_id uuid, p_comment text DEFAULT NULL
)
RETURNS void AS $$
DECLARE v_old check_status;
BEGIN
  IF p_stage = 'checker1' THEN
    SELECT checker1_status INTO v_old FROM documents WHERE id = p_document_id;
    UPDATE documents SET checker1_status = p_new_status WHERE id = p_document_id;
  ELSE
    SELECT checker2_status INTO v_old FROM documents WHERE id = p_document_id;
    UPDATE documents SET checker2_status = p_new_status WHERE id = p_document_id;
  END IF;
  PERFORM log_audit(p_document_id, p_user_id, 'CHECK_' || upper(p_stage) || '_STATUS',
    jsonb_build_object(p_stage || '_status', v_old),
    jsonb_build_object(p_stage || '_status', p_new_status), p_comment);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_for_deletion(p_document_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE documents SET is_marked_for_deletion = true WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'MARKED_FOR_DELETION', NULL, NULL, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION restore_from_marked(p_document_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE documents SET is_marked_for_deletion = false WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'RESTORED_FROM_MARKED', NULL, NULL, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION purge_document(p_document_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE documents SET is_deleted = true, is_marked_for_deletion = false WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'PURGED_TO_TRASH', NULL, NULL, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION restore_from_trash(p_document_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE documents SET is_deleted = false WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'RESTORED_FROM_TRASH', NULL, NULL, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_document_fields(
  p_document_id uuid, p_user_id uuid,
  p_doc_number text DEFAULT NULL, p_amount numeric DEFAULT NULL,
  p_client_name text DEFAULT NULL, p_assigned_user_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  SELECT jsonb_build_object('doc_number', doc_number, 'amount', amount, 'client_name', client_name, 'assigned_user_id', assigned_user_id)
  INTO v_old FROM documents WHERE id = p_document_id;
  UPDATE documents SET
    doc_number = COALESCE(p_doc_number, doc_number),
    amount = COALESCE(p_amount, amount),
    client_name = COALESCE(p_client_name, client_name),
    assigned_user_id = COALESCE(p_assigned_user_id, assigned_user_id)
  WHERE id = p_document_id;
  SELECT jsonb_build_object('doc_number', doc_number, 'amount', amount, 'client_name', client_name, 'assigned_user_id', assigned_user_id)
  INTO v_new FROM documents WHERE id = p_document_id;
  PERFORM log_audit(p_document_id, p_user_id, 'FIELDS_UPDATED', v_old, v_new, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_dept() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_company_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit TO authenticated;
GRANT EXECUTE ON FUNCTION change_submission_status TO authenticated;
GRANT EXECUTE ON FUNCTION set_check_status TO authenticated;
GRANT EXECUTE ON FUNCTION mark_for_deletion TO authenticated;
GRANT EXECUTE ON FUNCTION restore_from_marked TO authenticated;
GRANT EXECUTE ON FUNCTION purge_document TO authenticated;
GRANT EXECUTE ON FUNCTION restore_from_trash TO authenticated;
GRANT EXECUTE ON FUNCTION update_document_fields TO authenticated;
