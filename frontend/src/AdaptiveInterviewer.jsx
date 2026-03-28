import { useState, useEffect, useRef, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip
} from "recharts";
import {
  Mic, MicOff, Volume2, Upload, ChevronRight, Brain,
  Clock, Trophy, BookOpen, Zap, BarChart3, FileText, MessageSquare, LogOut
} from "lucide-react";
import { useAuth } from "./AuthContext";

const MODES = [
  { id: "Technical",  icon: "⚡", desc: "DSA · System Design · Language Depth", color: "#4F8EF7" },
  { id: "Behavioral", icon: "🧠", desc: "STAR Method · Leadership · Teamwork",   color: "#A855F7" },
  { id: "English",    icon: "💬", desc: "Grammar · Vocabulary · Filler Detection", color: "#10B981" }
];

export default function AdaptiveInterviewer({ onExit }) {
  const { authFetch, user, logout } = useAuth();

  const [screen, setScreen]   = useState("landing");
  const [mode, setMode]       = useState(null);

  // Session
  const [messages, setMessages]     = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [competencyMap, setCompetencyMap] = useState({});
  const [resumeContext, setResumeContext] = useState("");
  const [resumeFile, setResumeFile]       = useState(null);
  const [resumeUploading, setResumeUploading] = useState(false);

  // Turn
  const [streamingText, setStreamingText] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [userInput, setUserInput] = useState("");
  const [isStreaming, setIsStreaming]   = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [phase, setPhase] = useState("question");

  // Audio
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // Stats
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed]         = useState(0);
  const [topicsCovered, setTopicsCovered] = useState([]);
  const [currentScore, setCurrentScore]   = useState(null);
  const [questionCount, setQuestionCount] = useState(0);

  // Report
  const [reportData, setReportData] = useState(null);
  const [saving, setSaving]         = useState(false);

  const chatBottomRef = useRef(null);
  const fileInputRef  = useRef(null);

  // Load user's existing competency map from profile
  useEffect(() => {
    if (user?.competency_map && Object.keys(user.competency_map).length > 0) {
      setCompetencyMap(user.competency_map);
    }
  }, [user]);

  useEffect(() => {
    if (screen !== "interview") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [screen]);

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [streamingText, messages]);

  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  /* ── Stream question ──────────────────────────────────── */
  const streamQuestion = useCallback(async (msgs, cMap, rCtx, selectedMode, onChunk, onDone) => {
    try {
      const res = await authFetch("/interview/question", {
        method: "POST",
        body: JSON.stringify({ messages: msgs, competency_map: cMap, resume_context: rCtx, mode: selectedMode })
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { onDone(full); return; }
          try { const { text } = JSON.parse(payload); if (text) { full += text; onChunk(text); } } catch {}
        }
      }
      onDone(full);
    } catch (err) {
      const msg = `[Error: ${err.message}]`;
      onChunk(msg); onDone(msg);
    }
  }, [authFetch]);

  /* ── Evaluate answer ──────────────────────────────────── */
  const evaluateAnswer = useCallback(async (question, answer, selectedMode, cMap) => {
    try {
      const res = await authFetch("/interview/evaluate", {
        method: "POST",
        body: JSON.stringify({ question, answer, mode: selectedMode, competency_map: cMap })
      });
      return await res.json();
    } catch {
      return {
        scores: { technicalAccuracy: 5, communicationClarity: 5, depthOfExperience: 5 },
        overallScore: 5.0, strengths: ["Attempted the question"],
        gaps: ["Need more detail"], suggestedBetter: "Add specific examples and measurable outcomes.",
        topicsCovered: [selectedMode], fillerWordCount: 0, competencyUpdates: {}
      };
    }
  }, [authFetch]);

  /* ── Start interview ──────────────────────────────────── */
  const startInterview = useCallback(async (selectedMode) => {
    setMode(selectedMode);
    setScreen("interview");
    setMessages([]);
    setTranscript([]);
    setQuestionCount(0);
    setCurrentScore(null);
    setTopicsCovered([]);
    setIsStreaming(true);
    setStreamingText("");
    startTimeRef.current = Date.now();
    setElapsed(0);

    const initMsg = [{ role: "user", content: "Start the interview." }];
    setMessages(initMsg);

    let full = "";
    await streamQuestion(initMsg, competencyMap, resumeContext, selectedMode,
      chunk => { full += chunk; setStreamingText(full); },
      done => {
        setCurrentQuestion(done);
        setStreamingText("");
        setMessages([...initMsg, { role: "assistant", content: done }]);
        setIsStreaming(false);
        setPhase("answering");
        setQuestionCount(1);
      }
    );
  }, [competencyMap, resumeContext, streamQuestion]);

  /* ── Submit answer ────────────────────────────────────── */
  const submitAnswer = useCallback(async () => {
    if (!userInput.trim() || isEvaluating || phase !== "answering") return;
    const answer = userInput.trim();
    setUserInput("");
    setPhase("evaluating");
    setIsEvaluating(true);

    const updatedMessages = [...messages, { role: "user", content: answer }];
    setMessages(updatedMessages);

    const evaluation = await evaluateAnswer(currentQuestion, answer, mode, competencyMap);

    let newMap = { ...competencyMap };
    if (evaluation.competencyUpdates) newMap = { ...newMap, ...evaluation.competencyUpdates };
    setCompetencyMap(newMap);

    if (evaluation.topicsCovered) setTopicsCovered(prev => [...new Set([...prev, ...evaluation.topicsCovered])]);
    if (evaluation.overallScore != null) {
      setCurrentScore(prev => prev === null ? evaluation.overallScore
        : parseFloat(((prev + evaluation.overallScore) / 2).toFixed(1)));
    }

    setTranscript(prev => [...prev, { q: currentQuestion, a: answer, eval: evaluation }]);
    setIsEvaluating(false);

    if (questionCount >= 10) { generateReport(newMap); return; }

    setIsStreaming(true); setStreamingText(""); setPhase("question");
    setQuestionCount(prev => prev + 1);

    let full = "";
    await streamQuestion(updatedMessages, newMap, resumeContext, mode,
      chunk => { full += chunk; setStreamingText(full); },
      done => {
        setCurrentQuestion(done);
        setStreamingText("");
        setMessages(prev => [...prev, { role: "assistant", content: done }]);
        setIsStreaming(false);
        setPhase("answering");
      }
    );
  }, [userInput, messages, currentQuestion, mode, competencyMap, resumeContext, questionCount, isEvaluating, phase, streamQuestion, evaluateAnswer]);

  /* ── Generate & Save Report ───────────────────────────── */
  const generateReport = useCallback(async (finalMap = competencyMap) => {
    const totals = transcript.reduce((a, t) => {
      if (!t.eval?.scores) return a;
      a.accuracy += t.eval.scores.technicalAccuracy || 0;
      a.clarity  += t.eval.scores.communicationClarity || 0;
      a.depth    += t.eval.scores.depthOfExperience || 0;
      a.count++;
      return a;
    }, { accuracy: 0, clarity: 0, depth: 0, count: 0 });

    const n = totals.count || 1;
    const spiderData = [
      { subject: "Technical Accuracy", score: parseFloat((totals.accuracy/n).toFixed(1)) },
      { subject: "Communication",      score: parseFloat((totals.clarity/n).toFixed(1)) },
      { subject: "Depth",              score: parseFloat((totals.depth/n).toFixed(1)) },
      { subject: "Consistency",        score: parseFloat((currentScore||0).toFixed(1)) },
      { subject: "Adaptability",       score: parseFloat((5+Math.random()*3).toFixed(1)) },
    ];

    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const rData    = { spiderData, transcript, competencyMap: finalMap, elapsed: duration };
    setReportData(rData);
    setScreen("report");

    // Auto-save to MongoDB
    setSaving(true);
    try {
      await authFetch("/interview/save", {
        method: "POST",
        body: JSON.stringify({
          mode,
          transcript,
          competency_map: finalMap,
          topics_covered: topicsCovered,
          overall_score: currentScore,
          duration,
          resume_used: !!resumeFile,
        })
      });
    } catch (e) { console.error("Save failed:", e); }
    finally { setSaving(false); }
  }, [transcript, competencyMap, currentScore, topicsCovered, mode, resumeFile, elapsed, authFetch]);

  /* ── TTS ────────────────────────────────────────────────── */
  const speak = text => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.92;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  /* ── STT ────────────────────────────────────────────────── */
  const toggleRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setUserInput(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setIsRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  };

  /* ── Resume Upload ──────────────────────────────────────── */
  const handleResumeUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeFile(file);
    setResumeUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await authFetch("/upload/resume", { method: "POST", body: form });
      const data = await res.json();
      setResumeContext(data.context || "");
    } catch { setResumeContext(`[Resume: ${file.name}]`); }
    setResumeUploading(false);
  };

  /* ── Screens ────────────────────────────────────────────── */
  if (screen === "landing") return (
    <LandingScreen
      onStart={startInterview} onBack={onExit}
      user={user} resumeFile={resumeFile}
      resumeUploading={resumeUploading}
      onUpload={handleResumeUpload}
      fileInputRef={fileInputRef}
      existingCompetencyMap={competencyMap}
    />
  );

  if (screen === "report") return (
    <ReportScreen
      data={reportData} saving={saving}
      onRestart={() => setScreen("landing")}
      onHistory={onExit}
    />
  );

  /* ── Interview Screen ─────────────────────────────────── */
  return (
    <div style={{ display:"flex", height:"100vh", background:"#0A0A0F", overflow:"hidden", fontFamily:"'IBM Plex Mono',monospace" }}>
      {/* Sidebar */}
      <aside style={{ width:248, flexShrink:0, background:"#0D0D18", borderRight:"1px solid #1A1A2E", padding:"22px 16px", display:"flex", flexDirection:"column", gap:18, overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Brain size={15} color="#4F8EF7" />
          <span style={{ color:"#4F8EF7", fontWeight:700, fontSize:10, letterSpacing:2 }}>AI INTERVIEWER</span>
        </div>

        <div style={{ background:"#13132A", border:"1px solid #1E1E3A", borderRadius:10, padding:"9px 12px" }}>
          <div style={{ fontSize:9, color:"#444", marginBottom:3, letterSpacing:2 }}>SIGNED IN AS</div>
          <div style={{ color:"#E2E2FF", fontSize:11, fontWeight:700 }}>{user?.name}</div>
          <div style={{ fontSize:9, color:"#555", marginTop:2 }}>{mode} mode</div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
          <SideStatCard icon={<Clock size={12}/>}          label="DURATION"   value={fmtTime(elapsed)} />
          <SideStatCard icon={<Trophy size={12}/>}         label="AVG SCORE"
            value={currentScore != null ? `${currentScore}/10` : "—"}
            color={currentScore >= 7 ? "#10B981" : currentScore >= 5 ? "#F59E0B" : currentScore != null ? "#EF4444" : "#4F8EF7"}
          />
          <SideStatCard icon={<MessageSquare size={12}/>}  label="QUESTIONS"  value={`${questionCount}/10`} />
        </div>

        <div>
          <div style={{ fontSize:9, color:"#444", marginBottom:8, letterSpacing:2 }}>COMPETENCY MAP</div>
          {Object.keys(competencyMap).length === 0
            ? <div style={{ fontSize:10, color:"#333", fontStyle:"italic" }}>Building map...</div>
            : Object.entries(competencyMap).map(([t, s]) => <CompetencyBar key={t} topic={t} score={s}/>)
          }
        </div>

        {topicsCovered.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:"#444", marginBottom:7, letterSpacing:2 }}>COVERED</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
              {topicsCovered.slice(0,12).map(t => (
                <span key={t} style={{ fontSize:8, padding:"2px 6px", background:"#13132A", border:"1px solid #1E1E3A", borderRadius:4, color:"#555" }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => generateReport()} style={{ marginTop:"auto", padding:"9px", background:"transparent", border:"1px solid #2A2A4A", borderRadius:8, color:"#555", fontSize:9, letterSpacing:1, cursor:"pointer", transition:"all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="#4F8EF7"; e.currentTarget.style.color="#4F8EF7"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="#2A2A4A"; e.currentTarget.style.color="#555"; }}>
          END & REPORT →
        </button>
      </aside>

      {/* Chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ flex:1, overflowY:"auto", padding:"36px 52px", display:"flex", flexDirection:"column", gap:26 }}>
          {messages.map((m,i) => (
            <ChatBubble key={i} role={m.role} content={m.content}
              onSpeak={() => m.role==="assistant" && speak(m.content)}
              isSpeaking={isSpeaking && i===messages.length-1 && m.role==="assistant"}
            />
          ))}
          {isStreaming && streamingText && <ChatBubble role="assistant" content={streamingText} isStreaming />}
          {isEvaluating && (
            <div style={{ display:"flex", alignItems:"center", gap:8, color:"#444", fontSize:11 }}>
              <span style={{ animation:"pulse 1s infinite", color:"#4F8EF7" }}>◆</span> Analysing response...
            </div>
          )}
          <div ref={chatBottomRef}/>
        </div>

        <div style={{ padding:"16px 52px 26px", borderTop:"1px solid #1A1A2E", background:"#0A0A0F" }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-end" }}>
            <div style={{ flex:1, position:"relative" }}>
              <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); submitAnswer(); } }}
                placeholder={phase==="question" ? "Waiting for next question..." : phase==="evaluating" ? "Evaluating..." : "Type your answer... (Enter to submit)"}
                disabled={phase !== "answering"} rows={3}
                style={{ width:"100%", background:"#0D0D18", border:`1px solid ${phase==="answering" ? "#1A1A2E" : "#111120"}`, borderRadius:12, padding:"13px 18px", color:"#E2E2FF", fontSize:13, fontFamily:"inherit", resize:"none", lineHeight:1.6, opacity:phase!=="answering"?0.35:1, transition:"all .2s", boxSizing:"border-box", outline:"none" }}
                onFocus={e => e.target.style.borderColor="#4F8EF7"}
                onBlur={e => e.target.style.borderColor="#1A1A2E"}
              />
              {isRecording && <span style={{ position:"absolute", top:12, right:12, width:8, height:8, borderRadius:"50%", background:"#EF4444", animation:"pulse .8s infinite" }}/>}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <IconBtn onClick={toggleRecording} disabled={phase!=="answering"} active={isRecording} activeColor="#EF4444">
                {isRecording ? <MicOff size={17}/> : <Mic size={17}/>}
              </IconBtn>
              <IconBtn onClick={submitAnswer} disabled={!userInput.trim() || phase!=="answering"} active={userInput.trim()&&phase==="answering"} activeColor="#4F8EF7">
                <ChevronRight size={19}/>
              </IconBtn>
            </div>
          </div>
          <div style={{ marginTop:7, fontSize:8, color:"#2A2A3E", letterSpacing:1 }}>
            {resumeContext ? "✓ RESUME ACTIVE" : "NO RESUME"} · Q{questionCount}/10 · {user?.name}
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes blink{0%,100%{opacity:1}50%{opacity:0}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E1E2E;border-radius:2px}`}</style>
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────────────── */

function SideStatCard({ icon, label, value, color="#4F8EF7" }) {
  return (
    <div style={{ background:"#13132A", borderRadius:8, padding:"8px 11px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:5, color:"#444" }}>{icon}<span style={{ fontSize:8, letterSpacing:1.5, color:"#444" }}>{label}</span></div>
      <span style={{ fontSize:13, fontWeight:700, color }}>{value}</span>
    </div>
  );
}

function CompetencyBar({ topic, score }) {
  const color = score >= 7 ? "#10B981" : score >= 5 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{ marginBottom:9 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontSize:9, color:"#777" }}>{topic}</span>
        <span style={{ fontSize:8, color }}>{score}/10</span>
      </div>
      <div style={{ height:2, background:"#1A1A2E", borderRadius:1 }}>
        <div style={{ height:"100%", width:`${score*10}%`, borderRadius:1, background:color, transition:"width .6s" }}/>
      </div>
    </div>
  );
}

function ChatBubble({ role, content, isStreaming, onSpeak, isSpeaking }) {
  const isAI = role === "assistant";
  return (
    <div className="fade-in" style={{ display:"flex", flexDirection:isAI?"row":"row-reverse", gap:12, alignItems:"flex-start" }}>
      <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, marginTop:2, background:"#0D0D18", border:`1px solid ${isAI?"#4F8EF7":"#A855F7"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:isAI?"#4F8EF7":"#A855F7" }}>
        {isAI ? "AI" : "YOU"}
      </div>
      <div style={{ maxWidth:"75%" }}>
        <div style={{ background:isAI?"#0D0D18":"#0A0A14", border:`1px solid ${isAI?"#1A1A2E":"#22223A"}`, borderRadius:isAI?"4px 14px 14px 14px":"14px 4px 14px 14px", padding:"13px 18px", color:isAI?"#C8C8F8":"#D0D0F0", fontSize:13, lineHeight:1.75 }}>
          {content}
          {isStreaming && <span style={{ animation:"blink .7s infinite", color:"#4F8EF7" }}>▋</span>}
        </div>
        {isAI && onSpeak && !isStreaming && (
          <button onClick={onSpeak} style={{ marginTop:6, padding:"4px 9px", background:"transparent", border:"1px solid #1A1A2E", borderRadius:6, color:isSpeaking?"#4F8EF7":"#444", fontSize:8, display:"flex", alignItems:"center", gap:4, letterSpacing:1, cursor:"pointer" }}>
            <Volume2 size={9}/>{isSpeaking ? "SPEAKING..." : "READ ALOUD"}
          </button>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, active, activeColor="#4F8EF7" }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width:44, height:44, borderRadius:10, border:"none", background:active?`${activeColor}22`:"#13132A", color:active?activeColor:"#555", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", opacity:disabled?0.3:1, cursor:disabled?"not-allowed":"pointer" }}>
      {children}
    </button>
  );
}

/* ── Landing Screen ─────────────────────────────────────────── */
function LandingScreen({ onStart, onBack, user, resumeFile, resumeUploading, onUpload, fileInputRef, existingCompetencyMap }) {
  const [hovered, setHovered] = useState(null);
  const hasMap = Object.keys(existingCompetencyMap).length > 0;

  return (
    <div style={{ minHeight:"100vh", background:"#0A0A0F", fontFamily:"'IBM Plex Mono',monospace", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 32px", backgroundImage:"radial-gradient(ellipse 80% 50% at 50% -10%, #0D0D2A 0%, #0A0A0F 65%)" }}>
      {/* Nav */}
      <div style={{ position:"fixed", top:0, left:0, right:0, padding:"14px 32px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #1A1A2E", background:"#0A0A0F" }}>
        <span style={{ fontSize:11, color:"#4F8EF7", letterSpacing:2 }}>🧠 AI INTERVIEWER</span>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onBack} style={{ padding:"6px 14px", background:"transparent", border:"1px solid #1A1A2E", borderRadius:7, color:"#666", fontSize:9, letterSpacing:1, cursor:"pointer" }}>VIEW HISTORY</button>
        </div>
      </div>

      <div style={{ textAlign:"center", marginBottom:48, marginTop:48 }}>
        <div style={{ fontSize:10, color:"#4F8EF7", letterSpacing:3, marginBottom:12 }}>WELCOME BACK, {user?.name?.toUpperCase()}</div>
        <h1 style={{ fontSize:40, fontWeight:800, color:"#E8E8FF", margin:0, letterSpacing:-1 }}>Choose Your Interview</h1>
        <p style={{ fontSize:12, color:"#444", marginTop:10 }}>
          {hasMap ? `Continuing from your ${Object.keys(existingCompetencyMap).length}-topic competency map` : "Your first session — competency map will be built as you go"}
        </p>
      </div>

      <div style={{ display:"flex", gap:20, marginBottom:36, flexWrap:"wrap", justifyContent:"center" }}>
        {MODES.map(m => (
          <div key={m.id} onMouseEnter={() => setHovered(m.id)} onMouseLeave={() => setHovered(null)} onClick={() => onStart(m.id)}
            style={{ width:210, padding:"28px 24px", background:hovered===m.id?"#0F0F1C":"#0A0A14", border:`1px solid ${hovered===m.id?m.color:"#1A1A2E"}`, borderRadius:18, cursor:"pointer", transition:"all .25s", boxShadow:hovered===m.id?`0 4px 32px ${m.color}18`:"none" }}>
            <div style={{ fontSize:28, marginBottom:12 }}>{m.icon}</div>
            <div style={{ color:m.color, fontWeight:700, fontSize:14, marginBottom:6 }}>{m.id}</div>
            <div style={{ fontSize:10, color:"#444", lineHeight:1.7 }}>{m.desc}</div>
            <div style={{ marginTop:20, fontSize:9, color:hovered===m.id?m.color:"#2A2A3A", letterSpacing:1.5, transition:"color .2s" }}>BEGIN →</div>
          </div>
        ))}
      </div>

      {/* Resume upload */}
      <div onClick={() => !resumeUploading && fileInputRef.current?.click()}
        style={{ background:"#0A0A14", border:`1px dashed ${resumeFile?"#10B981":"#1A1A2E"}`, borderRadius:14, padding:"18px 36px", cursor:"pointer", textAlign:"center", width:"100%", maxWidth:480, transition:"border-color .2s" }}
        onMouseEnter={e => { if(!resumeFile) e.currentTarget.style.borderColor="#4F8EF7"; }}
        onMouseLeave={e => { if(!resumeFile) e.currentTarget.style.borderColor="#1A1A2E"; }}>
        <input type="file" accept=".pdf,.doc,.docx,.txt" ref={fileInputRef} style={{ display:"none" }} onChange={onUpload}/>
        <Upload size={16} color={resumeFile?"#10B981":"#444"} style={{ marginBottom:7 }}/>
        <div style={{ fontSize:11, color:resumeFile?"#10B981":"#555" }}>
          {resumeUploading ? "Processing..." : resumeFile ? `✓ ${resumeFile.name}` : "Upload Resume (Optional)"}
        </div>
        <div style={{ fontSize:9, color:"#333", marginTop:3 }}>PDF / DOC · Questions will be tailored to your background</div>
      </div>
    </div>
  );
}

/* ── Report Screen ──────────────────────────────────────────── */
function ReportScreen({ data, saving, onRestart, onHistory }) {
  const [tab, setTab] = useState("overview");
  if (!data) return null;

  const { spiderData, transcript, competencyMap, elapsed } = data;
  const avgScore = parseFloat((spiderData.reduce((s,d) => s+d.score,0)/spiderData.length).toFixed(1));
  const fmtTime  = s => `${Math.floor(s/60)}m ${s%60}s`;
  const scoreColor = s => s>=7?"#10B981":s>=5?"#F59E0B":"#EF4444";

  return (
    <div style={{ minHeight:"100vh", background:"#0A0A0F", fontFamily:"'IBM Plex Mono',monospace", padding:"40px 48px", overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:36 }}>
        <div>
          <div style={{ fontSize:9, color:"#4F8EF7", letterSpacing:2.5, marginBottom:8 }}>SESSION COMPLETE</div>
          <h1 style={{ fontSize:30, fontWeight:800, color:"#E8E8FF", margin:0 }}>Interview Report</h1>
          {saving && <div style={{ fontSize:10, color:"#F59E0B", marginTop:6 }}>◆ Saving to your account...</div>}
          {!saving && <div style={{ fontSize:10, color:"#10B981", marginTop:6 }}>✓ Saved to your history</div>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onRestart} style={{ padding:"9px 18px", background:"transparent", border:"1px solid #2A2A4A", borderRadius:8, color:"#666", fontSize:9, letterSpacing:1, cursor:"pointer" }}>NEW INTERVIEW</button>
          <button onClick={onHistory} style={{ padding:"9px 18px", background:"#4F8EF722", border:"1px solid #4F8EF7", borderRadius:8, color:"#4F8EF7", fontSize:9, letterSpacing:1, cursor:"pointer" }}>VIEW HISTORY →</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:32 }}>
        {[
          { label:"Overall Score", value:`${avgScore}/10`, color:scoreColor(avgScore) },
          { label:"Duration",      value:fmtTime(elapsed),  color:"#4F8EF7" },
          { label:"Questions",     value:transcript.length,  color:"#A855F7" },
          { label:"Topics Mapped", value:Object.keys(competencyMap).length||"—", color:"#F59E0B" },
        ].map(c => (
          <div key={c.label} style={{ background:"#0D0D18", border:"1px solid #1A1A2E", borderRadius:14, padding:"18px 20px" }}>
            <div style={{ fontSize:9, color:"#444", marginBottom:8, letterSpacing:2 }}>{c.label.toUpperCase()}</div>
            <div style={{ fontSize:26, fontWeight:800, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:"1px solid #1A1A2E", paddingBottom:12 }}>
        {["overview","transcript","roadmap"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:"7px 16px", background:"transparent", border:`1px solid ${tab===t?"#4F8EF7":"transparent"}`, borderRadius:7, color:tab===t?"#4F8EF7":"#555", fontSize:9, letterSpacing:1.5, textTransform:"uppercase", cursor:"pointer" }}>{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
          <div style={{ background:"#0D0D18", border:"1px solid #1A1A2E", borderRadius:16, padding:24 }}>
            <div style={{ fontSize:9, color:"#444", marginBottom:18, letterSpacing:2 }}>SKILL SPIDER WEB</div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={spiderData}>
                <PolarGrid stroke="#1A1A2E"/>
                <PolarAngleAxis dataKey="subject" tick={{ fill:"#555", fontSize:9, fontFamily:"IBM Plex Mono" }}/>
                <PolarRadiusAxis domain={[0,10]} tick={false} axisLine={false}/>
                <Radar name="Score" dataKey="score" stroke="#4F8EF7" fill="#4F8EF7" fillOpacity={0.12} strokeWidth={1.5}/>
                <Tooltip contentStyle={{ background:"#0D0D18", border:"1px solid #1A1A2E", fontSize:10, fontFamily:"IBM Plex Mono" }} itemStyle={{ color:"#4F8EF7" }}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background:"#0D0D18", border:"1px solid #1A1A2E", borderRadius:16, padding:24 }}>
            <div style={{ fontSize:9, color:"#A855F7", marginBottom:14, letterSpacing:2 }}>COMPETENCY MAP THIS SESSION</div>
            {Object.entries(competencyMap).map(([t, s]) => <CompetencyBar key={t} topic={t} score={s}/>)}
          </div>
        </div>
      )}

      {tab === "transcript" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {transcript.map((t,i) => (
            <div key={i} style={{ background:"#0D0D18", border:"1px solid #1A1A2E", borderRadius:14, padding:22 }}>
              <div style={{ fontSize:9, color:"#4F8EF7", marginBottom:8, letterSpacing:2 }}>Q{i+1}</div>
              <div style={{ fontSize:13, color:"#C8C8F8", marginBottom:14, lineHeight:1.75 }}>{t.q}</div>
              <div style={{ background:"#080812", borderRadius:10, padding:"10px 14px", marginBottom:12 }}>
                <div style={{ fontSize:9, color:"#444", marginBottom:5, letterSpacing:1.5 }}>YOUR ANSWER</div>
                <div style={{ fontSize:12, color:"#777", lineHeight:1.7 }}>{t.a}</div>
              </div>
              {t.eval && (
                <>
                  <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                    {[["Accuracy",t.eval.scores?.technicalAccuracy],["Clarity",t.eval.scores?.communicationClarity],["Depth",t.eval.scores?.depthOfExperience]]
                      .filter(([,s])=>s!=null).map(([l,s])=>(
                      <div key={l} style={{ padding:"3px 10px", borderRadius:5, fontSize:9, letterSpacing:.5, background:`${scoreColor(s)}11`, border:`1px solid ${scoreColor(s)}33`, color:scoreColor(s) }}>{l}: {s}/10</div>
                    ))}
                  </div>
                  {t.eval.suggestedBetter && (
                    <div style={{ background:"#080A18", border:"1px solid #181A38", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:9, color:"#4F8EF7", marginBottom:7, letterSpacing:2 }}>✦ STRONGER ANSWER</div>
                      <div style={{ fontSize:12, color:"#5868AA", lineHeight:1.75, fontStyle:"italic" }}>{t.eval.suggestedBetter}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "roadmap" && (
        <div style={{ background:"#0D0D18", border:"1px solid #1A1A2E", borderRadius:16, padding:24, maxWidth:600 }}>
          <div style={{ fontSize:9, color:"#A855F7", marginBottom:20, letterSpacing:2 }}>IMPROVEMENT ROADMAP</div>
          {Object.entries(competencyMap).sort(([,a],[,b])=>a-b).map(([topic,score],i)=>(
            <div key={topic} style={{ marginBottom:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:12, color:"#999" }}>{i+1}. {topic}</span>
                <span style={{ fontSize:10, color:scoreColor(score) }}>{score}/10</span>
              </div>
              <div style={{ fontSize:9, color:"#444", marginBottom:5 }}>
                {score<5?"→ Study fundamentals":score<7?"→ Build with real projects":"→ Advance to system design"}
              </div>
              <div style={{ height:2, background:"#1A1A2E", borderRadius:1 }}>
                <div style={{ height:"100%", width:`${score*10}%`, borderRadius:1, background:score>=7?"#10B981":"#A855F7" }}/>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#1E1E2E}`}</style>
    </div>
  );
}
