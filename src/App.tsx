import { useEffect, useMemo, useRef, useState } from "react";

type Choice = {
  id: number;
  text: string;
  scoreDelta: number;
  stateDelta: {
    oxygenSaturation?: number;
    respiratoryDistress?: number;
    anxiety?: number;
    stability?: number;
    pain?: number;
  };
  rationale: string;
  learningPoint: string;
  preferred?: boolean;
  dangerous?: boolean;
  resultLabel?: string;
};

type Turn = {
  turnNumber: number;
  title: string;
  description: string;
  hint: string;
  scanText: string;
  choices: Choice[];
};

type Patient = {
  name: string;
  age: number;
  sex: string;
  diagnosisHint: string;
  causeType: string;
  mentalStatus: string;
  respiratoryDistress: number;
  oxygenSaturation: number;
  respiratoryRate: number;
  heartRate: number;
  systolicBp: number;
  anxiety: number;
  pain: number;
  score: number;
  stability: number;
  usedHintCount: number;
  usedScanCount: number;
  usedForecastCount: number;
  comboStreak: number;
  turnsCleared: number;
  isDead: boolean;
};

type BasePatient = Omit<
  Patient,
  | "score"
  | "stability"
  | "usedHintCount"
  | "usedScanCount"
  | "usedForecastCount"
  | "comboStreak"
  | "turnsCleared"
  | "isDead"
>;

type CaseDef = {
  patient: BasePatient;
  turns: Turn[];
};

type GameState = {
  patient: Patient;
  turns: Turn[];
  history: string[];
  eventLog: string[];
};

type DeltaState = {
  label: string;
  score: number;
  oxygen: number;
  distress: number;
  stability: number;
  anxiety: number;
  status: "good" | "danger" | "mixed";
};

type FinalReport = {
  grade: string;
  summary: string;
  strengths: string[];
  improvements: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeChoice(
  text: string,
  scoreDelta: number,
  stateDelta: Choice["stateDelta"],
  rationale: string,
  learningPoint: string,
  meta: Partial<Choice> = {}
): Choice {
  return {
    id: 0,
    text,
    scoreDelta,
    stateDelta,
    rationale,
    learningPoint,
    preferred: false,
    dangerous: false,
    resultLabel: "",
    ...meta,
  };
}

function good(text: string, label: string): Choice {
  return makeChoice(
    text,
    18,
    { oxygenSaturation: 2, respiratoryDistress: -6, anxiety: -5, stability: 15 },
    "좋은 선택입니다. 지금 시점에서 가장 우선되는 생리적 문제와 팀 연결을 적절히 다뤘습니다.",
    "호흡곤란 환자는 ABC 우선순위에 따라 산소화, 재사정, 보고, 준비를 빠르게 연결해야 합니다.",
    { preferred: true, resultLabel: label }
  );
}

function mixed(text: string, label: string): Choice {
  return makeChoice(
    text,
    -9,
    { oxygenSaturation: -1, respiratoryDistress: 3, anxiety: -1, stability: -7 },
    "아쉬운 선택입니다. 완전히 틀린 행동은 아니지만, 지금 더 우선되는 판단을 뒤로 미뤘습니다.",
    "맞는 행동도 순서가 틀리면 환자 안전에 손해가 될 수 있습니다.",
    { resultLabel: label }
  );
}

function danger(text: string, label: string): Choice {
  return makeChoice(
    text,
    -14,
    { oxygenSaturation: -2, respiratoryDistress: 5, anxiety: 1, stability: -12 },
    "그럴듯하지만 위험한 선택입니다. 지금은 검사·환경·기록보다 즉각적인 감시와 연결이 더 중요합니다.",
    "원인 추정보다 실제 생리적 악화 대응과 조기 보고가 우선입니다.",
    { dangerous: true, resultLabel: label }
  );
}

function getRiskLabel(patient: Patient) {
  if (patient.isDead) return "치명";
  if (patient.oxygenSaturation <= 85 || patient.stability <= 20) return "위중";
  if (patient.oxygenSaturation <= 90 || patient.stability <= 40) return "불안정";
  if (patient.oxygenSaturation <= 94 || patient.stability <= 60) return "주의";
  return "안정";
}

function getRiskStyle(label: string) {
  switch (label) {
    case "치명":
      return {
        chip: "border-rose-500/40 bg-rose-500/15 text-rose-200",
        glow: "shadow-[0_0_40px_rgba(244,63,94,0.22)]",
      };
    case "위중":
      return {
        chip: "border-rose-400/40 bg-rose-400/10 text-rose-300",
        glow: "shadow-[0_0_35px_rgba(244,63,94,0.18)]",
      };
    case "불안정":
      return {
        chip: "border-orange-400/40 bg-orange-400/10 text-orange-300",
        glow: "shadow-[0_0_30px_rgba(251,146,60,0.16)]",
      };
    case "주의":
      return {
        chip: "border-amber-400/40 bg-amber-400/10 text-amber-300",
        glow: "shadow-[0_0_25px_rgba(251,191,36,0.14)]",
      };
    default:
      return {
        chip: "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
        glow: "shadow-[0_0_25px_rgba(34,211,238,0.12)]",
      };
  }
}

function evaluateGrade(patient: Patient) {
  if (patient.isDead) return "F";
  if (patient.score >= 70) return "S";
  if (patient.score >= 50) return "A";
  if (patient.score >= 30) return "B";
  if (patient.score >= 10) return "C";
  return "D";
}

function getCriticalState(patient: Patient) {
  return (
    patient.oxygenSaturation <= 82 ||
    patient.stability <= 10 ||
    patient.respiratoryDistress >= 95
  );
}

function getForecastText(choice: Choice) {
  if (choice.preferred) {
    return "이 선택은 현재 문제의 우선순위를 비교적 정확하게 다룰 가능성이 큽니다.";
  }
  if (choice.dangerous) {
    return "겉보기에는 그럴듯하지만, 지금 시점에서는 환자 악화나 대응 지연으로 이어질 가능성이 큽니다.";
  }
  return "완전히 틀리다고 보긴 어렵지만, 현재 상황에서 더 우선되는 판단이 있을 수 있습니다.";
}

function buildTurns(config: {
  intro: string;
  hint1: string;
  scan1: string;
  turn1Good: string;
  turn1MixedA: string;
  turn1Danger: string;
  turn1MixedB: string;
  scan2: string;
  turn2Good: string;
  turn2MixedA: string;
  turn2Danger: string;
  turn2MixedB: string;
  scan3: string;
  turn3Good: string;
  turn3MixedA: string;
  turn3Danger: string;
  turn3MixedB: string;
  scan4: string;
  turn4Good: string;
  turn4MixedA: string;
  turn4Danger: string;
  turn4MixedB: string;
  scan5: string;
  turn5Good: string;
  turn5MixedA: string;
  turn5MixedB: string;
  turn5Danger: string;
}): Turn[] {
  return [
    {
      turnNumber: 1,
      title: "초기 인지 및 즉시 대응",
      description: config.intro,
      hint: config.hint1,
      scanText: config.scan1,
      choices: [
        good(config.turn1Good, "초기 안정화"),
        mixed(config.turn1MixedA, "우선순위 지연"),
        danger(config.turn1Danger, "위험한 지연"),
        mixed(config.turn1MixedB, "부분적 대응"),
      ],
    },
    {
      turnNumber: 2,
      title: "재사정과 즉시 보고",
      description:
        "초기 대응 후에도 환자는 완전히 안정되지 않았습니다. 현재 상태를 다시 보고 팀과 연결해야 하는 시점입니다.",
      hint: "좋은 초기 중재 뒤에는 재사정과 보고가 반드시 따라야 합니다.",
      scanText: config.scan2,
      choices: [
        good(config.turn2Good, "보고 완료"),
        mixed(config.turn2MixedA, "추세 관찰 우선"),
        danger(config.turn2Danger, "보고 지연"),
        mixed(config.turn2MixedB, "정리 우선"),
      ],
    },
    {
      turnNumber: 3,
      title: "악화 대비 준비",
      description:
        "의료진이 곧 올 예정입니다. 환자는 아직 숨이 편하지 않고, 추가 악화 가능성도 남아 있습니다.",
      hint: "지금은 혼자 해결하려 하기보다 악화 대비를 강화해야 합니다.",
      scanText: config.scan3,
      choices: [
        good(config.turn3Good, "준비 완료"),
        mixed(config.turn3MixedA, "관찰 중심"),
        danger(config.turn3Danger, "감시 축소"),
        mixed(config.turn3MixedB, "보조 중재 우선"),
      ],
    },
    {
      turnNumber: 4,
      title: "갑작스러운 변화 인지",
      description:
        "환자가 갑자기 더 힘들어 보이고 말수도 줄었습니다. 작은 변화처럼 보여도 놓치면 위험할 수 있습니다.",
      hint: "갑작스러운 변화는 즉시 재사정과 공유로 이어져야 합니다.",
      scanText: config.scan4,
      choices: [
        good(config.turn4Good, "악화 포착"),
        mixed(config.turn4MixedA, "추가 관찰 우선"),
        danger(config.turn4Danger, "위험한 가정"),
        danger(config.turn4MixedB, "보조 행동 우선"),
      ],
    },
    {
      turnNumber: 5,
      title: "최종 안전 유지",
      description:
        "추가 지시를 기다리는 마지막 구간입니다. 지금은 화려한 처치보다 지속 감시와 즉시 대응 준비가 중요합니다.",
      hint: "마지막 단계의 정답은 대개 곁 지키기와 감시 유지에 가깝습니다.",
      scanText: config.scan5,
      choices: [
        good(config.turn5Good, "안전 유지"),
        mixed(config.turn5MixedA, "기록 우선"),
        mixed(config.turn5MixedB, "정서 중재 우선"),
        danger(config.turn5Danger, "감시 완화"),
      ],
    },
  ];
}

const BASE_CASES: CaseDef[] = [
  {
    patient: {
      name: "김민수",
      age: 68,
      sex: "남성",
      diagnosisHint: "폐렴으로 입원 중",
      causeType: "pneumonia",
      mentalStatus: "불안하지만 의식은 명료함",
      respiratoryDistress: 62,
      oxygenSaturation: 88,
      respiratoryRate: 30,
      heartRate: 112,
      systolicBp: 138,
      anxiety: 72,
      pain: 3,
    },
    turns: buildTurns({
      intro:
        "68세 남성 환자 김민수님은 폐렴으로 입원 중입니다. 환자는 숨이 차다고 말하며 거친 호흡을 보입니다. 현재 SpO2 88%, RR 30/min, HR 112/min입니다.",
      hint1: "호흡곤란 환자는 체위와 산소화부터 봐야 합니다.",
      scan1: "청진 시 crackles가 들리고 산소화 저하가 우선 문제입니다.",
      turn1Good: "환자를 반좌위로 올리고 산소 공급을 즉시 준비하며 SpO2를 재확인한다.",
      turn1MixedA: "불안 완화와 병력 확인을 먼저 하고 체위 조정은 조금 뒤에 다시 본다.",
      turn1Danger: "chest X-ray와 ABGA를 먼저 준비한 뒤 결과를 보고 대응 강도를 조절한다.",
      turn1MixedB: "기관지확장제 가능성을 먼저 생각하며 흡입제 사용력을 확인한다.",
      scan2: "기침과 누런 가래가 관찰됩니다. 폐렴 악화 가능성을 고려한 신속한 보고가 필요합니다.",
      turn2Good: "활력징후와 호흡음을 재사정하고 담당 의료진에게 상태 변화를 즉시 보고한다.",
      turn2MixedA: "산소를 유지한 채 10분 정도 더 추세를 본 뒤 한 번에 보고한다.",
      turn2Danger: "산소 유량을 단계적으로 더 올려 반응을 확인한 뒤 그 결과만 보고한다.",
      turn2MixedB: "응급카트 위치와 흡인 장비를 먼저 다시 확인한다.",
      scan3: "분비물이 늘고 있으며 산소를 하고 있어도 숨이 편하지 않습니다.",
      turn3Good: "필요한 흡인·산소·모니터 장비를 점검하고 즉시 사용할 수 있게 준비한다.",
      turn3MixedA: "현재 산소 공급이 유지되므로 추가 준비보다 경과를 더 본다.",
      turn3Danger: "환자 불안을 줄이기 위해 알람 민감도와 화면 노출을 최소화한다.",
      turn3MixedB: "복식호흡 교육을 계속하며 다른 처치 준비를 나중에 한다.",
      scan4: "입술이 창백하고 보조호흡근 사용이 더 뚜렷해졌습니다.",
      turn4Good: "SpO2와 호흡양상을 즉시 다시 확인하고 악화 소견을 의료진과 팀에 바로 공유한다.",
      turn4MixedA: "산소 적용 후 반응이 있는지 5분 정도 더 관찰한 뒤 보고한다.",
      turn4Danger: "불안에 의한 과호흡 가능성을 먼저 보고 자극을 줄여 반응을 본다.",
      turn4MixedB: "구강 간호와 소량 수분 섭취를 먼저 시행하고 전체 평가는 잠시 뒤 다시 한다.",
      scan5: "산소는 유지 중이며 불안과 호흡곤란은 함께 움직이고 있습니다.",
      turn5Good: "환자 곁을 지키며 산소화와 의식 상태를 지속 관찰하고 추가 지시에 즉시 대응할 준비를 유지한다.",
      turn5MixedA: "현재 처치와 반응을 기록으로 먼저 정리한 다음 다시 관찰한다.",
      turn5MixedB: "언어적 안정을 충분히 하면서 객관적 재평가는 조금 뒤로 미룬다.",
      turn5Danger: "휴식 환경을 만들기 위해 모니터 알람과 주변 자극을 줄인다.",
    }),
  },
  {
    patient: {
      name: "이정희",
      age: 74,
      sex: "여성",
      diagnosisHint: "심부전 병력 있으며 누우면 호흡곤란 악화",
      causeType: "heart_failure",
      mentalStatus: "짧게 대답 가능하나 불안함",
      respiratoryDistress: 66,
      oxygenSaturation: 87,
      respiratoryRate: 32,
      heartRate: 118,
      systolicBp: 156,
      anxiety: 67,
      pain: 2,
    },
    turns: buildTurns({
      intro:
        "74세 여성 환자 이정희님은 심부전 병력이 있습니다. 누우면 숨이 더 차다고 호소하며 반듯이 눕혀져 있는 상태입니다. SpO2 87%, RR 32/min입니다.",
      hint1: "누우면 더 힘든 호흡곤란은 체위가 핵심 단서입니다.",
      scan1: "기좌호흡 양상과 수포음이 의심됩니다. 체위 변경과 산소화 보조가 먼저입니다.",
      turn1Good: "환자를 반좌위로 올리고 산소화 상태를 재확인하며 즉시 모니터링한다.",
      turn1MixedA: "이뇨제 반응과 소변량, 체중 변화를 먼저 정리한다.",
      turn1Danger: "portable chest X-ray와 BNP 채혈 준비를 먼저 하고 결과를 본 뒤 대응한다.",
      turn1MixedB: "호흡패턴을 조금 더 관찰해 비침습적 호흡 보조 필요성부터 판단한다.",
      scan2: "말초가 약간 차고 폐울혈 양상이 의심됩니다. 바로 보고해야 할 상태 변화입니다.",
      turn2Good: "호흡음을 재사정하고 의료진에게 즉시 상태 변화를 보고한다.",
      turn2MixedA: "산소 유지와 반좌위를 유지한 채 5~10분 추세를 더 확인한다.",
      turn2Danger: "보고 전에 산소 유량과 체위를 조금 더 조절해 반응을 먼저 본다.",
      turn2MixedB: "I/O, 부종, 체중 변화를 더 정리한 뒤 SBAR로 한 번에 보고한다.",
      scan3: "수포음이 남아 있고 말수가 줄면 호흡 피로를 의심해야 합니다.",
      turn3Good: "추가 악화에 대비해 산소·흡인·모니터 환경을 다시 점검하고 환자 곁을 지킨다.",
      turn3MixedA: "현재는 조금 나아 보여 호흡 패턴이 얼마나 안정되는지 더 지켜본다.",
      turn3Danger: "비침습적 호흡 보조 장비를 찾으러 잠시 자리를 비운다.",
      turn3MixedB: "수분·염분 상태와 식이, I/O 기록을 우선 다시 점검한다.",
      scan4: "보조호흡근 사용이 더 뚜렷하고 말초도 차갑습니다.",
      turn4Good: "즉시 호흡 양상과 SpO2를 다시 확인하고 악화 소견을 바로 전달한다.",
      turn4MixedA: "호흡 코칭과 안정을 먼저 시도한 뒤 수치 변화가 계속되면 보고한다.",
      turn4Danger: "혈압과 산소포화도 변화를 조금 더 길게 관찰해 일시적 변화인지 본다.",
      turn4MixedB: "알람과 자극이 불안을 키운다고 보고 주변을 조용하게 만든다.",
      scan5: "체위를 유지하고 곁을 지킬 때 상대적으로 호흡이 덜 흔들립니다.",
      turn5Good: "환자 곁에서 체위를 유지하며 산소화·의식·호흡 상태를 지속 관찰하고 즉시 대응 준비를 유지한다.",
      turn5MixedA: "현재 처치와 반응을 정리해 기록을 먼저 마무리한다.",
      turn5MixedB: "불안이 호흡을 흔든다고 보고 언어적 안정과 호흡 코칭에 더 집중한다.",
      turn5Danger: "휴식 환경을 만들기 위해 모니터 알람과 주변 자극을 줄인다.",
    }),
  },
  {
    patient: {
      name: "박서준",
      age: 57,
      sex: "남성",
      diagnosisHint: "COPD 악화 의심으로 입원 중",
      causeType: "copd",
      mentalStatus: "짧은 문장만 가능하고 초조함",
      respiratoryDistress: 70,
      oxygenSaturation: 86,
      respiratoryRate: 31,
      heartRate: 116,
      systolicBp: 144,
      anxiety: 74,
      pain: 2,
    },
    turns: buildTurns({
      intro:
        "57세 남성 환자 박서준님은 COPD 악화 의심으로 입원 중입니다. 환자는 숨이 차고 입술 오므리기 호흡을 보입니다. SpO2 86%, RR 31/min입니다.",
      hint1: "기저질환이 보여도 지금 우선순위는 호흡 안정입니다.",
      scan1: "천명음이 들리며 불안이 높습니다. 기도 개방과 산소화, 자세가 우선입니다.",
      turn1Good: "환자를 편한 자세로 세우고 산소화와 호흡양상을 즉시 재평가한다.",
      turn1MixedA: "평소 사용 흡입제와 최근 객담 양상을 자세히 확인한다.",
      turn1Danger: "nebulizer를 먼저 준비하고 효과를 본 뒤 체위와 보고를 결정한다.",
      turn1MixedB: "과호흡이 불안 때문일 수 있으니 호흡 코칭을 충분히 한다.",
      scan2: "천명음이 지속되고 불안도 높습니다. 상태 변화 연결이 필요합니다.",
      turn2Good: "활력징후와 호흡음을 재사정하고 의료진에게 즉시 보고한다.",
      turn2MixedA: "산소를 유지한 채 5분 정도 더 관찰해 추세를 보고한다.",
      turn2Danger: "기관지확장제 반응을 먼저 보고 의료진에게 전달하려고 보고를 늦춘다.",
      turn2MixedB: "호흡기 장비와 흡인 카트를 다시 찾으러 잠시 자리를 비운다.",
      scan3: "산소 중에도 편하지 않다고 호소합니다. 추가 처치 대비가 필요합니다.",
      turn3Good: "산소·흡인·모니터 장비를 점검하고 즉시 사용할 수 있게 준비한다.",
      turn3MixedA: "조금 더 관찰하면서 어떤 패턴으로 숨이 차는지 본다.",
      turn3Danger: "환자 불안을 줄이기 위해 알람 민감도와 화면 노출을 줄인다.",
      turn3MixedB: "복식호흡 연습을 혼자 계속하게 하고 그동안 다른 업무를 본다.",
      scan4: "보조호흡근 사용이 더 두드러지고 호흡이 얕고 빠릅니다.",
      turn4Good: "SpO2와 호흡양상을 즉시 다시 확인하고 악화 소견을 바로 공유한다.",
      turn4MixedA: "산소 적용 후 반응이 있는지 조금 더 본 뒤 한 번에 보고한다.",
      turn4Danger: "불안이 과호흡을 유발한다고 보고 자극을 줄여 반응을 본다.",
      turn4MixedB: "소량 수분과 구강 간호를 먼저 시행해 불편감을 줄인다.",
      scan5: "불안과 호흡곤란이 함께 움직입니다. 객관적 감시를 늦추면 안 됩니다.",
      turn5Good: "환자 곁을 지키며 산소화와 의식 상태를 지속 관찰하고 즉시 대응 준비를 유지한다.",
      turn5MixedA: "현재 반응을 먼저 기록으로 정리한 뒤 다시 관찰한다.",
      turn5MixedB: "호흡 코칭과 언어적 안정을 계속하면서 재사정 간격을 조금 늘린다.",
      turn5Danger: "조용한 환경을 위해 알람과 주변 자극을 줄인다.",
    }),
  },
  {
    patient: {
      name: "최수연",
      age: 41,
      sex: "여성",
      diagnosisHint: "수술 후 흡인성 폐렴 의심",
      causeType: "aspiration",
      mentalStatus: "불안하고 가래 때문에 말 끊김",
      respiratoryDistress: 64,
      oxygenSaturation: 89,
      respiratoryRate: 29,
      heartRate: 110,
      systolicBp: 132,
      anxiety: 70,
      pain: 4,
    },
    turns: buildTurns({
      intro:
        "41세 여성 환자 최수연님은 수술 후 회복 중이며 갑자기 기침과 젖은 목소리, 호흡곤란을 보입니다. 흡인성 폐렴이 의심됩니다.",
      hint1: "흡인 의심 상황에서도 우선은 자세와 산소화, 안전 확보입니다.",
      scan1: "분비물이 많고 기침 후에도 숨차함이 남아 있습니다. 기도 보호와 산소화가 우선입니다.",
      turn1Good: "환자를 세우고 기도 보호에 유리한 자세를 취하게 한 뒤 산소화 상태를 즉시 확인한다.",
      turn1MixedA: "무엇을 흡인했는지, 언제부터 기침했는지 자세한 병력을 먼저 확인한다.",
      turn1Danger: "흉부 X-ray와 객담 검사 준비를 먼저 하며 상태를 본다.",
      turn1MixedB: "불안으로 기침이 심해졌을 수 있어 호흡 코칭부터 충분히 한다.",
      scan2: "가래 소리와 젖은 호흡음이 들립니다. 상태 변화를 빠르게 연결해야 합니다.",
      turn2Good: "활력징후와 호흡음을 재사정하고 흡인 의심 악화를 즉시 보고한다.",
      turn2MixedA: "산소 유지 후 5~10분 추세를 더 보고 정리해서 한 번에 보고한다.",
      turn2Danger: "흡인 후 폐합병증 여부를 보기 위해 검사 결과를 먼저 모으고 보고한다.",
      turn2MixedB: "흡인 장비와 구강 간호 물품을 정리하러 잠시 자리를 비운다.",
      scan3: "분비물이 남아 있고 산소 중에도 편하지 않습니다.",
      turn3Good: "필요한 흡인·산소·모니터 장비를 점검하고 즉시 사용할 수 있게 준비한다.",
      turn3MixedA: "조금 더 지켜보며 기침 후 분비물이 얼마나 줄어드는지 관찰한다.",
      turn3Danger: "환자 불안을 줄이기 위해 알람과 화면 노출을 줄인다.",
      turn3MixedB: "구강 간호를 천천히 진행하며 환자가 스스로 기침으로 정리하게 기다린다.",
      scan4: "젖은 호흡음이 더 뚜렷하고 표정이 불안해졌습니다.",
      turn4Good: "SpO2와 호흡양상을 즉시 다시 확인하고 악화 소견을 바로 공유한다.",
      turn4MixedA: "기침 후 가래가 더 나오면 나아질 수 있어 잠시 더 관찰한 뒤 보고한다.",
      turn4Danger: "불안으로 기침이 더 심해졌다고 보고 자극을 줄여 반응을 본다.",
      turn4MixedB: "구강 내 분비물 정리를 먼저 천천히 하고 전체 상태 평가는 잠시 뒤 한다.",
      scan5: "분비물과 불안이 함께 호흡을 흔듭니다. 객관적 감시가 중요합니다.",
      turn5Good: "환자 곁을 지키며 산소화와 의식 상태를 지속 관찰하고 즉시 대응 준비를 유지한다.",
      turn5MixedA: "현재 처치와 반응을 우선 기록으로 정리하고 다시 관찰한다.",
      turn5MixedB: "언어적 안정과 기침 코칭을 계속하며 재사정 간격을 조금 늘린다.",
      turn5Danger: "조용한 환경을 위해 알람과 자극을 줄이고 큰 변화가 있을 때만 집중한다.",
    }),
  },
  {
    patient: {
      name: "한도윤",
      age: 29,
      sex: "남성",
      diagnosisHint: "천식 악화로 응급실 경유 입원",
      causeType: "asthma",
      mentalStatus: "짧은 문장만 말하며 초조함",
      respiratoryDistress: 72,
      oxygenSaturation: 85,
      respiratoryRate: 33,
      heartRate: 124,
      systolicBp: 136,
      anxiety: 78,
      pain: 1,
    },
    turns: buildTurns({
      intro:
        "29세 남성 환자 한도윤님은 천식 악화로 입원했습니다. 환자는 문장을 끝까지 말하지 못하고 천명음과 호흡곤란을 보입니다.",
      hint1: "호흡 부담을 줄이고 산소화와 자세를 먼저 봐야 합니다.",
      scan1: "천명음이 뚜렷하며 보조호흡근 사용이 관찰됩니다. 즉시 호흡 안정화가 필요합니다.",
      turn1Good: "환자를 편한 자세로 세우고 산소화와 호흡양상을 즉시 재평가한다.",
      turn1MixedA: "평소 흡입제 사용법과 최근 유발 요인을 자세히 확인한 뒤 대응 강도를 정한다.",
      turn1Danger: "흡입치료 약물 준비와 반응 관찰을 먼저 하고 자세 조정은 잠시 미룬다.",
      turn1MixedB: "불안이 심하므로 언어적 안정과 호흡 코칭만 우선 충분히 한다.",
      scan2: "보조호흡근 사용이 계속되고 불안도 큽니다. 팀 연결이 필요합니다.",
      turn2Good: "활력징후와 호흡음을 재사정하고 의료진에게 즉시 보고한다.",
      turn2MixedA: "5분 정도 더 관찰해 천명음과 산소포화도 추세를 확인한 뒤 보고한다.",
      turn2Danger: "흡입치료 반응을 조금 더 보고 의료진에게 전달하려고 보고를 늦춘다.",
      turn2MixedB: "응급 흡인과 장비 배치를 다시 맞추기 위해 잠시 자리를 비운다.",
      scan3: "산소 중에도 편하지 않다고 호소합니다. 추가 처치 대비가 필요합니다.",
      turn3Good: "산소·모니터·응급 장비를 점검하고 즉시 사용할 수 있게 준비한다.",
      turn3MixedA: "조금 더 관찰하면서 어떤 패턴으로 호흡이 흔들리는지 본다.",
      turn3Danger: "불안을 줄이기 위해 알람 민감도와 화면 노출을 낮춘다.",
      turn3MixedB: "복식호흡 교육을 혼자 계속하게 하고 그동안 다른 업무를 본다.",
      scan4: "보조호흡근 사용이 더 두드러지고 천명음도 커졌습니다.",
      turn4Good: "SpO2와 호흡양상을 즉시 다시 확인하고 악화 소견을 바로 공유한다.",
      turn4MixedA: "조금 더 관찰해 일시적 과호흡인지 확인한 뒤 한 번에 보고한다.",
      turn4Danger: "불안이 심해져 과호흡이 온 것으로 보고 자극을 줄여 반응을 본다.",
      turn4MixedB: "물 한 모금과 구강 간호로 불편감을 먼저 줄인다.",
      scan5: "불안과 호흡곤란이 함께 움직입니다. 객관적 감시를 늦추면 안 됩니다.",
      turn5Good: "환자 곁을 지키며 산소화와 의식 상태를 지속 관찰하고 즉시 대응 준비를 유지한다.",
      turn5MixedA: "현재 반응을 먼저 기록으로 정리한 뒤 다시 관찰한다.",
      turn5MixedB: "호흡 코칭과 언어적 안정을 계속하면서 재사정 간격을 조금 늘린다.",
      turn5Danger: "조용한 환경을 위해 알람과 주변 자극을 줄이고 큰 변화가 있을 때만 집중한다.",
    }),
  },
  {
    patient: {
      name: "유하린",
      age: 63,
      sex: "여성",
      diagnosisHint: "패혈증 의심과 함께 호흡곤란 발생",
      causeType: "sepsis",
      mentalStatus: "조금 멍하고 불안해함",
      respiratoryDistress: 67,
      oxygenSaturation: 89,
      respiratoryRate: 30,
      heartRate: 122,
      systolicBp: 98,
      anxiety: 65,
      pain: 3,
    },
    turns: buildTurns({
      intro:
        "63세 여성 환자 유하린님은 감염 의심 상태로 입원 중이며 현재 호흡곤란과 빈맥, 저혈압 경향을 보입니다. 환자는 조금 멍하고 불안해합니다.",
      hint1: "호흡곤란이 보이면 원인과 별개로 먼저 산소화와 즉시 사정이 필요합니다.",
      scan1: "감염 징후와 함께 순환 불안정 가능성도 보입니다. 호흡과 전반적 상태를 함께 봐야 합니다.",
      turn1Good: "환자를 안전한 자세로 조정하고 산소화와 활력징후를 즉시 재평가한다.",
      turn1MixedA: "혈액배양과 젖산 검사를 우선 준비한 뒤 호흡 상태를 다시 정리한다.",
      turn1Danger: "수액 반응과 체온 추세를 더 확인하기 위해 잠시 상태를 지켜본다.",
      turn1MixedB: "혼돈이 보여 신경학적 상태를 자세히 사정한 뒤 호흡과 순환을 다시 본다.",
      scan2: "맥박이 빠르고 혈압도 좋지 않습니다. 빠른 보고가 중요합니다.",
      turn2Good: "활력징후와 의식 상태를 재사정하고 의료진에게 즉시 보고한다.",
      turn2MixedA: "5분 정도 추세를 더 확인해 보고 내용을 더 정리한 뒤 전달한다.",
      turn2Danger: "수액 반응이나 체온 변화를 조금 더 보고 나서 패혈증 악화 여부를 전달한다.",
      turn2MixedB: "혈액배양과 채혈 준비를 먼저 완전히 끝내고 나서 보고한다.",
      scan3: "산소 중에도 불편감을 호소하며 활력징후가 불안정합니다.",
      turn3Good: "산소·모니터·응급 장비를 점검하고 즉시 사용할 수 있게 준비한다.",
      turn3MixedA: "조금 더 관찰하며 혈압과 맥박이 어떤 패턴으로 흔들리는지 본다.",
      turn3Danger: "불안을 줄이기 위해 알람과 주변 자극을 줄인다.",
      turn3MixedB: "수액 준비와 기록 정리를 먼저 해두고 환자 관찰은 조금 뒤 이어간다.",
      scan4: "의식 저하 경향과 호흡 악화, 순환 불안정 소견이 보입니다.",
      turn4Good: "SpO2, 의식, 활력징후를 즉시 다시 확인하고 악화 소견을 바로 공유한다.",
      turn4MixedA: "혈압과 맥박이 일시적 변화인지 조금 더 관찰한 뒤 보고한다.",
      turn4Danger: "불안으로 인한 과호흡과 혼돈일 수 있으니 환경을 조용하게 하고 반응을 본다.",
      turn4MixedB: "채혈과 기록을 먼저 정리해 이후 설명을 더 명확히 준비한다.",
      scan5: "의식과 호흡, 활력징후가 함께 흔들릴 수 있습니다. 객관적 감시가 중요합니다.",
      turn5Good: "환자 곁을 지키며 산소화와 의식 상태를 지속 관찰하고 즉시 대응 준비를 유지한다.",
      turn5MixedA: "현재 반응을 기록으로 정리한 뒤 다시 관찰한다.",
      turn5MixedB: "환자가 불안해하니 언어적 안정을 계속하며 재사정 간격을 조금 늘린다.",
      turn5Danger: "조용한 환경을 위해 알람과 주변 자극을 줄이고 큰 변화가 있을 때만 본다.",
    }),
  },
];

function randomizeTurnChoices(turns: Turn[]): Turn[] {
  return turns.map((turn) => ({
    ...turn,
    choices: shuffle(turn.choices).map((choice, index) => ({
      ...choice,
      id: index + 1,
    })),
  }));
}

function createInitialGame(): GameState {
  const selected = BASE_CASES[Math.floor(Math.random() * BASE_CASES.length)];
  return {
    patient: {
      ...selected.patient,
      score: 0,
      stability: 50,
      usedHintCount: 0,
      usedScanCount: 0,
      usedForecastCount: 0,
      comboStreak: 0,
      turnsCleared: 0,
      isDead: false,
    },
    turns: randomizeTurnChoices(selected.turns),
    history: [],
    eventLog: [`케이스 생성 완료: ${selected.patient.diagnosisHint}`],
  };
}

function buildFinalSummary(patient: Patient): FinalReport {
  const grade = evaluateGrade(patient);
  if (grade === "S") {
    return {
      grade,
      summary:
        "우선순위 판단이 매우 좋았습니다. 산소화, 재사정, 지속 관찰을 자연스럽게 연결해 환자 안전을 잘 지켰습니다.",
      strengths: ["초기 대응 우선순위가 적절함", "보고와 재사정을 잘 연결함"],
      improvements: ["힌트 없이 풀어보기", "각 턴에서 위험 신호를 더 빨리 포착하기"],
    };
  }
  if (grade === "A") {
    return {
      grade,
      summary:
        "전반적으로 좋은 판단이었습니다. 다만 몇몇 선택에서 조금 더 빠른 연결과 관찰이 있었으면 더 완성도 높았습니다.",
      strengths: ["큰 우선순위는 맞게 판단함", "환자 안전을 크게 해치지 않음"],
      improvements: ["지연되는 행동 줄이기", "부분적으로 아쉬운 선택 줄이기"],
    };
  }
  if (grade === "B") {
    return {
      grade,
      summary:
        "기본 흐름은 이해하고 있었지만, 보고 시점과 악화 대비에서 아쉬움이 있었습니다.",
      strengths: ["상황을 완전히 반대로 보지는 않음", "일부 적절한 판단을 수행함"],
      improvements: ["재사정과 보고를 더 빠르게 하기", "겉보기 안정보다 실제 위험도 보기"],
    };
  }
  if (grade === "C") {
    return {
      grade,
      summary:
        "임상 판단의 큰 방향은 보였지만 우선순위가 자주 흔들렸습니다. 환자 안전 중심으로 다시 정리할 필요가 있습니다.",
      strengths: ["상황 참여는 유지함", "일부 근거를 생각하며 선택함"],
      improvements: ["ABC 우선순위 강화", "위험한 선택 피하기"],
    };
  }
  return {
    grade,
    summary:
      "환자 상태가 위중해졌고, 당신의 선택이 그 악화에 영향을 주었습니다. 산소화, 재사정, 지속 관찰의 우선순위를 다시 점검해야 합니다.",
    strengths: ["시나리오를 끝까지 시도함", "결정의 결과를 확인함"],
    improvements: ["위험한 선택 피하기", "초기 대응을 더 빠르고 안전하게 하기"],
  };
}

function getCaseTag(causeType: string) {
  switch (causeType) {
    case "pneumonia":
      return "폐렴";
    case "heart_failure":
      return "심부전";
    case "copd":
      return "COPD";
    case "aspiration":
      return "흡인 의심";
    case "asthma":
      return "천식";
    case "sepsis":
      return "패혈증";
    default:
      return "호흡곤란";
  }
}

function ProgressBar({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: "positive" | "negative";
}) {
  const color =
    kind === "positive"
      ? value >= 70
        ? "bg-emerald-400"
        : value >= 40
          ? "bg-amber-400"
          : "bg-rose-400"
      : value >= 70
        ? "bg-rose-400"
        : value >= 40
          ? "bg-amber-400"
          : "bg-emerald-400";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-100">{value}/100</p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function VitalCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-sm text-slate-400">{sub}</p>
    </div>
  );
}

function PatientVisual({
  patient,
  patientFx,
  riskLabel,
}: {
  patient: Patient;
  patientFx: "idle" | "cough" | "relief" | "tense";
  riskLabel: string;
}) {
  const skinTone = patient.sex === "여성" ? "#f1c4b1" : "#ddb097";
  const gownColor =
    patient.causeType === "heart_failure"
      ? "#7c3aed"
      : patient.causeType === "copd"
        ? "#0f766e"
        : patient.causeType === "asthma"
          ? "#2563eb"
          : patient.causeType === "sepsis"
            ? "#9333ea"
            : "#2563eb";

  const isDead = patient.isDead;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-[radial-gradient(circle_at_50%_22%,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,#0f172a_0%,#111827_55%,#0b1120_100%)]">
      <div className="absolute left-4 top-4 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-xs text-slate-300">
        환자 비주얼
      </div>
      <div className={`absolute right-4 top-4 rounded-full border px-3 py-1 text-xs ${getRiskStyle(riskLabel).chip}`}>
        {riskLabel}
      </div>

      <div className="relative flex h-[360px] items-end justify-center">
        {!isDead ? (
          <div className="relative w-[260px]">
            {patientFx === "cough" && (
              <div className="absolute right-0 top-16 animate-pulse rounded-full bg-rose-300 px-4 py-2 text-sm font-bold text-rose-950 shadow-xl">
                콜록!
              </div>
            )}
            <svg viewBox="0 0 300 360" className={`w-full ${patientFx === "cough" ? "translate-y-1" : ""}`}>
              <ellipse cx="150" cy="332" rx="96" ry="18" fill="rgba(15,23,42,0.72)" />
              <rect x="88" y="138" width="124" height="148" rx="28" fill={gownColor} opacity="0.95" />
              <rect x="103" y="152" width="94" height="124" rx="20" fill="rgba(255,255,255,0.08)" />
              <circle cx="150" cy="95" r="44" fill={skinTone} />
              <path d="M106 86c8-34 86-42 92 2-10-10-25-18-47-18-19 0-33 6-45 16Z" fill="#1f2937" />
              <ellipse cx="135" cy="98" rx="4.5" ry="6" fill="#111827" />
              <ellipse cx="165" cy="98" rx="4.5" ry="6" fill="#111827" />
              {patientFx === "cough" ? (
                <path d="M128 124 Q150 138 172 121" stroke="#7f1d1d" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              ) : patientFx === "relief" ? (
                <path d="M128 122 Q150 136 172 122" stroke="#14532d" strokeWidth="4.5" strokeLinecap="round" fill="none" />
              ) : (
                <path d="M136 124 Q150 117 164 124" stroke="#7f1d1d" strokeWidth="4" strokeLinecap="round" fill="none" />
              )}
              <path d="M96 150 C84 170 83 195 92 220" stroke={skinTone} strokeWidth="16" strokeLinecap="round" fill="none" />
              <path d="M204 150 C216 170 217 195 208 220" stroke={skinTone} strokeWidth="16" strokeLinecap="round" fill="none" />
              <path d="M126 286 L118 336" stroke="#475569" strokeWidth="18" strokeLinecap="round" />
              <path d="M174 286 L182 336" stroke="#475569" strokeWidth="18" strokeLinecap="round" />
              <rect x="183" y="82" width="62" height="10" rx="5" fill="#dbeafe" opacity="0.95" />
              <rect x="243" y="81" width="11" height="12" rx="3" fill="#e5e7eb" />
              <path d="M183 87 C164 88 166 132 166 132" stroke="#dbeafe" strokeWidth="4.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="w-[245px]">
            <svg viewBox="0 0 280 330" className="w-full">
              <ellipse cx="140" cy="302" rx="95" ry="18" fill="rgba(15,23,42,0.65)" />
              <rect x="85" y="140" width="110" height="130" rx="24" fill="#475569" opacity="0.8" />
              <circle cx="140" cy="92" r="44" fill="#d1d5db" />
              <circle cx="124" cy="92" r="8" fill="#111827" />
              <circle cx="156" cy="92" r="8" fill="#111827" />
              <path d="M120 120 L160 120" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
              <path d="M96 150 C86 172 85 192 92 214" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" fill="none" opacity="0.8" />
              <path d="M184 150 C194 172 195 192 188 214" stroke="#cbd5e1" strokeWidth="16" strokeLinecap="round" fill="none" opacity="0.8" />
              <path d="M126 270 L118 318" stroke="#94a3b8" strokeWidth="18" strokeLinecap="round" />
              <path d="M154 270 L162 318" stroke="#94a3b8" strokeWidth="18" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
        <span className="font-semibold text-slate-100">현재 표정:</span>{" "}
        {isDead
          ? "치명적 악화로 사망"
          : patientFx === "cough"
            ? "기침하며 힘들어함"
            : patientFx === "relief"
              ? "조금 안도한 모습"
              : patient.respiratoryDistress >= 70
                ? "숨이 매우 가쁜 상태"
                : "불안하지만 대화 가능"}
      </div>
    </div>
  );
}

function WebsiteHero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden border-b border-slate-800">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[1.12fr_0.88fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300">
            AI + Rule-Based Interactive Demo
          </div>
          <h1 className="text-4xl font-black leading-tight text-white md:text-6xl">
            AI 기반 임상 판단 시뮬레이터
            <span className="mt-2 block text-cyan-300">웹사이트형 데모 버전</span>
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            단순 텍스트 응답형 과제가 아니라, 실제로 브라우저에서 플레이 가능한 임상 판단 훈련 시스템입니다.
            사용자는 환자의 상태를 읽고 선택을 내리며, 시스템은 점수·위험도·환자 상태 변화를 즉시 반영합니다.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onStart}
              className="rounded-2xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              데모 시작
            </button>
            <a
              href="#simulator"
              className="rounded-2xl border border-slate-700 bg-slate-950/50 px-6 py-3 font-semibold text-slate-100 transition hover:bg-slate-900"
            >
              실습 화면 보기
            </a>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["다양한 케이스", "폐렴, 심부전, COPD, 천식, 흡인, 패혈증"],
            ["실시간 피드백", "행동 결과가 점수와 바이탈에 바로 반영"],
            ["교육 효과", "정답 암기가 아니라 판단의 결과를 체험"],
            ["확장 가능성", "OpenAI 연동 시 케이스 자동 생성 가능"],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_0_40px_rgba(8,145,178,0.05)]"
            >
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-3 leading-7 text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseStrip() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-cyan-300">Case Pool</p>
          <h2 className="mt-2 text-3xl font-bold text-white">랜덤으로 등장하는 케이스</h2>
        </div>
        <p className="max-w-xl text-right text-sm leading-7 text-slate-400">
          발표 시마다 다른 케이스를 뽑아 시연할 수 있게 설계했습니다.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BASE_CASES.map((item) => (
          <div key={`${item.patient.name}-${item.patient.causeType}`} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-white">{item.patient.name}</p>
              <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                {getCaseTag(item.patient.causeType)}
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-300">{item.patient.diagnosisHint}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-400">
              <div>SpO2 {item.patient.oxygenSaturation}%</div>
              <div>RR {item.patient.respiratoryRate}/min</div>
              <div>HR {item.patient.heartRate}/min</div>
              <div>불안 {item.patient.anxiety}/100</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [turnIndex, setTurnIndex] = useState(0);
  const [feedback, setFeedback] = useState<{
    title: string;
    body: string;
    learningPoint: string;
    extra: string[];
  } | null>(null);
  const [revealedHint, setRevealedHint] = useState<string | null>(null);
  const [revealedScan, setRevealedScan] = useState<string | null>(null);
  const [revealedForecast, setRevealedForecast] = useState<{ id: number; text: string } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
  const [resultDelta, setResultDelta] = useState<DeltaState | null>(null);
  const [warningFlash, setWarningFlash] = useState(false);
  const [patientFx, setPatientFx] = useState<"idle" | "cough" | "relief" | "tense">("idle");
  const [soundOn, setSoundOn] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const currentTurn = game.turns[turnIndex];
  const riskLabel = useMemo(() => getRiskLabel(game.patient), [game.patient]);
  const riskStyle = useMemo(() => getRiskStyle(riskLabel), [riskLabel]);
  const displayedVitals = useMemo(
    () => ({
      oxygenSaturation: game.patient.isDead ? 0 : game.patient.oxygenSaturation,
      respiratoryRate: game.patient.isDead ? 0 : game.patient.respiratoryRate,
      heartRate: game.patient.isDead ? 0 : game.patient.heartRate,
      systolicBp: game.patient.isDead ? 0 : game.patient.systolicBp,
    }),
    [game.patient]
  );

  useEffect(() => {
    if (!warningFlash) return;
    const timer = window.setTimeout(() => setWarningFlash(false), 900);
    return () => window.clearTimeout(timer);
  }, [warningFlash]);

  useEffect(() => {
    if (patientFx === "idle") return;
    const timer = window.setTimeout(() => setPatientFx("idle"), 1000);
    return () => window.clearTimeout(timer);
  }, [patientFx]);

  function getAudioCtx() {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AudioCtor = window.AudioContext;
      if (!AudioCtor) return null;
      audioCtxRef.current = new AudioCtor();
    }
    return audioCtxRef.current;
  }

  function playBeep(type: "warning" | "good" | "mixed") {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === "warning" ? "square" : type === "good" ? "sine" : "triangle";
    osc.frequency.value = type === "warning" ? 920 : type === "good" ? 650 : 450;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  function resetGame() {
    setGame(createInitialGame());
    setTurnIndex(0);
    setFeedback(null);
    setRevealedHint(null);
    setRevealedScan(null);
    setRevealedForecast(null);
    setGameOver(false);
    setFinalReport(null);
    setResultDelta(null);
    setWarningFlash(false);
    setPatientFx("idle");
    setShowSimulator(true);
  }

  function handleHint() {
    if (gameOver || !currentTurn) return;
    setGame((prev) => ({
      ...prev,
      patient: { ...prev.patient, usedHintCount: prev.patient.usedHintCount + 1 },
      eventLog: [...prev.eventLog, `TURN ${currentTurn.turnNumber}: 힌트 확인`],
    }));
    setRevealedHint(currentTurn.hint);
  }

  function handleScan() {
    if (gameOver || !currentTurn) return;
    setGame((prev) => ({
      ...prev,
      patient: { ...prev.patient, usedScanCount: prev.patient.usedScanCount + 1 },
      eventLog: [...prev.eventLog, `TURN ${currentTurn.turnNumber}: 환자 스캔 확인`],
    }));
    setRevealedScan(currentTurn.scanText);
  }

  function handleForecast(choice: Choice) {
    if (gameOver || !currentTurn) return;
    setGame((prev) => ({
      ...prev,
      patient: { ...prev.patient, usedForecastCount: prev.patient.usedForecastCount + 1 },
      eventLog: [...prev.eventLog, `TURN ${currentTurn.turnNumber}: 예상 결과 확인`],
    }));
    setRevealedForecast({ id: choice.id, text: getForecastText(choice) });
  }

  function handleChoice(choice: Choice) {
    if (gameOver || !currentTurn) return;

    const before = game.patient;
    let next: Patient = {
      ...before,
      score: before.score + choice.scoreDelta,
      oxygenSaturation: clamp(
        before.oxygenSaturation + (choice.stateDelta.oxygenSaturation ?? 0),
        60,
        100
      ),
      respiratoryDistress: clamp(
        before.respiratoryDistress + (choice.stateDelta.respiratoryDistress ?? 0),
        0,
        100
      ),
      respiratoryRate: clamp(before.respiratoryRate + (choice.preferred ? -1 : 1), 8, 45),
      heartRate: clamp(before.heartRate + (choice.preferred ? -2 : 2), 40, 180),
      systolicBp: before.systolicBp,
      anxiety: clamp(before.anxiety + (choice.stateDelta.anxiety ?? 0), 0, 100),
      pain: clamp(before.pain + (choice.stateDelta.pain ?? 0), 0, 10),
      stability: clamp(before.stability + (choice.stateDelta.stability ?? 0), 0, 100),
      comboStreak: choice.preferred ? before.comboStreak + 1 : 0,
      turnsCleared: before.turnsCleared + 1,
      isDead: false,
      usedHintCount: before.usedHintCount,
      usedScanCount: before.usedScanCount,
      usedForecastCount: before.usedForecastCount,
    };

    const extra: string[] = [];

    if (choice.preferred && next.comboStreak >= 2) {
      next.score += 4;
      extra.push("연속 올바른 판단 보너스 +4");
    }
    if (choice.preferred && next.comboStreak === 3) {
      next.score += 6;
      extra.push("완벽한 3연속 판단 보너스 +6");
    }
    if (choice.dangerous) {
      next.score -= 4;
      extra.push("위험 행동 추가 패널티 -4");
    }
    if (next.usedHintCount > 0 && choice.preferred) {
      next.score -= 2;
      extra.push("힌트 사용으로 정답 보상 일부 감소 -2");
    }
    if (next.anxiety >= 75) {
      next.respiratoryDistress = clamp(next.respiratoryDistress + 2, 0, 100);
      next.stability = clamp(next.stability - 2, 0, 100);
      extra.push("불안 상승으로 호흡곤란이 약간 악화됨");
    }
    if (next.oxygenSaturation <= 85) {
      next.stability = clamp(next.stability - 3, 0, 100);
      extra.push("저산소 상태 지속으로 안정도 추가 감소");
    }

    const critical = getCriticalState(next);
    if (critical) {
      next.isDead = true;
      next.oxygenSaturation = 0;
      next.respiratoryRate = 0;
      next.heartRate = 0;
      next.systolicBp = 0;
    }

    setGame((prev) => ({
      patient: next,
      turns: prev.turns,
      history: [
        ...prev.history,
        choice.preferred
          ? `정답에 가까운 선택: ${choice.text}`
          : choice.dangerous
            ? `위험한 선택: ${choice.text}`
            : `부분적으로 아쉬운 선택: ${choice.text}`,
      ],
      eventLog: [...prev.eventLog, `TURN ${currentTurn.turnNumber} 선택: ${choice.text}`, ...extra],
    }));

    setFeedback({
      title: choice.preferred ? "좋은 선택" : choice.dangerous ? "위험한 선택" : "아쉬운 선택",
      body: choice.rationale,
      learningPoint: choice.learningPoint,
      extra,
    });

    setResultDelta({
      label:
        choice.resultLabel ||
        (choice.preferred ? "상태 개선" : choice.dangerous ? "상태 악화" : "부분 변화"),
      score: next.score - before.score,
      oxygen: next.oxygenSaturation - before.oxygenSaturation,
      distress: next.respiratoryDistress - before.respiratoryDistress,
      stability: next.stability - before.stability,
      anxiety: next.anxiety - before.anxiety,
      status: choice.preferred ? "good" : choice.dangerous ? "danger" : "mixed",
    });

    if (choice.dangerous) {
      setWarningFlash(true);
      setPatientFx("cough");
      playBeep("warning");
    } else if (choice.preferred) {
      setPatientFx("relief");
      playBeep("good");
    } else {
      setPatientFx("tense");
      playBeep("mixed");
    }

    setRevealedHint(null);
    setRevealedScan(null);
    setRevealedForecast(null);

    const finished = critical || turnIndex >= game.turns.length - 1;
    if (finished) {
      setGameOver(true);
      setFinalReport(buildFinalSummary(next));
      return;
    }
    setTurnIndex((prev) => prev + 1);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(6,182,212,0.10),transparent_22%),linear-gradient(180deg,#020617_0%,#07111f_45%,#020617_100%)] text-slate-100">
      {warningFlash && <div className="pointer-events-none fixed inset-0 z-50 animate-pulse bg-red-500/30" />}

      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-bold text-white">Clinical Judgement Lab</p>
            <p className="text-sm text-slate-400">AI 기반 임상 판단 시뮬레이터</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowSimulator(true)}
              className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              데모 열기
            </button>
            <button
              onClick={() => setSoundOn((v) => !v)}
              className="rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-900"
            >
              {soundOn ? "소리 켜짐" : "소리 꺼짐"}
            </button>
          </div>
        </div>
      </header>

      <WebsiteHero onStart={() => setShowSimulator(true)} />
      <CaseStrip />

      {showSimulator && (
        <section id="simulator" className="mx-auto max-w-7xl px-6 pb-16">
          <div className="rounded-[32px] border border-cyan-500/15 bg-slate-900/55 p-4 shadow-[0_0_50px_rgba(8,145,178,0.08)] backdrop-blur-xl md:p-6">
            <div className={`mb-6 rounded-[28px] border border-slate-800 bg-slate-900/75 p-5 ${riskStyle.glow}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">실시간 시뮬레이터</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    6개 케이스 · 5턴 · 무작위 선택지 · 환자 상태 실시간 반영
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-300">
                    TURN {Math.min(turnIndex + 1, game.turns.length)}/{game.turns.length}
                  </div>
                  <div className={`rounded-full border px-4 py-2 text-sm font-bold ${riskStyle.chip}`}>
                    위험도 {riskLabel}
                  </div>
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">
                    점수 {game.patient.score}
                  </div>
                  <button
                    onClick={resetGame}
                    className="rounded-full border border-slate-700 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-900"
                  >
                    새 케이스
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
              <div className="space-y-6">
                <div className="rounded-[28px] border border-slate-800 bg-slate-900/75 p-5">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-white">환자 모니터</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        환자 비주얼, 바이탈, 안정도와 위험도를 함께 보여줍니다.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Monitor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">
                        HR Sync {game.patient.isDead ? 0 : displayedVitals.heartRate}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <PatientVisual patient={game.patient} patientFx={patientFx} riskLabel={riskLabel} />
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <VitalCard label="SpO2" value={`${displayedVitals.oxygenSaturation}%`} sub="산소포화도" accent="text-cyan-300" />
                        <VitalCard label="RR" value={`${displayedVitals.respiratoryRate}/min`} sub="호흡수" accent="text-slate-100" />
                        <VitalCard label="HR" value={`${displayedVitals.heartRate}/min`} sub="심박수" accent="text-slate-100" />
                        <VitalCard label="BP" value={`${displayedVitals.systolicBp} mmHg`} sub="수축기 혈압" accent="text-slate-100" />
                      </div>
                      <div className="grid gap-4 lg:grid-cols-3">
                        <ProgressBar label="안정도" value={game.patient.stability} kind="positive" />
                        <ProgressBar label="호흡곤란" value={game.patient.respiratoryDistress} kind="negative" />
                        <ProgressBar label="불안" value={game.patient.anxiety} kind="negative" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold text-white">환자 정보</h4>
                          <p className="text-sm text-slate-400">현재 플레이 중인 케이스의 기본 프로필입니다.</p>
                        </div>
                        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                          {getCaseTag(game.patient.causeType)}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-slate-300">
                        <p><span className="font-medium text-slate-100">환자명:</span> {game.patient.name}</p>
                        <p><span className="font-medium text-slate-100">나이/성별:</span> {game.patient.age}세 / {game.patient.sex}</p>
                        <p><span className="font-medium text-slate-100">입원 배경:</span> {game.patient.diagnosisHint}</p>
                        <p><span className="font-medium text-slate-100">의식 상태:</span> {game.patient.mentalStatus}</p>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                      <h4 className="mb-3 text-lg font-semibold text-white">선택 결과 요약</h4>
                      {!resultDelta ? (
                        <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
                          아직 선택 결과가 없습니다.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className={`rounded-2xl border px-4 py-3 text-sm ${
                            resultDelta.status === "good"
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                              : resultDelta.status === "danger"
                                ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
                                : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                          }`}>
                            <span className="font-semibold">결과:</span> {resultDelta.label}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              ["점수", resultDelta.score],
                              ["SpO2", resultDelta.oxygen],
                              ["안정도", resultDelta.stability],
                              ["호흡곤란", -resultDelta.distress],
                              ["불안", -resultDelta.anxiety],
                            ].map(([name, value]) => (
                              <div key={name} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{name}</p>
                                <p className="mt-1 text-lg font-semibold text-slate-100">
                                  {Number(value) > 0 ? "+" : ""}
                                  {value}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {!gameOver && currentTurn && (
                  <div className="rounded-[28px] border border-slate-800 bg-slate-900/75 p-5">
                    <div className="mb-5 border-b border-slate-800 pb-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xl font-semibold text-white">
                          TURN {currentTurn.turnNumber}. {currentTurn.title}
                        </h3>
                        <div className={`rounded-full border px-3 py-1 text-sm ${riskStyle.chip}`}>
                          현재 상태 {riskLabel}
                        </div>
                      </div>
                      <p className="mt-3 leading-7 text-slate-300">{currentTurn.description}</p>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleHint}
                        className="rounded-2xl bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                      >
                        힌트 보기
                      </button>
                      <button
                        onClick={handleScan}
                        className="rounded-2xl bg-sky-500/15 px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/25"
                      >
                        환자 스캔
                      </button>
                    </div>

                    {revealedHint && (
                      <div className="mb-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-4">
                        <p className="mb-2 font-semibold text-cyan-300">힌트</p>
                        <p className="text-sm leading-7 text-slate-300">{revealedHint}</p>
                      </div>
                    )}
                    {revealedScan && (
                      <div className="mb-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-4">
                        <p className="mb-2 font-semibold text-sky-300">환자 스캔</p>
                        <p className="text-sm leading-7 text-slate-300">{revealedScan}</p>
                      </div>
                    )}
                    {revealedForecast && (
                      <div className="mb-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-4">
                        <p className="mb-2 font-semibold text-violet-300">
                          예상 결과 확인 · 선택지 {revealedForecast.id}
                        </p>
                        <p className="text-sm leading-7 text-slate-300">{revealedForecast.text}</p>
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      {currentTurn.choices.map((choice) => (
                        <div key={`${currentTurn.turnNumber}-${choice.id}`} className="rounded-3xl border border-slate-700 bg-slate-950/70 p-3">
                          <button
                            onClick={() => handleChoice(choice)}
                            className="flex min-h-[112px] w-full items-start gap-4 rounded-2xl px-2 py-3 text-left transition hover:bg-slate-800/80"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 font-bold text-cyan-300">
                              {choice.id}
                            </div>
                            <div className="text-base leading-7 text-slate-100">{choice.text}</div>
                          </button>
                          <div className="px-2 pt-1">
                            <button
                              onClick={() => handleForecast(choice)}
                              className="rounded-xl px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                            >
                              예상 결과 확인
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {feedback && (
                  <div className="rounded-[28px] border border-emerald-500/20 bg-slate-900/75 p-5">
                    <h3 className="text-lg font-semibold text-white">피드백 · {feedback.title}</h3>
                    <div className="mt-3 space-y-3 leading-7 text-slate-300">
                      <p>{feedback.body}</p>
                      <p className="text-cyan-300">학습 포인트: {feedback.learningPoint}</p>
                      {feedback.extra.length > 0 && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="mb-2 font-medium text-slate-100">추가 판정</p>
                          <ul className="list-disc space-y-1 pl-5 text-sm">
                            {feedback.extra.map((item, idx) => (
                              <li key={`${item}-${idx}`}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {gameOver && finalReport && (
                  <div className="rounded-[28px] border border-fuchsia-500/20 bg-slate-900/80 p-5">
                    <h3 className="text-2xl font-bold text-white">최종 평가 리포트</h3>
                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                      <div className="space-y-3 leading-7 text-slate-300">
                        <p><span className="font-semibold text-slate-100">환자:</span> {game.patient.name} ({game.patient.age}세 {game.patient.sex})</p>
                        <p><span className="font-semibold text-slate-100">배경:</span> {game.patient.diagnosisHint}</p>
                        <p><span className="font-semibold text-slate-100">최종 점수:</span> {game.patient.score}</p>
                        <p><span className="font-semibold text-slate-100">최종 위험도:</span> {riskLabel}</p>
                        <p><span className="font-semibold text-slate-100">최종 등급:</span> {finalReport.grade}</p>
                        <p><span className="font-semibold text-slate-100">종합 평가:</span> {finalReport.summary}</p>
                      </div>
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="mb-2 font-medium text-slate-100">강점</p>
                          <ul className="list-disc pl-5 text-sm text-slate-300">
                            {finalReport.strengths.map((s, i) => <li key={`strength-${i}`}>{s}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="mb-2 font-medium text-slate-100">개선점</p>
                          <ul className="list-disc pl-5 text-sm text-slate-300">
                            {finalReport.improvements.map((s, i) => <li key={`improve-${i}`}>{s}</li>)}
                          </ul>
                        </div>
                        <ProgressBar label="최종 안정도" value={game.patient.stability} kind="positive" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="rounded-[28px] border border-slate-800 bg-slate-900/75 p-5">
                  <h3 className="text-lg font-semibold text-white">이벤트 로그</h3>
                  <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto pr-1">
                    {game.eventLog.map((log, idx) => (
                      <div key={`log-${idx}`} className="rounded-2xl bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-800 bg-slate-900/75 p-5">
                  <h3 className="text-lg font-semibold text-white">행동 기록</h3>
                  <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                    {game.history.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
                        아직 행동 기록이 없습니다.
                      </div>
                    ) : (
                      game.history.map((item, index) => (
                        <div key={`history-${index}`} className="rounded-2xl bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                          {index + 1}. {item}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-800 bg-slate-900/75 p-5">
                  <h3 className="text-lg font-semibold text-white">발표 포인트</h3>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
                    <li>AI는 향후 케이스 생성·피드백 엔진으로 확장 가능</li>
                    <li>현재 버전은 규칙 기반 상태 계산과 게임 진행 제어 담당</li>
                    <li>웹 배포까지 완료되어 URL만으로 시연 가능</li>
                    <li>실제 의료 교육용 서비스 형태로 발전 가능한 구조</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}