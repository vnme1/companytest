/**
 * @description       : Calendar App Controller Test Class - JSON 방식으로 수정
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
@isTest
@SuppressWarnings('PMD.MethodNamingConventions')
public class CalendarAppControllerTest {
    
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
            Cost_Type__c = 'Transportation',
            Amount__c = 10000,
            department__c = 'Development'
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
    static void testGetEvents() {
        Test.startTest();
        String startDate = String.valueOf(Date.today().addDays(-7));
        String endDate = String.valueOf(Date.today().addDays(7));
        
        List<My_Event__c> events = CalendarAppController.getEvents(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, events, '이벤트 목록이 null이면 안됩니다');
        System.assertEquals(1, events.size(), '테스트 이벤트 1개가 조회되어야 합니다');
    }
    
    @isTest
    static void testGetEventDetails() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        
        Test.startTest();
        CalendarAppController.EventWrapper result = CalendarAppController.getEventDetails(testEvent.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, '이벤트 상세 정보가 null이면 안됩니다');
        System.assertNotEquals(null, result.event, '이벤트 객체가 null이면 안됩니다');
        System.assertEquals('Test Event', result.event.Title__c, '이벤트 제목이 일치해야 합니다');
        System.assertEquals(1, result.costs.size(), '비용 상세 1개가 조회되어야 합니다');
    }
    
    @isTest
    static void testGetMonthlyCostSummary() {
        Test.startTest();
        String startDate = String.valueOf(Date.today().toStartOfMonth());
        String endDate = String.valueOf(Date.today().addMonths(1).toStartOfMonth().addDays(-1));
        
        Map<String, Decimal> summary = CalendarAppController.getMonthlyCostSummary(startDate, endDate);
        Test.stopTest();
        
        System.assertNotEquals(null, summary, '비용 요약이 null이면 안됩니다');
        System.assertEquals(10000, summary.get('Transportation'), '교통비 합계가 일치해야 합니다');
    }
    
    @isTest
    static void testSaveEventAndCosts_Create_JsonMethod() {
        Test.startTest();
        
        // 이벤트 데이터 JSON 구성
        Map<String, Object> eventData = new Map<String, Object>{
            'recordId' => null,
            'title' => 'New Test Event',
            'startDate' => String.valueOf(Date.today()),
            'endDate' => String.valueOf(Date.today()),
            'description' => 'Test Description',
            'location' => 'Test Location',
            'department' => 'Development',
            'relatedId' => null,
            'recordType' => 'Account'
        };
        
        String costJson = '[{"type":"Transportation","amount":15000}]';
        
        String eventId = CalendarAppController.saveEventAndCosts(
            JSON.serialize(eventData),
            costJson
        );
        Test.stopTest();
        
        System.assertNotEquals(null, eventId, '이벤트 ID가 반환되어야 합니다');
        
        My_Event__c savedEvent = [SELECT Id, Title__c FROM My_Event__c WHERE Id = :eventId];
        System.assertEquals('New Test Event', savedEvent.Title__c, '이벤트 제목이 일치해야 합니다');
        
        List<Cost_Detail__c> costs = [SELECT Amount__c FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        System.assertEquals(1, costs.size(), '비용 상세 1개가 생성되어야 합니다');
        System.assertEquals(15000, costs[0].Amount__c, '비용 금액이 일치해야 합니다');
    }
    
    @isTest
    static void testSaveEventAndCosts_Update_JsonMethod() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        
        Test.startTest();
        
        // 이벤트 데이터 JSON 구성
        Map<String, Object> eventData = new Map<String, Object>{
            'recordId' => testEvent.Id,
            'title' => 'Updated Event',
            'startDate' => String.valueOf(Date.today()),
            'endDate' => String.valueOf(Date.today()),
            'description' => 'Updated Description',
            'location' => 'Updated Location',
            'department' => 'Development',
            'relatedId' => null,
            'recordType' => 'Account'
        };
        
        String costJson = '[{"type":"식대","amount":20000}]';
        
        String eventId = CalendarAppController.saveEventAndCosts(
            JSON.serialize(eventData),
            costJson
        );
        Test.stopTest();
        
        My_Event__c updatedEvent = [SELECT Title__c FROM My_Event__c WHERE Id = :testEvent.Id];
        System.assertEquals('Updated Event', updatedEvent.Title__c, '이벤트 제목이 업데이트되어야 합니다');
    }
    
    @isTest
    static void testSaveEventAndCosts_Personal_JsonMethod() {
        Test.startTest();
        
        // 개인 활동 이벤트 데이터 JSON 구성
        Map<String, Object> eventData = new Map<String, Object>{
            'recordId' => null,
            'title' => '휴가',
            'startDate' => String.valueOf(Date.today()),
            'endDate' => String.valueOf(Date.today()),
            'description' => '개인 휴가',
            'location' => null,
            'department' => null,
            'relatedId' => null,
            'recordType' => 'Personal'
        };
        
        String eventId = CalendarAppController.saveEventAndCosts(
            JSON.serialize(eventData),
            null
        );
        Test.stopTest();
        
        System.assertNotEquals(null, eventId, '개인 활동 이벤트 ID가 반환되어야 합니다');
        
        My_Event__c savedEvent = [SELECT Title__c, Related_Record_Type__c FROM My_Event__c WHERE Id = :eventId];
        System.assertEquals('휴가', savedEvent.Title__c, '개인 활동 제목이 일치해야 합니다');
        System.assertEquals('Personal', savedEvent.Related_Record_Type__c, '레코드 타입이 Personal이어야 합니다');
    }
    
    @isTest
    static void testUpdateEventDates() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        Date newStartDate = Date.today().addDays(1);
        Date newEndDate = Date.today().addDays(2);
        
        Test.startTest();
        CalendarAppController.updateEventDates(
            testEvent.Id, 
            String.valueOf(newStartDate), 
            String.valueOf(newEndDate)
        );
        Test.stopTest();
        
        My_Event__c updatedEvent = [SELECT Start_Date__c, End_Date__c FROM My_Event__c WHERE Id = :testEvent.Id];
        System.assertEquals(newStartDate, updatedEvent.Start_Date__c, '시작일이 업데이트되어야 합니다');
        System.assertEquals(newEndDate, updatedEvent.End_Date__c, '종료일이 업데이트되어야 합니다');
    }
    
    @isTest
    static void testDeleteEvent() {
        My_Event__c testEvent = [SELECT Id FROM My_Event__c LIMIT 1];
        Id eventId = testEvent.Id;
        
        Test.startTest();
        CalendarAppController.deleteEvent(eventId);
        Test.stopTest();
        
        List<My_Event__c> deletedEvents = [SELECT Id FROM My_Event__c WHERE Id = :eventId];
        System.assertEquals(0, deletedEvents.size(), '이벤트가 삭제되어야 합니다');
        
        List<Cost_Detail__c> deletedCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
        System.assertEquals(0, deletedCosts.size(), '관련 비용도 삭제되어야 합니다');
    }
    
    @isTest
    static void testGetAccountList() {
        Test.startTest();
        List<Account> accounts = CalendarAppController.getAccountList();
        Test.stopTest();
        
        System.assertNotEquals(null, accounts, 'Account 목록이 null이면 안됩니다');
        System.assertEquals(1, accounts.size(), 'Test Account가 조회되어야 합니다');
    }
    
    @isTest
    static void testGetContactList() {
        Test.startTest();
        List<Contact> contacts = CalendarAppController.getContactList();
        Test.stopTest();
        
        System.assertNotEquals(null, contacts, 'Contact 목록이 null이면 안됩니다');
        System.assertEquals(1, contacts.size(), 'Test Contact가 조회되어야 합니다');
    }
    
    @isTest
    static void testGetOpportunityList() {
        Test.startTest();
        List<Opportunity> opportunities = CalendarAppController.getOpportunityList();
        Test.stopTest();
        
        System.assertNotEquals(null, opportunities, 'Opportunity 목록이 null이면 안됩니다');
        System.assertEquals(1, opportunities.size(), 'Test Opportunity가 조회되어야 합니다');
    }
    
    @isTest
    static void testGetDepartmentOptions() {
        Test.startTest();
        List<Map<String, String>> options = CalendarAppController.getDepartmentOptions();
        Test.stopTest();
        
        System.assertNotEquals(null, options, '부서 옵션이 null이면 안됩니다');
        System.assert(options.size() > 0, '부서 옵션이 존재해야 합니다');
    }
    
    @isTest
    static void testGetCostTypeOptions() {
        Test.startTest();
        List<Map<String, String>> options = CalendarAppController.getCostTypeOptions();
        Test.stopTest();
        
        System.assertNotEquals(null, options, '비용 유형 옵션이 null이면 안됩니다');
        System.assert(options.size() > 0, '비용 유형 옵션이 존재해야 합니다');
    }
    
    // === JSON 방식 에러 처리 테스트 ===
    
    @isTest
    static void testHandleError_InvalidEventId() {
        Test.startTest();
        try {
            CalendarAppController.getEventDetails(null);
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e.getMessage(), '에러 메시지가 있어야 합니다');
            System.assert(e.getMessage().length() > 0, '에러 메시지가 비어있으면 안됩니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_InvalidDateRange() {
        Test.startTest();
        try {
            CalendarAppController.getEvents(null, null);
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e, '예외가 발생해야 합니다');
            System.assertNotEquals(null, e.getMessage(), '에러 메시지가 있어야 합니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_InvalidEventData() {
        Test.startTest();
        try {
            CalendarAppController.saveEventAndCosts('invalid-json', '[]');
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e.getMessage(), '에러 메시지가 있어야 합니다');
            System.assert(e.getMessage().contains('데이터 형식'), 'JSON 파싱 오류 메시지가 포함되어야 합니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_EmptyEventData() {
        Test.startTest();
        try {
            CalendarAppController.saveEventAndCosts('', '[]');
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e, '빈 이벤트 데이터에 대해 예외가 발생해야 합니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_InvalidTitle() {
        Test.startTest();
        try {
            Map<String, Object> eventData = new Map<String, Object>{
                'recordId' => null,
                'title' => '',  // 빈 제목
                'startDate' => String.valueOf(Date.today()),
                'endDate' => String.valueOf(Date.today()),
                'description' => '',
                'location' => '',
                'department' => 'Development',
                'relatedId' => null,
                'recordType' => 'Account'
            };
            
            CalendarAppController.saveEventAndCosts(JSON.serialize(eventData), '[]');
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e, '예외가 발생해야 합니다');
            System.assertNotEquals(null, e.getMessage(), '에러 메시지가 있어야 합니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_EmptyDateRange() {
        Test.startTest();
        try {
            CalendarAppController.getEvents('', '');
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e, '빈 문자열에 대해 예외가 발생해야 합니다');
        }
        Test.stopTest();
    }

    @isTest
    static void testHandleError_InvalidDateFormat() {
        Test.startTest();
        try {
            CalendarAppController.getEvents('invalid-date', 'invalid-date');
            System.assert(false, '예외가 발생해야 합니다');
        } catch (Exception e) {
            System.assertNotEquals(null, e, '잘못된 날짜 형식에 대해 예외가 발생해야 합니다');
        }
        Test.stopTest();
    }

    // 정상 케이스 테스트
    @isTest
    static void testValidInputs() {
        Test.startTest();
        
        String todayStr = String.valueOf(Date.today());
        String tomorrowStr = String.valueOf(Date.today().addDays(1));
        
        // 정상적인 이벤트 조회
        List<My_Event__c> events = CalendarAppController.getEvents(todayStr, tomorrowStr);
        System.assertNotEquals(null, events, '정상적인 날짜 범위로 이벤트 조회가 가능해야 합니다');
        
        // 정상적인 개인 활동 저장 (JSON 방식)
        Map<String, Object> eventData = new Map<String, Object>{
            'recordId' => null,
            'title' => '정상 테스트',
            'startDate' => todayStr,
            'endDate' => tomorrowStr,
            'description' => '테스트 설명',
            'location' => null,
            'department' => null,
            'relatedId' => null,
            'recordType' => 'Personal'
        };
        
        String eventId = CalendarAppController.saveEventAndCosts(JSON.serialize(eventData), null);
        System.assertNotEquals(null, eventId, '정상적인 개인 활동 저장이 가능해야 합니다');
        
        Test.stopTest();
    }
}