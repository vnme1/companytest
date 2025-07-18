/**
 * @description     : Calendar App Controller - Date 타입으로 수정된 최종 버전
 * @author          : sejin.park@dkbmc.com
 * @last modified on: 2025-07-18
 * @last modified by: sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // --- 데이터 조회(Read) ---

    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        // LWC에서 받은 String을 Date로 변환하여 Selector에 전달
        Date startDate = Date.valueOf(startStr.substring(0, 10));
        Date endDate = Date.valueOf(endStr.substring(0, 10));
        return CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
    }

    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        EventWrapper wrapper = new EventWrapper();
        wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
        wrapper.costs = wrapper.event.Cost_Details1__r;

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
        // LWC에서 받은 String을 Date로 변환하여 Selector에 전달
        Date startDt = Date.valueOf(startDate.substring(0, 10));
        Date endDt = Date.valueOf(endDate.substring(0, 10));
        return CalendarEventSelector.selectMonthlyCostSummary(startDt, endDt);
    }

    // (getAccountList, getContactList 등 다른 조회 메소드는 수정할 필요가 없습니다.)
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


    // --- 데이터 생성/수정/삭제 (CUD) ---

    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, Date startDate, Date endDate, // <--- 타입을 String에서 Date로 변경
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        try {
            if (String.isBlank(title)) {
                throw new AuraHandledException('제목은 필수 입력 항목입니다.');
            }

            My_Event__c eventToSave;
            if (recordId == null) {
                eventToSave = new My_Event__c();
            } else {
                List<My_Event__c> events = [SELECT Id FROM My_Event__c WHERE Id = :recordId LIMIT 1];
                if (events.isEmpty()) {
                    throw new AuraHandledException('수정할 이벤트를 찾을 수 없습니다.');
                }
                eventToSave = events[0];
            }

            eventToSave.Name = title;
            eventToSave.Title__c = title;
            eventToSave.Description__c = description;
            eventToSave.Location__c = location;
            eventToSave.Related_Record_Id__c = relatedId;
            eventToSave.Related_Record_Type__c = recordType;

            // Date 타입 필드에 바로 할당
            if (endDate != null) {
                eventToSave.End_Date__c = endDate.addDays(1);
            } else {
                eventToSave.End_Date__c = startDate.addDays(1);
            }
            
            upsert eventToSave;
            Id eventId = eventToSave.Id;

            // 기존 비용 삭제
            List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!oldCosts.isEmpty()) { delete oldCosts; }

            // 새 비용 데이터 처리 (기존 코드와 동일)
            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            if (String.isNotBlank(costDetailsJson) && recordType != 'Personal') {
                try {
                    List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
                    for (Object costObj : parsedCosts) {
                        Map<String, Object> costMap = (Map<String, Object>)costObj;
                        String costType = String.valueOf(costMap.get('type'));
                        Object amountObj = costMap.get('amount');
                        if (String.isBlank(costType) || amountObj == null) { continue; }
                        Decimal amount;
                        try {
                            amount = Decimal.valueOf(String.valueOf(amountObj));
                            if (amount <= 0) { continue; }
                        } catch (Exception e) { continue; }
                        String deptValue = String.isNotBlank(department) ? department : '개발부';
                        costsToInsert.add(new Cost_Detail__c(
                            My_Event__c = eventId,
                            Cost_Type__c = costType,
                            Amount__c = amount,
                            department__c = deptValue
                        ));
                    }
                } catch (Exception jsonEx) {
                    throw new AuraHandledException('비용 데이터 형식이 올바르지 않습니다.');
                }
            }
            
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
            }
            
            return eventId;

        } catch (Exception e) {
            String errorMessage = e.getMessage();
            if (e instanceof AuraHandledException) { throw e; } 
            else { throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + errorMessage); }
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, Date newStartDate, Date newEndDate) { // <--- 타입을 Date로 변경
        try {
            My_Event__c eventToUpdate = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            
            eventToUpdate.Start_Date__c = newStartDate;
            eventToUpdate.End_Date__c = (newEndDate != null) ? newEndDate : newStartDate;
            
            update eventToUpdate;
            return 'SUCCESS';
        } catch (Exception e) {
            throw new AuraHandledException('일정 날짜 업데이트 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String deleteEvent(Id eventId) {
        try {
            List<Cost_Detail__c> relatedCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!relatedCosts.isEmpty()) {
                delete relatedCosts;
            }
            
            My_Event__c eventToDelete = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            delete eventToDelete;
            
            return 'SUCCESS';
        } catch (Exception e) {
            throw new AuraHandledException('일정 삭제 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
}