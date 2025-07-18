/**
 * @description       : 캘린더 컨테이너 메인 컴포넌트
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

    connectedCallback() {
        const today = new Date();
        this.currentMonthForSummary = today.toISOString();
        this.loadPicklistOptions();
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
    
    // 이벤트 드롭 처리
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

            // 👇 복잡한 변환 로직을 모두 제거하고, 받은 date 객체를 바로 GMT 표준 시간으로 변환.
            this.eventStartDate = date.toISOString();
            this.eventEndDate = date.toISOString();

            this.newEventData = { extendedProps: { recordType, relatedId: recordId, accountName: accountName || '' } };
            this.costItems = [{ id: 0, type: '', amount: null }];
            this.modalTitle = `새 ${recordType === 'Personal' ? '활동' : '이벤트'}: ${recordName}`;
            this.openModal();
            
        } catch (error) {
            console.error('이벤트 드롭 처리 오류:', error);
            this.showToast('오류', error.message || '드래그 앤 드롭 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    // 이벤트 클릭 처리
    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            const result = await getEventDetails({ eventId: this.recordId });
            const evt = result.event;

            this.eventTitle = evt.Title__c || '';
            this.eventStartDate = evt.Start_Date__c;
            this.eventEndDate = evt.End_Date__c;
            this.eventDescription = evt.Description__c || '';
            this.eventLocation = evt.Location__c || '';

            console.log('Value passed to modal:', this.eventStartDate);
            
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
        this.refreshCostSummary();
    }

    // 이벤트 오류 처리
    handleEventError(event) {
        this.showToast('오류', event.detail.message, 'error');
    }
    
    // 날짜 변경 처리
    handleDatesSet(event) { 
        // 캘린더에서 표시하는 월의 중간 날짜를 가져와서 해당 월로 설정
        const startDate = new Date(event.detail.start);
        const endDate = new Date(event.detail.end);
        
        // 캘린더 뷰의 중간 날짜 계산 (월 중간 정도)
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
    
    // 이벤트 저장 - 핵심 로직에만 예외 처리 추가
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
            
            const savedEventId = await saveEventAndCosts(params);
            
            // 캘린더 업데이트
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                if (this.recordId) {
                    calendarView.updateEvent(this.recordId, {
                        title: this.eventTitle,
                        start: this.eventStartDate,
                        end: this.eventEndDate
                    });
                } else {
                    calendarView.addEvent({
                        id: savedEventId,
                        title: this.eventTitle,
                        start: this.eventStartDate,
                        end: this.eventEndDate,
                        allDay: false
                    });
                }
            }
            
            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
            
        } catch (error) {
            console.error('이벤트 저장 오류:', error);
            const errorMessage = error.body?.message || error.message || '이벤트 저장 중 오류가 발생했습니다.';
            this.showToast('저장 오류', errorMessage, 'error');
        }
    }

    // 이벤트 삭제 - 핵심 로직에만 예외 처리 추가
    async handleDelete() {
        if (!this.recordId) return;
        
        try {
            await deleteEvent({ eventId: this.recordId });
            
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                calendarView.removeEvent(this.recordId);
            }
            
            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
            
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