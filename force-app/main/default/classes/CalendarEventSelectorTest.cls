/**
 * @description       : Calendar Event Selector Test Class (PMD 최적화)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-20
 */
@isTest
public class CalendarEventSelectorTest {
    
    @TestSetup
    static void makeData() {
        My_Event__c testEvent = new My_Event__c(
            Title__c = 'Test Event',
            Name = 'Test Event',
            Start_Date__c = Date.today(),
            End_Date__c = Date.today().addDays(1),
            Description__c = 'Test Description',
            Location__c = 'Test Location',
            Related_Record_Type__c = 'Account'
        );
        insert testEvent;
        
        Cost_Detail__c testCost = new Cost_Detail__c(
            My_Event__c = testEvent.Id,
            Cost_Type__c = '교통비',
            Amount__c = 10000,
            department__c = '개발팀'
        );
        insert testCost;
        
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        Contact testContact = new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            AccountId = testAccount.Id
        );
        insert testContact;
        
        Opportunity testOpportunity = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            CloseDate = Date.today().addDays(30),
            StageName = 'Prospecting'
        );
        insert testOpportunity;
    }
    
    @isTest
    static void testSelectEventsByDateRange() {
        Date startDate = Date.today().addDays(-7);
        Date endDate = Date.today().addDays(7);
        
        Test.startTest();
        List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, events, '이벤트 목록이 null이면 안됩니다');
        System.assertEquals(1, events.size(), '테스트 이벤트 1개가 조회되어야 합니다');
        System.assertEquals('Test Event', events[0].Title__c, '이벤트 제목이 일치해야 합니다');
    }
    
    @isTest
    static void testSelectEventDetailsById() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        
        Test.startTest();
        My_Event__c eventDetails = CalendarEventSelector.selectEventDetailsById(testEvent.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, eventDetails, '이벤트 상세가 null이면 안됩니다');
        System.assertEquals('Test Event', eventDetails.Title__c, '이벤트 제목이 일치해야 합니다');
        System.assertNotEquals(null, eventDetails.Cost_Details1__r, '비용 상세 리스트가 null이면 안됩니다');
        System.assertEquals(1, eventDetails.Cost_Details1__r.size(), '비용 상세 1개가 조회되어야 합니다');
    }
    
    @isTest
    static void testSelectMonthlyCostSummary() {
        Date startDate = Date.today().toStartOfMonth();
        Date endDate = Date.today().addMonths(1).toStartOfMonth().addDays(-1);
        
        Test.startTest();
        Map<String, Decimal> summary = CalendarEventSelector.selectMonthlyCostSummary(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, summary, '비용 요약이 null이면 안됩니다');
        System.assertEquals(10000, summary.get('교통비'), '교통비 합계가 일치해야 합니다');
    }
    
    @isTest
    static void testSelectAccounts() {
        Test.startTest();
        List<Account> accounts = CalendarEventSelector.selectAccounts();
        Test.stopTest();
        
        System.assertNotEquals(null, accounts, 'Account 목록이 null이면 안됩니다');
        System.assertEquals(1, accounts.size(), 'Test Account가 조회되어야 합니다');
        System.assertEquals('Test Account', accounts[0].Name, 'Account 이름이 일치해야 합니다');
    }
    
    @isTest
    static void testSelectContacts() {
        Test.startTest();
        List<Contact> contacts = CalendarEventSelector.selectContacts();
        Test.stopTest();
        
        System.assertNotEquals(null, contacts, 'Contact 목록이 null이면 안됩니다');
        System.assertEquals(1, contacts.size(), 'Test Contact가 조회되어야 합니다');
        System.assertEquals('Test Contact', contacts[0].Name, 'Contact 이름이 일치해야 합니다');
    }
    
    @isTest
    static void testSelectOpportunities() {
        Test.startTest();
        List<Opportunity> opportunities = CalendarEventSelector.selectOpportunities();
        Test.stopTest();
        
        System.assertNotEquals(null, opportunities, 'Opportunity 목록이 null이면 안됩니다');
        System.assertEquals(1, opportunities.size(), 'Test Opportunity가 조회되어야 합니다');
        System.assertEquals('Test Opportunity', opportunities[0].Name, 'Opportunity 이름이 일치해야 합니다');
    }
    
    @isTest
    static void testSelectDepartmentOptions() {
        Test.startTest();
        List<Map<String, String>> options = CalendarEventSelector.selectDepartmentOptions();
        Test.stopTest();
        
        System.assertNotEquals(null, options, '부서 옵션이 null이면 안됩니다');
        System.assert(options.size() > 0, '부서 옵션이 존재해야 합니다');
        
        Map<String, String> firstOption = options[0];
        System.assert(firstOption.containsKey('label'), 'label 키가 존재해야 합니다');
        System.assert(firstOption.containsKey('value'), 'value 키가 존재해야 합니다');
    }
    
    @isTest
    static void testSelectCostTypeOptions() {
        Test.startTest();
        List<Map<String, String>> options = CalendarEventSelector.selectCostTypeOptions();
        Test.stopTest();
        
        System.assertNotEquals(null, options, '비용 유형 옵션이 null이면 안됩니다');
        System.assert(options.size() > 0, '비용 유형 옵션이 존재해야 합니다');
        
        Map<String, String> firstOption = options[0];
        System.assert(firstOption.containsKey('label'), 'label 키가 존재해야 합니다');
        System.assert(firstOption.containsKey('value'), 'value 키가 존재해야 합니다');
    }
    
    @isTest
    static void testSelectEventsByDateRange_EmptyResult() {
        Date startDate = Date.today().addDays(30);
        Date endDate = Date.today().addDays(37);
        
        Test.startTest();
        List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, events, '이벤트 목록이 null이면 안됩니다');
        System.assertEquals(0, events.size(), '해당 기간에는 이벤트가 없어야 합니다');
    }
    
    @isTest
    static void testSelectMonthlyCostSummary_EmptyResult() {
        Date startDate = Date.today().addMonths(1).toStartOfMonth();
        Date endDate = Date.today().addMonths(2).toStartOfMonth().addDays(-1);
        
        Test.startTest();
        Map<String, Decimal> summary = CalendarEventSelector.selectMonthlyCostSummary(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, summary, '비용 요약이 null이면 안됩니다');
        for (String costType : summary.keySet()) {
            System.assertEquals(0, summary.get(costType), costType + ' 비용은 0이어야 합니다');
        }
    }
}