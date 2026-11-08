// Claude API 呼び出し（結び目の確認と、質問への回答）
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.135.0";

const MODEL = "claude-opus-5-5";

function client() {
  const apiKey = localStorage.getItem("apiKey");
  if (!apiKey) throw new Error("設定でClaude APIキーを保存してください。");
  // 個人用の試作なので、利用者自身のキーでブラウザから直接呼び出す
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

async function askJson({ system, content, schema, effort = "medium" }) {
  const response = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("AIがこのリクエストに回答できませんでした。");
  if (response.stop_reason === "max_tokens") throw new Error("AIの回答が途中で切れました。もう一度お試しください。");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("AIから回答が返りませんでした。");
  return JSON.parse(text);
}

const BASE = [
  "あなたはロープワーク（ロープの結び方）を、横で見ながらやさしく教える先生です。",
  "画像は、スマホのインカメラで利用者を正面から写したもので、左右は反転していません。",
  "つまり『画像の右側にある手』が利用者の『左手』、『画像の左側にある手』が利用者の『右手』です。",
  "利用者に伝えるときは、必ず利用者から見た左右（右手・左手）で言うこと。",
  "『手前』は利用者の体から遠い側＝カメラ側、『奥』は利用者の体の側です。",
  "人の体重を支える、高い所で使う、首に巻くなどの危険な使い方を見たら、すぐに止めるよう伝えること。",
  "説明は中学生にも分かる、短い話し言葉で。",
].join("\n");

const stepText = (knot, i) => {
  const s = knot.steps[i];
  return [
    `結び方: ${knot.name}（${knot.use}）`,
    `持ち方: ${knot.ropes}`,
    `今のステップ（${i + 1}/${knot.steps.length}）: ${s.title}`,
    `やり方: ${s.say}`,
    `できた状態: ${s.check}`,
    knot.steps[i + 1] ? `次のステップ: ${knot.steps[i + 1].title}` : "これが最後のステップ",
  ].join("\n");
};

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["result", "reason", "howToFix", "danger"],
  properties: {
    result: { type: "string", enum: ["ok", "fix", "unclear"] },
    reason: { type: "string" },
    howToFix: { type: "string" },
    danger: { type: "string" },
  },
};

/** 今の手元の画像を見て、ステップどおりに結べているかを判定する */
export function checkKnot({ base64Jpeg, knot, stepIndex, question }) {
  return askJson({
    system: [
      BASE,
      "",
      "利用者が『これで良い？』と聞いているか、手を止めて確認を待っています。今のステップの『できた状態』になっているかを判定してください。",
      "- result: ok（できている）/ fix（直すところがある）/ unclear（ロープの重なりが見えず判断できない）",
      "- reason: 何を見てそう判断したか、1〜2文（例：右手の端が輪の中を手前から通っています）。",
      "- howToFix: fix のときは、どちらの手で、どこを、どう動かすかを1〜2文で。unclear のときは、どう見せれば判断できるか（ロープをカメラに近づける、手をずらして重なりを見せる、など）。ok なら空文字。",
      "- danger: 危険な使い方が見えたときだけ短い警告。なければ空文字。",
      "ロープの上下の重なりは間違えやすいので、見えていないところを推測で ok にしないこと。迷ったら unclear。",
    ].join("\n"),
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
      { type: "text", text: `${stepText(knot, stepIndex)}\n利用者の言葉: ${question || "（手を止めて待っている）"}` },
    ],
    schema: CHECK_SCHEMA,
  });
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
};

/** 結んでいる途中の質問に、手元の画像を見ながら答える */
export function askRope({ question, base64Jpeg, knot, stepIndex }) {
  const content = [];
  if (base64Jpeg) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } });
  content.push({ type: "text", text: `${stepText(knot, stepIndex)}\n質問: ${question}` });
  return askJson({
    system: [BASE, "", "結んでいる途中の質問に答えてください。answer は声で読み上げるので、2〜3文の話し言葉で、記号や箇条書きは使わない。"].join("\n"),
    content,
    schema: ANSWER_SCHEMA,
    effort: "low",
  });
}
