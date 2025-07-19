/**
 * @description       : Calendar App Controller (간결하게 리팩토링)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-19
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    
    // === 상수 정의 ===
    private static final String DEFAULT_DEPARTMENT = Label.LABEL_DEFAULT_DEPT;
    private static final String PERSONAL_RECORD_TYPE = 'Personal';
    private static final String ACCOUNT_RECORD_TYPE = 'Account';
    
    // === Wrapper Classes ===
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // === READ OPERATIONS (Cacheable) ===
    
    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        try {
            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            return CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        try {
            EventWrapper wrapper = new EventWrapper();
            wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
            wrapper.costs = wrapper.event.Cost_Details1__r;
            wrapper.accountName = getAccountName(wrapper.event);
            return wrapper;
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true) 
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        try {
            Date start = Date.valueOf(startDate);
            Date endDateObj = Date.valueOf(endDate);
            return CalendarEventSelector.selectMonthlyCostSummary(start, endDateObj);
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_COST_SUMMARY_ERROR + ': ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Account> getAccountList() {
        return CalendarEventSelector.selectAccounts();
    }

    @AuraEnabled(cacheable=true)
    public static List<Contact> getContactList() {
        return CalendarEventSelector.selectContacts();
    }

    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getOpportunityList() {
        return CalendarEventSelector.selectOpportunities();
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getDepartmentOptions() {
        return CalendarEventSelector.selectDepartmentOptions();
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCostTypeOptions() {
        return CalendarEventSelector.selectCostTypeOptions();
    }

    // === WRITE OPERATIONS ===
    
    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            // 1. 입력 검증
            validateInputs(title);
            
            // 2. 이벤트 저장
            My_Event__c eventRecord = saveEventRecord(recordId, title, description, 
                location, relatedId, recordType, startDate, endDate);
            
            // 3. 비용 상세 처리 (개인 활동 제외)
            if (!isPersonalActivity(recordType)) {
                saveCostDetails(eventRecord.Id, costDetailsJson, department);
            }
            
            return eventRecord.Id;

        } catch (Exception e) {
            handleException(e);
            return null;
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        try {
            My_Event__c eventToUpdate = new My_Event__c(Id = eventId);
            
            if (String.isNotBlank(newStartDate)) { 
                eventToUpdate.Start_Date__c = Date.valueOf(newStartDate); 
            }
            if (String.isNotBlank(newEndDate)) { 
                eventToUpdate.End_Date__c = Date.valueOf(newEndDate); 
            }

            update eventToUpdate;
            return Label.LABEL_SUCCESS_SAVE;
            
        } catch (Exception e) {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_UPDATE_ERROR, new String[]{ e.getMessage() }));
        }
    }

    @AuraEnabled
    public static String deleteEvent(Id eventId) {
        try {
            // 관련 비용 상세 삭제
            deleteCostDetails(eventId);
            
            // 이벤트 삭제
            delete new My_Event__c(Id = eventId);
            
            return Label.LABEL_SUCCESS_SAVE;
            
        } catch (Exception e) {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_DELETE_ERROR, new String[]{ e.getMessage() }));
        }
    }

    // === HELPER METHODS ===
    
    /**
     * Account 이름 조회
     */
    private static String getAccountName(My_Event__c event) {
        if (event?.Related_Record_Type__c == ACCOUNT_RECORD_TYPE && 
            String.isNotBlank(event.Related_Record_Id__c)) {
            try {
                List<Account> accounts = [SELECT Name FROM Account WHERE Id = :event.Related_Record_Id__c LIMIT 1];
                return accounts.isEmpty() ? '' : accounts[0].Name;
            } catch (Exception e) {
                return '';
            }
        }
        return '';
    }
    
    /**
     * 입력값 검증
     */
    private static void validateInputs(String title) {
        if (String.isBlank(title)) {
            throw new AuraHandledException(Label.LABEL_REQUIRED_TITLE);
        }
    }
    
    /**
     * 이벤트 레코드 저장
     */
    private static My_Event__c saveEventRecord(Id recordId, String title, String description, 
            String location, String relatedId, String recordType, String startDate, String endDate) {
        
        My_Event__c eventRecord = recordId == null ? new My_Event__c() : new My_Event__c(Id = recordId);
        
        // 기본 필드 설정
        eventRecord.Name = title;
        eventRecord.Title__c = title;
        eventRecord.Description__c = description;
        eventRecord.Location__c = location;
        eventRecord.Related_Record_Id__c = relatedId;
        eventRecord.Related_Record_Type__c = recordType;
        
        // 날짜 필드 설정
        if (String.isNotBlank(startDate)) {
            eventRecord.Start_Date__c = Date.valueOf(startDate);
        }
        if (String.isNotBlank(endDate)) {
            eventRecord.End_Date__c = Date.valueOf(endDate);
        }
        
        upsert eventRecord;
        return eventRecord;
    }
    
    /**
     * 개인 활동 여부 확인
     */
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    /**
     * 비용 상세 저장
     */
    private static void saveCostDetails(Id eventId, String costDetailsJson, String department) {
        // 기존 비용 삭제
        deleteCostDetails(eventId);
        
        // 새 비용 데이터 삽입
        if (String.isNotBlank(costDetailsJson)) {
            List<Cost_Detail__c> costsToInsert = createCostDetails(eventId, costDetailsJson, department);
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
        }
    }
    
    /**
     * 기존 비용 상세 삭제
     */
    private static void deleteCostDetails(Id eventId) {
        List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        if (!existingCosts.isEmpty()) {
            delete existingCosts;
        }
    }
    
    /**
     * 비용 상세 레코드 생성
     */
    private static List<Cost_Detail__c> createCostDetails(Id eventId, String costDetailsJson, String department) {
        List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
        
        try {
            List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
            String deptValue = String.isNotBlank(department) ? department : DEFAULT_DEPARTMENT;
            
            for (Object costObj : parsedCosts) {
                Cost_Detail__c costDetail = createSingleCostDetail(eventId, costObj, deptValue);
                if (costDetail != null) {
                    costsToInsert.add(costDetail);
                }
            }
        } catch (Exception jsonEx) {
            throw new AuraHandledException(Label.LABEL_INVALID_COST_JSON);
        }
        
        return costsToInsert;
    }
    
    /**
     * 단일 비용 상세 레코드 생성
     */
    private static Cost_Detail__c createSingleCostDetail(Id eventId, Object costObj, String department) {
        Map<String, Object> costMap = (Map<String, Object>)costObj;
        
        String costType = String.valueOf(costMap.get('type'));
        Object amountObj = costMap.get('amount');
        
        // 유효성 검사
        if (String.isBlank(costType) || amountObj == null) {
            return null;
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            if (amount <= 0) {
                return null;
            }
        } catch (Exception e) {
            return null;
        }
        
        return new Cost_Detail__c(
            My_Event__c = eventId,
            Cost_Type__c = costType,
            Amount__c = amount,
            department__c = department
        );
    }
    
    /**
     * 예외 처리
     */
    private static void handleException(Exception e) {
        String errorMessage = e.getMessage();
        if (e instanceof AuraHandledException) {
            throw e;
        } else {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_SAVE_ERROR, new String[]{ errorMessage }));
        }
    }
}