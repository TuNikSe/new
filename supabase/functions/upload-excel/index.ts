import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCaller(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) return null;
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, role")
    .eq("auth_id", data.user.id)
    .single();
  return appUser;
}

// Minimal XLSX sheet parser (reads shared strings + sheet data inline)
// Supports .xlsx files produced by 1C (standard OOXML).
// For very large files we parse the zip entries in streaming fashion.

async function readZipEntries(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Find End of Central Directory
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Invalid ZIP: EOCD not found");
  const cdCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const compMethod = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = new TextDecoder().decode(data.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    // Read local header
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compressed = data.subarray(dataStart, dataStart + compSize);

    let decompressed: Uint8Array;
    if (compMethod === 0) {
      decompressed = compressed;
    } else if (compMethod === 8) {
      decompressed = await inflateRaw(compressed, uncompSize);
    } else {
      throw new Error(`Unsupported compression method: ${compMethod}`);
    }
    entries.set(name, decompressed);
  }
  return entries;
}

// Raw DEFLATE decompressor — uses "deflate-raw" format (no zlib wrapper needed)
async function inflateRaw(data: Uint8Array, _expectedSize: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw" as CompressionFormat);
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function parseXmlSharedStrings(xml: Uint8Array): string[] {
  const text = new TextDecoder().decode(xml);
  const strings: string[] = [];
  const siRegex = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(text)) !== null) {
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    let val = "";
    while ((tm = tRegex.exec(m[1])) !== null) {
      val += tm[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
    strings.push(val);
  }
  return strings;
}

function parseSheetRows(sheetXml: Uint8Array, sharedStrings: string[]): string[][] {
  const text = new TextDecoder().decode(sheetXml);
  const rows: string[][] = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(text)) !== null) {
    const rowContent = rm[1];
    const cells: string[] = [];
    // Match each <c ...>...</c> element, then extract type attribute separately
    const cRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cRegex.exec(rowContent)) !== null) {
      const attrs = cm[1];
      const inner = cm[2];
      const typeMatch = attrs.match(/\bt="([^"]*)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const vMatch = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is[^>]*>([\s\S]*?)<\/is>/);
      let value = "";
      if (type === "s" && vMatch) {
        const idx = parseInt(vMatch[1], 10);
        value = sharedStrings[idx] || "";
      } else if (type === "inlineStr" && isMatch) {
        const tMatch = isMatch[1].match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (tMatch) value = tMatch[1];
      } else if (vMatch) {
        value = vMatch[1];
      }
      cells.push(value);
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// System fields that the admin can map Excel columns to
const SYSTEM_FIELDS = [
  { key: "doc_type", label: "Тип документа" },
  { key: "doc_number", label: "Номер документа" },
  { key: "doc_date", label: "Дата документа" },
  { key: "amount", label: "Сумма" },
  { key: "client_name", label: "Контрагент / Клиент" },
  { key: "manager_name", label: "Менеджер" },
  { key: "author_raw", label: "Автор" },
  { key: "organization", label: "Организация" },
  { key: "__skip__", label: "— Пропустить —" },
] as const;

function autoDetectColumns(headerRow: string[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const lower = h.toLowerCase().trim();
    if (lower.includes("тип") && lower.includes("докум")) colMap.doc_type = i;
    else if (lower === "тип документа") colMap.doc_type = i;
    if (lower === "номер" || lower.includes("номер документ")) colMap.doc_number = i;
    if (lower === "дата" || lower.includes("дата документ")) colMap.doc_date = i;
    if (lower.includes("сумм")) colMap.amount = i;
    if (lower.includes("контраг") || lower.includes("покупат") || lower.includes("клиент")) colMap.client_name = i;
    if (lower.includes("менедж")) colMap.manager_name = i;
    if (lower === "автор" || lower.startsWith("автор ")) colMap.author_raw = i;
    if (lower.includes("организ") || lower.includes("компани")) colMap.organization = i;
  });
  return colMap;
}

function parseDate(dateStr: string): string {
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  if (dotMatch) return `${dotMatch[3]}-${dotMatch[2].padStart(2, "0")}-${dotMatch[1].padStart(2, "0")}`;
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

async function parseXlsx(file: File): Promise<{ headers: string[]; dataRows: string[][] }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await readZipEntries(bytes);

  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseXmlSharedStrings(sharedStringsXml) : [];

  let sheetXml: Uint8Array | undefined;
  for (const [name, data] of entries) {
    if (name.match(/^xl\/worksheets\/sheet1\.xml$/)) { sheetXml = data; break; }
  }
  if (!sheetXml) {
    for (const [name, data] of entries) {
      if (name.match(/^xl\/worksheets\/sheet.*\.xml$/)) { sheetXml = data; break; }
    }
  }
  if (!sheetXml) throw new Error("No worksheet found in xlsx");

  const rows = parseSheetRows(sheetXml, sharedStrings);
  if (rows.length < 2) throw new Error("File has no data rows");

  return { headers: rows[0], dataRows: rows.slice(1) };
}

async function handleRoute(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ error: "Authentication required" }, 401);
  if (caller.role !== "ADMIN") return json({ error: "Admin access required" }, 403);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("company_id") as string | null;
  const mode = (formData.get("mode") as string) || "import";
  if (!file) return json({ error: "file required" }, 400);

  let parsed: { headers: string[]; dataRows: string[][] };
  try {
    parsed = await parseXlsx(file);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Failed to parse xlsx" }, 400);
  }

  // PREVIEW mode: return headers, sample rows, and auto-detected mapping
  if (mode === "preview") {
    const autoMap = autoDetectColumns(parsed.headers);
    const sampleRows = parsed.dataRows.slice(0, 5);
    return json({
      headers: parsed.headers,
      sample_rows: sampleRows,
      total_rows: parsed.dataRows.length,
      auto_mapping: autoMap,
      system_fields: SYSTEM_FIELDS,
    });
  }

  // IMPORT mode: require company_id and column_mapping
  if (!companyId) return json({ error: "company_id required for import" }, 400);

  const mappingRaw = formData.get("column_mapping") as string | null;
  let colMap: Record<string, number> = {};
  if (mappingRaw) {
    try {
      colMap = JSON.parse(mappingRaw);
    } catch {
      return json({ error: "Invalid column_mapping JSON" }, 400);
    }
  } else {
    colMap = autoDetectColumns(parsed.headers);
  }

  // Remove __skip__ and organization from colMap (organization is informational only)
  delete colMap.__skip__;

  // Load excel_alias -> user_id mapping
  const { data: users } = await supabase.from("app_users").select("id, excel_alias, login, full_name");
  const aliasMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  (users || []).forEach((u: { id: string; excel_alias: string | null; login: string; full_name: string }) => {
    if (u.excel_alias) aliasMap.set(u.excel_alias.toLowerCase().trim(), u.id);
    nameMap.set(u.full_name.toLowerCase().trim(), u.id);
    nameMap.set(u.login.toLowerCase().trim(), u.id);
  });

  const dataRows = parsed.dataRows;
  const BATCH = 1000;
  let inserted = 0;
  let matched = 0;

  for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH) {
    const batch = dataRows.slice(batchStart, batchStart + BATCH);
    const records = batch.map((cells) => {
      const docType = colMap.doc_type !== undefined ? (cells[colMap.doc_type] || "УПД") : "УПД";
      const docNumber = colMap.doc_number !== undefined ? (cells[colMap.doc_number] || "") : "";
      const dateStr = colMap.doc_date !== undefined ? (cells[colMap.doc_date] || "") : "";
      const amountStr = colMap.amount !== undefined ? (cells[colMap.amount] || "0") : "0";
      const clientName = colMap.client_name !== undefined ? (cells[colMap.client_name] || "") : "";
      const authorRaw = colMap.author_raw !== undefined ? (cells[colMap.author_raw] || "") : "";
      const managerName = colMap.manager_name !== undefined ? (cells[colMap.manager_name] || "") : "";

      const docDate = parseDate(dateStr);
      const amount = parseFloat(amountStr.replace(/[^\d.-]/g, "")) || 0;

      let assignedUserId: string | null = null;
      const authorLower = authorRaw.toLowerCase().trim();
      if (aliasMap.has(authorLower)) {
        assignedUserId = aliasMap.get(authorLower)!;
        matched++;
      } else if (nameMap.has(authorLower)) {
        assignedUserId = nameMap.get(authorLower)!;
        matched++;
      }

      return {
        doc_type: docType,
        doc_number: docNumber,
        doc_date: docDate,
        company_id: companyId,
        amount,
        client_name: clientName,
        manager_name: managerName,
        author_raw: authorRaw,
        assigned_user_id: assignedUserId,
        submission_status: "NOT_SUBMITTED" as const,
      };
    }).filter((r) => r.doc_number);

    if (records.length > 0) {
      const { error } = await supabase.from("documents").insert(records);
      if (error) {
        return json({ error: `Insert failed at batch starting row ${batchStart + 2}: ${error.message}`, total_rows: dataRows.length, inserted }, 400);
      } else {
        inserted += records.length;
      }
    }
  }

  return json({ success: true, total_rows: dataRows.length, inserted, matched_authors: matched });
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRoute(req);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
