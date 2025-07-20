/**
 * @description       : Calendar App Controller (예외처리 강화 버전)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-20
 */
public with sharing class CalendarAppController {
    
    // === 상수 정의 ===
    private static final String DEFAULT_DEPARTMENT = Label.LABEL_DEFAULT_DEPT;
    private static final String PERSONAL_RECORD_TYPE = 'Personal';
    private static final String ACCOUNT_RECORD_TYPE = 'Account';
    private static final Decimal MIN_COST_AMOUNT = 0.01;

    // === Wrapper Classes ===
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // === READ OPERATIONS ===
    
    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        try {
            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            return CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        } catch (Exception e) {
            System.debug('이벤트 조회 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        try {
            if (eventId == null) {
                throw new AuraHandledException(Label.LABEL_INVALID_EVENT_ID);
            }

            EventWrapper wrapper = new EventWrapper();
            wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
            wrapper.costs = wrapper.event.Cost_Details1__r;
            wrapper.accountName = getAccountName(wrapper.event);
            return wrapper;
        } catch (Exception e) {
            System.debug('이벤트 상세 조회 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_DETAIL_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true) 
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        try {
            Date start = Date.valueOf(startDate);
            Date endDateObj = Date.valueOf(endDate);
            return CalendarEventSelector.selectMonthlyCostSummary(start, endDateObj);
        } catch (Exception e) {
            System.debug('비용 요약 조회 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_COST_SUMMARY_ERROR + ': ' + e.getMessage());
        }
    }

    // === WRITE OPERATIONS (예외처리 강화) ===
    
    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            // 입력값 검증
            validateEventInputs(title, department, recordType);
            
            // 보안 검증 추가
            validateSecurityPermissions(recordId);
            
            // 이벤트 저장
            My_Event__c eventRecord = saveEventRecord(recordId, title, description, 
                location, relatedId, recordType, startDate, endDate);
            
            // 비용 상세 저장 (개인 활동이 아닌 경우만)
            if (!isPersonalActivity(recordType)) {
                saveCostDetailsWithValidation(eventRecord.Id, costDetailsJson, department);
            }
            
            return eventRecord.Id;

        } catch (DmlException dmlEx) {
            Database.rollback(sp);
            System.debug('DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_SAVE_ERROR + ': ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('예외 발생: ' + e.getMessage());
            handleException(e);
            return null;
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        try {
            if (eventId == null) {
                throw new AuraHandledException(Label.LABEL_INVALID_EVENT_ID);
            }

            // 보안 검증
            validateEventOwnership(eventId);
            
            My_Event__c eventToUpdate = new My_Event__c(Id = eventId);
            
            if (String.isNotBlank(newStartDate)) { 
                eventToUpdate.Start_Date__c = Date.valueOf(newStartDate); 
            }
            if (String.isNotBlank(newEndDate)) { 
                eventToUpdate.End_Date__c = Date.valueOf(newEndDate); 
            }

            update eventToUpdate;
            return Label.LABEL_SUCCESS_UPDATE;
            
        } catch (DmlException dmlEx) {
            System.debug('이벤트 업데이트 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_UPDATE_ERROR + ': ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            System.debug('이벤트 업데이트 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_UPDATE_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String deleteEvent(Id eventId) {
        Savepoint sp = Database.setSavepoint();
        
        try {
            if (eventId == null) {
                throw new AuraHandledException(Label.LABEL_INVALID_EVENT_ID);
            }

            // 보안 검증
            validateEventOwnership(eventId);
            
            deleteCostDetails(eventId);
            delete new My_Event__c(Id = eventId);
            
            return Label.LABEL_SUCCESS_DELETE;
        } catch (DmlException dmlEx) {
            Database.rollback(sp);
            System.debug('이벤트 삭제 DML 오류: ' + dmlEx.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_DELETE_ERROR + ': ' + dmlEx.getDmlMessage(0));
        } catch (Exception e) {
            Database.rollback(sp);
            System.debug('이벤트 삭제 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_EVENT_DELETE_ERROR + ': ' + e.getMessage());
        }
    }

    // === 보안 검증 메서드 추가 ===
    private static void validateSecurityPermissions(Id recordId) {
        // 신규 생성 시 권한 확인
        if (recordId == null) {
            if (!Schema.sObjectType.My_Event__c.isCreateable() || 
                !Schema.sObjectType.Cost_Detail__c.isCreateable()) {
                throw new AuraHandledException(Label.LABEL_NO_CREATE_PERMISSION);
            }
        } else {
            // 업데이트 시 권한 확인
            if (!Schema.sObjectType.My_Event__c.isUpdateable() || 
                !Schema.sObjectType.Cost_Detail__c.isUpdateable()) {
                throw new AuraHandledException(Label.LABEL_NO_UPDATE_PERMISSION);
            }
        }
    }

    private static void validateEventOwnership(Id eventId) {
        List<My_Event__c> events = [SELECT Id FROM My_Event__c WHERE Id = :eventId AND OwnerId = :UserInfo.getUserId() LIMIT 1];
        if (events.isEmpty()) {
            throw new AuraHandledException(Label.LABEL_NO_PERMISSION);
        }
    }

    // === HELPER METHODS ===
    
    private static void validateEventInputs(String title, String department, String recordType) {
        List<String> errors = new List<String>();
        
        if (String.isBlank(title)) {
            errors.add(Label.LABEL_REQUIRED_TITLE);
        }
        
        if (!isPersonalActivity(recordType) && String.isBlank(department)) {
            errors.add(Label.LABEL_REQUIRED_DEPARTMENT);
        }
        
        if (!errors.isEmpty()) {
            throw new AuraHandledException(String.join(errors, '\n'));
        }
    }
    
    private static String getAccountName(My_Event__c event) {
        if (event?.Related_Record_Type__c == ACCOUNT_RECORD_TYPE && 
            String.isNotBlank(event.Related_Record_Id__c)) {
            try {
                List<Account> accounts = [SELECT Name FROM Account WHERE Id = :event.Related_Record_Id__c LIMIT 1];
                return accounts.isEmpty() ? '' : accounts[0].Name;
            } catch (Exception e) {
                System.debug('Account 조회 실패: ' + e.getMessage());
                return '';
            }
        }
        return '';
    }
    
    private static My_Event__c saveEventRecord(Id recordId, String title, String description, 
            String location, String relatedId, String recordType, String startDate, String endDate) {
        
        My_Event__c eventRecord = recordId == null ? new My_Event__c() : new My_Event__c(Id = recordId);
        
        eventRecord.Name = title;
        eventRecord.Title__c = title;
        eventRecord.Description__c = description;
        eventRecord.Location__c = location;
        eventRecord.Related_Record_Id__c = relatedId;
        eventRecord.Related_Record_Type__c = recordType;
        
        if (String.isNotBlank(startDate)) {
            eventRecord.Start_Date__c = Date.valueOf(startDate);
        }
        if (String.isNotBlank(endDate)) {
            eventRecord.End_Date__c = Date.valueOf(endDate);
        }
        
        upsert eventRecord;
        return eventRecord;
    }
    
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    private static void saveCostDetailsWithValidation(Id eventId, String costDetailsJson, String department) {
        deleteCostDetails(eventId);
        
        if (String.isNotBlank(costDetailsJson)) {
            List<Cost_Detail__c> costsToInsert = createValidatedCostDetails(eventId, costDetailsJson, department);
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
        }
    }
    
    private static void deleteCostDetails(Id eventId) {
        try {
            List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!existingCosts.isEmpty()) {
                delete existingCosts;
            }
        } catch (DmlException e) {
            System.debug('비용 상세 삭제 오류: ' + e.getMessage());
            throw new AuraHandledException(Label.LABEL_COST_DELETE_ERROR);
        }
    }
    
    private static List<Cost_Detail__c> createValidatedCostDetails(Id eventId, String costDetailsJson, String department) {
        List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
        
        try {
            List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
            String deptValue = String.isNotBlank(department) ? department : DEFAULT_DEPARTMENT;
            
            for (Object costObj : parsedCosts) {
                Cost_Detail__c costDetail = createAndValidateCostDetail(eventId, costObj, deptValue);
                if (costDetail != null) {
                    costsToInsert.add(costDetail);
                }
            }
        } catch (Exception jsonEx) {
            System.debug('JSON 파싱 오류: ' + jsonEx.getMessage());
            throw new AuraHandledException(Label.LABEL_INVALID_COST_JSON);
        }
        
        return costsToInsert;
    }
    
    private static Cost_Detail__c createAndValidateCostDetail(Id eventId, Object costObj, String department) {
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
    
    private static void handleException(Exception e) {
        String errorMessage = e.getMessage();
        System.debug('예외 발생: ' + errorMessage);
        
        if (e instanceof AuraHandledException) {
            throw e;
        } else {
            throw new AuraHandledException(Label.LABEL_GENERAL_ERROR + ': ' + errorMessage);
        }
    }

    // === 기존 READ 메서드들 (변경 없음) ===
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccountList() {
        try {
            return CalendarEventSelector.selectAccounts();
        } catch (Exception e) {
            throw new AuraHandledException('Account 목록을 불러오는 중 오류가 발생했습니다.');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Contact> getContactList() {
        try {
            return CalendarEventSelector.selectContacts();
        } catch (Exception e) {
            throw new AuraHandledException('Contact 목록을 불러오는 중 오류가 발생했습니다.');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getOpportunityList() {
        try {
            return CalendarEventSelector.selectOpportunities();
        } catch (Exception e) {
            throw new AuraHandledException('Opportunity 목록을 불러오는 중 오류가 발생했습니다.');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getDepartmentOptions() {
        try {
            return CalendarEventSelector.selectDepartmentOptions();
        } catch (Exception e) {
            throw new AuraHandledException('부서 옵션을 불러오는 중 오류가 발생했습니다.');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCostTypeOptions() {
        try {
            return CalendarEventSelector.selectCostTypeOptions();
        } catch (Exception e) {
            throw new AuraHandledException('비용 유형 옵션을 불러오는 중 오류가 발생했습니다.');
        }
    }
}