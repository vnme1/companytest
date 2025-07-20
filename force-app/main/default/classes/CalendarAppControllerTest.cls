/**
 * @description       : Calendar App Controller Test Class (수정된 버전)
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-20
 */
@isTest
private class CalendarAppControllerTest {

    @TestSetup
    static void setupTestData() {
        // 테스트용 계정 생성
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;

        // 테스트용 연락처 생성
        Contact testContact = new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            AccountId = testAccount.Id
        );
        insert testContact;

        // 테스트용 기회 생성
        Opportunity testOpportunity = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30)
        );
        insert testOpportunity;

        // 테스트용 이벤트 생성
        My_Event__c testEvent = new My_Event__c(
            Name = 'Test Event',
            Title__c = 'Test Event',
            Start_Date__c = Date.today(),
            End_Date__c = Date.today(),
            Description__c = 'Test Description',
            Location__c = 'Test Location',
            Related_Record_Type__c = 'Account',
            Related_Record_Id__c = testAccount.Id
        );
        insert testEvent;

        // 테스트용 비용 상세 생성
        Cost_Detail__c testCost = new Cost_Detail__c(
            My_Event__c = testEvent.Id,
            Cost_Type__c = '교통비',
            Amount__c = 50000,
            department__c = '영업팀'
        );
        insert testCost;
    }

    @isTest
    static void testGetEvents() {
        Test.startTest();
        List<My_Event__c> events = CalendarAppController.getEvents(
            String.valueOf(Date.today()),
            String.valueOf(Date.today().addDays(7))
        );
        Test.stopTest();

        System.assertEquals(1, events.size(), 'Should return 1 event');
        System.assertEquals('Test Event', events[0].Title__c, 'Event title should match');
    }

    @isTest
    static void testGetEventDetails() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];

        Test.startTest();
        CalendarAppController.EventWrapper wrapper = CalendarAppController.getEventDetails(testEvent.Id);
        Test.stopTest();

        System.assertNotEquals(null, wrapper, 'Wrapper should not be null');
        System.assertEquals('Test Event', wrapper.event.Title__c, 'Event title should match');
        System.assertEquals(1, wrapper.costs.size(), 'Should have 1 cost detail');
    }

    @isTest
    static void testGetMonthlyCostSummary() {
        Test.startTest();
        Map<String, Decimal> summary = CalendarAppController.getMonthlyCostSummary(
            String.valueOf(Date.today()),
            String.valueOf(Date.today().addDays(30))
        );
        Test.stopTest();

        System.assertNotEquals(null, summary, 'Summary should not be null');
        System.assertEquals(50000, summary.get('교통비'), 'Transportation cost should be 50000');
    }

    @isTest
    static void testSaveEventAndCosts() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        String eventId = CalendarAppController.saveEventAndCosts(
            null, // recordId
            'New Test Event', // title
            String.valueOf(Date.today()), // startDate
            String.valueOf(Date.today()), // endDate
            'New test description', // description
            'New test location', // location
            '영업팀', // department
            testAccount.Id, // relatedId
            'Account', // recordType
            '[{"type":"교통비","amount":30000}]' // costDetailsJson
        );
        Test.stopTest();

        System.assertNotEquals(null, eventId, 'Event ID should not be null');
        
        My_Event__c savedEvent = [SELECT Title__c FROM My_Event__c WHERE Id = :eventId];
        System.assertEquals('New Test Event', savedEvent.Title__c, 'Event title should match');
        
        List<Cost_Detail__c> costs = [SELECT Amount__c FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        System.assertEquals(1, costs.size(), 'Should have 1 cost detail');
        System.assertEquals(30000, costs[0].Amount__c, 'Cost amount should be 30000');
    }

    @isTest
    static void testUpdateEventDates() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        Date newDate = Date.today().addDays(1);

        Test.startTest();
        String result = CalendarAppController.updateEventDates(
            testEvent.Id,
            String.valueOf(newDate),
            String.valueOf(newDate)
        );
        Test.stopTest();

        System.assertNotEquals(null, result, 'Result should not be null');
        
        My_Event__c updatedEvent = [SELECT Start_Date__c FROM My_Event__c WHERE Id = :testEvent.Id];
        System.assertEquals(newDate, updatedEvent.Start_Date__c, 'Start date should be updated');
    }

    @isTest
    static void testDeleteEvent() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];

        Test.startTest();
        String result = CalendarAppController.deleteEvent(testEvent.Id);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Result should not be null');
        
        List<My_Event__c> events = [SELECT Id FROM My_Event__c WHERE Id = :testEvent.Id];
        System.assertEquals(0, events.size(), 'Event should be deleted');
        
        List<Cost_Detail__c> costs = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :testEvent.Id];
        System.assertEquals(0, costs.size(), 'Cost details should be deleted');
    }

    @isTest
    static void testGetAccountList() {
        Test.startTest();
        List<Account> accounts = CalendarAppController.getAccountList();
        Test.stopTest();

        System.assertEquals(1, accounts.size(), 'Should return 1 account');
        System.assertEquals('Test Account', accounts[0].Name, 'Account name should match');
    }

    @isTest
    static void testGetContactList() {
        Test.startTest();
        List<Contact> contacts = CalendarAppController.getContactList();
        Test.stopTest();

        System.assertEquals(1, contacts.size(), 'Should return 1 contact');
        System.assertEquals('Test Contact', contacts[0].Name, 'Contact name should match');
    }

    @isTest
    static void testGetOpportunityList() {
        Test.startTest();
        List<Opportunity> opportunities = CalendarAppController.getOpportunityList();
        Test.stopTest();

        System.assertEquals(1, opportunities.size(), 'Should return 1 opportunity');
        System.assertEquals('Test Opportunity', opportunities[0].Name, 'Opportunity name should match');
    }

    @isTest
    static void testGetPicklistOptions() {
        Test.startTest();
        List<Map<String, String>> deptOptions = CalendarAppController.getDepartmentOptions();
        List<Map<String, String>> costOptions = CalendarAppController.getCostTypeOptions();
        Test.stopTest();

        System.assertNotEquals(null, deptOptions, 'Department options should not be null');
        System.assertNotEquals(null, costOptions, 'Cost type options should not be null');
    }

    @isTest
    static void testErrorHandling() {
        Test.startTest();
        try {
            CalendarAppController.getEventDetails(null);
            System.assert(false, 'Exception should be thrown');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Invalid'), 'Should contain invalid message');
        }
        Test.stopTest();
    }

    @isTest
    static void testPersonalActivitySave() {
        Test.startTest();
        String eventId = CalendarAppController.saveEventAndCosts(
            null, // recordId
            '휴가', // title
            String.valueOf(Date.today()), // startDate
            String.valueOf(Date.today()), // endDate
            '개인 휴가', // description
            '', // location
            '', // department
            '', // relatedId
            'Personal', // recordType
            '' // costDetailsJson
        );
        Test.stopTest();

        System.assertNotEquals(null, eventId, 'Event ID should not be null');
        
        My_Event__c savedEvent = [SELECT Title__c, Related_Record_Type__c FROM My_Event__c WHERE Id = :eventId];
        System.assertEquals('휴가', savedEvent.Title__c, 'Event title should match');
        System.assertEquals('Personal', savedEvent.Related_Record_Type__c, 'Record type should be Personal');
    }
}