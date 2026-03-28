import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from "recharts";

export default function HistoryDashboard({ onBack }) {
  const { authFetch, user, logout } = useAuth();

  const [tab, setTab]             = useState("overview");  // overview | sessions | session-detail
  const [stats, setStats]         = useState(null);
  const [sessions, setSessions]   = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [modeFilter, setModeFilter] = useState("");
  const [deleting, setDeleting]   = useState(null);

  // Load stats
  useEffect(() => {
    setLoadingStats(true);
    authFetch("/history/stats")
      .then(r => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  }, []);

  // Load sessions list
  useEffect(() => {
    if (tab !== "sessions" && tab !== "overview") return;
    setLoadingSessions(true);
    const q = new URLSearchParams({ page, limit: 8, ...(modeFilter ? { mode: modeFilter } : {}) });
    authFetch(`/history/?${q}`)
      .then(r => r.json())
      .then(data => { setSessions(data.sessions || []); setTotalPages(data.total_pages || 1); })
      .catch(console.error)
      .finally(() => setLoadingSessions(false));
  }, [page, modeFilter, tab]);

  // Load full session detail
  const openSession = async (id) => {
    setLoadingDetail(true);
    setTab("session-detail");
    try {
      const res  = await authFetch(`/history/${id}`);
      const data = await res.json();
      setSelectedSession(data);
    } catch { setSelectedSession(null); }
    finally { setLoadingDetail(false); }
  };

  const deleteSession = async (id) => {
    if (!confirm("Delete this interview session? This cannot be undone.")) return;
    setDeleting(id);
    await authFetch(`/history/${id}`, { method: "DELETE" });
    setSessions(prev => prev.filter(s => s.id !== id));
    if (selectedSession?.id === id) { setSelectedSession(null); setTab("sessions"); }
    setDeleting(null);
  };

  const fmtTime = s => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—";

  const scoreColor = s => !s ? "#555" : s >= 7 ? "#10B981" : s >= 5 ? "#F59E0B" : "#EF4444";

  // Spider chart data from competency map
  const spiderData = stats?.competency_map
    ? Object.entries(stats.competency_map).slice(0, 6).map(([k, v]) => ({ subject: k, score: v }))
    : [];

  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0F",
      fontFamily: "'IBM Plex Mono', monospace", color: "#C8C8FF"
    }}>
      {/* ── Top Nav ─────────────────────────────────────────── */}
      <div style={{
        padding: "16px 40px", borderBottom: "1px solid #1A1A2E",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontSize: 11, color: "#4F8EF7", letterSpacing: 2 }}>AI INTERVIEWER</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 11, color: "#555" }}>
            {user?.name} · {user?.total_interviews || 0} sessions
          </span>
          <NavBtn onClick={onBack} label="NEW INTERVIEW" accent />
          <NavBtn onClick={logout} label="SIGN OUT" />
        </div>
      </div>

      <div style={{ padding: "32px 40px" }}>
        {/* ── Page header ──────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 9, color: "#4F8EF7", letterSpacing: 2.5, marginBottom: 8 }}>YOUR PROFILE</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#E8E8FF", margin: 0 }}>
            {user?.name}'s Dashboard
          </h1>
        </div>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: "1px solid #1A1A2E", paddingBottom: 12 }}>
          {[
            { id: "overview",  label: "Overview" },
            { id: "sessions",  label: `Sessions (${stats?.user?.total_interviews ?? "…"})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 18px", background: "transparent",
              border: `1px solid ${tab === t.id ? "#4F8EF7" : "transparent"}`,
              borderRadius: 8, color: tab === t.id ? "#4F8EF7" : "#555",
              fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
              cursor: "pointer", transition: "all .2s"
            }}>{t.label}</button>
          ))}
          {tab === "session-detail" && (
            <button onClick={() => setTab("sessions")} style={{
              padding: "8px 18px", background: "transparent",
              border: "1px solid #4F8EF7", borderRadius: 8,
              color: "#4F8EF7", fontSize: 10, letterSpacing: 1.5, cursor: "pointer"
            }}>← Back to sessions</button>
          )}
        </div>

        {/* ══ TAB: OVERVIEW ════════════════════════════════════ */}
        {tab === "overview" && (
          <div>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Total Sessions",  value: stats?.user?.total_interviews ?? "…", color: "#4F8EF7" },
                { label: "Average Score",   value: stats?.user?.avg_score != null ? `${stats.user.avg_score}/10` : "—", color: scoreColor(stats?.user?.avg_score) },
                { label: "Topics Mapped",   value: spiderData.length || "…", color: "#A855F7" },
                { label: "Top Gap",         value: stats?.top_gaps?.[0]?.area?.split(" ")[0] ?? "—", color: "#F59E0B" },
              ].map(c => (
                <StatCard key={c.label} label={c.label} value={c.value} color={c.color} />
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              {/* Spider chart */}
              <Panel title="CUMULATIVE COMPETENCY MAP">
                {spiderData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart data={spiderData}>
                      <PolarGrid stroke="#1A1A2E" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "#555", fontSize: 9, fontFamily: "IBM Plex Mono" }} />
                      <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                      <Radar name="Score" dataKey="score" stroke="#4F8EF7" fill="#4F8EF7" fillOpacity={0.12} strokeWidth={1.5} />
                      <Tooltip contentStyle={{ background: "#0D0D18", border: "1px solid #1A1A2E", fontSize: 11, fontFamily: "IBM Plex Mono" }} itemStyle={{ color: "#4F8EF7" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : <Empty text="Complete interviews to build your map" />}
              </Panel>

              {/* Score history line chart */}
              <Panel title="SCORE PROGRESSION">
                {stats?.score_history?.length > 1 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={stats.score_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="#1A1A2E" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        tick={{ fill: "#444", fontSize: 9, fontFamily: "IBM Plex Mono" }} />
                      <YAxis domain={[0, 10]} tick={{ fill: "#444", fontSize: 9, fontFamily: "IBM Plex Mono" }} />
                      <Tooltip contentStyle={{ background: "#0D0D18", border: "1px solid #1A1A2E", fontSize: 10, fontFamily: "IBM Plex Mono" }} />
                      <Line type="monotone" dataKey="score" stroke="#4F8EF7" strokeWidth={2} dot={{ fill: "#4F8EF7", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty text="Need 2+ sessions to show progression" />}
              </Panel>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Top gaps */}
              <Panel title="TOP AREAS TO IMPROVE">
                {stats?.top_gaps?.length > 0
                  ? stats.top_gaps.map((g, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #13132A" }}>
                        <span style={{ fontSize: 11, color: "#888" }}>{g.area}</span>
                        <span style={{ fontSize: 9, color: "#EF4444", letterSpacing: 1 }}>×{g.count}</span>
                      </div>
                    ))
                  : <Empty text="No gap data yet" />}
              </Panel>

              {/* Mode breakdown */}
              <Panel title="MODE BREAKDOWN">
                {stats?.mode_breakdown && Object.keys(stats.mode_breakdown).length > 0
                  ? Object.entries(stats.mode_breakdown).map(([mode, d]) => (
                      <div key={mode} style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: "#AAA" }}>{mode}</span>
                          <span style={{ fontSize: 10, color: scoreColor(d.avg_score) }}>
                            avg {d.avg_score ?? "—"}/10 · {d.count} sessions
                          </span>
                        </div>
                        <div style={{ height: 2, background: "#1A1A2E", borderRadius: 1 }}>
                          <div style={{ height: "100%", width: `${(d.avg_score || 0) * 10}%`, background: "#4F8EF7", borderRadius: 1, transition: "width .6s" }} />
                        </div>
                      </div>
                    ))
                  : <Empty text="No mode data yet" />}
              </Panel>
            </div>
          </div>
        )}

        {/* ══ TAB: SESSIONS ════════════════════════════════════ */}
        {tab === "sessions" && (
          <div>
            {/* Filter bar */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["", "Technical", "Behavioral", "English"].map(m => (
                <button key={m} onClick={() => { setModeFilter(m); setPage(1); }} style={{
                  padding: "6px 14px", background: "transparent",
                  border: `1px solid ${modeFilter === m ? "#4F8EF7" : "#1A1A2E"}`,
                  borderRadius: 6, color: modeFilter === m ? "#4F8EF7" : "#555",
                  fontSize: 9, letterSpacing: 1, cursor: "pointer"
                }}>{m || "ALL MODES"}</button>
              ))}
            </div>

            {loadingSessions
              ? <div style={{ color: "#333", fontSize: 12, padding: 32 }}>Loading sessions...</div>
              : sessions.length === 0
              ? <Empty text="No sessions found. Complete an interview to see your history." />
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sessions.map(s => (
                    <SessionRow
                      key={s.id} session={s}
                      onOpen={() => openSession(s.id)}
                      onDelete={() => deleteSession(s.id)}
                      isDeleting={deleting === s.id}
                      scoreColor={scoreColor}
                      fmtTime={fmtTime} fmtDate={fmtDate}
                    />
                  ))}
                </div>
              )
            }

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "center" }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: page === p ? "#4F8EF7" : "transparent",
                    border: `1px solid ${page === p ? "#4F8EF7" : "#1A1A2E"}`,
                    color: page === p ? "#fff" : "#555",
                    fontSize: 11, cursor: "pointer"
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: SESSION DETAIL ══════════════════════════════ */}
        {tab === "session-detail" && (
          <div>
            {loadingDetail
              ? <div style={{ color: "#333", fontSize: 12, padding: 32 }}>Loading session...</div>
              : !selectedSession
              ? <Empty text="Session not found." />
              : <SessionDetail session={selectedSession} scoreColor={scoreColor} fmtTime={fmtTime} fmtDate={fmtDate} />
            }
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#0D0D18", border: "1px solid #1A1A2E", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 9, color: "#444", marginBottom: 8, letterSpacing: 2 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: "#0D0D18", border: "1px solid #1A1A2E", borderRadius: 16, padding: "22px 24px" }}>
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ fontSize: 11, color: "#2A2A3A", fontStyle: "italic", padding: "12px 0" }}>{text}</div>;
}

function NavBtn({ onClick, label, accent }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 16px", background: accent ? "#4F8EF722" : "transparent",
      border: `1px solid ${accent ? "#4F8EF7" : "#2A2A4A"}`,
      borderRadius: 7, color: accent ? "#4F8EF7" : "#666",
      fontSize: 9, letterSpacing: 1.2, cursor: "pointer", transition: "all .2s"
    }}>{label}</button>
  );
}

function SessionRow({ session, onOpen, onDelete, isDeleting, scoreColor, fmtTime, fmtDate }) {
  const modeColor = { Technical: "#4F8EF7", Behavioral: "#A855F7", English: "#10B981" }[session.mode] || "#555";
  return (
    <div style={{
      background: "#0D0D18", border: "1px solid #1A1A2E", borderRadius: 12,
      padding: "16px 20px", display: "flex", alignItems: "center", gap: 16
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: `${modeColor}15`, border: `1px solid ${modeColor}33`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, color: modeColor, fontWeight: 700, letterSpacing: 0.5
      }}>{session.mode?.slice(0, 4).toUpperCase()}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#E2E2FF", fontWeight: 600 }}>{session.mode} Interview</span>
          <span style={{ fontSize: 9, color: "#444" }}>· {fmtDate(session.created_at)}</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {session.topics_covered?.slice(0, 4).map(t => (
            <span key={t} style={{ fontSize: 9, color: "#555", padding: "1px 6px", background: "#13132A", borderRadius: 4 }}>{t}</span>
          ))}
          <span style={{ fontSize: 9, color: "#444" }}>{session.question_count} questions · {fmtTime(session.duration)}</span>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor(session.overall_score) }}>
          {session.overall_score != null ? `${session.overall_score}` : "—"}
          <span style={{ fontSize: 11, color: "#444" }}>/10</span>
        </div>
      </div>

      <button onClick={onOpen} style={{
        padding: "7px 16px", background: "#1A1A2E", border: "1px solid #252545",
        borderRadius: 7, color: "#888", fontSize: 9, letterSpacing: 1, cursor: "pointer"
      }}>VIEW →</button>

      <button onClick={onDelete} disabled={isDeleting} style={{
        padding: "7px 10px", background: "transparent", border: "1px solid #2A1515",
        borderRadius: 7, color: "#EF4444", fontSize: 9, cursor: "pointer", opacity: isDeleting ? 0.4 : 1
      }}>✕</button>
    </div>
  );
}

function SessionDetail({ session, scoreColor, fmtTime, fmtDate }) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Score",     value: session.overall_score != null ? `${session.overall_score}/10` : "—", color: scoreColor(session.overall_score) },
          { label: "Duration",  value: fmtTime(session.duration), color: "#4F8EF7" },
          { label: "Questions", value: session.question_count, color: "#A855F7" },
          { label: "Date",      value: fmtDate(session.created_at), color: "#888" },
        ].map(c => (
          <StatCard key={c.label} label={c.label} value={c.value} color={c.color} />
        ))}
      </div>

      {/* Transcript */}
      <div style={{ marginBottom: 16, fontSize: 9, color: "#444", letterSpacing: 2 }}>
        FULL TRANSCRIPT — {session.mode?.toUpperCase()} MODE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {session.transcript?.map((turn, i) => (
          <div key={i} style={{ background: "#0D0D18", border: "1px solid #1A1A2E", borderRadius: 14, padding: 22 }}>
            <div style={{ fontSize: 9, color: "#4F8EF7", marginBottom: 10, letterSpacing: 2 }}>Q{turn.turn_number}</div>

            <div style={{ fontSize: 13, color: "#C8C8F8", marginBottom: 14, lineHeight: 1.75 }}>{turn.question}</div>

            <div style={{ background: "#080812", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "#444", marginBottom: 6, letterSpacing: 1.5 }}>YOUR ANSWER</div>
              <div style={{ fontSize: 12, color: "#777", lineHeight: 1.7 }}>{turn.answer}</div>
            </div>

            {turn.scores && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  ["Accuracy",  turn.scores.technicalAccuracy],
                  ["Clarity",   turn.scores.communicationClarity],
                  ["Depth",     turn.scores.depthOfExperience],
                ].filter(([, s]) => s != null).map(([label, score]) => (
                  <div key={label} style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 9, letterSpacing: .5,
                    background: `${scoreColor(score)}11`, border: `1px solid ${scoreColor(score)}33`,
                    color: scoreColor(score)
                  }}>{label}: {score}/10</div>
                ))}
                {turn.filler_word_count > 0 && (
                  <div style={{ padding: "4px 12px", borderRadius: 6, fontSize: 9, background: "#1A150A", border: "1px solid #F59E0B33", color: "#F59E0B" }}>
                    Fillers: {turn.filler_word_count}
                  </div>
                )}
              </div>
            )}

            {turn.suggested_better && (
              <div style={{ background: "#080A18", border: "1px solid #181A38", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 9, color: "#4F8EF7", marginBottom: 8, letterSpacing: 2 }}>✦ STRONGER ANSWER</div>
                <div style={{ fontSize: 12, color: "#5868AA", lineHeight: 1.75, fontStyle: "italic" }}>{turn.suggested_better}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
