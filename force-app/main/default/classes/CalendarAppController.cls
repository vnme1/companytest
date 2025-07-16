/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-16
 * @last modified by  : sejin.park@dkbmc.com
**/
/**
 *  * Project: Salesforce Apex
 *  * Author: sejin.park@dkbmc.com
 *  * Description: Apex 클래스 정의
 *  * License: Custom
 */

public with sharing class CalendarAppController {
    public class EventDataWrapper {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String title;
        @AuraEnabled public String startDate;
        @AuraEnabled public String endDate;
        @AuraEnabled public String description;
        @AuraEnabled public String location;
        @AuraEnabled public String relatedId;
        @AuraEnabled public String recordType;
        @AuraEnabled public String costDetailsJson;
    }

    public class EventWrapper {
        @AuraEnabled public My_Event__c event; // Event__c -> My_Event__c
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        Datetime startDate = (Datetime)JSON.deserialize('"' + startStr + '"', Datetime.class);
        Datetime endDate = (Datetime)JSON.deserialize('"' + endStr + '"', Datetime.class);
        return [
            SELECT Id, Title__c, Start_DateTime__c, End_DateTime__c, Description__c 
            FROM My_Event__c // Event__c -> My_Event__c
            WHERE Start_DateTime__c <= :endDate AND End_DateTime__c >= :startDate
            AND OwnerId = :UserInfo.getUserId()
            ORDER BY Start_DateTime__c
            LIMIT 200
        ];
    }

    @AuraEnabled
    public static String saveEventAndCosts(EventDataWrapper data) {
        try {
            // ▼▼▼ 보안 검사 로직을 임시로 주석 처리 ▼▼▼
            // if (!Security.isCreatable(My_Event__c.sObjectType) || !Security.isUpdateable(My_Event__c.sObjectType)) {
            //     throw new AuraHandledException('이벤트를 생성하거나 수정할 권한이 없습니다.');
            // }

            My_Event__c eventToSave = new My_Event__c(
                Id = data.recordId,
                Name = data.title,
                Title__c = data.title,
                Description__c = data.description,
                Location__c = data.location, 
                Related_Record_Id__c = data.relatedId,
                Related_Record_Type__c = data.recordType
            );
            
            if (String.isNotBlank(data.startDate)) {
                eventToSave.Start_DateTime__c = Datetime.valueOf(data.startDate.replace('T', ' '));
            }
            if (String.isNotBlank(data.endDate)) {
                eventToSave.End_DateTime__c = Datetime.valueOf(data.endDate.replace('T', ' '));
            }
            
            upsert eventToSave;
            Id eventId = eventToSave.Id;

            // ▼▼▼ 보안 검사 로직을 임시로 주석 처리 ▼▼▼
            // if (Security.isDeletable(Cost_Detail__c.sObjectType)) {
                List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE Event__c = :eventId];
                if (!oldCosts.isEmpty()) {
                    delete oldCosts;
                }
            // }

            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            if (String.isNotBlank(data.costDetailsJson) && data.recordType != 'Personal') {
                List<Map<String, Object>> parsedCosts = (List<Map<String, Object>>)JSON.deserialize(data.costDetailsJson, List<Map<String, Object>>.class);
                for (Map<String, Object> costMap : parsedCosts) {
                    Object amountObj = costMap.get('amount');
                    if (amountObj == null || String.isBlank(String.valueOf(amountObj))) continue;
                    Decimal amount = Decimal.valueOf(String.valueOf(amountObj));
                    if (amount == 0) continue;
                    costsToInsert.add(new Cost_Detail__c(
                        Event__c = eventId,
                        Cost_Type__c = (String)costMap.get('type'),
                        Amount__c = amount
                    ));
                }
            }
            
            if (!costsToInsert.isEmpty()) {
                // ▼▼▼ 보안 검사 로직을 임시로 주석 처리 ▼▼▼
                // if (!Security.isCreatable(Cost_Detail__c.sObjectType)) {
                //     throw new AuraHandledException('비용을 생성할 권한이 없습니다.');
                // }
                insert costsToInsert;
            }
            return eventId;
        } catch (Exception e) {
            throw new AuraHandledException('저장 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        try {
            EventWrapper wrapper = new EventWrapper();
            wrapper.event = [
                SELECT Id, Title__c, Start_DateTime__c, End_DateTime__c, Description__c, Related_Record_Id__c, Related_Record_Type__c
                FROM My_Event__c // Event__c -> My_Event__c
                WHERE Id = :eventId
                LIMIT 1
            ];
            wrapper.costs = [SELECT Id, Cost_Type__c, Amount__c FROM Cost_Detail__c WHERE Event__c = :eventId];

            if (wrapper.event != null && wrapper.event.Related_Record_Type__c == 'Account') {
                List<Account> accs = [SELECT Name FROM Account WHERE Id = :wrapper.event.Related_Record_Id__c LIMIT 1];
                if (!accs.isEmpty()) {
                    wrapper.accountName = accs[0].Name;
                }
            }
            return wrapper;
        } catch (Exception e) {
            throw new AuraHandledException('이벤트 상세 정보 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccountList() {
        if (!Schema.sObjectType.Account.isAccessible()) {
            throw new AuraHandledException('Account 객체에 대한 읽기 권한이 없습니다.');
        }
        try {
            return [
                SELECT Id, Name, Owner.Name 
                FROM Account 
                ORDER BY Name 
                LIMIT 200
            ];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Contact> getContactList() {
        if (!Schema.sObjectType.Contact.isAccessible()) {
            throw new AuraHandledException('Contact 객체에 대한 읽기 권한이 없습니다.');
        }
        try {
            return [
                SELECT Id, Name, Account.Name, Owner.Name 
                FROM Contact 
                WHERE AccountId != NULL
                ORDER BY Name 
                LIMIT 200
            ];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Opportunity> getOpportunityList() {
        if (!Schema.sObjectType.Opportunity.isAccessible()) {
            throw new AuraHandledException('Opportunity 객체에 대한 읽기 권한이 없습니다.');
        }
        try {
            return [
                SELECT Id, Name, StageName, CloseDate, Owner.Name, Account.Name 
                FROM Opportunity 
                ORDER BY CloseDate DESC
                LIMIT 200
            ];
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}