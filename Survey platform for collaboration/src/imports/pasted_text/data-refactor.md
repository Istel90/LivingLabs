현재 코드의 가장 큰 문제는 각 화면이 실제 데이터와 연결되지 않고, 화면마다 임의의 더미값을 따로 표시하고 있다는 점입니다.

수정 목표:
관리자 대시보드, 리스크 관리, 현황정보 구성, 부서 배정, 응답자 화면이 모두 동일한 데이터 구조를 기준으로 연결되어야 합니다. 하드코딩된 숫자, 더미 리스크명, 더미 현황정보, 더미 그래프, 더미 최근활동을 제거하고 실제 risks, departments, assignments, responses 데이터를 기준으로 계산·표시되도록 수정해 주세요.

핵심 원칙:
화면마다 임의 데이터를 따로 만들지 마세요.
모든 화면은 동일한 risks 배열 또는 risks 테이블을 기준으로 작동해야 합니다.
선택된 리스크는 selectedRiskId를 기준으로 selectedRisk를 조회해서 표시해야 합니다.

const selectedRisk = risks.find(risk => risk.id === selectedRiskId);

응답자 화면도 관리자 화면에서 만든 동일한 risk 객체를 읽어와야 합니다.

------------------------------------
1. 전체 데이터 구조를 통일해 주세요.
------------------------------------

리스크 데이터는 다음 구조를 기준으로 관리해 주세요.

type Risk = {
  id: string;
  projectId: string;
  municipality: string;

  title: string;
  description: string;

  sectorId: string;
  sectorName: string;

  subsectorId: string;
  subsectorName: string;

  detailTagId?: string;
  detailTagName?: string;

  respondentGuide: string;

  overview: {
    summary: string;
    expectedImpact: string;
    relatedClimateHazard: string;
  };

  contextInfo: {
    title: string;
    body: string;
    keyPoints: string[];
    blocks: ContextBlock[];
    source: string;
  };

  mapInfo: {
    center: [number, number];
    zoom: number;
    baseLayer: string;
    visibleLayers: string[];
    markers?: {
      id: string;
      lat: number;
      lng: number;
      label: string;
    }[];
  };

  assignedDepartmentIds: string[];

  status: "draft" | "review_requested" | "confirmed";

  dueDate: string;
  createdAt: string;
  updatedAt: string;
};

type ContextBlock = {
  id: string;
  type: "text" | "chart" | "map" | "image" | "table";
  title: string;
  content?: string;
  imageUrl?: string;
  description?: string;
};

응답 데이터는 다음 구조를 기준으로 관리해 주세요.

type Response = {
  id: string;
  projectId: string;
  riskId: string;
  userId: string;
  departmentId: string;

  answers: {
    questionId: string;
    value: string | number;
    label: string;
  }[];

  status: "draft" | "submitted";
  submittedAt?: string;
  updatedAt: string;
};

부서 데이터는 다음 구조를 기준으로 관리해 주세요.

type Department = {
  id: string;
  name: string;
  municipality: string;
};

------------------------------------
2. 관리자 대시보드의 모든 숫자를 실제 데이터에서 계산해 주세요.
------------------------------------

현재 대시보드에 표시되는 값들이 임의값입니다.

예:
- 등록된 지역 리스크 8
- 배정된 부서 7
- 제출 완료 응답 2
- 확정 완료 리스크 3
- 부문별 진행현황 막대그래프
- 최근 활동 목록

이 값들을 하드코딩하지 말고 실제 데이터에서 계산해 주세요.

계산 방식은 다음과 같습니다.

등록된 지역 리스크:
risks.length

배정된 부서:
중복을 제거한 assignedDepartmentIds 개수

예:
const assignedDepartmentCount = new Set(
  risks.flatMap(risk => risk.assignedDepartmentIds)
).size;

제출 완료 응답:
responses 중 status가 submitted인 항목 수

const submittedResponseCount = responses.filter(
  response => response.status === "submitted"
).length;

확정 완료 리스크:
risks 중 status가 confirmed인 항목 수

const confirmedRiskCount = risks.filter(
  risk => risk.status === "confirmed"
).length;

전체 진행률:
전체 배정 건수 대비 제출 완료 응답 수로 계산

const totalAssignments = risks.reduce(
  (sum, risk) => sum + risk.assignedDepartmentIds.length,
  0
);

const progressRate = totalAssignments === 0
  ? 0
  : Math.round((submittedResponseCount / totalAssignments) * 100);

대시보드 상단의 전체 진행률도 이 값으로 표시해 주세요.

------------------------------------
3. 부문별 진행현황 막대그래프도 실제 데이터에서 계산해 주세요.
------------------------------------

현재 부문별 진행현황이 임의로 표시되고 있습니다.

부문별 진행현황은 sectorName 기준으로 계산해 주세요.

각 부문별로:
- denominator = 해당 부문의 전체 배정 건수
- numerator = 해당 부문 리스크에 대해 제출 완료된 응답 수

예:
건강 4 / 6
생태계/산림 3 / 5

이 값은 하드코딩하지 말고 risks와 responses를 조합해서 계산해 주세요.

계산 예시:

const sectorProgress = sectors.map(sector => {
  const sectorRisks = risks.filter(risk => risk.sectorId === sector.id);

  const total = sectorRisks.reduce(
    (sum, risk) => sum + risk.assignedDepartmentIds.length,
    0
  );

  const submitted = responses.filter(response => {
    const risk = risks.find(r => r.id === response.riskId);
    return risk?.sectorId === sector.id && response.status === "submitted";
  }).length;

  return {
    sectorId: sector.id,
    sectorName: sector.name,
    submitted,
    total,
    progressRate: total === 0 ? 0 : submitted / total
  };
});

막대그래프는 sectorProgress를 기준으로 렌더링해 주세요.
데이터가 없으면 0 / 0 또는 “배정 없음”으로 표시해 주세요.

------------------------------------
4. 최근 활동도 실제 데이터에서 생성해 주세요.
------------------------------------

현재 최근 활동 목록도 임의값입니다.

최근 활동은 risks와 responses의 updatedAt, submittedAt을 기준으로 생성해 주세요.

예:
- response.status === "submitted"이면 “응답 제출 완료”
- risk.status === "confirmed"이면 “리스크 확정”
- risk.status === "review_requested"이면 “수정 요청”
- risk.status === "draft"이면 “미작성”

최근 활동에는 다음 정보를 표시해 주세요.
- 리스크명
- 상태
- 부문명
- updatedAt 또는 submittedAt

하드코딩된 최근활동 텍스트를 제거해 주세요.

------------------------------------
5. 리스크 관리 화면은 risks 배열에서 렌더링해 주세요.
------------------------------------

리스크 관리 화면의 중앙 테이블은 하드코딩된 행이 아니라 risks.map()으로 표시해야 합니다.

표시 필드:
- risk.title
- risk.sectorName
- risk.subsectorName
- risk.detailTagName
- risk.contextInfo.blocks.length
- risk.mapInfo.visibleLayers.length
- risk.assignedDepartmentIds.length
- risk.status

현재 보이는 다음과 같은 더미 리스크명은 코드에 직접 있으면 안 됩니다.
- 테스트리스크
- 테스트리스크2
- 수인성 매개 질환 발생 증가
- 폭염으로 인한 건강 취약계층 피해
- 산림 병해충 발생 증가
- 도심 침수 피해 증가

단, 초기 샘플 데이터로만 사용하는 것은 가능하지만, 화면 컴포넌트 안에 직접 하드코딩하지 말고 initialRisks 같은 데이터 배열에만 넣어 주세요.

------------------------------------
6. 오른쪽 리스크 상세 편집 패널은 selectedRisk를 수정해야 합니다.
------------------------------------

현재 오른쪽 패널의 기본정보, 현황정보, 부서배정 탭이 서로 따로 움직이거나 더미값을 보여주는 문제가 있습니다.

오른쪽 패널의 모든 입력값은 selectedRisk에서 가져와야 합니다.

기본정보 탭:
- selectedRisk.title
- selectedRisk.description
- selectedRisk.sectorId
- selectedRisk.subsectorId
- selectedRisk.detailTagName
- selectedRisk.respondentGuide

현황정보 탭:
- selectedRisk.contextInfo.title
- selectedRisk.contextInfo.body
- selectedRisk.contextInfo.keyPoints
- selectedRisk.contextInfo.blocks
- selectedRisk.contextInfo.source
- selectedRisk.mapInfo.visibleLayers
- selectedRisk.mapInfo.markers

부서배정 탭:
- selectedRisk.assignedDepartmentIds

입력값을 수정하면 risks 배열 안의 해당 risk 객체가 업데이트되어야 합니다.

예:
updateRisk(selectedRisk.id, {
  title: newTitle
});

현황정보를 수정하면:
updateRisk(selectedRisk.id, {
  contextInfo: {
    ...selectedRisk.contextInfo,
    title: newContextTitle
  }
});

------------------------------------
7. 현황정보 탭은 관리자가 직접 구성하는 편집 화면이어야 합니다.
------------------------------------

현황정보 탭은 임의 더미 페이지를 보여주는 화면이 아니라, 응답자에게 보여줄 참고자료 페이지를 구성하는 편집 화면이어야 합니다.

현황정보 탭에는 다음 기능이 있어야 합니다.

- 현황정보 제목 입력
- 현황정보 본문 입력
- 핵심 포인트 추가/삭제
- 블록 추가 버튼
- 블록 유형 선택: 텍스트 / 차트 / 지도 / 이미지 / 표
- 블록 제목 입력
- 블록 설명 입력
- 이미지 또는 차트 placeholder 입력
- 출처 입력
- 지도 기본 레이어 선택
- 지도에 표시할 레이어 선택
- 지도 마커 추가/삭제

관리자가 이 탭에서 작성한 내용이 selectedRisk.contextInfo와 selectedRisk.mapInfo에 저장되어야 합니다.

------------------------------------
8. 응답자 화면은 관리자에서 만든 동일한 risk를 읽어야 합니다.
------------------------------------

응답자 계정에서 리스크 목록에 보이는 항목은 임의값이 아니라, 로그인한 사용자의 departmentId가 selectedRisk.assignedDepartmentIds에 포함된 리스크만 보여야 합니다.

예:
const assignedRisks = risks.filter(risk =>
  risk.assignedDepartmentIds.includes(currentUser.departmentId)
);

응답자 화면에서 특정 리스크를 클릭하면 selectedRiskId로 같은 risk 객체를 조회해야 합니다.

응답자 상세 화면의 탭은 다음처럼 연결해 주세요.

리스크 개요 탭:
- selectedRisk.title
- selectedRisk.description
- selectedRisk.overview.summary
- selectedRisk.overview.expectedImpact
- selectedRisk.overview.relatedClimateHazard

현황정보 탭:
- selectedRisk.contextInfo.title
- selectedRisk.contextInfo.body
- selectedRisk.contextInfo.keyPoints
- selectedRisk.contextInfo.blocks
- selectedRisk.contextInfo.source
- selectedRisk.mapInfo.visibleLayers
- selectedRisk.mapInfo.markers

설문응답 탭:
- selectedRisk.id에 연결된 설문 문항
- 현재 사용자 currentUser.id
- 현재 부서 currentUser.departmentId
- 저장 시 responses에 riskId, userId, departmentId, projectId를 함께 저장

응답자 화면의 현황정보는 절대 임의 더미값으로 표시되면 안 됩니다.
관리자 화면에서 작성한 selectedRisk.contextInfo가 그대로 보여야 합니다.

------------------------------------
9. 부문-세부부문 매칭도 실제 데이터로 관리해 주세요.
------------------------------------

부문과 세부부문은 하드코딩하지 말고 sectorSubsectorMapping 배열을 기준으로 선택되도록 해 주세요.

부문 선택 시 해당 부문에 연결된 세부부문만 세부부문 드롭다운에 표시되어야 합니다.

특히 건강 부문에는 다음 세부부문을 추가해 주세요.

- 감염병
- 폭염질환
- 건강 취약계층
- 대기오염 건강영향
- 정신건강

예:
건강을 선택하면 세부부문 드롭다운에는 감염병, 폭염질환, 건강 취약계층, 대기오염 건강영향, 정신건강만 표시되어야 합니다.

세세부태그는 선택값이며, 리스크 하나당 최대 1개만 선택할 수 있게 해 주세요.

------------------------------------
10. 새 리스크 추가 기능을 실제 데이터 생성 방식으로 바꿔 주세요.
------------------------------------

“새 리스크 추가” 버튼을 누르면 빈 risk 객체를 생성하고 risks 배열에 추가한 뒤, 해당 리스크를 selectedRisk로 선택해 오른쪽 편집 패널에서 바로 수정할 수 있게 해 주세요.

기본값 예시:

const newRisk = {
  id: crypto.randomUUID(),
  projectId: currentProject.id,
  municipality: currentProject.municipality,
  title: "",
  description: "",
  sectorId: "",
  sectorName: "",
  subsectorId: "",
  subsectorName: "",
  detailTagId: "",
  detailTagName: "",
  respondentGuide: "",
  overview: {
    summary: "",
    expectedImpact: "",
    relatedClimateHazard: ""
  },
  contextInfo: {
    title: "",
    body: "",
    keyPoints: [],
    blocks: [],
    source: ""
  },
  mapInfo: {
    center: [37.2636, 127.0286],
    zoom: 11,
    baseLayer: "osm",
    visibleLayers: [],
    markers: []
  },
  assignedDepartmentIds: [],
  status: "draft",
  dueDate: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

------------------------------------
11. 하드코딩된 화면값을 모두 제거해 주세요.
------------------------------------

다음과 같은 값들이 컴포넌트 안에 직접 들어가 있으면 안 됩니다.

- 등록된 지역 리스크 8
- 배정된 부서 7
- 제출 완료 응답 2
- 확정 완료 리스크 3
- 전체 진행률 13%
- 건강 4 / 6
- 생태계/산림 3 / 5
- 물관리 3 / 5
- 연안 1 / 4
- 국토 1 / 3
- 산업 및 에너지 0 / 1
- 최근 활동 목록의 임의 리스크명
- 건강 부문 현황
- 감염병 발생 추이 그래프
- 연령별 취약인구 분포
- 인천광역시 보건환경연구원, 2025
- 테스트리스크
- 테스트리스크2

이 값들은 모두 risks, responses, departments, assignments에서 계산하거나 selectedRisk에서 가져오도록 수정해 주세요.

잘못된 예:
<h2>건강 부문 현황</h2>
<p>등록된 지역 리스크 8</p>

올바른 예:
<h2>{selectedRisk.contextInfo.title}</h2>
<p>{risks.length}</p>

------------------------------------
12. 최종 데이터 흐름은 다음과 같아야 합니다.
------------------------------------

관리자 리스크 생성/수정
→ risks 배열 또는 risks 테이블에 저장
→ 관리자 대시보드는 risks/responses/departments에서 자동 계산
→ 리스크 관리 화면은 risks.map()으로 표시
→ 부서배정은 risk.assignedDepartmentIds에 저장
→ 응답자 화면은 currentUser.departmentId 기준으로 배정된 risks만 표시
→ 응답자가 riskId로 상세 페이지 진입
→ 같은 risk 객체의 개요, 현황정보, 설문응답 표시
→ 응답 저장 시 responses에 projectId, riskId, userId, departmentId 저장
→ 대시보드와 진행현황은 responses 상태를 기준으로 자동 갱신

핵심 요구사항:
디자인보다 데이터 연결이 우선입니다.
보여주기용 임의값을 제거하고, 같은 데이터가 관리자 화면과 응답자 화면에서 일관되게 연결되도록 수정해 주세요.