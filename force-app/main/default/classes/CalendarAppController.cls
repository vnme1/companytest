/**
 * @description       : Calendar App Controller with Cost Detail integration and Dynamic Picklist
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-18
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
        try {
            Date startDate = Date.valueOf(startStr);
            Date endDate = Date.valueOf(endStr);
            return [SELECT Id, Title__c, Start_Date__c, End_Date__c FROM My_Event__c
                    WHERE Start_Date__c >= :startDate AND End_Date__c <= :endDate];
        } catch (Exception e) {
            throw new AuraHandledException('이벤트 조회 중 오류 발생: ' + e.getMessage());
        }
    }


    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        EventWrapper wrapper = new EventWrapper();
        wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
        wrapper.costs = wrapper.event.Cost_Details1__r; // Child Relationship Name 수정 (__r 추가)

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
        try {
            Date start = Date.valueOf(startDate);
            Date endDateObj = Date.valueOf(endDate);
            return CalendarEventSelector.selectMonthlyCostSummary(start, endDateObj);
        } catch (Exception e) {
            throw new AuraHandledException('비용 요약 조회 중 오류 발생: ' + e.getMessage());
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

    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            // 필수 값 검증
            if (String.isBlank(title)) {
                throw new AuraHandledException(Label.LABEL_REQUIRED_TITLE);
            }

            My_Event__c eventToSave;

            if (recordId == null) {
                eventToSave = new My_Event__c();
            } else {
                List<My_Event__c> events = [SELECT Id FROM My_Event__c WHERE Id = :recordId LIMIT 1];
                if (events.isEmpty()) {
                    throw new AuraHandledException(Label.LABEL_EVENT_FETCH_ERROR);
                }
                eventToSave = events[0];
            }

            eventToSave.Name = title;
            eventToSave.Title__c = title;
            eventToSave.Description__c = description;
            eventToSave.Location__c = location;
            eventToSave.Related_Record_Id__c = relatedId;
            eventToSave.Related_Record_Type__c = recordType;

            if (String.isNotBlank(startDate)) {
                eventToSave.Start_Date__c = Date.valueOf(startDate);
            }
            if (String.isNotBlank(endDate)) {
                eventToSave.End_Date__c = Date.valueOf(endDate);
            }

            upsert eventToSave;
            Id eventId = eventToSave.Id;

            // 기존 비용 삭제
            List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!oldCosts.isEmpty()) {
                delete oldCosts;
            }

            // 새 비용 데이터 처리
            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            
            if (String.isNotBlank(costDetailsJson) && recordType != 'Personal') {
                try {
                    List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
                    
                    for (Object costObj : parsedCosts) {
                        Map<String, Object> costMap = (Map<String, Object>)costObj;
                        
                        String costType = String.valueOf(costMap.get('type'));
                        Object amountObj = costMap.get('amount');
                        
                        if (String.isBlank(costType) || amountObj == null) {
                            continue;
                        }
                        
                        Decimal amount;
                        try {
                            amount = Decimal.valueOf(String.valueOf(amountObj));
                            if (amount <= 0) {
                                continue;
                            }
                        } catch (Exception e) {
                            continue;
                        }

                        String deptValue = String.isNotBlank(department) ? department : '개발부';
                        
                        Cost_Detail__c newCost = new Cost_Detail__c(
                            My_Event__c = eventId,
                            Cost_Type__c = costType,
                            Amount__c = amount,
                            department__c = deptValue
                        );
                        costsToInsert.add(newCost);
                    }
                } catch (Exception jsonEx) {
                    throw new AuraHandledException(Label.LABEL_INVALID_COST_JSON);
                }
            }
            
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
            
            return eventId;

        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (e instanceof AuraHandledException) {
                throw e;
            } else {
                throw new AuraHandledException(String.format(Label.LABEL_EVENT_SAVE_ERROR, new String[]{ errorMessage }));
            }
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        try {
            My_Event__c eventToUpdate = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            
            if (String.isNotBlank(newStartDate)) { eventToUpdate.Start_Date__c = Date.valueOf(newStartDate); }
            if (String.isNotBlank(newEndDate)) { eventToUpdate.End_Date__c = Date.valueOf(newEndDate); }

            update eventToUpdate;
            
            return 'SUCCESS';
            
        } catch (Exception e) {
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_UPDATE_ERROR, new String[]{ e.getMessage() }));
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
            throw new AuraHandledException(String.format(Label.LABEL_EVENT_DELETE_ERROR, new String[]{ e.getMessage() }));
        }
    }
}