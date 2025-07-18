/**
 * @description       : Calendar App Controller with timezone-aware date handling
 * @author            : sejin.park@dkbmc.com
 * @last modified on  : 2025-07-18
 * @last modified by  : sejin.park@dkbmc.com
**/
public with sharing class CalendarAppController {
    public class EventWrapper {
        @AuraEnabled public My_Event__c event;
        @AuraEnabled public List<Cost_Detail__c> costs;
        @AuraEnabled public String accountName;
    }

    // --- 데이터 조회(Read)는 Selector 클래스에 위임 ---

    @AuraEnabled(cacheable=true)
    public static List<My_Event__c> getEvents(String startStr, String endStr) {
        System.debug('getEvents 호출됨 - Start: ' + startStr + ', End: ' + endStr);
        
        List<My_Event__c> events = CalendarEventSelector.selectEventsByDateRange(
            (Datetime)JSON.deserialize('"' + startStr + '"', Datetime.class),
            (Datetime)JSON.deserialize('"' + endStr + '"', Datetime.class)
        );
        
        System.debug('조회된 이벤트 수: ' + events.size());
        return events;
    }

    @AuraEnabled(cacheable=true)
    public static EventWrapper getEventDetails(Id eventId) {
        System.debug('getEventDetails 호출됨 - EventId: ' + eventId);
        
        EventWrapper wrapper = new EventWrapper();
        wrapper.event = CalendarEventSelector.selectEventDetailsById(eventId);
        wrapper.costs = wrapper.event.Cost_Details1__r;

        if (wrapper.event != null && wrapper.event.Related_Record_Type__c == 'Account') {
            List<Account> accs = [SELECT Name FROM Account WHERE Id = :wrapper.event.Related_Record_Id__c LIMIT 1];
            if (!accs.isEmpty()) {
                wrapper.accountName = accs[0].Name;
            }
        }
        
        System.debug('이벤트 상세 정보: ' + wrapper.event.Title__c + 
                    ', Start: ' + wrapper.event.Start_DateTime__c + 
                    ', End: ' + wrapper.event.End_DateTime__c);
        
        return wrapper;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, Decimal> getMonthlyCostSummary(String startDate, String endDate) {
        return CalendarEventSelector.selectMonthlyCostSummary(
            (Datetime)JSON.deserialize('"' + startDate + '"', Datetime.class),
            (Datetime)JSON.deserialize('"' + endDate + '"', Datetime.class)
        );
    }

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

    // 현재 사용자의 시간대 정보를 가져오는 메서드
    @AuraEnabled(cacheable=true)
    public static String getUserTimeZone() {
        User currentUser = [SELECT TimeZoneSidKey FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        System.debug('사용자 시간대: ' + currentUser.TimeZoneSidKey);
        return currentUser.TimeZoneSidKey;
    }

    // 조직의 시간대 정보를 가져오는 메서드  
    @AuraEnabled(cacheable=true)
    public static String getOrgTimeZone() {
        Organization org = [SELECT TimeZoneSidKey FROM Organization LIMIT 1];
        System.debug('조직 시간대: ' + org.TimeZoneSidKey);
        return org.TimeZoneSidKey;
    }

    // 클라이언트에서 받은 로컬 시간 문자열을 정확하게 처리
    private static Datetime parseClientDateTime(String clientDateTimeStr) {
        if (String.isBlank(clientDateTimeStr)) {
            return null;
        }
        
        try {
            // YYYY-MM-DDTHH:MM 형식의 문자열을 파싱
            String formattedStr = clientDateTimeStr.contains('T') ? 
                clientDateTimeStr + ':00' : clientDateTimeStr + 'T00:00:00';
            
            // GMT Datetime으로 직접 파싱 (클라이언트에서 이미 적절히 변환된 값이라고 가정)
            Datetime result = Datetime.valueOfGmt(formattedStr.replace('T', ' '));
            
            System.debug('날짜 파싱: ' + clientDateTimeStr + ' → ' + result);
            
            return result;
            
        } catch (Exception e) {
            System.debug('날짜 파싱 오류: ' + e.getMessage() + ', 입력값: ' + clientDateTimeStr);
            return Datetime.now();
        }
    }

    @AuraEnabled
    public static String saveEventAndCosts(
        Id recordId, String title, String startDate, String endDate,
        String description, String location, String department,
        String relatedId, String recordType, String costDetailsJson
    ) {
        System.debug('saveEventAndCosts 호출됨');
        System.debug('Parameters: recordId=' + recordId + ', title=' + title + 
                    ', startDate=' + startDate + ', endDate=' + endDate + 
                    ', recordType=' + recordType);
        
        // 디버깅을 위해 시간대 정보도 출력
        System.debug('사용자 시간대: ' + getUserTimeZone());
        System.debug('조직 시간대: ' + getOrgTimeZone());
        
        try {
            // 필수 값 검증
            if (String.isBlank(title)) {
                throw new AuraHandledException('제목은 필수 입력 항목입니다.');
            }

            My_Event__c eventToSave;

            if (recordId == null) {
                eventToSave = new My_Event__c();
                System.debug('새 이벤트 생성');
            } else {
                List<My_Event__c> events = [SELECT Id FROM My_Event__c WHERE Id = :recordId LIMIT 1];
                if (events.isEmpty()) {
                    throw new AuraHandledException('수정할 이벤트를 찾을 수 없습니다.');
                }
                eventToSave = events[0];
                System.debug('기존 이벤트 수정: ' + recordId);
            }

            eventToSave.Name = title;
            eventToSave.Title__c = title;
            eventToSave.Description__c = description;
            eventToSave.Location__c = location;
            eventToSave.Related_Record_Id__c = relatedId;
            eventToSave.Related_Record_Type__c = recordType;

            // 날짜 처리 - 클라이언트에서 전송된 값을 그대로 사용
            if (String.isNotBlank(startDate)) {
                eventToSave.Start_DateTime__c = parseClientDateTime(startDate);
            }
            
            if (String.isNotBlank(endDate)) {
                eventToSave.End_DateTime__c = parseClientDateTime(endDate);
            }

            upsert eventToSave;
            Id eventId = eventToSave.Id;
            
            System.debug('이벤트 저장 완료: ' + eventId + 
                        ', Start: ' + eventToSave.Start_DateTime__c + 
                        ', End: ' + eventToSave.End_DateTime__c);

            // 기존 비용 삭제
            List<Cost_Detail__c> oldCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!oldCosts.isEmpty()) {
                delete oldCosts;
                System.debug('기존 비용 ' + oldCosts.size() + '개 삭제됨');
            }

            // 새 비용 데이터 처리
            List<Cost_Detail__c> costsToInsert = new List<Cost_Detail__c>();
            
            if (String.isNotBlank(costDetailsJson) && recordType != 'Personal') {
                try {
                    List<Object> parsedCosts = (List<Object>)JSON.deserializeUntyped(costDetailsJson);
                    System.debug('비용 데이터 파싱: ' + parsedCosts.size() + '개 항목');
                    
                    for (Object costObj : parsedCosts) {
                        Map<String, Object> costMap = (Map<String, Object>)costObj;
                        
                        String costType = String.valueOf(costMap.get('type'));
                        Object amountObj = costMap.get('amount');
                        
                        if (String.isBlank(costType) || amountObj == null) {
                            continue;
                        }
                        
                        Decimal amount;
                        try {
                            amount = Decimal.valueOf(String.valueOf(amountObj));
                            if (amount <= 0) {
                                continue;
                            }
                        } catch (Exception e) {
                            continue;
                        }

                        String deptValue = String.isNotBlank(department) ? department : '개발부';
                        
                        Cost_Detail__c newCost = new Cost_Detail__c(
                            My_Event__c = eventId,
                            Cost_Type__c = costType,
                            Amount__c = amount,
                            department__c = deptValue
                        );
                        costsToInsert.add(newCost);
                    }
                } catch (Exception jsonEx) {
                    System.debug('비용 데이터 JSON 파싱 오류: ' + jsonEx.getMessage());
                    throw new AuraHandledException('비용 데이터 형식이 올바르지 않습니다.');
                }
            }
            
            if (!costsToInsert.isEmpty()) {
                insert costsToInsert;
                System.debug('새 비용 ' + costsToInsert.size() + '개 저장됨');
            }
            
            System.debug('saveEventAndCosts 완료: ' + eventId);
            return eventId;

        } catch (Exception e) {
            String errorMessage = e.getMessage();
            System.debug('saveEventAndCosts 오류: ' + errorMessage);
            System.debug('Stack Trace: ' + e.getStackTraceString());
            
            if (e instanceof AuraHandledException) {
                throw e;
            } else {
                throw new AuraHandledException('이벤트 저장 중 오류가 발생했습니다: ' + errorMessage);
            }
        }
    }
    
    @AuraEnabled
    public static String updateEventDates(Id eventId, String newStartDate, String newEndDate) {
        System.debug('updateEventDates 호출됨: ' + eventId + 
                    ', newStart: ' + newStartDate + ', newEnd: ' + newEndDate);
        
        try {
            My_Event__c eventToUpdate = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            
            // 날짜 처리 - 클라이언트에서 전송된 값을 그대로 사용
            if (String.isNotBlank(newStartDate)) {
                eventToUpdate.Start_DateTime__c = parseClientDateTime(newStartDate);
            }
            
            if (String.isNotBlank(newEndDate)) {
                eventToUpdate.End_DateTime__c = parseClientDateTime(newEndDate);
            }
            
            update eventToUpdate;
            
            System.debug('이벤트 날짜 업데이트 완료: ' + eventId + 
                        ', Start: ' + eventToUpdate.Start_DateTime__c + 
                        ', End: ' + eventToUpdate.End_DateTime__c);
            
            return 'SUCCESS';
            
        } catch (Exception e) {
            System.debug('updateEventDates 오류: ' + e.getMessage());
            throw new AuraHandledException('일정 날짜 업데이트 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String deleteEvent(Id eventId) {
        System.debug('deleteEvent 호출됨: ' + eventId);
        
        try {
            // 먼저 관련된 비용 상세 삭제
            List<Cost_Detail__c> relatedCosts = [SELECT Id FROM Cost_Detail__c WHERE My_Event__c = :eventId];
            if (!relatedCosts.isEmpty()) {
                delete relatedCosts;
                System.debug('관련 비용 ' + relatedCosts.size() + '개 삭제됨');
            }
            
            // 이벤트 삭제
            My_Event__c eventToDelete = [SELECT Id FROM My_Event__c WHERE Id = :eventId LIMIT 1];
            delete eventToDelete;
            
            System.debug('이벤트 삭제 완료: ' + eventId);
            
            return 'SUCCESS';
            
        } catch (Exception e) {
            System.debug('deleteEvent 오류: ' + e.getMessage());
            throw new AuraHandledException('일정 삭제 중 오류가 발생했습니다: ' + e.getMessage());
        }
    }
}