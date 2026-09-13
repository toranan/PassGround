import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node 직접 실행 테스트에서는 .ts 확장자를 사용한다.
import { asksAdmissionFacts, smalltalkReply } from "./chatRoutingPolicy.ts";

test("축약 인사·감사는 외부 근거 없이 응답 가능", () => {
  for (const question of ["ㅎㅇ", "ㅎㅇ?", "안녕하세요!", "hi", "ㄱㅅ", "고마워 ㅎㅎ", "잘 자"]) {
    assert.ok(smalltalkReply(question), question);
  }
});

test("인사 뒤의 실제 질문이나 짧은 정보 요청을 잡담으로 삼지 않음", () => {
  for (const question of ["ㅎㅇ 한양대 모집요강 알려줘", "안녕 수학 공부 어떻게 해?", "한양대", "일반편입", "영어 5등급", "모집인원 알려줘"]) {
    assert.equal(smalltalkReply(question), null, question);
  }
});

test("감정·공부 상담이 함께 있어도 전형 사실 요청을 보존", () => {
  for (const question of ["불안한데 한양대 지원자격 알려줘", "한양대 모집인원과 공부법 알려줘", "수학만 보는 학교 나열해줘", "성균관대 편입학 기본계획 알려줘", "원서 접수 마감 언제야?", "야 이번에 성대 얼마나뽑아", "성대 티오 알려줘"]) {
    assert.equal(asksAdmissionFacts(question), true, question);
  }
});

test("모의고사 상담·실제 합격선·학습 프로필은 전형 사실로 강제하지 않음", () => {
  for (const question of ["나 ㅁ영 편입모고 백분위 87.5고 원점ㅅ 78점인데 한양대 간호학과 갈수있을꺼?", "한양대 본고사 78점 합격 가능해?", "수학 공부 어떻게 시작해?", "학사 인문 준비하고 영어 5등급이야"]) {
    assert.equal(asksAdmissionFacts(question), false, question);
  }
});

test("대학 변경점과 모집요강 후속 질문을 사실 조회로 보냄", () => {
  assert.equal(asksAdmissionFacts("성대 이번에 바뀐점"), true);
  assert.equal(asksAdmissionFacts("성균관대학교 이번에 바뀌넘"), true);
  assert.equal(asksAdmissionFacts("이번에 뭐가 바뀌었어?", [
    { role: "user", text: "2027학년도 성균관대 편입 기본계획 알려줘" },
    { role: "assistant", text: "기본계획을 기준으로 안내할게." },
  ]), true);
  assert.equal(asksAdmissionFacts("그럼 공부는 어떻게 해?", [
    { role: "user", text: "성균관대 편입 시험과목 알려줘" },
  ]), false);
});
