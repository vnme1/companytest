/**
 * @description       : Calendar App Controller with Cost Detail integration and Dynamic Picklist
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        Datetime startDate = (Datetime)JSON.deserialize('"' + startStr + '"', Datetime.class);
        Datetime endDate = (Datetime)JSON.deserialize('"' + endStr + '"', Datetime.class);
        return [
            SELECT Id, Title__c, Start_DateTime__c, End_DateTime__c, Description__c 
            FROM My_Event__c
            WHERE Start_DateTime__c <= :endDate AND End_DateTime__c >= :startDate
            AND OwnerId = :UserInfo.getUserId()
            ORDER BY Start_DateTime__c
            LIMIT 200
        ];
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
            wrapper.costs = [SELECT Id, Cost_Type__c, Amount__c, department__c FROM Cost_Detail__c WHERE My_Event__c = :eventId];

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

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        try {
            Datetime startDateTime = (Datetime)JSON.deserialize('"' + startDate + '"', Datetime.class);
            Datetime endDateTime = (Datetime)JSON.deserialize('"' + endDate + '"', Datetime.class);
            
            List<Cost_Detail__c> costs = [
                SELECT Cost_Type__c, Amount__c 
                FROM Cost_Detail__c 
                WHERE My_Event__c IN (
                    SELECT Id 
                    FROM My_Event__c 
                    WHERE Start_DateTime__c >= :startDateTime 
                    AND Start_DateTime__c <= :endDateTime
                    AND OwnerId = :UserInfo.getUserId()
                )
            ];
            
            Map<String, Decimal> summary = new Map<String, Decimal>();
            
            // 동적으로 모든 비용 타입에 대해 0으로 초기화
            Schema.DescribeFieldResult fieldResult = Cost_Detail__c.Cost_Type__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            for (Schema.PicklistEntry entry : picklistValues) {
                if (entry.isActive()) {
                    summary.put(entry.getValue(), 0);
                }
            }
            
            // 실제 비용 합계 계산
            for (Cost_Detail__c cost : costs) {
                if (cost.Cost_Type__c != null && cost.Amount__c != null) {
                    Decimal currentAmount = summary.get(cost.Cost_Type__c);
                    if (currentAmount != null) {
                        summary.put(cost.Cost_Type__c, currentAmount + cost.Amount__c);
                    } else {
                        summary.put(cost.Cost_Type__c, cost.Amount__c);
                    }
                }
            }
            
            return summary;
            
        } catch (Exception e) {
            throw new AuraHandledException('월별 비용 합계 조회 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    // 부서 Picklist 값 가져오기
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getDepartmentOptions() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        try {
            Schema.DescribeFieldResult fieldResult = Cost_Detail__c.department__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            
            for (Schema.PicklistEntry entry : picklistValues) {
                if (entry.isActive()) {
                    Map<String, String> option = new Map<String, String>();
                    option.put('label', entry.getLabel());
                    option.put('value', entry.getValue());
                    options.add(option);
                }
            }
        } catch (Exception e) {
            System.debug('Error getting department options: ' + e.getMessage());
            // Fallback 옵션 제공
            options.add(new Map<String, String>{'label' => '개발부', 'value' => '개발부'});
            options.add(new Map<String, String>{'label' => '영업부', 'value' => '영업부'});
        }
        
        return options;
    }

    // 비용 타입 Picklist 값 가져오기
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCostTypeOptions() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        try {
            Schema.DescribeFieldResult fieldResult = Cost_Detail__c.Cost_Type__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            
            for (Schema.PicklistEntry entry : picklistValues) {
                if (entry.isActive()) {
                    Map<String, String> option = new Map<String, String>();
                    option.put('label', entry.getLabel());
                    option.put('value', entry.getValue());
                    options.add(option);
                }
            }
        } catch (Exception e) {
            System.debug('Error getting cost type options: ' + e.getMessage());
            // Fallback 옵션 제공
            options.add(new Map<String, String>{'label' => '교통비', 'value' => '교통비'});
            options.add(new Map<String, String>{'label' => '식대', 'value' => '식대'});
            options.add(new Map<String, String>{'label' => '주유비', 'value' => '주유비'});
        }
        
        return options;
    }
}