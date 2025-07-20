/**
 * @description       : Calendar Event Selector Test Class (PMD 경고 수정 버전)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-20
 */
@isTest
private class CalendarEventSelectorTest {

    @TestSetup
    static void setupTestData() {
        // 테스트용 계정 생성
        Account testAccount = new Account(Name = 'Test Account Selector');
        insert testAccount;

        // 테스트용 연락처 생성
        Contact testContact = new Contact(
            FirstName = 'Test',
            LastName = 'Contact Selector',
            AccountId = testAccount.Id
        );
        insert testContact;

        // 테스트용 기회 생성
        Opportunity testOpportunity = new Opportunity(
            Name = 'Test Opportunity Selector',
            AccountId = testAccount.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );
        insert testOpportunity;

        // 테스트용 이벤트 생성
        My_Event__c testEvent = new My_Event__c(
            Name = 'Test Event Selector',
            Title__c = 'Test Event Selector',
            Start_Date__c = Date.today(),
            End_Date__c = Date.today(),
            Description__c = 'Test Description Selector',
            Location__c = 'Test Location Selector',
            Related_Record_Type__c = 'Account',
            Related_Record_Id__c = testAccount.Id
        );
        insert testEvent;

        // 테스트용 비용 상세 생성
        Cost_Detail__c testCost = new Cost_Detail__c(
            My_Event__c = testEvent.Id,
            Cost_Type__c = '교통비',
            Amount__c = 75000,
            department__c = '영업팀'
        );
        insert testCost;
    }

    @isTest
    static void testSelectEventsByDateRange() {
        Date startDate = Date.today().addDays(-1);
        Date endDate = Date.today().addDays(1);

        Test.startTest();
        List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(startDate, endDate);
        Test.stopTest();

        System.assertEquals(1, events.size(), 'Should return 1 event');
        System.assertEquals('Test Event Selector', events[0].Title__c, 'Event title should match');
    }

    @isTest
    static void testSelectEventDetailsById() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];

        Test.startTest();
        My_Event__c eventDetails = CalendarEventSelector.selectEventDetailsById(testEvent.Id);
        Test.stopTest();

        System.assertNotEquals(null, eventDetails, 'Event details should not be null');
        System.assertEquals('Test Event Selector', eventDetails.Title__c, 'Event title should match');
        System.assertEquals(1, eventDetails.Cost_Details1__r.size(), 'Should have 1 cost detail');
    }

    @isTest
    static void testSelectMonthlyCostSummary() {
        Date startDate = Date.today();
        Date endDate = Date.today().addDays(30);

        Test.startTest();
        Map<String, Decimal> summary = CalendarEventSelector.selectMonthlyCostSummary(startDate, endDate);
        Test.stopTest();

        System.assertNotEquals(null, summary, 'Summary should not be null');
        System.assertEquals(75000, summary.get('교통비'), 'Transportation cost should be 75000');
    }

    @isTest
    static void testSelectAccounts() {
        Test.startTest();
        List<Account> accounts = CalendarEventSelector.selectAccounts();
        Test.stopTest();

        System.assertEquals(1, accounts.size(), 'Should return 1 account');
        System.assertEquals('Test Account Selector', accounts[0].Name, 'Account name should match');
    }

    @isTest
    static void testSelectContacts() {
        Test.startTest();
        List<Contact> contacts = CalendarEventSelector.selectContacts();
        Test.stopTest();

        System.assertEquals(1, contacts.size(), 'Should return 1 contact');
        System.assertEquals('Test Contact Selector', contacts[0].Name, 'Contact name should match');
    }

    @isTest
    static void testSelectOpportunities() {
        Test.startTest();
        List<Opportunity> opportunities = CalendarEventSelector.selectOpportunities();
        Test.stopTest();

        System.assertEquals(1, opportunities.size(), 'Should return 1 opportunity');
        System.assertEquals('Test Opportunity Selector', opportunities[0].Name, 'Opportunity name should match');
    }

    @isTest
    static void testSelectDepartmentOptions() {
        Test.startTest();
        List<Map<String, String>> deptOptions = CalendarEventSelector.selectDepartmentOptions();
        Test.stopTest();

        System.assertNotEquals(null, deptOptions, 'Department options should not be null');
        System.assert(deptOptions.size() > 0, 'Should have at least one department option');
    }

    @isTest
    static void testSelectCostTypeOptions() {
        Test.startTest();
        List<Map<String, String>> costOptions = CalendarEventSelector.selectCostTypeOptions();
        Test.stopTest();

        System.assertNotEquals(null, costOptions, 'Cost type options should not be null');
        System.assert(costOptions.size() > 0, 'Should have at least one cost type option');
    }

    @isTest
    static void testEmptyDateRange() {
        Date futureDate = Date.today().addDays(100);

        Test.startTest();
        List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(futureDate, futureDate.addDays(1));
        Test.stopTest();

        System.assertEquals(0, events.size(), 'Should return no events for future date range');
    }

    @isTest
    static void testCostSummaryEmptyRange() {
        Date futureDate = Date.today().addDays(100);

        Test.startTest();
        Map<String, Decimal> summary = CalendarEventSelector.selectMonthlyCostSummary(futureDate, futureDate.addDays(30));
        Test.stopTest();

        System.assertNotEquals(null, summary, 'Summary should not be null');
        // 모든 비용 유형이 0으로 초기화되어야 함
        for (Decimal amount : summary.values()) {
            System.assertEquals(0, amount, 'All cost amounts should be 0 for empty range');
        }
    }
}