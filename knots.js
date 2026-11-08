// 結び方のデータと、見本の図（SVG）
// 図は「スマホの画面＝鏡」で見たときの向き（利用者の右手が画面の右）で描いている。
// segs の z が大きいほど手前（上）を通る。重なりの上下はこの順番で表す。

const COLORS = { A: "#f59e0b", B: "#3b82f6" };

/** ステップの図をSVGの文字列にする */
export function knotSvg(step) {
  const segs = [...step.segs].sort((a, b) => a.z - b.z);
  const rope = segs
    .map((s) => {
      const color = COLORS[s.c];
      return [
        `<path d="${s.d}" fill="none" stroke="#111827" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<path d="${s.d}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
        `<path d="${s.d}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="3" stroke-dasharray="6 7" stroke-linecap="round"/>`,
        s.hl
          ? `<path d="${s.d}" fill="none" stroke="#fde047" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 10"><animate attributeName="stroke-dashoffset" from="40" to="0" dur="1s" repeatCount="indefinite"/></path>`
          : "",
      ].join("");
    })
    .join("");
  const ends = (step.ends || [])
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#dc2626" stroke="#111827" stroke-width="3"/>`)
    .join("");
  const arrow = step.arrow
    ? `<path d="${step.arrow}" fill="none" stroke="#fb923c" stroke-width="6" stroke-linecap="round" marker-end="url(#ah)" stroke-dasharray="14 9"><animate attributeName="stroke-dashoffset" from="46" to="0" dur="1.1s" repeatCount="indefinite"/></path>`
    : "";
  const pulls = (step.pulls || [])
    .map(([x, y, dir]) => {
      const dx = dir === "left" ? -50 : 50;
      return `<path d="M${x},${y} l${dx},0" stroke="#22c55e" stroke-width="7" stroke-linecap="round" marker-end="url(#ahg)"><animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/></path>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#fb923c"/></marker>
<marker id="ahg" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#22c55e"/></marker>
</defs>${rope}${ends}${arrow}${pulls}</svg>`;
}

// ---- 8の字結び ----
const F_STAND = { d: "M20,170 L250,170", z: 1, c: "A" };
const F_LOOP = { d: "M250,170 C330,170 330,70 250,70 C200,70 180,120 175,170 L172,235", z: 2, c: "A" };
const F_BACK = { d: "M172,235 C170,275 105,275 105,230 L105,100", z: 0, c: "A" };
const F_THRU1 = { d: "M105,100 C105,72 145,112 186,120 L292,132", z: 3, c: "A" };
const F_THRU2 = { d: "M292,132 L372,142", z: 0.5, c: "A" };

// ---- 本結び ----
const R2_A1 = { d: "M20,220 L150,220 C190,220 240,200 240,170", z: 2, c: "A" };
const R2_A2 = { d: "M240,170 C240,140 170,140 160,100", z: 0, c: "A" };
const R2_B = { d: "M380,220 L250,220 C210,220 160,200 160,170 C160,140 230,140 240,100", z: 1, c: "B" };

export const KNOTS = [
  {
    id: "fig8",
    name: "8の字結び",
    emoji: "8️⃣",
    level: "やさしい",
    use: "ロープの端が穴や金具から抜けないようにする「止め結び」。結びやすく、ほどきやすい。",
    ropes: "ロープ1本。左手でロープを持ち、右手で端（先のほう）を持つ。",
    steps: [
      {
        title: "輪を作る",
        say: "右手で持った端を、上に回して輪を作り、ロープの手前に重ねます。",
        check: "ロープの端が上に回って輪になり、輪の根元で、端がロープの手前（カメラ側）に重なっている",
        segs: [F_STAND, { ...F_LOOP, hl: true }],
        ends: [[172, 235]],
        arrow: "M305,160 C325,95 270,55 215,78",
      },
      {
        title: "端をロープの後ろに回す",
        say: "端を、ロープの後ろ側にぐるっと回して、上に出します。",
        check: "端がロープの後ろ（奥）を通って、上に出ている",
        segs: [F_STAND, F_LOOP, { ...F_BACK, hl: true }],
        ends: [[105, 100]],
        arrow: "M180,250 C165,285 110,280 110,215",
      },
      {
        title: "端を最初の輪に通す",
        say: "端を、最初に作った輪の中に、手前から奥へ通します。",
        check: "端が最初の輪の中を、手前から奥へ通っている。全体が数字の8の形に見える",
        segs: [F_STAND, F_LOOP, F_BACK, { ...F_THRU1, hl: true }, { ...F_THRU2, hl: true }],
        ends: [[372, 142]],
        arrow: "M116,92 C140,108 175,120 245,128",
      },
      {
        title: "両側を引いて締める",
        say: "ロープと端を左右に引いて、形を整えながら締めます。端は、指3本分くらい残します。",
        check: "結び目が締まって8の字の形が見え、端が短すぎない（指3本分くらい残っている）",
        segs: [F_STAND, F_LOOP, F_BACK, F_THRU1, F_THRU2],
        ends: [[372, 142]],
        pulls: [[70, 170, "left"], [330, 138, "right"]],
      },
    ],
  },
  {
    id: "reef",
    name: "本結び",
    emoji: "🎀",
    level: "ふつう",
    use: "2本のロープの端どうしをつなぐ・包みや荷物をしばる結び。ほどけにくく、ほどきやすい。※太さや材質がちがうロープどうしには向かない。",
    ropes: "ロープの両端（または2本のロープ）を、左右の手に1本ずつ持つ。",
    steps: [
      {
        title: "2本の端を重ねてXにする",
        say: "左手の端を、右手の端の上に重ねて、Xの形にします。",
        check: "2本の端がXの形に交差し、左手側の端が上（カメラ側）になっている",
        segs: [
          { d: "M20,200 L170,200 C215,200 235,160 260,110", z: 2, c: "A", hl: true },
          { d: "M380,200 L230,200 C185,200 165,160 140,110", z: 1, c: "B" },
        ],
        ends: [[260, 110], [140, 110]],
        arrow: "M175,218 C222,212 248,172 264,132",
      },
      {
        title: "下をくぐらせて、ひと絡げ",
        say: "上に重ねた端を、もう一方の下にくぐらせて、ひと絡げします。靴ひもの最初の結びと同じです。",
        check: "2本が1回絡み合っていて、両方の端が上を向いている",
        segs: [R2_A1, { ...R2_A2, hl: true }, R2_B],
        ends: [[160, 100], [240, 100]],
        arrow: "M252,165 C258,128 192,124 168,108",
      },
      {
        title: "逆向きに重ねて、もう一度絡げる",
        say: "今度は右手の端を、左手の端の上に重ねて、もう一度絡げます。1回目と、上にする側を逆にするのがコツです。",
        check: "2回目の交差では、右手側の端が上（カメラ側）になっている",
        segs: [
          R2_A1,
          R2_A2,
          R2_B,
          { d: "M160,100 C160,70 200,60 240,40", z: 2.5, c: "A" },
          { d: "M240,100 C240,70 200,60 160,40", z: 3, c: "B", hl: true },
        ],
        ends: [[240, 40], [160, 40]],
        arrow: "M255,95 C255,62 212,52 172,46",
      },
      {
        title: "引き締めて、形を確かめる",
        say: "両手で左右に引いて締めます。輪が2つ組み合って平らになれば本結びです。端が縦を向いていたら縦結びなので、ほどいてやり直します。",
        check: "2つの輪が互いにくぐり合って平らになり、それぞれの端が元のロープと平行になっている（端が縦を向く縦結びではない）",
        segs: [
          { d: "M20,125 L210,125 C245,125 245,175 210,175", z: 1, c: "A" },
          { d: "M210,175 L60,175", z: 3, c: "A" },
          { d: "M380,140 L190,140", z: 2, c: "B" },
          { d: "M190,140 C155,140 155,190 190,190 L340,190", z: 0, c: "B" },
        ],
        ends: [[60, 175], [340, 190]],
        pulls: [[60, 125, "left"], [340, 140, "right"]],
      },
    ],
  },
];
