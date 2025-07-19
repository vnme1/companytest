/**
 * @description       : Calendar App Controller (색상 지원 버전)
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
    
    // ✅ 색상 상수 정의 (재사용성 및 유지보수성 향상)
    private static final Map<String, Map<String, String>> EVENT_COLORS = new Map<String, Map<String, String>>{
        'Personal' => new Map<String, String>{
            'backgroundColor' => '#8B5Cf6',
            'borderColor' => '#7C3AED',
            'textColor' => '#FFFFFF'
        },
        'Salesforce' => new Map<String, String>{
            'backgroundColor' => '#059669',
            'borderColor' => '#047857',
            'textColor' => '#FFFFFF'
        },
        'Default' => new Map<String, String>{
            'backgroundColor' => '#0176d3',
            'borderColor' => '#005fb2',
            'textColor' => '#FFFFFF'
        }
    };
    
    private static final Set<String> SALESFORCE_RECORD_TYPES = new Set<String>{'Account', 'Contact', 'Opportunity'};

    // === Wrapper Classes ===
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // ✅ 색상 정보 클래스 (회사 명명 규칙 준수)
    public class EventColorInfo {
        @AuraEnabled public String backgroundColor;
        @AuraEnabled public String borderColor;
        @AuraEnabled public String textColor;
        
        public EventColorInfo(String bgColor, String borderColor, String textColor) {
            this.backgroundColor = bgColor;
            this.borderColor = borderColor;
            this.textColor = textColor;
        }
    }

    // ✅ 색상 포함 이벤트 표시 데이터 (기존 코드와 호환성 유지)
    public class EventDisplayData {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String startDate;
        @AuraEnabled public String endDate;
        @AuraEnabled public Boolean allDay;
        @AuraEnabled public EventColorInfo colorInfo;
        
        public EventDisplayData(My_Event__c event, EventColorInfo colorInfo) {
            this.id = event.Id;
            this.title = event.Title__c;
            this.startDate = String.valueOf(event.Start_Date__c);
            this.endDate = String.valueOf(event.End_Date__c.addDays(1));
            this.allDay = false;
            this.colorInfo = colorInfo;
        }
    }

    // === READ OPERATIONS (색상 지원 버전) ===
    
    @AuraEnabled(cacheable=true)
    public static List<EventDisplayData> getEventsWithColors(String startStr, String endStr) {
        try {
            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
            
            List<EventDisplayData> displayEvents = new List<EventDisplayData>();
            for (My_Event__c event : events) {
                EventColorInfo colorInfo = getEventColorInfo(event.Related_Record_Type__c);
                displayEvents.add(new EventDisplayData(event, colorInfo));
            }
            
            return displayEvents;
        } catch (Exception e) {
            throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR + ': ' + e.getMessage());
        }
    }

    // === 기존 메서드들 유지 (호환성) ===
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

    // === WRITE OPERATIONS (색상 정보 포함 버전) ===
    
    @AuraEnabled
    public static Map<String, Object> saveEventAndCostsWithColor(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            // 1. 기존 저장 로직 실행
            String savedEventId = saveEventAndCosts(recordId, title, startDate, endDate, 
                description, location, department, relatedId, recordType, costDetailsJson);
            
            // 2. 색상 정보 포함하여 반환
            EventColorInfo colorInfo = getEventColorInfo(recordType);
            
            return new Map<String, Object>{
                'eventId' => savedEventId,
                'colorInfo' => colorInfo
            };

        } catch (Exception e) {
            handleException(e);
            return null;
        }
    }
    
    // ✅ 기존 저장 메서드 유지 (호환성)
    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            validateEventInputs(title, department, recordType);
            My_Event__c eventRecord = saveEventRecord(recordId, title, description, 
                location, relatedId, recordType, startDate, endDate);
            
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

    // === 색상 관련 HELPER METHODS ===
    
    /**
     * ✅ 이벤트 유형별 색상 정보 반환 (재사용성 및 확장성 고려)
     * @param recordType 레코드 타입
     * @return EventColorInfo 색상 정보 객체
     */
    public static EventColorInfo getEventColorInfo(String recordType) {
        try {
            Map<String, String> colors;
            
            if (recordType == PERSONAL_RECORD_TYPE) {
                colors = EVENT_COLORS.get('Personal');
            } else if (SALESFORCE_RECORD_TYPES.contains(recordType)) {
                colors = EVENT_COLORS.get('Salesforce');
            } else {
                colors = EVENT_COLORS.get('Default');
            }
            
            return new EventColorInfo(
                colors.get('backgroundColor'),
                colors.get('borderColor'),
                colors.get('textColor')
            );
            
        } catch (Exception e) {
            // ✅ 에러 발생 시 기본 색상 반환 (안전장치)
            System.debug('색상 정보 조회 실패: ' + e.getMessage());
            Map<String, String> defaultColors = EVENT_COLORS.get('Default');
            return new EventColorInfo(
                defaultColors.get('backgroundColor'),
                defaultColors.get('borderColor'),
                defaultColors.get('textColor')
            );
        }
    }
    
    /**
     * ✅ 색상 상수 맵 반환 (LWC에서 활용 가능)
     * @return Map<String, Map<String, String>> 색상 정보 맵
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Map<String, String>> getEventColorConstants() {
        return EVENT_COLORS;
    }

    // === 기존 HELPER METHODS 유지 ===
    
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
        List<Cost_Detail__c> existingCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        if (!existingCosts.isEmpty()) {
            delete existingCosts;
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
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_SAVE_ERROR, new String[]{ errorMessage }));
        }
    }
}