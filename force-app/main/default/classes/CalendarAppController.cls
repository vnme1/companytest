/**
 * @description       : 캘린더 앱 컨트롤러
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    
    // 상수 정의
    private static final String DEFAULT_DEPARTMENT = '개발팀';
    private static final String PERSONAL_RECORD_TYPE = 'Personal';
    private static final String ACCOUNT_RECORD_TYPE = 'Account';
    private static final Decimal MIN_COST_AMOUNT = 0.01;

    // wrapper class(이벤트+비용+관련레코드)
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String relatedRecordName;
        @AuraEnabled public String recordTypeName;
    }

    // 파라미터들 하나의 객체로 묶음
    public class EventSaveRequest {
        public Id recordId;
        public String title;
        public String startDate;
        public String endDate;
        public String description;
        public String location;
        public String department;
        public String relatedId;
        public String recordType;
        public String costDetailsJson;
    }
    
    /**
    * @description : 지정된 날짜 범위 내의 이벤트 목록 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param startStr 조회 시작 날짜 (YYYY-MM-DD)
    * @param endStr 조회 종료 날짜 (YYYY-MM-DD)
    * @return List<My_Event__c> | 날짜 범위에 해당하는 이벤트 목록
    * @exception AuraHandledException 입력값이 유효하지않거나 읽기 권한이 없을시 발생
    **/
    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        try {
            if (String.isBlank(startStr) || String.isBlank(endStr)) {
                throw new AuraHandledException('입력값이 유효하지 않습니다');
            }
            
            if (!Schema.sObjectType.My_Event__c.isAccessible()) {
                throw new AuraHandledException('읽기 권한이 없습니다');
            }

            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            return CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        } catch (Exception e) {
            System.debug('이벤트 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description : 특정 이벤트의 상세 정보와 관련 비요 정보 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 조회할 이벤트 ID
    * @return EventWrapper | (이벤트+비용+관련레코드)
    * @exception AuraHandledException 이벤트ID가 null값이거나 해당 이벤트를 찾을 수 없는 경우 발생
    **/
    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        try {
            if (eventId == null) {
                throw new AuraHandledException('이벤트 ID가 필요합니다');
            }
            if (!Schema.sObjectType.My_Event__c.isAccessible()) {
                throw new AuraHandledException('이벤트 읽기 권한이 없습니다');
            }
            if (!Schema.sObjectType.Cost_Detail__c.isAccessible()) {
                throw new AuraHandledException('비용 상세 읽기 권한이 없습니다');
            }

            EventWrapper wrapper = new EventWrapper();
            wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
            
            if (wrapper.event == null) {
                throw new AuraHandledException('이벤트를 찾을 수 없습니다');
            }
            
            wrapper.costs = (wrapper.event.Cost_Details1__r != null) ? 
                           wrapper.event.Cost_Details1__r : new List<Cost_Detail__c>();
            
            wrapper.relatedRecordName = getRelatedRecordName(wrapper.event);
            wrapper.recordTypeName = wrapper.event.Related_Record_Type__c;
            
            return wrapper;
        } catch (Exception e) {
            System.debug('이벤트 상세 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 상세 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description : 월별 비용 유형별 합계 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param startDate 조회 시작 날짜 (YYYY-MM-DD)
    * @param endDate 조회 종료 날짜 (YYYY-MM-DD)
    * @return Map<String, Decimal> | 비용 유형을 key로 하고 합계금액을 value로 하는 Map
    * @exception AuraHandledException 입력 값이 유효하지 않거나 읽기 권한이 없는 경우
    **/
    @AuraEnabled(cacheable=true) 
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        try {
            if (String.isBlank(startDate) || String.isBlank(endDate)) {
                throw new AuraHandledException('입력값이 유효하지 않습니다');
            }
            
            if (!Schema.sObjectType.Cost_Detail__c.isAccessible()) {
                throw new AuraHandledException('비용 상세 읽기 권한이 없습니다');
            }

            Date start = Date.valueOf(startDate);
            Date endDateObj = Date.valueOf(endDate);
            return CalendarEventSelector.selectMonthlyCostSummary(start, endDateObj);
        } catch (Exception e) {
            System.debug('비용 요약 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 요약 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description : Account 리스트 목록 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @return List<Account> | Account 목록(ID, Name, Owner.Name등등)
    * @exception AuraHandledException Account 읽기 권한이 없는 경우
    **/
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccountList() {
        try {
            if (!Schema.sObjectType.Account.isAccessible()) {
                throw new AuraHandledException('Account 읽기 권한이 없습니다');
            }
            return CalendarEventSelector.selectAccounts();
        } catch (Exception e) {
            System.debug('Account 목록 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('Account 목록 조회 중 오류가 발생했습니다');
        }
    }

    /**
    * @description : contact 리스트 목록 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @return List<Contact> | Contact 목록(ID, Name, Account.Name, Owner.Name등등)
    * @exception AuraHandledException Contact 읽기 권한이 없는 경우
    **/
    @AuraEnabled(cacheable=true)
    public static List<Contact> getContactList() {
        try {
            if (!Schema.sObjectType.Contact.isAccessible()) {
                throw new AuraHandledException('Contact 읽기 권한이 없습니다');
            }
            return CalendarEventSelector.selectContacts();
        } catch (Exception e) {
            System.debug('Contact 목록 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('Contact 목록 조회 중 오류가 발생했습니다');
        }
    }

    /**
    * @description : opportunity 리스트 목록 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @return List<Opportunity> | Opportunity 목록 (ID, Name, StageName, CloseDate, Owner.Name, Account.Name등등)
    * @exception AuraHandledException Opportunity  읽기 권한이 없는 경우
    **/
    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getOpportunityList() {
        try {
            if (!Schema.sObjectType.Opportunity.isAccessible()) {
                throw new AuraHandledException('Opportunity 읽기 권한이 없습니다');
            }
            return CalendarEventSelector.selectOpportunities();
        } catch (Exception e) {
            System.debug('Opportunity 목록 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('Opportunity 목록 조회 중 오류가 발생했습니다');
        }
    }

    /**
    * @description : 부서 옵션 picklist 목록 조회
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @return List<Map<String, String>> | label과 value를 포함하는 맵의 리스트
    * @exception AuraHandledException 부서 옵션 조회 중 오류가 발생한 경우
    **/
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getDepartmentOptions() {
        try {
            return CalendarEventSelector.selectDepartmentOptions();
        } catch (Exception e) {
            System.debug('부서 옵션 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('부서 옵션 조회 중 오류가 발생했습니다');
        }
    }

    /**
    * @description : 비용 옵션 picklist 목록 조회 
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @return List<Map<String, String>> | label과 value를 포함하는 맵의 리스트
    * @exception AuraHandledException 비용 유형 옵션 조회 중 오류가 발생한 경우
    **/
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCostTypeOptions() {
        try {
            return CalendarEventSelector.selectCostTypeOptions();
        } catch (Exception e) {
            System.debug('비용 유형 옵션 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 유형 옵션 조회 중 오류가 발생했습니다');
        }
    }
    
    // JSON 방식으로 수정된 메소드
    
    /**
    * @description 이벤트 관련 비용 정보 JSON저장 (LWC에서 호출하는 public 메소드)
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventDataJson 이벤트 기본 정보가 담긴 JSON문자열
    * @param costDetailsJson 비용 상세 정보가 담긴 JSON문자열
    * @return String | 저장된 이벤트의iID
    * @exception AuraHandledException 이벤트 데이터가 없거나 JSON 파싱 오류, 저장중 오류가 발생한 경우
    **/
    @AuraEnabled
    public static String saveEventAndCosts(String eventDataJson, String costDetailsJson) {
        try {
            if (String.isBlank(eventDataJson)) {
                throw new AuraHandledException('이벤트 데이터가 필요합니다');
            }

            Map<String, Object> eventData = (Map<String, Object>)JSON.deserializeUntyped(eventDataJson);
            
            EventSaveRequest request = new EventSaveRequest();
            request.recordId = (Id)eventData.get('recordId');
            request.title = (String)eventData.get('title');
            request.startDate = (String)eventData.get('startDate');
            request.endDate = (String)eventData.get('endDate');
            request.description = (String)eventData.get('description');
            request.location = (String)eventData.get('location');
            request.department = (String)eventData.get('department');
            request.relatedId = (String)eventData.get('relatedId');
            request.recordType = (String)eventData.get('recordType');
            request.costDetailsJson = costDetailsJson;
            
            return saveEventAndCostsInternal(request);
        } catch (JSONException jsonEx) {
            System.debug('JSON 파싱 오류: ' + jsonEx.getMessage());
            throw new AuraHandledException('이벤트 데이터 형식이 올바르지 않습니다: ' + jsonEx.getMessage());
        } catch (Exception e) {
            System.debug('이벤트 저장 요청 처리 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 저장 요청 처리 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    /**
    * @description 기존 이벤트 시작일 종료일 업데이트
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 업데이트할 이벤트 ID
    * @param newStartDate 새로운 시작일 (YYYY-MM-DD)
    * @param newEndDate 새로운 종료일 (YYYY-MM-DD)
    * @exception AuraHandledException 이벤트 ID가 null 또는 수정 권한이 없는 경우
    **/
    @AuraEnabled
    public static void updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        try {
            if (eventId == null) {
                throw new AuraHandledException('이벤트 ID가 필요합니다');
            }
            
            if (!Schema.sObjectType.My_Event__c.isUpdateable()) {
                throw new AuraHandledException('이벤트 수정 권한이 없습니다');
            }
            
            validateEventOwnership(eventId);
            
            My_Event__c eventToUpdate = new My_Event__c(Id = eventId);
            
            if (String.isNotBlank(newStartDate)) { 
                eventToUpdate.Start_Date__c = Date.valueOf(newStartDate); 
            }
            if (String.isNotBlank(newEndDate)) { 
                eventToUpdate.End_Date__c = Date.valueOf(newEndDate); 
            }
            
            update eventToUpdate;
        } catch (DmlException dmlEx) {
            System.debug('이벤트 업데이트 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('이벤트 업데이트 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('이벤트 업데이트 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 업데이트 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 이벤트 관련 비용 정보 삭제 메소드
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 삭제할 이벤트ID
    * @exception AuraHandledException 이벤트 ID가 null이거나 삭제 권한이 없는 경우
    **/
    @AuraEnabled
    public static void deleteEvent(Id eventId) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            if (eventId == null) {
                throw new AuraHandledException('이벤트 ID가 필요합니다');
            }
            
            if (!Schema.sObjectType.My_Event__c.isDeletable()) {
                throw new AuraHandledException('이벤트 삭제 권한이 없습니다');
            }
            if (!Schema.sObjectType.Cost_Detail__c.isDeletable()) {
                throw new AuraHandledException('비용 상세 삭제 권한이 없습니다');
            }
            
            validateEventOwnership(eventId);
            
            deleteCostDetails(eventId);
            delete new My_Event__c(Id = eventId);
            
        } catch (DmlException dmlEx) {
            Database.rollback(sp);
            System.debug('이벤트 삭제 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('이벤트 삭제 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('이벤트 삭제 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 삭제 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    /**
    * @description 실제 저장 내부 메소드 / test시 isTestVisible?사용하기
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param request 이벤트 저장에 필요한 정보가 담긴 EventSaveRequest
    * @return String | 저장된 이벤트ID
    * @exception AuraHandledException 입력 검증 실패, 권한 없음, DML 오류 등이 발생한 경우
    **/
    @TestVisible
    private static String saveEventAndCostsInternal(EventSaveRequest request) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            validateEventInputs(request.title, request.department, request.recordType);
            
            // 권한 검증
            if (request.recordId == null) {
                if (!Schema.sObjectType.My_Event__c.isCreateable()) {
                    throw new AuraHandledException('이벤트 생성 권한이 없습니다');
                }
                if (!Schema.sObjectType.Cost_Detail__c.isCreateable()) {
                    throw new AuraHandledException('비용 상세 생성 권한이 없습니다');
                }
            } else {
                if (!Schema.sObjectType.My_Event__c.isUpdateable()) {
                    throw new AuraHandledException('이벤트 수정 권한이 없습니다');
                }
                if (!Schema.sObjectType.Cost_Detail__c.isUpdateable()) {
                    throw new AuraHandledException('비용 상세 수정 권한이 없습니다');
                }
            }
            
            My_Event__c eventRecord = upsertEventRecord(request);
            
            if (!isPersonalActivity(request.recordType)) {
                processCostDetails(eventRecord.Id, request.costDetailsJson, request.department);
            }
            
            return eventRecord.Id;

        } catch (DmlException dmlEx) {
            Database.rollback(sp);
            System.debug('DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('예외 발생: ' + e.getMessage());
            throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    /**
    * @description 이벤트 입력값의 유효성 검증
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param title 이벤트 제목
    * @param department 부서명
    * @param recordType 레코드 타입
    * @exception AuraHandledException 필수 입력값이 누락된 경우
    **/
    @TestVisible
    private static void validateEventInputs(String title, String department, String recordType) {
        try {
            List<String> errors = new List<String>();
            
            if (String.isBlank(title)) {
                errors.add('제목을 입력해주세요');
            }
            if (!isPersonalActivity(recordType) && String.isBlank(department)) {
                errors.add('부서를 선택해주세요');
            }
            if (!errors.isEmpty()) {
                throw new AuraHandledException(String.join(errors, '\n'));
            }
        } catch (Exception e) {
            System.debug('입력 검증 오류: ' + e.getMessage());
            throw new AuraHandledException('입력 검증 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 현재 사용자가 해당 이벤트의 소유자인지 확인
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 검증할 이벤트ID
    * @exception AuraHandledException 이벤트를 찾을 수 없거나 소유자가 아닌 경우
    **/
    @TestVisible
    private static void validateEventOwnership(Id eventId) {
        try {
            if (!Schema.sObjectType.My_Event__c.isAccessible()) {
                throw new AuraHandledException('이벤트 읽기 권한이 없습니다');
            }
            
            List<My_Event__c> events = [
                SELECT Id FROM My_Event__c 
                WHERE Id = :eventId AND OwnerId = :UserInfo.getUserId() 
                LIMIT 1
            ];
            
            if (events.isEmpty()) {
                throw new AuraHandledException('권한이 없습니다');
            }
        } catch (Exception e) {
            System.debug('이벤트 소유권 검증 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 소유권 검증 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 이벤트 레코드 생성,수정
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param request 이벤트 정보가 담긴 EventSaveRequest 객체
    * @return My_Event__c | 저장된 이벤트 레코드
    * @exception AuraHandledException DML 오류 또는 이벤트 레코드 저장 중 오류가 발생한 경우
    **/
    @TestVisible
    private static My_Event__c upsertEventRecord(EventSaveRequest request) {
        try {
            My_Event__c eventRecord;
            
            if (request.recordId == null) {
                eventRecord = new My_Event__c();
            } else {
                eventRecord = new My_Event__c(Id = request.recordId);
            }
            
            if (String.isNotBlank(request.title)) {
                eventRecord.Name = request.title;
            } else {
                eventRecord.Name = 'Untitled Event';
            }
            
            eventRecord.Title__c = eventRecord.Name;
            eventRecord.Description__c = request.description;
            eventRecord.Location__c = request.location;
            eventRecord.Related_Record_Id__c = request.relatedId;
            eventRecord.Related_Record_Type__c = request.recordType;
            
            if (String.isNotBlank(request.startDate)) {
                eventRecord.Start_Date__c = Date.valueOf(request.startDate);
            }
            if (String.isNotBlank(request.endDate)) {
                eventRecord.End_Date__c = Date.valueOf(request.endDate);
            }
            
            upsert eventRecord;
            return eventRecord;
        } catch (DmlException dmlEx) {
            System.debug('이벤트 레코드 저장 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('이벤트 레코드 저장 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('이벤트 레코드 저장 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 레코드 저장 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 이벤트에 연관된 비용 상세 처리(기존 삭제->신규 생성)
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 비용이 연관될 이벤트ID
    * @param costDetailsJson 비용 상세정보 JSON 문자열
    * @param department 부서명
    * @exception AuraHandledException DML 오류 또는 비용 상세 처리 중 오류가 발생한 경우
    **/
    @TestVisible
    private static void processCostDetails(Id eventId, String costDetailsJson, String department) {
        try {
            deleteCostDetails(eventId);
            
            if (String.isNotBlank(costDetailsJson)) {
                List<Cost_Detail__c> costsToInsert = buildValidatedCostDetails(eventId, costDetailsJson, department);
                if (!costsToInsert.isEmpty()) {
                    insert costsToInsert;
                }
            }
        } catch (DmlException dmlEx) {
            System.debug('비용 상세 처리 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('비용 상세 처리 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('비용 상세 처리 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 상세 처리 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 검증된 JSON 문자열 Cost_Detail__c 레코드 리스트로 변환처리
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 비용이 연관될 이벤트ID
    * @param costDetailsJson 비용 상세정보 JSON문자열
    * @param department 부서명
    * @return List<Cost_Detail__c> | 검증된 비용 상세 레코드 리스트
    * @exception AuraHandledException JSON 파싱 오류 또는 비용 데이터 형식이 올바르지 않은 경우
    **/
    @TestVisible
    private static List<Cost_Detail__c> buildValidatedCostDetails(Id eventId, String costDetailsJson, String department) {
        try {
            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson); 
            String deptValue = String.isNotBlank(department) ? department : DEFAULT_DEPARTMENT;
            
            for (Object costObj : parsedCosts) {
                Cost_Detail__c costDetail = buildCostDetail(eventId, costObj, deptValue);
                if (costDetail != null) {
                    costsToInsert.add(costDetail);
                }
            }
            
            return costsToInsert;
        } catch (Exception e) {
            System.debug('비용 상세 데이터 구성 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 데이터 형식이 올바르지 않습니다: ' + e.getMessage());
        }
    }

    /**
    * @description 개별 비용 레코드 생성
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 비용이 연관될 이벤트ID
    * @param costObj 비용 정보 객체
    * @param department 부서명
    * @return Cost_Detail__c | 생성될 비용 상세 레코드
    * @exception 예외 발생 시 null 반환하여 개별 아이템 오류 처리
    **/
    @TestVisible
    private static Cost_Detail__c buildCostDetail(Id eventId, Object costObj, String department) {
        try {
            if (costObj == null) {
                return null;
            }
            
            Map<String, Object> costMap = (Map<String, Object>)costObj;
            String costType = String.valueOf(costMap.get('type'));
            Object amountObj = costMap.get('amount');
            
            if (String.isBlank(costType) || amountObj == null) {
                return null;
            }
            
            Decimal amount = Decimal.valueOf(String.valueOf(amountObj));
            if (amount < MIN_COST_AMOUNT) {
                return null;
            }
            
            return new Cost_Detail__c(
                My_Event__c = eventId,
                Cost_Type__c = costType,
                Amount__c = amount,
                department__c = department
            );
        } catch (Exception e) {
            System.debug('비용 상세 아이템 구성 오류: ' + e.getMessage());
            return null; // 개별 아이템 오류는 null 반환으로 처리
        }
    }

    /**
    * @description 특정 이벤트에 연관된 비용 이벤트들 삭제처리
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param eventId 비용을 삭제할 이벤트ID
    * @exception AuraHandledException 읽기 권한이 없거나 DML 오류가 발생한 경우
    **/
    @TestVisible
    private static void deleteCostDetails(Id eventId) {
        try {
            if (!Schema.sObjectType.Cost_Detail__c.isAccessible()) {
                throw new AuraHandledException('비용 상세 읽기 권한이 없습니다');
            }
            
            List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!existingCosts.isEmpty()) {
                delete existingCosts;
            }
        } catch (DmlException dmlEx) {
            System.debug('비용 상세 삭제 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('비용 상세 삭제 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('비용 상세 삭제 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 상세 삭제 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    /**
    * @description record type이 개인활동 인지 확인
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param recordType 확인할 레코드 타입
    * @return Boolean | 개인활동일시 true, 아닐시 false반환
    * @exception
    **/
    @TestVisible
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    /**
    * @description 이벤트와 연결된 salesforce 오브젝트 name 가져옴
    * @author sejin.park@dkbmc.com | 2025-07-22 
    * @param event 관련 레코드 정보가 포함된 이벤트 객체
    * @return String | 관련 레코드의 이름
    * @exception
    **/
    @TestVisible
    private static String getRelatedRecordName(My_Event__c event) {
        try {
            if (String.isBlank(event?.Related_Record_Type__c) || String.isBlank(event?.Related_Record_Id__c)) {
                return '';
            }
            
            String recordType = event.Related_Record_Type__c;
            String recordId = event.Related_Record_Id__c;
            
            if (recordType == 'Account') {
                if (!Schema.sObjectType.Account.isAccessible()) {
                    return '';
                }
                List<Account> accounts = [SELECT Name FROM Account WHERE Id = :recordId LIMIT 1];
                return accounts.isEmpty() ? '' : accounts[0].Name;
                
            } else if (recordType == 'Contact') {
                if (!Schema.sObjectType.Contact.isAccessible()) {
                    return '';
                }
                List<Contact> contacts = [SELECT Name FROM Contact WHERE Id = :recordId LIMIT 1];
                return contacts.isEmpty() ? '' : contacts[0].Name;
                
            } else if (recordType == 'Opportunity') {
                if (!Schema.sObjectType.Opportunity.isAccessible()) {
                    return '';
                }
                List<Opportunity> opportunities = [SELECT Name FROM Opportunity WHERE Id = :recordId LIMIT 1];
                return opportunities.isEmpty() ? '' : opportunities[0].Name;
            }
            
            return '';
        } catch (Exception e) {
            System.debug('관련 레코드 조회 실패: ' + e.getMessage());
            return '';
        }
    }
}