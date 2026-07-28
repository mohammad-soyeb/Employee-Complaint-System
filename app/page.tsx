"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  "https://dizfopjkpvwtdwenqoao.supabase.co",
  "sb_publishable_th0filEBEzWqblSszePsPg_YOZkKpss",
);

type Employee = { id: string; employee_id: string; name: string; grade: string; status: string; created_at: string };
type Complaint = { id: string; employee_id: string; complaint_type: string; complaint_date: string; added_by: string; status: string; reference: string; note: string; created_at: string };
type LetterTemplate = { id: string; name: string; subject: string; body: string; sort_order: number };
type ComplaintType = { id: string; name: string };
type Settings = { id?: string; company_name: string; company_address: string; authority_name: string; authority_designation: string };
type Tab = "dashboard" | "employee" | "letters" | "settings";

const defaultSettings: Settings = { company_name: "Your Company", company_address: "", authority_name: "HR Manager", authority_designation: "Human Resources" };
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) => value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { error, data } = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup" && !data.session) setMessage("Account created. Please check your email and confirm your account, then sign in.");
  }
  return <main className="login-shell"><section className="login-card">
    <div className="brand brand-login"><span className="brand-mark">EC</span><div><strong>Employee Complaint System</strong><small>Secure HR workspace</small></div></div>
    <div className="login-copy"><span className="eyebrow">PRIVATE WORKSPACE</span><h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1><p>{mode === "login" ? "Sign in to access only your own employee records and complaints." : "Your records will be private and visible only to this account."}</p></div>
    <form onSubmit={submit} className="stack">
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@company.com" autoComplete="email" required /></label>
      <label>Password<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
      {message && <p className="form-message error">{message}</p>}
      <button className="button primary wide" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create private account"}</button>
    </form>
    <p className="security-note">{mode === "login" ? "New here? " : "Already have an account? "}<button className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
  </section></main>;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fallback = window.setTimeout(() => setAuthReady(true), 1500);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
      window.clearTimeout(fallback);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { window.clearTimeout(fallback); data.subscription.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true); setNotice("");
    const results = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("complaints").select("*").order("complaint_date", { ascending: false }),
      supabase.from("letter_templates").select("*").order("sort_order"),
      supabase.from("complaint_types").select("*").order("name"),
      supabase.from("company_settings").select("*").limit(1).maybeSingle(),
    ]);
    const error = results.find((item) => item.error)?.error;
    if (error) setNotice(error.message.includes("relation") ? "Database setup is not complete. Run supabase-setup.sql in Supabase first." : error.message);
    else {
      setEmployees((results[0].data || []) as Employee[]);
      setComplaints((results[1].data || []) as Complaint[]);
      setTemplates((results[2].data || []) as LetterTemplate[]);
      setComplaintTypes((results[3].data || []) as ComplaintType[]);
      if (results[4].data) setSettings(results[4].data as Settings);
    }
    setLoading(false);
  }, [session]);
  useEffect(() => { loadData(); }, [loadData]);

  if (!authReady) return <main className="center-screen">Loading secure workspace…</main>;
  if (!session) return <Login />;

  const filteredEmployees = employees.filter((e) => `${e.employee_id} ${e.name}`.toLowerCase().includes(search.toLowerCase()));
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  async function importExcel(file?: File) {
    if (!file) return;
    setLoading(true);
    const workbook = XLSX.read(await file.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]]);
    const records = rows.map((row) => ({
      employee_id: String(row.ID ?? row.Id ?? row.id ?? "").trim(),
      name: String(row.Name ?? row.name ?? "").trim(),
      grade: String(row.Grade ?? row.grade ?? "").trim(),
      status: String(row.Status ?? row.status ?? "Active").trim(),
    })).filter((row) => row.employee_id && row.name);
    const { error } = await supabase.from("employees").upsert(records, { onConflict: "owner_id,employee_id" });
    setNotice(error ? error.message : `${records.length} employee record(s) imported.`);
    await loadData();
  }
  function openEmployee(id: string) { setSelectedEmployeeId(id); setTab("employee"); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">EC</span><div><strong>ECMS</strong><small>HR workspace</small></div></div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><span>⌂</span> Dashboard</button>
        <button className={tab === "letters" ? "active" : ""} onClick={() => setTab("letters")}><span>□</span> Generate Letter</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><span>⚙</span> Settings</button>
      </nav>
      <div className="sidebar-user"><span className="avatar">{session.user.email?.[0].toUpperCase()}</span><div><strong>HR Admin</strong><small>{session.user.email}</small></div><button title="Sign out" onClick={() => supabase.auth.signOut()}>↗</button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">EMPLOYEE COMPLAINT MANAGEMENT</span><h1>{{ dashboard: "Dashboard", employee: "Employee Details", letters: "Letter Generator", settings: "Settings" }[tab]}</h1></div><span className="secure-pill">● Secure session</span></header>
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
      {loading && <div className="loading-bar" />}
      {tab === "dashboard" && <Dashboard employees={filteredEmployees} allEmployees={employees} complaints={complaints} templates={templates} search={search} setSearch={setSearch} openEmployee={openEmployee} importExcel={importExcel} />}
      {tab === "employee" && <EmployeePanel employee={selectedEmployee} complaints={complaints.filter((c) => c.employee_id === selectedEmployeeId)} complaintTypes={complaintTypes} hrEmail={session.user.email || "HR"} onBack={() => setTab("dashboard")} onSaved={loadData} setNotice={setNotice} />}
      {tab === "letters" && <LetterGenerator employees={employees} complaints={complaints} templates={templates} settings={settings} initialEmployeeId={selectedEmployeeId} setNotice={setNotice} />}
      {tab === "settings" && <SettingsPanel settings={settings} complaintTypes={complaintTypes} templates={templates} onSaved={loadData} setNotice={setNotice} />}
    </main>
  </div>;
}

function Dashboard({ employees, allEmployees, complaints, templates, search, setSearch, openEmployee, importExcel }: {
  employees: Employee[]; allEmployees: Employee[]; complaints: Complaint[]; templates: LetterTemplate[]; search: string; setSearch: (v: string) => void; openEmployee: (id: string) => void; importExcel: (file?: File) => void;
}) {
  return <><section className="hero"><div><span className="eyebrow">HR OVERVIEW</span><h2>People, complaints and action—all in one place.</h2><p>Review employee records, document complaints and generate official letters.</p></div><label className="button primary file-button">Import Excel<input type="file" accept=".xlsx,.xls" onChange={(e) => importExcel(e.target.files?.[0])} /></label></section>
    <section className="stats-grid">
      <article className="stat-card blue"><span className="stat-icon">👥</span><div><small>Total employees</small><strong>{allEmployees.length}</strong><p>Employee records</p></div></article>
      <article className="stat-card amber"><span className="stat-icon">!</span><div><small>Total complaints</small><strong>{complaints.length}</strong><p>Recorded complaints</p></div></article>
      <article className="stat-card green"><span className="stat-icon">□</span><div><small>Letter templates</small><strong>{templates.length}</strong><p>Ready to generate</p></div></article>
    </section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">EMPLOYEE RECORDS</span><h2>Employee list</h2></div><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee ID or name" /></div>
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Grade</th><th>Status</th><th>Complaints</th><th>Action</th></tr></thead><tbody>
        {employees.map((e) => <tr key={e.id}><td><strong>{e.employee_id}</strong></td><td>{e.name}</td><td>{e.grade || "—"}</td><td><span className={`status ${e.status.toLowerCase()}`}>{e.status}</span></td><td>{complaints.filter((c) => c.employee_id === e.id).length}</td><td><button className="text-button" onClick={() => openEmployee(e.id)}>View details →</button></td></tr>)}
        {!employees.length && <tr><td colSpan={6}><div className="empty">No employee records found.</div></td></tr>}
      </tbody></table></div>
    </section></>;
}

function EmployeePanel({ employee, complaints, complaintTypes, hrEmail, onBack, onSaved, setNotice }: {
  employee?: Employee; complaints: Complaint[]; complaintTypes: ComplaintType[]; hrEmail: string; onBack: () => void; onSaved: () => Promise<void>; setNotice: (v: string) => void;
}) {
  const [type, setType] = useState(""); const [date, setDate] = useState(today()); const [status, setStatus] = useState("Active"); const [reference, setReference] = useState(""); const [note, setNote] = useState("");
  if (!employee) return <section className="panel empty"><h2>Select an employee from the dashboard.</h2><button className="button secondary" onClick={onBack}>Back to dashboard</button></section>;
  async function save(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("complaints").insert({ employee_id: employee!.id, complaint_type: type, complaint_date: date, added_by: hrEmail, status, reference, note });
    setNotice(error ? error.message : "Complaint saved.");
    if (!error) { setType(""); setReference(""); setNote(""); setStatus("Active"); await onSaved(); }
  }
  return <><section className="hero compact"><div><span className="eyebrow">EMPLOYEE PROFILE</span><h2>{employee.name}</h2><p>Employee ID {employee.employee_id}</p></div><button className="button secondary" onClick={onBack}>← Dashboard</button></section>
    <section className="detail-grid"><div><small>Employee ID</small><strong>{employee.employee_id}</strong></div><div><small>Name</small><strong>{employee.name}</strong></div><div><small>Grade</small><strong>{employee.grade || "—"}</strong></div><div><small>Status</small><strong>{employee.status}</strong></div></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">NEW COMPLAINT</span><h2>Add complaint</h2></div></div><form className="form-grid" onSubmit={save}>
      <label>Complaint type<select value={type} onChange={(e) => setType(e.target.value)} required><option value="">Select complaint</option>{complaintTypes.map((c) => <option key={c.id}>{c.name}</option>)}</select></label>
      <label>Complaint date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option>Active</option><option>Under Review</option><option>Resolved</option><option>Cancelled</option></select></label>
      <label>Reference<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" /></label>
      <label className="full">Remark<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Complaint details or additional note" /></label>
      <div className="full"><button className="button primary">Save complaint</button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>Complaint history</h2></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Complaint</th><th>Status</th><th>Reference</th><th>Remark</th></tr></thead><tbody>
      {complaints.map((c) => <tr key={c.id}><td>{formatDate(c.complaint_date)}</td><td>{c.complaint_type}</td><td><span className="status">{c.status}</span></td><td>{c.reference || "—"}</td><td>{c.note || "—"}</td></tr>)}
      {!complaints.length && <tr><td colSpan={5}><div className="empty">No complaints recorded.</div></td></tr>}
    </tbody></table></div></section></>;
}

function LetterGenerator({ employees, complaints, templates, settings, initialEmployeeId, setNotice }: {
  employees: Employee[]; complaints: Complaint[]; templates: LetterTemplate[]; settings: Settings; initialEmployeeId: string; setNotice: (v: string) => void;
}) {
  const [employeeId, setEmployeeId] = useState(initialEmployeeId); const [templateId, setTemplateId] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [preview, setPreview] = useState("");
  const employee = employees.find((e) => e.id === employeeId); const employeeComplaints = complaints.filter((c) => c.employee_id === employeeId); const template = templates.find((t) => t.id === templateId);
  useEffect(() => { if (!templateId && templates[0]) setTemplateId(templates[0].id); }, [templateId, templates]);
  function generate() {
    if (!employee || !template) return setNotice("Select an employee and a letter template.");
    const complaintText = employeeComplaints.filter((c) => selected.includes(c.id)).map((c, i) => `${i + 1}. ${c.complaint_type} (${formatDate(c.complaint_date)})`).join("\n") || "No complaint selected";
    const values: Record<string, string> = { employeeName: employee.name, employeeId: employee.employee_id, employeeGrade: employee.grade, complaints: complaintText, date: formatDate(today()), companyName: settings.company_name, companyAddress: settings.company_address, authorityName: settings.authority_name, authorityDesignation: settings.authority_designation };
    let text = `Subject: ${template.subject}\n\n${template.body}`;
    Object.entries(values).forEach(([key, value]) => { text = text.replaceAll(`{{${key}}}`, value || ""); });
    setPreview(text);
  }
  async function saveLetter() {
    if (!preview || !employee || !template) return;
    const { error } = await supabase.from("generated_letters").insert({ employee_id: employee.id, template_id: template.id, subject: template.subject, content: preview });
    setNotice(error ? error.message : "Letter saved to history.");
  }
  return <><section className="hero compact"><div><span className="eyebrow">LETTER GENERATOR</span><h2>Create an employee letter</h2><p>Select an employee, template and relevant complaints.</p></div></section>
    <section className="panel"><div className="form-grid">
      <label>Employee<select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setSelected([]); setPreview(""); }}><option value="">Select employee</option>{employees.map((e) => <option value={e.id} key={e.id}>{e.employee_id} — {e.name}</option>)}</select></label>
      <label>Letter template<select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(""); }}><option value="">Select template</option>{templates.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
    </div></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPLAINTS</span><h2>Select relevant complaints</h2></div></div><div className="checkbox-list">
      {employeeComplaints.map((c) => <label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((current) => current.includes(c.id) ? current.filter((id) => id !== c.id) : [...current, c.id])} /><span><strong>{c.complaint_type}</strong><small>{formatDate(c.complaint_date)} · {c.status}</small></span></label>)}
      {!employeeComplaints.length && <div className="empty">Select an employee with complaint records.</div>}
    </div><div className="button-row"><button className="button primary" onClick={generate}>Generate letter</button><button className="button secondary" onClick={saveLetter} disabled={!preview}>Save letter</button><button className="button secondary" onClick={() => window.print()} disabled={!preview}>Print</button></div></section>
    <section className="panel print-panel"><div className="panel-heading no-print"><div><span className="eyebrow">PREVIEW</span><h2>Letter preview</h2></div></div><div className="letter-preview">{preview || "Your generated letter will appear here."}</div></section>
  </>;
}

function SettingsPanel({ settings, complaintTypes, templates, onSaved, setNotice }: {
  settings: Settings; complaintTypes: ComplaintType[]; templates: LetterTemplate[]; onSaved: () => Promise<void>; setNotice: (v: string) => void;
}) {
  const [company, setCompany] = useState(settings); const [newType, setNewType] = useState(""); const [drafts, setDrafts] = useState<LetterTemplate[]>(templates);
  useEffect(() => setCompany(settings), [settings]); useEffect(() => setDrafts(templates), [templates]);
  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("company_settings").upsert({ ...company, id: company.id || "00000000-0000-0000-0000-000000000001" });
    setNotice(error ? error.message : "Company settings saved."); if (!error) await onSaved();
  }
  async function addType() {
    if (!newType.trim()) return;
    const { error } = await supabase.from("complaint_types").insert({ name: newType.trim() });
    setNotice(error ? error.message : "Complaint type added."); if (!error) { setNewType(""); await onSaved(); }
  }
  async function deleteType(id: string) { const { error } = await supabase.from("complaint_types").delete().eq("id", id); setNotice(error ? error.message : "Complaint type deleted."); if (!error) await onSaved(); }
  async function saveTemplate(t: LetterTemplate) {
    const payload = { ...(t.id.startsWith("new-") ? {} : { id: t.id }), name: t.name, subject: t.subject, body: t.body, sort_order: t.sort_order };
    const { error } = await supabase.from("letter_templates").upsert(payload); setNotice(error ? error.message : "Letter template saved."); if (!error) await onSaved();
  }
  async function deleteTemplate(id: string) {
    if (id.startsWith("new-")) return setDrafts((items) => items.filter((item) => item.id !== id));
    const { error } = await supabase.from("letter_templates").delete().eq("id", id); setNotice(error ? error.message : "Letter template deleted."); if (!error) await onSaved();
  }
  const update = (id: string, patch: Partial<LetterTemplate>) => setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  return <><section className="hero compact"><div><span className="eyebrow">SYSTEM SETTINGS</span><h2>Company and reusable content</h2><p>Manage complaint categories and letter templates used by HR.</p></div></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPANY</span><h2>Company details</h2></div></div><form className="form-grid" onSubmit={saveCompany}>
      <label>Company name<input value={company.company_name} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} /></label>
      <label>Company address<input value={company.company_address} onChange={(e) => setCompany({ ...company, company_address: e.target.value })} /></label>
      <label>HR authority<input value={company.authority_name} onChange={(e) => setCompany({ ...company, authority_name: e.target.value })} /></label>
      <label>Designation<input value={company.authority_designation} onChange={(e) => setCompany({ ...company, authority_designation: e.target.value })} /></label>
      <div className="full"><button className="button primary">Save company details</button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">COMPLAINT TYPES</span><h2>Fixed complaint list</h2></div></div><div className="inline-form"><input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New complaint type" /><button className="button primary" onClick={addType}>Add complaint</button></div><div className="chip-list">{complaintTypes.map((c) => <span key={c.id}>{c.name}<button onClick={() => deleteType(c.id)}>×</button></span>)}</div></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LETTER TEMPLATES</span><h2>Editable letter list</h2><p>Use placeholders such as {"{{employeeName}}"}, {"{{complaints}}"} and {"{{companyName}}"}.</p></div><button className="button primary" onClick={() => setDrafts([...drafts, { id: `new-${Date.now()}`, name: `Letter ${drafts.length + 1}`, subject: "", body: "", sort_order: drafts.length + 1 }])}>Add new letter</button></div>
      <div className="template-list">{drafts.map((t) => <article className="template-card" key={t.id}><div className="template-title"><input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} /><button onClick={() => deleteTemplate(t.id)}>Delete</button></div><label>Subject<input value={t.subject} onChange={(e) => update(t.id, { subject: e.target.value })} /></label><label>Letter body<textarea value={t.body} onChange={(e) => update(t.id, { body: e.target.value })} /></label><button className="button secondary" onClick={() => saveTemplate(t)}>Save template</button></article>)}</div>
    </section>
  </>;
}
