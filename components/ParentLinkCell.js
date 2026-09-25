"use client";
import { useEffect, useState } from "react";
import EditableCell from "./EditableCell";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { matchesSearch } from "../lib/arabic";

export default function ParentLinkCell({studentId, relation, parent, onChanged, onEditingChange}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState("new");
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({firstName:"",lastName:"",phone:""});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || mode !== "existing") return;
    let active = true;
    fetch("/api/parents", {cache:"no-store"}).then(async r => {
      if (redirectIfSignedOut(r)) throw new Error(SESSION_EXPIRED);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "تعذر تحميل أولياء الأمور");
      if (active) setList(data.parents);
    }).catch(e => {if(active) setError(e.message)});
    return () => {active=false};
  }, [open,mode]);
  function close() {setOpen(false);setError("");setFilter("");onEditingChange?.(false)}
  async function submit(event) {
    event.preventDefault(); if(busy) return;
    setBusy(true);setError("");
    try {
      const payload = mode === "existing" ? {relation,parentId:Number(selected)} : {relation,...form};
      const r = await fetch(`/api/students/${studentId}/parents`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if (redirectIfSignedOut(r)) throw new Error(SESSION_EXPIRED);
      const data = await r.json();
      if(!r.ok) throw new Error(data.error || "تعذر حفظ ولي الأمر");
      close(); await onChanged();
    } catch(e) {setError(e.message)} finally {setBusy(false)}
  }
  // Removes only the link; the parent record stays for any siblings.
  async function unlink() {
    const label = relation === "FATHER" ? "الأب" : "الأم";
    if (!window.confirm(`هل تريد إلغاء ربط ${label} بهذا الطفل؟ لن يتم حذف بيانات ولي الأمر.`)) return;
    setBusy(true);setError("");
    try {
      const r = await fetch(`/api/students/${studentId}/parents?relation=${relation}`, {method:"DELETE"});
      if (redirectIfSignedOut(r)) throw new Error(SESSION_EXPIRED);
      const data = await r.json();
      if(!r.ok) throw new Error(data.error || "تعذر إلغاء الربط");
      setExpanded(false); await onChanged();
    } catch(e) {setError(e.message)} finally {setBusy(false)}
  }
  if (parent) {
    const fullName = [parent.firstName, parent.lastName].filter(Boolean).join(" ");
    return (
      <div style={{minWidth:170}}>
        <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
          style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:0,background:"none",border:"none",font:"inherit",color:"inherit",textAlign:"right",cursor:"pointer"}}>
          <span style={{fontWeight:600}}>{fullName || "—"}</span>
          {!expanded && parent.phone && <small dir="ltr" style={{color:"#64748b"}}>{parent.phone}</small>}
          <span style={{marginInlineStart:"auto",color:"#2563eb",fontSize:11}}>{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && (
          <div style={{marginTop:6}}>
            {[["firstName","الاسم"],["lastName","اللقب"],["phone","الهاتف"],["phone2","هاتف بديل"]].map(([field,label]) => (
              <div key={field} style={{display:"flex",alignItems:"center",gap:5}}>
                <small style={{minWidth:65}}>{label}:</small>
                <EditableCell parentId={parent.id} field={field} value={parent[field] || ""} updatedAt={parent.updatedAt} onSaved={onChanged} onEditingChange={onEditingChange}/>
              </div>
            ))}
            <button type="button" disabled={busy} onClick={unlink} style={{marginTop:6,color:"#b91c1c"}}>{busy ? "جارٍ الإلغاء..." : "إلغاء الربط"}</button>
            {error && <small role="alert" style={{display:"block",color:"#b91c1c"}}>{error}</small>}
          </div>
        )}
      </div>
    );
  }
  if (!open) return <button type="button" onClick={()=>{setOpen(true);onEditingChange?.(true)}}>+ {relation === "FATHER" ? "إضافة الأب" : "إضافة الأم"}</button>;
  const shown = list.filter(p => matchesSearch(`${p.firstName} ${p.lastName} ${p.phone || ""}`, filter));
  return <form onSubmit={submit} onKeyDown={e=>{if(e.key==="Escape"&&!busy){e.preventDefault();e.stopPropagation();close()}}} style={{minWidth:230,display:"grid",gap:6}}>
    <select aria-label="طريقة الربط" value={mode} onChange={e=>{setMode(e.target.value);setError("")}}>
      <option value="new">إنشاء ولي أمر جديد</option><option value="existing">ربط ولي أمر مسجل</option>
    </select>
    {mode === "existing" ? <>
      <input aria-label="البحث عن ولي أمر" placeholder="ابحث بالاسم أو الهاتف..." value={filter} autoFocus onChange={e=>{setFilter(e.target.value);setSelected("")}}/>
      <select aria-label="ولي الأمر" required size={Math.min(6, Math.max(2, shown.length))} value={selected} onChange={e=>setSelected(e.target.value)}>
        {shown.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName} — {p.phone || "بدون هاتف"} (#{p.id})</option>)}
      </select>
      <small style={{color:"#64748b"}}>{shown.length ? `${shown.length} نتيجة` : "لا توجد نتائج"}</small>
    </> : [ ["firstName","الاسم"],["lastName","اللقب"],["phone","الهاتف"] ].map(([field,label],i)=><input key={field} aria-label={label} placeholder={label} autoFocus={i===0} dir={field==="phone"?"ltr":undefined} required={field!=="phone"} maxLength={field==="phone"?30:100} value={form[field]} onChange={e=>setForm(prev=>({...prev,[field]:e.target.value}))}/>)}
    {error && <small role="alert" style={{color:"#b91c1c"}}>{error}</small>}
    <div><button disabled={busy || (mode==="existing" && !selected)} type="submit">{busy?"جارٍ الحفظ...":"حفظ"}</button> <button type="button" disabled={busy} onClick={close}>إلغاء</button></div>
  </form>;
}
