/**
 * @description       : 시간대 독립적 캘린더 컨테이너
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex 메소드 import
import saveEventAndCosts from '@salesforce/apex/CalendarAppController.saveEventAndCosts';
import getEventDetails from '@salesforce/apex/CalendarAppController.getEventDetails';
import deleteEvent from '@salesforce/apex/CalendarAppController.deleteEvent';
import getDepartmentOptions from '@salesforce/apex/CalendarAppController.getDepartmentOptions';
import getCostTypeOptions from '@salesforce/apex/CalendarAppController.getCostTypeOptions';
import getUserTimeZone from '@salesforce/apex/CalendarAppController.getUserTimeZone';
import getOrgTimeZone from '@salesforce/apex/CalendarAppController.getOrgTimeZone';

export default class CalendarContainer extends LightningElement {
    @track isModalOpen = false;
    @track modalTitle = '';
    @track currentMonthForSummary;

    // 모달 필드 변수
    @track recordId = null;
    @track eventTitle = '';
    @track eventStartDate = '';
    @track eventEndDate = '';
    @track eventDescription = '';
    @track eventLocation = '';
    @track eventDepartment = '';
    @track costItems = [];
    @track newEventData = { extendedProps: {} };
    
    @track departmentPicklistOptions = [];
    @track costTypePicklistOptions = [];
    
    // 시간대 정보
    userTimeZone = '';
    orgTimeZone = '';
    
    get isSalesforceObjectEvent() { 
        return this.newEventData?.extendedProps?.recordType !== 'Personal'; 
    }
    
    get isPersonalActivityEvent() { 
        return this.newEventData?.extendedProps?.recordType === 'Personal'; 
    }
    
    get displayAccountName() { 
        return this.newEventData?.extendedProps?.accountName || ''; 
    }
    
    get departmentOptions() { 
        return this.departmentPicklistOptions; 
    }
    
    get costTypeOptions() { 
        return this.costTypePicklistOptions; 
    }

    async connectedCallback() {
        const today = new Date();
        this.currentMonthForSummary = today.toISOString();
        
        await this.loadTimeZoneInfo();
        await this.loadPicklistOptions();
    }

    // 시간대 정보 로드
    async loadTimeZoneInfo() {
        try {
            const [userTz, orgTz] = await Promise.all([
                getUserTimeZone(),
                getOrgTimeZone()
            ]);
            
            this.userTimeZone = userTz;
            this.orgTimeZone = orgTz;
            
            console.log('시간대 정보:', {
                user: this.userTimeZone,
                org: this.orgTimeZone,
                browser: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
            
        } catch (error) {
            console.error('시간대 정보 로드 오류:', error);
        }
    }

    async loadPicklistOptions() {
        try {
            const [departmentOptions, costTypeOptions] = await Promise.all([
                getDepartmentOptions(),
                getCostTypeOptions()
            ]);
            
            this.departmentPicklistOptions = departmentOptions;
            this.costTypePicklistOptions = costTypeOptions;
        } catch (error) {
            console.error('Error loading picklist options:', error);
            this.showToast('오류', '옵션을 불러오는 데 실패했습니다.', 'error');
        }
    }
    
    // 날짜를 서버로 전송할 형식으로 변환 (시간대 정보 무시하고 로컬 값 그대로)
    formatDateForServer(date) {
        if (!date) return '';
        
        let dateObj;
        if (typeof date === 'string') {
            dateObj = new Date(date);
        } else {
            dateObj = date;
        }
        
        // 로컬 날짜/시간 구성요소를 직접 사용 (타임존 변환 없음)
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    // 서버에서 받은 날짜를 로컬 표시용으로 변환
    formatDateForDisplay(serverDateTime) {
        if (!serverDateTime) return '';
        
        // 서버에서 받은 값을 Date 객체로 변환
        const serverDate = new Date(serverDateTime);
        
        // 로컬 시간으로 표시 (브라우저가 자동으로 타임존 변환 처리)
        return this.formatDateForServer(serverDate);
    }
    
    // 이벤트 드롭 처리 - 시간대 무관하게 처리
    handleEventDrop(event) {
        try {
            const { draggedEl, date } = event.detail;
            
            if (!draggedEl || !date) {
                throw new Error('드롭 이벤트 데이터가 유효하지 않습니다.');
            }
            
            const { recordName, recordType, recordId, accountName } = draggedEl.dataset;

            if (!recordName || !recordType) {
                throw new Error('드래그된 항목의 데이터가 유효하지 않습니다.');
            }

            this.recordId = null;
            this.eventTitle = recordName;
            this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            this.eventDescription = '';
            this.eventLocation = '';

            // 드롭된 날짜를 그대로 사용 (시간대 변환 없음)
            console.log('드롭 이벤트 처리:', {
                originalDate: date,
                dateComponents: {
                    year: date.getFullYear(),
                    month: date.getMonth() + 1,
                    date: date.getDate(),
                    hours: date.getHours(),
                    minutes: date.getMinutes()
                }
            });
            
            // 현재 시간을 기본값으로 설정
            const now = new Date();
            const dropDate = new Date(date);
            dropDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
            
            const formattedDateTime = this.formatDateForServer(dropDate);
            
            console.log('최종 포맷된 날짜:', formattedDateTime);
            
            this.eventStartDate = formattedDateTime;
            this.eventEndDate = formattedDateTime;

            this.newEventData = { 
                extendedProps: { 
                    recordType, 
                    relatedId: recordId, 
                    accountName: accountName || '' 
                } 
            };
            
            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
            
        } catch (error) {
            console.error('이벤트 드롭 처리 오류:', error);
            this.showToast('오류', error.message || '드래그 앤 드롭 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    // 이벤트 클릭 처리 - 서버 시간을 로컬 표시용으로 변환
    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            const result = await getEventDetails({ eventId: this.recordId });
            const evt = result.event;

            this.eventTitle = evt.Title__c || '';
            
            // 서버에서 받은 날짜를 로컬 표시용으로 변환
            this.eventStartDate = this.formatDateForDisplay(evt.Start_DateTime__c);
            this.eventEndDate = this.formatDateForDisplay(evt.End_DateTime__c);
            
            console.log('이벤트 클릭 - 날짜 변환:', {
                serverStart: evt.Start_DateTime__c,
                serverEnd: evt.End_DateTime__c,
                displayStart: this.eventStartDate,
                displayEnd: this.eventEndDate
            });
            
            this.eventDescription = evt.Description__c || '';
            this.eventLocation = evt.Location__c || '';
            
            // 부서 정보 설정
            if (result.costs && result.costs.length > 0 && result.costs[0].department__c) {
                this.eventDepartment = result.costs[0].department__c;
            } else {
                this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
            }
            
            // 관련 레코드 정보 설정
            this.newEventData = {
                extendedProps: {
                    recordType: evt.Related_Record_Type__c,
                    relatedId: evt.Related_Record_Id__c,
                    accountName: result.accountName || ''
                }
            };
            
            // 비용 아이템 설정
            this.costItems = result.costs && result.costs.length > 0 
                ? result.costs.map((c, i) => ({ 
                    id: i, 
                    type: c.Cost_Type__c, 
                    amount: c.Amount__c 
                }))
                : [{ id: 0, type: '', amount: null }];

            this.modalTitle = `이벤트 수정: ${evt.Title__c}`;
            this.openModal();
        } catch (error) {
            console.error('Error loading event details:', error);
            this.showToast('오류', '이벤트 정보를 불러오는 데 실패했습니다.', 'error');
        }
    }

    // 이벤트 이동 성공 처리
    handleEventMoved(event) {
        this.showToast('성공', event.detail.message, 'success');
        this.forceRefreshCalendar();
        this.refreshCostSummary();
    }

    // 이벤트 오류 처리
    handleEventError(event) {
        this.showToast('오류', event.detail.message, 'error');
    }
    
    // 날짜 변경 처리
    handleDatesSet(event) { 
        const startDate = new Date(event.detail.start);
        const endDate = new Date(event.detail.end);
        const viewMiddle = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
        
        console.log('DatesSet event:', {
            start: event.detail.start,
            end: event.detail.end,
            viewMiddle: viewMiddle.toISOString()
        });
        
        this.currentMonthForSummary = viewMiddle.toISOString();
        this.refreshCostSummary();
    }
    
    // 입력 필드 변경 처리
    handleInputChange(event) { 
        this[event.target.name] = event.target.value; 
    }

    // 비용 항목 변경 처리
    handleCostChange(event) {
        const itemId = parseInt(event.target.dataset.id, 10);
        const { name, value } = event.target;
        this.costItems = this.costItems.map(item => 
            item.id === itemId ? { ...item, [name]: value } : item
        );
    }
    
    // 비용 항목 추가
    addCostItem() { 
        this.costItems = [...this.costItems, { 
            id: this.costItems.length, 
            type: '', 
            amount: null 
        }]; 
    }
    
    // 캘린더 강제 새로고침 함수
    forceRefreshCalendar() {
        const calendarView = this.template.querySelector('c-calendar-view');
        if (calendarView) {
            console.log('캘린더 강제 새로고침 시작');
            
            // 즉시 새로고침
            calendarView.refetchEvents();
            
            // 200ms 후 추가 새로고침 (확실한 반영)
            setTimeout(() => {
                calendarView.refetchEvents();
                console.log('캘린더 추가 새로고침 완료');
            }, 200);
            
            // 500ms 후 마지막 새로고침 (안전장치)
            setTimeout(() => {
                calendarView.refetchEvents();
                console.log('캘린더 최종 새로고침 완료');
            }, 500);
        }
    }
    
    // 이벤트 저장 - 서버로 올바른 형식으로 전송
    async saveEvent() {
        // 기본 유효성 검사
        if (!this.eventTitle) {
            this.showToast('입력 오류', '제목은 필수 입력 항목입니다.', 'error');
            return;
        }

        if (!this.eventDepartment && this.isSalesforceObjectEvent) {
            this.showToast('입력 오류', '부서는 필수 선택 항목입니다.', 'error');
            return;
        }

        try {
            // 유효한 비용 항목만 필터링
            const validCostItems = this.costItems
                .filter(item => item.type && item.amount && Number(item.amount) > 0)
                .map(item => ({
                    type: String(item.type),
                    amount: Number(item.amount)
                }));

            const params = {
                recordId: this.recordId,
                title: this.eventTitle,
                startDate: this.eventStartDate,
                endDate: this.eventEndDate,
                description: this.eventDescription,
                location: this.eventLocation,
                department: this.eventDepartment,
                relatedId: this.newEventData?.extendedProps?.relatedId,
                recordType: this.newEventData?.extendedProps?.recordType,
                costDetailsJson: JSON.stringify(validCostItems)
            };
            
            console.log('저장할 이벤트 데이터:', params);
            console.log('시간대 정보:', {
                user: this.userTimeZone,
                org: this.orgTimeZone
            });
            
            const savedEventId = await saveEventAndCosts(params);
            
            // 성공 메시지
            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            
            // 모달 닫기
            this.closeModal();
            
            // 캘린더 강제 새로고침
            this.forceRefreshCalendar();
            
            // 비용 요약 새로고침
            this.refreshCostSummary();
            
            console.log('이벤트 저장 완료:', savedEventId);
            
        } catch (error) {
            console.error('이벤트 저장 오류:', error);
            const errorMessage = error.body?.message || error.message || '이벤트 저장 중 오류가 발생했습니다.';
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    // 이벤트 삭제 - 완전한 새로고침 보장
    async handleDelete() {
        if (!this.recordId) return;
        
        try {
            await deleteEvent({ eventId: this.recordId });
            
            // 성공 메시지
            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            
            // 모달 닫기
            this.closeModal();
            
            // 캘린더 강제 새로고침
            this.forceRefreshCalendar();
            
            // 비용 요약 새로고침
            this.refreshCostSummary();
            
            console.log('이벤트 삭제 완료:', this.recordId);
            
        } catch (error) {
            console.error('이벤트 삭제 오류:', error);
            const errorMessage = error.body?.message || error.message || '일정 삭제 중 오류가 발생했습니다.';
            this.showToast('삭제 오류', errorMessage, 'error');
        }
    }

    // 비용 요약 새로고침
    refreshCostSummary() {
        const costSummaryPanel = this.template.querySelector('c-cost-summary-panel');
        if (costSummaryPanel) {
            costSummaryPanel.updateMonth(this.currentMonthForSummary);
            costSummaryPanel.refreshSummary();
        }
    }

    // 모달 관련 함수들
    openModal() { 
        this.isModalOpen = true; 
    }

    closeModal() {
        this.isModalOpen = false;
        this.recordId = null;
        this.eventTitle = '';
        this.eventStartDate = '';
        this.eventEndDate = '';
        this.eventDescription = '';
        this.eventLocation = '';
        this.eventDepartment = '';
        this.costItems = [];
        this.newEventData = { extendedProps: {} };
    }
    
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}