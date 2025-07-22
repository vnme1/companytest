/**
 * @description       : 데이터 조회용
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-22
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarEventSelector {

    // 날짜 범위별 이벤트 조회
    public static List<My_Event__c> selectEventsByDateRange(Date startDt, Date endDt) {
        // CRUD 권한 검증
        if (!Schema.sObjectType.My_Event__c.isAccessible()) {
            throw new AuraHandledException('My_Event__c에 대한 읽기 권한이 없습니다.');
        }
        return [
            SELECT Id, Title__c, Start_Date__c, End_Date__c
            FROM My_Event__c
            WHERE Start_Date__c <= :endDt AND End_Date__c >= :startDt
            AND OwnerId = :UserInfo.getUserId() // 현재 로그인한 사용자가 소유한 이벤트 조회
            ORDER BY Start_Date__c LIMIT 200
        ];
    }

    // 이벤트 상세 정보 조회
    public static My_Event__c selectEventDetailsById(Id eventId) {
        if (!Schema.sObjectType.My_Event__c.isAccessible() || 
            !Schema.sObjectType.Cost_Detail__c.isAccessible()) {
            throw new AuraHandledException('필요한 객체에 대한 읽기 권한이 없습니다.');
        }

        return [
            SELECT 
                Id, Name, Title__c, Start_Date__c, End_Date__c, Description__c, Location__c, 
                Related_Record_Id__c, Related_Record_Type__c,
                (SELECT Id, Cost_Type__c, Amount__c, department__c FROM Cost_Details1__r)
            FROM My_Event__c
            WHERE Id = :eventId
            LIMIT 1
        ];
    }

    // 월별 비용 합계 조회
    public static Map<String, Decimal> selectMonthlyCostSummary(Date startDate, Date endDate) {
        if (!Schema.sObjectType.Cost_Detail__c.isAccessible() || 
            !Schema.sObjectType.My_Event__c.isAccessible()) {
            throw new AuraHandledException('필요한 객체에 대한 읽기 권한이 없습니다.');
        }
        Map<String, Decimal> summary = new Map<String, Decimal>();

        // picklist value값으로 초기화
        Schema.DescribeFieldResult fieldResult = Cost_Detail__c.Cost_Type__c.getDescribe();
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            if (entry.isActive()) {
                summary.put(entry.getValue(), 0);
            }
        }

        // 실제 데이터 집계함
        List<AggregateResult> results = [
            SELECT Cost_Type__c, SUM(Amount__c) totalAmount
            FROM Cost_Detail__c
            WHERE My_Event__r.Start_Date__c >= :startDate
            AND My_Event__r.Start_Date__c <= :endDate
            AND My_Event__r.OwnerId = :UserInfo.getUserId()
            GROUP BY Cost_Type__c
        ];
        // 실제 값으로 업데이트
        for (AggregateResult ar : results) {
            String costType = (String)ar.get('Cost_Type__c');
            Decimal amount = (Decimal)ar.get('totalAmount');
            if (costType != null && amount != null) {
                summary.put(costType, amount);
            }
        }
        
        return summary;
    }

    // Account 목록 조회
    public static List<Account> selectAccounts() {
        if (!Schema.sObjectType.Account.isAccessible() || 
            !Schema.sObjectType.User.isAccessible()) {
            throw new AuraHandledException('Account 또는 User 객체에 대한 읽기 권한이 없습니다.');
        }
        return [SELECT Id, Name, Owner.Name FROM Account ORDER BY Name LIMIT 200];
    }
    
    // Contact 목록 조회
    public static List<Contact> selectContacts() {
        if (!Schema.sObjectType.Contact.isAccessible() || 
            !Schema.sObjectType.Account.isAccessible() || 
            !Schema.sObjectType.User.isAccessible()) {
            throw new AuraHandledException('Contact, Account 또는 User 객체에 대한 읽기 권한이 없습니다.');
        }
        return [SELECT Id, Name, Account.Name, Owner.Name FROM Contact WHERE AccountId != NULL ORDER BY Name LIMIT 200];
    }
    
    // Opportunity 목록 조회
    public static List<Opportunity> selectOpportunities() {
        if (!Schema.sObjectType.Opportunity.isAccessible() || 
            !Schema.sObjectType.Account.isAccessible() || 
            !Schema.sObjectType.User.isAccessible()) {
            throw new AuraHandledException('Opportunity, Account 또는 User 객체에 대한 읽기 권한이 없습니다.');
        }
        return [SELECT Id, Name, StageName, CloseDate, Owner.Name, Account.Name FROM Opportunity ORDER BY CloseDate DESC LIMIT 200];
    }

    // Picklist 옵션 조회 
    private static List<Map<String, String>> getPicklistOptions(SObjectField field) {
        List<Map<String, String>> options = new List<Map<String, String>>();
        Schema.DescribeFieldResult fieldResult = field.getDescribe();
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            if (entry.isActive()) {
                options.add(new Map<String, String>{'label' => entry.getLabel(), 'value' => entry.getValue()});
            }
        }
        return options;
    }

    // 부서 옵션 조회
    public static List<Map<String, String>> selectDepartmentOptions() {
        return getPicklistOptions(Cost_Detail__c.department__c);
    }

    // 비용 유형 옵션 조회
    public static List<Map<String, String>> selectCostTypeOptions() {
        return getPicklistOptions(Cost_Detail__c.Cost_Type__c);
    }
}