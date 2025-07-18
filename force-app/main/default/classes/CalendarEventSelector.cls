/**
 * @description       : 데이터베이스 조회(SOQL)를 전담하는 클래스.
 * @author            : sejin.park@dkbmc.com
 */
public with sharing class CalendarEventSelector {

    // 특정 기간의 이벤트 목록 조회
    public static List<My_Event__c> selectEventsByDateRange(Datetime startDt, Datetime endDt) {
        return [
            SELECT Id, Title__c, Start_DateTime__c, End_DateTime__c
            FROM My_Event__c
            WHERE Start_DateTime__c <= :endDt AND End_DateTime__c >= :startDt
            AND OwnerId = :UserInfo.getUserId()
            ORDER BY Start_DateTime__c LIMIT 200
        ];
    }

    // 이벤트 상세 정보와 관련 비용 동시 조회 - Child Relationship Name 수정
    public static My_Event__c selectEventDetailsById(Id eventId) {
        return [
            SELECT 
                Id, Name, Title__c, Start_DateTime__c, End_DateTime__c, Description__c, Location__c, 
                Related_Record_Id__c, Related_Record_Type__c,
                (SELECT Id, Cost_Type__c, Amount__c, department__c FROM Cost_Details1__r)
            FROM My_Event__c
            WHERE Id = :eventId
            LIMIT 1
        ];
    }

    // 월별 비용 합계 조회 - 수정된 버전
    public static Map<String, Decimal> selectMonthlyCostSummary(Datetime startDateTime, Datetime endDateTime) {
        Map<String, Decimal> summary = new Map<String, Decimal>();

        // 모든 비용 타입에 대해 0으로 초기화
        Schema.DescribeFieldResult fieldResult = Cost_Detail__c.Cost_Type__c.getDescribe();
        for (Schema.PicklistEntry entry : fieldResult.getPicklistValues()) {
            if (entry.isActive()) {
                summary.put(entry.getValue(), 0);
            }
        }

        // 실제 비용 합계 계산
        List<AggregateResult> results = [
            SELECT Cost_Type__c, SUM(Amount__c) totalAmount
            FROM Cost_Detail__c
            WHERE My_Event__r.Start_DateTime__c >= :startDateTime 
            AND My_Event__r.Start_DateTime__c <= :endDateTime
            AND My_Event__r.OwnerId = :UserInfo.getUserId()
            GROUP BY Cost_Type__c
        ];

        for (AggregateResult ar : results) {
            String costType = (String)ar.get('Cost_Type__c');
            Decimal amount = (Decimal)ar.get('totalAmount');
            if (costType != null && amount != null) {
                summary.put(costType, amount);
            }
        }
        
        return summary;
    }

    // Account, Contact, Opportunity 목록 조회
    public static List<Account> selectAccounts() {
        return [SELECT Id, Name, Owner.Name FROM Account ORDER BY Name LIMIT 200];
    }
    
    public static List<Contact> selectContacts() {
        return [SELECT Id, Name, Account.Name, Owner.Name FROM Contact WHERE AccountId != NULL ORDER BY Name LIMIT 200];
    }
    
    public static List<Opportunity> selectOpportunities() {
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

    public static List<Map<String, String>> selectDepartmentOptions() {
        return getPicklistOptions(Cost_Detail__c.department__c);
    }

    public static List<Map<String, String>> selectCostTypeOptions() {
        return getPicklistOptions(Cost_Detail__c.Cost_Type__c);
    }
}