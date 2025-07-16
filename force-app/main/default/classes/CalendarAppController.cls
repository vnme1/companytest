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
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String relatedId,
        String recordType, String costDetailsJson
    ) {
        try {
            My_Event__c eventToSave;

            if (recordId == null) {
                // 새 레코드 생성
                eventToSave = new My_Event__c();
            } else {
                // 기존 레코드 업데이트
                eventToSave = [SELECT Id FROM My_Event__c WHERE Id = :recordId LIMIT 1];
            }

            // 개별 파라미터로 받은 데이터를 직접 할당
            eventToSave.Name = title;
            eventToSave.Title__c = title;
            eventToSave.Description__c = description;
            eventToSave.Location__c = location;
            eventToSave.Related_Record_Id__c = relatedId;
            eventToSave.Related_Record_Type__c = recordType;

            // KST로 받은 시간을 GMT로 변환하여 저장
            if (String.isNotBlank(startDate)) {
                eventToSave.Start_DateTime__c = Datetime.valueOfGmt(startDate.replace('T', ' ') + ':00');
            }
            if (String.isNotBlank(endDate)) {
                eventToSave.End_DateTime__c = Datetime.valueOfGmt(endDate.replace('T', ' ') + ':00');
            }

            upsert eventToSave;
            Id eventId = eventToSave.Id;

            // --- 비용 저장 로직 ---
            List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE Event__c = :eventId];
            if (!oldCosts.isEmpty()) {
                delete oldCosts;
            }

            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            if (String.isNotBlank(costDetailsJson) && recordType != 'Personal') {
                List<Map<String, Object>> parsedCosts = (List<Map<String, Object>>)JSON.deserialize(costDetailsJson, List<Map<String, Object>>.class);
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
                insert costsToInsert;
            }
            return eventId;

        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage() + ' | StackTrace: ' + e.getStackTraceString());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        try {
            EventWrapper wrapper = new EventWrapper();
            wrapper.event = [
                SELECT Id, Name, Title__c, Start_DateTime__c, End_DateTime__c, Description__c, Location__c, Related_Record_Id__c, Related_Record_Type__c
                FROM My_Event__c
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