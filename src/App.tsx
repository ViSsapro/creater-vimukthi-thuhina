import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateAuthProfile,
  type User,
} from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where
} from "firebase/firestore";
import {
  deleteObject, getDownloadURL, ref, uploadBytesResumable
} from "firebase/storage";
import { auth, db, googleProvider, storage, TEACHER_EMAIL } from "./firebase";
import { FaArrowRight, FaAward, FaBell, FaBookOpen, FaChartLine, FaCheck, FaChevronRight, FaClock, FaCloudUploadAlt, FaFileAlt, FaFilePdf, FaGraduationCap, FaHome, FaMedal, FaPen, FaPlus, FaSearch, FaSignOutAlt, FaTrophy, FaUser, FaUsers, FaTimes, FaBars, FaLock, FaMapMarkerAlt } from "react-icons/fa";

type Role = "student" | "teacher";
type Status = "active" | "pending" | "disabled";
type PaperStatus = "pending" | "marked";

type Profile = {
  id: string; uid: string; studentId: string; email: string; fullName: string;
  phone?: string | null; school?: string | null; grade?: string | null;
  avatarPath?: string | null; role: Role; status: Status;
  createdAt?: unknown;
};

type Paper = {
  id: string; uid: string; studentId: string; studentName?: string;
  paperName: string; paperNumber: string; submittedDate: string;
  description: string; storagePath: string; fileName: string; contentType: string;
  fileSizeBytes: number; status: PaperStatus; marks?: number | null;
  maximumMarks?: number | null; grade?: string | null; feedback?: string | null;
  markedAt?: unknown;
};

type Announcement = { id: string; title: string; message: string; published: boolean; createdAt?: unknown };
type RankingEntry = { rank: number; studentName: string; studentId: string; latestMarks: number | null; averageMarks: number; totalPapers: number; isCurrentStudent?: boolean };

const navItems = [
  { id: "home", label: "Home", si: "මුල් පිටුව", icon: FaHome },
  { id: "papers", label: "My papers", si: "ප්‍රශ්න පත්‍ර", icon: FaFileAlt },
  { id: "marks", label: "Marks", si: "ලකුණු", icon: FaChartLine },
  { id: "rankings", label: "Class rank", si: "පන්තියේ ස්ථානය", icon: FaTrophy },
  { id: "profile", label: "My profile", si: "මගේ තොරතුරු", icon: FaUser },
];

function errText(e: unknown) {
  const code = e && typeof e === "object" && "code" in e ? String((e as {code:string}).code) : "";
  const map: Record<string,string> = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/email-already-in-use": "This email already has an account.",
    "auth/weak-password": "Use a stronger password.",
    "auth/operation-not-allowed": "Enable this sign-in method in Firebase Authentication.",
    "auth/popup-blocked": "Allow popups for this site and try Google sign-in again.",
    "permission-denied": "Firebase denied this action. Check Firestore/Storage rules.",
  };
  return map[code] || (e instanceof Error ? e.message : "Something went wrong.");
}

function BrandMark({compact=false}:{compact?:boolean}) {
  return <div className="brand-mark" aria-label="Wins Commerce">
    <span className="brand-seal"><svg viewBox="0 0 40 40" role="img"><circle cx="20" cy="20" r="17.5" fill="none" stroke="currentColor"/><path d="M9.7 14.1h3.1l2.1 9.6 2.4-9.6h2.5l2.4 9.6 2.1-9.6h3.1l-3.7 13.5h-2.7l-2.5-9.2-2.5 9.2h-2.7z" fill="currentColor"/></svg></span>
    {!compact && <span><b>WINS</b><small>COMMERCE CLASS</small></span>}
  </div>;
}

function Initials({name}:{name?:string|null}) {
  return <span className="initials">{(name||"Student").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</span>;
}
function Loading({label="Loading your class space"}:{label?:string}) {
  return <div className="loading-view"><div className="skeleton h-7 w-44"/><div className="skeleton h-4 w-64"/><div className="loading-cards"><div className="skeleton h-32"/><div className="skeleton h-32"/><div className="skeleton h-32"/></div><p>{label}</p></div>;
}
function PageHeading({eyebrow,title,detail}:{eyebrow:string;title:string;detail:string}) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div></div>;
}
function Field({label,value,onChange,type="text",required=false,placeholder=""}:{label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean;placeholder?:string}) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} required={required} placeholder={placeholder}/></label>;
}
function StatusPill({status}:{status:string}) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}
function formatDate(v: unknown) {
  if (!v) return "";
  if (v instanceof Timestamp) return v.toDate().toLocaleDateString();
  if (typeof v === "string") return new Date(v).toLocaleDateString();
  if (typeof v === "object" && v && "seconds" in v) return new Date(Number((v as any).seconds)*1000).toLocaleDateString();
  return "";
}
function pct(p: Paper) { return p.maximumMarks ? Math.round((Number(p.marks||0)/Number(p.maximumMarks))*10000)/100 : 0; }

function AuthPage({mode,onDone}:{mode:"signin"|"signup";onDone:()=>void}) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [name,setName]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setBusy(true); setError("");
    try {
      let cred: any;
      if(mode==="signup"){
        cred=await createUserWithEmailAndPassword(auth,email.trim(),password);
        if(name.trim()) await updateAuthProfile(cred.user,{displayName:name.trim()});
      } else cred=await signInWithEmailAndPassword(auth,email.trim(),password);
      onDone();
    } catch(e){setError(errText(e));} finally{setBusy(false);}
  };
  const google=async()=>{setBusy(true);setError("");try{await signInWithPopup(auth,googleProvider);onDone();}catch(e){setError(errText(e));}finally{setBusy(false);}};
  return <main className="auth-page app-grain"><div className="auth-card">
    <div className="auth-brand"><BrandMark/><span>WINS INSTITUTE · VEYANGODA</span></div>
    <span className="eyebrow">{mode==="signin"?"STUDENT PORTAL":"JOIN THE CLASS"}</span>
    <h1>{mode==="signin"?"Welcome back":"Create your student account"}</h1>
    <p>{mode==="signin"?"Continue learning with your O/L Commerce class.":"Create your account, then complete your class profile."}</p>
    {error && <div className="alert-error">{error}</div>}
    <form onSubmit={submit} className="auth-form">
      {mode==="signup" && <Field label="Full name" value={name} onChange={setName} required/>}
      <Field label="Email" value={email} onChange={setEmail} type="email" required/>
      <Field label="Password" value={password} onChange={setPassword} type="password" required placeholder="At least 6 characters"/>
      <button className="button button-dark button-wide" disabled={busy}>{busy?"Please wait…":mode==="signin"?"Sign in":"Create account"} <FaArrowRight/></button>
    </form>
    <div className="auth-divider"><span>or</span></div>
    <button className="button button-outline button-wide" onClick={google} disabled={busy}>Continue with Google</button>
    <div className="auth-switch">{mode==="signin"?"New to the class?":"Already have an account?"} <button onClick={()=>location.hash=mode==="signin"?"#signup":"#signin"}>{mode==="signin"?"Create account":"Sign in"}</button></div>
    <small className="privacy-note"><FaLock/> Private student access · Firebase Authentication</small>
  </div></main>;
}

function ProfileSetup({user,onComplete}:{user:User;onComplete:()=>void}) {
  const [studentId,setStudentId]=useState(""); const [name,setName]=useState(user.displayName||"");
  const [phone,setPhone]=useState(""); const [school,setSchool]=useState(""); const [grade,setGrade]=useState("");
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setBusy(true);setError("");
    try{
      const q=query(collection(db,"users"),where("studentId","==",studentId.trim()),limit(1));
      const existing=await getDocs(q);
      if(!existing.empty && existing.docs[0].id!==user.uid) throw new Error("That student ID is already in use.");
      const isTeacher = (user.email || "").trim().toLowerCase() === TEACHER_EMAIL.trim().toLowerCase();
      await setDoc(doc(db,"users",user.uid),{
        uid:user.uid,
        studentId:isTeacher ? "DAMITH" : studentId.trim(),
        email:user.email||"",
        fullName:isTeacher ? (name.trim() || "Damith") : name.trim(),
        phone:phone.trim()||null,
        school:school.trim()||null,
        grade:grade.trim()||null,
        role:isTeacher ? "teacher" : "student",
        status:"active",
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      },{merge:true});
      onComplete();
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  };
  return <main className="auth-page app-grain"><div className="auth-card setup-card"><div className="auth-brand"><BrandMark/><span>STUDENT REGISTRATION</span></div><span className="eyebrow">ONE LAST STEP</span><h1>Complete your class profile</h1><p>Your account is ready. Add your class details so the teacher can identify your work.</p>{error&&<div className="alert-error">{error}</div>}
    <form onSubmit={submit} className="auth-form"><Field label="Student ID" value={studentId} onChange={setStudentId} required placeholder="e.g. WC001"/><Field label="Full name" value={name} onChange={setName} required/><Field label="Phone number" value={phone} onChange={setPhone}/><Field label="School" value={school} onChange={setSchool}/><Field label="Grade" value={grade} onChange={setGrade}/><button className="button button-dark button-wide" disabled={busy}>{busy?"Saving…":"Enter class"} <FaArrowRight/></button></form>
  </div></main>;
}

function Landing({go}:{go:(p:string)=>void}) {
  return <main className="landing app-grain"><div className="landing-nav"><BrandMark/><span className="landing-place"><FaMapMarkerAlt/> WINS INSTITUTE · VEYANGODA</span></div>
    <section className="landing-hero"><div className="landing-copy animate-rise"><div className="eyebrow landing-eyebrow"><span/> THE COMMERCE CLASSROOM, ONLINE</div><h1>Small steps.<br/><em>Strong futures.</em></h1><p className="landing-intro">Your O/L Commerce class, organised in one calm place. Submit papers, see your progress, and keep moving forward.</p><p className="landing-sinhala">ඔබේ උත්සාහය — ඔබේ අනාගතය.</p><div className="landing-actions"><button className="button button-gold" onClick={()=>go("#signin")}>Sign in <FaArrowRight/></button><button className="button button-outline" onClick={()=>go("#signup")}>Create account</button></div><div className="landing-trust"><span><FaLock/> Private student access</span><i/> <span>Built for our class</span></div></div>
    <div className="teacher-portrait-wrap animate-float"><div className="portrait-halo"/><div className="portrait-frame"><img src="/damith-profile.png" alt="Damith, O/L Commerce teacher"/></div><div className="portrait-caption"><span className="portrait-label">YOUR COMMERCE TEACHER</span><strong>Damith</strong><span>Learn with clarity. Grow with confidence.</span></div><div className="portrait-stamp"><FaAward/><span>WINS<br/>INSTITUTE</span></div></div></section></main>;
}

function useProfile(user:User|null) {
  const [profile,setProfile]=useState<Profile|null>(null); const [loading,setLoading]=useState(!!user);
  useEffect(()=>{ if(!user){setProfile(null);setLoading(false);return;} setLoading(true);
    return onSnapshot(doc(db,"users",user.uid),s=>{setProfile(s.exists()?({id:s.id,...s.data()} as Profile):null);setLoading(false);},()=>setLoading(false));
  },[user?.uid]);
  return {profile,loading};
}

function usePapers(user:User|null) {
  const [data,setData]=useState<Paper[]>([]); const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!user){setData([]);return;}setLoading(true);
    const q=query(collection(db,"papers"),where("uid","==",user.uid));
    return onSnapshot(q,s=>{setData(s.docs.map(d=>({id:d.id,...d.data()} as Paper)).sort((a,b)=>String(b.submittedDate).localeCompare(String(a.submittedDate))));setLoading(false);},()=>setLoading(false));
  },[user?.uid]); return {data,loading};
}

function useAnnouncements() {
  const [data,setData]=useState<Announcement[]>([]);
  useEffect(()=>onSnapshot(query(collection(db,"announcements"),where("published","==",true),limit(20)),s=>setData(s.docs.map(d=>({id:d.id,...d.data()} as Announcement)).sort((a,b)=>String((b.createdAt as any)?.seconds||"").localeCompare(String((a.createdAt as any)?.seconds||"")))),()=>{}),[]);
  return data;
}

function AppShell({user,profile,children,onNavigate}:{user:User;profile:Profile;children:ReactNode;onNavigate:(p:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(location.hash.replace("#","")||"home");
  useEffect(()=>{const f=()=>setActive(location.hash.replace("#","")||"home");addEventListener("hashchange",f);return()=>removeEventListener("hashchange",f)},[]);
  const nav=(p:string)=>{location.hash=p;onNavigate(p);setOpen(false)};
  const avatar=profile.avatarPath||user.photoURL;
  return <div className="app-frame app-grain"><aside className={`sidebar ${open?"sidebar-open":""}`}><div className="sidebar-brand"><BrandMark/></div><div className="sidebar-class"><span className="class-label">YOUR LEARNING SPACE</span><strong>O/L Commerce</strong><small>Damith’s class · Veyangoda</small></div><nav className="side-nav"><span className="nav-section">STUDENT DESK</span>{navItems.map(n=><button key={n.id} className={`nav-link ${active===n.id?"nav-active":""}`} onClick={()=>nav(n.id)}><n.icon/><span>{n.label}<small>{n.si}</small></span>{active===n.id&&<i/>}</button>)}{profile.role==="teacher"&&<><span className="nav-section teacher-nav-section">TEACHER DESK</span><button className={`nav-link ${active==="teacher"?"nav-active":""}`} onClick={()=>nav("teacher")}><FaUsers/><span>Teacher dashboard<small>Class management</small></span>{active==="teacher"&&<i/>}</button></>}</nav><div className="sidebar-note"><span><FaGraduationCap/></span><p>One paper at a time.<br/><b>You’re getting closer.</b></p></div><div className="sidebar-footer"><span className="status-dot"/> Wins Institute, Veyangoda</div></aside>{open&&<button className="mobile-scrim" onClick={()=>setOpen(false)}/>}<div className="main-column"><header className="topbar"><button className="mobile-menu" onClick={()=>setOpen(!open)}><FaBars/></button><div className="crumb"><BrandMark compact/><span className="crumb-sep">/</span><span>{active==="teacher"?"Teacher desk":navItems.find(n=>n.id===active)?.label||"Student desk"}</span></div><div className="topbar-user"><span className="connectivity"><i/>Connected</span><div className="topbar-welcome"><span>{profile.role==="teacher"?"TEACHER DESK":"STUDENT PORTAL"}</span><b>{profile.fullName||user.displayName||"Welcome"}</b></div><div className="topbar-account">{avatar?<img className="user-avatar-img" src={avatar.startsWith("http")?avatar:""} alt=""/>:<Initials name={profile.fullName}/>}<button className="logout-button" onClick={()=>signOut(auth)} title="Sign out"><FaSignOutAlt/></button></div></div></header><main className="page-content">{children}</main><footer className="app-footer"><span>WINS INSTITUTE · VEYANGODA</span><span>Keep showing up. It adds up.</span><span>Created by Vimukthi Thuhina</span>span></footer></div></div>;
}

function HomePage({user,profile,papers}:{user:User;profile:Profile;papers:Paper[]}) {
  const announcements=useAnnouncements();
  const marked=papers.filter(p=>p.status==="marked"); const av=marked.length?marked.reduce((a,p)=>a+pct(p),0)/marked.length:0;
  const recent=papers.slice(0,4);
  return <div className="animate-rise"><PageHeading eyebrow="YOUR CLASSROOM" title={`Good to see you, ${profile.fullName.split(" ")[0]}.`} detail="Your class progress, recent papers and announcements in one place."/>
    <div className="stats-grid"><div className="stat-card"><FaFileAlt/><span>PAPERS SUBMITTED</span><b>{papers.length}</b></div><div className="stat-card"><FaCheck/><span>PAPERS MARKED</span><b>{marked.length}</b></div><div className="stat-card"><FaChartLine/><span>AVERAGE MARK</span><b>{av.toFixed(1)}%</b></div><div className="stat-card"><FaTrophy/><span>CLASS RANK</span><b>{papers.length? "See rank":"—"}</b></div></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">LATEST</span><h2>Recent papers</h2></div><button className="text-link" onClick={()=>location.hash="papers"}>View all <FaChevronRight/></button></div>{recent.length?recent.map(p=><PaperRow key={p.id} paper={p}/>):<Empty icon={FaFilePdf} title="No papers yet" detail="Submit your first completed paper from My papers."/>}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">CLASSROOM</span><h2>Announcements</h2></div><FaBell/></div>{announcements.length?announcements.slice(0,4).map(a=><div className="announcement" key={a.id}><span><FaBell/></span><div><b>{a.title}</b><p>{a.message}</p><small>{formatDate(a.createdAt)}</small></div></div>):<Empty icon={FaBell} title="No announcements" detail="Your teacher's latest notices will appear here."/>}</section></div>
  </div>;
}
function Empty({icon:Icon,title,detail}:{icon:any;title:string;detail:string}) {return <div className="empty-state"><span className="empty-icon"><Icon/></span><h3>{title}</h3><p>{detail}</p></div>}
function PaperRow({paper}:{paper:Paper}) {return <div className="paper-row"><span className="paper-icon">{paper.contentType==="application/pdf"?<FaFilePdf/>:<FaFileAlt/>}</span><div><b>{paper.paperName}</b><small>{paper.paperNumber} · {paper.submittedDate} · {paper.fileName}</small></div><StatusPill status={paper.status}/>{paper.status==="marked"&&<strong className="paper-score">{pct(paper)}%</strong>}</div>}

function PapersPage({user,profile}:{user:User;profile:Profile}) {
  const {data:papers,loading}=usePapers(user); const [name,setName]=useState("");const [number,setNumber]=useState("");const [description,setDescription]=useState("");const [file,setFile]=useState<File|null>(null);const [progress,setProgress]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const input=useRef<HTMLInputElement>(null);
  const submit=async(e:FormEvent)=>{e.preventDefault();if(!file){setError("Please attach your completed paper first.");return;}if(!name.trim()||!number.trim()){setError("Paper name and paper number are required.");return;}setBusy(true);setError("");setProgress(0);
    try{
      if(!["application/pdf","image/jpeg","image/png"].includes(file.type)||file.size>15*1024*1024) throw new Error("Choose a PDF, JPG or PNG up to 15 MB.");
      const path=`papers/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const storageRef=ref(storage,path);
      const task=uploadBytesResumable(storageRef,file,{contentType:file.type});await new Promise<void>((resolve,reject)=>{task.on("state_changed",s=>setProgress(Math.round(s.bytesTransferred/s.totalBytes*100)),()=>reject(new Error("Upload failed.")),()=>resolve())});
      await addDoc(collection(db,"papers"),{uid:user.uid,studentId:profile.studentId,studentName:profile.fullName,paperName:name.trim(),paperNumber:number.trim(),submittedDate:new Date().toISOString().slice(0,10),description:description.trim(),storagePath:path,fileName:file.name,contentType:file.type,fileSizeBytes:file.size,status:"pending",createdAt:serverTimestamp()});
      setName("");setNumber("");setDescription("");setFile(null);setProgress(100);if(input.current)input.current.value="";
    }catch(e){setError(errText(e));}finally{setBusy(false);}
  };
  return <div className="animate-rise"><PageHeading eyebrow="YOUR SUBMISSIONS" title="My papers" detail="Upload completed Commerce papers for Damith to review and mark."/>
    <section className="panel upload-panel"><div className="panel-head"><div><span className="eyebrow">NEW SUBMISSION</span><h2>Submit a paper</h2></div><FaCloudUploadAlt/></div>{error&&<div className="alert-error">{error}</div>}<form className="upload-form" onSubmit={submit}><div className="form-grid"><Field label="Paper name" value={name} onChange={setName} required placeholder="e.g. Term Test 01"/><Field label="Paper number" value={number} onChange={setNumber} required placeholder="e.g. 2026-01"/></div><label className="field"><span>Description</span><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional note for your teacher"/></label><label className="file-drop"><input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files?.[0]||null)}/><FaCloudUploadAlt/><b>{file?file.name:"Choose your paper"}</b><small>PDF, JPG or PNG · max 15 MB</small></label>{busy&&<div className="progress"><span style={{width:`${progress}%`}}/></div>}<button className="button button-dark" disabled={busy}>{busy?`Uploading ${progress}%`:"Submit paper"} <FaArrowRight/></button></form></section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">HISTORY</span><h2>Submitted papers</h2></div></div>{loading?<Loading label="Loading papers"/>:papers.length?papers.map(p=><PaperRow key={p.id} paper={p}/>):<Empty icon={FaFileAlt} title="Nothing submitted yet" detail="Your submitted papers will appear here."/ >}</section>
  </div>;
}

function MarksPage({user}:{user:User}) {
  const {data:papers,loading}=usePapers(user);const marked=papers.filter(p=>p.status==="marked");const values=marked.map(p=>pct(p));const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;const high=values.length?Math.max(...values):0;
  return <div className="animate-rise"><PageHeading eyebrow="YOUR RESULTS" title="Marks" detail="Track the results and feedback returned by your teacher."/><div className="stats-grid"><div className="stat-card"><FaChartLine/><span>AVERAGE</span><b>{avg.toFixed(1)}%</b></div><div className="stat-card"><FaMedal/><span>HIGHEST</span><b>{high.toFixed(1)}%</b></div><div className="stat-card"><FaFileAlt/><span>PAPERS MARKED</span><b>{marked.length}</b></div><div className="stat-card"><FaClock/><span>LATEST</span><b>{marked[0]?`${pct(marked[0]).toFixed(1)}%`:"—"}</b></div></div>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">RESULT HISTORY</span><h2>Marked papers</h2></div></div>{marked.length?marked.map(p=><div className="mark-row" key={p.id}><div><b>{p.paperName}</b><small>{p.paperNumber} · {formatDate(p.markedAt)}</small></div><div className="mark-score">{pct(p).toFixed(1)}%</div><div><StatusPill status={p.grade||"marked"}/>{p.feedback&&<small className="feedback">{p.feedback}</small>}</div></div>):<Empty icon={FaChartLine} title="No marks yet" detail="Once Damith marks a submitted paper, your result will appear here."/>}</section>
  </div>;
}

async function calculateRankings(currentUid:string):Promise<{currentRank:number|null;totalStudents:number;leaderboard:RankingEntry[]}> {
  const [usersSnap,papersSnap]=await Promise.all([getDocs(query(collection(db,"users"),where("role","==","student"),where("status","==","active"))),getDocs(query(collection(db,"papers"),where("status","==","marked")))]);
  const map=new Map<string,Paper[]>();papersSnap.docs.forEach(d=>{const p={id:d.id,...d.data()} as Paper;const arr=map.get(p.uid)||[];arr.push(p);map.set(p.uid,arr)});
  const entries:RankingEntry[]=[];usersSnap.docs.forEach(d=>{const u=d.data() as Profile;const ps=map.get(d.id)||[];if(!ps.length)return;const scores=ps.map(p=>pct(p));const average=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100;const latest=[...ps].sort((a,b)=>String((b.markedAt as any)?.seconds||"").localeCompare(String((a.markedAt as any)?.seconds||"")))[0];entries.push({rank:0,studentName:u.fullName,studentId:u.studentId,latestMarks:pct(latest),averageMarks:average,totalPapers:ps.length,isCurrentStudent:d.id===currentUid});});
  entries.sort((a,b)=>b.averageMarks-a.averageMarks||a.studentName.localeCompare(b.studentName));let prev=-1,rank=0;entries.forEach((e,i)=>{if(e.averageMarks!==prev){rank=i+1;prev=e.averageMarks}e.rank=rank});
  return {currentRank:entries.find(e=>e.isCurrentStudent)?.rank||null,totalStudents:usersSnap.size,leaderboard:entries};
}
function RankingsPage({user}:{user:User}) {
  const [result,setResult]=useState<{currentRank:number|null;totalStudents:number;leaderboard:RankingEntry[]}|null>(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{calculateRankings(user.uid).then(setResult).catch(()=>setResult({currentRank:null,totalStudents:0,leaderboard:[]})).finally(()=>setLoading(false))},[user.uid]);
  return <div className="animate-rise"><PageHeading eyebrow="CLASS PROGRESS" title="Class rank" detail="Your ranking is calculated from the average percentage of your marked papers."/><div className="rank-hero"><div><span>YOUR CURRENT RANK</span><strong>{result?.currentRank?`#${result.currentRank}`:"—"}</strong><small>among {result?.totalStudents||0} active students</small></div><FaTrophy/></div><section className="panel"><div className="panel-head"><div><span className="eyebrow">LEADERBOARD</span><h2>Class ranking</h2></div></div>{loading?<Loading label="Calculating class rank"/>:result?.leaderboard.length?result.leaderboard.map(e=><div className={`rank-row ${e.isCurrentStudent?"rank-current":""}`} key={e.studentId}><strong>#{e.rank}</strong><div><b>{e.studentName}{e.isCurrentStudent?" (You)":""}</b><small>{e.studentId} · {e.totalPapers} marked papers</small></div><span>{e.averageMarks.toFixed(1)}%</span></div>):<Empty icon={FaTrophy} title="Rankings are not ready" detail="Rankings appear after students have marked papers."/ >}</section></div>;
}

function ProfilePage({user,profile,onRefresh}:{user:User;profile:Profile;onRefresh:()=>void}) {
  const [name,setName]=useState(profile.fullName);const[phone,setPhone]=useState(profile.phone||"");const[school,setSchool]=useState(profile.school||"");const[grade,setGrade]=useState(profile.grade||"");const[file,setFile]=useState<File|null>(null);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  useEffect(()=>{setName(profile.fullName);setPhone(profile.phone||"");setSchool(profile.school||"");setGrade(profile.grade||"")},[profile.id,profile.updatedAt]);
  const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await updateDoc(doc(db,"users",user.uid),{fullName:name.trim(),phone:phone.trim()||null,school:school.trim()||null,grade:grade.trim()||null,updatedAt:serverTimestamp()});if(name.trim()&&name!==user.displayName)await updateAuthProfile(user,{displayName:name.trim()});onRefresh()}catch(e){setError(errText(e))}finally{setBusy(false)}};
  const photo=async()=>{if(!file)return;if(!["image/jpeg","image/png"].includes(file.type)||file.size>5*1024*1024){setError("Choose a JPG or PNG under 5 MB.");return;}setBusy(true);setError("");try{const path=`avatars/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const task=uploadBytesResumable(ref(storage,path),file,{contentType:file.type});await new Promise<void>((res,rej)=>task.on("state_changed",()=>{},rej,()=>res()));await updateDoc(doc(db,"users",user.uid),{avatarPath:await getDownloadURL(ref(storage,path)),updatedAt:serverTimestamp()});onRefresh();}catch(e){setError(errText(e))}finally{setBusy(false)}};
  return <div className="animate-rise"><PageHeading eyebrow="YOUR CLASS RECORD" title="My profile" detail="Keep your contact details up to date for class communication."/><section className="panel profile-panel"><div className="profile-identity">{profile.avatarPath?<img src={profile.avatarPath} className="profile-photo"/>:<Initials name={profile.fullName}/>}<div><b>{profile.fullName}</b><span>{profile.studentId} · {profile.email}</span><StatusPill status={profile.status}/></div></div>{error&&<div className="alert-error">{error}</div>}<form className="form-grid" onSubmit={save}><Field label="Full name" value={name} onChange={setName} required/><Field label="Email" value={profile.email} onChange={()=>{}}/><Field label="Phone number" value={phone} onChange={setPhone}/><Field label="School" value={school} onChange={setSchool}/><Field label="Grade" value={grade} onChange={setGrade}/><div className="field"><span>Profile photo</span><input type="file" accept=".jpg,.jpeg,.png" onChange={e=>setFile(e.target.files?.[0]||null)}/><button type="button" className="button button-outline button-small" onClick={photo} disabled={!file||busy}>Upload photo</button></div><button className="button button-dark" disabled={busy}>{busy?"Saving…":"Save profile"} <FaCheck/></button></form></section></div>;
}

function TeacherPage({user}:{user:User}) {
  const [students,setStudents]=useState<Profile[]>([]);const[papers,setPapers]=useState<Paper[]>([]);const[loading,setLoading]=useState(true);const[search,setSearch]=useState("");const[notice,setNotice]=useState({title:"",message:""});const[showNotice,setShowNotice]=useState(false);const[marking,setMarking]=useState<string|null>(null);const[marks,setMarks]=useState(""),[max,setMax]=useState("100"),[grade,setGrade]=useState(""),[feedback,setFeedback]=useState("");const[error,setError]=useState("");
  const load=async()=>{setLoading(true);try{const[us,ps]=await Promise.all([getDocs(query(collection(db,"users"),where("role","==","student"))),getDocs(query(collection(db,"papers"),where("status","==","pending")))]);setStudents(us.docs.map(d=>({id:d.id,...d.data()} as Profile)).sort((a,b)=>a.fullName.localeCompare(b.fullName)));setPapers(ps.docs.map(d=>({id:d.id,...d.data()} as Paper)).sort((a,b)=>String((b.createdAt as any)?.seconds||"").localeCompare(String((a.createdAt as any)?.seconds||""))));}catch(e){setError(errText(e))}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const addNotice=async(e:FormEvent)=>{e.preventDefault();try{await addDoc(collection(db,"announcements"),{title:notice.title.trim(),message:notice.message.trim(),published:true,createdAt:serverTimestamp(),createdBy:user.uid});setNotice({title:"",message:""});setShowNotice(false);await load();}catch(e){setError(errText(e))}};
  const mark=async(e:FormEvent,p:Paper)=>{e.preventDefault();const n=Number(marks),m=Number(max);if(n<0||m<=0||n>m){setError("Marks must be between zero and the maximum.");return;}try{await updateDoc(doc(db,"papers",p.id),{marks:n,maximumMarks:m,grade:grade.trim(),feedback:feedback.trim(),status:"marked",markedBy:user.uid,markedAt:serverTimestamp()});setMarking(null);setMarks("");setGrade("");setFeedback("");await load();}catch(e){setError(errText(e))}};
  const updateStudent=async(s:Profile, status?:Status)=>{try{await updateDoc(doc(db,"users",s.uid),{status:status||s.status,updatedAt:serverTimestamp()});await load()}catch(e){setError(errText(e))}};
  const filtered=students.filter(s=>`${s.fullName} ${s.studentId} ${s.email}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="animate-rise"><PageHeading eyebrow="DAMITH’S CLASSROOM" title="Teacher desk" detail="Manage students, review submissions, publish notices and return marks."/>
    {error&&<div className="alert-error">{error}</div>}<div className="stats-grid"><div className="stat-card"><FaUsers/><span>ACTIVE STUDENTS</span><b>{students.filter(s=>s.status==="active").length}</b></div><div className="stat-card"><FaFileAlt/><span>PENDING PAPERS</span><b>{papers.length}</b></div><div className="stat-card"><FaBell/><span>ANNOUNCEMENTS</span><b>Manage</b></div></div>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">CLASS NOTICE</span><h2>Publish announcement</h2></div><button className="button button-outline button-small" onClick={()=>setShowNotice(!showNotice)}><FaPlus/> New</button></div>{showNotice&&<form className="notice-form" onSubmit={addNotice}><Field label="Title" value={notice.title} onChange={v=>setNotice({...notice,title:v})} required/><label className="field"><span>Message</span><textarea value={notice.message} onChange={e=>setNotice({...notice,message:e.target.value})} required/></label><button className="button button-dark">Publish <FaBell/></button></form>}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">STUDENT LIST</span><h2>Students</h2></div><div className="search-box"><FaSearch/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a student"/></div></div>{loading?<Loading label="Loading students"/>:filtered.map(s=><div className="student-row" key={s.uid}><Initials name={s.fullName}/><div className="student-row-main"><b>{s.fullName}</b><small>{s.studentId} · {s.email} {s.school?`· ${s.school}`:""}</small></div><select value={s.status} onChange={e=>updateStudent(s,e.target.value as Status)}><option value="active">Active</option><option value="pending">Pending</option><option value="disabled">Disabled</option></select><button className="icon-button danger-icon" title="Delete class profile" onClick={async()=>{if(confirm(`Delete ${s.fullName}'s class profile and papers?`)){const ps=await getDocs(query(collection(db,"papers"),where("uid","==",s.uid)));for(const p of ps.docs){const data=p.data() as Paper;try{await deleteObject(ref(storage,data.storagePath))}catch{}await deleteDoc(p.ref)}await deleteDoc(doc(db,"users",s.uid));await load()}}}><FaTimes/></button></div>)}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">PAPER REVIEW</span><h2>Pending submissions</h2></div></div>{papers.length?papers.map(p=><div className="teacher-paper" key={p.id}><div><b>{p.paperName}</b><small>{p.studentName} · {p.studentId} · {p.fileName}</small><p>{p.description}</p></div><a className="button button-outline button-small" href="#" onClick={async e=>{e.preventDefault();const u=await getDownloadURL(ref(storage,p.storagePath));window.open(u,"_blank","noopener")}}>View file</a><button className="button button-dark button-small" onClick={()=>setMarking(p.id)}><FaPen/> Mark</button>{marking===p.id&&<form className="mark-form" onSubmit={e=>mark(e,p)}><Field label="Marks" value={marks} onChange={setMarks} type="number" required/><Field label="Maximum" value={max} onChange={setMax} type="number" required/><Field label="Grade" value={grade} onChange={setGrade}/><label className="field"><span>Feedback</span><textarea value={feedback} onChange={e=>setFeedback(e.target.value)}/></label><button className="button button-dark">Save mark <FaCheck/></button></form>}</div>):<Empty icon={FaCheck} title="All caught up" detail="There are no pending papers to mark."/ >}</section>
  </div>;
}

function App() {
  const [user,setUser]=useState<User|null>(null);const [authLoading,setAuthLoading]=useState(true);const {profile,loading:profileLoading}=useProfile(user);
  const [hash,setHash]=useState(location.hash||"");
  useEffect(()=>{return onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)})},[]);
  useEffect(()=>{const f=()=>setHash(location.hash||"");addEventListener("hashchange",f);return()=>removeEventListener("hashchange",f)},[]);
  if(authLoading)return <Loading label="Connecting to Firebase"/>;
  if(!user){if(hash==="#signin")return <AuthPage mode="signin" onDone={()=>location.hash="home"}/>;if(hash==="#signup")return <AuthPage mode="signup" onDone={()=>location.hash="home"}/>;return <Landing go={p=>location.hash=p}/>;}
  if(profileLoading)return <Loading label="Loading your class profile"/>;
  if(!profile)return <ProfileSetup user={user} onComplete={()=>location.hash="home"}/>;
  if(profile.status!=="active")return <main className="auth-page"><div className="auth-card"><BrandMark/><h1>Account unavailable</h1><p>Your class account is currently <b>{profile.status}</b>. Please contact Damith for help.</p><button className="button button-dark" onClick={()=>signOut(auth)}>Sign out</button></div></main>;
  const {data:allPapers}=usePapers(user);
  const active=hash.replace("#","")||"home";
  const page=active==="papers"?<PapersPage user={user} profile={profile}/>:active==="marks"?<MarksPage user={user}/>:active==="rankings"?<RankingsPage user={user}/>:active==="profile"?<ProfilePage user={user} profile={profile} onRefresh={()=>{}}/>:active==="teacher"&&profile.role==="teacher"?<TeacherPage user={user}/>:<HomePage user={user} profile={profile} papers={allPapers}/>;
  return <AppShell user={user} profile={profile} onNavigate={()=>{}}>{page}</AppShell>;
}
export default App;
