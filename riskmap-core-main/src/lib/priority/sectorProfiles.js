export const SECTOR_PROFILES = {
  "heatwave": {
    "label": "폭염",
    "projectSuffix": "폭염 위험지역 분석",
    "heroEmphasis": "우선 대응지를 찾습니다.",
    "heroDescription": "기후위험(H), 노출(E), 취약성(V) 지표를 직접 구성하고 공간 분석 결과를 의사결정으로 연결하세요.",
    "sampleNotice": "전국 행정구역별 H01~H11 100m 분석격자를 확인할 수 있습니다.",
    "mapSource": "전국 최근 5년 H01~H05·H07·H10 / SSP245 H01~H09 100m 격자",
    "rasterPath": null,
    "dataSummaryPath": "/analysis-data/suwon-heatwave-data-summary.json",
    "rasterReadyPrefix": "선택 행정구역 100m Hazard 격자",
    "rasterError": "선택 행정구역 Hazard 격자 연결 실패",
    "actionTitle": "이동형 쉼터와 그늘막 우선 배치",
    "brief": {
      "driverTitle": "65세 이상 고령층",
      "driverText": "지역 평균 대비",
      "driverValue": "1.8배 높음",
      "gapTitle": "무더위쉼터 접근성",
      "gapText": "도보 10분 내 접근 가능",
      "gapValue": "32%"
    },
    "commonDataItems": [
      {
        "label": "기온",
        "source": "LST·폭염일수·태양고도"
      },
      {
        "label": "그늘막 현황",
        "source": "사업/시설 현황 데이터"
      },
      {
        "label": "취약계층",
        "source": "고령·유소년·기저질환자"
      },
      {
        "label": "관련 현황 데이터",
        "source": "인구·녹지·무더위쉼터·표준격자"
      }
    ],
    "alternatives": [
      {
        "name": "대안 1",
        "status": "검토중",
        "description": "취약계층 밀집지역 중심 그늘·쉼터 보강안"
      },
      {
        "name": "대안 2",
        "status": "검토중",
        "description": "보행축과 대중교통 결절점 중심 대응안"
      },
      {
        "name": "대안 3",
        "status": "검토중",
        "description": "공공시설·녹지 연계 복합 대응안"
      }
    ],
    "candidates": [
      {
        "name": "후보지 03",
        "area": "팔달구 인계동",
        "risk": 0.82,
        "h": 0.76,
        "e": 0.91,
        "v": 0.81,
        "rank": 1,
        "reason": "고령층·유동인구 집중, 쉼터 접근성 부족"
      },
      {
        "name": "후보지 07",
        "area": "권선구 세류동",
        "risk": 0.78,
        "h": 0.83,
        "e": 0.74,
        "v": 0.76,
        "rank": 2,
        "reason": "높은 지표면 온도와 녹지 면적 부족"
      },
      {
        "name": "후보지 11",
        "area": "장안구 영화동",
        "risk": 0.73,
        "h": 0.69,
        "e": 0.77,
        "v": 0.79,
        "rank": 3,
        "reason": "1인 가구 비율과 노후주택 밀집"
      }
    ],
    "indicators": [
      {
        "indicatorId": "hazard.H01.hazard",
        "id": 101,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H02.hazard",
        "id": 102,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H03.hazard",
        "id": 103,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H04.hazard",
        "id": 104,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H05.hazard",
        "id": 105,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H06.hazard",
        "id": 106,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H07.hazard",
        "id": 107,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H08.hazard",
        "id": 108,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H09.hazard",
        "id": 109,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H10.hazard",
        "id": 110,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "hazard.H11.hazard",
        "id": 111,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "static.E_population_floating_count_100m.exposure",
        "id": 3,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "flood.FE01.exposure",
        "id": 4,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "population.elderly.sensitivity",
        "id": 5,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "value": 0.06127,
          "dataPath": "/population/grid"
        }
      },
      {
        "indicatorId": "population.infant.sensitivity",
        "id": 6,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "value": 0.02439,
          "dataPath": "/population/grid"
        }
      },
      {
        "indicatorId": "static.V_sensitivity_single_household_ratio_100m_z.sensitivity",
        "id": 7,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "static.V_sensitivity_chronic_disease_ratio_proxy_100m_z.sensitivity",
        "id": 8,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "static.V_adaptive_low_income_ratio_proxy_100m_z.sensitivity",
        "id": 9,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "analysis.building-old-30y-ratio.sensitivity",
        "id": 10,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "iconPath": "/indicator-icons/노후주택비율.png"
        }
      },
      {
        "indicatorId": "static.V_adaptive_cooling_shelter_accessibility_100m_z.capacity",
        "id": 11,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "static.V_adaptive_green_natural_ratio_100m_z.capacity",
        "id": 12,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "heatwave.pending-13",
        "id": 13,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-bus-stop.exposure",
        "id": 14,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-rail-station.exposure",
        "id": 15,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.building-residential-count.exposure",
        "id": 16,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-crosswalk.exposure",
        "id": 17,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-bus-stop.capacity",
        "id": 18,
        "enabled": true,
        "weight": 1
      }
    ]
  },
  "flood": {
    "label": "홍수",
    "projectSuffix": "홍수 위험지역 분석",
    "heroEmphasis": "우선 대응 침수권역을 찾습니다.",
    "heroDescription": "침수위험(H), 노출(E), 취약성(V) 지표를 구성하고 배수·저류·대피 대안을 공간적으로 비교하세요.",
    "sampleNotice": "전국 침수위험·강우·DEM·인구·건축물·교통시설 100m PostGIS 격자를 연결했습니다.",
    "mapSource": "전국 홍수 H/E/V PostGIS 100m 서비스 격자",
    "rasterPath": null,
    "dataSummaryPath": null,
    "rasterReadyPrefix": "선택 행정구역 홍수 100m 격자",
    "rasterError": "선택 행정구역 홍수 격자 연결 실패",
    "actionTitle": "배수개선·저류공간·대피동선 우선 정비",
    "brief": {
      "driverTitle": "반지하·저지대 주거",
      "driverText": "침수흔적 중첩 비율",
      "driverValue": "높음",
      "gapTitle": "배수·저류 인프라",
      "gapText": "우수시설 보강 필요 권역",
      "gapValue": "우선"
    },
    "commonDataItems": [
      {
        "label": "침수구역",
        "source": "침수흔적도·하천범람·저지대"
      },
      {
        "label": "강우/배수",
        "source": "강우강도·우수관로·빗물받이"
      },
      {
        "label": "취약시설",
        "source": "반지하·노후건축물·취약시설"
      },
      {
        "label": "관련 현황 데이터",
        "source": "인구·도로·대피시설·표준격자"
      }
    ],
    "alternatives": [
      {
        "name": "대안 1",
        "status": "검토중",
        "description": "상습 침수구역과 저지대 중심 우선 관리안"
      },
      {
        "name": "대안 2",
        "status": "검토중",
        "description": "하천·우수관로 연결축 중심 배수 개선안"
      },
      {
        "name": "대안 3",
        "status": "검토중",
        "description": "반지하·취약시설 보호 중심 대응안"
      }
    ],
    "candidates": [
      {
        "name": "후보지 02",
        "area": "저지대 주거밀집지",
        "risk": 0.84,
        "h": 0.88,
        "e": 0.79,
        "v": 0.82,
        "rank": 1,
        "reason": "침수흔적과 반지하 주거가 중첩된 구역"
      },
      {
        "name": "후보지 05",
        "area": "하천변 상업·주거 혼재지",
        "risk": 0.79,
        "h": 0.81,
        "e": 0.83,
        "v": 0.73,
        "rank": 2,
        "reason": "하천 범람 영향권과 유동인구 집중"
      },
      {
        "name": "후보지 09",
        "area": "노후 배수시설 영향권",
        "risk": 0.74,
        "h": 0.75,
        "e": 0.72,
        "v": 0.78,
        "rank": 3,
        "reason": "배수시설 부족과 노후 건축물 밀집"
      }
    ],
    "indicators": [
      {
        "indicatorId": "flood.FH01.hazard",
        "id": 201,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "flood.UF50.hazard",
        "id": 209,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.UF80.hazard",
        "id": 210,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.UF100.hazard",
        "id": 219,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.FH02.hazard",
        "id": 202,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.FH03.hazard",
        "id": 203,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.rain-max-1h.hazard",
        "id": 204,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.terrain-low-elevation.hazard",
        "id": 205,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "analysis.terrain-twi.hazard",
        "id": 206,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.terrain-flow-accumulation.hazard",
        "id": 207,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.terrain-depression-depth.hazard",
        "id": 208,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.FE01.exposure",
        "id": 211,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "label": "FE01 · 상주인구",
          "sourceType": "PostGIS-flood-100m"
        }
      },
      {
        "indicatorId": "flood.FE02.exposure",
        "id": 212,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "flood.FE03.exposure",
        "id": 213,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-bus-stop.exposure",
        "id": 214,
        "enabled": false,
        "weight": 1,
        "overrides": {
          "description": "전국 정류장 위치의 100m 셀 밀도 · 실제 이용량은 아님",
          "dataStatus": "partial",
          "color": "#b7791f"
        }
      },
      {
        "indicatorId": "analysis.facility-rail-station.exposure",
        "id": 215,
        "enabled": false,
        "weight": 1,
        "overrides": {
          "description": "전국 도시철도 역사 851개의 100m 셀 밀도"
        }
      },
      {
        "indicatorId": "analysis.facility-crosswalk.exposure",
        "id": 216,
        "enabled": false,
        "weight": 1,
        "overrides": {
          "description": "전국횡단보도 표준자료 100m 셀 밀도 · 부산·대구·세종 보완 필요",
          "color": "#92400e"
        }
      },
      {
        "indicatorId": "analysis.building-basement-count.sensitivity",
        "id": 221,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "analysis.building-old-30y-ratio.sensitivity",
        "id": 222,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "icon": "🏚",
          "description": "사용승인일 확인 건축물 중 30년 이상 건축물의 100m 셀 비율",
          "color": "#cf6576"
        }
      },
      {
        "indicatorId": "population.elderly.sensitivity",
        "id": 223,
        "enabled": true,
        "weight": 1,
        "overrides": {
          "description": "국토정보플랫폼 2024년 10월 전국 100m 고령인구",
          "color": "#b86c82",
          "dataPath": "/population/grid"
        }
      },
      {
        "indicatorId": "population.infant.sensitivity",
        "id": 224,
        "enabled": false,
        "weight": 1,
        "overrides": {
          "description": "국토정보플랫폼 2024년 10월 전국 100m 유아인구",
          "color": "#a56d83",
          "dataPath": "/population/grid"
        }
      },
      {
        "indicatorId": "flood.pending-225",
        "id": 225,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "analysis.facility-bus-stop.capacity",
        "id": 231,
        "enabled": false,
        "weight": 1,
        "overrides": {
          "label": "대중교통 대피 접근성 proxy",
          "description": "전국 버스정류장 100m 셀 밀도를 대피 이동 접근성 참고지표로 사용 · 실제 대피경로·운행정보는 아님",
          "dataStatus": "partial"
        }
      },
      {
        "indicatorId": "analysis.facility-shelter.capacity",
        "id": 234,
        "enabled": true,
        "weight": 1
      },
      {
        "indicatorId": "flood.pending-232",
        "id": 232,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "flood.pending-233",
        "id": 233,
        "enabled": false,
        "weight": 1
      }
    ]
  },
  "ecosystem": {
    "label": "생태계",
    "projectSuffix": "생태계 위험지역 분석",
    "heroEmphasis": "생태 취약 우선 복원지를 찾습니다.",
    "heroDescription": "기후위험(H), 노출(E), 취약성(V) 지표를 구성하고 녹지·서식지·생태축 대안을 공간적으로 비교하세요.",
    "sampleNotice": "현재 생태계 분석 데이터는 연결 전이며, 폭염·홍수와 같은 구조로 확장 준비 중입니다.",
    "mapSource": "생태축·토지피복·서식지 데이터 연결 준비",
    "rasterPath": null,
    "dataSummaryPath": null,
    "rasterReadyPrefix": "생태계 위험 래스터",
    "rasterError": "생태계 위험 래스터 연결 전 · 예시 격자 표시",
    "actionTitle": "생태축 복원·녹지 연결·서식지 보호 우선 정비",
    "brief": {
      "driverTitle": "생태 민감지역",
      "driverText": "훼손·단절 영향",
      "driverValue": "검토 필요",
      "gapTitle": "녹지 연결성",
      "gapText": "복원 후보지 자료",
      "gapValue": "연결 전"
    },
    "commonDataItems": [
      {
        "label": "생태축",
        "source": "광역/도시 생태축 및 단절 지점"
      },
      {
        "label": "토지피복",
        "source": "세분류 토지피복·불투수면·녹지율"
      },
      {
        "label": "서식지",
        "source": "보호종·습지·하천변 생태 민감도"
      },
      {
        "label": "관련 현황 데이터",
        "source": "개발압력·인구·공원녹지·표준격자"
      }
    ],
    "alternatives": [
      {
        "name": "대안 1",
        "status": "검토중",
        "description": "생태축 단절구간 중심 복원안"
      },
      {
        "name": "대안 2",
        "status": "검토중",
        "description": "도시녹지와 하천변 연결성 강화안"
      },
      {
        "name": "대안 3",
        "status": "검토중",
        "description": "서식지 민감지역 보호 중심 대응안"
      }
    ],
    "candidates": [],
    "indicators": [
      {
        "indicatorId": "ecosystem.pending-1",
        "id": 1,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-2",
        "id": 2,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-3",
        "id": 3,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-4",
        "id": 4,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-5",
        "id": 5,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-6",
        "id": 6,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-7",
        "id": 7,
        "enabled": false,
        "weight": 1
      },
      {
        "indicatorId": "ecosystem.pending-8",
        "id": 8,
        "enabled": false,
        "weight": 1
      }
    ]
  }
};
