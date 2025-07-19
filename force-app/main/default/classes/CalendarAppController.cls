/**
 * @description       : Calendar App Controller with improved structure and validation
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-19
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    
    // Constants
    private static final String DEFAULT_DEPARTMENT = Label.LABEL_DEFAULT_DEPT;
    private static final String PERSONAL_RECORD_TYPE = 'Personal';
    
    // Wrapper class for event details
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }
    
    // Cost detail wrapper for JSON processing
    public class CostDetailInput {
        public String type;
        public Decimal amount;
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

            // Account 이름 조회 (필요시)
            if (isAccountRelatedEvent(wrapper.event)) {
                wrapper.accountName = getAccountNameById(wrapper.event.Related_Record_Id__c);
            }
            
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
            validateRequiredFields(title);
            
            My_Event__c eventToSave = prepareEventRecord(recordId, title, description, 
                location, relatedId, recordType, startDate, endDate);
            
            upsert eventToSave;
            
            // 비용 상세 처리 (개인 활동이 아닌 경우에만)
            if (!isPersonalActivity(recordType)) {
                processCostDetails(eventToSave.Id, costDetailsJson, department);
            }
            
            return eventToSave.Id;

        } catch (Exception e) {
            handleSaveException(e);
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
            deleteRelatedCostDetails(eventId);
            
            // 이벤트 삭제
            delete new My_Event__c(Id = eventId);
            
            return Label.LABEL_SUCCESS_SAVE;
            
        } catch (Exception e) {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_DELETE_ERROR, new String[]{ e.getMessage() }));
        }
    }

    // === HELPER METHODS ===
    
    private static Boolean isAccountRelatedEvent(My_Event__c event) {
        return event != null && event.Related_Record_Type__c == 'Account' && 
               String.isNotBlank(event.Related_Record_Id__c);
    }
    
    private static String getAccountNameById(String accountId) {
        try {
            List<Account> accounts = [SELECT Name FROM Account WHERE Id = :accountId LIMIT 1];
            return accounts.isEmpty() ? '' : accounts[0].Name;
        } catch (Exception e) {
            return '';
        }
    }
    
    private static void validateRequiredFields(String title) {
        if (String.isBlank(title)) {
            throw new AuraHandledException(Label.LABEL_REQUIRED_TITLE);
        }
    }
    
    private static My_Event__c prepareEventRecord(Id recordId, String title, String description, 
            String location, String relatedId, String recordType, String startDate, String endDate) {
        
        My_Event__c eventRecord;
        
        if (recordId == null) {
            eventRecord = new My_Event__c();
        } else {
            eventRecord = new My_Event__c(Id = recordId);
        }
        
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
        
        return eventRecord;
    }
    
    private static Boolean isPersonalActivity(String recordType) {
        return recordType == PERSONAL_RECORD_TYPE;
    }
    
    private static void processCostDetails(Id eventId, String costDetailsJson, String department) {
        // 기존 비용 삭제
        deleteRelatedCostDetails(eventId);
        
        // 새 비용 데이터 처리
        if (String.isNotBlank(costDetailsJson)) {
            List<Cost_Detail__c> costsToInsert = parseCostDetails(eventId, costDetailsJson, department);
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
        }
    }
    
    private static void deleteRelatedCostDetails(Id eventId) {
        List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        if (!existingCosts.isEmpty()) {
            delete existingCosts;
        }
    }
    
    private static List<Cost_Detail__c> parseCostDetails(Id eventId, String costDetailsJson, String department) {
        List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
        
        try {
            List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
            String deptValue = String.isNotBlank(department) ? department : DEFAULT_DEPARTMENT;
            
            for (Object costObj : parsedCosts) {
                Cost_Detail__c costDetail = createCostDetail(eventId, costObj, deptValue);
                if (costDetail != null) {
                    costsToInsert.add(costDetail);
                }
            }
        } catch (Exception jsonEx) {
            throw new AuraHandledException(Label.LABEL_INVALID_COST_JSON);
        }
        
        return costsToInsert;
    }
    
    private static Cost_Detail__c createCostDetail(Id eventId, Object costObj, String department) {
        Map<String, Object> costMap = (Map<String, Object>)costObj;
        
        String costType = String.valueOf(costMap.get('type'));
        Object amountObj = costMap.get('amount');
        
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
    
    private static void handleSaveException(Exception e) {
        String errorMessage = e.getMessage();
        if (e instanceof AuraHandledException) {
            throw e;
        } else {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_SAVE_ERROR, new String[]{ errorMessage }));
        }
    }
}