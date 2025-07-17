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
        const { draggedEl, date } = event.detail;
        const { recordName, recordType, recordId, accountName } = draggedEl.dataset;

        if (!recordName) return;

        this.recordId = null;
        this.eventTitle = recordName;
        this.eventDepartment = this.departmentPicklistOptions.length > 0 ? this.departmentPicklistOptions[0].value : '';
        this.eventDescription = '';
        this.eventLocation = '';

        const startDate = date;
        const isoString = new Date(startDate.getTime() - (startDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        this.eventStartDate = isoString;
        this.eventEndDate = isoString;

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
    }

    // 이벤트 클릭 처리
    async handleEventClick(event) {
        this.recordId = event.detail.eventId;
        if (!this.recordId) return;

        try {
            const result = await getEventDetails({ eventId: this.recordId });
            const evt = result.event;

            this.eventTitle = evt.Title__c || '';
            this.eventStartDate = evt.Start_DateTime__c ? evt.Start_DateTime__c.slice(0, 16) : '';
            this.eventEndDate = evt.End_DateTime__c ? evt.End_DateTime__c.slice(0, 16) : '';
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
        this.refreshCostSummary();
    }

    // 이벤트 오류 처리
    handleEventError(event) {
        this.showToast('오류', event.detail.message, 'error');
    }
    
    // 날짜 변경 처리
    handleDatesSet(event) { 
        this.currentMonthForSummary = event.detail.start;
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
    
    // 이벤트 저장
    async saveEvent() {
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
            
            // 캘린더 업데이트 - 이벤트 새로고침으로 중복 방지
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                // 전체 이벤트 새로고침을 통해 중복 방지
                calendarView.refetchEvents();
            }
            
            this.showToast('성공', '이벤트가 저장되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
        } catch (error) {
            console.error('Error saving event:', error);
            this.showToast('저장 오류', error.body?.message || error.message, 'error');
        }
    }

    // 이벤트 삭제
    async handleDelete() {
        if (!this.recordId) return;
        
        try {
            await deleteEvent({ eventId: this.recordId });
            
            // 캘린더에서 이벤트 제거 후 전체 새로고침
            const calendarView = this.template.querySelector('c-calendar-view');
            if (calendarView) {
                calendarView.refetchEvents();
            }
            
            this.showToast('성공', '일정이 삭제되었습니다.', 'success');
            this.closeModal();
            this.refreshCostSummary();
        } catch (error) {
            console.error('Error deleting event:', error);
            this.showToast('삭제 오류', error.body?.message || error.message, 'error');
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