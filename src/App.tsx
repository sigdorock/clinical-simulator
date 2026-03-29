import React, { useMemo, useState } from "react";

type Choice = {
  id: number;
  text: string;
  preferred?: boolean;
  dangerous?: boolean;
};

type Turn = {
  turnNumber: number;
  title: string;
  description: string;
  choices: Choice[];
};

type Patient = {
  name: string;
  age: number;
  sex: string;
  diagnosisHint: string;
  mentalStatus: string;
  oxygenSaturation: number;
  respiratoryRate: number;
  heartRate: number;
  systolicBp: number;
  stability: number;
  respiratoryDistress: number;
  anxiety: number;
  score: number;
  isDead: boolean;
};

function getRiskLabel(patient: Patient) {
  if (patient.isDead) return "치명";
  if (patient.oxygenSaturation <= 85 || patient.stability <= 20) return "위중";
  if (patient.oxygenSaturation <= 90 || patient.stability <= 40) return "불안정";
  if (patient.oxygenSaturation <= 94 || patient.stability <= 60) return "주의";
  return "안정";
}

const turns: Turn[] = [
  {
    turnNumber: 1,
    title: "초기 인지 및 즉시 대응",
    description:
      "68세 남성 폐렴 환자가 숨이 차다고 호소합니다. 현재 SpO2 88%, RR 30/min, HR 112/min입니다.",
    choices: [
      { id: 1, text: "환자를 반좌위로 올리고 산소화를 먼저 확인한다.", preferred: true },
      { id: 2, text: "병력 확인을 먼저 하고 체위 조정은 잠시 뒤에 한다." },
      { id: 3, text: "검사를 먼저 보내고 결과를 기다린다.", dangerous: true },
      { id: 4, text: "불안 완화부터 시도한다." },
    ],
  },
  {
    turnNumber: 2,
    title: "재사정과 보고",
    description: "초기 처치 후에도 환자는 여전히 숨이 차다고 말합니다.",
    choices: [
      { id: 1, text: "활력징후와 호흡음을 재사정하고 즉시 보고한다.", preferred: true },
      { id: 2, text: "조금 더 추세를 보고 나서 보고한다." },
      { id: 3, text: "산소만 더 올리고 보고는 나중에 한다.", dangerous: true },
      { id: 4, text: "응급카트 위치부터 다시 확인한다." },
    ],
  },
];

export default function App() {
  const [turnIndex, setTurnIndex] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [patient, setPatient] = useState<Patient>({
    name: "김민수",
    age: 68,
    sex: "남성",
    diagnosisHint: "폐렴으로 입원 중",
    mentalStatus: "불안하지만 의식은 명료함",
    oxygenSaturation: 88,
    respiratoryRate: 30,
    heartRate: 112,
    systolicBp: 138,
    stability: 50,
    respiratoryDistress: 62,
    anxiety: 72,
    score: 0,
    isDead: false,
  });

  const currentTurn = turns[turnIndex];
  const riskLabel = useMemo(() => getRiskLabel(patient), [patient]);

  function handleChoice(choice: Choice) {
    setLog((prev) => [...prev, `TURN ${currentTurn.turnNumber}: ${choice.text}`]);

    setPatient((prev) => {
      let next = { ...prev };

      if (choice.preferred) {
        next.score += 18;
        next.oxygenSaturation += 2;
        next.stability += 15;
        next.respiratoryDistress -= 6;
        next.anxiety -= 5;
      } else if (choice.dangerous) {
        next.score -= 14;
        next.oxygenSaturation -= 2;
        next.stability -= 12;
        next.respiratoryDistress += 5;
        next.anxiety += 1;
      } else {
        next.score -= 9;
        next.oxygenSaturation -= 1;
        next.stability -= 7;
        next.respiratoryDistress += 3;
        next.anxiety -= 1;
      }

      if (next.oxygenSaturation <= 82 || next.stability <= 10 || next.respiratoryDistress >= 95) {
        next.isDead = true;
        next.oxygenSaturation = 0;
        next.respiratoryRate = 0;
        next.heartRate = 0;
        next.systolicBp = 0;
      }

      return next;
    });

    if (turnIndex < turns.length - 1) {
      setTurnIndex((prev) => prev + 1);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Clinical Judgement Lab</h1>
            <p className="text-sm text-slate-400">AI 기반 임상 판단 시뮬레이터 웹사이트</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            새로 시작
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-cyan-500/20 bg-slate-900 p-8 shadow-2xl shadow-cyan-950/20">
            <span className="inline-block rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-sm text-cyan-300">
              Interactive Demo
            </span>
            <h2 className="mt-4 text-4xl font-black leading-tight">
              선택에 따라 환자 상태가 달라지는
              <span className="block text-cyan-300">임상 판단 훈련 웹사이트</span>
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
              단순한 설명형 과제가 아니라, 실제로 웹 브라우저에서 플레이 가능한 교육용 시뮬레이터입니다.
              사용자는 환자의 상태를 읽고 선택을 내리며, 시스템은 점수와 환자 상태 변화를 바로 반영합니다.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-3xl font-bold text-cyan-300">2</p>
              <p className="mt-2 text-sm text-slate-400">현재 적용된 턴 수</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-3xl font-bold text-emerald-300">{patient.score}</p>
              <p className="mt-2 text-sm text-slate-400">현재 점수</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-3xl font-bold text-rose-300">{riskLabel}</p>
              <p className="mt-2 text-sm text-slate-400">현재 위험도</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-xl font-semibold">환자 정보</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">환자명</p>
                <p className="mt-1 text-lg font-semibold">{patient.name}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">나이 / 성별</p>
                <p className="mt-1 text-lg font-semibold">
                  {patient.age}세 / {patient.sex}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">입원 배경</p>
                <p className="mt-1 text-lg font-semibold">{patient.diagnosisHint}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">의식 상태</p>
                <p className="mt-1 text-lg font-semibold">{patient.mentalStatus}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">
                TURN {currentTurn.turnNumber}. {currentTurn.title}
              </h3>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300">
                {riskLabel}
              </span>
            </div>

            <p className="mb-6 leading-7 text-slate-300">{currentTurn.description}</p>

            <div className="grid gap-3">
              {currentTurn.choices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => handleChoice(choice)}
                  className="rounded-2xl border border-slate-700 bg-slate-950 p-4 text-left transition hover:border-cyan-400/40 hover:bg-slate-800"
                >
                  <span className="mr-2 font-bold text-cyan-300">{choice.id}.</span>
                  {choice.text}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-xl font-semibold">실시간 바이탈</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">SpO2</p>
                <p className="mt-1 text-2xl font-bold text-cyan-300">{patient.oxygenSaturation}%</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">RR</p>
                <p className="mt-1 text-2xl font-bold">{patient.respiratoryRate}/min</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">HR</p>
                <p className="mt-1 text-2xl font-bold">{patient.heartRate}/min</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">BP</p>
                <p className="mt-1 text-2xl font-bold">{patient.systolicBp} mmHg</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">안정도</p>
                <p className="mt-1 text-2xl font-bold text-emerald-300">{patient.stability}</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4">
                <p className="text-sm text-slate-400">호흡곤란</p>
                <p className="mt-1 text-2xl font-bold text-rose-300">{patient.respiratoryDistress}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-4 text-xl font-semibold">행동 로그</h3>
            {log.length === 0 ? (
              <p className="text-slate-500">아직 로그가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {log.map((item, i) => (
                  <div key={i} className="rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-300">
                    {i + 1}. {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}