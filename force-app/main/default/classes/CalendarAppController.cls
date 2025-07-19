/**
 * @description       : Calendar App Controller (비즈니스 로직 강화 버전)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-19
 * @last modified by  : sejin.park@dkbmc.com
**/
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

    // DTO for transformed event data (JS 변환 로직을 Apex로 이관)
    public class EventDisplayData {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String startDate;
        @AuraEnabled public String endDate;
        @AuraEnabled public Boolean allDay;
    }

    // === READ OPERATIONS (Cacheable) ===
    
    @AuraEnabled(cacheable=true)
    public static List<EventDisplayData> getEventsForDisplay(String startStr, String endStr) {
        try {
            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
            
            // JS에서 하던 변환 로직을 Apex에서 처리
            List<EventDisplayData> displayEvents = new List<EventDisplayData>();
            for (My_Event__c event : events) {
                EventDisplayData displayEvent = new EventDisplayData();
                displayEvent.id = event.Id;
                displayEvent.title = event.Title__c;
                displayEvent.startDate = String.valueOf(event.Start_Date__c);
                displayEvent.endDate = String.valueOf(event.End_Date__c.addDays(1)); // +1일 처리
                displayEvent.allDay = false;
                displayEvents.add(displayEvent);
            }
            
            return displayEvents;
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR + ': ' + e.getMessage());
        }
    }

    // 기존 호환성을 위한 메서드 유지
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
    public static Map<String, String> getMonthlyCostSummaryFormatted(String startDate, String endDate) {
        try {
            Date start = Date.valueOf(startDate);
            Date endDateObj = Date.valueOf(endDate);
            Map<String, Decimal> rawSummary = CalendarEventSelector.selectMonthlyCostSummary(start, endDateObj);
            
            // JS에서 하던 통화 포맷팅을 Apex에서 처리
            Map<String, String> formattedSummary = new Map<String, String>();
            for (String costType : rawSummary.keySet()) {
                Decimal amount = rawSummary.get(costType);
                formattedSummary.put(costType, formatCurrency(amount));
            }
            
            return formattedSummary;
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_COST_SUMMARY_ERROR + ': ' + e.getMessage());
        }
    }

    // 기존 호환성을 위한 메서드 유지
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

    // === WRITE OPERATIONS (비즈니스 로직 강화) ===
    
    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            // 1. 서버사이드 검증 강화 (JS에서 이관)
            validateEventInputs(title, department, recordType);
            
            // 2. 이벤트 저장
            My_Event__c eventRecord = saveEventRecord(recordId, title, description, 
                location, relatedId, recordType, startDate, endDate);
            
            // 3. 비용 상세 처리 (검증 로직 포함)
            if (!isPersonalActivity(recordType)) {
                saveCostDetailsWithValidation(eventRecord.Id, costDetailsJson, department);
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
            deleteCostDetails(eventId);
            delete new My_Event__c(Id = eventId);
            return Label.LABEL_SUCCESS_SAVE;
        } catch (Exception e) {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_DELETE_ERROR, new String[]{ e.getMessage() }));
        }
    }

    // === HELPER METHODS (비즈니스 로직 강화) ===
    
    /**
     * JS에서 이관된 서버사이드 검증
     */
    private static void validateEventInputs(String title, String department, String recordType) {
        List<String> errors = new List<String>();
        
        if (String.isBlank(title)) {
            errors.add(Label.LABEL_REQUIRED_TITLE);
        }
        
        if (!isPersonalActivity(recordType) && String.isBlank(department)) {
            errors.add('부서는 필수 선택 항목입니다.');
        }
        
        if (!errors.isEmpty()) {
            throw new AuraHandledException(String.join(errors, '\n'));
        }
    }
    
    /**
     * JS에서 이관된 통화 포맷팅
     */
    private static String formatCurrency(Decimal amount) {
        if (amount == null) amount = 0;
        return '₩' + String.valueOf(amount.format());
    }
    
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
                System.debug('Account 조회 실패: ' + e.getMessage());
                return '';
            }
        }
        return '';
    }
    
    /**
     * 이벤트 레코드 저장
     */
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
    
    /**
     * 개인 활동 여부 확인
     */
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    /**
     * 비용 상세 저장 (검증 로직 강화)
     */
    private static void saveCostDetailsWithValidation(Id eventId, String costDetailsJson, String department) {
        deleteCostDetails(eventId);
        
        if (String.isNotBlank(costDetailsJson)) {
            List<Cost_Detail__c> costsToInsert = createValidatedCostDetails(eventId, costDetailsJson, department);
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
     * JS에서 이관된 비용 검증 및 생성 로직
     */
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
    
    /**
     * 단일 비용 상세 생성 및 검증 (JS 로직 이관)
     */
    private static Cost_Detail__c createAndValidateCostDetail(Id eventId, Object costObj, String department) {
        Map<String, Object> costMap = (Map<String, Object>)costObj;
        
        String costType = String.valueOf(costMap.get('type'));
        Object amountObj = costMap.get('amount');
        
        // JS에서 하던 검증 로직을 서버에서 처리
        if (String.isBlank(costType) || amountObj == null) {
            return null;
        }
        
        Decimal amount;
        try {
            amount = Decimal.valueOf(String.valueOf(amountObj));
            if (amount < MIN_COST_AMOUNT) { // 상수 사용으로 개선
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
    
    /**
     * 예외 처리
     */
    private static void handleException(Exception e) {
        String errorMessage = e.getMessage();
        System.debug('예외 발생: ' + errorMessage);
        
        if (e instanceof AuraHandledException) {
            throw e;
        } else {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_SAVE_ERROR, new String[]{ errorMessage }));
        }
    }
}