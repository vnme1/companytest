/**
 * @description       : Calendar App Controller with Cost Detail integration and Dynamic Picklist
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // --- 데이터 조회(Read)는 Selector 클래스에 위임 ---

    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        return CalendarEventSelector.selectEventsByDateRange(
            (Datetime)JSON.deserialize('"' + startStr + '"', Datetime.class),
            (Datetime)JSON.deserialize('"' + endStr + '"', Datetime.class)
        );
    }

    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        EventWrapper wrapper = new EventWrapper();
        wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
        wrapper.costs = wrapper.event.Cost_Details__r;

        if (wrapper.event != null && wrapper.event.Related_Record_Type__c == 'Account') {
            List<Account> accs = [SELECT Name FROM Account WHERE Id = :wrapper.event.Related_Record_Id__c LIMIT 1];
            if (!accs.isEmpty()) {
                wrapper.accountName = accs[0].Name;
            }
        }
        return wrapper;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        return CalendarEventSelector.selectMonthlyCostSummary(
            (Datetime)JSON.deserialize('"' + startDate + '"', Datetime.class),
            (Datetime)JSON.deserialize('"' + endDate + '"', Datetime.class)
        );
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

    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            My_Event__c eventToSave;

            if (recordId == null) {
                eventToSave = new My_Event__c();
            } else {
                eventToSave = [SELECT Id FROM My_Event__c WHERE Id = :recordId LIMIT 1];
            }

            eventToSave.Name = title;
            eventToSave.Title__c = title;
            eventToSave.Description__c = description;
            eventToSave.Location__c = location;
            eventToSave.Related_Record_Id__c = relatedId;
            eventToSave.Related_Record_Type__c = recordType;

            if (String.isNotBlank(startDate)) {
                eventToSave.Start_DateTime__c = Datetime.valueOfGmt(startDate.replace('T', ' ') + ':00');
            }
            if (String.isNotBlank(endDate)) {
                eventToSave.End_DateTime__c = Datetime.valueOfGmt(endDate.replace('T', ' ') + ':00');
            }

            upsert eventToSave;
            Id eventId = eventToSave.Id;
            
            System.debug('★★★ Event saved with ID: ' + eventId);

            // 기존 비용 삭제
            List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!oldCosts.isEmpty()) {
                delete oldCosts;
                System.debug('★★★ Deleted old costs: ' + oldCosts.size());
            }

            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            
            if (String.isNotBlank(costDetailsJson) && recordType != 'Personal') {
                System.debug('★★★ Processing costDetailsJson: ' + costDetailsJson);
                System.debug('★★★ Department: ' + department);
                
                try {
                    Object parsedObject = JSON.deserializeUntyped(costDetailsJson);
                    List<Object> parsedCosts = (List<Object>)parsedObject;
                    
                    System.debug('★★★ Parsed costs count: ' + parsedCosts.size());
                    
                    for (Object costObj : parsedCosts) {
                        Map<String, Object> costMap = (Map<String, Object>)costObj;
                        
                        Object amountObj = costMap.get('amount');
                        Object typeObj = costMap.get('type');
                        
                        System.debug('★★★ Processing cost - Type: ' + typeObj + ', Amount: ' + amountObj);
                        
                        if (amountObj == null || String.isBlank(String.valueOf(amountObj))) {
                            System.debug('★★★ Skipping cost - empty amount');
                            continue;
                        }
                        
                        if (typeObj == null || String.isBlank(String.valueOf(typeObj))) {
                            System.debug('★★★ Skipping cost - empty type');
                            continue;
                        }
                        
                        Decimal amount;
                        try {
                            amount = Decimal.valueOf(String.valueOf(amountObj));
                            if (amount <= 0) {
                                System.debug('★★★ Skipping cost - amount <= 0');
                                continue;
                            }
                        } catch (Exception e) {
                            System.debug('★★★ Invalid amount: ' + amountObj + ', Error: ' + e.getMessage());
                            continue;
                        }

                        Cost_Detail__c newCost = new Cost_Detail__c(
                            My_Event__c = eventId,
                            Cost_Type__c = String.valueOf(typeObj),
                            Amount__c = amount,
                            department__c = department
                        );
                        costsToInsert.add(newCost);
                        System.debug('★★★ Added cost to insert: ' + newCost);
                    }
                } catch (Exception jsonEx) {
                    System.debug('★★★ JSON parsing error: ' + jsonEx.getMessage());
                    throw new AuraHandledException('비용 데이터 파싱 중 오류가 발생했습니다: ' + jsonEx.getMessage());
                }
            }
            
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
                System.debug('★★★ Successfully inserted costs: ' + costsToInsert.size());
            } else {
                System.debug('★★★ No costs to insert');
            }
            
            return eventId;

        } catch (Exception e) {
            System.debug('★★★ Save Event Error: ' + e.getMessage());
            System.debug('★★★ Stack Trace: ' + e.getStackTraceString());
            throw new AuraHandledException(e.getMessage() + ' | StackTrace: ' + e.getStackTraceString());
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        try {
            My_Event__c eventToUpdate = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            
            if (String.isNotBlank(newStartDate)) {
                eventToUpdate.Start_DateTime__c = Datetime.valueOfGmt(newStartDate.replace('T', ' ') + ':00');
            }
            if (String.isNotBlank(newEndDate)) {
                eventToUpdate.End_DateTime__c = Datetime.valueOfGmt(newEndDate.replace('T', ' ') + ':00');
            }
            
            update eventToUpdate;
            
            return 'SUCCESS';
            
        } catch (Exception e) {
            System.debug('Update Event Dates Error: ' + e.getMessage());
            throw new AuraHandledException('일정 날짜 업데이트 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String deleteEvent(Id eventId) {
        try {
            // 먼저 관련된 비용 상세 삭제
            List<Cost_Detail__c> relatedCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!relatedCosts.isEmpty()) {
                delete relatedCosts;
            }
            
            // 이벤트 삭제
            My_Event__c eventToDelete = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            delete eventToDelete;
            
            return 'SUCCESS';
            
        } catch (Exception e) {
            System.debug('Delete Event Error: ' + e.getMessage());
            throw new AuraHandledException('일정 삭제 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
}