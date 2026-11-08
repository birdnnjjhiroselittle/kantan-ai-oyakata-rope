import { KNOTS, knotSvg } from "./knots.js";
import { checkKnot, askRope } from "./ai.js";

const $ = (id) => document.getElementById(id);
const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// ---- 状態 ----
let knot = null;
let stepIndex = 0;
let stream = null;
let mirrored = true;
let handLandmarker = null;
let rafId = 0;
let lastVideoTime = -1;
let prevPoints = null;
let motion = 1; // 手の動きの大きさ（なめらかにした値）
let stillSince = 0;
let lastCheckAt = 0;
let checking = false;
let handsSeen = false;
let demoMode = "hands"; // hands / fixed / off

// ---- 設定 ----
$("api-key").value = localStorage.getItem("apiKey") || "";
$("auto-check").checked = localStorage.getItem("autoCheck") !== "0";
$("voice-on").checked = localStorage.getItem("voiceOn") !== "0";
$("facing").value = localStorage.getItem("facing") || "user";
$("save-settings").onclick = () => {
  localStorage.setItem("apiKey", $("api-key").value.trim());
  localStorage.setItem("autoCheck", $("auto-check").checked ? "1" : "0");
  localStorage.setItem("voiceOn", $("voice-on").checked ? "1" : "0");
  localStorage.setItem("facing", $("facing").value);
  $("save-settings").textContent = "保存しました";
  setTimeout(() => ($("save-settings").textContent = "保存"), 1500);
};

function speak(text, { urgent = false } = {}) {
  if (!text || !$("voice-on").checked || !("speechSynthesis" in window)) return;
  if (urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  speechSynthesis.speak(u);
}

// ---- 1. 結び方をえらぶ ----
for (const k of KNOTS) {
  const card = document.createElement("div");
  card.className = "knot-card";
  const last = k.steps[k.steps.length - 1];
  card.innerHTML = `<img alt="" /><div><h3></h3><p class="use"></p><p class="ropes"></p><button>はじめる</button></div>`;
  card.querySelector("img").src = svgUrl(knotSvg({ ...last, pulls: [] }));
  card.querySelector("h3").innerHTML = `${k.emoji} <span></span><span class="level"></span>`;
  card.querySelector("h3 span").textContent = k.name;
  card.querySelector(".level").textContent = k.level;
  card.querySelector(".use").textContent = k.use;
  card.querySelector(".ropes").textContent = `持ち方：${k.ropes}`;
  card.querySelector("button").onclick = () => start(k);
  $("knot-list").appendChild(card);
}

// ---- 手の追跡（MediaPipe・スマホの中で動く） ----
async function loadHands() {
  if (handLandmarker) return handLandmarker;
  try {
    const base = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
    const { HandLandmarker, FilesetResolver } = await import(`${base}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${base}/wasm`);
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
  } catch (e) {
    console.warn("手の追跡を読み込めませんでした", e);
    $("hand-status").textContent = "手の追跡なし（見本は右上に表示）";
    handLandmarker = null;
  }
  return handLandmarker;
}

/** 映像の正規化座標 → 画面の座標（object-fit: cover と鏡写しを考える） */
function toScreen(p) {
  const v = $("video");
  const cw = v.clientWidth, ch = v.clientHeight;
  const vw = v.videoWidth || cw, vh = v.videoHeight || ch;
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const x = mirrored ? 1 - p.x : p.x;
  return { x: ox + x * vw * scale, y: oy + p.y * vh * scale };
}

function drawHands(hands) {
  const c = $("hands");
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== c.clientWidth * dpr) {
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
  }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, c.clientWidth, c.clientHeight);
  for (const h of hands) {
    for (const [i, p] of h.entries()) {
      const s = toScreen(p);
      g.beginPath();
      g.arc(s.x, s.y, i === 4 || i === 8 ? 6 : 3.5, 0, Math.PI * 2);
      g.fillStyle = i === 4 || i === 8 ? "#5eead4" : "rgba(94,234,212,.6)";
      g.fill();
    }
  }
}

function placeDemo(hands) {
  const img = $("demo");
  img.className = `demo ${demoMode === "hands" && hands.length ? "" : demoMode === "off" ? "off" : "fixed"}`;
  if (demoMode !== "hands" || !hands.length) return;
  // 両手の中指の付け根（9番）の真ん中に、手の幅に合わせて重ねる
  const pts = hands.map((h) => toScreen(h[9]));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const span = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 220;
  const w = Math.min(Math.max(span * 1.25, 200), window.innerWidth * 0.95);
  img.style.width = `${w}px`;
  img.style.left = `${cx - w / 2}px`;
  img.style.top = `${cy - w * 0.75 * 0.62}px`; // 図の結び目あたりが手の間に来るように
}

function trackMotion(hands, now) {
  const flat = hands.flat();
  if (prevPoints && prevPoints.length === flat.length && flat.length) {
    let d = 0;
    for (let i = 0; i < flat.length; i++) d += Math.hypot(flat[i].x - prevPoints[i].x, flat[i].y - prevPoints[i].y);
    motion = motion * 0.8 + (d / flat.length) * 0.2;
  } else {
    motion = 1;
  }
  prevPoints = flat;

  const canAuto = $("auto-check").checked && hands.length > 0 && !checking && now - lastCheckAt > 10000;
  if (canAuto && motion < 0.0035) {
    if (!stillSince) stillSince = now;
    const left = 3 - Math.floor((now - stillSince) / 1000);
    $("still-ring").classList.remove("hidden");
    $("still-count").textContent = String(Math.max(left, 1));
    if (now - stillSince > 3000) {
      stillSince = 0;
      $("still-ring").classList.add("hidden");
      runCheck();
    }
  } else {
    stillSince = 0;
    $("still-ring").classList.add("hidden");
  }
}

function loop() {
  const v = $("video");
  if (handLandmarker && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
    lastVideoTime = v.currentTime;
    const now = performance.now();
    const res = handLandmarker.detectForVideo(v, now);
    const hands = res.landmarks || [];
    drawHands(hands);
    placeDemo(hands);
    trackMotion(hands, now);
    $("hand-status").textContent = hands.length === 2 ? "✋✋ 両手が見えています" : hands.length === 1 ? "✋ 片手だけ見えています" : "✋ 手を画面に入れてください";
    if (hands.length && !handsSeen) {
      handsSeen = true;
      speakStep();
    }
  }
  rafId = requestAnimationFrame(loop);
}

// ---- ステップ ----
function renderStep() {
  const s = knot.steps[stepIndex];
  $("step-count").textContent = `${knot.name}　ステップ ${stepIndex + 1} / ${knot.steps.length}`;
  $("step-title").textContent = s.title;
  $("step-say").textContent = s.say;
  $("demo").src = svgUrl(knotSvg(s));
  $("result").classList.add("hidden");
}

function speakStep() {
  const s = knot.steps[stepIndex];
  speak(`ステップ${stepIndex + 1}。${s.title}。${s.say}`, { urgent: true });
}

function goStep(i) {
  if (i >= knot.steps.length) {
    showResult("ok", `🎉 ${knot.name}、完成です！`);
    speak(`${knot.name}、完成です。おつかれさまでした。もう一度練習するときは、戻るを押してください。`, { urgent: true });
    return;
  }
  if (i < 0) return;
  stepIndex = i;
  renderStep();
  speakStep();
}

function showResult(kind, text, ms = 9000) {
  $("result").className = `result ${kind}`;
  $("result").textContent = text;
  clearTimeout(showResult.t);
  if (ms) showResult.t = setTimeout(() => $("result").classList.add("hidden"), ms);
}

function grabFrame() {
  const v = $("video");
  if (!v.videoWidth) return null;
  const w = 960;
  const h = Math.round((v.videoHeight / v.videoWidth) * w);
  const c = $("grab");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(v, 0, 0, w, h); // 左右反転しない元の映像を送る
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}

// ---- これで良い？ ----
async function runCheck(question) {
  if (checking || !knot) return;
  const frame = grabFrame();
  if (!frame) return;
  checking = true;
  lastCheckAt = performance.now();
  $("check").disabled = true;
  showResult("wait", "🔍 見ています…そのまま止めていてください", 0);
  speak("見ています。", { urgent: true });
  try {
    const r = await checkKnot({ base64Jpeg: frame, knot, stepIndex, question });
    if (r.danger) {
      showResult("danger", `🛑 ${r.danger}`);
      speak(r.danger, { urgent: true });
      return;
    }
    if (r.result === "ok") {
      const last = stepIndex === knot.steps.length - 1;
      showResult("ok", `⭕ できています！ ${r.reason}`);
      speak(`できています。${r.reason}`, { urgent: true });
      setTimeout(() => goStep(stepIndex + 1), last ? 2500 : 3500);
    } else if (r.result === "fix") {
      showResult("fix", `🔧 ${r.reason} → ${r.howToFix}`);
      speak(`おしい。${r.reason}。${r.howToFix}`, { urgent: true });
    } else {
      showResult("unclear", `👀 ${r.reason} → ${r.howToFix}`);
      speak(`${r.reason}。${r.howToFix}`, { urgent: true });
    }
  } catch (e) {
    showResult("unclear", e.message);
  } finally {
    checking = false;
    lastCheckAt = performance.now();
    $("check").disabled = false;
  }
}

// ---- 始める・終わる ----
async function start(k) {
  knot = k;
  stepIndex = 0;
  handsSeen = false;
  const facing = localStorage.getItem("facing") || $("facing").value;
  mirrored = facing === "user";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    alert("カメラを使えませんでした。カメラを許可してください（https か localhost で開く必要があります）。");
    return;
  }
  $("video").srcObject = stream;
  $("video").classList.toggle("mirror", mirrored);
  $("screen-select").classList.remove("active");
  $("screen-live").classList.add("active");
  renderStep();
  $("hand-status").textContent = "手の追跡を準備中…";
  speak(`${k.name}を練習します。${k.ropes}ロープを持って、画面に手を入れてください。`);
  await loadHands();
  if (!handLandmarker) {
    demoMode = demoMode === "hands" ? "fixed" : demoMode;
    $("demo").className = `demo ${demoMode}`;
    $("demo-mode").textContent = MODE_LABEL[demoMode];
    speakStep();
  }
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function stop() {
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  speechSynthesis?.cancel();
  $("screen-live").classList.remove("active");
  $("screen-select").classList.add("active");
}

$("stop").onclick = stop;
$("prev").onclick = () => goStep(stepIndex - 1);
$("next").onclick = () => goStep(stepIndex + 1);
$("repeat").onclick = speakStep;
$("check").onclick = () => runCheck();
const MODE_LABEL = { hands: "見本：手に重ねる", fixed: "見本：右上", off: "見本：なし" };
$("demo-mode").onclick = () => {
  demoMode = { hands: "fixed", fixed: "off", off: "hands" }[demoMode];
  $("demo-mode").textContent = MODE_LABEL[demoMode];
  $("demo").className = `demo ${demoMode === "hands" ? "" : demoMode}`;
};

// ---- 声 ----
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$("mic").onclick = () => {
  if (!Recognition) return speak("このブラウザは音声入力に対応していません。");
  speechSynthesis?.cancel();
  const rec = new Recognition();
  rec.lang = "ja-JP";
  $("mic").textContent = "👂";
  rec.onresult = async (ev) => {
    const said = ev.results[0][0].transcript.trim();
    if (/^(次|つぎ)/.test(said)) return goStep(stepIndex + 1);
    if (/^(戻る|もどる|前)/.test(said)) return goStep(stepIndex - 1);
    if (/(もう一回|もう一度|繰り返し)/.test(said)) return speakStep();
    if (/(これで(良|い|よ)い|これでOK|合ってる|あってる|できた)/i.test(said)) return runCheck(said);
    showResult("wait", `🗣「${said}」`, 0);
    try {
      const r = await askRope({ question: said, base64Jpeg: grabFrame(), knot, stepIndex });
      showResult("unclear", `💬 ${r.answer}`);
      speak(r.answer, { urgent: true });
    } catch (e) {
      showResult("unclear", e.message);
    }
  };
  rec.onend = rec.onerror = () => ($("mic").textContent = "🎤");
  rec.start();
};
