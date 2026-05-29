import { useState, useEffect, useRef, useCallback } from "react";

var cr = window.drips && window.drips.creatorResult;
var who = (window.drips && window.drips.creator) || "they";

var BG = "#050506";
var W = "rgba(255,255,255,";
var CARD = "#0A0A0C";
var VIOLET = "#C4B5FD"; // the voice / AI accent on the picker
var AMBER = "#FBBF24"; // trip
var ROSE = "#F472B6"; // wedding

var KINDS = {
  trip: {
    accent: AMBER,
    emoji: "✈️",
    pick: "a trip",
    verb: "planning",
    prompt: "where to, and the vibe.",
    examples: ["“tokyo for a week, food and no museums”", "“big sur road trip, slow mornings”"],
  },
  wedding: {
    accent: ROSE,
    emoji: "💍",
    pick: "a wedding",
    verb: "dreaming up",
    prompt: "the vibe, the place, the feeling.",
    examples: ["“small garden wedding, string lights, no suits”", "“moody, candlelit, vinyl only”"],
  },
};

export default function App() {
  var _step = useState("hook"), step = _step[0], setStep = _step[1];
  var _kind = useState(null), kind = _kind[0], setKind = _kind[1];
  var _text = useState(""), text = _text[0], setText = _text[1];
  var _rec = useState(false), recording = _rec[0], setRecording = _rec[1];
  var _secs = useState(0), seconds = _secs[0], setSeconds = _secs[1];
  var _typing = useState(false), typing = _typing[0], setTyping = _typing[1];
  var _plan = useState(null), plan = _plan[0], setPlan = _plan[1];
  var _loading = useState(false), loading = _loading[0], setLoading = _loading[1];

  var submitted = useRef(false);
  var recogRef = useRef(null);
  var streamRef = useRef(null);
  var timerRef = useRef(null);
  var textRef = useRef("");

  var K = kind ? KINDS[kind] : null;
  var accent = K ? K.accent : VIOLET;

  // progress: pick(0) -> talk(1) -> result(2)
  useEffect(function() {
    if (window.drips && window.drips.setProgress) {
      var s = step === "hook" ? 0 : step === "talk" ? 1 : 2;
      window.drips.setProgress(s, 2);
    }
  }, [step]);

  function stopMic() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(function(t) { t.stop(); });
      streamRef.current = null;
    }
  }
  function stopRecog() {
    if (recogRef.current) { try { recogRef.current.stop(); } catch (e) {} recogRef.current = null; }
  }
  useEffect(function() {
    return function() { stopMic(); stopRecog(); if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  var startRecording = useCallback(function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setTyping(true); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      streamRef.current = stream;
      setRecording(true);
      setSeconds(0);
      setText("");
      textRef.current = "";
      timerRef.current = setInterval(function() { setSeconds(function(s) { return s + 1; }); }, 1000);
      var recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";
      recogRef.current = recog;
      var got = false;
      recog.onresult = function(e) {
        got = true;
        var full = "";
        for (var i = 0; i < e.results.length; i++) full += e.results[i][0].transcript;
        textRef.current = full;
        setText(full);
      };
      recog.onerror = function() { if (!got) { stopRecording(); setTyping(true); } };
      recog.start();
    }).catch(function() { setTyping(true); });
  }, []);

  var stopRecording = useCallback(function() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopRecog();
    stopMic();
    setRecording(false);
  }, []);

  var build = useCallback(function() {
    var t = (textRef.current || text).trim();
    if (!t) return;
    window.drips && window.drips.played && window.drips.played({ kind: kind, transcript: t });
    setLoading(true);
    setStep("result");

    var sys = kind === "wedding"
      ? "You are a sharp wedding planner inside a voice app. Someone just said their dream wedding out loud. Turn it into a tight, real plan. title: a short evocative name for this wedding (3-5 words, lowercase). vibe: one punchy sentence capturing the feeling. highlights: exactly 3 concrete decisions (venue/setting, the mood/detail, food or music) — each 3-6 words, lowercase, specific not generic."
      : "You are a sharp travel planner inside a voice app. Someone just said their dream trip out loud. Turn it into a tight, real plan. title: a short evocative name for this trip (3-5 words, lowercase). vibe: one punchy sentence capturing the feeling. highlights: exactly 3 concrete moves (where/how long, the signature day, a do-this) — each 3-6 words, lowercase, specific not generic.";

    if (!window.drips || !window.drips.ai) {
      var fb = kind === "wedding"
        ? { title: "your day, your way", vibe: "intimate, warm, unmistakably you.", highlights: ["the place that feels like home", "candlelight over chandeliers", "the song you can't skip"] }
        : { title: "the trip you said", vibe: "exactly the pace you described.", highlights: ["go where you said", "one slow signature day", "skip the tourist trap"] };
      setPlan(fb);
      setLoading(false);
      doSubmit(fb, t);
      return;
    }

    window.drips.ai(
      [{ role: "system", content: sys }, { role: "user", content: t }],
      { format: "json", schema: { title: "string", vibe: "string", highlights: "array" } }
    ).then(function(res) {
      var p = (res && !res.error && res.title) ? res : {
        title: kind === "wedding" ? "your day" : "your trip",
        vibe: t.length > 80 ? t.slice(0, 80) + "…" : t,
        highlights: [t.slice(0, 40)],
      };
      if (!p.highlights || !p.highlights.length) p.highlights = ["—"];
      setPlan(p);
      setLoading(false);
      doSubmit(p, t);
    }).catch(function() {
      var p = { title: kind === "wedding" ? "your day" : "your trip", vibe: t, highlights: ["—"] };
      setPlan(p);
      setLoading(false);
      doSubmit(p, t);
    });
  }, [kind, text]);

  function doSubmit(p, t) {
    if (submitted.current) return;
    submitted.current = true;
    var label = (kind === "wedding" ? "dreamed up " : "planned ") + p.title + " — out loud";
    window.drips && window.drips.submit && window.drips.submit({
      type: kind === "wedding" ? "wedding-plan" : "trip-plan",
      kind: kind,
      title: p.title,
      vibe: p.vibe,
      highlights: p.highlights,
      transcript: t,
      label: label,
      display: { type: "picks", items: p.highlights.slice(0, 3), emoji: KINDS[kind].emoji },
    });
  }

  var pad = function(n) { return n < 10 ? "0" + n : "" + n; };
  var fmt = function(s) { return pad(Math.floor(s / 60)) + ":" + pad(s % 60); };

  var styles =
    "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&display=swap');" +
    "@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');" +
    "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;user-select:none}" +
    "html,body,#root{height:100%;overflow:hidden}" +
    "button{font-family:inherit;cursor:pointer;border:none;background:none}" +
    "button:active{transform:scale(0.97)!important}" +
    "textarea{font-family:inherit;user-select:text}" +
    "textarea::placeholder{color:" + W + "0.18)}" +
    "@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}" +
    "@keyframes scaleIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}" +
    "@keyframes ring{0%{transform:scale(1);opacity:0.5}100%{transform:scale(2.4);opacity:0}}" +
    "@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}}";

  var shell = function(ch) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: BG, color: "#fff",
        fontFamily: "'DM Sans', -apple-system, sans-serif", WebkitFontSmoothing: "antialiased",
        display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden",
      }}>
        {ch}
        <style>{styles}</style>
      </div>
    );
  };

  var screen = function(ch) {
    return (
      <div style={{
        width: "100%", maxWidth: 420, height: "100%",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "64px 26px 26px", overflow: "hidden",
      }}>{ch}</div>
    );
  };

  // ——— HOOK / PICKER ———
  if (step === "hook") {
    return shell(screen(
      <div style={{ textAlign: "center", width: "100%", animation: "up 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
        {cr ? (
          <div style={{ fontSize: 12, color: W + "0.45)", letterSpacing: 0.3, marginBottom: 16 }}>
            {who} {cr.kind === "wedding" ? "dreamed up" : "planned"} <span style={{ color: KINDS[cr.kind] ? KINDS[cr.kind].accent : VIOLET }}>{cr.title}</span> out loud
          </div>
        ) : (
          <div style={{ fontSize: 11, color: W + "0.4)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>stop typing</div>
        )}
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -2, lineHeight: 1.04, color: W + "0.96)" }}>
          say it out loud
        </div>
        <div style={{ fontSize: 14, color: W + "0.55)", marginTop: 12, lineHeight: 1.45 }}>
          {cr ? "now say yours. ai builds the plan." : "pick one. talk. ai builds you a real plan."}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
          {["trip", "wedding"].map(function(k) {
            var KK = KINDS[k];
            return (
              <button key={k} onClick={function() {
                setKind(k);
                window.drips && window.drips.played && window.drips.played({ picked: k });
                setStep("talk");
                setTimeout(startRecording, 350);
              }} style={{
                flex: 1, padding: "22px 14px", borderRadius: 18,
                background: CARD, border: "1px solid " + W + "0.06)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                <div style={{ fontSize: 30 }}>{KK.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: W + "0.9)" }}>{k}</div>
                <div style={{ fontSize: 10, color: KK.accent, letterSpacing: 0.5 }}>{KK.verb}</div>
              </button>
            );
          })}
        </div>
      </div>
    ));
  }

  // ——— TALK ———
  if (step === "talk") {
    if (typing) {
      return shell(screen(
        <div style={{ width: "100%", animation: "up 0.25s ease" }}>
          <div style={{ textAlign: "center", fontSize: 13, color: W + "0.5)", marginBottom: 16 }}>
            mic's off here — type it instead. {K.prompt}
          </div>
          <textarea value={text} autoFocus
            onChange={function(e) { setText(e.target.value); textRef.current = e.target.value; }}
            placeholder={K.examples[0]}
            style={{
              width: "100%", height: 150, padding: "16px 18px", background: CARD,
              border: "1px solid " + W + "0.07)", borderRadius: 14, color: W + "0.92)",
              fontSize: 16, lineHeight: 1.5, resize: "none", outline: "none",
            }} />
          <button onClick={build} style={{
            marginTop: 18, width: "100%", padding: "15px", borderRadius: 12,
            background: text.trim() ? accent : W + "0.06)", color: text.trim() ? BG : W + "0.2)",
            fontSize: 15, fontWeight: 800,
          }}>build my plan</button>
        </div>
      ));
    }
    return shell(screen(
      <div style={{ width: "100%", textAlign: "center", animation: "up 0.25s ease" }}>
        <div style={{ fontSize: 11, color: W + "0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
          {K.verb} {K.pick}
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: W + "0.85)", marginTop: 10, lineHeight: 1.3 }}>
          {recording ? "i'm listening…" : "tap to talk"}
        </div>
        <div style={{ fontSize: 13, color: W + "0.4)", marginTop: 6 }}>{K.prompt}</div>

        {/* mic */}
        <div style={{ position: "relative", width: 120, height: 120, margin: "28px auto 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {recording && [0, 1].map(function(i) {
            return <div key={i} style={{
              position: "absolute", width: 88, height: 88, borderRadius: "50%",
              border: "2px solid " + accent, animation: "ring 1.8s ease-out infinite",
              animationDelay: (i * 0.9) + "s",
            }} />;
          })}
          <button onClick={recording ? function() { stopRecording(); build(); } : startRecording} style={{
            width: 88, height: 88, borderRadius: "50%",
            background: recording ? accent : W + "0.06)",
            border: "2px solid " + (recording ? accent : W + "0.12)"),
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
          }}>{recording ? "⏹" : "🎙️"}</button>
        </div>

        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: recording ? accent : W + "0.3)", letterSpacing: 2, marginTop: 18 }}>
          {fmt(seconds)}
        </div>

        <div style={{
          marginTop: 16, padding: "13px 16px", borderRadius: 12, background: CARD,
          border: "1px solid " + W + "0.05)", minHeight: 64, maxHeight: 96, overflow: "hidden",
          textAlign: "left",
        }}>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: text ? W + "0.75)" : W + "0.22)", fontStyle: text ? "normal" : "italic" }}>
            {text || (recording ? "start talking…" : K.examples[1])}
          </div>
        </div>

        {recording && (
          <div style={{ fontSize: 12, color: W + "0.4)", marginTop: 14 }}>tap the square when you're done</div>
        )}
      </div>
    ));
  }

  // ——— RESULT ———
  return shell(screen(
    <div style={{ width: "100%", animation: "scaleIn 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>{K.emoji}</div>
        {loading ? (
          <div style={{ fontSize: 17, fontWeight: 700, color: accent, animation: "pulse 1.2s ease infinite", padding: "20px 0" }}>
            building your plan{"…"}
          </div>
        ) : (
          <div style={{ animation: "up 0.4s ease" }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.06, color: W + "0.96)" }}>
              {plan.title}
            </div>
            <div style={{ fontSize: 14, color: W + "0.6)", marginTop: 10, lineHeight: 1.45, fontStyle: "italic" }}>
              {plan.vibe}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 22, textAlign: "left" }}>
              {plan.highlights.slice(0, 3).map(function(h, i) {
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 15px",
                    borderRadius: 12, background: CARD, border: "1px solid " + W + "0.05)",
                    animation: "up 0.35s ease " + (0.15 + i * 0.12) + "s both",
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: accent + "22", color: accent, fontSize: 11, fontWeight: 800,
                      fontFamily: "'DM Mono', monospace",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 14.5, color: W + "0.85)", fontWeight: 500 }}>{h}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 9, color: W + "0.04)", textAlign: "center", marginTop: 26 }}>drips.me</div>
    </div>
  ));
}
