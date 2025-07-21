/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-21
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    
    // 상수 정의
    private static final String DEFAULT_DEPARTMENT = '개발팀';
    private static final String PERSONAL_RECORD_TYPE = 'Personal';
    private static final String ACCOUNT_RECORD_TYPE = 'Account';
    private static final Decimal MIN_COST_AMOUNT = 0.01;

    // wrapper class(이벤트+비용+account)
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
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
    
    // 이벤트 목록 가져오기
    @AuraEnabled(cacheable=true) // 같은 파라미터 호출시 캐시된 결과 사용
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
            return CalendarEventSelector.selectEventsByDateRange(startDate, endDate); // 실제 조회
        } catch (Exception e) {
            System.debug('이벤트 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    // 이벤트 상세 정보 가져옴
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
            // 비용 정보 처리
            wrapper.costs = (wrapper.event.Cost_Details1__r != null) ? 
                           wrapper.event.Cost_Details1__r : new List<Cost_Detail__c>();
            wrapper.accountName = getAccountName(wrapper.event);
            return wrapper;
        } catch (Exception e) {
            System.debug('이벤트 상세 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('이벤트 상세 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

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

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getDepartmentOptions() {
        try {
            return CalendarEventSelector.selectDepartmentOptions();
        } catch (Exception e) {
            System.debug('부서 옵션 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('부서 옵션 조회 중 오류가 발생했습니다');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCostTypeOptions() {
        try {
            return CalendarEventSelector.selectCostTypeOptions();
        } catch (Exception e) {
            System.debug('비용 유형 옵션 조회 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 유형 옵션 조회 중 오류가 발생했습니다');
        }
    }
    
    // lwc에서 호출하는 public 메소드
    @AuraEnabled
    @SuppressWarnings('PMD.ExcessiveParameterList') // 경고 무시 이사님께 여쭤보기
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        EventSaveRequest request = new EventSaveRequest();
        request.recordId = recordId;
        request.title = title;
        request.startDate = startDate;
        request.endDate = endDate;
        request.description = description;
        request.location = location;
        request.department = department;
        request.relatedId = relatedId;
        request.recordType = recordType;
        request.costDetailsJson = costDetailsJson;
        
        return saveEventAndCostsInternal(request);
    }
    
    // 실제 저장 로직
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
            // 이벤트 저장
            My_Event__c eventRecord = upsertEventRecord(request);
            
            if (!isPersonalActivity(request.recordType)) {
                processCostDetails(eventRecord.Id, request.costDetailsJson, request.department);
            }
            
            return eventRecord.Id;

        } catch (DmlException dmlEx) {
            Database.rollback(sp); // 변경사항 되돌림 (savepoint())
            System.debug('DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('예외 발생: ' + e.getMessage());
            throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
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

    // === HELPER METHODS ===
    
    private static void validateEventInputs(String title, String department, String recordType) {
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
    }

    private static void validateEventOwnership(Id eventId) {
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
    }

    // 이벤트 레코드 생성, 수정
    private static My_Event__c upsertEventRecord(EventSaveRequest request) {
        My_Event__c eventRecord;
        
        if (request.recordId == null) {
            eventRecord = new My_Event__c();
        } else {
            eventRecord = new My_Event__c(Id = request.recordId); // 기존 레코드 참조
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
    }

    // 비용 상세 처리
    private static void processCostDetails(Id eventId, String costDetailsJson, String department) {
        deleteCostDetails(eventId);
        
        if (String.isNotBlank(costDetailsJson)) {
            List<Cost_Detail__c> costsToInsert = buildValidatedCostDetails(eventId, costDetailsJson, department);
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
        }
    }

    private static List<Cost_Detail__c> buildValidatedCostDetails(Id eventId, String costDetailsJson, String department) {
        List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
        
        try {
            List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
            
            // 부서 기본값 설정
            String deptValue;
            if (String.isNotBlank(department)) {
                deptValue = department;
            } else {
                deptValue = DEFAULT_DEPARTMENT;
            }
            //각 비용 항목 처리
            for (Object costObj : parsedCosts) {
                Cost_Detail__c costDetail = buildCostDetail(eventId, costObj, deptValue);
                if (costDetail != null) {
                    costsToInsert.add(costDetail);
                }
            }
        } catch (Exception jsonEx) {
            System.debug('JSON 파싱 오류: ' + jsonEx.getMessage());
            throw new AuraHandledException('비용 데이터 형식이 올바르지 않습니다');
        }
        
        return costsToInsert;
    }

    private static Cost_Detail__c buildCostDetail(Id eventId, Object costObj, String department) {
        if (costObj == null) {
            return null;
        }
        
        Map<String, Object> costMap = (Map<String, Object>)costObj;
        String costType = String.valueOf(costMap.get('type'));
        Object amountObj = costMap.get('amount');
        
        if (String.isBlank(costType) || amountObj == null) {
            return null;
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            if (amount < MIN_COST_AMOUNT) {
                return null;
            }
        } catch (Exception e) {
            System.debug('금액 파싱 오류: ' + e.getMessage());
            return null;
        }
        
        return new Cost_Detail__c(
            My_Event__c = eventId,
            Cost_Type__c = costType,
            Amount__c = amount,
            department__c = department
        );
    }

    private static void deleteCostDetails(Id eventId) {
        try {
            if (!Schema.sObjectType.Cost_Detail__c.isAccessible()) {
                throw new AuraHandledException('비용 상세 읽기 권한이 없습니다');
            }
            
            List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!existingCosts.isEmpty()) {
                delete existingCosts;
            }
        } catch (DmlException e) {
            System.debug('비용 상세 삭제 오류: ' + e.getMessage());
            throw new AuraHandledException('비용 상세 삭제 중 오류가 발생했습니다');
        }
    }

    // === 유틸리티 메서드들 ===
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    private static String getAccountName(My_Event__c event) {
        if (event?.Related_Record_Type__c != ACCOUNT_RECORD_TYPE) {
            return '';
        }
        
        if (String.isBlank(event.Related_Record_Id__c)) {
            return '';
        }
        
        try {
            if (!Schema.sObjectType.Account.isAccessible()) {
                return '';
            }
            
            List<Account> accounts = [SELECT Name FROM Account WHERE Id = :event.Related_Record_Id__c LIMIT 1];
            if (accounts.isEmpty()) {
                return '';
            } else {
                return accounts[0].Name;
            }
        } catch (Exception e) {
            System.debug('Account 조회 실패: ' + e.getMessage());
            return '';
        }
    }
}