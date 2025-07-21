---
marp: true
theme: default
paginate: true
backgroundColor: #ffffff
color: #333333
style: |
  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .small-text {
    font-size: 0.8em;
  }
  .highlight {
    background-color: #e8f4fd;
    padding: 0.5rem;
    border-radius: 0.25rem;
    border-left: 4px solid #0176d3;
  }
---


# Salesforce LWC 기반 일정 관리 및 비용 집계 시스템

## 프로젝트 완료 보고서

**개발자**: 박세진  
**개발 기간**: 2025.07.14 ~ 2025.07.23 (7일)  
**프로젝트**: 실습과제 - 일정 관리 시스템

---

## 📋 목차

1. **프로젝트 개요**
2. **요구사항 분석 결과**
3. **시스템 아키텍처**
4. **구현된 핵심 기능**
5. **기술 스택 및 구현 방식**
6. **보안 및 성능 최적화**
7. **테스트 및 품질 관리**
8. **완성도 평가**
9. **향후 개선 방안**

---

## 1. 프로젝트 개요

### 🎯 프로젝트 목표
- **사용자 친화적인 LWC 기반 일정 관리 기능 제공**
- **이벤트와 관련된 비용을 체계적으로 관리**
- **부서별/월별/비용종류별 Matrix 보고서 제공**

### 📊 개발 결과 요약


---

## 2. 요구사항 분석 결과

### 📝 기능적 요구사항 구현 현황

<div class="columns">
<div>

#### UI 요구사항 (FR-UI-001~003) ✅
- Lightning Experience 환경 구현
- 3분할 레이아웃 (좌측/중앙/우측)
- 메인 애플리케이션 탭 구성

#### 좌측 패널 (FR-LP-001~004) ✅
- Salesforce 객체 탭 구성
- 드래그&드롭 기능
- 개인 활동 목록

</div>
<div>

#### 중앙 달력 (FR-FC-001~003) ✅
- FullCalendar 월간 뷰
- 네비게이션 버튼
- 이벤트 생성 기능

#### 비용 요약 (FR-RP-001~002) ✅
- 월별 비용 종류별 합계
- 보고서 페이지 연결

</div>
</div>

---

## 2. 요구사항 분석 결과

### 🔧 비기능적 요구사항 충족도
- **성능**: 2-3초 이내 응답 시간 달성
- **보안**: Salesforce 표준 보안 모델 준수
- **유용성**: 직관적인 드래그&드롭 UI
- **호환성**: Chrome, Firefox, Edge 지원

---

## 3. 시스템 아키텍처

### 🏗️ 전체 아키텍처 설계

```
📱 프론트엔드 (LWC)
├── calendarContainer (메인 컨테이너)
├── calendarView (FullCalendar 통합)
├── eventSourcePanel (드래그 소스)
└── costSummaryPanel (비용 요약)

💾 백엔드 (Apex)
├── CalendarAppController (비즈니스 로직)
└── CalendarEventSelector (데이터 조회 전담)

🗄️ 데이터 (Custom Objects)
├── My_Event__c (이벤트 정보)
└── Cost_Detail__c (비용 상세)
```
---

### 🎯 설계 원칙 적용
- **MVC 패턴**: 역할 분리로 유지보수성 향상
- **Separation of Concerns**: Controller와 Selector 분리
- **Component Composition**: 재사용 가능한 컴포넌트 구조

---

## 4. 구현된 핵심 기능

### 🎨 사용자 인터페이스 기능

<div class="columns">
<div>

#### 1. 드래그&드롭 이벤트 생성
- **구현 방식**: FullCalendar Draggable API
- **데이터 전달**: HTML5 Dataset 활용
- **사용자 경험**: 실시간 시각적 피드백

#### 2. 모달 기반 이벤트 편집
- **Salesforce 객체**: 비용 입력 가능
- **개인 활동**: 간소화된 입력 폼
- **동적 UI**: 이벤트 타입별 차별화

</div>
<div>

#### 3. 실시간 비용 집계
- **자동 계산**: Wire Service 반응형 데이터
- **월별 필터링**: 캘린더 뷰 연동
- **통화 포맷팅**: 한국 원화 지원

#### 4. 보고서 연결
- **Matrix 보고서**: Salesforce 표준 Report
- **원클릭 이동**: NavigationMixin 활용

</div>
</div>

---

## 5. 기술 스택 및 구현 방식

### 💻 프론트엔드 기술 스택

<div class="highlight">

#### Lightning Web Components (LWC)
- **Shadow DOM**: 캡슐화된 컴포넌트 구조
- **Reactive Properties**: @track, @wire 데코레이터

</div>

---

## 5. 기술 스택 및 구현 방식

#### 외부 라이브러리 통합
```javascript
// FullCalendar 라이브러리 통합
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

// Static Resource로 안전한 라이브러리 사용
loadScript(this, FullCalendar + '/main.min.js')
```

#### 컴포넌트 간 통신
```javascript
// 부모 → 자식: 속성 전달
<c-cost-summary-panel current-month={currentMonthForSummary}>

// 자식 → 부모: 커스텀 이벤트
this.dispatchEvent(new CustomEvent('eventdrop', { detail: data }));
```

---

## 6. 백엔드 구현 상세

### ⚙️ Apex 아키텍처
#### 1. Controller 계층 (CalendarAppController)
```apex
// Parameter Object 패턴으로 복잡도 관리
public class EventSaveRequest {
    public Id recordId;
    public String title;
    // ... 기타 필드들
}

// 트랜잭션 관리
Savepoint sp = Database.setSavepoint();
try {
    // 비즈니스 로직
} catch (Exception e) {
    Database.rollback(sp);
}
```
---
#### 2. Selector 계층 (CalendarEventSelector)
```apex
// SOQL 전담 클래스
public static List<My_Event__c> selectEventsByDateRange(Date startDt, Date endDt) {
    return [SELECT Id, Title__c FROM My_Event__c 
            WHERE Start_Date__c <= :endDt AND End_Date__c >= :startDt
            AND OwnerId = :UserInfo.getUserId() ORDER BY Start_Date__c LIMIT 200];
}
```

---

## 7. 데이터 모델링

### 🗄️ Custom Objects 설계

<div class="columns">
<div>

#### My_Event__c (이벤트)
- **Name**: 이벤트 제목
- **Title__c**: 표시용 제목  
- **Start_Date__c**: 시작일
- **End_Date__c**: 종료일
- **Description__c**: 설명
- **Location__c**: 장소
- **Related_Record_Id__c**: 연관 레코드 ID
- **Related_Record_Type__c**: 연관 레코드 타입

</div>
<div>

#### Cost_Detail__c (비용 상세)
- **My_Event__c**: 이벤트 참조 (Master-Detail)
- **Cost_Type__c**: 비용 유형 (Picklist)
- **Amount__c**: 금액 (Currency)
- **department__c**: 부서 (Picklist)

#### 관계 설정
- **1:N 관계**: 하나의 이벤트에 여러 비용
- **Cascade Delete**: 이벤트 삭제 시 비용도 삭제

</div>
</div>

---

## 8. 보안 및 성능 최적화

### 🔒 보안 구현

#### 다층 보안 구조
```apex
// 1. 객체 레벨 보안
if (!Schema.sObjectType.My_Event__c.isAccessible()) {
    throw new AuraHandledException('읽기 권한이 없습니다');
}

// 2. 레코드 레벨 보안
public with sharing class CalendarAppController {
    // 사용자 권한 기반 접근
}

// 3. 데이터 격리
WHERE OwnerId = :UserInfo.getUserId()  // 본인 데이터만
```
---

### 🚀 성능 최적화

#### Governor Limits 준수
- **SOQL 제한**: LIMIT 200 적용
- **DML 최적화**: Bulk Operations 사용
- **메모리 관리**: 적절한 데이터 구조 선택

#### 캐싱 전략
```javascript
// Wire Service 자동 캐싱
@wire(getMonthlyCostSummary, { startDate: '$monthRange.start' })

// Apex 메소드 캐싱
@AuraEnabled(cacheable=true)
```

---

## 9. 테스트 및 품질 관리

### 🧪 테스트 전략

#### 테스트 커버리지 달성
- **CalendarAppController**: 95% 커버리지
- **CalendarEventSelector**: 98% 커버리지
- **전체 평균**: 85% (목표 75% 초과 달성)

---

#### 테스트 케이스 구성
```apex
@TestSetup
static void makeData() {
    // 테스트 데이터 준비
}

@isTest
static void testPositiveCase() {
    // 정상 케이스 테스트
}

@isTest  
static void testErrorHandling() {
    // 예외 상황 테스트
}
```
---

### 📊 코드 품질 관리

#### PMD 규칙 준수
- **ExcessiveParameterList**: Parameter Object 패턴으로 해결
- **ApexCRUDViolation**: 적절한 권한 검증 구현
- **MethodNamingConventions**: Clean Code 명명 규칙 적용

---

## 10. 핵심 기능 시나리오

#### 1. 드래그&드롭으로 이벤트 생성
```
Account 선택 → 캘린더 드롭 → 모달 열림 → 비용 입력 → 저장
```

#### 2. 이벤트 수정 및 삭제
```
이벤트 클릭 → 상세 정보 로드 → 수정/삭제 → 실시간 업데이트
```

#### 3. 월별 비용 집계
```
월 변경 → 자동 데이터 재조회 → 비용 요약 업데이트 → 보고서 연결
```

#### 4. 개인 활동 관리
```
휴가/병가 드래그 → 간소화된 입력 → 저장 (비용 입력 없음)
```

---

## 11. 기술적 도전과 해결

### 🔧 주요 기술적 도전사항

#### 1. 외부 라이브러리 통합
**도전**: FullCalendar를 Salesforce LWC에 안전하게 통합  
**해결**: Static Resource + Platform Resource Loader 활용
```javascript
Promise.all([
    loadStyle(this, FullCalendar + '/main.min.css'),
    loadScript(this, FullCalendar + '/main.min.js')
])
```

#### 2. 실시간 데이터 동기화
**도전**: 이벤트 변경 시 모든 컴포넌트 자동 업데이트  
**해결**: Wire Service 반응형 매개변수 + 컴포넌트 간 이벤트 통신

#### 3. 복잡한 권한 관리
**도전**: 객체/필드/레코드 레벨 보안 동시 적용  
**해결**: 다층 보안 구조 설계 + with sharing 활용

---

## 12. 개발 과정에서 배운 것들

### 📚 기술적 학습

<div class="highlight">

#### Salesforce 플랫폼 전문성
- **Lightning Web Components**: 모던 웹 표준 기반 개발
- **Apex Programming**: 서버사이드 로직 및 보안
- **SOQL/SOSL**: 효율적인 데이터 조회
- **Governor Limits**: 플랫폼 제약사항 이해 및 대응

</div>

---

#### 소프트웨어 아키텍처
- **Clean Architecture**: 계층별 책임 분리
- **Design Patterns**: MVC, Parameter Object, Selector 패턴
- **Component Design**: 재사용 가능한 컴포넌트 설계

#### 품질 관리
- **Test-Driven Development**: 테스트 커버리지 확보
- **Code Review**: PMD 규칙 준수 및 Clean Code
- **Documentation**: 체계적인 문서화

---

### 📎 참고 자료

#### 프로젝트 문서
- **요구사항 정의서**: 상세 기능 명세
- **API 문서**: Apex 메소드 상세 설명
- **사용자 가이드**: 기능 사용법 안내

#### 기술 레퍼런스
- **Salesforce Developer Guide**: 공식 개발 문서
- **Lightning Web Components Guide**: LWC 개발 가이드  
- **FullCalendar Documentation**: 외부 라이브러리 문서
