---
marp: true
theme: default
paginate: true
headingDivider: 2
style: |
  .columns {
    display:flex;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .column {
  flex: 1;
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-size: 14px;
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
  .small-text {
    font-size: 20px;
  }
  .small-table-text {
    font-size: 15px;
  }
---

# 일정 관리 및 비용 집계 시스템 프로그램 정의서

- 프로젝트명: Salesforce LWC 기반 일정 관리 및 비용 집계 시스템
- 작성일: 2025-07-23
- 작성자: 박세진
- 버전: 1.0 (최종)


# 목차

### 1. 프로젝트 구성
### 2. 컴포넌트 정리
### 3. 구현 세부사항


# 1. 프로그램 구성
### 1.1 Apex Classes
### 1.2 LWC Components
### 1.3 Static Resources
### 1.4 Custom Objects

# 1.1 Apex Classes (4개)
- CalendarAppController.cls (메인 컨트롤러)
- CalendarEventSelector.cls (데이터 조회 및 합계)
- CalendarAppControllerTest.cls (컨트롤러 테스트)
- CalendarEventSelectorTest.cls (셀렉터 테스트)

# 1.2 LWC Components (4개)
- calendarContainer (메인컨테이너)
- eventSourcePanel (좌측 이벤트 소스 패널)
- calendarView (달력 뷰 패널)
- costSummaryPanel (우측 비용 요약 패널)

# 1.3 Static Resources (1개)
- FullCalendarV5_new (FullCallendar 라이브러리)

# 1.4 Custom Objects (2개)
- My_Event__c (이벤트 정보)
- Cost_Detail__c (비용 상세)

# 2. 컴포넌트 정리
### 2.1 Apex Classes
### 2.2 LWC Components
### 2.3 Database Objects

# 2.1 Apex Classes
### CallendarAppController
역할 : 메인 비즈니스 로직 컨트롤러
특징 : JSON기반 데이터 처리 , EventWrapper클래스(MyEvent + CostDetail + Account Name), savepoint로 트랜잭션 관리

## getEvents(startStr, endStr) 
지정된 날짜 범위 내의 이벤트 목록 조회

<div class="small-text">
<pre>
@AuraEnabled(cacheable=true)
public static List<My_Event__c> getEvents(String startStr, String endStr)
</pre>
</div>

###### Returns : `List<My_Event__c>` 날짜 범위에 해당하는 이벤트 목록 (최대 200개)
###### Exceptions : `AuraHandledException` 입력값이 유효하지 않거나 읽기권한이 없을시 발생
###### Description : 지정된 날짜 범위 내의 이벤트 목록 조회 메소드. 현재 로그인한 사용자가 소유한 이벤트만 조회, 시작일과 종료일이 겹치는 모든 이벤트를 반환.
###### Example : calendarView.loadEvents() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| starStr | String | 조회 시작 날짜(YYYY-MM-DD 형식) |
| endStr | String | 조회 종료 날짜 (YYYY-MM-DD 형식) |

</div>

## getEventDetails(eventId) 
특정 이벤트의 상세 정보와 관련 비용 정보 조회

<div class="small-text">
<pre>
@AuraEnabled(cacheable=true)
public static EventWrapper getEventDetails(Id eventId)
</pre>
</div>

###### Returns : `EventWrapper` (이벤트+비용+관련레코드)
###### Exceptions : `AuraHandledException` 이벤트ID가 null값, 해당 이벤트를 찾을 수 없는 경우 발생
###### Description : 특정 이벤트와 관련된 모든 비용 정보를 조회. EventWrapper 클래스를 통해 이벤트 객체, 비용 리스트, 관련 레코드명을 함께 반환.
###### Example : calendarContainer.handleEventClick() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| eventId | Id | 조회할 이벤트 ID |

</div>

## getMonthlyCostSummary(startDate, endDate) 
월별 비용 유형별 합계 조회

<div class="small-text">
<pre>
@AuraEnabled(cacheable=true)
public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate)
</pre>
</div>

###### Returns : `Map<String, Decimal>` 비용 유형을 key로 하고 합계 금액을 value로 하는 Map
###### Exceptions : `AuraHandledException` 입력값이 유효하지 않거나 읽기권한이 없는 경우 발생
###### Description : 지정된 기간의 비용 유형별 합계를 조회합. 활성화된 모든 Picklist 값을 0으로 초기화한 후, 실제 데이터로 업데이트하여 완전한 집계 결과를 제공.
###### Example : costSummaryPanel.wiredCosts() @wire 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| startDate | String | 조회 시작 날짜(YYYY-MM-DD 형식) |
| endDate | String | 조회 종료 날짜 (YYYY-MM-DD 형식) |

</div>

## saveEventAndCosts(eventDataJson, costDetailsJson) 
이벤트 관련 비용 정보 JSON저장 (LWC에서 호출하는 public 메소드)

<div class="small-text">
<pre>
@AuraEnabled
public static String saveEventAndCosts(String eventDataJson, String costDetailsJson)
</pre>
</div>

###### Returns : `String` 저장된 이벤트의 Salesforce ID
###### Exceptions : `AuraHandledException` 이벤트 데이터가 없거나 JSON 파싱 오류, 저장 중 오류가 발생한 경우
###### Description : JSON 방식으로 이벤트 및 비용 정보를 저장. 기존 이벤트 수정과 신규 이벤트 생성을 모두 지원, Savepoint를 사용한 트랜잭션 관리로 데이터 일관성을 보장.
###### Example : calendarContainer.saveEvent() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| eventDataJson | String | 이벤트 기본 정보가 담긴 JSON 문자열 |
| costDetailsJson | String | 비용 상세 정보 배열이 담긴 JSON 문자열 |

</div>


## updateEventDates(eventId, newStartDate, newEndDate)
기존 이벤트 시작일 종료일 업데이트

<div class="small-text">
<pre>
@AuraEnabled
public static void updateEventDates(Id eventId, String newStartDate, String newEndDate)
</pre>
</div>

###### Returns : `void`
###### Exceptions : `AuraHandledException` 이벤트 ID가 null이거나 수정 권한이 없는 경우 발생
###### Description : 기존 이벤트의 시작일과 종료일만 업데이트. 주로 캘린더에서 이벤트를 드래그로 이동할 때 사용, 소유권 검증을 통해 보안을 보장.
###### Example : calendarView.handleEventDrop() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| eventId | Id | 업데이트할 이벤트 ID |
| newStartDate | String | 새로운 시작일 (YYYY-MM-DD) |
| newEndDate | String | 새로운 종료일 (YYYY-MM-DD) |

</div>

## deleteEvent(eventId)
이벤트 관련 비용 정보 삭제 메소드

<div class="small-text">
<pre>
@AuraEnabled
public static void deleteEvent(Id eventId)
</pre>
</div>

###### Returns : `void`
###### Exceptions : `AuraHandledException` 이벤트 ID가 null이거나 삭제 권한이 없는 경우 발생
###### Description : 이벤트와 관련된 모든 비용 정보를 삭제. Savepoint를 사용하여 트랜잭션 관리, 오류 발생 시 모든 변경사항을 롤백.
###### Example : calendarContainer.handleDelete() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| eventId | Id | 삭제할 이벤트ID |

</div>

## getAccountList(), getContactList(), getOpportunityList()
Account, Contact, Opportunity 리스트 목록 조회

<div class="small-text">
<pre>
@AuraEnabled(cacheable=true)
public static List<오브젝트> get오브젝트List()
</pre>
</div>

###### Returns : Account, Contact, Opportunity 목록 (Limit 200)
###### Exceptions : `AuraHandledException` 읽기권한이 없을 시 발생
###### Description : 목록은 주어진 조건순으로 조회4
###### Example : eventSourcePanel.`[accountData , contactData , opportunityData]`  getter에서 @wire를 통해 호출

## getDepartmentOptions()
부서 옵션 picklist 목록 조회

<div class="small-text">

<pre>
@AuraEnabled(cacheable=true)
public static List<Map<String, String>> getDepartmentOptions()
</pre>

</div>

###### Returns : `List<Map<String, String>>` label과 value를 포함하는 부서 옵션 리스트
###### Exceptions : `AuraHandledException` 부서 옵션 조회 중 오류가 발생한 경우
###### Description : Cost_Detail__c.department__c 필드의 활성 Picklist 옵션을 조회. 이후 모달의 부서 선택 콤보박스에서 사용
###### Example : calendarContainer.connectedCallback() 메소드에서 호출


## getCostTypeOptions()
비용 옵션 picklist 목록 조회

<div class="small-text">

<pre>
@AuraEnabled(cacheable=true)
public static List<Map<String, String>> getCostTypeOptions()
</pre>

</div>

###### Returns : `List<Map<String, String>>` label과 value를 포함하는 비용 유형 옵션 리스트
###### Exceptions : `AuraHandledException` 비용 유형 옵션 조회 중 오류가 발생한 경우
###### Description : Cost_Detail__c.Cost_Type__c 필드의 활성 Picklist 옵션을 조회. 이후 모달의 비용 유형 선택 콤보박스에서 사용.
###### Example : calendarContainer.connectedCallback() 메소드에서 호출


# 2.1 Apex Classes
### CalendarEventSelector
역할 : 데이터 조회 전용
특징 : SOQL 쿼리 전담, CRUD 권한 검증 강화, AggregateResult 활용 집계


## selectEventsByDateRange(startDt, endDt)
지정된 날짜 범위별 이벤트 목록 조회

<div class="small-text">
<pre>
public static List<My_Event__c> selectEventsByDateRange(Date startDt, Date endDt)
</pre>
</div>

###### Returns : `List<My_Event__c>` 날짜 범위에 해당하는 이벤트 목록 (현재 사용자 소유, LIMIT 200)
###### Exceptions : `AuraHandledException` 날짜가 null이거나 읽기 권한이 없는 경우
###### Description : 지정된 날짜 범위의 이벤트 목록을 조회. 현재 사용자 소유 이벤트만 조회하며 시작일 기준으로 정렬
###### Example : CalendarAppController.getEvents() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| startDt | Date | 조회 시작 날짜 |
| endDt | Date | 조회 시작 날짜 |

</div>

## selectMonthlyCostSummary(startDate, endDate)
지정된 기간의 비용 유형별 합계 조회

<div class="small-text">
<pre>
public static Map<String, Decimal> selectMonthlyCostSummary(Date startDate, Date endDate)
</pre>
</div>

###### Returns : `Map<String, Decimal>` 비용 유형별 합계 Map (활성 Picklist 포함)
###### Exceptions : `AuraHandledException` 날짜가 null이거나 읽기 권한이 없는 경우
###### Description : 지정 기간의 비용 유형별 합계를 조회. Picklist 값으로 초기화 후 AggregateResult로 실제데이터 병합하여 완전한 집계 결과 제공
###### Example : CalendarAppController.getMonthlyCostSummary() 메소드에서 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| startDate | Date | 조회 시작 날짜 |
| endDate | Date | 조회 시작 날짜 |

</div>

# 2.2 LWC Component
### calendarContainer
역할 : 메인 컨테이너 이벤트 조정자
특징 : 3분할 레이아웃 관리, 모달 상태 관리, 컴포넌트간 이벤트 통신 조정

## handleEventDrop(event)
드래그 드롭시 새 이벤트 생성

<div class="small-text">
<pre>
public static List<My_Event__c> selectEventsByDateRange(Date startDt, Date endDt)
</pre>
</div>

###### Returns : `void`
###### Description : 드래그 드롭으로 새 이벤트 생성 시 호출. 드롭된 레코드의 데이터 를 추출하여 모달 초기화 후 새 이벤트 생성 프로세스 시작
###### Example : 좌측 패널에서 특정 레코드 중앙 달력 패널에 드롭시 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| event | CustomEvent | 드래그 드롭 이벤트 객체 (detail.draggedEl, detail.date 포함) |

</div>

## saveEvent()
이벤트 및 비용 정보 저장

<div class="small-text">
<pre>
public static List<My_Event__c> selectEventsByDateRange(Date startDt, Date endDt)
</pre>
</div>

###### Returns : `void`
###### Description : 드래그 드롭으로 새 이벤트 생성 시 호출. 드롭된 레코드의 데이터 를 추출하여 모달 초기화 후 새 이벤트 생성 프로세스 시작
###### Example : 좌측 패널에서 특정 레코드 중앙 달력 패널에 드롭시 호출

<div class="small-table-text">

| name | type | info |
|:---:|:---:|:---:|
| event | CustomEvent | 드래그 드롭 이벤트 객체 (detail.draggedEl, detail.date 포함) |

</div>